// ============================================================
// Presets base do Template Studio expressos em SPEC (Sprint B+, TAREFA
// B13). Seed dos modelos do sistema (is_system=true) — ≥4 por superfície,
// variando tratamento de marca (wordmark/@handle+kw/só @handle/sem marca)
// e posição/ênfase de texto. Servem de ponto de partida do editor (B14).
// Ver HANDOFF-overlens-template.md seção 6B.3.
//
// "brandMark: ícone" (logo raster) fica de fora por ora — renderFromSpec
// ainda não compõe imagens (elementos media/logo/badge são ignorados,
// ver template-render.ts). Adicionar quando isso existir.
// ============================================================
import type { TemplateSpec, TemplateElement } from "@/lib/types";

const REELS_CANVAS = { w: 1080, h: 1920 };
const POST_CANVAS = { w: 1080, h: 1350 };

const divider = (offsetY: number, anchor: TemplateElement["anchor"] = "top-center"): TemplateElement => ({
  id: "divider",
  type: "divider",
  anchor,
  offset: { x: 0.5, y: offsetY },
  style: { color: "text" },
  z: 2,
});

const handleOnly = (offset: { x: number; y: number }, anchor: TemplateElement["anchor"]): TemplateElement => ({
  id: "label",
  type: "handleLabel",
  anchor,
  offset,
  size: { fontSize: 26 },
  style: { weight: 600, tracking: 0.14, color: "auto", opacity: 0.75 },
  bind: "brand.handle",
  z: 2,
});

const handleAndKeywords = (offset: { x: number; y: number }, anchor: TemplateElement["anchor"]): TemplateElement => ({
  id: "label",
  type: "handleLabel",
  anchor,
  offset,
  size: { fontSize: 24 },
  style: { weight: 600, tracking: 0.12, color: "auto", opacity: 0.7 },
  bind: "brand.label",
  z: 2,
});

// ============================================================
// cover_image — capa do carrossel / imagem única
// ============================================================

