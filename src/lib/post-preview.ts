// ============================================================
// Preview AO VIVO da arte de um post que ainda está na fila.
//
// A arte só é montada na aprovação (migration 040). Até lá a Fila mostra
// isto: a foto base + o MESMO SVG que o render final vai rasterizar,
// desenhado direto pelo browser. Sem resvg, sem sharp, sem Storage, sem
// job — trocar template/cor/layout em Ajustes aparece no próximo carregar
// da página.
//
// A fidelidade vem de não reimplementar nada: os construtores de SVG
// (buildPageOneCoverSvg, buildCoverSvg, renderFromSpec, buildProfileChipSvg)
// são os mesmos do pipeline real, e a decisão de contraste sai da grade de
// luminância medida na geração — o mesmo número que a arte final vai usar.
// O que o SVG não cobre (a foto, a banda borrada, o avatar, a logo) sai
// como camada declarativa e o componente desenha em HTML.
//
// Precedente no repo: LayoutPreview.tsx + layout-preview.ts já injetam
// SVG desses mesmos builders no browser (previews de Ajustes).
// ============================================================
import { luminanceOfRegion, pickTheme, textColorForTheme, overlayAlphaFor } from "@/lib/contrast";
import { buildProfileChipSvg } from "@/lib/profile-chip";
import { buildPageOneCoverSvg, buildClosingCoverSvg, buildWatermarkSvg } from "@/lib/cover-svg";
import { buildCardSvgPlan, CARD_W, CARD_H } from "@/lib/carousel-render";
import { applyBackground } from "@/lib/render-spec";
import {
  buildCardVideoOverlaySvg,
  buildFeedVideoBlurBgOverlaySvg,
  buildFeedVideoOverlaySvg,
  buildReelsVideoOverlaySvg,
} from "@/lib/image";
import { renderFromSpec } from "@/lib/template-render";
import type { LumGrid } from "@/lib/contrast";
import type {
  CardLayoutOverride,
  EmbeddedCarouselCard,
  PostFormat,
  RenderSpec,
  Surface,
} from "@/lib/types";

const WIDTH = 1080;
const HEIGHT = 1350;
/** Banda do topo medida à parte (meta-linha dos layouts alternativos). */
const TOP_BAND_H = 140;

/** Camada que o SVG não consegue desenhar — o componente resolve em HTML. */
export type PreviewLayer =
  /** Foto de fundo, full-bleed. A base já vem recortada no quadro certo. */
  | { kind: "photo"; url: string }
  /** Banda borrada atrás do texto, a partir de `topFrac` (0–1) até a base.
   * `featherFrac` é a fração da banda que esfumaça a borda de cima, pra
   * não deixar costura visível — mesmo cálculo de composePhotoBg. */
  | { kind: "blur"; topFrac: number; featherFrac: number }
  /** Selo circular da logo da marca, canto superior direito. */
  | { kind: "logo"; url: string; sizeFrac: number; marginFrac: number }
  /** Avatar do chip de perfil (o resto do chip já está no SVG). */
  | { kind: "avatar"; url: string; xFrac: number; yFrac: number; sizeFrac: number }
  /**
   * Vídeo já anexado ao post/card. Vai ATRÁS do SVG: os overlays de
   * vídeo desenham o fundo com um buraco arredondado exatamente na
   * moldura, então o vídeo só aparece através dele — mesmo encaixe que o
   * ffmpeg faz no render final. `frac` é o retângulo da moldura em
   * fração do quadro; ausente = vídeo cobre o quadro inteiro (Reels e
   * feed-blur, onde o fundo É o vídeo).
   */
  | {
      kind: "video";
      url: string;
      poster: string | null;
      frame: { xFrac: number; yFrac: number; wFrac: number; hFrac: number; radiusFrac: number } | null;
      /** Cópia borrada cobrindo o quadro (fundo do feed-blur). */
      blurredBackdrop?: boolean;
    };

