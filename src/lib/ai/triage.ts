// ============================================================
// Triagem de notícias — Claude Haiku 4.5 por padrão.
// Recebe um lote de notícias e devolve score viral (0-100) +
// justificativa curta para cada uma.
//
// 💰 Custo: Haiku 4.5 = $1/M tokens entrada, $5/M saída.
//    No volume do MVP (~300 notícias/dia) ≈ $1-2/mês.
// 🆓 MOCK: sem ANTHROPIC_API_KEY nem GEMINI_API_KEY, usa scores
//    determinísticos baseados em palavras-chave — $0.
//
// Gemini (alternativa): AI_PROVIDER=gemini + GEMINI_API_KEY usa
// Gemini 2.5 Flash em vez de Claude — ver generate.ts para detalhes.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { nicheLabel } from "@/lib/niches";

export interface TriageInput {
  id: string;
  title: string;
  summary: string | null;
}

/** Tema do perfil usado no critério de triagem, de acordo com o nicho escolhido */
function triageTopic(niche: string | null | undefined): string {
  return !niche || niche === "tecnologia" ? "Inteligência Artificial" : nicheLabel(niche);
}

export interface TriageResult {
  id: string;
  score: number; // 0-100
  reason: string; // justificativa em 1 frase
}

// Palavras que indicam potencial viral (usadas só no mock)
const MOCK_HOT_WORDS = [
  "openai", "anthropic", "claude", "gpt", "gemini", "meta", "google",
  "lançamento", "launch", "release", "breakthrough", "agi", "robot",
  "demite", "layoff", "bilhões", "billion", "grátis", "free", "open source",
];

/**
 * Mock local: score por palavras-chave. Serve para testar o pipeline
 * inteiro sem gastar com API.
 */
function mockTriage(items: TriageInput[]): TriageResult[] {
  return items.map((item) => {
    const text = `${item.title} ${item.summary ?? ""}`.toLowerCase();
    const hits = MOCK_HOT_WORDS.filter((w) => text.includes(w)).length;
    // 0 hits → 30, cada hit soma 15, teto em 95
    const score = Math.min(30 + hits * 15, 95);
    return {
      id: item.id,
      score,
      reason: `[MOCK] ${hits} palavra(s)-chave viral(is) encontrada(s).`,
    };
  });
}

/**
 * Triagem real com Haiku 4.5 + structured outputs (JSON garantido).
 */
async function claudeTriage(
  items: TriageInput[],
  niche?: string | null
): Promise<TriageResult[]> {
  const anthropic = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente
  const topic = triageTopic(niche);

  const newsList = items
    .map(
      (item, i) =>
        `${i + 1}. [id: ${item.id}]\nTítulo: ${item.title}\nResumo: ${item.summary ?? "(sem resumo)"}`
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: `Você é um analista de conteúdo viral para um perfil de Instagram focado em ${topic} (notícias sensacionalistas, novidades e curiosidades do nicho, em português).

Avalie cada notícia com um score de 0 a 100 de potencial viral para esse público:
- 80-100: bombástica — grandes lançamentos, drama entre marcas/empresas do nicho, números impressionantes, medo/empolgação
- 60-79: boa — novidade interessante, ferramenta ou fato útil, curiosidade forte
- 40-59: mediana — relevante mas sem gancho emocional
- 0-39: fraca — nichada demais, técnica demais ou sem relação com ${topic}

Notícias fora do tema ${topic} devem receber score baixo.`,
    messages: [
      {
        role: "user",
        content: `Avalie as notícias abaixo:\n\n${newsList}`,
      },
    ],
    // Structured outputs: garante JSON válido no formato esperado
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  score: { type: "integer" },
                  reason: { type: "string" },
                },
                required: ["id", "score", "reason"],
                additionalProperties: false,
              },
            },
          },
          required: ["results"],
          additionalProperties: false,
        },
      },
    },
  });

  // Com output_config.format, o primeiro bloco text é JSON válido
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Resposta da triagem sem bloco de texto");
  }

  const parsed = JSON.parse(textBlock.text) as { results: TriageResult[] };

  // Garante score dentro de 0-100 mesmo se o modelo extrapolar
  return parsed.results.map((r) => ({
    ...r,
    score: Math.max(0, Math.min(100, r.score)),
  }));
}

function buildTriageSystemPrompt(niche?: string | null): string {
  const topic = triageTopic(niche);
  return `Você é um analista de conteúdo viral para um perfil de Instagram focado em ${topic} (notícias sensacionalistas, novidades e curiosidades do nicho, em português).

Avalie cada notícia com um score de 0 a 100 de potencial viral para esse público:
- 80-100: bombástica — grandes lançamentos, drama entre marcas/empresas do nicho, números impressionantes, medo/empolgação
- 60-79: boa — novidade interessante, ferramenta ou fato útil, curiosidade forte
- 40-59: mediana — relevante mas sem gancho emocional
- 0-39: fraca — nichada demais, técnica demais ou sem relação com ${topic}

Notícias fora do tema ${topic} devem receber score baixo.`;
}

const TRIAGE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["id", "score", "reason"],
      },
    },
  },
  required: ["results"],
};

/**
 * Triagem real com Gemini 2.5 Flash — mesmo critério do Claude,
 * JSON garantido via responseSchema. Alternativa mais barata ao Haiku.
 */
async function geminiTriage(
  items: TriageInput[],
  niche?: string | null
): Promise<TriageResult[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const newsList = items
    .map(
      (item, i) =>
        `${i + 1}. [id: ${item.id}]\nTítulo: ${item.title}\nResumo: ${item.summary ?? "(sem resumo)"}`
    )
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Avalie as notícias abaixo:\n\n${newsList}`,
    config: {
      systemInstruction: buildTriageSystemPrompt(niche),
      responseMimeType: "application/json",
      responseSchema: TRIAGE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Resposta da triagem (Gemini) sem texto");
  const parsed = JSON.parse(text) as { results: TriageResult[] };

  return parsed.results.map((r) => ({
    ...r,
    score: Math.max(0, Math.min(100, r.score)),
  }));
}

/**
 * Ponto de entrada: Gemini se AI_PROVIDER=gemini (+ GEMINI_API_KEY),
 * Claude se houver ANTHROPIC_API_KEY, senão mock.
 */
export async function triageNews(
  items: TriageInput[],
  niche?: string | null,
  onDegraded?: (reason: string) => void
): Promise<TriageResult[]> {
  if (items.length === 0) return [];

  const real =
    process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY
      ? () => geminiTriage(items, niche)
      : process.env.ANTHROPIC_API_KEY
        ? () => claudeTriage(items, niche)
        : null;

  if (!real) {
    console.warn("[triage] nenhuma API key de IA — usando MOCK");
    return mockTriage(items);
  }

  try {
    return await real();
  } catch (err) {
    // Falha do provider (cota estourada, rede, chave inválida) NÃO pode
    // derrubar a varredura inteira: sem isso, um 429 do tier grátis do
    // Gemini fazia o scan morrer com status 'error' e nenhuma notícia
    // era coletada — o pipeline inteiro parava por causa da triagem, que
    // é só a etapa de pontuação. Cai no mock (score por palavra-chave) e
    // avisa quem chamou, pra ficar registrado que a rodada foi degradada.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[triage] provider falhou, caindo pro MOCK: ${reason}`);
    onDegraded?.(reason);
    return mockTriage(items);
  }
}
