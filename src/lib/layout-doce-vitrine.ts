// ============================================================
// LAYOUT F — DOCE VITRINE (2026-07-29).
//
// Preset pensado para CONFEITARIA / alimentação: a peça imita a vitrine
// de uma doceria — borda ondulada (a forminha de cupcake, a barra de
// papel rendado da bandeja), selo redondo de etiqueta e confeitos
// (sprinkles) soltos como decoração. Tipografia de pâtisserie: DM Serif
// Display no título, Varela Round nos rótulos — arredondada, apetitosa,
// sem o ar de mono técnico que os outros quatro presets alternativos
// usam.
//
// Por que não reaproveitar o Serif Luxe: lá a serifa é de LUXO (contida,
// muito ar, régua fina, mono discreto). Aqui a mesma família serve a
// outra intenção — doce, cheia, com decoração assumida. A diferença
// entre os dois é a decoração e o rótulo arredondado, não a fonte.
//
// Mesmo contrato {svg, blurBandTop} dos demais layouts — drop-in no
// seletor de preset.
// ============================================================
import { buildOverlayGradientSvg } from "@/lib/contrast";
import { CARD_W, CARD_H, actionIconsRail, CLOSING_CORNER_MARGIN, type CardBrand } from "@/lib/render-shared";

const DISPLAY_FONT = "DM Serif Display";
/** Rótulos arredondados — é o que separa esta vitrine do Serif Luxe. */
const LABEL_FONT = "Varela Round";

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
  return lines.map((l, i) => `<tspan x="${cx}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`).join("");
}

function displaySize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 32) return { size: 98, lineH: 104, maxChars: 15 };
  if (n <= 62) return { size: 78, lineH: 86, maxChars: 20 };
  return { size: 62, lineH: 70, maxChars: 26 };
}

function bodySizeFor(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 98) return { size: 44, lineH: 60, maxChars: 30 };
  if (headSize >= 78) return { size: 38, lineH: 52, maxChars: 34 };
  return { size: 32, lineH: 44, maxChars: 38 };
}

/**
 * Barra ondulada (o "rendado" da bandeja). Desenha um retângulo cheio
 * de `y` até `y+h` cuja borda de baixo é uma fileira de semicírculos —
 * `up` inverte, deixando as ondas mordendo pra dentro (usado no rodapé).
 * O raio é derivado da largura pra fechar sempre num número inteiro de
 * ondas: onda cortada no meio denuncia que é um desenho gerado.
 */
function scallopBand(y: number, h: number, ondas: number, up = false): string {
  const r = CARD_W / (ondas * 2);
  const baseY = up ? y : y + h;
  const topY = up ? y + h : y;
  let d = `M 0 ${topY} L ${CARD_W} ${topY} L ${CARD_W} ${baseY}`;
  for (let i = 0; i < ondas; i++) {
    // sweep alterna com `up` pra onda apontar sempre pra fora da barra
    d += ` a ${r} ${r} 0 0 ${up ? 0 : 1} ${-2 * r} 0`;
  }
  return `${d} Z`;
}

/** Confeitos: bastões arredondados espalhados, posições fixas (nada de
 * random — a mesma peça tem que sair igual em todo render). */
function sprinkles(cx: number, cy: number, cor: string): string {
  const pontos = [
    [-210, -40, -28],
    [-120, 46, 18],
    [-30, -78, 62],
    [78, 30, -14],
    [168, -52, 40],
    [232, 38, -46],
  ];
  return pontos
    .map(
      ([dx, dy, rot]) =>
        `<rect x="${cx + dx}" y="${cy + dy}" width="26" height="9" rx="4.5" fill="${cor}" fill-opacity="0.85" transform="rotate(${rot} ${cx + dx + 13} ${cy + dy + 4.5})"/>`
    )
    .join("");
}

export interface DoceVitrineCoverRender {
  svg: string;
  blurBandTop: number;
}

export interface DoceVitrineCoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  overlay?: { theme: "light" | "dark"; alpha: number };
  topOverlay?: { theme: "light" | "dark"; alpha: number };
  eyebrow?: string;
  eyebrowRight?: string | null;
  showActionIcons?: boolean;
}

