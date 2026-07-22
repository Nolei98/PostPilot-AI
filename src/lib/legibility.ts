// ============================================================
// Motor de legibilidade adaptativa (Sprint B+, TAREFA B7).
//
// Mede o fundo (faixa superior/inferior) com sharp, escolhe cor do
// texto + posição + intensidade do scrim para bater uma meta de
// contraste (WCAG), com auto-hide e override manual. Roda ANTES do
// Satori (que não tem backdrop-filter). Ver HANDOFF-overlens-template.md
// seção 3.
//
// A DECISÃO (decideLegibility) é pura e testável sem imagem; a MEDIÇÃO
// (measureBands) usa sharp. resolveLegibility junta as duas.
// ============================================================
import sharp from "sharp";

export type RGB = [number, number, number]; // 0–255
export type BandName = "top" | "bottom";

export interface BandStats {
  rgb: RGB; // cor média da faixa
  L: number; // luminância simples 0–1 (decisão claro/escuro)
  stddev: number; // desvio médio 0–1 (proxy de "fundo ocupado")
}

export interface Bands {
  top: BandStats;
  bottom: BandStats;
}

export interface LegibilityConfig {
  position: "auto" | "top" | "bottom";
  textColor: "auto" | "light" | "dark";
  scrim: "auto" | "on" | "off";
  showLabel: "auto" | boolean;
  blur: "off" | "on";
  scrimMaxAlpha?: number; // teto do α do scrim (default 0.7)
  contrastTarget?: number; // meta WCAG (default 4.5)
}

export interface LegibilityResult {
  position: BandName;
  textColor: "light" | "dark";
  scrimAlpha: number; // 0–maxAlpha
  blurBand: boolean;
  render: boolean; // false = auto-hide (não desenha o rótulo)
}

export const LIGHT: RGB = [255, 255, 255];
export const DARK: RGB = [17, 17, 17];

/** sRGB (0–255) → linear, para a luminância relativa WCAG. */
function toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminância relativa WCAG (0–1). */
export function relLuminance([r, g, b]: RGB): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Razão de contraste WCAG entre duas cores (1–21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Luminância simples normalizada (0–1) — decisão claro/escuro (brief). */
function simpleL([r, g, b]: RGB): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Fundo efetivo após aplicar um scrim preto com alpha sobre a faixa. */
export function effectiveBg(band: BandStats, alpha: number): RGB {
  return band.rgb.map((c) => c * (1 - alpha)) as RGB;
}

/** Mede a faixa superior (~28%) e inferior (~32%) da imagem com sharp. */
export async function measureBands(buffer: Buffer): Promise<Bands> {
  const meta = await sharp(buffer).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const topH = Math.max(1, Math.round(H * 0.28));
  const botH = Math.max(1, Math.round(H * 0.32));
  const botY = Math.max(0, H - botH);

  const band = async (top: number, height: number): Promise<BandStats> => {
    const { channels } = await sharp(buffer)
      .extract({ left: 0, top, width: W, height })
      .stats();
    const rgb: RGB = [channels[0].mean, channels[1].mean, channels[2].mean];
    const stddev =
      (channels[0].stdev + channels[1].stdev + channels[2].stdev) / 3 / 255;
    return { rgb, L: simpleL(rgb), stddev };
  };

  return { top: await band(0, topH), bottom: await band(botY, botH) };
}

interface BandEval {
  tc: "light" | "dark";
  alpha: number;
  cr: number;
  ok: boolean;
}

function evalBand(band: BandStats, cfg: LegibilityConfig): BandEval {
  const target = cfg.contrastTarget ?? 4.5;
  const maxAlpha = cfg.scrimMaxAlpha ?? 0.7;
  const tc: "light" | "dark" =
    cfg.textColor === "auto" ? (band.L < 0.5 ? "light" : "dark") : cfg.textColor;
  const textRGB = tc === "light" ? LIGHT : DARK;

  let alpha = 0;
  if (cfg.scrim !== "off") {
    while (
      contrastRatio(textRGB, effectiveBg(band, alpha)) < target &&
      alpha < maxAlpha
    ) {
      alpha = Math.round((alpha + 0.1) * 10) / 10;
    }
  }
  const cr = contrastRatio(textRGB, effectiveBg(band, alpha));
  return { tc, alpha, cr, ok: cr >= target };
}

/**
 * Decisão pura (sem sharp): dado o resultado da medição (ou null p/
 * fundo sólido), escolhe posição/cor/scrim e se renderiza. Override
 * manual sempre vence.
 */
export function decideLegibility(bands: Bands | null, cfg: LegibilityConfig): LegibilityResult {
  // Fundo sólido/gradiente: contraste é responsabilidade do Brand Kit.
  if (!bands) {
    const tc = cfg.textColor === "auto" ? "light" : cfg.textColor;
    return {
      position: cfg.position === "auto" ? "bottom" : cfg.position,
      textColor: tc,
      scrimAlpha: 0,
      blurBand: false,
      render: cfg.showLabel === false ? false : true,
    };
  }

  let pos: BandName;
  let chosen: BandEval;
  if (cfg.position === "auto") {
    const t = evalBand(bands.top, cfg);
    const b = evalBand(bands.bottom, cfg);
    // score: ok pesa muito; + contraste; − ocupação; − scrim necessário
    const score = (band: BandStats, e: BandEval) =>
      (e.ok ? 100 : 0) + e.cr - band.stddev * 5 - e.alpha * 2;
    if (score(bands.top, t) >= score(bands.bottom, b)) {
      pos = "top";
      chosen = t;
    } else {
      pos = "bottom";
      chosen = b;
    }
  } else {
    pos = cfg.position;
    chosen = evalBand(bands[pos], cfg);
  }

  const render =
    cfg.showLabel === "auto" ? chosen.ok : cfg.showLabel === true;

  return {
    position: pos,
    textColor: chosen.tc,
    scrimAlpha: chosen.alpha,
    blurBand: cfg.blur === "on",
    render,
  };
}

/** Junta medição + decisão. img null = fundo sólido/gradiente. */
export async function resolveLegibility(
  img: Buffer | null,
  cfg: LegibilityConfig
): Promise<LegibilityResult> {
  const bands = img ? await measureBands(img) : null;
  return decideLegibility(bands, cfg);
}
