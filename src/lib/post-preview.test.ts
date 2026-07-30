import { describe, it, expect } from "vitest";
import { buildPostPreview, type PreviewPostInput } from "@/lib/post-preview";
import { buildLuminanceGrid } from "@/lib/contrast";
import sharp from "sharp";
import type { EmbeddedCarouselCard, RenderSpec } from "@/lib/types";

async function grid(shade: number) {
  const buf = await sharp({
    create: { width: 24, height: 30, channels: 3, background: { r: shade, g: shade, b: shade } },
  })
    .png()
    .toBuffer();
  return buildLuminanceGrid(buf);
}

function spec(over: Partial<RenderSpec> = {}): RenderSpec {
  return {
    v: 1,
    frozenAt: "2026-07-27T00:00:00.000Z",
    format: "single",
    layoutPreset: "editorial-noir",
    singlePostStyle: "cover",
    cardBrand: {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      fontFamily: "Inter",
      brandName: "Overlens",
      wordmark: "OVERLENS",
      handle: "overlens",
      keywords: null,
      brandMark: "wordmark",
      layoutPreset: "editorial-noir",
      singlePostStyle: "cover",
    },
    brandTemplate: { fontFamily: "Inter", logoUrl: null, showLogo: false },
    profile: {
      handle: "overlens",
      displayName: "Overlens",
      avatarUrl: null,
      verified: false,
      showProfileChip: true,
    },
    identity: {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      colorKeywordBox: "#7C5CFF",
      keyword: "IA",
      topText: "A NOVIDADE DE",
      bottomText: "QUE MUDA TUDO",
      ctaEnabled: false,
    },
    closingPage: false,
    templates: {},
    watermark: false,
    ...over,
  };
}

const HOOK = "Um titulo forte que prende a atencao";

const post: PreviewPostInput = {
  id: "p1",
  format: "single",
  hook: HOOK,
  base_image_url: "https://exemplo.test/p1-base.jpg",
};

describe("buildPostPreview — post único", () => {
  it("empilha foto, banda borrada e SVG sobre a base", async () => {
    const [page] = await buildPostPreview({ ...post, base_luminance: await grid(20) }, spec());
    expect(page.layers.find((l) => l.kind === "photo")).toEqual({
      kind: "photo",
      url: "https://exemplo.test/p1-base.jpg",
    });
    const blur = page.layers.find((l) => l.kind === "blur");
    expect(blur).toBeDefined();
    if (blur?.kind === "blur") {
      expect(blur.topFrac).toBeGreaterThan(0);
      expect(blur.topFrac).toBeLessThan(1);
      expect(blur.featherFrac).toBeGreaterThan(0);
    }
    expect(page.svg).toContain(HOOK.slice(0, 12));
    expect(page.svg).toContain('width="100%"');
  });

  it.each([
    ["editorial-noir", "Inter"],
    ["brutalism", "Anton"],
    ["serif-luxe", "DM Serif Display"],
    ["swiss-mono", "IBM Plex Mono"],
  ])("preset %s desenha na tipografia %s", async (preset, family) => {
    const s = spec();
    const [page] = await buildPostPreview(
      post,
      spec({ cardBrand: { ...s.cardBrand, layoutPreset: preset as never } })
    );
    expect(page.svg).toContain(`font-family="${family}"`);
  });

  it("fundo escuro pede texto claro; fundo claro pede texto escuro", async () => {
    const [escuro] = await buildPostPreview({ ...post, base_luminance: await grid(10) }, spec());
    const [claro] = await buildPostPreview({ ...post, base_luminance: await grid(245) }, spec());
    expect(escuro.svg).toContain("#FFFFFF");
    expect(claro.svg).toContain("#0A0A0A");
  });

  it("contra-capa entra como 2ª página quando o post tem uma", async () => {
    const semContraCapa = await buildPostPreview(post, spec({ closingPage: false }));
    const comContraCapa = await buildPostPreview(post, spec({ closingPage: true }));
    expect(semContraCapa).toHaveLength(1);
    expect(comContraCapa).toHaveLength(2);
    // a contra-capa é 100% sintética: sem foto de fundo
    expect(comContraCapa[1].layers.some((l) => l.kind === "photo")).toBe(false);
    expect(comContraCapa[1].svg).toContain("IA"); // a palavra-chave vira headline
  });

  it("marca d'água do plano free entra no SVG (não é camada raster)", async () => {
    const [comMarca] = await buildPostPreview(post, spec({ watermark: true }));
    const [semMarca] = await buildPostPreview(post, spec({ watermark: false }));
    expect(comMarca.svg).toContain("feito com PostPilot");
    expect(semMarca.svg).not.toContain("feito com PostPilot");
  });

  it("logo vira camada raster com geometria em fração do quadro", async () => {
    const s = spec();
    const [page] = await buildPostPreview(
      post,
      spec({ brandTemplate: { ...s.brandTemplate, showLogo: true, logoUrl: "https://x.test/l.png" } })
    );
    const logo = page.layers.find((l) => l.kind === "logo");
    expect(logo).toMatchObject({ url: "https://x.test/l.png" });
    if (logo?.kind === "logo") {
      expect(logo.sizeFrac).toBeCloseTo(64 / 1080, 5);
      expect(logo.marginFrac).toBeCloseTo(40 / 1080, 5);
    }
  });

  it("mudar o Brand Kit muda o preview — é o que a Fila reflete sem job", async () => {
    const s = spec();
    const [antes] = await buildPostPreview(post, spec());
    const [depois] = await buildPostPreview(
      post,
      spec({ cardBrand: { ...s.cardBrand, colorAccent: "#00FF88" } })
    );
    expect(antes.svg).not.toEqual(depois.svg);
    expect(depois.svg).toContain("#00FF88");
  });
});

