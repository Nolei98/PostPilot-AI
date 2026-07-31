// ============================================================
// brollQueries — as buscas de b-roll do vídeo gerado (Sprint D).
// O que importa aqui é o que a montagem exige: UMA consulta por
// segmento, e o menos repetida possível (5 clipes iguais é o defeito
// que salta aos olhos num Reels).
// ============================================================
import { describe, it, expect } from "vitest";
import { brollQueries } from "@/lib/video-brief";

describe("brollQueries (Sprint D — b-roll por segmento)", () => {
  it("devolve exatamente uma consulta por segmento", () => {
    expect(brollQueries(4, "tecnologia")).toHaveLength(4);
    expect(brollQueries(6, "games")).toHaveLength(6);
    expect(brollQueries(0, "saude")).toHaveLength(0);
  });

  it("não repete tema enquanto houver tema novo — clipe repetido salta aos olhos", () => {
    const qs = brollQueries(5, "financas");
    expect(new Set(qs).size).toBe(5);
  });

  it("usa o tema do NICHO, não texto genérico", () => {
    const tec = brollQueries(3, "tecnologia");
    const fin = brollQueries(3, "financas");
    expect(tec).not.toEqual(fin);
    expect(tec.join(" ")).toMatch(/code|server|circuit/);
  });

  it("nicho desconhecido, 'outro' ou nulo cai no genérico, sem quebrar", () => {
    const generico = brollQueries(3, null);
    expect(generico).toHaveLength(3);
    expect(brollQueries(3, "outro")).toEqual(generico);
    expect(brollQueries(3, "nicho-que-nao-existe")).toEqual(generico);
  });

  it("consulta em INGLÊS: a busca do Pexels é indexada em inglês", () => {
    for (const q of brollQueries(6, "saude")) {
      expect(q).toMatch(/^[a-z0-9 ]+$/); // sem acento, sem maiúscula
    }
  });

  it("mais segmentos que temas: entra em rodízio em vez de ficar sem consulta", () => {
    const qs = brollQueries(8, "marketing");
    expect(qs).toHaveLength(8);
    expect(qs[5]).toBe(qs[0]);
  });
});