export interface PreviewPage {
  /** SVG completo da página, pronto pra injetar (largura/altura em 100%). */
  svg: string;
  layers: PreviewLayer[];
  aspect: string;
  /** Post anterior à migration 040: só temos a arte pronta, sem preview vivo. */
  legacyImageUrl?: string;
}

export interface PreviewPostInput {
  id: string;
  format: PostFormat;
  hook: string | null;
  base_image_url?: string | null;
  base_luminance?: LumGrid | null;
  /** arte já composta (posts anteriores à 040, ou já aprovados) */
  image_url?: string | null;
  closing_image_url?: string | null;
  video_poster_url?: string | null;
  /** Vídeo COMPOSTO (só existe depois de aprovar). */
  video_url?: string | null;
  video_status?: "none" | "processing" | "ready" | "error" | null;
  video_shape?: "reels" | "feed" | "feed-blur" | null;
  /** Foto de fundo escolhida (048) + o véu por cima dela. */
  bg_image_url?: string | null;
  bg_image_luminance?: LumGrid | null;
  bg_overlay?: "auto" | "on" | "off" | null;
}

/** Escala o SVG pro container (mesmo truque de layout-preview.ts). */
function fill(svg: string): string {
  return svg.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
}

/** Camada da banda borrada, com o mesmo feather de composePhotoBg. */
function blurLayer(blurBandTop: number, canvasH: number): PreviewLayer {
  const bandH = canvasH - blurBandTop;
  return {
    kind: "blur",
    topFrac: blurBandTop / canvasH,
    featherFrac: Math.min(0.35, 70 / bandH),
  };
}

/** Junta o SVG da página com os SVGs sobrepostos (chip, marca d'água),
 * que já vêm no mesmo sistema de coordenadas do canvas. */
function stack(canvas: { w: number; h: number }, ...parts: string[]): string {
  const inner = parts
    .filter(Boolean)
    .map((p) => p.replace(/<\/?svg[^>]*>/g, ""))
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}" viewBox="0 0 ${canvas.w} ${canvas.h}">${inner}</svg>`;
}

/**
 * Tema e véu de legibilidade de uma região, a partir da grade medida na
 * geração. Sem grade (post antigo, ou medição que falhou), assume fundo
 * escuro — é o caso seguro: texto claro sobre véu preto continua legível
 * mesmo se a foto for clara, o contrário não.
 */
function luminanceAt(
  grid: LumGrid | null | undefined,
  rect: { top: number; height: number },
  canvas: { w: number; h: number }
): number {
  if (!grid) return 0.15;
  return luminanceOfRegion(
    grid,
    { left: 0, top: rect.top, width: canvas.w, height: rect.height },
    { width: canvas.w, height: canvas.h }
  );
}

/**
 * Véu sobre a foto de fundo (048). 'auto' respeita a medição, com o piso
 * de vídeo; 'on' escurece de vez mesmo quando a medida dispensaria; 'off'
 * não desenha nada — foto limpa não precisa de véu, e forçar um deixava
 * a arte lavada.
 */
function veilFor(
  c: { theme: "light" | "dark"; textColor: string; alpha: number },
  overlay: "auto" | "on" | "off" | null | undefined
): { theme: "light" | "dark"; textColor: string; alpha: number } | undefined {
  // textColor SEMPRE vai junto: com foto de fundo quem decide a cor do
  // texto é a luminância medida, não a cor da marca (buildFeedVideoOverlaySvg).
  const base = { theme: c.theme, textColor: c.textColor };
  if (overlay === "off") return { ...base, alpha: 0 };
  if (overlay === "on") return { ...base, alpha: Math.max(0.55, c.alpha) };
  return { ...base, alpha: Math.max(0.32, c.alpha) };
}

function contrastFor(
  grid: LumGrid | null | undefined,
  rect: { top: number; height: number },
  canvas: { w: number; h: number }
) {
  const luminance = luminanceAt(grid, rect, canvas);
  const theme = pickTheme(luminance);
  const textColor = textColorForTheme(theme);
  return { theme, textColor, alpha: overlayAlphaFor(theme, textColor, luminance), luminance };
}

