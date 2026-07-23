import { describe, it, expect } from "vitest";
import {
  PREVIEW_LAYOUTS,
  buildCoverPreview,
  buildInteriorPreview,
  buildClosingPreview,
  buildCarouselPreview,
  buildVideoPreview,
  buildFeedVideoPreview,
  buildHybridPreview,
  scaleSvg,
  REELS_W,
  REELS_H,
} from "@/lib/layout-preview";
import type { CardBrand } from "@/lib/render-shared";

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7C5CFF",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Marca Teste",
  handle: "marca.ia",
  keywords: ["DESIGN", "IA"],
};

describe.each(PREVIEW_LAYOUTS)("layout-preview — $label", ({ key }) => {
  it("capa normal: SVG válido 1080×1350", () => {
    const svg = buildCoverPreview(key, brand);
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="1080" height="1350"');
  });

  it("interior: SVG válido", () => {
    const svg = buildInteriorPreview(key, brand);
    expect(svg).toContain("<svg");
  });

  it("fechamento: inclui o chip placeholder (círculo da inicial)", () => {
    const svg = buildClosingPreview(key, brand);
    expect(svg).toContain("<circle");
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("carrossel: 3 miniaturas (capa, interior, fechamento)", () => {
    const frames = buildCarouselPreview(key, brand);
    expect(frames).toHaveLength(3);
    frames.forEach((f) => expect(f).toContain("<svg"));
  });

  it("vídeo: quadro 9:16 exato, com play e badge REELS", () => {
    const svg = buildVideoPreview(key, brand);
    expect(svg).toContain(`width="${REELS_W}" height="${REELS_H}"`);
    expect(svg).toContain("REELS");
    expect(svg).toContain("<path"); // ícone de play
  });

  it("vídeo feed: quadro 4:5 exato, vídeo só na caixa de cima (banda de identidade embaixo intacta)", () => {
    const svg = buildFeedVideoPreview(key, brand);
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain("<path"); // ícone de play
    expect(svg).toContain("video-feed-hatch"); // caixa de vídeo (mockup)
  });

  it("híbrido: vídeo (9:16) + interior (4:5) estático", () => {
    const { video, interior } = buildHybridPreview(key, brand);
    expect(video).toContain(`width="${REELS_W}" height="${REELS_H}"`);
    expect(interior).toContain('width="1080" height="1350"');
  });
});

describe("scaleSvg", () => {
  it("substitui só a tag <svg> de abertura por width/height 100%", () => {
    const svg = buildCoverPreview("editorial-noir", brand);
    const scaled = scaleSvg(svg);
    expect(scaled.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"')).toBe(true);
    // viewBox preservado — é ele que garante a proporção correta
    expect(scaled).toContain('viewBox="0 0 1080 1350"');
    // o retângulo de fundo (mesmas dimensões nominais) não é afetado —
    // só a tag <svg> de abertura muda
    expect(scaled).toContain('<rect width="1080" height="1350"');
  });
});
