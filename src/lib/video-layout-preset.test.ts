// ============================================================
// Regressão de 2026-07-27: trocar o layout em Ajustes re-renderizava os
// vídeos da fila (arquivo novo, ?v= novo), mas eles saíam com a fonte
// genérica da marca — o preset era ignorado pelos overlays de vídeo.
// Sintoma pro usuário: "só os posts novos foram pro Luxe".
//
// Aqui o teste é do PIXEL, não do SVG: rasteriza o mesmo texto em dois
// presets e exige que o resultado seja diferente. Comparar a string do
// SVG passaria mesmo se a fonte não estivesse embutida no resvg.
// ============================================================
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { buildReelsVideoOverlayPng, feedVideoLayoutParts, cardVideoLayoutParts } from "@/lib/image";
import { displayFontFor } from "@/lib/render-shared";
import type { CardBrand } from "@/lib/render-shared";
import type { LayoutPreset } from "@/lib/render-shared";

const HEADLINE = "Aliança de IA fica sem os maiores laboratórios dos EUA";

function brandWith(layoutPreset: LayoutPreset): CardBrand {
  return {
    colorBackground: "#0B0B12",
    colorAccent: "#C8A24A",
    colorText: "#FFFFFF",
    fontFamily: "Inter",
    brandName: "Marca Teste",
    wordmark: "MARCA®",
    handle: "marca.ia",
    layoutPreset,
  };
}

async function poster(): Promise<Buffer> {
  return sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 12, g: 12, b: 18 } },
  })
    .jpeg()
    .toBuffer();
}

describe("displayFontFor", () => {
  it("cada preset tem sua tipografia de destaque", () => {
    expect(displayFontFor("serif-luxe", "Inter").family).toBe("DM Serif Display");
    expect(displayFontFor("brutalism", "Inter").family).toBe("Anton");
    expect(displayFontFor("pop-creator", "Inter").family).toBe("Varela Round");
    expect(displayFontFor("swiss-mono", "Inter")).toEqual({ family: "Inter", weight: 800 });
  });

  it("editorial-noir segue a fonte escolhida em Ajustes", () => {
    expect(displayFontFor("editorial-noir", "Sora").family).toBe("Sora");
    expect(displayFontFor(undefined, "Space Grotesk").family).toBe("Space Grotesk");
  });

  it("presets com um peso só não pedem 800 (evita bold sintético na serifada)", () => {
    expect(displayFontFor("serif-luxe", "Inter").weight).toBe(400);
    expect(displayFontFor("brutalism", "Inter").weight).toBe(400);
    expect(displayFontFor("pop-creator", "Inter").weight).toBe(400);
  });
});

describe("overlay de vídeo respeita o layout_preset", () => {
  it("Reels: Serif Luxe e Editorial Noir rasterizam diferente", async () => {
    const frame = await poster();
    const luxe = await buildReelsVideoOverlayPng(HEADLINE, brandWith("serif-luxe"), frame);
    const noir = await buildReelsVideoOverlayPng(HEADLINE, brandWith("editorial-noir"), frame);

    // Mesmo texto, mesmo quadro: se a fonte do preset estivesse sendo
    // ignorada (o bug), os dois PNGs sairiam byte a byte iguais.
    expect(Buffer.compare(luxe, noir)).not.toBe(0);

    // E os dois continuam PNGs válidos no quadro Reels
    for (const png of [luxe, noir]) {
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(1920);
    }
  }, 30_000);

  it("Reels: Brutalism difere de Pop Creator", async () => {
    const frame = await poster();
    const anton = await buildReelsVideoOverlayPng(HEADLINE, brandWith("brutalism"), frame);
    const varela = await buildReelsVideoOverlayPng(HEADLINE, brandWith("pop-creator"), frame);
    expect(Buffer.compare(anton, varela)).not.toBe(0);
  }, 30_000);

  it("vídeo de feed: o SVG do título carrega a fonte do preset", () => {
    const luxe = feedVideoLayoutParts(HEADLINE, brandWith("serif-luxe"));
    expect(luxe.headlineSvg).toContain('font-family="DM Serif Display"');
    expect(luxe.headlineSvg).toContain('font-weight="400"');

    const noir = feedVideoLayoutParts(HEADLINE, brandWith("editorial-noir"));
    expect(noir.headlineSvg).toContain('font-family="Inter"');
  });
});

