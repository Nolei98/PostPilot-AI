// IDs de SVG são GLOBAIS no documento HTML.
//
// A Fila desenha dezenas de prévias inline na mesma página. Enquanto os
// builders usavam ids fixos ("card-video-hole", "feed-video-hole",
// "video-hatch"…), todo `url(#card-video-hole)` resolvia pro PRIMEIRO
// elemento com esse id no documento — a máscara de OUTRO card. O buraco
// do vídeo saía na posição e no tamanho de um card alheio: aparecia um
// bloco do fundo do container colado no título e a moldura do vídeo com
// medida errada (relatado no #0585 em 30/07).
//
// No render final nunca apareceu: o resvg rasteriza cada SVG isolado, e
// aí id repetido não colide com nada. Por isso o teste olha o caso do
// BROWSER — dois SVGs diferentes concatenados, como a página faz.
import { describe, it, expect } from "vitest";
import { buildCardVideoOverlaySvg, buildFeedVideoOverlaySvg } from "@/lib/image";
import {
  buildVideoPreview,
  buildFeedVideoPreview,
  buildFeedVideoPhotoPreview,
  buildInteriorVideoPreview,
  PREVIEW_LAYOUTS,
} from "@/lib/layout-preview";
import type { CardBrand, LayoutPreset } from "@/lib/render-shared";

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

/** Todo id declarado no markup. */
function ids(svg: string): string[] {
  return [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
}

/** Todo id referenciado por url(#...). */
function refs(svg: string): string[] {
  return [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
}

describe("ids de SVG não colidem entre prévias na mesma página", () => {
  it("dois cards com molduras DIFERENTES não compartilham id de máscara", () => {
    // Títulos de tamanhos diferentes ⇒ a moldura senta em y diferente.
    const curto = buildCardVideoOverlaySvg(
      { headline: "Curto", body: "Corpo." },
      brand("editorial-noir"),
      { pageKind: "interior", index: 1, total: 5 }
    ).svg;
    const longo = buildCardVideoOverlaySvg(
      {
        headline: "Um título bem mais longo que ocupa três linhas inteiras do card",
        body: "Corpo.",
      },
      brand("editorial-noir"),
      { pageKind: "interior", index: 2, total: 5 }
    ).svg;

    const iCurto = ids(curto);
    const iLongo = ids(longo);
    expect(iCurto.length).toBeGreaterThan(0);
    expect(iCurto.filter((id) => iLongo.includes(id))).toEqual([]);

    // E cada um referencia SÓ o próprio id — que é o que quebrava.
    expect(refs(curto).every((r) => iCurto.includes(r))).toBe(true);
    expect(refs(longo).every((r) => iLongo.includes(r))).toBe(true);
  });

  it("card e feed 4:5 não compartilham id mesmo com a mesma marca", () => {
    const card = buildCardVideoOverlaySvg(
      { headline: "Mesma marca, outro formato", body: "Corpo." },
      brand("editorial-noir"),
      { pageKind: "interior", index: 1, total: 5 }
    ).svg;
    const feed = buildFeedVideoOverlaySvg("Mesma marca, outro formato", brand("editorial-noir")).svg;
    expect(ids(card).filter((id) => ids(feed).includes(id))).toEqual([]);
  });

  it("a página inteira de Ajustes (8 presets × formatos) não repete id", () => {
    // Reproduz o pior caso real: todas as miniaturas de layout inline no
    // mesmo documento.
    const todos: string[] = [];
    for (const { key } of PREVIEW_LAYOUTS) {
      const b = brand(key);
      todos.push(
        ...ids(buildVideoPreview(key, b)),
        ...ids(buildFeedVideoPreview(key, b)),
        ...ids(buildFeedVideoPhotoPreview(key, b)),
        ...ids(buildInteriorVideoPreview(key, b))
      );
    }
    const repetidos = todos.filter((id, i) => todos.indexOf(id) !== i);
    expect([...new Set(repetidos)]).toEqual([]);
  });

  it("geometria idêntica pode reusar o id — máscaras iguais não se atrapalham", () => {
    const a = buildCardVideoOverlaySvg(
      { headline: "Mesmo título", body: "Corpo." },
      brand("editorial-noir"),
      { pageKind: "interior", index: 1, total: 5 }
    ).svg;
    const b = buildCardVideoOverlaySvg(
      { headline: "Mesmo título", body: "Corpo." },
      brand("editorial-noir"),
      { pageKind: "interior", index: 1, total: 5 }
    ).svg;
    expect(ids(a)).toEqual(ids(b));
  });
});