/**
 * Véu da meta-linha do topo. Usa o tema e a cor de texto da BANDA de
 * identidade com a luminância LOCAL do topo — é assim no render real
 * (composeCoverStyleContent / renderAltLayoutCard): a cor do texto é uma
 * só no card inteiro, só a opacidade da placa muda com o que está atrás.
 * Calcular um tema próprio pro topo daria uma cor de texto diferente da
 * do render.
 */
function topOverlayFor(
  grid: LumGrid | null | undefined,
  band: { theme: "light" | "dark"; textColor: string },
  canvas: { w: number; h: number }
) {
  const topLuminance = luminanceAt(grid, { top: 0, height: TOP_BAND_H }, canvas);
  return { theme: band.theme, alpha: overlayAlphaFor(band.theme, band.textColor, topLuminance) };
}

/** Chip + marca d'água, as duas sobreposições que independem do layout. */
function overlaysFor(spec: RenderSpec, canvas: { w: number; h: number }, position: "top-center" | "bottom-left") {
  const parts: string[] = [];
  const layers: PreviewLayer[] = [];

  if (spec.profile.showProfileChip) {
    const chip = buildProfileChipSvg(spec.profile, canvas.w, spec.brandTemplate.fontFamily, {
      position,
      canvasHeight: canvas.h,
      widthPercent: position === "bottom-left" ? 0.3 : 0.33,
    });
    parts.push(chip.svg);
    if (chip.avatar && spec.profile.avatarUrl) {
      layers.push({
        kind: "avatar",
        url: spec.profile.avatarUrl,
        xFrac: chip.avatar.x / canvas.w,
        yFrac: chip.avatar.y / canvas.h,
        sizeFrac: chip.avatar.size / canvas.w,
      });
    }
  }

  if (spec.watermark) parts.push(buildWatermarkSvg(canvas.w, canvas.h));

  if (spec.brandTemplate.showLogo && spec.brandTemplate.logoUrl) {
    layers.push({
      kind: "logo",
      url: spec.brandTemplate.logoUrl,
      sizeFrac: 64 / 1080,
      marginFrac: 40 / 1080,
    });
  }
  return { parts, layers };
}

/** Página 1 do post único (e o quadro do vídeo feed): foto + título. */
function buildPageOne(post: PreviewPostInput, spec: RenderSpec, photoUrl: string | null): PreviewPage {
  const canvas = { w: WIDTH, h: HEIGHT };
  // A grade tem que ser da foto que está DE FATO no fundo: medir a base
  // gerada e desenhar a foto escolhida daria contraste calculado contra a
  // imagem errada — texto claro sobre foto clara, por exemplo.
  const grid = post.bg_image_url ? post.bg_image_luminance : post.base_luminance;

  // Duas medições, exatamente como composeCoverStyleContent faz: a banda
  // de identidade (que começa onde o layout disser) e a meta-linha do
  // topo, que fica fora dela e precisa do próprio véu.
  const probe = buildPageOneCoverSvg(post.hook ?? "", { ...spec.cardBrand, colorText: "#FFFFFF" }, true, {
    showSwipeHint: false,
  });
  const band = contrastFor(grid, { top: probe.blurBandTop, height: canvas.h - probe.blurBandTop }, canvas);

  // O véu escolhido (048) só vale quando há FOTO de fundo — na base
  // gerada não existe escolha a respeitar. Mesma conta de
  // composeCoverStyleContent, senão a fila mostraria um véu e a arte
  // final outro.
  const veil = (a: number) =>
    post.bg_image_url
      ? post.bg_overlay === "off"
        ? 0
        : post.bg_overlay === "on"
          ? Math.max(0.55, a)
          : a
      : a;
  const top = topOverlayFor(grid, band, canvas);

  const { svg, blurBandTop } = buildPageOneCoverSvg(
    post.hook ?? "",
    { ...spec.cardBrand, colorText: band.textColor },
    !!photoUrl,
    {
      showSwipeHint: false,
      overlay: { theme: band.theme, alpha: veil(band.alpha) },
      topOverlay: { theme: top.theme, alpha: veil(top.alpha) },
    }
  );

  const layers: PreviewLayer[] = [];
  if (photoUrl) {
    layers.push({ kind: "photo", url: photoUrl });
    if (blurBandTop != null) layers.push(blurLayer(blurBandTop, canvas.h));
  }
  // Página 1 não tem chip por decisão de produto (o Instagram já mostra o
  // perfil por cima do post) — só logo e marca d'água.
  const extra = overlaysFor({ ...spec, profile: { ...spec.profile, showProfileChip: false } }, canvas, "top-center");
  layers.push(...extra.layers);

  return { svg: fill(stack(canvas, svg, ...extra.parts)), layers, aspect: "1080 / 1350" };
}

