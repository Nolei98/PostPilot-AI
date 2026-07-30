import { describe, it, expect } from "vitest";
import { PLANS, STRIPE_PRICES } from "@/lib/plans";

describe("PLANS", () => {
  it("define os três planos", () => {
    expect(Object.keys(PLANS).sort()).toEqual(["criador", "free", "pro"]);
  });

  it("cota mensal cresce free < criador < pro", () => {
    expect(PLANS.free.postsPerMonth).toBeLessThan(PLANS.criador.postsPerMonth);
    expect(PLANS.criador.postsPerMonth).toBeLessThan(PLANS.pro.postsPerMonth);
  });

  it("free é o mais restrito (sem multi-idioma, sem auto-sync, cap de fontes)", () => {
    expect(PLANS.free.multiLanguage).toBe(false);
    expect(PLANS.free.autoSync).toBe(false);
    expect(PLANS.free.maxSources).toBe(2);
    expect(PLANS.free.priceBRL).toBe(0);
  });

  it("pro tem fontes ilimitadas", () => {
    expect(PLANS.pro.maxSources).toBe(Infinity);
  });

  it("planos pagos liberam contra-capa sem marca", () => {
    expect(PLANS.free.customClosingPage).toBe(false);
    expect(PLANS.criador.customClosingPage).toBe(true);
    expect(PLANS.pro.customClosingPage).toBe(true);
  });

  it("STRIPE_PRICES cobre só os planos pagos", () => {
    expect(Object.keys(STRIPE_PRICES).sort()).toEqual(["criador", "pro"]);
  });
});

// Limites que passaram a ser APLICADOS em 30/07 (auditoria §2.1–2.2).
// Antes maxSources existia só aqui e no teste: nenhum código lia o valor,
// então o plano grátis dizia 2 e aceitava 200.
describe("tetos de custo por plano", () => {
  it("o grátis tem UM cliente — senão o teto de fontes não segura nada", () => {
    expect(PLANS.free.maxClients).toBe(1);
    expect(PLANS.free.maxSources).toBe(2);
  });

  it("os pagos sobem o teto, e o Pro não tem", () => {
    expect(PLANS.criador.maxClients).toBe(3);
    expect(PLANS.criador.maxSources).toBe(5);
    expect(PLANS.pro.maxClients).toBe(Infinity);
    expect(PLANS.pro.maxSources).toBe(Infinity);
  });

  it("teto de cliente nunca é menor que 1 (senão ninguém usa o produto)", () => {
    for (const plano of Object.values(PLANS)) {
      expect(plano.maxClients).toBeGreaterThanOrEqual(1);
      expect(plano.maxSources).toBeGreaterThanOrEqual(1);
    }
  });
});
