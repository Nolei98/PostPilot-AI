// ============================================================
// Cliente do Instagram Graph API (Sprint C: OAuth + publicação +
// insights). Mesmo padrão de src/lib/ai/generate.ts e image.ts:
// sem META_APP_ID/META_APP_SECRET no ambiente, cada função cai num
// mock determinístico (sem rede) — mantém a CI e os testes a $0 e
// permite revisar/testar o pipeline inteiro antes de ter o app do
// Meta aprovado.
//
// 🆓 MOCK: sem META_APP_ID, todas as funções abaixo retornam ids
//    fixos (`mock-...`) e não fazem nenhuma chamada de rede.
// ============================================================

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function hasMetaApp(): boolean {
  return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
}

async function graphFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || (json as { error?: { message: string } }).error) {
    throw new Error(
      `Graph API error: ${(json as { error?: { message: string } }).error?.message ?? res.statusText}`
    );
  }
  return json;
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number;
}

/** Troca o `code` do OAuth callback por um token de usuário de curta duração. */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResult> {
  if (!hasMetaApp()) {
    return { accessToken: "mock-short-lived-token", expiresIn: 3600 };
  }
  const url =
    `${GRAPH_BASE}/oauth/access_token?client_id=${process.env.META_APP_ID}` +
    `&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${encodeURIComponent(code)}`;
  const data = await graphFetch<{ access_token: string; expires_in: number }>(url);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Troca um token de curta duração por um de longa duração (~60 dias). */
export async function getLongLivedToken(shortLivedToken: string): Promise<TokenResult> {
  if (!hasMetaApp()) {
    return { accessToken: "mock-long-lived-token", expiresIn: 5_184_000 };
  }
  const url =
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}` +
    `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
  const data = await graphFetch<{ access_token: string; expires_in: number }>(url);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

/** Lista as Páginas do Facebook do usuário (com a conta IG vinculada, se houver). */
export async function getFacebookPages(userAccessToken: string): Promise<FacebookPage[]> {
  if (!hasMetaApp()) {
    return [
      {
        id: "mock-page-id",
        name: "Página Mock",
        access_token: "mock-page-access-token",
        instagram_business_account: { id: "mock-ig-business-id" },
      },
    ];
  }
  const url =
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account` +
    `&access_token=${encodeURIComponent(userAccessToken)}`;
  const data = await graphFetch<{ data: FacebookPage[] }>(url);
  return data.data;
}

/** Busca o @username da conta IG Business (pra exibir na UI de conexão). */
export async function getInstagramUsername(igBusinessAccountId: string, accessToken: string): Promise<string> {
  if (!hasMetaApp()) return "mock.ig.account";
  const url =
    `${GRAPH_BASE}/${igBusinessAccountId}?fields=username&access_token=${encodeURIComponent(accessToken)}`;
  const data = await graphFetch<{ username: string }>(url);
  return data.username;
}

export interface MediaContainerParams {
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  isCarouselItem?: boolean;
  mediaType?: "REELS";
}

/** Cria um container de mídia (imagem única, item de carrossel, ou vídeo/Reels). */
export async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  params: MediaContainerParams
): Promise<string> {
  if (!hasMetaApp()) {
    return `mock-media-${Math.random().toString(36).slice(2, 10)}`;
  }
  const body = new URLSearchParams({ access_token: accessToken });
  if (params.imageUrl) body.set("image_url", params.imageUrl);
  if (params.videoUrl) body.set("video_url", params.videoUrl);
  if (params.caption) body.set("caption", params.caption);
  if (params.isCarouselItem) body.set("is_carousel_item", "true");
  if (params.mediaType) body.set("media_type", params.mediaType);
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media`, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) throw new Error(`createMediaContainer falhou: ${json.error?.message ?? res.statusText}`);
  return json.id;
}

/** Agrupa containers de item em um container de carrossel. */
export async function createCarouselContainer(
  igUserId: string,
  accessToken: string,
  childrenIds: string[],
  caption: string
): Promise<string> {
  if (!hasMetaApp()) {
    return `mock-carousel-${Math.random().toString(36).slice(2, 10)}`;
  }
  const body = new URLSearchParams({
    access_token: accessToken,
    media_type: "CAROUSEL",
    children: childrenIds.join(","),
    caption,
  });
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media`, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) throw new Error(`createCarouselContainer falhou: ${json.error?.message ?? res.statusText}`);
  return json.id;
}

/** Publica um container já criado; retorna o id da mídia publicada. */
export async function publishMedia(igUserId: string, accessToken: string, creationId: string): Promise<string> {
  if (!hasMetaApp()) {
    return `mock-published-${Math.random().toString(36).slice(2, 10)}`;
  }
  const body = new URLSearchParams({ access_token: accessToken, creation_id: creationId });
  const res = await fetch(`${GRAPH_BASE}/${igUserId}/media_publish`, { method: "POST", body });
  const json = (await res.json()) as { id?: string; error?: { message: string } };
  if (!res.ok || !json.id) throw new Error(`publishMedia falhou: ${json.error?.message ?? res.statusText}`);
  return json.id;
}

export interface MediaInsights {
  reach: number | null;
  saved: number | null;
  shares: number | null;
  likes: number | null;
  comments: number | null;
}

/** Busca as métricas de uma mídia publicada. */
export async function getMediaInsights(mediaId: string, accessToken: string): Promise<MediaInsights> {
  if (!hasMetaApp()) {
    return { reach: 0, saved: 0, shares: 0, likes: 0, comments: 0 };
  }
  const metrics = "reach,saved,shares,likes,comments";
  const url = `${GRAPH_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(accessToken)}`;
  const data = await graphFetch<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(url);
  const byName = new Map(data.data.map((m) => [m.name, m.values[0]?.value ?? null]));
  return {
    reach: byName.get("reach") ?? null,
    saved: byName.get("saved") ?? null,
    shares: byName.get("shares") ?? null,
    likes: byName.get("likes") ?? null,
    comments: byName.get("comments") ?? null,
  };
}
