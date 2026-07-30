// ============================================================
// LAYOUT H — TRIBUNA (2026-07-29).
//
// Preset para ADVOCACIA (escritórios, advogados, conteúdo jurídico). O
// que o público associa a direito não é ornamento: é ORDEM. Margem de
// documento, régua dupla separando as seções, numeração de artigo,
// caixa alta com tracking largo. A peça tem que parecer redigida, não
// desenhada.
//
// Elementos:
//   · moldura fina por dentro da borda — a mancha de um documento;
//   · régua DUPLA (dois filetes) acima do título e no rodapé, o traço
//     de papelaria jurídica;
//   · rótulo "ART. 01" em mono, dentro de um retângulo de contorno RETO
//     (cantos vivos — arredondar aqui amoleceria o preset inteiro).
//
// Tipografia: DM Serif Display no título + IBM Plex Mono nos rótulos.
// A serifa é a mesma do Serif Luxe de propósito — o que separa os dois
// é a estrutura: lá é centralizado, contido, com muito ar; aqui é
// alinhado à esquerda, emoldurado e numerado.
//
// Mesmo contrato {svg, blurBandTop} dos demais layouts.
// ============================================================
import { buildOverlayGradientSvg } from "@/lib/contrast";
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "DM Serif Display";
const LABEL_FONT = "IBM Plex Mono";

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

/** Título jurídico costuma ser uma frase inteira ("O que muda no
 * contrato de aluguel em 2026"), como no preset de saúde — corpo mais
 * contido que o dos presets editoriais. */
function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 34) return { size: 90, lineH: 100, maxChars: 17 };
  if (n <= 66) return { size: 72, lineH: 84, maxChars: 22 };
  return { size: 58, lineH: 70, maxChars: 28 };
}

function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 90) return { size: 42, lineH: 58, maxChars: 32 };
  if (headSize >= 72) return { size: 36, lineH: 50, maxChars: 36 };
  return { size: 31, lineH: 44, maxChars: 42 };
}

const MARGEM = 84;
/** Distância da moldura à borda do quadro. */
const MOLDURA = 44;

/** Régua DUPLA — o traço de papelaria jurídica. */
function reguaDupla(x1: number, x2: number, y: number, cor: string, opacidade = 0.55): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${cor}" stroke-opacity="${opacidade}" stroke-width="3"/>
  <line x1="${x1}" y1="${y + 8}" x2="${x2}" y2="${y + 8}" stroke="${cor}" stroke-opacity="${opacidade * 0.7}" stroke-width="1.5"/>`;
}

/** Largura aproximada do texto em mono (0.6em por caractere + tracking). */
function approxMonoWidth(s: string, fontSize: number, letter: number): number {
  return s.length * (fontSize * 0.6 + letter);
}

/** Etiqueta de contorno RETO — cantos vivos por decisão de projeto. */
function etiqueta(x: number, y: number, texto: string, fontSize: number, cor: string): string {
  const letter = 2;
  const padX = 18;
  const h = fontSize + 20;
  const w = approxMonoWidth(texto, fontSize, letter) + padX * 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${cor}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + h / 2 + fontSize * 0.36}" font-family="${LABEL_FONT}" font-weight="500" font-size="${fontSize}" letter-spacing="${letter}" fill="${cor}" text-anchor="middle">${escapeXml(texto)}</text>`;
}

export interface TribunaCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface TribunaCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  topOverlay?: { theme: "light" | "dark"; alpha: number };
  eyebrow?: string;
  eyebrowRight?: string | null;
  showActionIcons?: boolean;
}

/**
 * Capa/fechamento: moldura de documento, rótulo em mono no topo com
 * régua dupla abaixo, título serif alinhado à esquerda no rodapé e
 * régua dupla separando marca e título.
 */
