import { describe, it, expect } from "vitest";
import {
  buildCardSvg,
  buildCoverSvg,
  brandLabelText,
  wrapText,
  CARD_W,
  CARD_H,
  type CardBrand,
} from "@/lib/carousel-render";
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

describe("brandLabelText", () => {
  const b = (over: Partial<CardBrand>): CardBrand => ({ ...brand, ...over });

  it("brandMark 'handle' → @handle", () => {
    expect(brandLabelText(b({ brandMark: "handle", handle: "0verlens" }))).toBe("@0verlens");
  });
  it("brandMark 'wordmark' → WORDMARK", () => {
    expect(brandLabelText(b({ brandMark: "wordmark", wordmark: "Overlens" }))).toBe("OVERLENS");
  });
  it("brandMark 'wordmark+handle' junta os dois", () => {
    const r = brandLabelText(b({ brandMark: "wordmark+handle", wordmark: "Ov", handle: "h" }));
    expect(r).toContain("OV");
    expect(r).toContain("@h");
  });
  it("brandMark 'auto' mostra @handle + keywords", () => {
    const r = brandLabelText(b({ brandMark: "auto", handle: "h", keywords: ["ARTE", "TECH"] }));
    expect(r).toContain("@h");
    expect(r).toContain("ARTE, TECH");
  });
  it("brandMark 'none' e 'icon' → null", () => {
    expect(brandLabelText(b({ brandMark: "none" }))).toBeNull();
    expect(brandLabelText(b({ brandMark: "icon" }))).toBeNull();
  });
});

describe("buildCoverSvg", () => {
  const cover: CarouselCard = { idx: 0, role: "hook", headline: "Diga adeus às fake news", body: "" };

  it("tem dimensões e mostra o wordmark no divisor", () => {
    const svg = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" });
    expect(svg).toContain(`width="${CARD_W}"`);
    expect(svg).toContain(`height="${CARD_H}"`);
    expect(svg).toContain("OVERLENS"); // wordmark em caixa alta
    expect(svg).toContain("<line"); // réguas do divisor
  });

  it("sem wordmark, não desenha as réguas do divisor", () => {
    const svg = buildCoverSvg(cover, { ...brand, wordmark: null, brandName: null });
    expect(svg).not.toContain("<line");
  });
});
