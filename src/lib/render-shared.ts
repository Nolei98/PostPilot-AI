// ============================================================
// Peças compartilhadas entre carousel-render.ts (layout padrão,
// Editorial Noir) e os módulos de LAYOUT alternativo (layout-brutalism.ts
// etc, Fase 3) — canvas, tipo de marca, trilha de ícones de ação. Módulo
// próprio pra evitar import circular: carousel-render.ts precisa chamar
// os layouts alternativos (pra decidir qual usar por marca), e os
// layouts alternativos precisam desses tipos/constantes — se ficassem
// dentro de carousel-render.ts, os dois arquivos importariam um do outro.
// ============================================================
import type { BrandMark } from "@/lib/types";

export const CARD_W = 1080;
export const CARD_H = 1350;

/** Qual papel a página tem no carrossel: capa (1ª), fechamento (última)
 * ou interior (as demais) — igual em qualquer preset de layout. */
export type CoverPageKind = "cover" | "closing" | "interior";

/** Preset de LAYOUT (tipografia + posicionamento + estrutura) — ortogonal
 * ao preset de cores/identidade da marca (Fase 3, postpilot-layouts.html).
 * 'editorial-noir' é o padrão (carousel-render.ts); os demais vivem em
 * layout-*.ts próprios. */
export type LayoutPreset = "editorial-noir" | "brutalism" | "serif-luxe" | "swiss-mono" | "pop-creator";

/** Variação de conteúdo da PÁGINA 1 do post único (kit v2 §3) — ortogonal
 * ao layoutPreset (que decide a tipografia/estrutura). "cover" = estilo
 * capa do carrossel (wordmark + título display). "centered" = fonte no
 * meio, minimalista, sem wordmark/marca — deixa a foto respirar. */
export type SinglePostStyle = "cover" | "centered";

/** Cores + fonte do card, tirados do brand_kit do cliente. */
export interface CardBrand {
  colorBackground: string;
  colorAccent: string;
  colorText: string;
  fontFamily: string; // família já resolvida (ver resolvePostFontFamily)
  brandName: string | null;
  // Identidade de rótulo @0verlens (Sprint B+, opcional).
  wordmark?: string | null; // divisor da capa/fechamento
  handle?: string | null; // @ do perfil
  keywords?: string[] | null; // rótulo dos cards
  brandMark?: BrandMark; // tratamento de marca dos cards interiores
  layoutPreset?: LayoutPreset; // preset de layout (Fase 3); default "editorial-noir"
  singlePostStyle?: SinglePostStyle; // variação da página 1 do post único; default "cover"
}

/** Ícones (trilha 24x24) da trilha VERTICAL no canto inferior direito da
 * CONTRA-CAPA: curtir (coração), repostar (setas em ciclo), compartilhar
 * (avião de papel) e salvar (marcador) — nessa ordem, de cima pra baixo.
 * Usados por QUALQUER preset de layout (visual do ícone não muda). */
const ICON_HEART =
  "M12 21s-7.5-4.7-9.8-9.2C.7 8.6 2.7 5 6.2 5c2.1 0 3.7 1.2 4.6 2.9L12 9.5l1.2-1.6C14.1 6.2 15.7 5 17.8 5c3.5 0 5.5 3.6 4 6.8C19.5 16.3 12 21 12 21z";
const ICON_REPOST =
  "M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3";
const ICON_SHARE = "m22 2-11 11M22 2l-7 20-4-9-9-4 20-7z";
const ICON_BOOKMARK = "M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4V4z";

/** Margem lateral/inferior compartilhada pela trilha de ícones (direita) e
 * pelo chip de perfil (esquerda) — mantém as duas bordas simétricas. Igual
 * à margem usada em buildProfileChipLayers (position: "bottom-left"). */
export const CLOSING_CORNER_MARGIN = 60;

/** Trilha vertical de 4 ícones (curtir/repostar/compartilhar/salvar) no
 * canto inferior direito. `bottomCenterY` é o centro do ícone mais BAIXO
 * (salvar); os outros sobem a partir dele. */
export function actionIconsRail(centerX: number, bottomCenterY: number, color: string): string {
  const size = 42;
  const s = size / 24;
  const gap = 64; // distância vertical entre os centros dos ícones
  const icon = (d: string, centerY: number) =>
    `<g transform="translate(${centerX - size / 2},${centerY - size / 2}) scale(${s})"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  return (
    icon(ICON_HEART, bottomCenterY - gap * 3) +
    icon(ICON_REPOST, bottomCenterY - gap * 2) +
    icon(ICON_SHARE, bottomCenterY - gap) +
    icon(ICON_BOOKMARK, bottomCenterY)
  );
}
