// ============================================================
// Coletor do Reddit via API oficial (OAuth app-only, client_credentials).
//
// O endpoint público `.json` fechou em 2025 e devolve 403 mesmo com
// User-Agent de browser. A alternativa grátis e sem review é criar uma
// app tipo "script" em reddit.com/prefs/apps e autenticar com
// client_id + secret — sem login de usuário, sem OAuth interativo.
//
// Sem REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET, cai fora da coleta sem
// tentar rede — mesmo padrão de chave ausente do resto do projeto
// (ver stock-photos.ts, nvidia.ts).
// ============================================================
import type { RadarCollector, RadarItem } from "@/lib/radar/types";

const TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const SEARCH_ENDPOINT = "https://oauth.reddit.com/search";
const TIMEOUT_MS = 15_000;
const USER_AGENT = "postpilot-radar/1.0 (by /u/postpilot-ai)";

interface RedditPostData {
  id: string;
  title: string;
  url: string | null;
  permalink: string;
  author: string | null;
  score: number | null;
  num_comments: number | null;
  created_utc: number | null;
}

interface RedditSearchResponse {
  data?: { children?: Array<{ data: RedditPostData }> };
}

// Token cacheado em memória do processo — evita gerar um novo a cada
// collect() (o job chama uma vez por tópico x por cliente na mesma
// execução). Expira sozinho; a margem de 60s evita usar em cima da hora.
let tokenCache: { valor: string; expiraEm: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  if (tokenCache && tokenCache.expiraEm > Date.now()) {
    return tokenCache.valor;
  }

  try {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
    const resposta = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      signal: controle.signal,
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
      },
      body: "grant_type=client_credentials",
    });
    clearTimeout(timer);
    if (!resposta.ok) {
      console.error(`[radar/reddit] token HTTP ${resposta.status}`);
      return null;
    }
    const payload = (await resposta.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) return null;

    tokenCache = {
      valor: payload.access_token,
      expiraEm: Date.now() + (payload.expires_in ?? 3600) * 1000 - 60_000,
    };
    return tokenCache.valor;
  } catch (err) {
    console.error("[radar/reddit] falha ao autenticar:", err);
    return null;
  }
}

export const redditCollector: RadarCollector = {
  platform: "reddit",

  async collect(topic, { desde, limite }) {
    const token = await getAccessToken();
    // Sem credencial (ou token indisponível): fica fora da coleta em
    // silêncio, igual a qualquer outra fonte sem chave configurada.
    if (!token) return [];

    const params = new URLSearchParams({
      q: topic,
      sort: "top",
      t: "week",
      limit: String(Math.min(100, Math.max(1, limite))),
    });

    let payload: RedditSearchResponse;
    try {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
      const resposta = await fetch(`${SEARCH_ENDPOINT}?${params}`, {
        signal: controle.signal,
        headers: {
          authorization: `Bearer ${token}`,
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
      });
      clearTimeout(timer);
      if (!resposta.ok) {
        console.error(`[radar/reddit] HTTP ${resposta.status} para "${topic}"`);
        return [];
      }
      payload = await resposta.json();
    } catch (err) {
      // Fonte fora do ar não derruba a varredura — mesma regra do HN.
      console.error(`[radar/reddit] falha ao buscar "${topic}":`, err);
      return [];
    }

    const desdeSegundos = desde.getTime() / 1000;
    const itens: RadarItem[] = [];
    for (const child of payload.data?.children ?? []) {
      const post = child.data;
      if (!post?.title) continue;
      if (post.created_utc != null && post.created_utc < desdeSegundos) continue;
      itens.push({
        platform: "reddit",
        externalId: post.id,
        url: post.url || `https://reddit.com${post.permalink}`,
        title: post.title,
        author: post.author,
        topic,
        points: post.score ?? 0,
        comments: post.num_comments ?? 0,
        publishedAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
      });
    }
    return itens;
  },
};
