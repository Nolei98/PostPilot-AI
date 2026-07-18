import { describe, it, expect } from "vitest";
import { sourcesForNiche, NICHE_SOURCES } from "@/lib/niche-sources";

describe("sourcesForNiche", () => {
  it("retorna o set curado do nicho conhecido", () => {
    const rows = sourcesForNiche("marketing");
    expect(rows).toEqual(NICHE_SOURCES.marketing);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("cai no set de tecnologia quando o nicho é null", () => {
    expect(sourcesForNiche(null)).toEqual(NICHE_SOURCES.tecnologia);
  });

  it("cai no set de tecnologia quando o nicho é desconhecido", () => {
    expect(sourcesForNiche("nicho-que-nao-existe")).toEqual(NICHE_SOURCES.tecnologia);
  });

  it("toda fonte curada tem feed_url https e threshold numérico", () => {
    for (const set of Object.values(NICHE_SOURCES)) {
      for (const s of set) {
        expect(s.name).toBeTruthy();
        expect(s.feed_url).toMatch(/^https:\/\//);
        expect(typeof s.threshold).toBe("number");
        expect(s.threshold).toBeGreaterThanOrEqual(0);
        expect(s.threshold).toBeLessThanOrEqual(100);
      }
    }
  });
});