/** Contra-capa: 100% sintética (sem foto) — o preview é exato. */
function buildClosing(spec: RenderSpec): PreviewPage {
  const canvas = { w: WIDTH, h: HEIGHT };
  const svg = buildClosingCoverSvg(spec.identity, spec.cardBrand, spec.brandTemplate.fontFamily);
  const extra = overlaysFor(spec, canvas, "bottom-left");
  return { svg: fill(stack(canvas, svg, ...extra.parts)), layers: extra.layers, aspect: "1080 / 1350" };
}

/** Um card do carrossel — pelo modelo do Template Studio quando existe,
 * senão pela MESMA árvore de decisão do render (buildCardSvgPlan). */
async function buildCard(
  card: EmbeddedCarouselCard,
  total: number,
  spec: RenderSpec
): Promise<PreviewPage> {
  const canvas = { w: CARD_W, h: CARD_H };
  const isCover = card.idx === 0;
  const isClosing = card.idx === total - 1;
  const pageKind = isCover ? "cover" : isClosing ? "closing" : "interior";
  const surface: Surface = isCover ? "cover_image" : isClosing ? "carousel_last" : "carousel_page";
  const chosen = spec.templates[surface]?.spec;
  const override = (card.layout as CardLayoutOverride | null) ?? {};
  // Fundo por CARD sobrepõe o do post — página escura no meio de um
  // carrossel claro é decisão de ritmo, não de identidade.
  const cardBrand = applyBackground(spec.cardBrand, override.bgMode, override.bgColor);
  const photoUrl = card.bg_url ?? null;
  const grid = card.bg_luminance;

  const forced = override.textColor && override.textColor !== "auto" ? override.textColor : null;
  const layers: PreviewLayer[] = [];
  if (photoUrl) layers.push({ kind: "photo", url: photoUrl });

  let svg: string;
  let blurBandTop: number | null = null;

  if (chosen) {
    // Motor de spec: mede a imagem INTEIRA — renderTemplateCardPng faz
    // exatamente isso, não tem banda de identidade separada.
    const whole = contrastFor(grid, { top: 0, height: canvas.h }, canvas);
    const theme = forced ? (forced === "light" ? "dark" : "light") : whole.theme;
    const textColor = forced ? (forced === "light" ? "#FFFFFF" : "#111111") : whole.textColor;
    svg = renderFromSpec(
      override.showLabel === false ? hideMarks(chosen) : chosen,
      { ...cardBrand, colorText: textColor },
      { headline: card.headline ?? undefined, body: card.body ?? undefined },
      undefined,
      photoUrl
        ? {
            transparentBg: true,
            overlay: { theme, alpha: overlayAlphaFor(theme, textColor, whole.luminance) },
          }
        : undefined
    );
  } else {
    // Mesma função que o render usa — a diferença é só de onde vem a
    // luminância: aqui da grade guardada, lá do sharp.
    const plan = await buildCardSvgPlan(
      { idx: card.idx, role: card.role, headline: card.headline ?? "", body: card.body ?? "" },
      cardBrand,
      pageKind,
      !!photoUrl,
      total,
      override.imagePosition ?? null,
      (rect) => luminanceAt(grid, rect, canvas)
    );
    svg = plan.svg;
    blurBandTop = plan.blurBandTop;
  }
  if (photoUrl && blurBandTop != null) layers.push(blurLayer(blurBandTop, canvas.h));

  const extra = overlaysFor(
    // chip só no fechamento (renderAndUploadCard faz o mesmo)
    { ...spec, profile: { ...spec.profile, showProfileChip: spec.profile.showProfileChip && isClosing } },
    canvas,
    "bottom-left"
  );
  layers.push(...extra.layers);
  return { svg: fill(stack(canvas, svg, ...extra.parts)), layers, aspect: "1080 / 1350" };
}

