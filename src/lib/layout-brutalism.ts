// ============================================================
// LAYOUT A — BRUTALISMO EDITORIAL (Fase 3, postpilot-layouts.html).
//
// Preset de LAYOUT (tipografia + posicionamento + estrutura), ortogonal
// ao preset de cores/identidade da marca — usa as MESMAS cores/handle/
// wordmark do CardBrand, o mesmo motor de contraste (contrast.ts), o
// mesmo chip (profile-chip.ts) e a mesma trilha de ícones
// (carousel-render.ts) do layout padrão (Editorial Noir); o que muda é
// a fonte (Anton condensada + IBM Plex Mono) e a estrutura (ancorado nos
// cantos, índices grandes, régua grossa, alinhado à esquerda).
//
// Mesmo contrato de {svg, blurBandTop} do buildCoverSvg/buildCardSvg
// padrão — drop-in compatível quando o seletor de layout for ligado.
// ============================================================
import { buildOverlayGradientSvg } from "@/lib/contrast";
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "Anton";
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

/** Tamanho da display (Anton) por comprimento — auto-fit simples, igual
 * ao padrão, mas em fonte condensada (cabe mais por linha no mesmo px).
 * lineH com folga extra (~1.23x o size, não os ~0.9x comuns) — os
 * acentos do Anton (ã/ç) são altos e colidem com a linha de cima em
 * folgas apertadas (bug visto ao vivo no card interior). */
function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 30) return { size: 130, lineH: 160, maxChars: 13 };
  if (n <= 60) return { size: 100, lineH: 123, maxChars: 17 };
  return { size: 76, lineH: 94, maxChars: 23 };
}

/** Corpo do card INTERIOR escala junto com o título — mesmo critério do
 * Pop Creator. */
function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 130) return { size: 56, lineH: 72, maxChars: 26 };
  if (headSize >= 100) return { size: 46, lineH: 60, maxChars: 30 };
  return { size: 38, lineH: 50, maxChars: 36 };
}

export interface BrutalismCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface BrutalismCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  /** Placa por trás da meta-linha do TOPO (eyebrow + @handle) — região
   * fora da banda de identidade (rodapé), então precisa da própria
   * checagem de contraste local; alpha=0 (padrão) não desenha nada. */
  topOverlay?: { theme: "light" | "dark"; alpha: number };
  /** Rótulo curto no topo-esquerdo (capa: "Nº01 — ENSAIO"; fechamento: "Nº01"). */
  eyebrow?: string;
  /** Palavra no topo-direito quando NÃO é a capa (fechamento usa "OBRIGADO" etc). */
  eyebrowRight?: string | null;
  /** Força mostrar/esconder a trilha de ícones, sobrepondo a heurística
   * padrão (overlay presente + sem swipe hint = fechamento). Necessário
   * pra página 1 do post único, que também não tem swipe hint mas
   * também não é fechamento (sem ícones, sem chip). */
  showActionIcons?: boolean;
}

/**
 * Capa ou fechamento do layout Brutalismo: meta-linha mono no topo
 * (índice/rótulo + @handle), bloco ancorado no RODAPÉ — régua grossa de
 * destaque, display Anton gigante alinhado à esquerda, subtítulo mono.
 * Fechamento usa o mesmo bloco, sem "deslize", com chip (esquerda) +
 * ícones (direita) nos cantos inferiores.
 */
