// ============================================================
// Cliente do Instagram Graph API (Sprint C: OAuth + publicação +
// insights). Usa o fluxo "Instagram com Login do Instagram" (2024+) —
// mais simples que o antigo "Login do Facebook": OAuth direto no
// domínio do Instagram, sem precisar de Página do Facebook vinculada
// nem de uma etapa separada de busca de Páginas. O id da conta IG
// Business já vem direto na troca do `code` pelo token.
//
// Mesmo padrão de src/lib/ai/generate.ts e image.ts: sem
// META_APP_ID/META_APP_SECRET no ambiente, cada função cai num mock
// determinístico (sem rede) — mantém a CI e os testes a $0 e permite
// revisar/testar o pipeline inteiro antes de ter o app do Meta pronto.
//
// 🆓 MOCK: sem META_APP_ID, todas as funções abaixo retornam ids
//    fixos (`mock-...`) e não fazem nenhuma chamada de rede.
// ============================================================

// Troca de código/token: domínio do Instagram (não graph.facebook.com).
const IG_OAUTH_BASE = "https://api.instagram.com";
// Conteúdo/insights (mídia, publicação, métricas): também graph.instagram.com
// no fluxo "Login do Instagram" — não graph.facebook.com.
const IG_API_BASE = "https://graph.instagram.com";

function hasMetaApp(): boolean {
  return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
}

async function igFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json()) as T & { error?: { message: string } | string; error_message?: string };
  const err = (json as { error?: { message: string } | string }).error;
  const errMessage = typeof err === "string" ? err : err?.message;
  if (!res.ok || errMessage) {
    throw new Error(`Instagram API error: ${errMessage ?? (json as { error_message?: string }).error_message ?? res.statusText}`);
  }
  return json;
}

export interface ShortLivedToken {
  accessToken: string;
  /** Conta IG Business já vem direto na troca do code — sem precisar buscar Páginas. */
  igUserId: string;
}

export interface TokenResult {
  accessToken: string;
  expiresIn: number;
}

/** Troca o `code` do OAuth callback por um token de curta duração (~1h) + o id da conta IG. */
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<ShortLivedToken> {
  if (!hasMetaApp()) {
    return { accessToken: "mock-short-lived-token", igUserId: "mock-ig-business-id" };
  }
  const body = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const data = await igFetch<{ access_token: string; user_id: string }>(`${IG_OAUTH_BASE}/oauth/access_token`, {
    method: "POST",
    body,
  });
  return { accessToken: data.access_token, igUserId: String(data.user_id) };
}

/** Troca um token de curta duração por um de longa duração (~60 dias). */
export async function getLongLivedToken(shortLivedToken: string): Promise<TokenResult> {
  if (!hasMetaApp()) {
    return { accessToken: "mock-long-lived-token", expiresIn: 5_184_000 };
  }
  const url =
    `${IG_API_BASE}/access_token?grant_type=ig_exchange_token` +
    `&client_secret=${process.env.META_APP_SECRET}&access_token=${encodeURIComponent(shortLivedToken)}`;
  const data = await igFetch<{ access_token: string; expires_in: number }>(url);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Busca o @username da conta IG Business (pra exibir na UI de conexão). */
export async function getInstagramUsername(igUserId: string, accessToken: string): Promise<string> {
  if (!hasMetaApp()) return "mock.ig.account";
  const url = `${IG_API_BASE}/${igUserId}?fields=username&access_token=${encodeURIComponent(accessToken)}`;
  const data = await igFetch<{ username: string }>(url);
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
  const res = await fetch(`${IG_API_BASE}/${igUserId}/media`, { method: "POST", body });
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
  const res = await fetch(`${IG_API_BASE}/${igUserId}/media`, { method: "POST", body });
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
  const res = await fetch(`${IG_API_BASE}/${igUserId}/media_publish`, { method: "POST", body });
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
  const url = `${IG_API_BASE}/${mediaId}/insights?metric=${metrics}&access_token=${encodeURIComponent(accessToken)}`;
  const data = await igFetch<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(url);
  const byName = new Map(data.data.map((m) => [m.name, m.values[0]?.value ?? null]));
  return {
    reach: byName.get("reach") ?? null,
    saved: byName.get("saved") ?? null,
    shares: byName.get("shares") ?? null,
    likes: byName.get("likes") ?? null,
    comments: byName.get("comments") ?? null,
  };
}
