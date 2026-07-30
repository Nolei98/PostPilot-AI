// Folga MÍNIMA entre um rótulo curto e o título logo abaixo dele.
//
// Onde dois tipos de texto se encontram — o numeral "01", a meta-linha,
// a etiqueta de seção — o vão é o mesmo do resto do produto: a razão
// já padronizada na spec (labelToHeadlineGap, = wordmarkToHeadlineGap).
// Antes cada layout tinha o seu número escolhido à mão (92px no card com
// vídeo, 1,05× no Swiss, 96 fixo no Pop), e o "01" encostava no título
// exatamente onde a fonte é maior — relatado no #0585 em 30/07.
//
// O teste mede o SVG gerado, não a constante: é a distância entre a
// baseline do rótulo e a da primeira linha do título que o cliente vê.
import { describe, it, expect } from "vitest";
import { cardVideoLayoutParts } from "@/lib/image";
import { labelToHeadlineGap, type CardBrand, type LayoutPreset } from "@/lib/render-shared";
import { buildCardVideoOverlaySvg } from "@/lib/image";

const PRESETS: LayoutPreset[] = [
  "editorial-noir",
  "brutalism",
  "serif-luxe",
  "swiss-mono",
  "pop-creator",
  "doce-vitrine",
  "clinica-clara",
  "tribuna",
];

function brand(preset: LayoutPreset): CardBrand {
  return {
    colorBackground: "#0B0B12",
    colorAccent: "#7C5CFF",
    colorText: "#FFFFFF",
    fontFamily: "Inter",
    brandName: "Marca",
    wordmark: "MARCA",
    handle: "marca",
    keywords: null,
    brandMark: "wordmark",
    layoutPreset: preset,
  } as CardBrand;
}

/** Títulos curtos puxam o corpo de fonte MAIOR — o pior caso do vão. */
const TITULOS = [
  "Curto",
  "Um título de tamanho médio aqui",
  "Um título consideravelmente mais longo que ocupa várias linhas do card inteiro",
];

describe("rótulo → título: folga mínima padronizada", () => {
  it("a razão é a mesma do wordmark, em qualquer corpo", () => {
    expect(labelToHeadlineGap(104)).toBe(162);
    expect(labelToHeadlineGap(86)).toBe(134);
    expect(labelToHeadlineGap(70)).toBe(109);
  });

  for (const preset of PRESETS) {
    for (const headline of TITULOS) {
      it(`${preset}: numeral do card com vídeo respeita o piso ("${headline.slice(0, 18)}…")`, () => {
        const { headlineSvg } = cardVideoLayoutParts(
          { headline, body: "Corpo de apoio." },
          brand(preset),
          { pageKind: "interior", index: 3, total: 8 }
        );
        // O numeral é o primeiro <text> (y direto no atributo); a 1ª linha
        // do título é o primeiro <tspan>.
        const numeralY = Number(headlineSvg.match(/<text[^>]*\sy="(\d+)"/)?.[1]);
        const tituloY = Number(headlineSvg.match(/<tspan[^>]*y="(\d+)"/)?.[1]);
        const corpo = Number(headlineSvg.match(/font-size="(\d+)"[^>]*text-anchor/)?.[1]);
        expect(numeralY).toBeGreaterThan(0);
        expect(tituloY).toBeGreaterThan(numeralY);
        expect(tituloY - numeralY).toBeGreaterThanOrEqual(labelToHeadlineGap(corpo));
      });
    }
  }

  it("a moldura do vídeo continua abaixo do título depois do vão maior", () => {
    for (const preset of PRESETS) {
      const { frame, headlineSvg } = cardVideoLayoutParts(
        { headline: "Curto", body: "Corpo." },
        brand(preset),
        { pageKind: "interior", index: 3, total: 8 }
      );
      const baselines = [...headlineSvg.matchAll(/<tspan[^>]*y="(\d+)"/g)].map((m) => Number(m[1]));
      expect(frame.y).toBeGreaterThan(Math.max(...baselines));
      expect(frame.y + frame.h).toBeLessThan(1350);
    }
  });

  it("o svg completo continua sendo gerado (nada estourou o quadro)", () => {
    for (const preset of PRESETS) {
      const { svg } = buildCardVideoOverlaySvg(
        { headline: "Curto", body: "Corpo." },
        brand(preset),
        { pageKind: "interior", index: 3, total: 8 }
      );
      expect(svg).toContain("</svg>");
    }
  });
});
