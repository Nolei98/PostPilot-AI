// ============================================================
// Brief de REMIX (Sprint E, fatia 2) — lê as referências que o Radar
// mediu e devolve a FÓRMULA por trás delas, não o conteúdo.
//
// A diferença importa: copiar a manchete alheia é plágio e não performa
// duas vezes. O que se repete é a ESTRUTURA — o tipo de gancho, o ângulo,
// a promessa. É isso que o brief extrai, pra virar matéria-prima de um
// post ORIGINAL no nicho do cliente.
//
// Mesma pluralidade de providers do carousel.ts, e MOCK sem key: a
// suíte roda a $0.
// ============================================================
import { nicheLabel } from "@/lib/niches";
import type { TextProvider } from "@/lib/types";

/** Uma referência já ranqueada, do jeito que o Radar guardou. */
export interface RemixReference {
  title: string;
  platform: string;
  points: number;
  comments: number;
  score: number;
}

export interface RemixBrief {
  /** O padrão que aparece nas referências de topo, em uma frase. */
  padrao: string;
  /** Por que esse padrão prendeu atenção — o mecanismo, não o assunto. */
  porQueFunciona: string;
  /** Ganchos ORIGINAIS no nicho do cliente, seguindo o padrão. */
  ganchos: string[];
  /** Ângulo sugerido pro post. */
  angulo: string;
}

export interface RemixInput {
  referencias: RemixReference[];
  niche?: string | null;
  language?: string;
}

export const MIN_GANCHOS = 3;
export const MAX_GANCHOS = 5;
/** Quantas referências entram no prompt. Mais que isso dilui o padrão:
 *  o modelo passa a descrever "notícias de tecnologia" em vez da forma
 *  que os campeões têm em comum. */
export const MAX_REFERENCIAS = 8;

const LANGUAGE_NAMES: Record<string, string> = {
  "pt-BR": "português do Brasil",
  en: "inglês",
  es: "espanhol",
};
const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code;

/** Palavras que não distinguem título nenhum — fora da comparação. */
const VAZIAS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "do", "da", "dos", "das", "e", "em",
  "no", "na", "nos", "nas", "para", "por", "com", "que", "the", "of", "to",
  "in", "on", "for", "and", "is", "are", "with", "as", "at", "not",
]);

function tokens(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // tira acento: "código" ~ "codigo"
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !VAZIAS.has(t))
  );
}

/**
 * O gancho é reescrita de um dos títulos recebidos?
 *
 * Existe porque a proibição no prompt NÃO basta: num teste real de
 * 31/07 o modelo devolveu "Desenho como compromisso" para a referência
 * "Design is compromise" e "Código 2x, não 10x" para "2x, not 10x:
 * coding with LLMs" — tradução é cópia com uma etapa a mais, e a
 * comparação literal não pega.
 *
 * ⚠️ Limite conhecido: isto pega reescrita no MESMO idioma (e cognato,
 * porque o acento é normalizado). Tradução entre idiomas distantes
 * escapa — "Design is compromise" → "Projetar é ceder" não tem token em
 * comum. Uma checagem por embedding resolveria; não vale o custo antes
 * de ver o problema acontecer com o prompt já endurecido.
 */
export function pareceCopia(gancho: string, titulos: string[]): boolean {
  const g = tokens(gancho);
  if (g.size === 0) return false;
  for (const titulo of titulos) {
    const t = tokens(titulo);
    if (t.size === 0) continue;
    let comuns = 0;
    for (const token of g) if (t.has(token)) comuns++;
    // Metade dos termos significativos do gancho vindos do mesmo título
    // já é reescrita, não inspiração.
    if (comuns / g.size >= 0.5) return true;
  }
  return false;
}

/**
 * Valida o contrato do brief. Lança se vier fora — o chamador tenta de
 * novo uma vez, mesmo desenho de generateCarouselPackage.
 *
 * `titulos` é opcional pra manter a função utilizável sem contexto, mas
 * o caminho de produção sempre passa: é o que impede o brief de devolver
 * o título alheio maquiado.
 */
export function validateBrief(brief: RemixBrief, titulos: string[] = []): void {
  // Checar o TIPO, e não só a verdade: um modelo já devolveu `padrao`
  // como não-string, e o erro saía como "brief.padrao?.trim is not a
  // function" — verdadeiro, e inútil pra quem depura.
  for (const campo of ["padrao", "porQueFunciona", "angulo"] as const) {
    const valor = brief[campo];
    if (typeof valor !== "string" || !valor.trim()) {
      throw new Error(`brief.${campo} inválido (veio ${typeof valor})`);
    }
  }
  if (!Array.isArray(brief.ganchos)) throw new Error("brief sem ganchos");
  if (brief.ganchos.length < MIN_GANCHOS || brief.ganchos.length > MAX_GANCHOS) {
    throw new Error(
      `brief precisa de ${MIN_GANCHOS}–${MAX_GANCHOS} ganchos (veio ${brief.ganchos.length})`
    );
  }
  for (const g of brief.ganchos) {
    if (typeof g !== "string" || !g.trim()) throw new Error("gancho vazio no brief");
    if (pareceCopia(g, titulos)) {
      throw new Error(`gancho é reescrita de uma referência: "${g}"`);
    }
  }
}

