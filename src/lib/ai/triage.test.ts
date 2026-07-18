import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { triageNews } from "@/lib/ai/triage";

// MOCK obrigatório: força a ausência de qualquer chave de IA para
// garantir o caminho determinístico mockTriage (sem chamada de rede).
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_PROVIDER", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("triageNews (mock)", () => {
  it("retorna vazio para lista vazia", async () => {
    expect(await triageNews([])).toEqual([]);
  });

  it("score base 30 quando não há palavra-chave viral", async () => {
    const [r] = await triageNews([
      { id: "a", title: "Prefeitura conserta calçada no centro", summary: null },
    ]);
    expect(r.score).toBe(30);
    expect(r.reason).toContain("[MOCK]");
  });

  it("soma 15 por palavra-chave viral encontrada", async () => {
    const [r] = await triageNews([
      { id: "b", title: "OpenAI anuncia lançamento", summary: null },
    ]);
    // "openai" + "lançamento" = 2 hits → 30 + 30 = 60
    expect(r.score).toBe(60);
  });

  it("satura em 95 mesmo com muitas palavras-chave", async () => {
    const [r] = await triageNews([
      {
        id: "c",
        title: "OpenAI Anthropic Claude GPT Gemini Meta Google lançamento breakthrough AGI robot grátis",
        summary: "layoff demite bilhões open source",
      },
    ]);
    expect(r.score).toBe(95);
  });

  it("é determinístico — mesma entrada, mesma saída", async () => {
    const input = [{ id: "d", title: "Google lança modelo grátis", summary: null }];
    const a = await triageNews(input);
    const b = await triageNews(input);
    expect(a).toEqual(b);
  });

  it("preserva o id de cada notícia", async () => {
    const out = await triageNews([
      { id: "x1", title: "nada", summary: null },
      { id: "x2", title: "gpt", summary: null },
    ]);
    expect(out.map((r) => r.id)).toEqual(["x1", "x2"]);
  });
});
