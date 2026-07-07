// ============================================================
// Fontes RSS curadas por nicho — usadas em dois lugares:
// 1. Trigger handle_new_user (migration 017/018, cópia em SQL)
// 2. saveNiche (actions.ts) quando o nicho é TROCADO depois do
//    cadastro — sem isso, mudar o nicho em Ajustes não trazia
//    nenhuma fonte nova e a fila continuava vazia.
// Mantenha as chaves sincronizadas com src/lib/niches.ts e com o
// CASE do SQL em supabase/migrations/017_brand_template_and_niche.sql.
// ============================================================
export interface CuratedSource {
  name: string;
  feed_url: string;
  threshold: number;
}

export const NICHE_SOURCES: Record<string, CuratedSource[]> = {
  marketing: [
    { name: "Marketing Land", feed_url: "https://martech.org/feed/", threshold: 70 },
    { name: "Social Media Today", feed_url: "https://www.socialmediatoday.com/feeds/news/", threshold: 70 },
    { name: "Neil Patel Blog", feed_url: "https://neilpatel.com/feed/", threshold: 70 },
  ],
  financas: [
    { name: "InfoMoney", feed_url: "https://www.infomoney.com.br/feed/", threshold: 70 },
    { name: "Valor Investe", feed_url: "https://valorinveste.globo.com/rss/valor-investe/", threshold: 70 },
  ],
  saude: [
    { name: "Saúde Abril", feed_url: "https://saude.abril.com.br/feed/", threshold: 70 },
    { name: "CNN Saúde", feed_url: "https://www.cnnbrasil.com.br/saude/feed/", threshold: 70 },
  ],
  games: [
    { name: "IGN Brasil", feed_url: "https://br.ign.com/feed.xml", threshold: 70 },
    { name: "The Enemy", feed_url: "https://www.theenemy.com.br/rss", threshold: 70 },
  ],
  tecnologia: [
    { name: "TechCrunch AI", feed_url: "https://techcrunch.com/category/artificial-intelligence/feed/", threshold: 70 },
    { name: "The Verge AI", feed_url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", threshold: 70 },
    { name: "VentureBeat AI", feed_url: "https://venturebeat.com/category/ai/feed/", threshold: 70 },
    { name: "Hacker News (front)", feed_url: "https://hnrss.org/frontpage", threshold: 75 },
  ],
};

/** Fontes curadas do nicho, com fallback pro set de tecnologia/IA */
export function sourcesForNiche(niche: string | null | undefined): CuratedSource[] {
  return NICHE_SOURCES[niche ?? ""] ?? NICHE_SOURCES.tecnologia;
}
