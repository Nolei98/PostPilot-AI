// ============================================================
// LAYOUT B — SERIF LUXE (Fase 3).
//
// Preset de LAYOUT (tipografia + posicionamento), ortogonal ao preset
// de cores/identidade da marca — mesmas cores/handle/wordmark do
// CardBrand, mesmo motor de contraste, chip e trilha de ícones dos
// demais layouts. Muda a fonte (DM Serif Display + IBM Plex Mono) e a
// estrutura: centralizado, régua fina, muito espaço em branco —
// editorial de revista de luxo, ao contrário do Brutalismo (ancorado
// nos cantos, grosso, alinhado à esquerda).
//
// Mesmo contrato {svg, blurBandTop} de buildCoverSvg/buildCardSvg —
// drop-in compatível no seletor de layout.
// ============================================================
import { buildOverlayGradientSvg } from "@/lib/contrast";
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "DM Serif Display";
const MONO_FONT = "IBM Plex Mono";

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

/** Tamanho da display (serif) por comprimento — mais contido que o
 * Brutalismo: luxo é sobre respiro, não sobre gritar. */
function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 30) return { size: 96, lineH: 104, maxChars: 16 };
  if (n <= 60) return { size: 74, lineH: 82, maxChars: 22 };
  return { size: 58, lineH: 66, maxChars: 28 };
}

/** Corpo do card INTERIOR escala junto com o título — mesmo critério do
 * Pop Creator/Brutalismo. */
function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 96) return { size: 46, lineH: 62, maxChars: 28 };
  if (headSize >= 74) return { size: 40, lineH: 54, maxChars: 32 };
  return { size: 34, lineH: 46, maxChars: 38 };
}

export interface SerifLuxeCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface SerifLuxeCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  eyebrow?: string;
  eyebrowRight?: string | null;
  /** Força mostrar/esconder a trilha de ícones, sobrepondo a heurística
   * padrão (overlay presente + sem swipe hint = fechamento). Necessário
   * pra página 1 do post único, que também não tem swipe hint mas
   * também não é fechamento (sem ícones, sem chip). */
  showActionIcons?: boolean;
}

/**
 * Capa ou fechamento do layout Serif Luxe: réguas finas encaixando a
 * meta-linha no topo, bloco central-inferior centralizado — display
 * serif elegante, régua fina de acento abaixo do texto (não acima,
 * como no Brutalismo), subtítulo mono discreto. Fechamento: mesmo
 * bloco sem "deslize", chip (esquerda) + ícones (direita) nos cantos.
 */
export function buildSerifLuxeCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: SerifLuxeCoverOptions = {}
): SerifLuxeCoverRender {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#C9A24B";
  const text = brand.colorText || "#FFFFFF";
  const cx = CARD_W / 2;
  const showSwipeHint = opts.showSwipeHint !== false;
  const eyebrow = (opts.eyebrow ?? "Nº01 · Ensaio").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toUpperCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 42).slice(0, 2) : [];

  // Bloco centralizado, ancorado perto do rodapé — mais espaço
  // reservado no fechamento (chip + ícones nos cantos).
  let cursor = showSwipeHint ? CARD_H - 130 : CARD_H - 250;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 44 : 0;
  }
  const ruleY = cursor - 34;
  const headLastY = ruleY - 46;
  const headStartY = headLastY - (lines.length - 1) * lineH;

  const topRow = `<line x1="${64}" y1="86" x2="${CARD_W - 64}" y2="86" stroke="${text}" stroke-opacity="0.25" stroke-width="1"/>
  <text x="${64}" y="66" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="2" fill="${text}" fill-opacity="0.75">${escapeXml(eyebrow)}</text>
  <text x="${CARD_W - 64}" y="66" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="2" fill="${text}" fill-opacity="0.75" text-anchor="end">${escapeXml(eyebrowRight)}</text>`;

  const rule = `<line x1="${cx - 46}" y1="${ruleY}" x2="${cx + 46}" y2="${ruleY}" stroke="${accent}" stroke-width="2"/>`;

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${size}" fill="${text}" text-anchor="middle">${tspansCentered(lines, cx, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length
    ? bodyLines
    : showSwipeHint
      ? ["Deslize para conhecer"]
      : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1.5" fill="${text}" fill-opacity="0.75" text-anchor="middle">${tspansCentered(subLine, cx, subY, 36)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint);
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  const blurBandTop = Math.max(0, Math.round(headStartY - size * 0.9 - 40));
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${topRow}
  ${headlineSvg}
  ${rule}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface SerifLuxeCardOptions {
  index: number;
  total: number;
}

/**
 * Card interior do layout Serif Luxe: numeral discreto centralizado no
 * topo (serif, cor de acento), régua fina, headline serif centralizada,
 * corpo na fonte da marca, rodapé mono com assinatura + página.
 */
export function buildSerifLuxeCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: SerifLuxeCardOptions,
  transparent = false,
  overlay?: { theme: "light" | "dark"; alpha: number }
): string {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#C9A24B";
  const text = brand.colorText || "#FFFFFF";
  const bodyFont = brand.fontFamily || "Inter";
  const cx = CARD_W / 2;

  const headlineText = stripEmoji(headline);
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = displaySize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 3);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = bodySizeFor(headSize);
  const bodyLines = body ? wrapText(stripEmoji(body), bodyMaxChars).slice(0, 5) : [];

  const idxY = 200;
  const ruleY = idxY + 40;
  const headStartY = ruleY + Math.round(headSize * 1.15);

  const signature = brand.handle
    ? `@${brand.handle}${brand.keywords?.length ? " · " + brand.keywords.join(", ") : ""}`
    : brand.keywords?.length
      ? brand.keywords.join(", ")
      : "";

  const cardBg =
    transparent && overlay && overlay.alpha > 0
      ? `<rect width="${CARD_W}" height="${CARD_H}" fill="${overlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${overlay.alpha}"/>`
      : transparent
        ? ""
        : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${cardBg}
  <text x="${cx}" y="${idxY}" font-family="${DISPLAY_FONT}" font-weight="400" font-size="44" fill="${accent}" text-anchor="middle">${String(opts.index).padStart(2, "0")}</text>
  <line x1="${cx - 30}" y1="${ruleY}" x2="${cx + 30}" y2="${ruleY}" stroke="${accent}" stroke-width="2"/>
  <text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${headSize}" fill="${text}" text-anchor="middle">${tspansCentered(headlineLines, cx, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.85" text-anchor="middle">${tspansCentered(bodyLines, cx, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.6), bodyLineH)}</text>`
      : ""
  }
  <text x="${64}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1.5" fill="${text}" fill-opacity="0.7">${escapeXml(signature.toUpperCase())}</text>
  <text x="${CARD_W - 64}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1.5" fill="${accent}" text-anchor="end">${String(opts.index).padStart(2, "0")}/${String(opts.total).padStart(2, "0")}</text>
</svg>`;
}