export function buildBrutalismCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: BrutalismCoverOptions = {}
): BrutalismCoverRender {
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#E11D2A";
  const text = brand.colorText || "#FFFFFF";
  const pad = 64;
  const showSwipeHint = opts.showSwipeHint !== false;
  // Rótulo do topo segue a cor do WORDMARK (043+046): rótulo e marca
  // são a mesma camada de identidade da peça.
  const markColor = brand.markColor || accent;
  const eyebrow = (opts.eyebrow ?? "Nº01 — ENSAIO").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toUpperCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 46).slice(0, 2) : [];

  // Bloco ancorado no rodapé, montado de baixo pra cima: subtítulo/CTA →
  // display → régua grossa acima dele. No fechamento (sem swipe hint) o
  // chip + trilha de ícones ocupam o canto inferior — reserva mais
  // espaço embaixo pra não colidir com eles.
  let cursor = showSwipeHint ? CARD_H - 110 : CARD_H - 230;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 46 : 0;
  }
  const headLastY = subY != null ? cursor - 56 : cursor;
  const headStartY = headLastY - (lines.length - 1) * lineH;
  const ruleY = headStartY - size * 0.85 - 30;

  const topRow = `<text x="${pad}" y="98" font-family="${MONO_FONT}" font-weight="400" font-size="26" letter-spacing="1" fill="${markColor}" fill-opacity="0.9">${escapeXml(eyebrow)}</text>
  <text x="${CARD_W - pad}" y="98" font-family="${MONO_FONT}" font-weight="400" font-size="26" letter-spacing="1" fill="${text}" fill-opacity="0.9" text-anchor="end">${escapeXml(eyebrowRight)}</text>`;

  const rule = `<rect x="${pad}" y="${ruleY}" width="120" height="16" fill="${accent}"/>`;

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${size}" fill="${text}" text-anchor="start" letter-spacing="1">${tspans(lines, pad, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length
    ? bodyLines
    : showSwipeHint
      ? ["Deslize para conhecer"]
      : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${MONO_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="${text}" fill-opacity="0.85">${tspans(subLine, pad, subY, 40)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint); // fechamento
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  // sharp.extract() exige inteiro — ruleY pode sair fracionário (headline
  // gigante com size*0.85 não-inteiro na conta acima).
  const blurBandTop = Math.max(0, Math.round(ruleY - 40));
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  // Placa do topo (meta-linha) — gradiente sólido na BORDA do topo
  // (onde a meta-linha está grudada), some indo pra baixo — só aparece
  // quando o contraste LOCAL (medido pelo chamador em y=0..130) não é
  // suficiente.
  const topOverlay = opts.topOverlay;
  const topPlate =
    transparent && topOverlay && topOverlay.alpha > 0
      ? buildOverlayGradientSvg("top-band", 0, 130, CARD_W, topOverlay.theme, topOverlay.alpha, "top")
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${topPlate}
  ${topRow}
  ${rule}
  ${headlineSvg}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface BrutalismCardOptions {
  index: number; // número do card (1-based) — vira o índice grande
  total: number;
}

/**
 * Card interior do layout Brutalismo: índice grande (Anton, cor de
 * destaque) no topo, headline Anton abaixo, corpo na fonte da marca
 * (não é parte da identidade tipográfica do layout), rodapé mono com
 * assinatura + página.
 */
export function buildBrutalismCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: BrutalismCardOptions,
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

  const idxY = 260;
  // Gap proporcional ao tamanho do título — título "nível capa" (até
  // 130px) precisa de mais respiro abaixo do índice do que o antigo
  // tamanho fixo (80px) precisava.
  const headStartY = idxY + Math.round(headSize * 1.6);

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
  <text x="${pad}" y="${idxY}" font-family="${DISPLAY_FONT}" font-weight="400" font-size="150" fill="${accent}">${String(opts.index).padStart(2, "0")}</text>
  <text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${headSize}" fill="${text}" letter-spacing="0.5" text-anchor="start">${tspans(headlineLines, pad, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.85" text-anchor="start">${tspans(bodyLines, pad, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.6), bodyLineH)}</text>`
      : ""
  }
  <text x="${pad}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="${text}" fill-opacity="0.8">${escapeXml(signature.toUpperCase())}</text>
  <text x="${CARD_W - pad}" y="${CARD_H - 70}" font-family="${MONO_FONT}" font-weight="700" font-size="24" letter-spacing="1" fill="${accent}" text-anchor="end">${String(opts.index).padStart(2, "0")}/${String(opts.total).padStart(2, "0")}</text>
</svg>`;
}
