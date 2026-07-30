// ============================================================
// LAYOUT G — CLÍNICA CLARA (2026-07-29).
//
// Preset para SAÚDE (clínicas, consultórios, profissionais de saúde).
// A intenção é o oposto da confeitaria: nada de decoração doce, nada de
// grito editorial. O que dá identidade aqui é o RESPIRO — margens
// largas, uma coluna só, hierarquia curta — mais três sinais discretos
// que o público associa a cuidado:
//   · a cruz fina no topo (símbolo, não logotipo);
//   · o traço de batimento (ECG) separando marca e título;
//   · a cápsula de contorno (o comprimido) nos rótulos e no número.
//
// Tipografia: Sora, a única das fontes embutidas que ainda não era
// tipografia de nenhum preset — geométrica e limpa, lê como material de
// clínica sem parecer aviso técnico (que é o que a mono do Swiss faria).
//
// Mesmo contrato {svg, blurBandTop} dos demais layouts.
// ============================================================
import { buildOverlayGradientSvg } from "@/lib/contrast";
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "Sora";
const LABEL_FONT = "Sora";

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

/** Corpo de texto menor que o dos outros presets: em saúde o título
 * costuma ser uma frase inteira ("O que fazer quando a pressão sobe"),
 * não um gancho de duas palavras — e frase comprida em corpo 104 vira
 * quatro linhas de grito. */
function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 34) return { size: 88, lineH: 98, maxChars: 17 };
  if (n <= 66) return { size: 70, lineH: 82, maxChars: 22 };
  return { size: 56, lineH: 68, maxChars: 28 };
}

function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 88) return { size: 42, lineH: 58, maxChars: 32 };
  if (headSize >= 70) return { size: 36, lineH: 50, maxChars: 36 };
  return { size: 31, lineH: 44, maxChars: 42 };
}

/** Cruz de braços iguais, traço fino — símbolo de saúde sem virar
 * logotipo de farmácia (que seria sólido e vermelho). */
function crossSvg(cx: number, cy: number, arm: number, cor: string): string {
  return `<g stroke="${cor}" stroke-width="6" stroke-linecap="round">
    <line x1="${cx - arm}" y1="${cy}" x2="${cx + arm}" y2="${cy}"/>
    <line x1="${cx}" y1="${cy - arm}" x2="${cx}" y2="${cy + arm}"/>
  </g>`;
}

/** Traço de batimento: reta com um pico ao centro. Assinatura do preset
 * — aparece na capa (acima do título) e no rodapé do interior. */
function pulseLine(x1: number, x2: number, y: number, cor: string, opacidade = 0.8): string {
  const meio = (x1 + x2) / 2;
  return `<path d="M ${x1} ${y} L ${meio - 60} ${y} L ${meio - 34} ${y - 26} L ${meio - 8} ${y + 26} L ${meio + 18} ${y} L ${x2} ${y}" fill="none" stroke="${cor}" stroke-opacity="${opacidade}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
}

/** Largura aproximada do texto — Sora é levemente mais larga que Inter. */
function approxTextWidth(s: string, fontSize: number): number {
  return s.length * fontSize * 0.6;
}

/** Cápsula de CONTORNO (o comprimido): a marca gráfica dos rótulos.
 * Contorno, não preenchimento — preenchido viraria a pílula do Pop
 * Creator, e os dois presets ficariam parecidos de longe. */
function capsulaOutline(
  x: number,
  y: number,
  texto: string,
  fontSize: number,
  cor: string
): string {
  const padX = 20;
  const h = fontSize + 20;
  const w = approxTextWidth(texto, fontSize) + padX * 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="none" stroke="${cor}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${y + h / 2 + fontSize * 0.36}" font-family="${LABEL_FONT}" font-weight="600" font-size="${fontSize}" letter-spacing="2" fill="${cor}" text-anchor="middle">${escapeXml(texto)}</text>`;
}

export interface ClinicaClaraCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface ClinicaClaraCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  topOverlay?: { theme: "light" | "dark"; alpha: number };
  eyebrow?: string;
  eyebrowRight?: string | null;
  showActionIcons?: boolean;
}

/**
 * Capa/fechamento: cruz + cápsula de rótulo no topo, bloco de texto
 * alinhado à esquerda no rodapé, traço de batimento separando a marca do
 * título. Uma coluna, margens largas — a página inteira é respiro.
 */
