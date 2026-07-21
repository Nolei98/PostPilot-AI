// Smoke test do render real: buildCardSvg → resvg → PNG. Garante que o
// SVG gerado é válido e rasteriza (fontes resolvidas). Mais pesado
// (carrega font-data + binding nativo do resvg) — por isso separado.
import { describe, it, expect } from "vitest";
import { rasterizeSvg } from "@/lib/svg-render";
import { buildCardSvg, buildCoverSvg, type CardBrand } from "@/lib/carousel-render";
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

  it("rasteriza a CAPA (divisor wordmark) em PNG válido", () => {
    const cover: CarouselCard = {
      idx: 0,
      role: "hook",
      headline: "OpenAI acabou de mudar tudo na IA generativa hoje",
      body: "",
    };
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: "OVERLENS®" });
    const png = rasterizeSvg(svg);
    expect(png.length).toBeGreaterThan(1000);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("rasteriza o FECHAMENTO (sem swipe hint, com body) em PNG válido", () => {
    const closing: CarouselCard = {
      idx: 4,
      role: "cta",
      headline: "Siga para não perder as próximas",
      body: "Todo dia um resumo rápido do que importa em IA.",
    };
    const { svg } = buildCoverSvg(closing, { ...brand, wordmark: "OVERLENS®" }, false, {
      showSwipeHint: false,
      body: closing.body,
    });
    const png = rasterizeSvg(svg);
    expect(png.length).toBeGreaterThan(1000);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
