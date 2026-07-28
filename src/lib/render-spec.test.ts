import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RenderSpec } from "@/lib/types";

// resolveRenderSpec lê brand_kits/templates via admin client e o plano via
// subscription — os dois viram stub aqui: o que está sob teste é o
// MAPEAMENTO (linha do banco → spec), não o acesso ao banco.
const templateRows: { id: string; surface: string; spec: unknown }[] = [];
let brandKitRow: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: table === "brand_kits" ? brandKitRow : null }) }),
        in: async () => ({ data: templateRows }),
      }),
    }),
  }),
}));

vi.mock("@/lib/subscription", () => ({ getUserPlan: async () => "pro" }));

const { resolveRenderSpec, withPost, cardBrandFromKit } = await import("@/lib/render-spec");

const KIT = {
  color_background: "#101018",
  color_accent: "#FF3366",
  color_text: "#FFFFFF",
  color_keyword_box: "#FF3366",
  post_font_family: "sora",
  brand_name: "Overlens",
  wordmark: "OVERLENS®",
  ig_handle: "overlens",
  ig_display_name: "Overlens",
  keywords: ["DESIGN", "TECH"],
  brand_mark: "wordmark+handle",
  layout_preset: "serif-luxe",
  single_post_style: "centered",
  logo_url: "https://example.test/logo.png",
  show_brand_logo: true,
  tpl_keyword: "IA",
  tpl_top_text: "A NOVIDADE DE",
  tpl_bottom_text: "QUE MUDA TUDO",
  tpl_cta_enabled: true,
  template_selection: { carousel_page: "tpl-page" },
};

const PAGE_SPEC = { surface: "carousel_page", canvas: { w: 1080, h: 1350 }, elements: [] };

beforeEach(() => {
  brandKitRow = { ...KIT };
  templateRows.length = 0;
  templateRows.push({ id: "tpl-page", surface: "carousel_page", spec: PAGE_SPEC });
});

/** Ignora o carimbo de tempo — é o único campo que muda entre duas
 * resoluções do mesmo estado, e não influencia o desenho. */
function withoutTimestamp(spec: RenderSpec) {
  return { ...spec, frozenAt: "" };
}

