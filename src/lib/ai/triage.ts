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

export interface TriageInput {
  id: string;
  title: string;
  summary: string | null;
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
async function claudeTriage(items: TriageInput[]): Promise<TriageResult[]> {
  const anthropic = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

  const newsList = items
    .map(
      (item, i) =>
        `${i + 1}. [id: ${item.id}]\nTítulo: ${item.title}\nResumo: ${item.summary ?? "(sem resumo)"}`
    )
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: `Você é um analista de conteúdo viral para um perfil de Instagram focado em Inteligência Artificial (notícias sensacionalistas, novidades e curiosidades de IA, em português).

Avalie cada notícia com um score de 0 a 100 de potencial viral para esse público:
- 80-100: bombástica — grandes lançamentos, drama entre empresas de IA, números impressionantes, medo/empolgação
- 60-79: boa — novidade interessante, ferramenta útil, curiosidade forte
- 40-59: mediana — relevante mas sem gancho emocional
- 0-39: fraca — nichada demais, técnica demais ou sem relação com IA

Notícias fora do tema IA/tech devem receber score baixo.`,
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

const TRIAGE_SYSTEM_PROMPT = `Você é um analista de conteúdo viral para um perfil de Instagram focado em Inteligência Artificial (notícias sensacionalistas, novidades e curiosidades de IA, em português).

Avalie cada notícia com um score de 0 a 100 de potencial viral para esse público:
- 80-100: bombástica — grandes lançamentos, drama entre empresas de IA, números impressionantes, medo/empolgação
- 60-79: boa — novidade interessante, ferramenta útil, curiosidade forte
- 40-59: mediana — relevante mas sem gancho emocional
- 0-39: fraca — nichada demais, técnica demais ou sem relação com IA

Notícias fora do tema IA/tech devem receber score baixo.`;

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
async function geminiTriage(items: TriageInput[]): Promise<TriageResult[]> {
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
      systemInstruction: TRIAGE_SYSTEM_PROMPT,
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
  items: TriageInput[]
): Promise<TriageResult[]> {
  if (items.length === 0) return [];
  if (process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) {
    return geminiTriage(items);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[triage] nenhuma API key de IA — usando MOCK");
    return mockTriage(items);
  }
  return claudeTriage(items);
}
