import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateCarouselPackage,
  validateCarousel,
  MIN_CARDS,
  MAX_CARDS,
  type CarouselPackage,
} from "@/lib/ai/carousel";

// Força o mock: sem nenhuma key de IA.
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_PROVIDER", "");
});
afterEach(() => vi.unstubAllEnvs());

const input = { title: "OpenAI lançou algo enorme", summary: null, url: "https://ex.com/n" };

describe("generateCarouselPackage (mock)", () => {
  it("gera um carrossel válido dentro de 7–10 cards", async () => {
    const pkg = await generateCarouselPackage(input);
    expect(pkg.cards.length).toBeGreaterThanOrEqual(MIN_CARDS);
    expect(pkg.cards.length).toBeLessThanOrEqual(MAX_CARDS);
    expect(pkg.caption).toBeTruthy();
    expect(pkg.hashtags).toContain("#");
  });

  it("card 0 é hook, último é cta, idx é sequencial", async () => {
    const pkg = await generateCarouselPackage(input);
    expect(pkg.cards[0].role).toBe("hook");
    expect(pkg.cards[pkg.cards.length - 1].role).toBe("cta");
    pkg.cards.forEach((c, i) => expect(c.idx).toBe(i));
  });

  it("é determinístico", async () => {
    expect(await generateCarouselPackage(input)).toEqual(await generateCarouselPackage(input));
  });
});

describe("validateCarousel", () => {
  const base = (): CarouselPackage => ({
    caption: "c",
    hashtags: "#a",
    cards: [
      { idx: 0, role: "hook", headline: "h", body: "b" },
      ...Array.from({ length: 5 }, (_, i) => ({
        idx: i + 1,
        role: "value" as const,
        headline: `v${i}`,
        body: "b",
      })),
      { idx: 6, role: "cta", headline: "cta", body: "b" },
    ],
  });

  it("aceita um carrossel bem formado (7 cards)", () => {
    expect(() => validateCarousel(base())).not.toThrow();
  });

  it("rejeita menos de 7 cards", () => {
    const p = base();
    p.cards = p.cards.slice(0, 4);
    expect(() => validateCarousel(p)).toThrow();
  });

  it("rejeita idx fora de ordem", () => {
    const p = base();
    p.cards[3].idx = 99;
    expect(() => validateCarousel(p)).toThrow();
  });

  it("rejeita card 0 que não é hook", () => {
    const p = base();
    p.cards[0].role = "value";
    expect(() => validateCarousel(p)).toThrow();
  });

  it("rejeita último card que não é cta", () => {
    const p = base();
    p.cards[p.cards.length - 1].role = "value";
    expect(() => validateCarousel(p)).toThrow();
  });

  it("rejeita headline vazio", () => {
    const p = base();
    p.cards[2].headline = "   ";
    expect(() => validateCarousel(p)).toThrow();
  });
});
