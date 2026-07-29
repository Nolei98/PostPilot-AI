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

const {
  resolveRenderSpec,
  withPost,
  cardBrandFromKit,
  resolveBackground,
  applyBackground,
  applyMarkColor,
  applyEyebrow,
} = await import("@/lib/render-spec");

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
    const base = {
      ...({} as RenderSpec),
      format: "single",
      identity: {},
      videoShape: undefined,
      cardBrand: cardBrandFromKit(KIT),
    } as RenderSpec;
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

describe("resolveBackground (fundo por post, migration 042)", () => {
  const brand = cardBrandFromKit(KIT);

  it("'brand' mantém as cores do kit (só o realce da marca é garantido)", () => {
    const igual = resolveBackground(brand, { format: "single", bg_mode: "brand" });
    expect(igual.colorBackground).toBe(brand.colorBackground);
    expect(igual.colorText).toBe(brand.colorText);
    // ausente = mesma coisa (posts anteriores à 042)
    const semCampo = resolveBackground(brand, { format: "single" });
    expect(semCampo.colorBackground).toBe(brand.colorBackground);
  });

  it("fundo claro força texto escuro, mesmo com marca de texto branco", () => {
    const light = resolveBackground(brand, { format: "single", bg_mode: "light" });
    expect(light.colorBackground).toBe("#FFFFFF");
    // o Brand Kit pede #FFFFFF no texto — seria invisível
    expect(brand.colorText).toBe("#FFFFFF");
    expect(light.colorText).not.toBe("#FFFFFF");
  });

  it("fundo escuro força texto claro", () => {
    const dark = resolveBackground(brand, { format: "single", bg_mode: "dark" });
    expect(dark.colorBackground).toBe("#0B0B12");
    expect(dark.colorText).toBe("#FFFFFF");
  });

  it("'custom' usa o hex escolhido e decide o texto pela luminância dele", () => {
    const amarelo = resolveBackground(brand, {
      format: "single",
      bg_mode: "custom",
      bg_color: "#FFE44D",
    });
    expect(amarelo.colorBackground).toBe("#FFE44D");
    expect(amarelo.colorText).not.toBe("#FFFFFF");

    const vinho = resolveBackground(brand, {
      format: "single",
      bg_mode: "custom",
      bg_color: "#2A0A12",
    });
    expect(vinho.colorText).toBe("#FFFFFF");
  });

  it("'custom' sem cor cai na marca em vez de quebrar a arte", () => {
    const semCor = resolveBackground(brand, { format: "single", bg_mode: "custom", bg_color: null });
    expect(semCor.colorBackground).toBe(brand.colorBackground);
  });

  it("withPost aplica o fundo do post sobre uma spec já resolvida", async () => {
    brandKitRow = KIT;
    const base = await resolveRenderSpec({ clientId: "c", userId: "u", post: { format: "single" } });
    const claro = withPost(base, { format: "single", bg_mode: "light" });
    expect(claro.cardBrand.colorBackground).toBe("#FFFFFF");
    // a spec base não é contaminada — outros posts da mesma resolução
    // continuam na cor da marca
    expect(base.cardBrand.colorBackground).toBe("#101018");
  });
});

describe("applyBackground (fundo por CARD do carrossel)", () => {
  const brand = cardBrandFromKit(KIT);

  it("sem override o card herda o fundo que veio do post", () => {
    // 'brand' no card significa "herda", não "volta pro Brand Kit": a
    // marca recebida aqui já é a do post, que pode ter trocado.
    const doPost = resolveBackground(brand, { format: "carousel", bg_mode: "light" });
    expect(applyBackground(doPost, "brand", null)).toBe(doPost);
    expect(applyBackground(doPost, null, null)).toBe(doPost);
  });

  it("card escuro no meio de um carrossel claro mantém contraste", () => {
    const doPost = resolveBackground(brand, { format: "carousel", bg_mode: "light" });
    expect(doPost.colorText).toBe("#0A0A0A");
    const card = applyBackground(doPost, "dark", null);
    expect(card.colorBackground).toBe("#0B0B12");
    expect(card.colorText).toBe("#FFFFFF");
  });

  it("cor livre do card decide o texto pela luminância dela", () => {
    const card = applyBackground(brand, "custom", "#FFE44D");
    expect(card.colorBackground).toBe("#FFE44D");
    expect(card.colorText).toBe("#0A0A0A");
  });
});