/**
 * Capa/fechamento: barra ondulada no topo com o rótulo dentro, selo
 * redondo com a inicial da marca, título serif centralizado no bloco de
 * baixo, confeitos em volta e uma chamada arredondada embaixo.
 */
export function buildDoceVitrineCoverSvg(
  headline: string,
  brand: CardBrand,
  transparent = false,
  opts: DoceVitrineCoverOptions = {}
): DoceVitrineCoverRender {
  const bg = brand.colorBackground || "#1A1015";
  const accent = brand.colorAccent || "#E58BA8";
  const text = brand.colorText || "#FFFFFF";
  const markColor = brand.markColor || accent;
  const showSwipeHint = opts.showSwipeHint !== false;
  const cx = CARD_W / 2;

  const eyebrow = (opts.eyebrow ?? "Fresquinho do dia").toUpperCase();
  const eyebrowRight = (opts.eyebrowRight ?? (brand.handle ? `@${brand.handle}` : "")).toLowerCase();

  const headlineText = stripEmoji(headline);
  const { size, lineH, maxChars } = displaySize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);
  const bodyText = opts.body ? stripEmoji(opts.body) : null;
  const bodyLines = bodyText ? wrapText(bodyText, 40).slice(0, 2) : [];

  // Bloco de texto ancorado embaixo, com espaço reservado no fechamento
  // (chip à esquerda e trilha de ícones à direita ocupam os cantos).
  let cursor = showSwipeHint ? CARD_H - 150 : CARD_H - 250;
  let subY: number | null = null;
  if (showSwipeHint || bodyLines.length) {
    subY = cursor;
    cursor -= bodyLines.length > 1 ? 46 : 0;
  }
  const headLastY = cursor - 78;
  const headStartY = headLastY - (lines.length - 1) * lineH;

  // --- topo: barra ondulada + rótulo + selo -------------------------
  const barH = 122;
  const barra = `<path d="${scallopBand(0, barH, 9)}" fill="${markColor}" fill-opacity="0.95"/>`;
  const rotuloY = 62;
  const topo = `${barra}
  <text x="${CLOSING_CORNER_MARGIN}" y="${rotuloY}" font-family="${LABEL_FONT}" font-weight="400" font-size="26" letter-spacing="3" fill="#1A1015">${escapeXml(eyebrow)}</text>
  <text x="${CARD_W - CLOSING_CORNER_MARGIN}" y="${rotuloY}" font-family="${LABEL_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="#1A1015" fill-opacity="0.75" text-anchor="end">${escapeXml(eyebrowRight)}</text>`;

  // Selo redondo com a inicial — a "etiqueta" colada na vitrine.
  const inicial = (brand.wordmark || brand.brandName || brand.handle || "•").trim().charAt(0).toUpperCase();
  const seloCy = barH + 96;
  const selo = `<circle cx="${cx}" cy="${seloCy}" r="52" fill="none" stroke="${accent}" stroke-width="3"/>
  <circle cx="${cx}" cy="${seloCy}" r="42" fill="${accent}" fill-opacity="0.16"/>
  <text x="${cx}" y="${seloCy + 17}" font-family="${DISPLAY_FONT}" font-weight="400" font-size="48" fill="${text}" text-anchor="middle">${escapeXml(inicial)}</text>`;

  const confeitos = sprinkles(cx, headStartY - size - 40, accent);

  const headlineSvg = `<text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${size}" fill="${text}" text-anchor="middle">${tspansCentered(lines, cx, headStartY, lineH)}</text>`;

  const subLine = bodyLines.length ? bodyLines : showSwipeHint ? ["Deslize e escolha o seu"] : [];
  const subSvg =
    subY != null && subLine.length
      ? `<text font-family="${LABEL_FONT}" font-weight="400" font-size="28" fill="${text}" fill-opacity="0.88" text-anchor="middle">${tspansCentered(subLine, cx, subY, 42)}</text>`
      : "";

  const showActionIcons = opts.showActionIcons ?? (opts.overlay !== undefined && !showSwipeHint);
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  const overlay = opts.overlay;
  const blurBandTop = Math.max(0, Math.round(headStartY - size * 0.95 - 40));
  const overlayRect =
    transparent && overlay && overlay.alpha > 0
      ? buildOverlayGradientSvg("overlay-band", blurBandTop, CARD_H - blurBandTop, CARD_W, overlay.theme, overlay.alpha)
      : "";
  // Placa do topo: a barra ondulada já é opaca, então só o que estiver
  // FORA dela precisa de véu — na prática, nada. Mantida por contrato.
  const topOverlay = opts.topOverlay;
  const topPlate =
    transparent && topOverlay && topOverlay.alpha > 0 && !opts.eyebrow
      ? `<rect width="${CARD_W}" height="${barH}" fill="${topOverlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${topOverlay.alpha}"/>`
      : "";

  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${topPlate}
  ${topo}
  ${selo}
  ${confeitos}
  ${headlineSvg}
  ${subSvg}
  ${actionIcons}