describe("buildPostPreview — compatibilidade com posts anteriores à 040", () => {
  it("sem base_image_url devolve a arte já composta, marcada como legado", async () => {
    const pages = await buildPostPreview(
      {
        id: "old",
        format: "single",
        hook: HOOK,
        base_image_url: null,
        image_url: "https://exemplo.test/old.jpg",
        closing_image_url: "https://exemplo.test/old-closing.jpg",
      },
      spec()
    );
    expect(pages).toHaveLength(2);
    expect(pages[0].legacyImageUrl).toBe("https://exemplo.test/old.jpg");
    expect(pages[0].svg).toBe("");
  });

  it("post sem base E sem arte não devolve página nenhuma", async () => {
    const pages = await buildPostPreview(
      { id: "vazio", format: "single", hook: HOOK, base_image_url: null },
      spec()
    );
    expect(pages).toEqual([]);
  });

  it("sem grade de luminância assume fundo escuro (texto claro é o caso seguro)", async () => {
    const [page] = await buildPostPreview({ ...post, base_luminance: null }, spec());
    expect(page.svg).toContain("#FFFFFF");
  });
});

describe("buildPostPreview — carrossel", () => {
  function card(idx: number, over: Partial<EmbeddedCarouselCard> = {}): EmbeddedCarouselCard {
    return {
      id: `c${idx}`,
      idx,
      role: idx === 0 ? "hook" : "value",
      headline: `Card ${idx}`,
      body: "corpo do card",
      image_url: null,
      bg_url: `https://exemplo.test/bg-${idx}.jpg`,
      bg_luminance: null,
      layout: null,
      video_url: null,
      video_poster_url: null,
      video_status: "none",
      video_error: null,
      ...over,
    };
  }

  it("uma página por card, cada uma com o próprio fundo", async () => {
    const cards = [card(0), card(1), card(2)];
    const pages = await buildPostPreview({ ...post, format: "carousel" }, spec(), cards);
    expect(pages).toHaveLength(3);
    pages.forEach((p, i) => {
      expect(p.layers.find((l) => l.kind === "photo")).toMatchObject({
        url: `https://exemplo.test/bg-${i}.jpg`,
      });
      expect(p.svg).toContain(`Card ${i}`);
    });
  });

  it("card já renderizado e sem fundo guardado cai no legado", async () => {
    const pages = await buildPostPreview(
      { ...post, format: "carousel" },
      spec(),
      [card(0, { bg_url: null, image_url: "https://exemplo.test/pronto.png" })]
    );
    expect(pages[0].legacyImageUrl).toBe("https://exemplo.test/pronto.png");
  });

  // O override por card (migration 035) só tem efeito quando a superfície
  // usa um MODELO do Template Studio — renderAndUploadCard, o motor
  // antigo, nunca recebeu textColor/showLabel. O preview espelha isso.
  const CAPA_SPEC = {
    surface: "cover_image" as const,
    canvas: { w: 1080, h: 1350 },
    elements: [
      {
        id: "h",
        type: "headline" as const,
        anchor: "bottom-left" as const,
        offset: { x: 0.08, y: 0.7 },
        size: { fontSize: 72 },
        style: { color: "auto" },
        bind: "content.headline",
      },
    ],
  };

  it("override de cor do card vence o contraste automático (card com modelo)", async () => {
    const comModelo = spec({ templates: { cover_image: { id: "t1", spec: CAPA_SPEC } } });
    const [escuro] = await buildPostPreview({ ...post, format: "carousel" }, comModelo, [
      card(0, { bg_luminance: null, layout: { textColor: "dark" } }),
    ]);
    const [claro] = await buildPostPreview({ ...post, format: "carousel" }, comModelo, [
      card(0, { bg_luminance: null, layout: { textColor: "light" } }),
    ]);
    expect(escuro.svg).toContain("#111111");
    expect(claro.svg).toContain("#FFFFFF");
  });

  it("showLabel:false esconde a marca só naquele card", async () => {
    const comModelo = spec({
      templates: {
        cover_image: {
          id: "t1",
          spec: {
            ...CAPA_SPEC,
            elements: [
              ...CAPA_SPEC.elements,
              {
                id: "w",
                type: "wordmark" as const,
                anchor: "top-left" as const,
                offset: { x: 0.08, y: 0.1 },
                bind: "brand.wordmark",
              },
            ],
          },
        },
      },
    });
    const [com] = await buildPostPreview({ ...post, format: "carousel" }, comModelo, [card(0)]);
    const [sem] = await buildPostPreview({ ...post, format: "carousel" }, comModelo, [
      card(0, { layout: { showLabel: false } }),
    ]);
    expect(com.svg).toContain("OVERLENS");
    expect(sem.svg).not.toContain("OVERLENS");
  });

  it("carrossel sem cards não devolve página", async () => {
    expect(await buildPostPreview({ ...post, format: "carousel" }, spec(), [])).toEqual([]);
  });
});

