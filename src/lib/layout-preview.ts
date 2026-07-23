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
import { CARD_W, CARD_H, CLOSING_CORNER_MARGIN, type CardBrand, type LayoutPreset } from "@/lib/render-shared";
import { buildCoverSvg, buildCardSvg } from "@/lib/carousel-render";
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

export type PreviewFormat = "cover" | "carousel" | "video" | "hybrid" | "video-feed";

export const PREVIEW_FORMATS: { key: PreviewFormat; label: string }[] = [
  { key: "cover", label: "Capa normal" },
  { key: "carousel", label: "Carrossel" },
  { key: "video", label: "Vídeo (Reels)" },
  { key: "video-feed", label: "Vídeo (feed, 4:5)" },
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
 * layouts alternativos) pra uma interface única usada só aqui. */
function previewCoverSvg(preset: LayoutPreset, headline: string, brand: CardBrand, opts: CoverOpts): string {
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
    ).svg;
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
  }).svg;
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
export function buildCoverPreview(preset: LayoutPreset, brand: CardBrand): string {
  return previewCoverSvg(preset, "O título do seu próximo post", brand, { showSwipeHint: true });
}

/** Contra-capa — mesma lógica da capa, sem swipe, com chip + ícones. */
export function buildClosingPreview(preset: LayoutPreset, brand: CardBrand): string {
  const svg = previewCoverSvg(preset, "Siga para não perder as próximas", brand, {
    showSwipeHint: false,
    body: "Todo dia um resumo do que importa.",
    showActionIcons: true,
  });
  return appendOverlay(svg, chipPlaceholder(brand, CARD_H));
}

/** Interior — 1 card do meio do carrossel. */
export function buildInteriorPreview(preset: LayoutPreset, brand: CardBrand): string {
  return previewCardSvg(preset, "O que muda na prática", "Um parágrafo curto de apoio explicando o ponto.", brand, 3, 7);
}

/** Carrossel — as 3 miniaturas encadeadas (capa → interior → contra-capa). */
export function buildCarouselPreview(preset: LayoutPreset, brand: CardBrand): string[] {
  return [buildCoverPreview(preset, brand), buildInteriorPreview(preset, brand), buildClosingPreview(preset, brand)];
}

/** Envolve uma capa 4:5 (1080×1350) num quadro 9:16 (1080×1920) —
 * aproximação estática do Reels (motor de vídeo real ainda não existe).
 * Regra do kit: NUNCA cortar as laterais — encaixa pela LARGURA, completa
 * o topo por extensão de fundo (translada o conteúdo pro rodapé do
 * quadro maior, mesma lógica de "capa inteira visível").
 *
 * O espaço de cima é onde o VÍDEO enviado pelo usuário entra de verdade
 * (não é "resto do design") — por isso tem tratamento visual PRÓPRIO
 * (hachura diagonal + borda tracejada), não a cor sólida da marca: sem
 * isso, ficava ambíguo se aquele espaço era decorativo ou reservado pro
 * vídeo. Ícone de play + rótulo "SEU VÍDEO AQUI" reforçam. */
const REELS_W = 1080;
const REELS_H = 1920;
function wrapAsReelsFrame(coverSvg: string, brand: CardBrand): string {
  const inner = coverSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const offsetY = REELS_H - CARD_H;
  const accent = brand.colorAccent || "#7C5CFF";
  const playCx = REELS_W / 2;
  const playCy = offsetY / 2 - 20;
  const playR = 54;
  const margin = 18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${REELS_W}" height="${REELS_H}" viewBox="0 0 ${REELS_W} ${REELS_H}">
  <defs>
    <pattern id="video-hatch" width="28" height="28" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="28" height="28" fill="#15151a"/>
      <line x1="0" y1="0" x2="0" y2="28" stroke="#26262e" stroke-width="14"/>
    </pattern>
  </defs>
  <rect width="${REELS_W}" height="${offsetY}" fill="url(#video-hatch)"/>
  <rect x="${margin}" y="${margin}" width="${REELS_W - margin * 2}" height="${offsetY - margin * 2}" fill="none" stroke="${accent}" stroke-opacity="0.6" stroke-width="3" stroke-dasharray="14 10" rx="18"/>
  <g transform="translate(0,${offsetY})">${inner}</g>
  <text x="${margin + 6}" y="52" font-family="IBM Plex Mono" font-weight="700" font-size="26" letter-spacing="2" fill="#fff">REELS</text>
  <circle cx="${playCx}" cy="${playCy}" r="${playR}" fill="#000" fill-opacity="0.45"/>
  <path d="M ${playCx - 18} ${playCy - 26} L ${playCx - 18} ${playCy + 26} L ${playCx + 24} ${playCy} Z" fill="#fff"/>
  <text x="${playCx}" y="${playCy + playR + 44}" font-family="IBM Plex Mono" font-weight="700" font-size="22" letter-spacing="3" fill="#fff" fill-opacity="0.85" text-anchor="middle">SEU VÍDEO AQUI</text>
</svg>`;
}

/** Vídeo — 1 frame 9:16 com play + badge. */
export function buildVideoPreview(preset: LayoutPreset, brand: CardBrand): string {
  const cover = previewCoverSvg(preset, "O título do seu próximo Reels", brand, { showSwipeHint: true });
  return wrapAsReelsFrame(cover, brand);
}

/** Vídeo FEED (4:5, migration 036) — MESMO quadro da capa, sem letterbox:
 * o vídeo do usuário cobre o quadro inteiro (diferente do Reels, que
 * reserva uma faixa própria pro vídeo no topo do quadro 9:16) — aqui só
 * um play button no centro sinaliza "isto é vídeo", por cima da MESMA
 * composição de capa (wordmark + título) que já roda de verdade. */
function wrapAsFeedVideoFrame(coverSvg: string): string {
  const playCx = CARD_W / 2;
  const playCy = CARD_H * 0.42; // acima do bloco de texto (ancorado embaixo)
  const playR = 60;
  return appendOverlay(
    coverSvg,
    `<circle cx="${playCx}" cy="${playCy}" r="${playR}" fill="#000" fill-opacity="0.4"/>
     <path d="M ${playCx - 20} ${playCy - 28} L ${playCx - 20} ${playCy + 28} L ${playCx + 26} ${playCy} Z" fill="#fff"/>
     <text x="24" y="52" font-family="IBM Plex Mono" font-weight="700" font-size="24" letter-spacing="2" fill="#fff">VÍDEO</text>`
  );
}

/** Vídeo feed — 1 frame 4:5 com play, sem faixa reservada (o vídeo cobre o quadro inteiro). */
export function buildFeedVideoPreview(preset: LayoutPreset, brand: CardBrand): string {
  const cover = previewCoverSvg(preset, "O título do seu próximo vídeo", brand, { showSwipeHint: true });
  return wrapAsFeedVideoFrame(cover);
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
