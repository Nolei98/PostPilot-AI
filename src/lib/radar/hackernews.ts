// ============================================================
// Coletor do Hacker News via API de busca do Algolia.
//
// Escolhido por ser o único que responde ENGAJAMENTO REAL sem
// credencial nenhuma: `points` e `num_comments` vêm no próprio hit.
// A API oficial do HN (Firebase) devolve um id por vez e exigiria N+1
// requisições pra montar o mesmo ranking.
//
// Sem chave, sem OAuth, sem cota declarada — só educação no volume.
// ============================================================
import type { RadarCollector, RadarItem } from "@/lib/radar/types";

const ENDPOINT = "https://hn.algolia.com/api/v1/search";
const TIMEOUT_MS = 15_000;

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  url: string | null;
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string | null;
}

export const hackerNewsCollector: RadarCollector = {
  platform: "hackernews",

  async collect(topic, { desde, limite }) {
    // `numericFilters` corta pela data no servidor: pedir 50 e filtrar
    // aqui traria os campeões históricos do tema e nunca os da semana.
    const params = new URLSearchParams({
      query: topic,
      tags: "story",
      hitsPerPage: String(Math.min(50, Math.max(1, limite))),
      numericFilters: `created_at_i>${Math.floor(desde.getTime() / 1000)}`,
    });

    let payload: { hits?: AlgoliaHit[] };
    try {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
      const resposta = await fetch(`${ENDPOINT}?${params}`, {
        signal: controle.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(timer);
      if (!resposta.ok) {
        console.error(`[radar/hn] HTTP ${resposta.status} para "${topic}"`);
        return [];
      }
      payload = await resposta.json();
    } catch (err) {
      // Fonte fora do ar não derruba a varredura — mesma regra do
      // scan-news.ts com feed quebrado.
      console.error(`[radar/hn] falha ao buscar "${topic}":`, err);
      return [];
    }

    const itens: RadarItem[] = [];
    for (const hit of payload.hits ?? []) {
      // Story sem título não vira referência; sem url externa, cai na
      // página de discussão do próprio HN (que é onde o debate está).
      if (!hit.title) continue;
      itens.push({
        platform: "hackernews",
        externalId: hit.objectID,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: hit.title,
        author: hit.author,
        topic,
        points: hit.points ?? 0,
        comments: hit.num_comments ?? 0,
        publishedAt: hit.created_at,
      });
    }
    return itens;
  },
};
