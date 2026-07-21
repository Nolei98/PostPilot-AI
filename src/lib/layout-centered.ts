// ============================================================
// VARIAÇÃO "FONTE NO MEIO" — página 1 do post único (kit v2 §3).
//
// Minimalista de propósito: frase curta centralizada no meio do quadro,
// SEM wordmark/brandline, sem chip, sem ícones — a foto respira, o
// Instagram já mostra o perfil por cima do post. Ortogonal ao
// layoutPreset: usa a MESMA tipografia de destaque de cada um dos 5
// layouts (Anton no Brutalismo, DM Serif Display no Serif Luxe etc.) —
// só a ESTRUTURA muda (centralizado, sem topo/rodapé), a identidade
// tipográfica continua a mesma.
//
// Mesmo contrato {svg, blurBandTop} dos demais builders de capa —
// drop-in compatível no dispatcher de image.ts (buildPageOneCoverSvg).
// ============================================================
import { CARD_W, CARD_H, type CardBrand } from "@/lib/render-shared";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length === 0) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspansCentered(lines: string[], cx: number, startY: number, lineH: number): string {
  return lines
    .map((l, i) => `<tspan x="${cx}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`)
    .join("");
}

/** Fonte de destaque de cada layout — a MESMA usada na headline da capa/
 * interior daquele preset (identidade tipográfica não muda; só a
 * estrutura desta variação é diferente). */
function displayFontFor(brand: CardBrand): { family: string; weight: number } {
  switch (brand.layoutPreset) {
    case "brutalism":
      return { family: "Anton", weight: 400 };
    case "serif-luxe":
      return { family: "DM Serif Display", weight: 400 };
    case "swiss-mono":
      return { family: "Inter", weight: 800 };
    case "pop-creator":
      return { family: "Varela Round", weight: 400 };
    default:
      return { family: brand.fontFamily || "Inter", weight: 800 };
  }
}

function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 30) return { size: 90, lineH: 100, maxChars: 16 };
  if (n <= 60) return { size: 68, lineH: 78, maxChars: 22 };
  return { size: 52, lineH: 62, maxChars: 28 };
}

export interface CenteredPhraseRender {
  svg: string;
  blurBandTop: number;
}

export interface CenteredPhraseOptions {
  overlay?: { theme: "light" | "dark"; alpha: number };
}

/**
 * Frase curta centralizada no meio do quadro — sem wordmark, sem chip,
 * sem ícones. `blurBandTop` cobre uma faixa em torno do bloco de texto
 * (mesmo contrato dos demais builders — composePhotoBg desfoca dali até
 * o rodapé; aqui isso só cobre a metade inferior do quadro, sem
 * problema, já que o texto está centralizado nela).
 */
export function buildCenteredPhraseSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: CenteredPhraseOptions = {}
): CenteredPhraseRender {
  const bg = brand.colorBackground || "#0B0B12";
  const text = brand.colorText || "#FFFFFF";
  const { family, weight } = displayFontFor(brand);
  const cx = CARD_W / 2;
  const cy = CARD_H / 2;

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);

  const totalH = (lines.length - 1) * lineH;
  const startY = Math.round(cy - totalH / 2 + size * 0.35);

  const headlineSvg = `<text font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${text}" text-anchor="middle">${tspansCentered(lines, cx, startY, lineH)}</text>`;

  const blurBandTop = Math.max(0, Math.round(startY - size * 1.2));
  const overlay = opts.overlay;
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? `<rect x="0" y="${blurBandTop}" width="${CARD_W}" height="${CARD_H - blurBandTop}" fill="${overlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${overlay.alpha}"/>`
      : "";
  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${headlineSvg}
</svg>`;

  return { svg, blurBandTop };
}
