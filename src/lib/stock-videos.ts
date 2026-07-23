// ============================================================
// B-roll real de banco (Pexels Video — grátis, mesma PEXELS_API_KEY já
// usada pras fotos em stock-photos.ts) — Sprint D, TAREFA D2. Evita
// vídeo 100% gerado por IA (caro/genérico) e slideshow puro.
// ============================================================

export type StockVideo = {
  /** Prefixado com o provider (ex: "pexels:123") — usado pra dedup */
  id: string;
  provider: "pexels";
  url: string;
  credit: string;
  width: number;
  height: number;
};

/** Escolhe o arquivo de vídeo mais próximo de 1080×1920 (retrato) —
 * quanto mais alto, melhor a qualidade final depois do crop/scale. */
function pickBestVideoFile(
  files: { link: string; width: number | null; height: number | null; quality: string }[]
): { link: string; width: number; height: number } | null {
  const portrait = files
    .filter((f) => f.width && f.height && f.height >= f.width)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  const best = portrait[0] ?? files.filter((f) => f.width && f.height).sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  if (!best?.width || !best?.height) return null;
  return { link: best.link, width: best.width, height: best.height };
}

/**
 * Busca um clipe de b-roll pro tema (query em inglês, mesma convenção
 * de toVisualKeywords em stock-photos.ts). `excludeIds` evita repetir
 * o mesmo clipe entre beats/posts. null = sem key ou sem resultado —
 * quem chama decide o fallback (pular b-roll daquele beat).
 */
export async function searchStockVideo(
  query: string,
  excludeIds: Set<string> = new Set()
): Promise<StockVideo | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({ query, orientation: "portrait", per_page: "15" });
  const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    console.warn(`[stock-videos] Pexels respondeu ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    videos?: {
      id: number;
      user: { name: string };
      video_files: { link: string; width: number | null; height: number | null; quality: string }[];
    }[];
  };

  const candidate = (data.videos ?? []).find((v) => !excludeIds.has(`pexels:${v.id}`));
  if (!candidate) return null;
  const file = pickBestVideoFile(candidate.video_files);
  if (!file) return null;

  return {
    id: `pexels:${candidate.id}`,
    provider: "pexels",
    url: file.link,
    credit: `Vídeo: ${candidate.user.name} (Pexels)`,
    width: file.width,
    height: file.height,
  };
}

/** Baixa o arquivo do clipe escolhido. */
export async function fetchStockVideoBuffer(video: StockVideo): Promise<Buffer> {
  const res = await fetch(video.url);
  if (!res.ok) throw new Error(`Falha ao baixar vídeo do banco: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
