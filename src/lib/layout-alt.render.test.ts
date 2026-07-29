// Smoke test do render real (resvg) dos 4 layouts ALTERNATIVOS (Fase 3):
// garante que as fontes próprias de cada preset (Anton, DM Serif Display,
// Inter 800, Varela Round, IBM Plex Mono) resolvem e o SVG rasteriza —
// mesma classe de bug que já pegamos antes (WOFF não suportado, glyph
// ruim de uma fonte específica) só aparece num render de verdade.
import { describe, it, expect } from "vitest";
import { rasterizeSvg } from "@/lib/svg-render";
import { buildBrutalismCoverSvg, buildBrutalismCardSvg } from "@/lib/layout-brutalism";
import { buildSerifLuxeCoverSvg, buildSerifLuxeCardSvg } from "@/lib/layout-serif-luxe";
import { buildSwissMonoCoverSvg, buildSwissMonoCardSvg } from "@/lib/layout-swiss-mono";
import { buildPopCreatorCoverSvg, buildPopCreatorCardSvg } from "@/lib/layout-pop-creator";
import type { CardBrand } from "@/lib/render-shared";

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#E11D2A",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Marca",
  handle: "marca.ia",
  keywords: ["DESIGN", "IA"],
};

const HEADLINE = "OpenAI acabou de mudar tudo na IA generativa hoje";
const BODY = "Todo dia um resumo rápido do que importa em IA.";

function expectValidPng(png: Buffer) {
  expect(png.length).toBeGreaterThan(1000);
  expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
}

const LAYOUTS = [
  { name: "Brutalismo Editorial", buildCover: buildBrutalismCoverSvg, buildCard: buildBrutalismCardSvg },
  { name: "Serif Luxe", buildCover: buildSerifLuxeCoverSvg, buildCard: buildSerifLuxeCardSvg },
  { name: "Swiss Mono", buildCover: buildSwissMonoCoverSvg, buildCard: buildSwissMonoCardSvg },
  { name: "Pop Creator", buildCover: buildPopCreatorCoverSvg, buildCard: buildPopCreatorCardSvg },
];

describe.each(LAYOUTS)("render real do layout $name (resvg)", ({ buildCover, buildCard }) => {
  it("rasteriza a CAPA em PNG válido", () => {
    const { svg } = buildCover(HEADLINE, brand, false, { showSwipeHint: true });
    expectValidPng(rasterizeSvg(svg));
  });

  it("rasteriza o FECHAMENTO (sem swipe hint, com body, ícones) em PNG válido", () => {
    const { svg } = buildCover(HEADLINE, brand, false, {
      showSwipeHint: false,
      body: BODY,
      overlay: { theme: "dark", alpha: 0 },
    });
    expectValidPng(rasterizeSvg(svg));
  });

  it("PÁGINA 1 do post único (sem swipe hint, overlay presente, mas NÃO fechamento) não desenha os ícones de ação", () => {
    // Regressão: a heurística padrão (overlay presente + sem swipe hint =
    // fechamento) confundia a página 1 do post único com a contra-capa e
    // desenhava os ícones indevidamente — showActionIcons:false precisa
    // sobrepor a heurística.
    const withDefaultHeuristic = buildCover(HEADLINE, brand, false, {
      showSwipeHint: false,
      overlay: { theme: "dark", alpha: 0.3 },
    });
    expect(withDefaultHeuristic.svg).toContain("M6 4a2 2 0 0 1 2-2h8"); // ícone salvar (bookmark) — heurística padrão mostra

    const forcedOff = buildCover(HEADLINE, brand, false, {
      showSwipeHint: false,
      overlay: { theme: "dark", alpha: 0.3 },
      showActionIcons: false,
    });
    expect(forcedOff.svg).not.toContain("M6 4a2 2 0 0 1 2-2h8");
  });

  it("rasteriza um card interior em PNG válido", () => {
    const svg = buildCard(HEADLINE, BODY, brand, { index: 2, total: 7 });
    expectValidPng(rasterizeSvg(svg));
  });
});

// Rótulo do topo por post (migration 046) — os builders já aceitavam
// `eyebrow`, mas nenhum caminho do app passava valor: era default fixo.
describe("rótulo do topo (046)", () => {
  it.each(LAYOUTS)("$name usa o rótulo do post quando existe", ({ buildCover }) => {
    const comRotulo = buildCover(HEADLINE, brand, false, { eyebrow: "Edição 12" }).svg;
    const padrao = buildCover(HEADLINE, brand, false, {}).svg;
    expect(comRotulo).toContain("EDIÇÃO 12");
    expect(comRotulo).not.toBe(padrao);
  });
});
