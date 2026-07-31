import { describe, it, expect } from "vitest";
import { scoreDaReferencia, fatorRecencia, ranquear } from "@/lib/radar/score";
import type { RadarItem } from "@/lib/radar/types";

const AGORA = new Date("2026-07-31T12:00:00Z");

function item(over: Partial<RadarItem> = {}): RadarItem {
  return {
    platform: "hackernews",
    externalId: "1",
    url: "https://example.com",
    title: "Referência",
    author: "alguem",
    topic: "AI",
    points: 100,
    comments: 40,
    publishedAt: AGORA.toISOString(),
    ...over,
  };
}

describe("scoreDaReferencia", () => {
  it("fica entre 0 e 100", () => {
    for (const pontos of [0, 1, 50, 500, 50_000]) {
      const s = scoreDaReferencia(item({ points: pontos }), AGORA);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it("mais engajamento, mais score", () => {
    const fraco = scoreDaReferencia(item({ points: 10, comments: 2 }), AGORA);
    const forte = scoreDaReferencia(item({ points: 400, comments: 150 }), AGORA);
    expect(forte).toBeGreaterThan(fraco);
  });

  it("item sem engajamento nenhum zera", () => {
    expect(scoreDaReferencia(item({ points: 0, comments: 0 }), AGORA)).toBe(0);
  });

  it("comentário vale menos que upvote, mas vale", () => {
    const base = item({ points: 100, comments: 0 });
    const comConversa = item({ points: 100, comments: 100 });
    expect(scoreDaReferencia(comConversa, AGORA)).toBeGreaterThan(
      scoreDaReferencia(base, AGORA)
    );
  });

  it("escala log: um outlier não achata o resto", () => {
    // 10x mais pontos não pode dar 10x mais score, senão a lista vira
    // um campeão e 49 zeros.
    const normal = scoreDaReferencia(item({ points: 50, comments: 20 }), AGORA);
    const outlier = scoreDaReferencia(item({ points: 5000, comments: 20 }), AGORA);
    expect(outlier).toBeLessThan(normal * 10);
  });

  it("plataformas diferentes normalizam em escalas diferentes", () => {
    // O mesmo número cru vale mais no HN (comunidade menor) do que no
    // Reddit — é exatamente o ponto de normalizar.
    const noHn = scoreDaReferencia(item({ points: 500, comments: 100 }), AGORA);
    const noReddit = scoreDaReferencia(
      item({ platform: "reddit", points: 500, comments: 100 }),
      AGORA
    );
    expect(noHn).toBeGreaterThan(noReddit);
  });
});

describe("fatorRecencia", () => {
  it("não penaliza nas primeiras 24h", () => {
    const recente = new Date(AGORA.getTime() - 6 * 3_600_000).toISOString();
    expect(fatorRecencia(recente, AGORA)).toBe(1);
  });

  it("penaliza o que é mais velho", () => {
    const doisDias = new Date(AGORA.getTime() - 48 * 3_600_000).toISOString();
    const seteDias = new Date(AGORA.getTime() - 7 * 24 * 3_600_000).toISOString();
    expect(fatorRecencia(doisDias, AGORA)).toBeLessThan(1);
    expect(fatorRecencia(seteDias, AGORA)).toBeLessThan(fatorRecencia(doisDias, AGORA));
  });

  it("nunca zera — item velho perde posição, não desaparece", () => {
    const antigo = new Date(AGORA.getTime() - 365 * 24 * 3_600_000).toISOString();
    expect(fatorRecencia(antigo, AGORA)).toBeGreaterThan(0);
  });

  it("sem data, não penaliza", () => {
    expect(fatorRecencia(null, AGORA)).toBe(1);
  });

  it("data inválida não quebra", () => {
    expect(() => fatorRecencia("nao-e-data", AGORA)).not.toThrow();
  });
});

describe("ranquear", () => {
  it("ordena do maior score pro menor", () => {
    const lista = ranquear(
      [
        item({ externalId: "fraco", points: 5, comments: 1 }),
        item({ externalId: "forte", points: 800, comments: 300 }),
        item({ externalId: "medio", points: 120, comments: 40 }),
      ],
      AGORA
    );
    expect(lista.map((i) => i.externalId)).toEqual(["forte", "medio", "fraco"]);
  });

  it("um item recente ganha de um mais forte porém velho", () => {
    const velho = item({
      externalId: "velho",
      points: 300,
      comments: 100,
      publishedAt: new Date(AGORA.getTime() - 7 * 24 * 3_600_000).toISOString(),
    });
    const novo = item({ externalId: "novo", points: 260, comments: 95 });
    const [primeiro] = ranquear([velho, novo], AGORA);
    expect(primeiro.externalId).toBe("novo");
  });
});
