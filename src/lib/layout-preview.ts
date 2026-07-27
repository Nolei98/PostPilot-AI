// ============================================================
// Previews de layout (Ajustes → "Layout das artes"), kit v2 §7.7.
//
// Gera SVG puro (sem rasterizar/sharp) reaproveitando os MESMOS builders
// do render real (carousel-render.ts + layout-*.ts) — o preview é sempre
// fiel ao que o carrossel de verdade produz, nunca um mockup separado.
// Cada preset tem 4 miniaturas: capa normal, carrossel (capa→interior→
// contra-capa), vídeo (Reels 9:16, aproximação estática — motor de vídeo
// ainda não existe) e modelo com vídeo (capa em vídeo + interior estático).
//
// Chip de perfil (avatar+nome) é substituído por um placeholder simples
// aqui — o chip de verdade usa uma foto real via sharp (profile-chip.ts),
// que não dá pra embutir num SVG de preview; a POSIÇÃO/estrutura é fiel,
// só a foto é substituída por um círculo com inicial.
// ============================================================
import {
  CARD_W,
  CARD_H,
  CLOSING_CORNER_MARGIN,
  videoIdentityFor,
  MONO_FONT,
  type CardBrand,
  type LayoutPreset,
} from "@/lib/render-shared";
import { buildCoverSvg, buildCardSvg } from "@/lib/carousel-render";
import { feedVideoLayoutParts, cardVideoLayoutParts } from "@/lib/image";
import { buildBrutalismCoverSvg, buildBrutalismCardSvg } from "@/lib/layout-brutalism";
import { buildSerifLuxeCoverSvg, buildSerifLuxeCardSvg } from "@/lib/layout-serif-luxe";
import { buildSwissMonoCoverSvg, buildSwissMonoCardSvg } from "@/lib/layout-swiss-mono";
import { buildPopCreatorCoverSvg, buildPopCreatorCardSvg } from "@/lib/layout-pop-creator";

export const PREVIEW_LAYOUTS: { key: LayoutPreset; label: string }[] = [
  { key: "editorial-noir", label: "Editorial Noir" },
  { key: "brutalism", label: "Brutalismo Editorial" },
  { key: "serif-luxe", label: "Serif Luxe" },
  { key: "swiss-mono", label: "Swiss Mono" },
  { key: "pop-creator", label: "Pop Creator" },
];

export type PreviewFormat = "cover" | "carousel" | "video" | "hybrid" | "video-feed" | "video-interior";

