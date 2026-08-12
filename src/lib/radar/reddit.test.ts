import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RadarCollector } from "@/lib/radar/types";

const TOKEN_BODY = { access_token: "tok_teste", expires_in: 3600 };

function mockFetchSequence(...respostas: Array<{ ok: boolean; status?: number; json: unknown }>) {
  const fn = vi.fn();
  for (const r of respostas) {
    fn.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

// O token OAuth é cacheado em variável de módulo (propositalmente, pra
// não gerar um novo a cada collect() dentro da mesma varredura) — cada
// teste precisa do módulo "limpo" pra não herdar o cache do anterior.
async function importCollectorFresco(): Promise<RadarCollector> {
  vi.resetModules();
  const mod = await import("@/lib/radar/reddit");
  return mod.redditCollector;
}

describe("redditCollector", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.REDDIT_CLIENT_ID = "id_teste";
    process.env.REDDIT_CLIENT_SECRET = "secret_teste";
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sem credencial, devolve [] sem tentar rede", async () => {
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    const fetchMock = mockFetchSequence();
    const collector = await importCollectorFresco();
    const itens = await collector.collect("IA", { desde: new Date(0), limite: 10 });
    expect(itens).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("autentica e monta RadarItem[] a partir da busca", async () => {
    mockFetchSequence(
      { ok: true, json: TOKEN_BODY },
      {
        ok: true,
        json: {
          data: {
            children: [
              {
                data: {
                  id: "abc123",
                  title: "Design is compromise",
                  url: "https://example.com/post",
                  permalink: "/r/technology/comments/abc123/",
                  author: "alguem",
                  score: 431,
                  num_comments: 170,
                  created_utc: Math.floor(Date.now() / 1000),
                },
              },
            ],
          },
        },
      },
    );

    const collector = await importCollectorFresco();
    const itens = await collector.collect("design", { desde: new Date(0), limite: 25 });
    expect(itens).toEqual([
      {
        platform: "reddit",
        externalId: "abc123",
        url: "https://example.com/post",
        title: "Design is compromise",
        author: "alguem",
        topic: "design",
        points: 431,
        comments: 170,
        publishedAt: expect.any(String),
      },
    ]);
  });

  it("HTTP não-ok na busca devolve [] sem lançar", async () => {
    mockFetchSequence({ ok: true, json: TOKEN_BODY }, { ok: false, status: 429, json: {} });
    const collector = await importCollectorFresco();
    const itens = await collector.collect("IA", { desde: new Date(0), limite: 10 });
    expect(itens).toEqual([]);
  });

  it("falha ao autenticar devolve [] sem tentar buscar", async () => {
    const fetchMock = mockFetchSequence({ ok: false, status: 401, json: {} });
    const collector = await importCollectorFresco();
    const itens = await collector.collect("IA", { desde: new Date(0), limite: 10 });
    expect(itens).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("posts mais antigos que `desde` são descartados", async () => {
    mockFetchSequence(
      { ok: true, json: TOKEN_BODY },
      {
        ok: true,
        json: {
          data: {
            children: [
              {
                data: {
                  id: "velho",
                  title: "Post antigo",
                  url: "https://example.com/velho",
                  permalink: "/r/technology/comments/velho/",
                  author: "alguem",
                  score: 10,
                  num_comments: 1,
                  created_utc: Math.floor(new Date("2020-01-01").getTime() / 1000),
                },
              },
            ],
          },
        },
      },
    );

    const collector = await importCollectorFresco();
    const itens = await collector.collect("IA", { desde: new Date("2026-01-01"), limite: 10 });
    expect(itens).toEqual([]);
  });
});
