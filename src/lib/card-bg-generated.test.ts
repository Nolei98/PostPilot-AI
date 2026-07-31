import { describe, it, expect } from "vitest";
import {
  buildGeneratedCardBgSvg,
  buildGeneratedCardBgPng,
  VARIANTES,
  type BgBrandColors,
} from "@/lib/card-bg-generated";
import { CARD_W, CARD_H } from "@/lib/render-shared";

const brand: BgBrandColors = {
  colorBackground: "#0b0b12",
  colorAccent: "#7B2FF7",
  colorKeyword: "#E0219C",
};

describe("fundo gerado do card", () => {
  it("é determinístico — mesma semente, mesmo SVG", () => {
    const a = buildGeneratedCardBgSvg("post-1:3", brand);
    const b = buildGeneratedCardBgSvg("post-1:3", brand);
    expect(a).toBe(b);
  });

  it("cards diferentes do mesmo post saem diferentes", () => {
    const svgs = [0, 1, 2, 3, 4, 5].map((i) => buildGeneratedCardBgSvg(`post-1:${i}`, brand));
    expect(new Set(svgs).size).toBeGreaterThan(1);
  });

  it("usa as cores do kit, não cor fixa", () => {
    const svg = buildGeneratedCardBgSvg("post-1:0", brand);
    expect(svg).toContain(brand.colorBackground);
    expect(svg).toContain(brand.colorAccent);
  });

  it("tem o tamanho do card", () => {
    const svg = buildGeneratedCardBgSvg("x:0", brand);
    expect(svg).toContain(`width="${CARD_W}"`);
    expect(svg).toContain(`height="${CARD_H}"`);
  });

  it("sempre termina com o véu que limpa a parte de baixo", () => {
    // O terço inferior é onde texto e chip sentam: se alguma variante
    // deixasse energia visual ali, o card ficaria ilegível.
    for (let i = 0; i < VARIANTES * 2; i++) {
      const svg = buildGeneratedCardBgSvg(`seed-${i}:${i}`, brand);
      const ultimoRect = svg.lastIndexOf("<rect");
      const veil = svg.indexOf("veil");
      expect(veil).toBeGreaterThan(0);
      expect(svg.slice(ultimoRect)).toContain("veil");
    }
  });

  it("ids de gradiente não colidem entre cards", () => {
    const a = buildGeneratedCardBgSvg("post-1:0", brand);
    const b = buildGeneratedCardBgSvg("post-1:1", brand);
    const idA = a.match(/id="(glow-[^"]+)"/)![1];
    const idB = b.match(/id="(glow-[^"]+)"/)![1];
    expect(idA).not.toBe(idB);
  });

  it("aguenta kit sem segunda cor", () => {
    expect(() =>
      buildGeneratedCardBgSvg("x:0", { colorBackground: "#000", colorAccent: "#fff" })
    ).not.toThrow();
  });

  it("rasteriza num PNG válido", () => {
    const png = buildGeneratedCardBgPng("post-1:2", brand);
    // Assinatura PNG.
    expect(png.subarray(0, 4).toString("hex")).toBe("89504e47");
    expect(png.length).toBeGreaterThan(1000);
  });
});
