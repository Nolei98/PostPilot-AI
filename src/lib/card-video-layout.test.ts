// Geometria do card INTERIOR com vídeo: título → moldura → corpo →
// rodapé. O gap título↔moldura subiu em 29/07 (o vídeo parecia grudado
// embaixo da fonte); este teste existe pra que aumentar a folga não
// empurre o corpo por cima do rodapé no pior caso.
import { describe, it, expect } from "vitest";
import { cardVideoLayoutParts, buildCardVideoOverlaySvg } from "@/lib/image";
import type { CardBrand } from "@/lib/render-shared";

const HEIGHT = 1350;
/** Baseline do rodapé (marca + contador) — ver cardVideoLayoutParts. */
const RODAPE_Y = HEIGHT - 70;

function brand(preset: CardBrand["layoutPreset"]): CardBrand {
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
  };
}

const PRESETS = ["editorial-noir", "brutalism", "serif-luxe", "swiss-mono", "pop-creator"] as const;

/** Título curto = corpo de fonte MAIOR (auto-fit), o pior caso de altura. */
const PIOR_CASO = {
  headline: "Quando o vídeo diz mais",
  body: "Um parágrafo de apoio que ocupa três linhas inteiras pra empurrar o rodapé, testando o limite de baixo da página.",
};

describe("card interior com vídeo — folga do título e limite do rodapé", () => {
  it.each(PRESETS)("%s: a moldura não encosta no título", (preset) => {
    const { frame, headlineSvg } = cardVideoLayoutParts(PIOR_CASO, brand(preset), {
      pageKind: "interior",
      index: 4,
      total: 10,
    });
    // Baseline da ÚLTIMA linha do título (o maior y entre os tspans).
    const baselines = [...headlineSvg.matchAll(/<tspan[^>]*y="(\d+)"/g)].map((m) => Number(m[1]));
    const ultima = Math.max(...baselines);
    expect(frame.y).toBeGreaterThan(ultima);
    // Sobra real entre a base da fonte e o topo da moldura.
    expect(frame.y - ultima).toBeGreaterThanOrEqual(60);
  });

  it.each(PRESETS)("%s: o corpo termina acima do rodapé", (preset) => {
    const { frame, bodySvg } = cardVideoLayoutParts(PIOR_CASO, brand(preset), {
      pageKind: "interior",
      index: 4,
      total: 10,
    });
    const baselines = [...bodySvg.matchAll(/<tspan[^>]*y="(\d+)"/g)].map((m) => Number(m[1]));
    expect(baselines.length).toBeGreaterThan(0);
    expect(Math.max(...baselines)).toBeLessThan(RODAPE_Y - 20);
    expect(frame.y + frame.h).toBeLessThan(HEIGHT);
  });
});

// Com FOTO de fundo, o card interior com vídeo tem texto em cima E
// embaixo da moldura. Até 29/07 só a faixa de baixo ganhava placa de
// leitura: sobre foto clara o título (que vive acima) simplesmente
// sumia — apareceu no painel docs/layouts.html.
describe("placa de leitura cobre as duas faixas de texto", () => {
  const card = { headline: "Quando o vídeo explica melhor", body: "Texto de apoio." };

  it("com foto, a placa é contínua e cobre tudo menos a moldura", () => {
    const { svg } = buildCardVideoOverlaySvg(card, brand("editorial-noir"), {
      pageKind: "interior",
      index: 4,
      total: 10,
      photoBg: { theme: "dark", alpha: 0.55 },
    });
    // Uma superfície só, com o mesmo recorte do fundo sólido — nada de
    // faixas parciais, que deixavam o título sem placa e pintavam
    // manchas claras no card quando o tema era claro.
    expect(svg).toContain('fill="#000000" fill-opacity="0.55" mask="url(#card-video-hole)"');
  });

  it("placa preta e branca são a MESMA placa, só a cor muda", () => {
    const opts = { pageKind: "interior" as const, index: 4, total: 10 };
    const preta = buildCardVideoOverlaySvg(card, brand("editorial-noir"), {
      ...opts,
      photoBg: { theme: "dark", alpha: 0.55 },
    }).svg;
    const branca = buildCardVideoOverlaySvg(card, brand("editorial-noir"), {
      ...opts,
      photoBg: { theme: "light", alpha: 0.55 },
    }).svg;
    expect(preta.replace('fill="#000000"', "COR")).toBe(branca.replace('fill="#FFFFFF"', "COR"));
  });

  it("sem foto, o fundo sólido da marca cobre tudo (nenhuma banda)", () => {
    const { svg } = buildCardVideoOverlaySvg(card, brand("editorial-noir"), {
      pageKind: "interior",
      index: 4,
      total: 10,
    });
    expect(svg).toContain('mask="url(#card-video-hole)"');
    expect(svg).not.toContain("card-video-band-top");
  });

  it("placa com alpha 0 não desenha nada — o quadro fica transparente", () => {
    const { svg } = buildCardVideoOverlaySvg(card, brand("editorial-noir"), {
      pageKind: "interior",
      index: 4,
      total: 10,
      photoBg: { theme: "dark", alpha: 0 },
    });
    expect(svg).not.toContain("card-video-band");
    expect(svg).not.toContain('mask="url(#card-video-hole)"');
  });
});
