// ============================================================
// LAYOUT D — POP CREATOR (Fase 3).
//
// Preset de LAYOUT (tipografia + posicionamento), ortogonal ao preset
// de cores/identidade da marca — mesmas cores/handle/wordmark do
// CardBrand, mesmo motor de contraste, chip e trilha de ícones dos
// demais layouts. Estilo criador de conteúdo: fonte arredondada
// (Varela Round), pílulas/badges arredondados em vez de retângulos
// retos, forma decorativa (blob) atrás da headline, energia — ao
// contrário do Brutalismo (reto/grosso) e do Serif Luxe (contido).
//
// Mesmo contrato {svg, blurBandTop} de buildCoverSvg/buildCardSvg —
// drop-in compatível no seletor de layout.
// ============================================================
import { buildOverlayGradientSvg } from "@/lib/contrast";
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "Varela Round";
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
  if (n <= 30) return { size: 100, lineH: 98, maxChars: 14 };
  if (n <= 60) return { size: 76, lineH: 76, maxChars: 19 };
  return { size: 58, lineH: 60, maxChars: 25 };
}

/** Corpo do card interior escala junto com o título (mesmo critério da
 * capa) — título curto e gigante pede um corpo maior também; título
 * mais longo (fonte menor) usa um corpo mais discreto. */
function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 100) return { size: 46, lineH: 62, maxChars: 30 };
  if (headSize >= 76) return { size: 38, lineH: 52, maxChars: 34 };
  return { size: 32, lineH: 44, maxChars: 38 };
}

/** Largura aproximada de um texto em px, pra dimensionar a pílula do rótulo (fonte arredondada é bem larga). */
function approxTextWidth(s: string, fontSize: number): number {
  return s.length * fontSize * 0.62;
}

export interface PopCreatorCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface PopCreatorCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  /** Placa por trás do @handle do topo-DIREITO — o eyebrow esquerdo já
   * tem sua própria pílula de acento (protegida por natureza); só o
   * texto solto da direita fica exposto direto na foto. alpha=0 não
   * desenha nada (checagem de contraste local feita pelo chamador). */
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
 * Capa ou fechamento do layout Pop Creator: pílula de rótulo no topo
 * (fundo de acento, cantos 100% arredondados), blob decorativo atrás
 * do bloco de texto, headline arredondada grande ancorada no rodapé,
 * subtítulo em pílula outline. Fechamento: mesmo bloco sem "deslize",
 * chip (esquerda) + ícones (direita) nos cantos inferiores.
 */
