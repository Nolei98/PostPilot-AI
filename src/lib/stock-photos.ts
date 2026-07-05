// ============================================================
// Fotos reais de banco (Pexels principal, Unsplash fallback) —
// substitui a geração de rostos por IA (que erra em close-up:
// olhos, mãos, dentes, orelhas) por fotos de pessoas de verdade.
// A IA (Pollinations) só entra como último recurso, para
// ilustrações SEM pessoas.
// ============================================================

export type StockPhoto = {
  /** Prefixado com o provider (ex: "pexels:123") — usado pra dedup */
  id: string;
  provider: "pexels" | "unsplash";
  url: string;
  credit: string;
  /** Endpoint de tracking do Unsplash (ver guideline de API deles) */
  downloadLocation?: string;
};

/**
 * Extrai a CENA principal do image_prompt pra usar como busca —
 * nunca a frase toda. O wrapper de realismo em generate.ts/image.ts
 * sempre põe o assunto/cena primeiro e os termos técnicos (câmera,
 * lente, grão) depois da primeira vírgula, então o primeiro segmento
 * já é a query ideal (pessoa + ação + ambiente, em inglês).
 */
export function toVisualKeywords(imagePrompt: string): string {
  return imagePrompt.split(",")[0].trim();
}

async function searchPexels(
  query: string,
  excludeIds: Set<string>
): Promise<StockPhoto | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    query,
    orientation: "portrait",
    per_page: "15",
  });
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    console.warn(`[stock-photos] Pexels respondeu ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    photos?: {
      id: number;
      src: { large2x: string; original: string };
      photographer: string;
    }[];
  };

  const candidate = (data.photos ?? []).find(
    (p) => !excludeIds.has(`pexels:${p.id}`)
  );
  if (!candidate) return null;

  return {
    id: `pexels:${candidate.id}`,
    provider: "pexels",
    url: candidate.src.large2x || candidate.src.original,
    credit: `Foto: ${candidate.photographer} (Pexels)`,
  };
}

async function searchUnsplash(
  query: string,
  excludeIds: Set<string>
): Promise<StockPhoto | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  const params = new URLSearchParams({
    query,
    orientation: "portrait",
    per_page: "15",
  });
  const res = await fetch(
    `https://api.unsplash.com/search/photos?${params}`,
    { headers: { Authorization: `Client-ID ${accessKey}` } }
  );
  if (!res.ok) {
    console.warn(`[stock-photos] Unsplash respondeu ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    results?: {
      id: string;
      urls: { regular: string };
      user: { name: string };
      links: { download_location: string };
    }[];
  };

  const candidate = (data.results ?? []).find(
    (p) => !excludeIds.has(`unsplash:${p.id}`)
  );
  if (!candidate) return null;

  return {
    id: `unsplash:${candidate.id}`,
    provider: "unsplash",
    url: candidate.urls.regular,
    credit: `Foto: ${candidate.user.name} / Unsplash`,
    downloadLocation: candidate.links.download_location,
  };
}

/**
 * Busca a melhor foto real disponível pro tema do post: Pexels
 * primeiro (sem exigência de atribuição), Unsplash como fallback.
 * `excludeIds` evita repetir a mesma foto entre posts do usuário.
 * Retorna null se nenhum provider tiver key ou achar resultado —
 * quem chama cai pra IA (só ilustração, sem pessoas).
 */
export async function searchStockPhoto(
  imagePrompt: string,
  excludeIds: Set<string> = new Set()
): Promise<StockPhoto | null> {
  const query = toVisualKeywords(imagePrompt);
  const pexels = await searchPexels(query, excludeIds);
  if (pexels) return pexels;
  return searchUnsplash(query, excludeIds);
}

/** Baixa o arquivo da foto escolhida. */
export async function fetchStockPhotoBuffer(photo: StockPhoto): Promise<Buffer> {
  const res = await fetch(photo.url);
  if (!res.ok) throw new Error(`Falha ao baixar foto do banco: ${res.status}`);
  // Unsplash exige avisar o uso via este endpoint (guideline de API deles)
  // — best-effort, não bloqueia o fluxo se falhar.
  if (photo.downloadLocation) {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    fetch(photo.downloadLocation, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    }).catch(() => {});
  }
  return Buffer.from(await res.arrayBuffer());
}
