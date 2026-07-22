import { describe, it, expect } from "vitest";
import { renderFromSpec } from "@/lib/template-render";
import { coverPreset, cardPreset } from "@/lib/template-presets";
import { rasterizeSvg } from "@/lib/svg-render";
import type { CardBrand } from "@/lib/carousel-render";
import type { TemplateSpec } from "@/lib/types";

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#E0219C",
  colorText: "#FFFFFF",
  fontFamily: "Space Grotesk",
  brandName: "João Rodrigues",
  wordmark: "OVERLENS®",
  handle: "0verlens",
  keywords: ["DESIGN", "ARTE"],
  brandMark: "auto",
};

describe("renderFromSpec", () => {
  it("capa: desenha headline + divisor com wordmark + dimensões", () => {
    const svg = renderFromSpec(coverPreset, brand, { headline: "Diga adeus às fake news" });
    expect(svg).toContain('width="1080"');
    expect(svg).toContain("Diga adeus"); // trecho da 1ª linha (o resto quebra em tspan)
    expect(svg).toContain("OVERLENS"); // wordmark no divisor
    expect(svg).toContain("<line"); // réguas do divisor
  });

  it("página: desenha rótulo de marca + headline + corpo", () => {
    const svg = renderFromSpec(cardPreset, brand, { headline: "O que aconteceu", body: "Resumo curto" });
    expect(svg).toContain("O que aconteceu");
    expect(svg).toContain("Resumo curto");
    expect(svg).toContain("@0verlens"); // brand.label
  });

  it("ignora elementos com visible:false", () => {
    const spec: TemplateSpec = {
      ...cardPreset,
      elements: cardPreset.elements.map((e) =>
        e.id === "body" ? { ...e, visible: false } : e
      ),
    };
    const svg = renderFromSpec(spec, brand, { headline: "H", body: "NAO DEVE APARECER" });
    expect(svg).not.toContain("NAO DEVE APARECER");
  });

  it("resolve style.color 'accent' e 'auto'", () => {
    const svg = renderFromSpec(coverPreset, brand, { headline: "X" });
    expect(svg).toContain(brand.colorAccent); // brand.name usa accent
    expect(svg).toContain(brand.colorText); // headline auto → texto claro
  });
});

describe("renderFromSpec (rasteriza)", () => {
  it("capa e página viram PNG válido", () => {
    for (const spec of [coverPreset, cardPreset]) {
      const png = rasterizeSvg(
        renderFromSpec(spec, brand, { headline: "Título de teste do carrossel", body: "Corpo do card." })
      );
      expect(png.length).toBeGreaterThan(1000);
      expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});
