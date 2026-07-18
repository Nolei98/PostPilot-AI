import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mockEmbed,
  embedText,
  toPgVector,
  EMBEDDING_DIM,
} from "@/lib/ai/embedding";

describe("mockEmbed", () => {
  it("tem a dimensão esperada", () => {
    expect(mockEmbed("qualquer texto")).toHaveLength(EMBEDDING_DIM);
  });

  it("é determinístico: mesmo texto → mesmo vetor", () => {
    expect(mockEmbed("OpenAI lançou algo")).toEqual(mockEmbed("OpenAI lançou algo"));
  });

  it("normaliza (norma ~ 1)", () => {
    const v = mockEmbed("texto de teste");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("textos diferentes → vetores diferentes", () => {
    expect(mockEmbed("texto A")).not.toEqual(mockEmbed("texto B"));
  });

  it("ignora caixa e espaços nas pontas (dedup exato robusto)", () => {
    expect(mockEmbed("  Texto  ")).toEqual(mockEmbed("texto"));
  });
});

describe("toPgVector", () => {
  it("formata como literal do pgvector", () => {
    expect(toPgVector([1, 0.5, -2])).toBe("[1,0.5,-2]");
  });
});

describe("embedText (mock sem key)", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("cai no mock determinístico com a dimensão certa", async () => {
    const v = await embedText("uma legenda qualquer");
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(v).toEqual(mockEmbed("uma legenda qualquer"));
  });
});
