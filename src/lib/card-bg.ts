// ============================================================
// Fundo de imagem dos cards de carrossel (Sprint B+). A CAPA sempre tem
// imagem: notícia → banco (Pexels/Unsplash) → Pollinations (geração
// grátis, sempre funciona). Cards internos tentam o banco (opcional) —
// se não achar, fundo sólido da marca.
//
// No futuro o provider de imagem será configurável (o usuário decidirá);
// por ora a cadeia acima é o padrão.
// ============================================================
import { searchStockPhoto, fetchStockPhotoBuffer } from "@/lib/stock-photos";

/** niche → query visual (inglês) para o banco de fotos/vídeos (reusado
 * pelo b-roll de vídeo em video-assembly.ts). */
export const NICHE_QUERY: Record<string, string> = {
  tecnologia: "technology abstract dark",
  marketing: "marketing business office",
  financas: "finance money city skyline",
  saude: "health wellness lifestyle",
  games: "gaming neon setup",
};
export function nicheQuery(niche: string | null | undefined): string {
  return NICHE_QUERY[niche ?? ""] ?? "abstract dark texture";
}

function pollinationsUrl(prompt: string): string {
  const p = `${prompt}, cinematic editorial photo, dark, moody, high detail, no text`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1080&height=1350&nologo=true`;
}

export interface CardBg {
  url: string;
  buffer: Buffer;
}

async function bufferFromUrl(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
  } catch {
    /* ignora — cai pro próximo */
  }
  return null;
}

/**
 * Resolve o fundo de um card. `newsImageUrl` só na capa. `allowGen`
 * liga o Pollinations (geração) — use na capa (garante imagem). Retorna
 * { url, buffer } ou null (fundo sólido).
 */
export async function getCardBg(opts: {
  newsImageUrl?: string | null;
  niche?: string | null;
  headline?: string;
  excludeIds?: Set<string>;
  allowGen?: boolean;
}): Promise<CardBg | null> {
  // 1. Imagem da notícia (capa).
  if (opts.newsImageUrl) {
    const buf = await bufferFromUrl(opts.newsImageUrl);
    if (buf) return { url: opts.newsImageUrl, buffer: buf };
  }

  // 2. Banco (Pexels → Unsplash). Query por nicho; excludeIds varia entre cards.
  try {
    const photo = await searchStockPhoto(nicheQuery(opts.niche), opts.excludeIds ?? new Set());
    if (photo) {
      const buf = await fetchStockPhotoBuffer(photo);
      opts.excludeIds?.add(photo.id);
      return { url: photo.url, buffer: buf };
    }
  } catch {
    /* sem key/erro → cai pro pollinations */
  }

  // 3. Pollinations (geração grátis) — só quando permitido (capa).
  if (opts.allowGen) {
    const url = pollinationsUrl(opts.headline || nicheQuery(opts.niche));
    const buf = await bufferFromUrl(url);
    if (buf) return { url, buffer: buf };
  }

  return null;
}
