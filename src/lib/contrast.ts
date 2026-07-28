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
 * opacidade fixa ("caixa" estática desconectada da foto). SÓLIDO na
 * BORDA do quadro onde a banda está "presa" (`edge`) — é ali que o
 * texto precisa de proteção garantida — e vai ficando TRANSPARENTE à
 * medida que se afasta dessa borda, numa faixa CURTA de transição (no
 * máx. 70px ou 20% da banda, o que for menor), até sumir de vez no
 * resto da foto/vídeo — nunca um "quadrado" estático desconectado.
 * `edge: "bottom"` (default, bandas ancoradas no rodapé — capa,
 * fechamento, identidade) = sólido na base, funde pro topo da banda.
 * `edge: "top"` (bandas ancoradas no TOPO — marca/eyebrow no topo dos
 * layouts alternativos e do Reels) = sólido no topo, funde pra base.
 * `bandY`/`bandH` é a região a cobrir; `alpha` é o pico calibrado por
 * WCAG (overlayAlphaFor). `gradientId` precisa ser único dentro do
 * mesmo <svg> (evita colisão de <defs> se dois overlays coexistirem).
 */
export function buildOverlayGradientSvg(
  gradientId: string,
  bandY: number,
  bandH: number,
  width: number,
  theme: Theme,
  alpha: number,
  edge: "top" | "bottom" = "bottom"
): string {
  if (alpha <= 0 || bandH <= 0) return "";
  const color = theme === "dark" ? "#000000" : "#ffffff";
  const transitionFrac = Math.min(0.2, bandH > 0 ? 70 / bandH : 0.2);
  const stops =
    edge === "bottom"
      ? `<stop offset="0" stop-color="${color}" stop-opacity="0"/>
    <stop offset="${transitionFrac.toFixed(3)}" stop-color="${color}" stop-opacity="${alpha}"/>
    <stop offset="1" stop-color="${color}" stop-opacity="${alpha}"/>`
      : `<stop offset="0" stop-color="${color}" stop-opacity="${alpha}"/>
    <stop offset="${(1 - transitionFrac).toFixed(3)}" stop-color="${color}" stop-opacity="${alpha}"/>
    <stop offset="1" stop-color="${color}" stop-opacity="0"/>`;
  return `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
    ${stops}
  </linearGradient></defs>
  <rect x="0" y="${bandY}" width="${width}" height="${bandH}" fill="url(#${gradientId})"/>`;
}

/** Resolução da amostra de luminância — 48x60 (mesma proporção 4:5 da
 * arte) é o bastante pra decidir tema e calibrar overlay, e é MUITO mais
 * barato que processar a foto inteira. */
export const LUM_GRID_W = 48;
export const LUM_GRID_H = 60;

/**
 * Amostra de luminância de uma imagem, guardável no banco. `data` é a
 * grade `w`x`h` em row-major, cada célula a luminância relativa (0–1)
 * quantizada em um byte, serializada em base64 — ~3,8 KB pra 48x60, ordens
 * de grandeza menor que um JSON de floats.
 *
 * Existe pra que o PREVIEW (browser, sem sharp) e o RENDER FINAL leiam o
 * mesmo número: a luminância é medida uma vez, quando a imagem base é
 * buscada, e daí em diante qualquer região é derivada por aritmética pura
 * (luminanceOfRegion). O erro de quantização é ~0,004, duas ordens de
 * grandeza abaixo do passo de 0,1 do overlayAlphaFor — não muda decisão.
 */
export interface LumGrid {
  w: number;
  h: number;
  /** base64 de w*h bytes, row-major; byte/255 = luminância relativa. */
  data: string;
}

/** Retângulo em coordenadas do CANVAS já redimensionado (ex: 1080x1350). */
export interface LumRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Constrói a grade de luminância de uma imagem. Único ponto que ainda
 * precisa do sharp — roda uma vez, na geração, e o resultado é persistido.
 */
