import { describe, it, expect } from "vitest";
import {
  PREVIEW_LAYOUTS,
  buildCoverPreview,
  buildInteriorPreview,
  buildClosingPreview,
  buildCarouselPreview,
  buildVideoPreview,
  buildFeedVideoPreview,
  buildInteriorVideoPreview,
  buildHybridPreview,
  scaleSvg,
  REELS_W,
  REELS_H,
} from "@/lib/layout-preview";
import type { CardBrand, LayoutPreset } from "@/lib/render-shared";

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

  it("vídeo feed: quadro 4:5 exato, vídeo numa moldura 16:9 própria (banda de identidade intacta)", () => {
    const svg = buildFeedVideoPreview(key, brand);
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain("<path"); // ícone de play
    expect(svg).toContain("video-feed-hatch"); // moldura de vídeo (mockup)
  });

  it("híbrido: vídeo (9:16) + interior (4:5) estático", () => {
    const { video, interior } = buildHybridPreview(key, brand);
    expect(video).toContain(`width="${REELS_W}" height="${REELS_H}"`);
    expect(interior).toContain('width="1080" height="1350"');
  });
});

describe("buildInteriorVideoPreview", () => {
  it("quadro 4:5, moldura de vídeo no meio (título em cima, corpo embaixo)", () => {
    const svg = buildInteriorVideoPreview("editorial-noir", brand);
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain("<path"); // ícone de play
    expect(svg).toContain("video-card-hatch"); // moldura de vídeo (mockup)
  });

  it("herda a identidade do preset pedido, não a do brand salvo", () => {
    // brand vem de Ajustes com o preset SALVO (ou nenhum): a miniatura
    // precisa refletir a LINHA da lista, senão as 5 saem iguais.
    const luxe = buildInteriorVideoPreview("serif-luxe", brand);
    const pop = buildInteriorVideoPreview("pop-creator", brand);
    expect(luxe).toContain("DM Serif Display");
    expect(pop).toContain("Varela Round");
    expect(luxe).not.toBe(pop);
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

// Regressão 2026-07-27: o `previewBrand` de Ajustes não carrega
// layoutPreset, e vários builders decidem o layout lendo
// `brand.layoutPreset` por dentro (renderAndUploadCard, overlays de
// vídeo). Sem fixar o preset no brand, as 5 linhas da lista saíam
// todas com a mesma identidade — o usuário via "capa e interior não
// carregam o layout".
describe("preset da LINHA vence o preset do brand", () => {
  const brandComPresetErrado: CardBrand = {
    colorBackground: "#0B0B12",
    colorAccent: "#C8A24A",
    colorText: "#FFFFFF",
    fontFamily: "Inter",
    brandName: "Marca",
    wordmark: "MARCA®",
    handle: "marca.ia",
    // Simula Ajustes com Serif Luxe salvo enquanto se pede outra linha.
    layoutPreset: "serif-luxe",
  };

  it("capa: cada preset gera SVG distinto mesmo com brand em serif-luxe", () => {
    const presets: LayoutPreset[] = [
      "editorial-noir",
      "brutalism",
      "serif-luxe",
      "swiss-mono",
      "pop-creator",
    ];
    const svgs = presets.map((p) => buildCoverPreview(p, brandComPresetErrado));
    expect(new Set(svgs).size).toBe(presets.length);
  });

  it("interior: idem para os cards do meio do carrossel", () => {
    const brut = buildInteriorPreview("brutalism", brandComPresetErrado);
    const pop = buildInteriorPreview("pop-creator", brandComPresetErrado);
    expect(brut).toContain("Anton");
    expect(pop).toContain("Varela Round");
  });

  it("vídeo de feed: a miniatura segue a linha, não o brand", () => {
    const brut = buildFeedVideoPreview("brutalism", brandComPresetErrado);
    const luxe = buildFeedVideoPreview("serif-luxe", brandComPresetErrado);
    expect(brut).toContain("Anton");
    expect(luxe).toContain("DM Serif Display");
  });
});