// Post aprovado que volta pra fila: o vídeo COMPOSTO (página inteira já
// queimada) não pode virar a fonte do preview, senão ele é encaixado de
// novo dentro da moldura 16:9 que o preview desenha — a página aparecia
// espremida dentro do buraco do vídeo (visto ao vivo em 29/07).
describe("preview de vídeo usa sempre o arquivo BRUTO", () => {
  // O caminho do bruto é derivado da URL pública do Storage (não existe
  // coluna pra ele) — sem a env não há camada de vídeo pra conferir.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.test";

  function cardComVideo(): EmbeddedCarouselCard {
    return {
      id: "c1",
      idx: 1,
      role: "value",
      headline: "Card com vídeo",
      body: "corpo",
      image_url: null,
      bg_url: null,
      bg_luminance: null,
      layout: null,
      video_url: "https://exemplo.test/composto-card.mp4",
      video_poster_url: "https://exemplo.test/poster.jpg",
      video_status: "ready",
      video_error: null,
    };
  }

  it("card do carrossel ignora o composto e aponta pro -video-source.mp4", async () => {
    const cards = [cardComVideo()];
    const pages = await buildPostPreview({ ...post, format: "carousel" }, spec(), cards);
    const video = pages[0].layers.find((l) => l.kind === "video");
    expect(video?.url).toContain("-card-1-video-source.mp4");
    expect(video?.url).not.toContain("composto-card.mp4");
  });

  it("post de vídeo idem", async () => {
    const pages = await buildPostPreview(
      {
        ...post,
        format: "video",
        video_shape: "reels",
        video_status: "ready",
        video_url: "https://exemplo.test/composto.mp4",
      },
      spec({ format: "video", videoShape: "reels" }),
      []
    );
    const video = pages[0].layers.find((l) => l.kind === "video");
    expect(video?.url).toContain("-video-source.mp4");
    expect(video?.url).not.toContain("composto.mp4");
  });
});

