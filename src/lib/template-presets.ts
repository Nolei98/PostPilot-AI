// ============================================================
// Presets base do Template Studio expressos em SPEC (Sprint B+). São os
// 2 primeiros modelos (capa + página de carrossel) que o B8 renderizava
// hardcode, agora como dados — servem de seed (B13) e de ponto de
// partida do editor (B14). Ver HANDOFF-overlens-template.md 6B.3.
// ============================================================
import type { TemplateSpec } from "@/lib/types";

/** Capa @0verlens: divisor wordmark + headline centralizada + CTA + marca. */
export const coverPreset: TemplateSpec = {
  surface: "cover_image",
  canvas: { w: 1080, h: 1350 },
  elements: [
    {
      id: "divider",
      type: "divider",
      anchor: "top-center",
      offset: { x: 0.5, y: 0.22 },
      style: { color: "text" },
      z: 2,
    },
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

/** Página interior: rótulo de marca no topo + headline + corpo. */
export const cardPreset: TemplateSpec = {
  surface: "carousel_page",
  canvas: { w: 1080, h: 1350 },
  elements: [
    {
      id: "label",
      type: "handleLabel",
      anchor: "top-left",
      offset: { x: 0.09, y: 0.1 },
      size: { fontSize: 24 },
      style: { weight: 600, tracking: 0.12, color: "auto", opacity: 0.7 },
      bind: "brand.label",
      z: 2,
    },
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

export const BASE_PRESETS: { name: string; spec: TemplateSpec }[] = [
  { name: "Prisma (capa)", spec: coverPreset },
  { name: "Editorial (página)", spec: cardPreset },
];