/** Mock determinístico, sem rede — mantém a suíte em $0. */
export function mockBrief(input: RemixInput): RemixBrief {
  const topo = input.referencias[0]?.title ?? "referência";
  const nicho = nicheLabel(input.niche);
  return {
    padrao: `[MOCK] Afirmação direta + termo técnico reconhecível, como em "${topo.slice(0, 48)}"`,
    porQueFunciona:
      "[MOCK] Entrega o assunto inteiro no título e promete profundidade sem prometer sensação.",
    ganchos: [
      `[MOCK] O detalhe de ${nicho} que ninguém leu direito`,
      `[MOCK] Por que ${nicho} mudou de regra esta semana`,
      `[MOCK] O erro que todo mundo comete em ${nicho}`,
    ],
    angulo: `[MOCK] Explicar o mecanismo por trás da notícia mais comentada de ${nicho}.`,
  };
}

function buildSystemPrompt(lang: string, niche?: string | null): string {
  const persona = !niche || niche === "tecnologia" ? "tecnologia e IA" : nicheLabel(niche);
  return `Você analisa conteúdo que VIRALIZOU e extrai a fórmula por trás dele, para um perfil de ${persona}.

⚠️ IDIOMA: escreva tudo em ${lang}.

Você recebe títulos que performaram de verdade, com o engajamento medido de cada um.

Regras:
- Extraia o PADRÃO ESTRUTURAL comum aos títulos de maior engajamento — tipo de gancho, promessa, forma. NUNCA o assunto específico.
- "porQueFunciona" explica o MECANISMO de atenção, não repete o padrão com outras palavras.
- Os ganchos devem ser ORIGINAIS. É PROIBIDO traduzir, reescrever ou parafrasear os títulos recebidos: eles são amostra de FORMA, não de conteúdo.
  Exemplo do que NÃO fazer: se a referência é "Design is compromise", devolver "Desenho como compromisso" é tradução, e está errado — o certo é usar a forma (afirmação curta e categórica sobre o ofício) para falar de OUTRO assunto do nicho.
- Cada gancho deve tratar de um assunto que NÃO aparece nas referências.
- Gancho curto (até ~70 caracteres), sem emoji, sem clickbait vazio: precisa entregar o que promete.

Responda em JSON: { padrao, porQueFunciona, ganchos: [string], angulo }.
Entre ${MIN_GANCHOS} e ${MAX_GANCHOS} ganchos.`;
}

function userPrompt(input: RemixInput): string {
  const linhas = input.referencias
    .slice(0, MAX_REFERENCIAS)
    .map(
      (r, i) =>
        `${i + 1}. "${r.title}" — ${r.platform}, ${r.points} pontos, ${r.comments} comentários (score ${r.score})`
    )
    .join("\n");
  return `Estas são as referências que mais performaram no nicho:\n\n${linhas}\n\nExtraia a fórmula e proponha ganchos originais.`;
}

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    padrao: { type: "string" },
    porQueFunciona: { type: "string" },
    ganchos: { type: "array", items: { type: "string" } },
    angulo: { type: "string" },
  },
  required: ["padrao", "porQueFunciona", "ganchos", "angulo"],
} as const;

async function nvidiaBrief(input: RemixInput): Promise<RemixBrief> {
  const { nvidiaChatJson } = await import("@/lib/ai/nvidia");
  const raw = await nvidiaChatJson(
    buildSystemPrompt(languageName(input.language ?? "pt-BR"), input.niche),
    `${userPrompt(input)}\n\nResponda APENAS com o JSON do brief.`,
    { maxTokens: 1200 }
  );
  return JSON.parse(raw) as RemixBrief;
}

async function geminiBrief(input: RemixInput): Promise<RemixBrief> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt(input),
    config: {
      systemInstruction: buildSystemPrompt(languageName(input.language ?? "pt-BR"), input.niche),
      responseMimeType: "application/json",
      responseSchema: BRIEF_SCHEMA,
    },
  });
  if (!res.text) throw new Error("brief (Gemini) sem texto");
  return JSON.parse(res.text) as RemixBrief;
}

function pickProvider(provider: TextProvider) {
  if (provider === "nvidia" && process.env.NVIDIA_API_KEY) return nvidiaBrief;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return geminiBrief;
  // Claude e Pollinations não entram aqui de propósito: o brief é um
  // texto curto e barato, e os dois providers do kit hoje cobrem todos os
  // clientes. Acrescentar mais caminho só aumenta superfície sem uso.
  return null;
}

/** Ponto de entrada. Sem key → mock. JSON fora do contrato → 1 retentativa. */
export async function generateRemixBrief(
  input: RemixInput,
  provider: TextProvider = "nvidia"
): Promise<RemixBrief> {
  if (input.referencias.length === 0) {
    throw new Error("sem referências para extrair fórmula");
  }

  const titulos = input.referencias.map((r) => r.title);
  const gen = pickProvider(provider);
  if (!gen) {
    console.warn("[remix] nenhuma API key de IA — usando MOCK");
    const brief = mockBrief(input);
    validateBrief(brief, titulos);
    return brief;
  }
  try {
    const brief = await gen(input);
    validateBrief(brief, titulos);
    return brief;
  } catch (err) {
    console.warn("[remix] 1º brief inválido, tentando de novo:", (err as Error).message);
    const brief = await gen(input);
    validateBrief(brief, titulos); // falhou de novo → propaga
    return brief;
  }
}
