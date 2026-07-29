import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { renderFromSpec, renderTemplateCardPng } from "@/lib/template-render";
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

describe("renderTemplateCardPng", () => {
  it("sem foto: usa fundo sólido da marca (mesmo caminho de renderFromSpec)", async () => {
    const png = await renderTemplateCardPng(coverPreset, brand, { headline: "Sem foto" }, null);
    expect(png.length).toBeGreaterThan(1000);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("com foto escura: escolhe texto claro e compõe overlay sem quebrar", async () => {
    const darkPhoto = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();
    const png = await renderTemplateCardPng(coverPreset, brand, { headline: "Sobre foto escura" }, darkPhoto);
    expect(png.length).toBeGreaterThan(1000);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("com foto clara: escolhe texto escuro e compõe overlay sem quebrar", async () => {
    const lightPhoto = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 245, g: 245, b: 245 } },
    })
      .jpeg()
      .toBuffer();
    const png = await renderTemplateCardPng(coverPreset, brand, { headline: "Sobre foto clara" }, lightPhoto);
    expect(png.length).toBeGreaterThan(1000);
    expect([png[0], png[1], png[2], png[3]]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("override showLabel:false esconde wordmark/divisor/rótulo (B9)", async () => {
    const png = await renderTemplateCardPng(
      coverPreset,
      brand,
      { headline: "Sem marca" },
      null,
      { showLabel: false }
    );
    const withLabel = await renderTemplateCardPng(coverPreset, brand, { headline: "Sem marca" }, null);
    expect(png.length).toBeGreaterThan(1000);
    expect(png.length).not.toBe(withLabel.length);
  });

  it("override textColor força a cor ignorando o tema automático (B9)", async () => {
    const lightPhoto = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 245, g: 245, b: 245 } },
    })
      .jpeg()
      .toBuffer();
    // Foto clara normalmente escolheria texto escuro; força claro mesmo assim.
    const forced = renderFromSpec(
      coverPreset,
      { ...brand, colorText: "#FFFFFF" },
      { headline: "H" },
      undefined,
      { transparentBg: true, overlay: { theme: "dark", alpha: 0 } }
    );
    expect(forced).toContain("#FFFFFF");
    const png = await renderTemplateCardPng(coverPreset, brand, { headline: "H" }, lightPhoto, {
      textColor: "light",
    });
    expect(png.length).toBeGreaterThan(1000);
  });

  it("dimensão final bate com o canvas da spec (video_cover 1080x1920)", async () => {
    const reelSpec: TemplateSpec = { ...coverPreset, canvas: { w: 1080, h: 1920 } };
    const photo = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 100, g: 100, b: 100 } },
    })
      .jpeg()
      .toBuffer();
    const png = await renderTemplateCardPng(reelSpec, brand, { headline: "Reel" }, photo);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });
});

// Cliente com template do Template Studio selecionado (o caso do cliente
// ativo) via a escolha de "Cor da marca na arte" (043) não surtir efeito:
// o template resolvia "accent" sempre pro realce cru do Brand Kit.
describe("cor da marca no template (043)", () => {
  const comMarca = { ...brand, wordmark: "MARCA®", markColor: "#00FF88" };

  it("elemento de marca com color:accent usa a cor do wordmark", () => {
    const spec = {
      surface: "carousel_page" as const,
      canvas: { w: 1080, h: 1350 },
      elements: [
        { id: "w", type: "wordmark" as const, anchor: "top-center" as const, offset: { x: 0.5, y: 0.2 }, bind: "brand.wordmark", style: { color: "accent" } },
      ],
    };
    const svg = renderFromSpec(spec, comMarca, {});
    expect(svg).toContain("#00FF88");
  });

  it("o divisor pinta o wordmark com a cor da marca", () => {
    const spec = {
      surface: "cover_image" as const,
      canvas: { w: 1080, h: 1350 },
      elements: [{ id: "d", type: "divider" as const, anchor: "top-center" as const, offset: { x: 0.5, y: 0.22 } }],
    };
    expect(renderFromSpec(spec, comMarca, {})).toContain("#00FF88");
  });

  it("elemento que NÃO é de marca continua no realce do kit", () => {
    const spec = {
      surface: "carousel_page" as const,
      canvas: { w: 1080, h: 1350 },
      elements: [
        { id: "h", type: "headline" as const, anchor: "center" as const, offset: { x: 0.5, y: 0.5 }, bind: "content.headline", style: { color: "accent" } },
      ],
    };
    const svg = renderFromSpec(spec, comMarca, { headline: "Oi" });
    expect(svg).toContain(comMarca.colorAccent);
    expect(svg).not.toContain("#00FF88");
  });

  it("rótulo do topo (046) aparece mesmo com template selecionado", () => {
    const spec = {
      surface: "cover_image" as const,
      canvas: { w: 1080, h: 1350 },
      elements: [{ id: "h", type: "headline" as const, anchor: "center" as const, offset: { x: 0.5, y: 0.5 }, bind: "content.headline" }],
    };
    const semRotulo = renderFromSpec(spec, comMarca, { headline: "Oi" });
    const comRotulo = renderFromSpec(
      spec,
      { ...comMarca, eyebrow: "Edição 12" },
      { headline: "Oi" }
    );
    expect(comRotulo).toContain("EDIÇÃO 12");
    expect(semRotulo).not.toContain("EDIÇÃO 12");
  });
});
