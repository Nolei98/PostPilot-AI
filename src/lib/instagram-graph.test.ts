import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getFacebookPages,
  getInstagramUsername,
  createMediaContainer,
  createCarouselContainer,
  publishMedia,
  getMediaInsights,
} from "@/lib/instagram-graph";

describe("instagram-graph (modo mock — sem META_APP_ID)", () => {
  const originalId = process.env.META_APP_ID;
  const originalSecret = process.env.META_APP_SECRET;

  beforeAll(() => {
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  afterAll(() => {
    if (originalId) process.env.META_APP_ID = originalId;
    if (originalSecret) process.env.META_APP_SECRET = originalSecret;
  });

  it("exchangeCodeForToken retorna token mock sem rede", async () => {
    const r = await exchangeCodeForToken("fake-code", "https://app/callback");
    expect(r.accessToken).toBe("mock-short-lived-token");
    expect(r.expiresIn).toBeGreaterThan(0);
  });

  it("getLongLivedToken retorna token mock de longa duração", async () => {
    const r = await getLongLivedToken("mock-short-lived-token");
    expect(r.accessToken).toBe("mock-long-lived-token");
    expect(r.expiresIn).toBeGreaterThan(3600);
  });

  it("getFacebookPages retorna 1 página mock com conta IG vinculada", async () => {
    const pages = await getFacebookPages("mock-user-token");
    expect(pages).toHaveLength(1);
    expect(pages[0].instagram_business_account?.id).toBe("mock-ig-business-id");
  });

  it("getInstagramUsername retorna handle mock", async () => {
    expect(await getInstagramUsername("mock-ig-business-id", "token")).toBe("mock.ig.account");
  });

  it("createMediaContainer/createCarouselContainer/publishMedia retornam ids mock únicos", async () => {
    const a = await createMediaContainer("ig-id", "token", { imageUrl: "https://x/img.jpg" });
    const b = await createMediaContainer("ig-id", "token", { imageUrl: "https://x/img2.jpg" });
    expect(a).toMatch(/^mock-media-/);
    expect(a).not.toBe(b);

    const carousel = await createCarouselContainer("ig-id", "token", [a, b], "legenda");
    expect(carousel).toMatch(/^mock-carousel-/);

    const published = await publishMedia("ig-id", "token", carousel);
    expect(published).toMatch(/^mock-published-/);
  });

  it("getMediaInsights retorna métricas zeradas em mock", async () => {
    const insights = await getMediaInsights("mock-media-id", "token");
    expect(insights).toEqual({ reach: 0, saved: 0, shares: 0, likes: 0, comments: 0 });
  });
});