describe("resolveRenderSpec", () => {
  it("lê todo o Brand Kit — inclusive single_post_style, que dois dos construtores antigos esqueciam", async () => {
    const spec = await resolveRenderSpec({
      clientId: "c1",
      userId: "u1",
      post: { format: "single" },
    });
    expect(spec.cardBrand.layoutPreset).toBe("serif-luxe");
    expect(spec.cardBrand.singlePostStyle).toBe("centered");
    expect(spec.singlePostStyle).toBe("centered");
    expect(spec.cardBrand.fontFamily).toBe("Sora");
    expect(spec.cardBrand.colorAccent).toBe("#FF3366");
    expect(spec.brandTemplate.logoUrl).toBe("https://example.test/logo.png");
    expect(spec.profile.handle).toBe("overlens");
    expect(spec.watermark).toBe(false); // plano pro
  });

  it("guarda a spec do template INLINE, não só o id — editar o modelo depois não pode alcançar post aprovado", async () => {
    const spec = await resolveRenderSpec({
      clientId: "c1",
      userId: "u1",
      post: { format: "carousel" },
    });
    expect(spec.templates.carousel_page?.id).toBe("tpl-page");
    expect(spec.templates.carousel_page?.spec).toEqual(PAGE_SPEC);
    // superfície sem seleção fica ausente → motor de layout antigo
    expect(spec.templates.cover_image).toBeUndefined();
  });

  it("resolver AO VIVO (preview) e resolver pra CONGELAR dão a mesma spec", async () => {
    const post = { format: "single" as const, template_applied: true };
    const aoVivo = await resolveRenderSpec({ clientId: "c1", userId: "u1", post });
    const congelado = await resolveRenderSpec({ clientId: "c1", userId: "u1", post });
    // é o invariante que sustenta o modelo inteiro: se essas duas
    // divergissem, o preview da fila seria decorativo
    expect(withoutTimestamp(aoVivo)).toEqual(withoutTimestamp(congelado));
  });

  it("mudar o Brand Kit muda a spec resolvida ao vivo (é o que a fila reflete sem job)", async () => {
    const post = { format: "single" as const };
    const antes = await resolveRenderSpec({ clientId: "c1", userId: "u1", post });
    brandKitRow = { ...KIT, layout_preset: "brutalism", color_accent: "#00FF88" };
    const depois = await resolveRenderSpec({ clientId: "c1", userId: "u1", post });
    expect(antes.cardBrand.layoutPreset).toBe("serif-luxe");
    expect(depois.cardBrand.layoutPreset).toBe("brutalism");
    expect(depois.cardBrand.colorAccent).toBe("#00FF88");
  });

  it("brand_kit ausente cai em defaults sem quebrar", async () => {
    brandKitRow = null;
    const spec = await resolveRenderSpec({ clientId: "c1", userId: "u1", post: { format: "single" } });
    expect(spec.cardBrand.layoutPreset).toBe("editorial-noir");
    expect(spec.cardBrand.singlePostStyle).toBe("cover");
    expect(spec.cardBrand.fontFamily).toBe("Inter");
    expect(spec.templates).toEqual({});
  });

  it("os tpl_* do post vencem a identidade de Ajustes, campo a campo", async () => {
    const spec = await resolveRenderSpec({
      clientId: "c1",
      userId: "u1",
      post: {
        format: "single",
        template_applied: true,
        tpl_keyword: "CÓDIGO",
        tpl_color_accent: "#123456",
      },
    });
    expect(spec.identity.keyword).toBe("CÓDIGO"); // override
    expect(spec.identity.colorAccent).toBe("#123456"); // override
    expect(spec.identity.topText).toBe("A NOVIDADE DE"); // default de Ajustes
    expect(spec.identity.ctaEnabled).toBe(true);
    expect(spec.closingPage).toBe(true);
  });
});

describe("withPost", () => {
  it("deriva a spec de um post sem reler nada, igual a resolver do zero", async () => {
    const post = {
      format: "carousel" as const,
      template_applied: true,
      tpl_keyword: "CÓDIGO",
      tpl_color_accent: "#123456",
    };
    const doZero = await resolveRenderSpec({ clientId: "c1", userId: "u1", post });
    const base = await resolveRenderSpec({ clientId: "c1", userId: "u1", post: { format: "single" } });
    const derivada = withPost(base, post);
    expect(withoutTimestamp(derivada)).toEqual(withoutTimestamp(doZero));
  });

  it("não deixa o post anterior vazar no próximo (cada derivação parte da base)", async () => {
    const base = await resolveRenderSpec({ clientId: "c1", userId: "u1", post: { format: "single" } });
    const comOverride = withPost(base, { format: "single", tpl_keyword: "CÓDIGO", template_applied: true });
    const semOverride = withPost(base, { format: "single" });
    expect(comOverride.identity.keyword).toBe("CÓDIGO");
    expect(semOverride.identity.keyword).toBe("IA");
    expect(semOverride.closingPage).toBe(false);
  });

  it("troca o formato e o quadro do vídeo", () => {
    const base = { ...({} as RenderSpec), format: "single", identity: {}, videoShape: undefined } as RenderSpec;
    const video = withPost(base, { format: "video", video_shape: "feed-blur" });
    expect(video.format).toBe("video");
    expect(video.videoShape).toBe("feed-blur");
  });
});

describe("cardBrandFromKit", () => {
  it("campo vazio no banco não vira string vazia na arte", () => {
    const brand = cardBrandFromKit({ wordmark: "", brand_name: "", color_accent: "" });
    expect(brand.wordmark).toBeNull();
    expect(brand.brandName).toBeNull();
    expect(brand.colorAccent).toBe("#7C5CFF");
  });
});