export async function buildLuminanceGrid(photo: Buffer): Promise<LumGrid> {
  const { data, info } = await sharp(photo)
    .resize(LUM_GRID_W, LUM_GRID_H, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const cells = Buffer.allocUnsafe(info.width * info.height);
  for (let i = 0, c = 0; i < data.length; i += channels, c++) {
    cells[c] = Math.round(relLuminance([data[i], data[i + 1], data[i + 2]]) * 255);
  }
  return { w: info.width, h: info.height, data: cells.toString("base64") };
}

/** Decodifica as células da grade (0–1). */
function gridCells(grid: LumGrid): Buffer {
  return Buffer.from(grid.data, "base64");
}

/** Luminância média da grade inteira — equivalente a medir a imagem toda. */
export function gridAverage(grid: LumGrid): number {
  const cells = gridCells(grid);
  if (!cells.length) return 0;
  let sum = 0;
  for (let i = 0; i < cells.length; i++) sum += cells[i];
  return sum / cells.length / 255;
}

/**
 * Luminância média de uma REGIÃO do canvas, derivada da grade — substitui
 * o `sharp(covered).extract(rect)` + `measureImageLuminance(band)` que os
 * builders de layout faziam, sem tocar em bytes de imagem.
 *
 * Reproduz de propósito o recorte do `fit: "cover"` que o measure fazia ao
 * reduzir a banda pra 48x60: uma banda mais larga que 4:5 era cortada nas
 * laterais antes de ser medida, então a média era a do MIOLO da banda, não
 * a dela inteira. Manter esse recorte é o que garante que trocar as
 * chamadas antigas por esta não muda nenhuma arte já gerada.
 */
export function luminanceOfRegion(
  grid: LumGrid,
  rect: LumRect,
  canvas: { width: number; height: number }
): number {
  const cells = gridCells(grid);
  if (!cells.length || canvas.width <= 0 || canvas.height <= 0) return 0;

  // Região em coordenadas de grade (contínuas).
  const rx = (rect.left / canvas.width) * grid.w;
  const ry = (rect.top / canvas.height) * grid.h;
  const rw = (rect.width / canvas.width) * grid.w;
  const rh = (rect.height / canvas.height) * grid.h;
  if (rw <= 0 || rh <= 0) return 0;

  // Recorte "cover" pro aspecto da amostra, centralizado na região.
  const aspect = grid.w / grid.h;
  let kw = rw;
  let kh = rh;
  if (rw / rh > aspect) kw = rh * aspect;
  else kh = rw / aspect;
  const kx = rx + (rw - kw) / 2;
  const ky = ry + (rh - kh) / 2;

  // Média ponderada por área das células cobertas pelo recorte.
  const x0 = Math.max(0, Math.floor(kx));
  const y0 = Math.max(0, Math.floor(ky));
  const x1 = Math.min(grid.w, Math.ceil(kx + kw));
  const y1 = Math.min(grid.h, Math.ceil(ky + kh));
  let sum = 0;
  let weight = 0;
  for (let y = y0; y < y1; y++) {
    const wy = Math.min(y + 1, ky + kh) - Math.max(y, ky);
    if (wy <= 0) continue;
    for (let x = x0; x < x1; x++) {
      const wx = Math.min(x + 1, kx + kw) - Math.max(x, kx);
      if (wx <= 0) continue;
      const w = wx * wy;
      sum += cells[y * grid.w + x] * w;
      weight += w;
    }
  }
  return weight ? sum / weight / 255 : 0;
}

/**
 * Luminância relativa média de uma imagem (0=preto, 1=branco). Mesma
 * amostra 48x60 da grade — é literalmente a média dela, pra medida direta
 * e medida derivada nunca divergirem.
 */
export async function measureImageLuminance(photo: Buffer): Promise<number> {
  return gridAverage(await buildLuminanceGrid(photo));
}
