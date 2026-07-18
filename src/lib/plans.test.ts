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