const REELS_H = 1920;

/**
 * URL pública do vídeo BRUTO que o usuário anexou. O caminho é derivado
 * (bucket público, nome determinístico gravado por uploadPostVideo /
 * uploadCarouselCardVideo) — não existe coluna pra ele porque o vídeo
 * COMPOSTO, esse sim gravado em video_url, só nasce na aprovação.
 */
function sourceVideoUrl(postId: string, cardIdx?: number, posterUrl?: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const name =
    cardIdx == null ? `${postId}-video-source.mp4` : `${postId}-card-${cardIdx}-video-source.mp4`;
  // O caminho é FIXO e o upload é upsert: trocar o vídeo do post grava
  // por cima do mesmo nome, então navegador e CDN continuavam servindo o
  // arquivo antigo — o card mostrava o pôster novo com o vídeo velho
  // embaixo (relatado em 29/07, depois de três trocas seguidas).
  // O pôster é regravado a cada upload com `?v=<timestamp>`; reusar esse
  // mesmo carimbo aqui identifica a VERSÃO do vídeo sem coluna nova.
  const version = posterUrl?.match(/[?&]v=(\d+)/)?.[1];
  return version
    ? `${base}/storage/v1/object/public/post-images/${name}?v=${version}`
    : `${base}/storage/v1/object/public/post-images/${name}`;
}

/** Moldura do render (px no quadro) → fração, que é o que o preview usa. */
function frameToFrac(
  frame: { x: number; y: number; w: number; h: number; radius: number },
  canvas: { w: number; h: number }
) {
  return {
    xFrac: frame.x / canvas.w,
    yFrac: frame.y / canvas.h,
    wFrac: frame.w / canvas.w,
    hFrac: frame.h / canvas.h,
    radiusFrac: frame.radius / canvas.w,
  };
}

/**
 * Card de carrossel COM vídeo: mesmo overlay do render (título → moldura
 * 16:9 → corpo → rótulo), com o vídeo encaixado atrás do buraco. Só o
 * card que tem vídeo passa por aqui — antes a prévia pintava o vídeo em
 * todos os interiores e ainda por cima em tela cheia.
 */
