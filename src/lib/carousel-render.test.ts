import { describe, it, expect } from "vitest";
import { buildCardSvg, wrapText, CARD_W, CARD_H, type CardBrand } from "@/lib/carousel-render";
import type { CarouselCard } from "@/lib/ai/carousel";

const brand: CardBrand = {
  colorBackground: "#101018",
  colorAccent: "#FF3399",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Marca Teste",
};

describe("wrapText", () => {
  it("quebra por número de caracteres sem cortar palavra", () => {
    const lines = wrapText("um dois tres quatro", 8);
    expect(lines.every((l) => l.length <= 8)).toBe(true);
    expect(lines.join(" ")).toBe("um dois tres quatro");
  });

  it("mantém palavra única maior que o limite numa linha só", () => {
    expect(wrapText("supercalifragilistico", 5)).toEqual(["supercalifragilistico"]);
  });
});

describe("buildCardSvg", () => {
  const card: CarouselCard = { idx: 0, role: "hook", headline: "Gancho <forte> & real", body: "corpo" };

  it("tem as dimensões do card do Instagram (1080x1350)", () => {
    const svg = buildCardSvg(card, brand);
    expect(svg).toContain(`width="${CARD_W}"`);
    expect(svg).toContain(`height="${CARD_H}"`);
  });

  it("aplica cores e fonte do Brand Kit", () => {
    const svg = buildCardSvg(card, brand);
    expect(svg).toContain(brand.colorBackground);
    expect(svg).toContain(brand.colorAccent);
    expect(svg).toContain('font-family="Inter"');
  });

  it("escapa XML no texto do card", () => {
    const svg = buildCardSvg(card, brand);
    expect(svg).toContain("Gancho &lt;forte&gt; &amp; real");
    expect(svg).not.toContain("<forte>");
  });

  it("mostra o nome da marca e o número do card", () => {
    const svg = buildCardSvg({ ...card, idx: 4 }, brand);
    expect(svg).toContain("Marca Teste");
    expect(svg).toContain(">5<"); // idx 4 → card 5
  });
});
