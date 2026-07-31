// ============================================================
// Simetria do divisor ———— WORDMARK ————.
//
// O caso que quebrava (§0-I.7b): wordmark terminado em ®. O símbolo é
// desenhado como VETOR à parte, e ficava pendurado à direita de um texto
// centrado em cx — sobrava respiro demais à esquerda e de menos à direita.
// Estes testes medem os dois vãos no SVG gerado, em vez de confiar na
// leitura visual.
// ============================================================
import { describe, it, expect } from "vitest";
import { buildCoverSvg, CARD_W, type CardBrand } from "@/lib/carousel-render";

const base: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7B2FF7",
  colorText: "#FFFFFF",
  fontFamily: "Sora",
  brandName: "João Rodrigues",
  wordmark: "JOAORODRIGUES",
  handle: "joaorodrigues.ia",
  keywords: ["IA"],
  brandMark: "wordmark",
};

const card = { idx: 0, role: "hook" as const, headline: "Título de teste", body: "" };

/** Vãos entre a ponta de cada filete e a tinta da marca, em px. */
function vaos(svg: string) {
  const linhas = [...svg.matchAll(/<line x1="([\d.-]+)" y1="[\d.-]+" x2="([\d.-]+)"/g)];
  expect(linhas.length).toBeGreaterThanOrEqual(2);
  const fimEsquerda = Number(linhas[0][2]); // x2 do filete da esquerda
  const inicioDireita = Number(linhas[1][1]); // x1 do filete da direita

  const texto = svg.match(/<text x="([\d.-]+)"[^>]*text-anchor="middle"[^>]*>([^<]*)<\/text>/);
  expect(texto).not.toBeNull();
  const textoCx = Number(texto![1]);
  const larguraTexto = texto![2].length * 22;

  const circulo = svg.match(/<circle cx="([\d.-]+)"[^>]*r="(\d+)"/);
  const tintaEsquerda = textoCx - larguraTexto / 2;
  const tintaDireita = circulo
    ? Number(circulo[1]) + Number(circulo[2])
    : textoCx + larguraTexto / 2;

  return {
    esquerda: tintaEsquerda - fimEsquerda,
    direita: inicioDireita - tintaDireita,
  };
}

describe("divisor do wordmark", () => {
  it("tem o mesmo vão dos dois lados SEM ®", () => {
    const { svg } = buildCoverSvg(card, base);
    const { esquerda, direita } = vaos(svg);
    expect(Math.abs(esquerda - direita)).toBeLessThanOrEqual(1);
  });

  it("tem o mesmo vão dos dois lados COM ® (o caso que quebrava)", () => {
    const { svg } = buildCoverSvg(card, { ...base, wordmark: "JOAORODRIGUES®" });
    const { esquerda, direita } = vaos(svg);
    expect(Math.abs(esquerda - direita)).toBeLessThanOrEqual(1);
  });

  it("os dois filetes têm o mesmo comprimento", () => {
    const { svg } = buildCoverSvg(card, { ...base, wordmark: "JOAORODRIGUES®" });
    const linhas = [...svg.matchAll(/<line x1="([\d.-]+)" y1="[\d.-]+" x2="([\d.-]+)"/g)];
    const compEsq = Number(linhas[0][2]) - Number(linhas[0][1]);
    const compDir = Number(linhas[1][2]) - Number(linhas[1][1]);
    expect(Math.abs(compEsq - compDir)).toBeLessThanOrEqual(1);
  });

  it("o conjunto marca+® fica centrado no quadro", () => {
    const { svg } = buildCoverSvg(card, { ...base, wordmark: "JOAORODRIGUES®" });
    const texto = svg.match(/<text x="([\d.-]+)"[^>]*text-anchor="middle"[^>]*>([^<]*)<\/text>/)!;
    const textoCx = Number(texto[1]);
    const larguraTexto = texto[2].length * 22;
    const circulo = svg.match(/<circle cx="([\d.-]+)"[^>]*r="(\d+)"/)!;
    const meioDaTinta =
      (textoCx - larguraTexto / 2 + Number(circulo[1]) + Number(circulo[2])) / 2;
    expect(Math.abs(meioDaTinta - CARD_W / 2)).toBeLessThanOrEqual(1);
  });
});
