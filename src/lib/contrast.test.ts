import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  pickTheme,
  textColorForTheme,
  contrastRatio,
  needsOverlay,
  overlayAlphaFor,
  measureImageLuminance,
  relativeLuminanceOfHex,
} from "@/lib/contrast";

describe("relativeLuminanceOfHex", () => {
  it("preto ~0, branco ~1", () => {
    expect(relativeLuminanceOfHex("#000000")).toBeLessThan(0.01);
    expect(relativeLuminanceOfHex("#FFFFFF")).toBeGreaterThan(0.99);
  });
  it("cor de marca escura tem luminância baixa (tema escuro)", () => {
    expect(pickTheme(relativeLuminanceOfHex("#0B0B12"))).toBe("dark");
  });
});

describe("pickTheme", () => {
  it("L >= 0.55 → claro; abaixo → escuro", () => {
    expect(pickTheme(0.55)).toBe("light");
    expect(pickTheme(0.8)).toBe("light");
    expect(pickTheme(0.54)).toBe("dark");
    expect(pickTheme(0.2)).toBe("dark");
  });
  it("casos de borda: 0, 0.54, 0.55, 1", () => {
    expect(pickTheme(0)).toBe("dark");
    expect(pickTheme(0.54)).toBe("dark");
    expect(pickTheme(0.55)).toBe("light");
    expect(pickTheme(1)).toBe("light");
  });
});

describe("textColorForTheme", () => {
  it("escuro → texto branco; claro → texto escuro", () => {
    expect(textColorForTheme("dark")).toBe("#FFFFFF");
    expect(textColorForTheme("light")).toBe("#0A0A0A");
  });
});

describe("contrastRatio / needsOverlay (WCAG)", () => {
  it("branco sobre fundo bem escuro: contraste alto, sem overlay", () => {
    const ratio = contrastRatio("#FFFFFF", 0.02);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(needsOverlay("#FFFFFF", 0.02)).toBe(false);
  });
  it("branco sobre fundo médio-claro: contraste baixo, precisa de overlay", () => {
    const ratio = contrastRatio("#FFFFFF", 0.5);
    expect(ratio).toBeLessThan(4.5);
    expect(needsOverlay("#FFFFFF", 0.5)).toBe(true);
  });
  it("preto sobre fundo bem claro: contraste alto, sem overlay", () => {
    expect(needsOverlay("#0A0A0A", 0.9)).toBe(false);
  });
});

describe("overlayAlphaFor", () => {
  it("0 quando o contraste já está bom (sem overlay)", () => {
    expect(overlayAlphaFor("dark", "#FFFFFF", 0.02)).toBe(0);
  });
  it("> 0 quando o contraste está ruim, e reduz a luminância efetiva o suficiente", () => {
    const alpha = overlayAlphaFor("dark", "#FFFFFF", 0.5);
    expect(alpha).toBeGreaterThan(0);
    const effectiveLum = 0.5 * (1 - alpha);
    expect(contrastRatio("#FFFFFF", effectiveLum)).toBeGreaterThanOrEqual(4.5);
  });
  it("tema claro clareia (aumenta a luminância efetiva) em vez de escurecer", () => {
    const alpha = overlayAlphaFor("light", "#0A0A0A", 0.15);
    expect(alpha).toBeGreaterThan(0);
    const effectiveLum = 0.15 + (1 - 0.15) * alpha;
    expect(contrastRatio("#0A0A0A", effectiveLum)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("measureImageLuminance", () => {
  it("imagem preta → luminância ~0", async () => {
    const buf = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const L = await measureImageLuminance(buf);
    expect(L).toBeLessThan(0.02);
  });
  it("imagem branca → luminância ~1", async () => {
    const buf = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const L = await measureImageLuminance(buf);
    expect(L).toBeGreaterThan(0.98);
  });
});