export function buildClinicaClaraCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: ClinicaClaraCoverOptions = {}
): ClinicaClaraCoverRender {
  const bg = brand.colorBackground || "#0C1418";
  const accent = brand.colorAccent || "#3FBFA8";
  const text = brand.colorText || "#FFFFFF";
  const markColor = brand.markColor || accent;
  const pad = 88;
  const showSwipeHint = opts.showSwipeHint !== false;

  const eyebrow = (opts.eyebrow ?? "Saúde em dia").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toLowerCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 44).slice(0, 2) : [];

  let cursor = showSwipeHint ? CARD_H - 150 : CARD_H - 250;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 46 : 0;
  }
  const headLastY = cursor - 74;
  const headStartY = headLastY - (lines.length - 1) * lineH;

  // --- topo: cruz + cápsula + @ -------------------------------------
  const topoY = 78;
  const cruz = crossSvg(pad + 16, topoY + 16, 16, markColor);
  const capsula = capsulaOutline(pad + 58, topoY - 6, eyebrow, 22, markColor);
  const handleTopo = eyebrowRight
    ? `<text x="${CARD_W - pad}" y="${topoY + 24}" font-family="${LABEL_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="${text}" fill-opacity="0.7" text-anchor="end">${escapeXml(eyebrowRight)}</text>`
    : "";

  // Batimento logo acima do título — a assinatura do preset.
  const pulseY = headStartY - Math.round(size * 0.95) - 34;
  const batimento = pulseLine(pad, CARD_W - pad, pulseY, accent, 0.85);

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="600" font-size="${size}" fill="${text}" text-anchor="start">${tspans(lines, pad, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length ? bodyLines : showSwipeHint ? ["Deslize para entender"] : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${LABEL_FONT}" font-weight="400" font-size="27" fill="${text}" fill-opacity="0.78">${tspans(subLine, pad, subY, 40)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint);
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  const blurBandTop = Math.max(0, pulseY - 40);
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";
  const topOverlay = opts.topOverlay;
  const topPlate =
    transparent && topOverlay && topOverlay.alpha > 0
      ? `<rect width="${CARD_W}" height="170" fill="${topOverlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${topOverlay.alpha}"/>`
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${topPlate}
  ${cruz}
  ${capsula}
  ${handleTopo}
  ${batimento}
  ${headlineSvg}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface ClinicaClaraCardOptions {
  index: number;
  total: number;
}

/**
 * Card interior: cápsula com o número no topo, título e corpo alinhados
 * à esquerda, rodapé com traço de batimento + assinatura.
 */
export function buildClinicaClaraCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: ClinicaClaraCardOptions,
  transparent = false,
  overlay?: { theme: "light" | "dark"; alpha: number }
): string {
  const bg = brand.colorBackground || "#0C1418";
  const accent = brand.colorAccent || "#3FBFA8";
  const text = brand.colorText || "#FFFFFF";
  const markColor = brand.markColor || accent;
  const bodyFont = brand.fontFamily || "Inter";
  const pad = 88;

  const headlineText = stripEmoji(headline);
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = displaySize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 3);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = bodySizeFor(headSize);
  const bodyLines = body ? wrapText(stripEmoji(body), bodyMaxChars).slice(0, 5) : [];

  const idxLabel = `PASSO ${String(opts.index).padStart(2, "0")}`;
  const capsulaY = 132;
  const headStartY = capsulaY + 62 + 96;

  const signature = brand.handle
    ? `@${brand.handle}${brand.keywords?.length ? " · " + brand.keywords.join(" · ") : ""}`
    : brand.keywords?.length
      ? brand.keywords.join(" · ")
      : "";

  const rodapeY = CARD_H - 96;
  const rodape = `${pulseLine(pad, CARD_W - pad, rodapeY, markColor, 0.5)}
  <text x="${pad}" y="${CARD_H - 44}" font-family="${LABEL_FONT}" font-weight="400" font-size="23" letter-spacing="1" fill="${text}" fill-opacity="0.72">${escapeXml(signature.toLowerCase())}</text>
  <text x="${CARD_W - pad}" y="${CARD_H - 44}" font-family="${LABEL_FONT}" font-weight="600" font-size="23" letter-spacing="1" fill="${accent}" text-anchor="end">${String(opts.index).padStart(2, "0")}/${String(opts.total).padStart(2, "0")}</text>`;

  const cardBg =
    transparent && overlay && overlay.alpha > 0
      ? `<rect width="${CARD_W}" height="${CARD_H}" fill="${overlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${overlay.alpha}"/>`
      : transparent
        ? ""
        : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${cardBg}
  ${capsulaOutline(pad, capsulaY, idxLabel, 22, accent)}
  <text font-family="${DISPLAY_FONT}" font-weight="600" font-size="${headSize}" fill="${text}" text-anchor="start">${tspans(headlineLines, pad, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.82" text-anchor="start">${tspans(bodyLines, pad, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.55), bodyLineH)}</text>`
      : ""
  }
  ${rodape}
</svg>`;
}
