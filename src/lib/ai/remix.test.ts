import { describe, it, expect } from "vitest";
import {
  generateRemixBrief,
  mockBrief,
  validateBrief,
  pareceCopia,
  MIN_GANCHOS,
  MAX_GANCHOS,
  type RemixBrief,
  type RemixReference,
} from "@/lib/ai/remix";

function ref(over: Partial<RemixReference> = {}): RemixReference {
  return {
    title: "LLM Honeypot",
    platform: "hackernews",
    points: 383,
    comments: 106,
    score: 88,
    ...over,
  };
}

const briefValido: RemixBrief = {
  padrao: "Afirmação seca + termo técnico",
  porQueFunciona: "Entrega o assunto no título e promete profundidade.",
  ganchos: ["Gancho um", "Gancho dois", "Gancho três"],
  angulo: "Explicar o mecanismo.",
};

describe("validateBrief", () => {
  it("aceita um brief no contrato", () => {
    expect(() => validateBrief(briefValido)).not.toThrow();
  });

  it("recusa brief sem padrão", () => {
    expect(() => validateBrief({ ...briefValido, padrao: "  " })).toThrow(/padrao inválido/i);
  });

  it("recusa brief sem ângulo", () => {
    expect(() => validateBrief({ ...briefValido, angulo: "" })).toThrow(/angulo inválido/i);
  });

  it("recusa gancho de menos", () => {
    expect(() =>
      validateBrief({ ...briefValido, ganchos: Array(MIN_GANCHOS - 1).fill("x") })
    ).toThrow(/ganchos/i);
  });

  it("recusa gancho de mais", () => {
    expect(() =>
      validateBrief({ ...briefValido, ganchos: Array(MAX_GANCHOS + 1).fill("x") })
    ).toThrow(/ganchos/i);
  });

  it("recusa gancho vazio no meio da lista", () => {
    expect(() =>
      validateBrief({ ...briefValido, ganchos: ["ok", "   ", "ok"] })
    ).toThrow(/vazio/i);
  });
});

describe("generateRemixBrief (mock, sem key)", () => {
  it("devolve um brief válido", async () => {
    const brief = await generateRemixBrief({ referencias: [ref()], niche: "tecnologia" });
    expect(() => validateBrief(brief)).not.toThrow();
  });

  it("é determinístico", async () => {
    const entrada = { referencias: [ref()], niche: "tecnologia" };
    const a = await generateRemixBrief(entrada);
    const b = await generateRemixBrief(entrada);
    expect(a).toEqual(b);
  });

  it("falha explicitamente sem referência nenhuma", async () => {
    await expect(generateRemixBrief({ referencias: [] })).rejects.toThrow(/sem referências/i);
  });

  it("o brief NÃO devolve o título da referência como gancho", () => {
    // A regra do produto é extrair FORMA, não copiar conteúdo — copiar
    // seria plágio e não performa duas vezes.
    const titulo = "LLM Honeypot";
    const brief = mockBrief({ referencias: [ref({ title: titulo })], niche: "tecnologia" });
    for (const g of brief.ganchos) {
      expect(g).not.toBe(titulo);
    }
  });
});

describe("pareceCopia — a guarda contra plágio maquiado", () => {
  const titulos = ["Design is compromise", "2x, not 10x: coding with LLMs in 2026"];

  it("pega reescrita que só mexe na pontuação", () => {
    expect(pareceCopia("Design is compromise!", titulos)).toBe(true);
  });

  it("pega reescrita que troca a ordem das palavras", () => {
    expect(pareceCopia("Compromise is design", titulos)).toBe(true);
  });

  it("ignora acento na comparação", () => {
    expect(pareceCopia("2x, nao 10x: coding with LLMs", titulos)).toBe(true);
  });

  it("deixa passar gancho de assunto diferente", () => {
    expect(pareceCopia("O custo escondido de rodar modelo local", titulos)).toBe(false);
  });

  it("não acusa por palavra comum sozinha", () => {
    expect(pareceCopia("Como escolher banco de dados em 2026", titulos)).toBe(false);
  });

  it("gancho vazio não acusa", () => {
    expect(pareceCopia("   ", titulos)).toBe(false);
  });
});

describe("validateBrief com títulos de referência", () => {
  const titulos = ["Design is compromise"];

  it("recusa brief cujo gancho é reescrita da referência", () => {
    const ruim: RemixBrief = { ...briefValido, ganchos: ["Design is compromise", "b", "c"] };
    expect(() => validateBrief(ruim, titulos)).toThrow(/reescrita/i);
  });

  it("aceita quando os ganchos são de outro assunto", () => {
    const bom: RemixBrief = {
      ...briefValido,
      ganchos: [
        "O custo escondido de rodar modelo local",
        "Quem paga a conta do inference",
        "Latência é o novo preço",
      ],
    };
    expect(() => validateBrief(bom, titulos)).not.toThrow();
  });

  it("dá mensagem útil quando o campo vem com tipo errado", () => {
    // Aconteceu de verdade: um modelo devolveu `padrao` como não-string e
    // o erro saía como "trim is not a function".
    const torto = { ...briefValido, padrao: ["lista"] } as unknown as RemixBrief;
    expect(() => validateBrief(torto)).toThrow(/padrao inválido/i);
  });
});
