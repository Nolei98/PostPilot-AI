// ============================================================
// Consultas do Radar por nicho.
//
// Em inglês de propósito: o Hacker News é uma comunidade anglófona, e
// buscar "inteligência artificial" lá devolve zero. É o mesmo raciocínio
// do `brollQueries` (video-brief.ts), que já decidiu isso pro b-roll do
// Pexels — o idioma da marca não é o idioma do índice.
//
// As palavras-chave do próprio cliente entram junto quando existem: quem
// escreveu "DESIGN, IA, TECH" no kit está dizendo o que quer ver.
// ============================================================
import type { CardBrand } from "@/lib/carousel-render";

const POR_NICHO: Record<string, string[]> = {
  tecnologia: ["artificial intelligence", "LLM", "open source AI", "developer tools"],
  marketing: ["marketing strategy", "growth", "content marketing", "SEO"],
  financas: ["investing", "fintech", "personal finance", "markets"],
  saude: ["health research", "nutrition science", "mental health", "longevity"],
  games: ["game development", "indie games", "game design", "gaming industry"],
};

const PADRAO = POR_NICHO.tecnologia;

/** Limite de consultas por varredura: cada uma é uma requisição, e a lista
 *  cresce sozinha quando o cliente cadastra palavra-chave. */
const MAX_CONSULTAS = 6;

/**
 * Consultas a rodar para um cliente. Nicho primeiro (curado, estável),
 * palavras-chave do kit depois (intenção explícita da pessoa).
 */
export function topicsForClient(
  niche: string | null | undefined,
  keywords: string[] | null | undefined
): string[] {
  const doNicho = POR_NICHO[niche ?? ""] ?? PADRAO;
  const doCliente = (keywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 3);

  // Set preserva a ordem de inserção e mata repetido sem custo.
  return [...new Set([...doNicho, ...doCliente])].slice(0, MAX_CONSULTAS);
}

/** Conveniência para quem já tem o CardBrand montado. */
export function topicsForBrand(brand: Pick<CardBrand, "keywords"> & { niche?: string | null }) {
  return topicsForClient(brand.niche ?? null, brand.keywords ?? null);
}
