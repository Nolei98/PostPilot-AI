// ============================================================
// Contraste automático por LUMINÂNCIA DA IMAGEM (carrossel + post único).
// Decide o tema claro/escuro do texto pela luminância real do fundo (não
// mais cor de marca fixa) e calibra um overlay translúcido só o
// suficiente pra bater a meta WCAG — nunca entrega um slide ilegível.
//
// Reaproveita a matemática WCAG de legibility.ts (Sprint B+, que mede
// bandas fixas topo/base pro rótulo do Template Studio); aqui a medição é
// da imagem INTEIRA (ou de uma região específica, ex. a banda de
// identidade da capa/fechamento), usada pelo pipeline real do carrossel.
// ============================================================
import sharp from "sharp";
import { relLuminance, type RGB } from "@/lib/legibility";

export type Theme = "light" | "dark";

export const LUMINANCE_THRESHOLD = 0.55;
export const MIN_CONTRAST = 4.5;

function hexToRgb(hex: string): RGB {
  const bytes = hex.replace("#", "").match(/.{2}/g);
  if (!bytes) return [0, 0, 0];
  return bytes.slice(0, 3).map((h) => parseInt(h, 16)) as RGB;
}

/** Tema pela luminância do fundo: L >= 0.55 → claro (texto escuro); senão → escuro (texto claro). */
export function pickTheme(luminance: number): Theme {
  return luminance >= LUMINANCE_THRESHOLD ? "light" : "dark";
}

/** Luminância relativa (0–1) de uma cor sólida (hex) — pra fundo de
 * marca (sem foto), onde não há imagem pra medir. */
export function relativeLuminanceOfHex(hex: string): number {
  return relLuminance(hexToRgb(hex));
}

/** Cor de texto WCAG-segura pro tema escolhido (hex). */
export function textColorForTheme(theme: Theme): string {
  return theme === "dark" ? "#FFFFFF" : "#0A0A0A";
}

/** Razão de contraste WCAG entre uma cor de texto (hex) e a luminância (0–1) do fundo. */
export function contrastRatio(textHex: string, bgLuminance: number): number {
  const textLum = relLuminance(hexToRgb(textHex));
  const hi = Math.max(textLum, bgLuminance);
  const lo = Math.min(textLum, bgLuminance);
  return (hi + 0.05) / (lo + 0.05);
}

/** true quando a razão de contraste fica abaixo da meta WCAG (default 4.5). */
export function needsOverlay(textHex: string, bgLuminance: number, minRatio = MIN_CONTRAST): boolean {
  return contrastRatio(textHex, bgLuminance) < minRatio;
}

/**
 * Opacidade mínima (0–maxAlpha, passos de 0.1) de um overlay — preto no
 * tema escuro (escurece ainda mais se precisar), branco no tema claro
 * (clareia) — pra bater a meta de contraste do texto contra o fundo.
 * 0 = já está bom, não precisa de overlay.
 */
export function overlayAlphaFor(
  theme: Theme,
  textHex: string,
  bgLuminance: number,
  maxAlpha = 0.7
): number {
  let alpha = 0;
  let lum = bgLuminance;
  while (needsOverlay(textHex, lum, MIN_CONTRAST) && alpha < maxAlpha) {
    alpha = Math.round((alpha + 0.1) * 10) / 10;
    lum = theme === "dark" ? bgLuminance * (1 - alpha) : bgLuminance + (1 - bgLuminance) * alpha;
  }
  return alpha;
}

/**
 * Overlay de legibilidade como GRADIENTE — nunca mais um retângulo de
 * opacidade fixa ("caixa" estática desconectada da foto). Nasce
 * TRANSPARENTE bem no topo da banda (onde encosta na foto ainda visível
 * — a "emenda" que ficava dura vira transição) e sobe pra opacidade
 * plena numa faixa CURTA (a "bordinha" de conexão — no máx. 70px ou 20%
 * da banda, o que for menor); dali em diante fica SÓLIDO na opacidade
 * calibrada até a base — garante que o texto (que começa logo depois
 * dessa faixa curta) sempre senta em cima da parte plena do gradiente,
 * nunca de um meio-tom. `bandY`/`bandH` é a região a cobrir (banda de
 * identidade da capa/fechamento); `alpha` é o pico calibrado por WCAG
 * (overlayAlphaFor). `gradientId` precisa ser único dentro do mesmo
 * <svg> (evita colisão de <defs> se dois overlays coexistirem).
 */
export function buildOverlayGradientSvg(
  gradientId: string,
  bandY: number,
  bandH: number,
  width: number,
  theme: Theme,
  alpha: number
): string {
  if (alpha <= 0 || bandH <= 0) return "";
  const color = theme === "dark" ? "#000000" : "#ffffff";
  const transitionFrac = Math.min(0.2, bandH > 0 ? 70 / bandH : 0.2);
  return `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${color}" stop-opacity="0"/>
    <stop offset="${transitionFrac.toFixed(3)}" stop-color="${color}" stop-opacity="${alpha}"/>
    <stop offset="1" stop-color="${color}" stop-opacity="${alpha}"/>
  </linearGradient></defs>
  <rect x="0" y="${bandY}" width="${width}" height="${bandH}" fill="url(#${gradientId})"/>`;
}

/**
 * Luminância relativa média de uma imagem (0=preto, 1=branco). Amostra
 * pequena (48x60) — suficiente pra decidir tema, muito mais barato que
 * processar a foto inteira.
 */
export async function measureImageLuminance(photo: Buffer): Promise<number> {
  const { data, info } = await sharp(photo)
    .resize(48, 60, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  let sum = 0;
  const n = data.length / channels;
  for (let i = 0; i < data.length; i += channels) {
    sum += relLuminance([data[i], data[i + 1], data[i + 2]]);
  }
  return n ? sum / n : 0;
}
