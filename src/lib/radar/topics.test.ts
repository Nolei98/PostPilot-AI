import { describe, it, expect } from "vitest";
import { topicsForClient } from "@/lib/radar/topics";

describe("topicsForClient", () => {
  it("usa as consultas curadas do nicho", () => {
    const t = topicsForClient("games", []);
    expect(t).toContain("game development");
  });

  it("cai no set de tecnologia quando o nicho é desconhecido", () => {
    expect(topicsForClient("astrologia", [])).toEqual(topicsForClient("tecnologia", []));
    expect(topicsForClient(null, [])).toEqual(topicsForClient("tecnologia", []));
  });

  it("acrescenta as palavras-chave do cliente depois das do nicho", () => {
    const t = topicsForClient("tecnologia", ["robotics"]);
    expect(t).toContain("robotics");
    expect(t.indexOf("robotics")).toBeGreaterThan(0);
  });

  it("ignora palavra-chave curta demais pra buscar", () => {
    expect(topicsForClient("tecnologia", ["ia", "ai"])).not.toContain("ia");
  });

  it("não repete consulta", () => {
    const t = topicsForClient("tecnologia", ["LLM", "LLM"]);
    expect(new Set(t).size).toBe(t.length);
  });

  it("limita o número de consultas por varredura", () => {
    const muitas = Array.from({ length: 30 }, (_, i) => `keyword-${i}`);
    expect(topicsForClient("tecnologia", muitas).length).toBeLessThanOrEqual(6);
  });
});
