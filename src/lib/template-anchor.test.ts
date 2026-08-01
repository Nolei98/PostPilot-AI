// ============================================================
// A metade VERTICAL da âncora de um elemento de template.
//
// Defeito relatado ao usar o editor em 31/07: "nem todas as posições da
// âncora funcionam". Estava certo — `textAnchor` só lia "-left"/"-right",
// então `top-left` e `bottom-left` desenhavam idêntico e das 9 opções do
// seletor só 3 tinham efeito. A vertical era ignorada.
// ============================================================
import { describe, it, expect } from "vitest";
import { lowestTextBottomFrac } from "@/lib/template-render";
import type { CardBrand } from "@/lib/carousel-render";
import type { TemplateAnchor, TemplateSpec } from "@/lib/types";

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7B2FF7",
  colorText: "#FFFFFF",
  fontFamily: "Sora",
  brandName: "Marca",
  wordmark: "MARCA",
  handle: "marca",
  keywords: [],
  brandMark: "wordmark",
};

/** Spec de um título só, na âncora pedida, sempre no mesmo Y. */
function spec(anchor: TemplateAnchor): TemplateSpec {
  return {
    surface: "carousel_last",
    canvas: { w: 1080, h: 1350 },
    elements: [
      {
        id: "headline",
        type: "headline",
        anchor,
        offset: { x: 0.5, y: 0.5 },
        size: { fontSize: 72, maxWidth: 0.82 },
        style: { lineHeight: 1.12 },
        bind: "content.headline",
      },
    ],
  };
}

const conteudo = { headline: "Um título que ocupa duas linhas inteiras aqui" };
const fundo = (anchor: TemplateAnchor) =>
  lowestTextBottomFrac(spec(anchor), brand, conteudo, 1080, 1350)!;

describe("âncora vertical", () => {
  it("top, center e bottom dão resultados DIFERENTES — o bug era serem iguais", () => {
    const t = fundo("top-center");
    const c = fundo("center");
    const b = fundo("bottom-center");
    expect(new Set([t, c, b]).size).toBe(3);
  });

  it("top empurra o bloco pra baixo do Y; bottom termina no Y", () => {
    expect(fundo("top-center")).toBeGreaterThan(fundo("center"));
    expect(fundo("center")).toBeGreaterThan(fundo("bottom-center"));
  });

  it("bottom faz o texto TERMINAR perto do Y pedido", () => {
    // Y = 0.5 → a base do bloco fica logo abaixo de 0.5 (só a descida).
    expect(fundo("bottom-center")).toBeGreaterThan(0.5);
    expect(fundo("bottom-center")).toBeLessThan(0.56);
  });

  it("a metade horizontal não muda a vertical", () => {
    expect(fundo("top-left")).toBeCloseTo(fundo("top-right"), 5);
    expect(fundo("bottom-left")).toBeCloseTo(fundo("bottom-center"), 5);
  });
});
