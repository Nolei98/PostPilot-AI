// ============================================================
// Fonte e peso de um elemento de template.
//
// Dois defeitos reais, relatados ao usar o editor em 31/07:
//  1. a escolha de fonte NUNCA fazia efeito — o renderizador tinha
//     `font === "heading" ? brand.fontFamily : brand.fontFamily`;
//  2. o peso era campo numérico livre, então dava pra pedir um peso que a
//     família não tem, e o texto saía deformado ("letra bugada").
// ============================================================
import { describe, it, expect } from "vitest";
import {
  fontFamilyFor,
  pesosDaFonte,
  pesoMaisProximo,
  FONTES_DO_TEMPLATE,
} from "@/lib/template-fonts";

describe("fontFamilyFor", () => {
  it("sem escolha, usa a fonte da marca", () => {
    expect(fontFamilyFor(undefined, "Sora")).toBe("Sora");
    expect(fontFamilyFor("marca", "Sora")).toBe("Sora");
  });

  it("respeita a família escolhida — o caso que não funcionava", () => {
    expect(fontFamilyFor("Anton", "Sora")).toBe("Anton");
    expect(fontFamilyFor("IBM Plex Mono", "Sora")).toBe("IBM Plex Mono");
  });

  it("mantém 'heading' e 'body' das specs antigas na fonte da marca", () => {
    expect(fontFamilyFor("heading", "Inter")).toBe("Inter");
    expect(fontFamilyFor("body", "Inter")).toBe("Inter");
  });

  it("família desconhecida cai na da marca, não no que o resvg achar", () => {
    expect(fontFamilyFor("Comic Sans", "Inter")).toBe("Inter");
  });
});

describe("peso", () => {
  it("Anton só tem 400 — pedir 800 encaixa em 400", () => {
    expect(pesosDaFonte("Anton")).toEqual([400]);
    expect(pesoMaisProximo(800, "Anton")).toBe(400);
  });

  it("peso arbitrário encaixa no mais próximo disponível", () => {
    expect(pesoMaisProximo(437, "Inter")).toBe(400);
    expect(pesoMaisProximo(850, "Inter")).toBe(800);
    expect(pesoMaisProximo(950, "Inter")).toBe(900);
  });

  it("peso existente é preservado", () => {
    expect(pesoMaisProximo(600, "Sora")).toBe(600);
    expect(pesoMaisProximo(700, "IBM Plex Mono")).toBe(700);
  });

  it("toda família declarada tem ao menos um peso", () => {
    for (const f of FONTES_DO_TEMPLATE) {
      expect(f.pesos.length).toBeGreaterThan(0);
    }
  });
});