// Trocar o vídeo grava por cima do MESMO caminho no Storage (upsert), e
// sem carimbo de versão o navegador/CDN continuava servindo o arquivo
// antigo: pôster novo, vídeo velho embaixo (relatado em 29/07).
describe("URL do vídeo carrega a versão do upload", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.test";

  it("usa o carimbo ?v= do pôster, que é regravado a cada upload", async () => {
    const pages = await buildPostPreview(
      {
        ...post,
        format: "video",
        video_shape: "reels",
        video_status: "ready",
        video_poster_url: "https://exemplo.test/poster.jpg?v=1785352702365",
      },
      spec({ format: "video", videoShape: "reels" }),
      []
    );
    const video = pages[0].layers.find((l) => l.kind === "video");
    expect(video?.url).toContain("-video-source.mp4?v=1785352702365");
  });

  it("sem carimbo no pôster, a URL sai limpa em vez de quebrada", async () => {
    const pages = await buildPostPreview(
      {
        ...post,
        format: "video",
        video_shape: "reels",
        video_status: "ready",
        video_poster_url: null,
      },
      spec({ format: "video", videoShape: "reels" }),
      []
    );
    const video = pages[0].layers.find((l) => l.kind === "video");
    expect(video?.url).toMatch(/-video-source\.mp4$/);
  });
});

// Foto de fundo do vídeo no feed 4:5 (migration 048). Coluna própria:
// base_image_url guarda o PÔSTER do vídeo (attach-video), não a escolha
// da pessoa — usar o mesmo campo fazia o pôster virar fundo sozinho.
describe("feed 4:5 com foto de fundo escolhida", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.test";

  const videoFeed = {
    ...post,
    format: "video_feed" as const,
    video_shape: "feed" as const,
    video_status: "ready" as const,
    video_poster_url: "https://exemplo.test/poster.jpg?v=1",
  };

  it("a foto entra como camada e o pôster do vídeo NÃO", async () => {
    const pages = await buildPostPreview(
      {
        ...videoFeed,
        base_image_url: "https://exemplo.test/poster-do-video.jpg",
        bg_image_url: "https://exemplo.test/escolhida.jpg",
      },
      spec({ format: "video_feed", videoShape: "feed" }),
      []
    );
    const foto = pages[0].layers.find((l) => l.kind === "photo");
    expect(foto).toMatchObject({ url: "https://exemplo.test/escolhida.jpg" });
  });

  it("sem foto escolhida não há camada de foto — fundo é a cor", async () => {
    const pages = await buildPostPreview(
      { ...videoFeed, base_image_url: "https://exemplo.test/poster-do-video.jpg", bg_image_url: null },
      spec({ format: "video_feed", videoShape: "feed" }),
      []
    );
    expect(pages[0].layers.some((l) => l.kind === "photo")).toBe(false);
  });

  it("'sem véu' não desenha o gradiente que o 'auto' desenha", async () => {
    const base = { ...videoFeed, bg_image_url: "https://exemplo.test/escolhida.jpg" };
    const auto = await buildPostPreview(
      { ...base, bg_overlay: "auto" },
      spec({ format: "video_feed", videoShape: "feed" }),
      []
    );
    const off = await buildPostPreview(
      { ...base, bg_overlay: "off" },
      spec({ format: "video_feed", videoShape: "feed" }),
      []
    );
    // 'auto' desenha a placa translúcida; 'off' não desenha placa nenhuma
    // (a foto fica limpa) — nos dois casos o buraco da moldura continua.
    expect(auto[0].svg).toMatch(/fill-opacity="0\.\d+" mask="url\(#feed-video-hole-\w+\)"/);
    expect(off[0].svg).not.toMatch(/fill-opacity="0\.\d+" mask="url\(#feed-video-hole-\w+\)"/);
  });
});

// O feed BORRADO estava sendo desenhado na fila com o overlay do feed
// SÓLIDO: aquele markup pinta o quadro com a cor da marca e abre só o
// buraco da moldura, então a cópia borrada do vídeo ficava escondida e os
// dois enquadramentos pareciam iguais (relatado em 29/07).
describe("feed borrado no preview", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.test";

  const baseVideo = {
    ...post,
    format: "video_feed" as const,
    video_status: "ready" as const,
    video_poster_url: "https://exemplo.test/poster.jpg?v=1",
  };

  it("não pinta retângulo de fundo — o fundo é o vídeo borrado", async () => {
    const [page] = await buildPostPreview(
      { ...baseVideo, video_shape: "feed-blur" },
      spec({ format: "video_feed", videoShape: "feed-blur" }),
      []
    );
    expect(page.svg).not.toMatch(/mask="url\(#feed-video-hole-\w+\)"/);
    const videos = page.layers.filter((l) => l.kind === "video");
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({ blurredBackdrop: true, frame: null });
  });

  it("o feed SÓLIDO continua com o retângulo de fundo", async () => {
    const [page] = await buildPostPreview(
      { ...baseVideo, video_shape: "feed" },
      spec({ format: "video_feed", videoShape: "feed" }),
      []
    );
    expect(page.svg).toMatch(/mask="url\(#feed-video-hole-\w+\)"/);
    expect(page.layers.filter((l) => l.kind === "video")).toHaveLength(1);
  });
});