export function buildTribunaCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: TribunaCoverOptions = {}
): TribunaCoverRender {
  const bg = brand.colorBackground || "#0E1116";
  const accent = brand.colorAccent || "#C2A05A";
  const text = brand.colorText || "#FFFFFF";
  const markColor = brand.markColor || accent;
  const showSwipeHint = opts.showSwipeHint !== false;

  const eyebrow = (opts.eyebrow ?? "Direito na prática").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toUpperCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 44).slice(0, 2) : [];

  let cursor = showSwipeHint ? CARD_H - 152 : CARD_H - 250;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 46 : 0;
  }
  const headLastY = cursor - 76;
  const headStartY = headLastY - (lines.length - 1) * lineH;

  // Moldura do documento — some quando há foto (a borda brigaria com a
  // imagem e viraria moldura de porta-retrato).
  const moldura = transparent
    ? ""
    : `<rect x="${MOLDURA}" y="${MOLDURA}" width="${CARD_W - MOLDURA * 2}" height="${CARD_H - MOLDURA * 2}" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>`;

  const topoY = 118;
  const topo = `<text x="${MARGEM}" y="${topoY}" font-family="${LABEL_FONT}" font-weight="500" font-size="24" letter-spacing="4" fill="${markColor}">${escapeXml(eyebrow)}</text>
  ${
    eyebrowRight
      ? `<text x="${CARD_W - MARGEM}" y="${topoY}" font-family="${LABEL_FONT}" font-weight="400" font-size="22" letter-spacing="2" fill="${text}" fill-opacity="0.7" text-anchor="end">${escapeXml(eyebrowRight)}</text>`
      : ""
  }
  ${reguaDupla(MARGEM, CARD_W - MARGEM, topoY + 26, text, 0.3)}`;

  const reguaY = headStartY - Math.round(size * 0.95) - 40;
  const reguaTitulo = reguaDupla(MARGEM, MARGEM + 240, reguaY, accent, 0.85);

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${size}" fill="${text}" text-anchor="start">${tspans(lines, MARGEM, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length ? bodyLines : showSwipeHint ? ["Deslize para os pontos"] : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${LABEL_FONT}" font-weight="400" font-size="24" letter-spacing="2" fill="${text}" fill-opacity="0.75">${tspans(subLine, MARGEM, subY, 38)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint);
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  const blurBandTop = Math.max(0, reguaY - 40);
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";
  const topOverlay = opts.topOverlay;
  const topPlate =
    transparent && topOverlay && topOverlay.alpha > 0
      ? `<rect width="${CARD_W}" height="180" fill="${topOverlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${topOverlay.alpha}"/>`
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${moldura}
  ${topPlate}
  ${topo}
  ${reguaTitulo}
  ${headlineSvg}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface TribunaCardOptions {
  index: number;
  total: number;
}

/**
 * Card interior: etiqueta "ART. 0X" no topo, título serif à esquerda,
 * corpo e rodapé com régua dupla + assinatura.
 */
export function buildTribunaCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: TribunaCardOptions,
  transparent = false,
  overlay?: { theme: "light" | "dark"; alpha: number }
): string {
  const bg = brand.colorBackground || "#0E1116";
  const accent = brand.colorAccent || "#C2A05A";
  const text = brand.colorText || "#FFFFFF";
  const markColor = brand.markColor || accent;
  const bodyFont = brand.fontFamily || "Inter";

  const headlineText = stripEmoji(headline);
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = displaySize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 3);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = bodySizeFor(headSize);
  const bodyLines = body ? wrapText(stripEmoji(body), bodyMaxChars).slice(0, 5) : [];

  const artLabel = `ART. ${String(opts.index).padStart(2, "0")}`;
  const etiquetaY = 130;
  const headStartY = etiquetaY + 62 + 100;

  const signature = brand.handle
    ? `@${brand.handle}${brand.keywords?.length ? "  ·  " + brand.keywords.join(" · ") : ""}`
    : brand.keywords?.length
      ? brand.keywords.join(" · ")
      : "";

  const rodapeY = CARD_H - 104;
  const rodape = `${reguaDupla(MARGEM, CARD_W - MARGEM, rodapeY, markColor, 0.45)}
  <text x="${MARGEM}" y="${CARD_H - 44}" font-family="${LABEL_FONT}" font-weight="400" font-size="22" letter-spacing="2" fill="${text}" fill-opacity="0.72">${escapeXml(signature.toUpperCase())}</text>
  <text x="${CARD_W - MARGEM}" y="${CARD_H - 44}" font-family="${LABEL_FONT}" font-weight="500" font-size="22" letter-spacing="2" fill="${accent}" text-anchor="end">${String(opts.index).padStart(2, "0")}/${String(opts.total).padStart(2, "0")}</text>`;

  const moldura = transparent
    ? ""
    : `<rect x="${MOLDURA}" y="${MOLDURA}" width="${CARD_W - MOLDURA * 2}" height="${CARD_H - MOLDURA * 2}" fill="none" stroke="${accent}" stroke-opacity="0.28" stroke-width="2"/>`;

  const cardBg =
    transparent && overlay && overlay.alpha > 0
      ? `<rect width="${CARD_W}" height="${CARD_H}" fill="${overlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${overlay.alpha}"/>`
      : transparent
        ? ""
        : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${cardBg}
  ${moldura}
  ${etiqueta(MARGEM, etiquetaY, artLabel, 22, accent)}
  <text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${headSize}" fill="${text}" text-anchor="start">${tspans(headlineLines, MARGEM, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.82" text-anchor="start">${tspans(bodyLines, MARGEM, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.55), bodyLineH)}</text>`
      : ""
  }
  ${rodape}
</svg>`;
}