describe("applyMarkColor (cor do wordmark, migration 043)", () => {
  const brand = cardBrandFromKit(KIT);

  it("'accent' garante que o realce SALTE do fundo", () => {
    // sobre o fundo escuro do kit o magenta já contrasta: fica igual
    expect(applyMarkColor(brand, "accent", null).markColor).toBe(brand.colorAccent);
    expect(applyMarkColor(brand, null, null).markColor).toBe(brand.colorAccent);

    // sobre fundo branco o MESMO magenta dá 2.97:1 e some — aí é
    // escurecido até realçar de verdade (relatado em 2026-07-28)
    const claro = resolveBackground(brand, { format: "single", bg_mode: "light" });
    expect(claro.markColor).not.toBe(brand.colorAccent);
  });

  it("'title' acompanha o título DEPOIS do fundo ter sido resolvido", () => {
    // fundo claro vira título escuro; a marca tem que ir junto, senão
    // continuaria no realce e brigaria com o texto
    const claro = resolveBackground(brand, {
      format: "single",
      bg_mode: "light",
      mark_mode: "title",
    });
    expect(claro.colorText).toBe("#0A0A0A");
    expect(claro.markColor).toBe("#0A0A0A");
  });

  it("'custom' usa o hex escolhido", () => {
    expect(applyMarkColor(brand, "custom", "#46E5B7").markColor).toBe("#46E5B7");
  });

  it("'custom' sem cor cai no realce em vez de sumir", () => {
    expect(applyMarkColor(brand, "custom", null).markColor).toBe(brand.colorAccent);
  });
});

describe("applyEyebrow (rótulo do topo, migration 046)", () => {
  const brand = cardBrandFromKit(KIT);

  it("nulo/vazio NÃO grava campo — cada preset mantém o próprio padrão", () => {
    expect(applyEyebrow(brand, null).eyebrow).toBeUndefined();
    expect(applyEyebrow(brand, "   ").eyebrow).toBeUndefined();
  });

  it("valor do post vence, já sem espaço sobrando", () => {
    expect(applyEyebrow(brand, "  EDIÇÃO 12 ").eyebrow).toBe("EDIÇÃO 12");
  });

  it("chega na spec do post pelo mesmo caminho do fundo e da marca", () => {
    const resolved = resolveBackground(brand, {
      format: "carousel",
      bg_mode: "light",
      eyebrow: "GUIA RÁPIDO",
    });
    expect(resolved.eyebrow).toBe("GUIA RÁPIDO");
    // não atropela as outras decisões por post
    expect(resolved.colorText).toBe("#0A0A0A");
  });
});

describe("rótulo do topo herda a cor da marca (043 + 046)", () => {
  const brand = cardBrandFromKit(KIT);

  it("a capa pinta o rótulo com a MESMA cor do wordmark", async () => {
    const { buildCoverSvg } = await import("@/lib/carousel-render");
    const resolvido = resolveBackground(brand, {
      format: "carousel",
      mark_mode: "custom",
      mark_color: "#22D3EE",
      eyebrow: "Edição 12",
    });
    const { svg } = buildCoverSvg(
      { idx: 0, role: "hook", headline: "Título", body: "" },
      resolvido,
      false,
      {}
    );
    // rótulo e wordmark saem na mesma cor — são a mesma camada de marca
    const ocorrencias = svg.split("#22D3EE").length - 1;
    expect(ocorrencias).toBeGreaterThanOrEqual(2);
    expect(svg).toContain("EDIÇÃO 12");
  });
});