// Card de carrossel COM vídeo era obrigado a fundo sólido: subir foto
// nele não mudava nada, porque o retângulo cobria a foto toda.
describe("card com vídeo aceita foto de fundo", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.test";

  function cardVideo(over: Partial<EmbeddedCarouselCard> = {}): EmbeddedCarouselCard {
    return {
      id: "cv",
      idx: 1,
      role: "value",
      headline: "Card com vídeo",
      body: "corpo",
      image_url: null,
      bg_url: null,
      bg_luminance: null,
      layout: null,
      video_url: null,
      video_poster_url: "https://exemplo.test/card-poster.jpg?v=9",
      video_status: "ready",
      video_error: null,
      ...over,
    };
  }

  it("com foto, entra a camada de foto e o fundo vira placa translúcida", async () => {
    const cards = [cardVideo({ bg_url: "https://exemplo.test/foto-card.jpg" })];
    const [page] = await buildPostPreview({ ...post, format: "carousel" }, spec(), cards);
    expect(page.layers.find((l) => l.kind === "photo")).toMatchObject({
      url: "https://exemplo.test/foto-card.jpg",
    });
    // O recorte da moldura continua (é por onde o vídeo aparece); o que
    // muda é o preenchimento: placa translúcida em vez da cor da marca.
    expect(page.svg).toMatch(/mask="url\(#card-video-hole-\w+\)"/);
    expect(page.svg).toMatch(/fill-opacity="0\.\d+" mask="url\(#card-video-hole-\w+\)"/);
  });

  it("sem foto, o card com vídeo segue no fundo sólido da marca", async () => {
    const [page] = await buildPostPreview({ ...post, format: "carousel" }, spec(), [cardVideo()]);
    expect(page.layers.some((l) => l.kind === "photo")).toBe(false);
    expect(page.svg).toMatch(/mask="url\(#card-video-hole-\w+\)"/);
  });
});

// O véu de leitura (048) nasceu no vídeo em feed 4:5, mas a foto de fundo
// vale no post único também — e até 29/07 escolher 'on'/'off' na página 1
// não mudava nada: só a foto era respeitada, o véu ficava sempre em 'auto'.
describe("véu da foto de fundo vale na página 1 do post único", () => {
  function alphaDoVeu(svg: string): number {
    // O véu é um gradiente/retângulo com fill-opacity; pega o maior valor
    // desenhado — é o da placa de leitura.
    const valores = [...svg.matchAll(/(?:fill|stop)-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    return valores.length ? Math.max(...valores) : 0;
  }

  const comFoto = {
    ...post,
    bg_image_url: "https://exemplo.test/p1-bg.jpg",
  };

  it("'on' escurece mais que 'auto'", async () => {
    const g = await grid(120);
    const [auto] = await buildPostPreview(
      { ...comFoto, bg_image_luminance: g, bg_overlay: "auto" },
      spec()
    );
    const [on] = await buildPostPreview(
      { ...comFoto, bg_image_luminance: g, bg_overlay: "on" },
      spec()
    );
    expect(alphaDoVeu(on.svg)).toBeGreaterThanOrEqual(0.55);
    expect(alphaDoVeu(on.svg)).toBeGreaterThan(alphaDoVeu(auto.svg));
  });

  it("'off' não desenha véu nenhum", async () => {
    const [off] = await buildPostPreview(
      { ...comFoto, bg_image_luminance: await grid(120), bg_overlay: "off" },
      spec()
    );
    expect(alphaDoVeu(off.svg)).toBe(0);
  });

  it("sem foto escolhida, a escolha é ignorada (a base gerada segue em 'auto')", async () => {
    const g = await grid(120);
    const [semFoto] = await buildPostPreview(
      { ...post, base_luminance: g, bg_overlay: "on" },
      spec()
    );
    const [padrao] = await buildPostPreview({ ...post, base_luminance: g }, spec());
    expect(alphaDoVeu(semFoto.svg)).toBe(alphaDoVeu(padrao.svg));
  });
});
