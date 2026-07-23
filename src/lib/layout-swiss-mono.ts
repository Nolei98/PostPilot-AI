// ============================================================
// LAYOUT C — SWISS MONO (Fase 3).
//
// Preset de LAYOUT (tipografia + posicionamento), ortogonal ao preset
// de cores/identidade da marca — mesmas cores/handle/wordmark do
// CardBrand, mesmo motor de contraste, chip e trilha de ícones dos
// demais layouts. Estilo tipográfico internacional (grid suíço):
// réguas finas dividindo zonas, legendas em mono, headline em sans
// grotesco bem grosso (Inter 800 — já embutida via POST_FONTS, não
// depende da fonte escolhida em Ajustes), alinhamento à esquerda com
// respiro generoso — mais contido que o Brutalismo, sem números
// gigantes nem cor de destaque em bloco.
//
// Mesmo contrato {svg, blurBandTop} de buildCoverSvg/buildCardSvg —
import { buildOverlayGradientSvg } from "@/lib/contrast";
// drop-in compatível no seletor de layout.
// ============================================================
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "Inter";
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

function tspans(lines: string[], x: number, startY: number, lineH: number): string {
  return lines.map((l, i) => `<tspan x="${x}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`).join("");
}

function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 30) return { size: 104, lineH: 100, maxChars: 15 };
  if (n <= 60) return { size: 78, lineH: 78, maxChars: 20 };
  return { size: 60, lineH: 60, maxChars: 26 };
}

/** Corpo do card INTERIOR escala junto com o título — mesmo critério dos
 * outros layouts alternativos. */
function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 104) return { size: 50, lineH: 66, maxChars: 28 };
  if (headSize >= 78) return { size: 42, lineH: 56, maxChars: 32 };
  return { size: 36, lineH: 48, maxChars: 38 };
}

export interface SwissMonoCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface SwissMonoCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  /** Placa por trás da meta-linha do TOPO — fora da banda de identidade
   * (rodapé), checagem de contraste local própria; alpha=0 não desenha nada. */
  topOverlay?: { theme: "light" | "dark"; alpha: number };
  eyebrow?: string;
  eyebrowRight?: string | null;
  /** Força mostrar/esconder a trilha de ícones, sobrepondo a heurística
   * padrão (overlay presente + sem swipe hint = fechamento). Necessário
   * pra página 1 do post único, que também não tem swipe hint mas
   * também não é fechamento (sem ícones, sem chip). */
  showActionIcons?: boolean;
}

/**
 * Capa ou fechamento do layout Swiss Mono: grade com régua fina no
 * topo, marcador quadrado de acento + legenda mono, bloco ancorado no
 * rodapé com headline sans grosso alinhado à esquerda, régua fina
 * abaixo separando o subtítulo mono. Fechamento: mesmo bloco sem
 * "deslize", chip (esquerda) + ícones (direita) nos cantos inferiores.
 */
export function buildSwissMonoCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: SwissMonoCoverOptions = {}
): SwissMonoCoverRender {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#E11D2A";
  const text = brand.colorText || "#FFFFFF";
  const pad = 64;
  const showSwipeHint = opts.showSwipeHint !== false;
  const eyebrow = (opts.eyebrow ?? "01 / ENSAIO").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toUpperCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 46).slice(0, 2) : [];

  let cursor = showSwipeHint ? CARD_H - 110 : CARD_H - 230;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 44 : 0;
  }
  const ruleY = cursor - 30;
  const headLastY = ruleY - 44;
  const headStartY = headLastY - (lines.length - 1) * lineH;

  const topRow = `<rect x="${pad}" y="66" width="14" height="14" fill="${accent}"/>
  <text x="${pad + 26}" y="78" font-family="${MONO_FONT}" font-weight="400" font-size="24" letter-spacing="1.5" fill="${text}" fill-opacity="0.85">${escapeXml(eyebrow)}</text>
  <text x="${CARD_W - pad}" y="78" font-family="${MONO_FONT}" font-weight="400" font-size="24" letter-spacing="1.5" fill="${text}" fill-opacity="0.85" text-anchor="end">${escapeXml(eyebrowRight)}</text>
  <line x1="${pad}" y1="100" x2="${CARD_W - pad}" y2="100" stroke="${text}" stroke-opacity="0.2" stroke-width="1"/>`;

  const rule = `<line x1="${pad}" y1="${ruleY}" x2="${CARD_W - pad}" y2="${ruleY}" stroke="${text}" stroke-opacity="0.2" stroke-width="1"/>`;

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="800" font-size="${size}" fill="${text}" text-anchor="start" letter-spacing="-1">${tspans(lines, pad, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length
    ? bodyLines
    : showSwipeHint
      ? ["Deslize para conhecer"]
      : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${MONO_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="${text}" fill-opacity="0.8">${tspans(subLine, pad, subY, 38)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint);
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  const blurBandTop = Math.max(0, Math.round(ruleY - 40));
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const topOverlay = opts.topOverlay;
  const topPlate =
    transparent && topOverlay && topOverlay.alpha > 0
      ? buildOverlayGradientSvg("top-band", 0, 115, CARD_W, topOverlay.theme, topOverlay.alpha, "top")
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${topPlate}
  ${topRow}
  ${headlineSvg}
  ${rule}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface SwissMonoCardOptions {
  index: number;
  total: number;
}

/**
 * Card interior do layout Swiss Mono: índice mono pequeno + régua fina
 * no topo, headline sans grosso abaixo, corpo na fonte da marca,
 * rodapé mono com assinatura + página.
 */
export function buildSwissMonoCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: SwissMonoCardOptions,
  transparent = false,
  overlay?: { theme: "light" | "dark"; alpha: number }
): string {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#E11D2A";
  const text = brand.colorText || "#FFFFFF";
  const bodyFont = brand.fontFamily || "Inter";
  const pad = 64;

  const headlineText = stripEmoji(headline);
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = displaySize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 3);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = bodySizeFor(headSize);
  const bodyLines = body ? wrapText(stripEmoji(body), bodyMaxChars).slice(0, 5) : [];

  const topY = 110;
  const headStartY = topY + Math.round(headSize * 1.05);

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
  <rect x="${pad}" y="${topY - 46}" width="14" height="14" fill="${accent}"/>
  <text x="${pad + 26}" y="${topY - 34}" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1.5" fill="${text}" fill-opacity="0.85">${String(opts.index).padStart(2, "0")} / ${String(opts.total).padStart(2, "0")}</text>
  <line x1="${pad}" y1="${topY - 10}" x2="${CARD_W - pad}" y2="${topY - 10}" stroke="${text}" stroke-opacity="0.2" stroke-width="1"/>
  <text font-family="${DISPLAY_FONT}" font-weight="800" font-size="${headSize}" fill="${text}" letter-spacing="-1" text-anchor="start">${tspans(headlineLines, pad, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.85" text-anchor="start">${tspans(bodyLines, pad, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.6), bodyLineH)}</text>`
      : ""
  }
  <text x="${pad}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1" fill="${text}" fill-opacity="0.8">${escapeXml(signature.toUpperCase())}</text>
  <text x="${CARD_W - pad}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="700" font-size="22" letter-spacing="1" fill="${accent}" text-anchor="end">${String(opts.index).padStart(2, "0")}/${String(opts.total).padStart(2, "0")}</text>
</svg>`;
}
