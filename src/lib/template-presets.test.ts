import { describe, it, expect } from "vitest";
import { BASE_PRESETS } from "@/lib/template-presets";
import { renderFromSpec } from "@/lib/template-render";
import { rasterizeSvg } from "@/lib/svg-render";
import type { CardBrand } from "@/lib/carousel-render";
import type { Surface } from "@/lib/types";

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

const SURFACES: Surface[] = ["cover_image", "video_cover", "carousel_page", "carousel_last"];

describe("BASE_PRESETS (Sprint B+, B13)", () => {
  it("tem ao menos 4 presets por superfície", () => {
    for (const surface of SURFACES) {
      const count = BASE_PRESETS.filter((p) => p.spec.surface === surface).length;
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });

  it("tem ao menos 16 presets no total", () => {
    expect(BASE_PRESETS.length).toBeGreaterThanOrEqual(16);
  });

  it("cada preset renderiza um PNG válido", () => {
    for (const { spec } of BASE_PRESETS) {
      const svg = renderFromSpec(spec, brand, {
        headline: "Manchete de teste do template studio",
        body: "Corpo curto de exemplo pro card.",
        cta: "SALVE ESSE POST →",
      });
      const png = rasterizeSvg(svg);
      expect(png.length).toBeGreaterThan(1000);
      expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it("existe variação de tratamento de marca: com @handle, com wordmark e sem marca nenhuma", () => {
    const svgs = BASE_PRESETS.map(({ spec }) =>
      renderFromSpec(spec, brand, { headline: "H", body: "B", cta: "C" })
    );
    expect(svgs.some((s) => s.includes("@0verlens"))).toBe(true);
    expect(svgs.some((s) => s.includes("OVERLENS"))).toBe(true);
    expect(
      svgs.some((s) => !s.includes("@0verlens") && !s.includes("OVERLENS"))
    ).toBe(true);
  });

  it("canvas de video_cover é 1080x1920 (Reels); os demais são 1080x1350", () => {
    for (const { spec } of BASE_PRESETS) {
      if (spec.surface === "video_cover") {
        expect(spec.canvas).toEqual({ w: 1080, h: 1920 });
      } else {
        expect(spec.canvas).toEqual({ w: 1080, h: 1350 });
      }
    }
  });
});
