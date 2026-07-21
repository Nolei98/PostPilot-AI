import { describe, it, expect } from "vitest";
import { rasterizeSvg } from "@/lib/svg-render";
import { buildCenteredPhraseSvg } from "@/lib/layout-centered";
import type { CardBrand, LayoutPreset } from "@/lib/render-shared";

const baseBrand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7C5CFF",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Marca Teste",
  wordmark: "MARCA®",
  handle: "marca.ia",
};

const PRESETS: LayoutPreset[] = ["editorial-noir", "brutalism", "serif-luxe", "swiss-mono", "pop-creator"];
const FONT_FOR: Record<LayoutPreset, string> = {
  "editorial-noir": "Inter",
  brutalism: "Anton",
  "serif-luxe": "DM Serif Display",
  "swiss-mono": "Inter",
  "pop-creator": "Varela Round",
};

describe("buildCenteredPhraseSvg", () => {
  it("não desenha o wordmark nem qualquer marca — minimalista de propósito", () => {
    const { svg } = buildCenteredPhraseSvg("Um título qualquer", { ...baseBrand, layoutPreset: "editorial-noir" });
    expect(svg).not.toContain("MARCA®");
    expect(svg).not.toContain(">marca.ia<");
  });

  it.each(PRESETS)("usa a fonte de destaque do layout '%s'", (preset) => {
    const { svg } = buildCenteredPhraseSvg("Um título qualquer", { ...baseBrand, layoutPreset: preset });
    expect(svg).toContain(`font-family="${FONT_FOR[preset]}"`);
  });

  it("centraliza o texto (text-anchor middle)", () => {
    const { svg } = buildCenteredPhraseSvg("Frase curta", { ...baseBrand, layoutPreset: "editorial-noir" });
    expect(svg).toContain('text-anchor="middle"');
  });

  it("rasteriza em PNG válido nos 5 layouts", () => {
    for (const preset of PRESETS) {
      const { svg } = buildCenteredPhraseSvg("A nova geração de modelos de IA", { ...baseBrand, layoutPreset: preset });
      const png = rasterizeSvg(svg);
      expect(png.length).toBeGreaterThan(1000);
      expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it("blurBandTop cobre o bloco de texto (cai abaixo do topo do quadro)", () => {
    const { blurBandTop } = buildCenteredPhraseSvg("Frase curta", { ...baseBrand, layoutPreset: "editorial-noir" });
    expect(blurBandTop).toBeGreaterThan(0);
    expect(blurBandTop).toBeLessThan(1350);
  });
});
