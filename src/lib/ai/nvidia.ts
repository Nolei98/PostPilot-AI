// ============================================================
// Transporte da NVIDIA NIM (integrate.api.nvidia.com) — quarta opção de
// provider de TEXTO, ao lado de Claude, Gemini e Pollinations.
//
// Por que entrou: o free tier do Gemini são 20 requisições por DIA
// (`generate_content_free_tier_requests`), o que não cobre nem uma
// varredura completa — foi o teto que travou os testes de 30/07. A NIM
// dá créditos grátis num volume muito maior e serve modelos abertos
// (Llama, Qwen, DeepSeek, Nemotron).
//
// A API é COMPATÍVEL COM A DA OPENAI, então não entra SDK novo no
// projeto: é `fetch` no /v1/chat/completions, igual ao que
// pollinationsGenerate já faz. Menos dependência, menos lockfile.
//
// 🧪 Medido em 30/07 contra a API real, com o PROMPT DE VERDADE (system
// longo + 1200 tokens de saída) — e não com "responda OK":
//   deepseek-ai/deepseek-v4-flash       34s  ← padrão (melhor texto)
//   meta/llama-3.1-8b-instruct          14s  ← rede de segurança
//   nvidia/llama-3.3-nemotron-super-49b estourou 45s
//   meta/llama-3.1-70b-instruct         estourou 45s
//
// ⚠️ A lição: com prompt curto o 70B respondia em 1,8s, e isso enganou.
// No tier grátis o que decide não é o tamanho do modelo, é a FILA — e a
// fila só aparece com carga real. Por isso existe o fallback: se o
// modelo bom estiver enfileirado, cai no rápido em vez de derrubar a
// geração inteira e deixar o post sem nascer.
// ============================================================

const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-ai/deepseek-v4-flash";
/** Modelo pequeno que responde mesmo com a fila cheia. */
const DEFAULT_FALLBACK = "meta/llama-3.1-8b-instruct";

/** Teto de espera por requisição. O tier grátis enfileira modelo
 *  concorrido e a chamada fica pendurada até o job do Inngest morrer —
 *  melhor falhar rápido e cair pro mock/fallback de quem chamou. */
const TIMEOUT_MS = 90_000;

export function nvidiaModel(): string {
  return process.env.NVIDIA_MODEL || DEFAULT_MODEL;
}

export function nvidiaFallbackModel(): string {
  return process.env.NVIDIA_FALLBACK_MODEL || DEFAULT_FALLBACK;
}

/**
 * Uma conversa system+user, resposta em JSON.
 *
 * `response_format: json_object` é o equivalente do `responseSchema` do
 * Gemini nesta API: sem ele, o modelo embrulha o JSON em ```json e a
 * primeira geração morre no JSON.parse — foi o que já acontecia com a
 * Pollinations. O prompt de quem chama continua tendo que DESCREVER o
 * formato; o flag só garante que a saída seja JSON válido.
 */
export async function nvidiaChatJson(
  systemPrompt: string,
  userPrompt: string,
  opts: {
    maxTokens?: number;
    temperature?: number;
    /**
     * Começa pelo modelo RÁPIDO em vez do melhor.
     *
     * Existe pro que roda dentro de uma requisição do usuário, e não num
     * job: o modelo padrão levou 21s num teste real (e ainda caiu em 529),
     * o que estoura o teto da função serverless e o usuário recebe erro.
     * Job do Inngest tem folga e continua no padrão.
     */
    preferirRapido?: boolean;
  } = {}
): Promise<string> {
  const principal = opts.preferirRapido ? nvidiaFallbackModel() : nvidiaModel();
  const reserva = opts.preferirRapido ? nvidiaModel() : nvidiaFallbackModel();
  try {
    return await chamar(principal, systemPrompt, userPrompt, opts);
  } catch (err) {
    if (reserva === principal) throw err;
    const motivo = err instanceof Error ? err.message : String(err);
    console.warn(`[nvidia] ${principal} falhou (${motivo}); tentando ${reserva}`);
    return chamar(reserva, systemPrompt, userPrompt, opts);
  }
}

async function chamar(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY não configurada");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.7,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      throw new Error(`NVIDIA respondeu ${res.status}: ${corpo.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const texto = data.choices?.[0]?.message?.content;
    if (!texto) throw new Error("Resposta da NVIDIA sem conteúdo");
    return stripFence(texto);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `NVIDIA não respondeu em ${TIMEOUT_MS / 1000}s (modelo ${model} em fila no tier grátis)`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Tira a cerca de markdown que alguns modelos insistem em pôr mesmo com
 *  response_format=json_object. Barato, e evita um erro de parse que
 *  derrubaria a geração inteira por causa de três crases. */
function stripFence(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  return t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}