// O usuário reportou que os três formatos de vídeo saíam iguais em
// TODOS os presets — não só a fonte: a assinatura da marca era sempre o
// filete central do Editorial Noir. Cada preset agora assina do seu
// jeito, igual faz nos cards do carrossel.
describe("assinatura de marca por preset (vídeo feed)", () => {
  it("Brutalism assina com bloco sólido na cor de destaque", () => {
    const { dividerSvg } = feedVideoLayoutParts(HEADLINE, brandWith("brutalism"));
    expect(dividerSvg).toContain("<rect");
    expect(dividerSvg).toContain('fill="#C8A24A"');
    expect(dividerSvg).not.toContain("<line");
  });

  it("Swiss Mono assina com barra vertical + rótulo em mono", () => {
    const { dividerSvg } = feedVideoLayoutParts(HEADLINE, brandWith("swiss-mono"));
    expect(dividerSvg).toContain("<rect");
    expect(dividerSvg).toContain('font-family="IBM Plex Mono"');
  });

  it("Pop Creator assina com cápsula arredondada", () => {
    const { dividerSvg } = feedVideoLayoutParts(HEADLINE, brandWith("pop-creator"));
    expect(dividerSvg).toMatch(/<rect[^>]*rx="/);
    expect(dividerSvg).toContain('text-anchor="middle"');
  });

  it("Editorial Noir e Serif Luxe mantêm o filete central", () => {
    for (const preset of ["editorial-noir", "serif-luxe"] as const) {
      const { dividerSvg } = feedVideoLayoutParts(HEADLINE, brandWith(preset));
      expect(dividerSvg).toContain("<line");
    }
  });

  it("presets alternativos alinham o título à esquerda; editoriais ao centro", () => {
    expect(feedVideoLayoutParts(HEADLINE, brandWith("brutalism")).headlineSvg).toContain(
      'text-anchor="start"'
    );
    expect(feedVideoLayoutParts(HEADLINE, brandWith("serif-luxe")).headlineSvg).toContain(
      'text-anchor="middle"'
    );
  });

  it("os 5 presets geram SVGs de título distintos entre si", () => {
    const presets: LayoutPreset[] = [
      "editorial-noir",
      "brutalism",
      "serif-luxe",
      "swiss-mono",
      "pop-creator",
    ];
    const svgs = presets.map((p) => feedVideoLayoutParts(HEADLINE, brandWith(p)).headlineSvg);
    expect(new Set(svgs).size).toBe(presets.length);
  });
});

describe("assinatura de marca por preset (card interior com vídeo)", () => {
  const card = { headline: "Como isso muda o seu processo", body: "Um resumo curto do card." };

  it("cada preset assina o rótulo do seu jeito", () => {
    const brut = cardVideoLayoutParts(card, brandWith("brutalism")).labelSvg;
    const pop = cardVideoLayoutParts(card, brandWith("pop-creator")).labelSvg;
    const noir = cardVideoLayoutParts(card, brandWith("editorial-noir")).labelSvg;
    expect(brut).not.toBe(pop);
    expect(noir).toContain("<line");
    expect(pop).toMatch(/<rect[^>]*rx="/);
  });

  it("o título herda a tipografia do preset", () => {
    expect(cardVideoLayoutParts(card, brandWith("brutalism")).headlineSvg).toContain(
      'font-family="Anton"'
    );
    expect(cardVideoLayoutParts(card, brandWith("pop-creator")).headlineSvg).toContain(
      'font-family="Varela Round"'
    );
  });
});
