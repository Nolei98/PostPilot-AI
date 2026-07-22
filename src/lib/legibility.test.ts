import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  contrastRatio,
  relLuminance,
  decideLegibility,
  measureBands,
  LIGHT,
  DARK,
  type Bands,
  type BandStats,
  type LegibilityConfig,
} from "@/lib/legibility";

const cfg = (over: Partial<LegibilityConfig> = {}): LegibilityConfig => ({
  position: "auto",
  textColor: "auto",
  scrim: "auto",
  showLabel: "auto",
  blur: "off",
  ...over,
});

const band = (rgb: [number, number, number], stddev = 0.02): BandStats => ({
  rgb,
  L: (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255,
  stddev,
});
const bands = (top: BandStats, bottom: BandStats): Bands => ({ top, bottom });

const DARK_B = band([12, 12, 12]);
const LIGHT_B = band([240, 240, 240]);
const MID_B = band([128, 128, 128], 0.3);

describe("contraste WCAG", () => {
  it("branco×preto = 21, branco×branco = 1", () => {
    expect(contrastRatio(LIGHT, DARK)).toBeGreaterThan(15);
    expect(contrastRatio(LIGHT, LIGHT)).toBeCloseTo(1, 5);
  });
  it("luminância: preto ~0, branco ~1", () => {
    expect(relLuminance([0, 0, 0])).toBeCloseTo(0, 5);
    expect(relLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe("decideLegibility (puro)", () => {
  it("fundo sólido (null) → renderiza, sem scrim, texto claro no auto", () => {
    const r = decideLegibility(null, cfg());
    expect(r.render).toBe(true);
    expect(r.scrimAlpha).toBe(0);
    expect(r.textColor).toBe("light");
  });

  it("fundo escuro → texto claro sem scrim", () => {
    const r = decideLegibility(bands(DARK_B, DARK_B), cfg());
    expect(r.textColor).toBe("light");
    expect(r.scrimAlpha).toBe(0);
    expect(r.render).toBe(true);
  });

  it("fundo claro → texto escuro, renderiza", () => {
    const r = decideLegibility(bands(LIGHT_B, LIGHT_B), cfg());
    expect(r.textColor).toBe("dark");
    expect(r.render).toBe(true);
  });

  it("fundo médio + texto claro → adiciona scrim até bater a meta", () => {
    const r = decideLegibility(bands(MID_B, MID_B), cfg({ position: "top", textColor: "light" }));
    expect(r.scrimAlpha).toBeGreaterThan(0);
    expect(r.render).toBe(true);
  });

  it("auto-hide: contraste ruim + scrim off + showLabel auto → render false", () => {
    const r = decideLegibility(
      bands(LIGHT_B, LIGHT_B),
      cfg({ position: "top", textColor: "light", scrim: "off" })
    );
    expect(r.render).toBe(false);
  });

  it("override showLabel=true vence mesmo com contraste ruim", () => {
    const r = decideLegibility(
      bands(LIGHT_B, LIGHT_B),
      cfg({ position: "top", textColor: "light", scrim: "off", showLabel: true })
    );
    expect(r.render).toBe(true);
  });

  it("override showLabel=false esconde mesmo com bom contraste", () => {
    const r = decideLegibility(bands(DARK_B, DARK_B), cfg({ showLabel: false }));
    expect(r.render).toBe(false);
  });

  it("position fixa é respeitada", () => {
    const r = decideLegibility(bands(DARK_B, LIGHT_B), cfg({ position: "bottom" }));
    expect(r.position).toBe("bottom");
    expect(r.textColor).toBe("dark"); // faixa de baixo é clara
  });

  it("blur:'on' propaga blurBand", () => {
    expect(decideLegibility(bands(DARK_B, DARK_B), cfg({ blur: "on" })).blurBand).toBe(true);
  });
});

describe("measureBands (sharp)", () => {
  const solid = (r: number, g: number, b: number) =>
    sharp({ create: { width: 80, height: 100, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer();

  it("imagem escura → L baixo nas duas faixas", async () => {
    const b = await measureBands(await solid(10, 10, 10));
    expect(b.top.L).toBeLessThan(0.1);
    expect(b.bottom.L).toBeLessThan(0.1);
  });

  it("imagem clara → L alto nas duas faixas", async () => {
    const b = await measureBands(await solid(240, 240, 240));
    expect(b.top.L).toBeGreaterThan(0.8);
    expect(b.bottom.L).toBeGreaterThan(0.8);
  });
});