</svg>`;

  return { svg, blurBandTop };
}

export interface DoceVitrineCardOptions {
  index: number;
  total: number;
}

/**
 * Card interior: número dentro de um selo redondo, título serif
 * centralizado, corpo na fonte da marca e barra ondulada no rodapé com
 * a assinatura — a mesma "bandeja" da capa, invertida.
 */
export function buildDoceVitrineCardSvg(
  headline: string,
  body: string | null,
  brand: CardBrand,
  opts: DoceVitrineCardOptions,
  transparent = false,
  overlay?: { theme: "light" | "dark"; alpha: number }
): string {
  const bg = brand.colorBackground || "#1A1015";
  const accent = brand.colorAccent || "#E58BA8";
  const text = brand.colorText || "#FFFFFF";
  const markColor = brand.markColor || accent;
  const bodyFont = brand.fontFamily || "Inter";
  const cx = CARD_W / 2;

  const headlineText = stripEmoji(headline);
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = displaySize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 3);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = bodySizeFor(headSize);
  const bodyLines = body ? wrapText(stripEmoji(body), bodyMaxChars).slice(0, 5) : [];

  const idxLabel = String(opts.index).padStart(2, "0");
  const seloCy = 168;
  const headStartY = seloCy + 150;

  const signature = brand.handle
    ? `@${brand.handle}${brand.keywords?.length ? " · " + brand.keywords.join(" · ") : ""}`
    : brand.keywords?.length
      ? brand.keywords.join(" · ")
      : "";

  const rodapeH = 96;
  const rodapeY = CARD_H - rodapeH;
  const rodape = `<path d="${scallopBand(rodapeY, rodapeH, 9, true)}" fill="${markColor}" fill-opacity="0.95"/>
  <text x="${CLOSING_CORNER_MARGIN}" y="${CARD_H - 34}" font-family="${LABEL_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="#1A1015">${escapeXml(signature.toLowerCase())}</text>
  <text x="${CARD_W - CLOSING_CORNER_MARGIN}" y="${CARD_H - 34}" font-family="${LABEL_FONT}" font-weight="400" font-size="24" letter-spacing="1" fill="#1A1015" text-anchor="end">${idxLabel}/${String(opts.total).padStart(2, "0")}</text>`;

  const cardBg =
    transparent && overlay && overlay.alpha > 0
      ? `<rect width="${CARD_W}" height="${CARD_H}" fill="${overlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${overlay.alpha}"/>`
      : transparent
        ? ""
        : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${cardBg}
  <circle cx="${cx}" cy="${seloCy}" r="46" fill="none" stroke="${accent}" stroke-width="3"/>
  <text x="${cx}" y="${seloCy + 16}" font-family="${DISPLAY_FONT}" font-weight="400" font-size="44" fill="${accent}" text-anchor="middle">${idxLabel}</text>
  <text font-family="${DISPLAY_FONT}" font-weight="400" font-size="${headSize}" fill="${text}" text-anchor="middle">${tspansCentered(headlineLines, cx, headStartY, headLineH)}</text>
  ${
    bodyLines.length
      ? `<text font-family="${bodyFont}" font-weight="400" font-size="${bodySize}" fill="${text}" fill-opacity="0.85" text-anchor="middle">${tspansCentered(bodyLines, cx, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.5), bodyLineH)}</text>`
      : ""
  }
  ${rodape}
</svg>`;
}