export function buildPopCreatorCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: PopCreatorCoverOptions = {}
): PopCreatorCoverRender {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#FF5C7A";
  const text = brand.colorText || "#FFFFFF";
  const pad = 64;
  const showSwipeHint = opts.showSwipeHint !== false;
  // A cápsula do rótulo é pintada com a cor do WORDMARK (043+046):
  // rótulo e marca são a mesma camada de identidade da peça. O blob
  // decorativo continua no realce do kit — ele é fundo, não marca.
  const markColor = brand.markColor || accent;
  const eyebrow = (opts.eyebrow ?? "Nº 01").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toUpperCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 40).slice(0, 2) : [];

  let cursor = showSwipeHint ? CARD_H - 120 : CARD_H - 240;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 46 : 0;
  }
  // Varela Round tem descendentes generosos (p/g/j) — gap maior que os
  // outros layouts pra não colidir com o subtítulo (bug visto ao vivo).
  const headLastY = subY != null ? cursor - 66 : cursor;
  const headStartY = headLastY - (lines.length - 1) * lineH;

  // Pílula do eyebrow (fundo de acento, texto escuro pra contraste — o
  // acento normalmente é vivo/claro nesse estilo).
  const pillW = approxTextWidth(eyebrow, 22) + 44;
  const pillH = 44;
  const pillY = 56;
  // Placa por trás do @handle direito — só aparece quando o contraste
  // LOCAL (medido pelo chamador nessa região específica) não é suficiente.
  const rightW = approxTextWidth(eyebrowRight, 22) + 28;
  const topOverlay = opts.topOverlay;
  const rightPlate =
    transparent && topOverlay && topOverlay.alpha > 0
      ? `<rect x="${CARD_W - pad - rightW}" y="${pillY}" width="${rightW}" height="${pillH}" rx="${pillH / 2}" fill="${topOverlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${topOverlay.alpha}"/>`
      : "";

  const eyebrowPill = `<rect x="${pad}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${markColor}"/>
  <text x="${pad + pillW / 2}" y="${pillY + pillH / 2 + 7}" font-family="${MONO_FONT}" font-weight="700" font-size="20" letter-spacing="1" fill="#0A0A0A" text-anchor="middle">${escapeXml(eyebrow)}</text>
  ${rightPlate}
  <text x="${CARD_W - pad}" y="${pillY + pillH / 2 + 7}" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1" fill="${text}" fill-opacity="0.85" text-anchor="end">${escapeXml(eyebrowRight)}</text>`;

  // Blob decorativo — círculo suave atrás do bloco de texto, saindo da borda.
  const blobCx = CARD_W - 90;
  const blobCy = headStartY - size * 0.4;
  const blob = `<circle cx="${blobCx}" cy="${blobCy}" r="230" fill="${accent}" fill-opacity="0.16"/>`;

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${size}" fill="${text}" text-anchor="start">${tspans(lines, pad, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length
    ? bodyLines
    : showSwipeHint
      ? ["Deslize para ver mais →"]
      : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${DISPLAY_FONT}" font-weight="400" font-size="28" fill="${accent}">${tspans(subLine, pad, subY, 40)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint);
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  const blurBandTop = Math.max(0, Math.round(headStartY - size * 0.95 - 30));
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${blob}
  ${eyebrowPill}
  ${headlineSvg}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface PopCreatorCardOptions {
  index: number;
  total: number;
}

/**
 * Card interior do layout Pop Creator: pílula de índice no topo (fundo
 * de acento), headline arredondada abaixo, corpo na fonte da marca,
 * rodapé mono com assinatura + página.
 */
export function buildPopCreatorCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: PopCreatorCardOptions,
  transparent = false,
  overlay?: { theme: "light" | "dark"; alpha: number }
): string {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#FF5C7A";
  const text = brand.colorText || "#FFFFFF";
  const bodyFont = brand.fontFamily || "Inter";
  const pad = 64;

  const headlineText = stripEmoji(headline);
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = displaySize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 3);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = bodySizeFor(headSize);
  const bodyLines = body ? wrapText(stripEmoji(body), bodyMaxChars).slice(0, 5) : [];

  const idxLabel = String(opts.index).padStart(2, "0");
  const pillW = approxTextWidth(idxLabel, 22) + 44;
  const pillY = 130;
  const pillH = 44;
  const headStartY = pillY + pillH + 96;

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
  <rect x="${pad}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${accent}"/>
  <text x="${pad + pillW / 2}" y="${pillY + pillH / 2 + 7}" font-family="${MONO_FONT}" font-weight="700" font-size="20" letter-spacing="1" fill="#0A0A0A" text-anchor="middle">${idxLabel}</text>
  <text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${headSize}" fill="${text}" text-anchor="start">${tspans(headlineLines, pad, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.85" text-anchor="start">${tspans(bodyLines, pad, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.6), bodyLineH)}</text>`
      : ""
  }
  <text x="${pad}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="400" font-size="22" letter-spacing="1" fill="${text}" fill-opacity="0.8">${escapeXml(signature.toUpperCase())}</text>
  <text x="${CARD_W - pad}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="700" font-size="22" letter-spacing="1" fill="${accent}" text-anchor="end">${idxLabel}/${String(opts.total).padStart(2, "0")}</text>
</svg>`;
}