export const PREVIEW_FORMATS: { key: PreviewFormat; label: string }[] = [
  { key: "cover", label: "Capa normal" },
  { key: "carousel", label: "Carrossel" },
  { key: "video", label: "Vídeo (Reels)" },
  { key: "video-feed", label: "Vídeo (feed, 4:5)" },
  { key: "video-interior", label: "Interior com vídeo" },
  { key: "hybrid", label: "Modelo com vídeo" },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface CoverOpts {
  showSwipeHint?: boolean;
  body?: string | null;
  showActionIcons?: boolean;
}

/** Adapta a assinatura de cada builder (Editorial Noir difere dos 4
 * layouts alternativos) pra uma interface única usada só aqui — svg +
 * blurBandTop (onde a banda de identidade começa; usado pelo mockup de
 * vídeo feed, que precisa saber até onde vai a "caixa de vídeo"). */
function previewCoverRender(
  preset: LayoutPreset,
  headline: string,
  brand: CardBrand,
  opts: CoverOpts
): { svg: string; blurBandTop: number } {
  const showSwipeHint = opts.showSwipeHint ?? true;
  if (preset === "editorial-noir") {
    return buildCoverSvg(
      { idx: 0, role: "hook", headline, body: opts.body ?? "" },
      brand,
      false,
      {
        showSwipeHint,
        body: opts.body,
        align: showSwipeHint ? "bottom" : "center",
        showActionIcons: opts.showActionIcons ?? false,
      }
    );
  }
  const builders = {
    brutalism: buildBrutalismCoverSvg,
    "serif-luxe": buildSerifLuxeCoverSvg,
    "swiss-mono": buildSwissMonoCoverSvg,
    "pop-creator": buildPopCreatorCoverSvg,
  } as const;
  const build = builders[preset];
  return build(headline, brand, false, {
    showSwipeHint,
    body: opts.body,
    // overlay presente (mesmo alpha 0) é o sinal que os 4 layouts
    // alternativos usam pra desenhar a trilha de ícones — mesma
    // convenção do render real (ver renderTemplateSlide em image.ts).
    overlay: opts.showActionIcons ? { theme: "dark", alpha: 0 } : undefined,
  });
}

function previewCoverSvg(preset: LayoutPreset, headline: string, brand: CardBrand, opts: CoverOpts): string {
  return previewCoverRender(preset, headline, brand, opts).svg;
}

function previewCardSvg(
  preset: LayoutPreset,
  headline: string,
  body: string | null,
  brand: CardBrand,
  index: number,
  total: number
): string {
  if (preset === "editorial-noir") {
    return buildCardSvg({ idx: index - 1, role: "value", headline, body: body ?? "" }, brand);
  }
  const builders = {
    brutalism: buildBrutalismCardSvg,
    "serif-luxe": buildSerifLuxeCardSvg,
    "swiss-mono": buildSwissMonoCardSvg,
    "pop-creator": buildPopCreatorCardSvg,
  } as const;
  return builders[preset](headline, body, brand, { index, total });
}

/** Placeholder do chip de perfil (avatar real vem de uma foto — aqui é só
 * um círculo com a inicial) — canto inferior esquerdo, mesma margem da
 * trilha de ícones (60px), igual ao chip de verdade. */
function chipPlaceholder(brand: CardBrand, canvasH: number): string {
  const r = 28;
  const cx = CLOSING_CORNER_MARGIN + r;
  const cy = canvasH - CLOSING_CORNER_MARGIN - r;
  const name = brand.brandName || (brand.handle ? `@${brand.handle}` : "Marca");
  const handle = brand.handle ? `@${brand.handle}` : "";
  const initial = (brand.brandName || brand.handle || "M").trim().charAt(0).toUpperCase();
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${brand.colorAccent}"/>
    <text x="${cx}" y="${cy + 7}" font-family="Inter" font-weight="700" font-size="22" fill="#fff" text-anchor="middle">${escapeXml(initial)}</text>
    <text x="${cx + r + 12}" y="${cy - 4}" font-family="Inter" font-weight="600" font-size="24" fill="${brand.colorText}">${escapeXml(name)}</text>
    ${handle ? `<text x="${cx + r + 12}" y="${cy + 20}" font-family="Inter" font-weight="400" font-size="20" fill="${brand.colorText}" fill-opacity="0.75">${escapeXml(handle)}</text>` : ""}
  </g>`;
}

/** Injeta um grupo SVG logo antes do `</svg>` de fechamento — usado pra
 * sobrepor o chip placeholder (o builder original não desenha chip, isso
 * é composto à parte no render real via sharp). */
function appendOverlay(svg: string, overlayGroup: string): string {
  return svg.replace(/<\/svg>\s*$/, `${overlayGroup}</svg>`);
}

/** Capa normal (post único / capa estática) — 1 slide 4:5. */
/**
 * O preview pede um preset ESPECÍFICO (a linha da lista), mas vários
 * builders decidem o layout lendo `brand.layoutPreset` por dentro —
 * `renderAndUploadCard` (carousel-render.ts) e os overlays de vídeo
 * (image.ts). Como o `previewBrand` de Ajustes carrega o preset SALVO
 * (ou nenhum), as miniaturas saíam todas no mesmo visual, ignorando a
 * linha. Fixar o preset no brand antes de desenhar resolve na raiz.
 */
function brandForPreset(brand: CardBrand, preset: LayoutPreset): CardBrand {
  return { ...brand, layoutPreset: preset };
}

export function buildCoverPreview(preset: LayoutPreset, brand: CardBrand): string {
  return previewCoverSvg(preset, "O título do seu próximo post", brandForPreset(brand, preset), { showSwipeHint: true });
}

/** Contra-capa — mesma lógica da capa, sem swipe, com chip + ícones. */
export function buildClosingPreview(preset: LayoutPreset, brand: CardBrand): string {
  const b = brandForPreset(brand, preset);
  const svg = previewCoverSvg(preset, "Siga para não perder as próximas", b, {
    showSwipeHint: false,
    body: "Todo dia um resumo do que importa.",
    showActionIcons: true,
  });
  return appendOverlay(svg, chipPlaceholder(b, CARD_H));
}

/** Interior — 1 card do meio do carrossel. */
export function buildInteriorPreview(preset: LayoutPreset, brand: CardBrand): string {
  return previewCardSvg(preset, "O que muda na prática", "Um parágrafo curto de apoio explicando o ponto.", brandForPreset(brand, preset), 3, 7);
}

/** Carrossel — as 3 miniaturas encadeadas (capa → interior → contra-capa). */
export function buildCarouselPreview(preset: LayoutPreset, brand: CardBrand): string[] {
  return [buildCoverPreview(preset, brand), buildInteriorPreview(preset, brand), buildClosingPreview(preset, brand)];
}

/** Reels 9:16 — redesenhado 2026-07-23 pro estilo "zona segura"
 * (exemplo-modelos-com-video.png, caso 3): o vídeo cobre o quadro
 * INTEIRO (aqui, hachura full-bleed representando o vídeo real) —
 * marca pequena no topo-esquerda + título alinhado à esquerda dentro
 * de uma zona segura (traço tracejado) que não invade onde o Instagram
 * desenha sua própria UI (legenda embaixo, ícones à direita). Mesma
 * geometria de buildReelsVideoOverlayPng (image.ts) — só que aqui a
 * "zona segura" fica marcada visualmente (o render real não desenha
 * essa borda, é só uma referência de design). */
const REELS_W = 1080;
const REELS_H = 1920;
const REELS_SAFE_MARGIN_X = 64;
const REELS_SAFE_MARGIN_RIGHT = 170;
const REELS_SAFE_BOTTOM = 220;
function wrapAsReelsFrame(headline: string, brand: CardBrand): string {
  const { display, labelFont } = videoIdentityFor(brand.layoutPreset, brand.fontFamily);
  const family = display.family;
  const labelFamily = labelFont === "mono" ? MONO_FONT : family;
  const wm = (brand.wordmark || brand.brandName || "").toUpperCase();
  const text = "#FFFFFF";
  const playCx = REELS_W / 2;
  const playCy = REELS_H * 0.42;
  const playR = 60;
  const safeTop = 300;
  const safeH = REELS_H - REELS_SAFE_BOTTOM - safeTop + 80;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${REELS_W}" height="${REELS_H}" viewBox="0 0 ${REELS_W} ${REELS_H}">
  <defs>
    <pattern id="video-hatch" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="28" height="28" fill="#15151a"/>
      <line x1="0" y1="0" x2="0" y2="28" stroke="#26262e" stroke-width="14"/>
    </pattern>
  </defs>
  <rect width="${REELS_W}" height="${REELS_H}" fill="url(#video-hatch)"/>
  <rect x="${REELS_SAFE_MARGIN_X - 20}" y="${safeTop}" width="${REELS_W - REELS_SAFE_MARGIN_X - REELS_SAFE_MARGIN_RIGHT + 20}" height="${safeH}" fill="none" stroke="#ff4646" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="14 10" rx="12"/>
  <text x="${REELS_SAFE_MARGIN_X}" y="130" font-family="${labelFamily}" font-weight="600" font-size="24" letter-spacing="4" fill="${text}" fill-opacity="0.85">${escapeXml(wm)}</text>
  <text x="${REELS_W - 24}" y="60" font-family="IBM Plex Mono" font-weight="700" font-size="24" letter-spacing="2" fill="#fff" text-anchor="end">REELS</text>
  <circle cx="${playCx}" cy="${playCy}" r="${playR}" fill="#000" fill-opacity="0.4"/>
  <path d="M ${playCx - 20} ${playCy - 28} L ${playCx - 20} ${playCy + 28} L ${playCx + 26} ${playCy} Z" fill="#fff"/>
  <text x="${REELS_SAFE_MARGIN_X}" y="${REELS_H - REELS_SAFE_BOTTOM}" font-family="${family}" font-weight="${display.weight}" font-size="52" fill="${text}" text-anchor="start">${escapeXml(headline)}</text>
</svg>`;
}

/** Vídeo Reels — 1 frame 9:16, vídeo full-bleed + zona segura à esquerda. */
export function buildVideoPreview(preset: LayoutPreset, brand: CardBrand): string {
  return wrapAsReelsFrame("Seu próximo Reels", brandForPreset(brand, preset));
}

/** Vídeo feed — moldura 16:9 ("tamanho YouTube") com cantos
 * arredondados, dentro do quadro 4:5, fundo sólido (padrão preto) +
 * texto na seção dele — MESMA geometria do render real
 * (feedVideoLayoutParts, image.ts), só que aqui a moldura vira hachura
 * + play (não há vídeo real pra mostrar no mockup) em vez do buraco
 * transparente que o ffmpeg preenche de verdade. */
export function buildFeedVideoPreview(preset: LayoutPreset, brand: CardBrand): string {
  const { bg, frame, dividerSvg, headlineSvg } = feedVideoLayoutParts(
    "O título do seu próximo vídeo",
    brandForPreset(brand, preset)
  );
  const accent = brand.colorAccent || "#7C5CFF";
  const playCx = frame.x + frame.w / 2;
  const playCy = frame.y + frame.h / 2;
  const playR = 54;
  const patchId = "video-feed-hatch";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs><pattern id="${patchId}" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <rect width="28" height="28" fill="#15151a"/>
    <line x1="0" y1="0" x2="0" y2="28" stroke="#26262e" stroke-width="14"/>
  </pattern></defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>
  <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="url(#${patchId})"/>
  <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="none" stroke="${accent}" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="14 10"/>
  <circle cx="${playCx}" cy="${playCy}" r="${playR}" fill="#000" fill-opacity="0.45"/>
  <path d="M ${playCx - 18} ${playCy - 26} L ${playCx - 18} ${playCy + 26} L ${playCx + 24} ${playCy} Z" fill="#fff"/>
  ${dividerSvg}
  ${headlineSvg}
</svg>`;
}

/** Interior com vídeo — moldura 16:9 no MEIO do card (título em cima,
 * corpo embaixo), mesma geometria do render real (cardVideoLayoutParts,
 * image.ts) — exemplo-modelos-com-video.png, caso "Interior". */
export function buildInteriorVideoPreview(preset: LayoutPreset, brand: CardBrand): string {
  const { bg, frame, headlineSvg, bodySvg, labelSvg } = cardVideoLayoutParts(
    { headline: "Quando o vídeo explica melhor que o texto", body: "Um retângulo de vídeo entra no grid como uma imagem — mesmo tratamento e margens." },
    brandForPreset(brand, preset)
  );
  const accent = brand.colorAccent || "#7C5CFF";
  const playCx = frame.x + frame.w / 2;
  const playCy = frame.y + frame.h / 2;
  const playR = 48;
  const patchId = "video-card-hatch";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs><pattern id="${patchId}" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
    <rect width="28" height="28" fill="#15151a"/>
    <line x1="0" y1="0" x2="0" y2="28" stroke="#26262e" stroke-width="14"/>
  </pattern></defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>
  <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="url(#${patchId})"/>
  <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="none" stroke="${accent}" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="14 10"/>
  <circle cx="${playCx}" cy="${playCy}" r="${playR}" fill="#000" fill-opacity="0.45"/>
  <path d="M ${playCx - 16} ${playCy - 22} L ${playCx - 16} ${playCy + 22} L ${playCx + 20} ${playCy} Z" fill="#fff"/>
  ${headlineSvg}
  ${bodySvg}
  ${labelSvg}
</svg>`;
}

/** Modelo com vídeo — capa em vídeo (9:16, play) + 1 interior estático (4:5). */
export function buildHybridPreview(preset: LayoutPreset, brand: CardBrand): { video: string; interior: string } {
  return {
    video: buildVideoPreview(preset, brand),
    interior: buildInteriorPreview(preset, brand),
  };
}

/** Redimensiona um SVG (que já vem com width/height fixos em px) pra
 * caber num container responsivo — troca só a PRIMEIRA ocorrência
 * (a tag <svg> de abertura; o viewBox garante a proporção). */
export function scaleSvg(svg: string): string {
  return svg.replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
}

export { CARD_W, CARD_H, REELS_W, REELS_H };
