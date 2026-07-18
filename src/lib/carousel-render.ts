// ============================================================
// Render de um card de carrossel: monta um SVG 1080x1350 com o Brand
// Kit (cores + fonte) e o texto do card, rasteriza em PNG (resvg, via
// svg-render) e sobe no Storage. O builder do SVG é puro e testável;
// a rasterização/upload usa infra nativa (não roda em unit test).
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";
import { rasterizeSvg } from "@/lib/svg-render";
import type { CarouselCard } from "@/lib/ai/carousel";

export const CARD_W = 1080;
export const CARD_H = 1350;

/** Cores + fonte do card, tirados do brand_kit do cliente. */
export interface CardBrand {
  colorBackground: string;
  colorAccent: string;
  colorText: string;
  fontFamily: string; // família já resolvida (ver resolvePostFontFamily)
  brandName: string | null;
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

/**
 * SVG do card (string). role define o layout: hook = headline grande
 * centralizado; cta = faixa de destaque; value = headline + body.
 */
export function buildCardSvg(card: CarouselCard, brand: CardBrand): string {
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>
  <rect x="0" y="0" width="${CARD_W}" height="14" fill="${accent}"/>
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
export async function renderAndUploadCard(
  postId: string,
  card: CarouselCard,
  brand: CardBrand
): Promise<string> {
  const png = rasterizeSvg(buildCardSvg(card, brand));
  const supabase = createAdminClient();
  const path = `${postId}-card-${card.idx}.png`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload do card falhou: ${error.message}`);
  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