function buildCardWithVideo(
  card: EmbeddedCarouselCard,
  postId: string,
  total: number,
  spec: RenderSpec
): PreviewPage {
  const canvas = { w: CARD_W, h: CARD_H };
  const pageKind = card.idx === 0 ? "cover" : card.idx === total - 1 ? "closing" : "interior";
  const override = (card.layout as CardLayoutOverride | null) ?? {};
  // Foto no card COM vídeo (2026-07-29): a foto do card vale como fundo,
  // igual ao feed 4:5. Antes o card com vídeo era sempre fundo sólido, e
  // subir foto nele não mudava nada — o retângulo cobria a foto inteira.
  const photoBgUrl = card.bg_url ?? null;
  const framePeek = buildCardVideoOverlaySvg(
    { headline: card.headline, body: card.body },
    spec.cardBrand,
    { pageKind, index: card.idx, total }
  ).frame;
  const bandTop = framePeek.y + framePeek.h;
  const c = photoBgUrl
    ? contrastFor(card.bg_luminance, { top: bandTop, height: canvas.h - bandTop }, canvas)
    : null;
  const { svg, frame } = buildCardVideoOverlaySvg(
    { headline: card.headline, body: card.body },
    applyBackground(spec.cardBrand, override.bgMode, override.bgColor),
    {
      pageKind,
      index: card.idx,
      total,
      // textColor explícito: o builder já tem a rede que deriva do tema,
      // mas mandar o valor medido aqui mantém prévia e render dizendo a
      // MESMA coisa, que é o contrato do render-on-approval.
      photoBg: c
        ? { theme: c.theme, alpha: Math.max(0.32, c.alpha), textColor: textColorForTheme(c.theme) }
        : undefined,
    }
  );
  // SEMPRE o vídeo BRUTO: o preview desenha a moldura e o texto por cima,
  // ao vivo. Usar o composto (que já traz a página inteira queimada)
  // colocava uma página dentro do buraco 16:9 da outra — foi o que
  // aconteceu com carrossel aprovado que voltou pra fila (29/07). O
  // composto continua sendo o que a tela Prontos e a publicação usam.
  const url = sourceVideoUrl(postId, card.idx, card.video_poster_url);
  const layers: PreviewLayer[] = [];
  if (photoBgUrl) layers.push({ kind: "photo", url: photoBgUrl });
  if (url) {
    layers.push({ kind: "video", url, poster: card.video_poster_url, frame: frameToFrac(frame, canvas) });
  }
  return { svg: fill(svg), layers, aspect: "1080 / 1350" };
}

/**
 * Post de vídeo. Três enquadramentos, os mesmos do render:
 *  - reels: 9:16, o vídeo cobre o quadro e o texto vive na zona segura;
 *  - feed: 4:5 de fundo sólido, vídeo numa moldura 16:9;
 *  - feed-blur: 4:5 com o próprio vídeo borrado como fundo + moldura.
 */
function buildVideoPage(post: PreviewPostInput, spec: RenderSpec): PreviewPage | null {
  // Bruto, pelo mesmo motivo do card com vídeo (ver buildCardWithVideo):
  // o overlay é desenhado ao vivo aqui em cima.
  const url = sourceVideoUrl(post.id, undefined, post.video_poster_url);
  if (!url) return null;
  const shape = post.video_shape ?? (post.format === "video_feed" ? "feed" : "reels");
  const poster = post.video_poster_url ?? null;
  const headline = post.hook ?? "";

  if (shape === "reels") {
    const canvas = { w: 1080, h: REELS_H };
    // Mesmo piso de véu do render: a luminância medida vale só pro frame
    // de pôster, e o texto não pode sumir quando o vídeo clareia.
    const zone = { top: Math.round(REELS_H * 0.55), height: Math.round(REELS_H * 0.45) };
    const c = contrastFor(post.base_luminance, zone, canvas);
    const svg = buildReelsVideoOverlaySvg(headline, spec.cardBrand, {
      theme: c.theme,
      textColor: c.textColor,
      alpha: Math.max(0.32, c.alpha),
    });
    return {
      svg: fill(svg),
      layers: [{ kind: "video", url, poster, frame: null }],
      aspect: "1080 / 1920",
    };
  }

  const canvas = { w: WIDTH, h: HEIGHT };
  const frameForBand = buildFeedVideoOverlaySvg(headline, spec.cardBrand).frame;
  const bandTop = frameForBand.y + frameForBand.h;
  const band = { top: bandTop, height: HEIGHT - bandTop };

  // FEED BORRADO: o fundo é a cópia borrada do próprio vídeo, então o
  // overlay NÃO pode ter retângulo de fundo — era o que estava
  // acontecendo (o markup do feed sólido pintava a cor da marca em cima
  // do vídeo borrado, e os dois enquadramentos ficavam idênticos na
  // fila). A luminância vem do pôster, que é o que attach-video mediu.
  if (shape === "feed-blur") {
    const c = contrastFor(post.base_luminance, band, canvas);
    const { svg, frame } = buildFeedVideoBlurBgOverlaySvg(headline, spec.cardBrand, {
      theme: c.theme,
      textColor: c.textColor,
      alpha: Math.max(0.32, c.alpha),
    });
    return {
      svg: fill(svg),
      layers: [
        { kind: "video", url, poster, frame: null, blurredBackdrop: true },
        { kind: "video", url, poster, frame: frameToFrac(frame, canvas) },
      ],
      aspect: "1080 / 1350",
    };
  }

  // Feed 4:5 com FOTO de fundo (2026-07-29): a foto entra como camada e
  // o overlay troca o retângulo sólido por um véu de leitura. O véu é
  // medido na faixa do texto, igual ao render.
  const photoBgUrl = post.bg_image_url ?? null;
  const c = photoBgUrl ? contrastFor(post.bg_image_luminance, band, canvas) : null;
  const { svg, frame } = buildFeedVideoOverlaySvg(
    headline,
    spec.cardBrand,
    c ? veilFor(c, post.bg_overlay) : undefined
  );
  const layers: PreviewLayer[] = [];
  if (photoBgUrl) layers.push({ kind: "photo", url: photoBgUrl });
  layers.push({ kind: "video", url, poster, frame: frameToFrac(frame, canvas) });
  return { svg: fill(svg), layers, aspect: "1080 / 1350" };
}