/** Prisma: divisor wordmark no topo + headline central + CTA + assinatura. */
export const coverPreset: TemplateSpec = {
  surface: "cover_image",
  canvas: POST_CANVAS,
  elements: [
    divider(0.22),
    {
      id: "headline",
      type: "headline",
      anchor: "top-center",
      offset: { x: 0.5, y: 0.4 },
      size: { fontSize: 88, maxWidth: 0.84 },
      style: { weight: 800, tracking: -0.01, lineHeight: 1.1, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "cta",
      type: "cta",
      anchor: "bottom-center",
      offset: { x: 0.5, y: 0.9 },
      size: { fontSize: 26 },
      style: { weight: 600, tracking: 0.15, color: "auto", opacity: 0.75 },
      bind: "content.cta",
      z: 3,
    },
    {
      id: "brandname",
      type: "handleLabel",
      anchor: "bottom-left",
      offset: { x: 0.1, y: 0.955 },
      size: { fontSize: 28 },
      style: { weight: 600, color: "accent" },
      bind: "brand.name",
      z: 3,
    },
  ],
};

/** Handle Minimal: sem divisor, só @handle discreto + headline grande centralizada. */
export const coverHandleMinimalPreset: TemplateSpec = {
  surface: "cover_image",
  canvas: POST_CANVAS,
  elements: [
    handleOnly({ x: 0.1, y: 0.1 }, "top-left"),
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.5 },
      size: { fontSize: 94, maxWidth: 0.82 },
      style: { weight: 800, lineHeight: 1.08, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
  ],
};

/** Tag: rótulo @handle + palavras-chave no topo, headline alinhada à esquerda embaixo. */
export const coverTagPreset: TemplateSpec = {
  surface: "cover_image",
  canvas: POST_CANVAS,
  elements: [
    handleAndKeywords({ x: 0.5, y: 0.09 }, "top-center"),
    {
      id: "headline",
      type: "headline",
      anchor: "bottom-left",
      offset: { x: 0.09, y: 0.72 },
      size: { fontSize: 76, maxWidth: 0.82 },
      style: { weight: 800, lineHeight: 1.1, align: "left", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "cta",
      type: "cta",
      anchor: "bottom-right",
      offset: { x: 0.91, y: 0.9 },
      size: { fontSize: 24 },
      // "auto" pelo mesmo motivo do lastFechamentoPreset: convite a
      // deslizar precisa ser LIDO, então segue o contraste da foto.
      style: { weight: 600, tracking: 0.12, color: "auto" },
      bind: "content.cta",
      z: 3,
    },
  ],
};

/** Assinatura: sem rótulo de handle, divisor wordmark embaixo, headline central. */
export const coverAssinaturaPreset: TemplateSpec = {
  surface: "cover_image",
  canvas: POST_CANVAS,
  elements: [
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.42 },
      size: { fontSize: 86, maxWidth: 0.8 },
      style: { weight: 700, lineHeight: 1.12, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    divider(0.86, "bottom-center"),
  ],
};

// ============================================================
// video_cover — capa de Reels/TikTok (branding; montagem é o Sprint D)
// ============================================================

/** Reel Bold: divisor wordmark no topo + headline grande + CTA embaixo. */
export const videoBoldPreset: TemplateSpec = {
  surface: "video_cover",
  canvas: REELS_CANVAS,
  elements: [
    divider(0.16),
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.45 },
      size: { fontSize: 96, maxWidth: 0.84 },
      style: { weight: 800, lineHeight: 1.08, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "cta",
      type: "cta",
      anchor: "bottom-center",
      offset: { x: 0.5, y: 0.92 },
      size: { fontSize: 30 },
      style: { weight: 600, tracking: 0.15, color: "auto", opacity: 0.8 },
      bind: "content.cta",
      z: 3,
    },
  ],
};

/** Reel Marca: @handle no topo + headline grande alinhada à esquerda embaixo. */
export const videoMarcaPreset: TemplateSpec = {
  surface: "video_cover",
  canvas: REELS_CANVAS,
  elements: [
    handleOnly({ x: 0.1, y: 0.08 }, "top-left"),
    {
      id: "headline",
      type: "headline",
      anchor: "bottom-left",
      offset: { x: 0.09, y: 0.78 },
      size: { fontSize: 84, maxWidth: 0.82 },
      style: { weight: 800, lineHeight: 1.1, align: "left", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
  ],
};

/** Reel Tag: rótulo handle+keywords centralizado no topo + headline central. */
export const videoTagPreset: TemplateSpec = {
  surface: "video_cover",
  canvas: REELS_CANVAS,
  elements: [
    handleAndKeywords({ x: 0.5, y: 0.08 }, "top-center"),
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.5 },
      size: { fontSize: 88, maxWidth: 0.8 },
      style: { weight: 700, lineHeight: 1.12, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
  ],
};

/** Reel Limpo: sem marca nenhuma, só headline centralizada + CTA pequeno. */
export const videoLimpoPreset: TemplateSpec = {
  surface: "video_cover",
  canvas: REELS_CANVAS,
  elements: [
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.48 },
      size: { fontSize: 90, maxWidth: 0.82 },
      style: { weight: 800, lineHeight: 1.1, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "cta",
      type: "cta",
      anchor: "bottom-center",
      offset: { x: 0.5, y: 0.94 },
      size: { fontSize: 24 },
      style: { weight: 600, tracking: 0.14, color: "auto", opacity: 0.7 },
      bind: "content.cta",
      z: 3,
    },
  ],
};

// ============================================================
// carousel_page — cards interiores
// ============================================================

/** Editorial: rótulo handle+keywords no topo-esquerda + headline/corpo à esquerda. */
export const cardPreset: TemplateSpec = {
  surface: "carousel_page",
  canvas: POST_CANVAS,
  elements: [
    handleAndKeywords({ x: 0.09, y: 0.1 }, "top-left"),
    {
      id: "headline",
      type: "headline",
      anchor: "center-left",
      offset: { x: 0.09, y: 0.28 },
      size: { fontSize: 64, maxWidth: 0.82 },
      style: { weight: 700, lineHeight: 1.15, align: "left", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "body",
      type: "body",
      anchor: "center-left",
      offset: { x: 0.09, y: 0.52 },
      size: { fontSize: 40, maxWidth: 0.82 },
      style: { weight: 400, lineHeight: 1.3, align: "left", color: "auto", opacity: 0.82 },
      bind: "content.body",
      z: 3,
    },
  ],
};

/** Grade: rótulo no topo-direita + headline/corpo centralizados. */
export const cardGradePreset: TemplateSpec = {
  surface: "carousel_page",
  canvas: POST_CANVAS,
  elements: [
    handleAndKeywords({ x: 0.91, y: 0.1 }, "top-right"),
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.42 },
      size: { fontSize: 58, maxWidth: 0.78 },
      style: { weight: 700, lineHeight: 1.16, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "body",
      type: "body",
      anchor: "center",
      offset: { x: 0.5, y: 0.64 },
      size: { fontSize: 36, maxWidth: 0.76 },
      style: { weight: 400, lineHeight: 1.3, align: "center", color: "auto", opacity: 0.82 },
      bind: "content.body",
      z: 3,
    },
  ],
};

/** Handle Minimal: só @handle (sem keywords) + headline maior, corpo menor. */
export const cardHandleMinimalPreset: TemplateSpec = {
  surface: "carousel_page",
  canvas: POST_CANVAS,
  elements: [
    handleOnly({ x: 0.09, y: 0.1 }, "top-left"),
    {
      id: "headline",
      type: "headline",
      anchor: "center-left",
      offset: { x: 0.09, y: 0.3 },
      size: { fontSize: 72, maxWidth: 0.82 },
      style: { weight: 800, lineHeight: 1.1, align: "left", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "body",
      type: "body",
      anchor: "center-left",
      offset: { x: 0.09, y: 0.56 },
      size: { fontSize: 34, maxWidth: 0.8 },
      style: { weight: 400, lineHeight: 1.3, align: "left", color: "auto", opacity: 0.78 },
      bind: "content.body",
      z: 3,
    },
  ],
};

/** Limpo: sem rótulo de marca — só headline + corpo, mais espaço negativo. */
export const cardLimpoPreset: TemplateSpec = {
  surface: "carousel_page",
  canvas: POST_CANVAS,
  elements: [
    {
      id: "headline",
      type: "headline",
      anchor: "center-left",
      offset: { x: 0.09, y: 0.36 },
      size: { fontSize: 66, maxWidth: 0.82 },
      style: { weight: 700, lineHeight: 1.15, align: "left", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "body",
      type: "body",
      anchor: "center-left",
      offset: { x: 0.09, y: 0.58 },
      size: { fontSize: 38, maxWidth: 0.82 },
      style: { weight: 400, lineHeight: 1.3, align: "left", color: "auto", opacity: 0.82 },
      bind: "content.body",
      z: 3,
    },
  ],
};

// ============================================================
// carousel_last — card de fechamento (CTA final)
// ============================================================

/** Fechamento: divisor wordmark no topo + headline grande + CTA + assinatura. */
export const lastFechamentoPreset: TemplateSpec = {
  surface: "carousel_last",
  canvas: POST_CANVAS,
  elements: [
    divider(0.2),
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.46 },
      size: { fontSize: 72, maxWidth: 0.82 },
      style: { weight: 800, lineHeight: 1.12, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "cta",
      type: "cta",
      anchor: "bottom-center",
      offset: { x: 0.5, y: 0.86 },
      size: { fontSize: 30 },
      // "auto", não "accent": o CTA é texto de leitura, não assinatura de
      // marca. Na cor de destaque ele sumia sobre foto escura/clara —
      // "auto" resolve pela luminância medida da banda (contrast.ts).
      style: { weight: 600, tracking: 0.14, color: "auto" },
      bind: "content.cta",
      z: 3,
    },
  ],
};

/** Assinatura: divisor wordmark centralizado + nome da marca embaixo, minimalista. */
export const lastAssinaturaPreset: TemplateSpec = {
  surface: "carousel_last",
  canvas: POST_CANVAS,
  elements: [
    divider(0.46, "center"),
    {
      id: "brandname",
      type: "handleLabel",
      anchor: "center",
      offset: { x: 0.5, y: 0.56 },
      size: { fontSize: 28 },
      style: { weight: 600, color: "accent", align: "center" },
      bind: "brand.name",
      z: 3,
    },
  ],
};

/** Tag Final: rótulo handle+keywords no topo + CTA grande centralizado. */
export const lastTagPreset: TemplateSpec = {
  surface: "carousel_last",
  canvas: POST_CANVAS,
  elements: [
    handleAndKeywords({ x: 0.5, y: 0.1 }, "top-center"),
    {
      id: "cta",
      type: "cta",
      anchor: "center",
      offset: { x: 0.5, y: 0.5 },
      size: { fontSize: 46, maxWidth: 0.78 },
      style: { weight: 800, tracking: 0.02, align: "center", color: "auto" },
      bind: "content.cta",
      z: 3,
    },
  ],
};

/** Limpo Final: só headline + CTA, sem marca nenhuma. */
export const lastLimpoPreset: TemplateSpec = {
  surface: "carousel_last",
  canvas: POST_CANVAS,
  elements: [
    {
      id: "headline",
      type: "headline",
      anchor: "center",
      offset: { x: 0.5, y: 0.42 },
      size: { fontSize: 68, maxWidth: 0.8 },
      style: { weight: 700, lineHeight: 1.15, align: "center", color: "auto" },
      bind: "content.headline",
      z: 3,
    },
    {
      id: "cta",
      type: "cta",
      anchor: "bottom-center",
      offset: { x: 0.5, y: 0.82 },
      size: { fontSize: 28 },
      style: { weight: 600, tracking: 0.1, color: "auto", opacity: 0.85 },
      bind: "content.cta",
      z: 3,
    },
  ],
};

/** Todos os presets do sistema — seed de `templates` (is_system=true). */
export const BASE_PRESETS: { name: string; spec: TemplateSpec }[] = [
  // cover_image
  { name: "Prisma", spec: coverPreset },
  { name: "Handle Minimal", spec: coverHandleMinimalPreset },
  { name: "Tag", spec: coverTagPreset },
  { name: "Assinatura", spec: coverAssinaturaPreset },
  // video_cover
  { name: "Reel Bold", spec: videoBoldPreset },
  { name: "Reel Marca", spec: videoMarcaPreset },
  { name: "Reel Tag", spec: videoTagPreset },
  { name: "Reel Limpo", spec: videoLimpoPreset },
  // carousel_page
  { name: "Editorial", spec: cardPreset },
  { name: "Grade", spec: cardGradePreset },
  { name: "Handle Minimal", spec: cardHandleMinimalPreset },
  { name: "Limpo", spec: cardLimpoPreset },
  // carousel_last
  { name: "Fechamento", spec: lastFechamentoPreset },
  { name: "Assinatura", spec: lastAssinaturaPreset },
  { name: "Tag Final", spec: lastTagPreset },
  { name: "Limpo Final", spec: lastLimpoPreset },
];
