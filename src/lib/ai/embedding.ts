// ============================================================
// Embeddings de legenda para o guardrail anti-duplicata.
//
// Real: Gemini text-embedding-004 (768 dims) quando GEMINI_API_KEY.
// 🆓 MOCK (sem key): vetor DETERMINÍSTICO derivado do texto — mesmo
//    texto → mesmo vetor; textos diferentes → vetores ~ortogonais.
//    O mock detecta duplicata EXATA (não semântica), o suficiente
//    para exercitar o mecanismo (embed → distância → limiar) a $0.
// ============================================================
import { GoogleGenAI } from "@google/genai";

/** Dimensão do vetor — precisa casar com posts.caption_embedding (migration 023). */
export const EMBEDDING_DIM = 768;

/**
 * Distância de cosseno (operador <=> do pgvector) abaixo da qual duas
 * legendas são consideradas "parecidas demais" (0 = idênticas).
 */
export const DUPLICATE_MAX_DISTANCE = 0.15;

/** PRNG determinístico (mulberry32) a partir de uma seed inteira. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash string → uint32 (FNV-1a) para semear o PRNG do mock. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Vetor mock determinístico e normalizado (norma 1) de dimensão EMBEDDING_DIM. */
export function mockEmbed(text: string): number[] {
  const rand = mulberry32(hashSeed(text.trim().toLowerCase()));
  const v = Array.from({ length: EMBEDDING_DIM }, () => rand() * 2 - 1);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Embedding real via Gemini (768 dims). */
async function geminiEmbed(text: string): Promise<number[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const res = await ai.models.embedContent({
    model: "text-embedding-004",
    contents: text,
  });
  const values = (res as { embeddings?: { values?: number[] }[] }).embeddings?.[0]
    ?.values;
  if (!values || values.length === 0) {
    throw new Error("Gemini embedContent não retornou valores");
  }
  return values;
}

/**
 * Ponto de entrada: Gemini se houver GEMINI_API_KEY, senão MOCK
 * determinístico. Sempre devolve um vetor de EMBEDDING_DIM dimensões.
 */
export async function embedText(text: string): Promise<number[]> {
  if (process.env.GEMINI_API_KEY) {
    return geminiEmbed(text);
  }
  return mockEmbed(text);
}

/** Formata o vetor no literal de entrada do pgvector: "[a,b,c]". */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
