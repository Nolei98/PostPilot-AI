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
  | { kind: "avatar"; url: string; xFrac: number; yFrac: number; sizeFrac: number };

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
  const grid = post.base_luminance;

  // Duas medições, exatamente como composeCoverStyleContent faz: a banda
  // de identidade (que começa onde o layout disser) e a meta-linha do
  // topo, que fica fora dela e precisa do próprio véu.
  const probe = buildPageOneCoverSvg(post.hook ?? "", { ...spec.cardBrand, colorText: "#FFFFFF" }, true, {
    showSwipeHint: false,
  });
  const band = contrastFor(grid, { top: probe.blurBandTop, height: canvas.h - probe.blurBandTop }, canvas);

  const { svg, blurBandTop } = buildPageOneCoverSvg(
    post.hook ?? "",
    { ...spec.cardBrand, colorText: band.textColor },
    !!photoUrl,
    {
      showSwipeHint: false,
      overlay: { theme: band.theme, alpha: band.alpha },
      topOverlay: topOverlayFor(grid, band, canvas),
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
      { ...spec.cardBrand, colorText: textColor },
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
      spec.cardBrand,
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
      cards.map((card) =>
        // card já renderizado e sem fundo guardado = anterior à 040
        !card.bg_url && !card.bg_luminance && card.image_url
          ? legacy(card.image_url)
          : buildCard(card, total, spec)
      )
    );
  }

  const photo = post.base_image_url ?? null;
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
