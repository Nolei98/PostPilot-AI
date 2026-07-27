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

// Regressão do incidente de 2026-07-27: o tier grátis do Gemini (20
// requests/dia) devolveu 429 e a varredura inteira morreu com
// status='error' — nenhuma notícia coletada por causa da etapa de
// pontuação. Agora cai no mock e avisa, em vez de derrubar o scan.
describe("triageNews — provider fora do ar", () => {
  it("cai no MOCK e reporta o motivo quando o provider falha", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "chave-que-vai-falhar");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"));

    const motivos: string[] = [];
    const out = await triageNews(
      [{ id: "z1", title: "OpenAI anuncia lançamento", summary: null }],
      "tecnologia",
      (reason) => motivos.push(reason)
    );

    // Resultado utilizável (mock), não exceção
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("z1");
    expect(out[0].reason).toContain("[MOCK]");
    // E a degradação foi reportada pra ficar registrada no scan_run
    expect(motivos).toHaveLength(1);
    expect(motivos[0]).toContain("quota exceeded");

    fetchSpy.mockRestore();
  });

  it("não reporta degradação quando não havia provider configurado", async () => {
    const motivos: string[] = [];
    const out = await triageNews(
      [{ id: "z2", title: "gpt", summary: null }],
      null,
      (reason) => motivos.push(reason)
    );
    expect(out).toHaveLength(1);
    expect(motivos).toEqual([]);
  });
});