/** Esconde wordmark/divisor/rótulo — mesmo efeito do override showLabel:false. */
function hideMarks<T extends { elements: { type: string }[] }>(spec: T): T {
  const MARKS = ["wordmark", "divider", "handleLabel"];
  return {
    ...spec,
    elements: spec.elements.map((el) => (MARKS.includes(el.type) ? { ...el, visible: false } : el)),
  };
}

/**
 * Monta as páginas do preview de um post. `cards` só é usado em carrossel.
 *
 * Sem `base_image_url` o post é anterior à migration 040: não há foto crua
 * pra desenhar por cima, então devolve a arte pronta como está — honesto,
 * e a aprovação vai gerar arte nova de qualquer forma.
 */
export async function buildPostPreview(
  post: PreviewPostInput,
  spec: RenderSpec,
  cards: EmbeddedCarouselCard[] = []
): Promise<PreviewPage[]> {
  if (post.format === "carousel") {
    if (cards.length === 0) return [];
    const total = cards.length;
    return Promise.all(
      cards.map((card) => {
        // Vídeo é POR CARD: quem não tem segue como card normal.
        if (card.video_status === "ready") {
          return buildCardWithVideo(card, post.id, total, spec);
        }
        // card já renderizado e sem fundo guardado = anterior à 040
        return !card.bg_url && !card.bg_luminance && card.image_url
          ? legacy(card.image_url)
          : buildCard(card, total, spec);
      })
    );
  }

  if (post.format === "video" || post.format === "video_feed") {
    if (post.video_status === "ready") {
      const page = buildVideoPage(post, spec);
      if (page) return [page];
    }
    // Sem vídeo pronto ainda: cai no caminho normal (base/arte antiga).
  }

  // A foto ESCOLHIDA (048) vence a base gerada: se a pessoa subiu um
  // fundo, é isso que ela quer ver — vale no post único também, não só no
  // vídeo em feed 4:5, que foi onde o recurso nasceu.
  const photo = post.bg_image_url ?? post.base_image_url ?? null;
  if (!photo) {
    // Post anterior à 040 (ou vídeo sem pôster): mostra o que existe.
    return [post.image_url, post.closing_image_url]
      .filter((u): u is string => !!u)
      .map(legacy);
  }

  const pages = [buildPageOne(post, spec, photo)];
  if (spec.closingPage) pages.push(buildClosing(spec));
  return pages;
}

function legacy(url: string): PreviewPage {
  return { svg: "", layers: [], aspect: "1080 / 1350", legacyImageUrl: url };
}
