// ============================================================
// Render de um card de carrossel: monta um SVG 1080x1350 com o Brand
// Kit (cores + fonte) e o texto do card, rasteriza em PNG (resvg, via
// svg-render) e sobe no Storage. O builder do SVG é puro e testável;
// a rasterização/upload usa infra nativa (não roda em unit test).
// ============================================================
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { rasterizeSvg } from "@/lib/svg-render";
import type { CarouselCard } from "@/lib/ai/carousel";
import type { BrandMark } from "@/lib/types";

export const CARD_W = 1080;
export const CARD_H = 1350;

/** Cores + fonte do card, tirados do brand_kit do cliente. */
export interface CardBrand {
  colorBackground: string;
  colorAccent: string;
  colorText: string;
  fontFamily: string; // família já resolvida (ver resolvePostFontFamily)
  brandName: string | null;
  // Identidade de rótulo @0verlens (Sprint B+, opcional).
  wordmark?: string | null; // divisor da capa
  handle?: string | null; // @ do perfil
  keywords?: string[] | null; // rótulo dos cards
  brandMark?: BrandMark; // tratamento de marca dos cards interiores
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quebra texto em linhas por número máximo de caracteres (greedy por palavra). */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length === 0) {
      line = w;
    } else if ((line + " " + w).length <= maxChars) {
      line += " " + w;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines: string[], x: number, startY: number, lineH: number): string {
  return lines
    .map(
      (l, i) =>
        `<tspan x="${x}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`
    )
    .join("");
}

/** Rótulo de marca dos cards interiores, conforme brandMark. null = sem rótulo. */
export function brandLabelText(brand: CardBrand): string | null {
  const bm = brand.brandMark ?? "auto";
  if (bm === "none" || bm === "icon") return null;
  const handle = brand.handle ? `@${brand.handle}` : null;
  const wm = brand.wordmark ? brand.wordmark.toUpperCase() : null;
  const kws =
    brand.keywords && brand.keywords.length
      ? brand.keywords.join(", ").toUpperCase()
      : null;
  const parts: string[] = [];
  if (bm === "wordmark" || bm === "wordmark+handle") {
    if (wm) parts.push(wm);
  }
  if (bm === "handle" || bm === "wordmark+handle" || bm === "auto") {
    if (handle) parts.push(handle);
  }
  if (bm === "auto") {
    if (kws) parts.push(kws);
  }
  return parts.length ? parts.join("  ·  ") : null;
}

/** Tamanho de fonte da headline da capa por comprimento (auto-fit simples). */
function coverHeadlineSize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 36) return { size: 94, lineH: 104, maxChars: 15 };
  if (n <= 64) return { size: 76, lineH: 86, maxChars: 19 };
  return { size: 60, lineH: 70, maxChars: 25 };
}

/**
 * SVG da CAPA (card 0 / imagem única) no estilo @0verlens: divisor com
 * o WORDMARK (———— WORDMARK ————) no topo do bloco + headline grande
 * centralizada (auto-fit, máx ~5 linhas). Fundo sólido da marca.
 */
