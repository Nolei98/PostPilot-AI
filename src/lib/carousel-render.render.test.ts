// Smoke test do render real: buildCardSvg → resvg → PNG. Garante que o
// SVG gerado é válido e rasteriza (fontes resolvidas). Mais pesado
// (carrega font-data + binding nativo do resvg) — por isso separado.
import { describe, it, expect } from "vitest";
import { rasterizeSvg } from "@/lib/svg-render";
import { buildCardSvg, type CardBrand } from "@/lib/carousel-render";
import type { CarouselCard } from "@/lib/ai/carousel";

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7C5CFF",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Marca",
};

describe("render real do card (resvg)", () => {
  it("rasteriza um card em PNG válido", () => {
    const card: CarouselCard = {
      idx: 0,
      role: "hook",
      headline: "OpenAI acabou de mudar tudo na IA",
      body: "Deslize para entender.",
    };
    const png = rasterizeSvg(buildCardSvg(card, brand));
    expect(png.length).toBeGreaterThan(1000);
    // assinatura PNG: 89 50 4E 47
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
