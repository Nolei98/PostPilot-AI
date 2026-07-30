// Texto sobre FOTO nos overlays de vídeo: a placa de leitura e a cor do
// texto têm que ser decididas JUNTAS.
//
// O bug que isto tranca (visto no #0585 em 30/07): o card interior com
// vídeo aceitava `photoBg` (que troca o fundo sólido por uma placa
// translúcida) mas continuava desenhando o texto na cor da MARCA. Sobre
// foto clara — placa branca + texto branco — o título e o corpo sumiam
// por completo; só sobrava o que era da cor de realce.
//
// O teste é por CHAMADA e não por pixel de propósito: o defeito nasceu de
// um chamador que esqueceu de passar a cor, então o que precisa ser
// garantido é que esquecer não seja possível.
import { describe, it, expect } from "vitest";
import { buildCardVideoOverlaySvg, buildFeedVideoOverlaySvg } from "@/lib/image";
import type { CardBrand, LayoutPreset } from "@/lib/render-shared";

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

/** Marca de texto BRANCO — a combinação que sumia sobre placa clara. */
function brandBranca(preset: LayoutPreset): CardBrand {
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

/** Cores de preenchimento de TEXTO no SVG (ignora rect/placa). */
function coresDeTexto(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*fill="(#[0-9a-fA-F]{3,6})"/g)].map((m) => m[1].toUpperCase());
}

describe("texto sobre foto no vídeo (placa + cor decididas juntas)", () => {
  for (const preset of PRESETS) {
    it(`${preset}: card interior com placa CLARA não desenha texto branco`, () => {
      const { svg } = buildCardVideoOverlaySvg(
        { headline: "Título que precisa continuar legível", body: "Corpo de apoio do card." },
        brandBranca(preset),
        { pageKind: "interior", index: 2, total: 5, photoBg: { theme: "light", alpha: 0.55 } }
      );
      expect(coresDeTexto(svg)).not.toContain("#FFFFFF");
    });

    it(`${preset}: feed 4:5 com placa CLARA não desenha texto branco`, () => {
      const { svg } = buildFeedVideoOverlaySvg("Título que precisa continuar legível", brandBranca(preset), {
        theme: "light",
        alpha: 0.55,
      });
      expect(coresDeTexto(svg)).not.toContain("#FFFFFF");
    });
  }

  it("placa ESCURA mantém o texto claro", () => {
    const { svg } = buildCardVideoOverlaySvg(
      { headline: "Título sobre foto escura", body: "Corpo." },
      brandBranca("editorial-noir"),
      { pageKind: "interior", index: 2, total: 5, photoBg: { theme: "dark", alpha: 0.5 } }
    );
    expect(coresDeTexto(svg)).toContain("#FFFFFF");
  });

  it("sem foto, a cor da marca continua valendo", () => {
    const marca = { ...brandBranca("editorial-noir"), colorText: "#F0E6D2" };
    const { svg } = buildCardVideoOverlaySvg(
      { headline: "Fundo sólido da marca", body: "Corpo." },
      marca,
      { pageKind: "interior", index: 2, total: 5 }
    );
    expect(coresDeTexto(svg)).toContain("#F0E6D2");
  });

  it("realce fraco sobre placa clara é empurrado até contrastar", () => {
    // Amarelo puro tem ~1.07:1 contra branco — invisível na placa clara.
    const marca = { ...brandBranca("editorial-noir"), colorAccent: "#FFE600" };
    const { svg } = buildCardVideoOverlaySvg(
      { headline: "Realce que não pode sumir", body: "Corpo." },
      marca,
      { pageKind: "interior", index: 2, total: 5, photoBg: { theme: "light", alpha: 0.55 } }
    );
    expect(svg).not.toContain("#FFE600");
  });
});