export function buildCoverSvg(card: CarouselCard, brand: CardBrand, transparent = false): string {
  const family = brand.fontFamily || "Inter";
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#7C5CFF";
  const text = brand.colorText || "#FFFFFF";
  const pad = 90;
  const cx = CARD_W / 2;

  const wm = (brand.wordmark || brand.brandName || "").toUpperCase();
  const { size, lineH, maxChars } = coverHeadlineSize(card.headline ?? "");
  const lines = wrapText(card.headline ?? "", maxChars).slice(0, 5);

  // Divisor NO TOPO; réguas preenchem até as bordas (margem `pad`), com
  // folga pequena ao redor do wordmark centralizado.
  const dividerY = 300;
  const headStartY = dividerY + 150; // headline logo ABAIXO do divisor
  const halfText = wm ? (wm.length * 22) / 2 + 24 : 0;
  const divider = wm
    ? `<line x1="${pad}" y1="${dividerY}" x2="${cx - halfText}" y2="${dividerY}" stroke="${text}" stroke-opacity="0.4" stroke-width="1.5"/>
  <line x1="${cx + halfText}" y1="${dividerY}" x2="${CARD_W - pad}" y2="${dividerY}" stroke="${text}" stroke-opacity="0.4" stroke-width="1.5"/>
  <text x="${cx}" y="${dividerY + 8}" font-family="${family}" font-weight="600" font-size="26" letter-spacing="6" fill="${accent}" text-anchor="middle">${escapeXml(wm)}</text>`
    : "";

  // Com foto (transparent), um scrim vertical suave reforça a legibilidade
  // do texto sem tapar a foto inteira.
  const scrim = transparent
    ? `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.15"/>
      <stop offset="0.4" stop-color="#000" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.15"/>
    </linearGradient></defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#scrim)"/>`
    : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${scrim}
  <rect x="0" y="0" width="${CARD_W}" height="14" fill="${accent}"/>
  ${divider}
  <text font-family="${family}" font-weight="800" font-size="${size}" fill="${text}" text-anchor="middle" letter-spacing="-1">
    ${tspans(lines, cx, headStartY, lineH)}
  </text>
  <text x="${cx}" y="${CARD_H - 120}" font-family="${family}" font-weight="600" font-size="26" letter-spacing="4" fill="${text}" fill-opacity="0.75" text-anchor="middle">DESLIZE PARA VER →</text>
  <text x="${pad}" y="${CARD_H - 60}" font-family="${family}" font-weight="600" font-size="28" fill="${accent}">${escapeXml(brand.brandName || "PostPilot")}</text>
</svg>`;
}

/**
 * SVG do card (string). role define o layout: hook = headline grande
 * centralizado; cta = faixa de destaque; value = headline + body.
 */
export function buildCardSvg(card: CarouselCard, brand: CardBrand, transparent = false): string {
  const family = brand.fontFamily || "Inter";
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#7C5CFF";
  const text = brand.colorText || "#FFFFFF";
  const pad = 96;

  const headlineLines = wrapText(card.headline ?? "", 22);
  const bodyLines = card.body ? wrapText(card.body, 34) : [];

  const isHook = card.role === "hook";
  const isCta = card.role === "cta";
  const headSize = isHook ? 92 : 64;
  const headLineH = isHook ? 104 : 76;
  const headStartY = isHook ? 520 : 300;

  const footerLabel = brand.brandName
    ? escapeXml(brand.brandName)
    : "PostPilot";
  const label = brandLabelText(brand);

  const cardBg = transparent
    ? `<rect width="${CARD_W}" height="${CARD_H}" fill="#000" fill-opacity="0.42"/>`
    : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${cardBg}
  <rect x="0" y="0" width="${CARD_W}" height="14" fill="${accent}"/>
  ${label ? `<text x="${pad}" y="130" font-family="${family}" font-weight="600" font-size="24" letter-spacing="3" fill="${text}" fill-opacity="0.7">${escapeXml(label)}</text>` : ""}
  ${isCta ? `<rect x="${pad}" y="${headStartY - 120}" width="${CARD_W - pad * 2}" height="${headLineH * headlineLines.length + 80}" rx="28" fill="${accent}" opacity="0.16"/>` : ""}
  <text font-family="${family}" font-weight="700" font-size="${headSize}" fill="${text}" text-anchor="${isHook || isCta ? "middle" : "start"}">
    ${tspans(headlineLines, isHook || isCta ? CARD_W / 2 : pad, headStartY, headLineH)}
  </text>
  ${
    bodyLines.length
      ? `<text font-family="${family}" font-weight="400" font-size="40" fill="${text}" opacity="0.82" text-anchor="${isCta ? "middle" : "start"}">
    ${tspans(bodyLines, isCta ? CARD_W / 2 : pad, headStartY + headLineH * headlineLines.length + 60, 56)}
  </text>`
      : ""
  }
  <text x="${pad}" y="${CARD_H - 70}" font-family="${family}" font-weight="600" font-size="30" fill="${accent}">${footerLabel}</text>
  <text x="${CARD_W - pad}" y="${CARD_H - 70}" font-family="${family}" font-weight="400" font-size="30" fill="${text}" opacity="0.5" text-anchor="end">${card.idx + 1}</text>
</svg>`;
}

/**
 * Rasteriza o card e sobe no bucket post-images. Retorna a URL pública.
 * Usa service role (job) — não roda em unit test.
 */
/** Compõe o card sobre uma FOTO: resize + blur + escurece; texto por cima. */
async function composePhotoBg(photo: Buffer, svg: string): Promise<Buffer> {
  const base = await sharp(photo)
    .resize(CARD_W, CARD_H, { fit: "cover", position: "attention" })
    .blur(8) // blur real do fundo (o texto fica nítido por cima)
    .modulate({ brightness: 0.55 }) // escurece p/ o texto branco ficar legível
    .toBuffer();
  const overlay = rasterizeSvg(svg); // PNG transparente (scrim + texto)
  return sharp(base)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

export async function renderAndUploadCard(
  postId: string,
  card: CarouselCard,
  brand: CardBrand,
  isCover = false,
  bgImage: Buffer | null = null
): Promise<string> {
  let png: Buffer;
  if (bgImage) {
    // Foto de fundo: texto branco sobre foto borrada/escurecida (@0verlens).
    const onPhoto: CardBrand = { ...brand, colorText: "#FFFFFF" };
    const svg = isCover ? buildCoverSvg(card, onPhoto, true) : buildCardSvg(card, onPhoto, true);
    png = await composePhotoBg(bgImage, svg);
  } else {
    const svg = isCover ? buildCoverSvg(card, brand) : buildCardSvg(card, brand);
    png = rasterizeSvg(svg);
  }
  const supabase = createAdminClient();
  const path = `${postId}-card-${card.idx}.png`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload do card falhou: ${error.message}`);
  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
