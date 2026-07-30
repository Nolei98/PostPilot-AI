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
export type LayoutPreset =
  | "editorial-noir"
  | "brutalism"
  | "serif-luxe"
  | "swiss-mono"
  | "pop-creator"
  | "doce-vitrine"
  | "clinica-clara"
  | "tribuna";

/**
 * Tipografia de destaque de cada preset — a MESMA que layout-*.ts usa no
 * título dos cards. Existe aqui porque os overlays de VÍDEO (Reels, feed
 * e card interior, em image.ts) não passam pelos builders de card: eles
 * desenham o próprio SVG e, até 2026-07-27, usavam sempre a fonte
 * genérica da marca. Resultado: trocar o layout em Ajustes mudava o
 * carrossel e não mudava o vídeo — o post antigo era re-renderizado
 * (arquivo novo, ?v= novo) mas saía com a tipografia errada.
 *
 * O peso vem junto porque não é uniforme: DM Serif Display, Anton e
 * Varela Round só têm o peso 400 embutido (pedir 800 faz o resvg
 * engrossar artificialmente e borrar a serifa), enquanto Inter usa 800.
 */
const PRESET_DISPLAY_FONT: Record<LayoutPreset, { family: string; weight: number } | null> = {
  // Editorial Noir usa a fonte escolhida em Ajustes (é o layout "da marca").
  "editorial-noir": null,
  brutalism: { family: "Anton", weight: 400 },
  "serif-luxe": { family: "DM Serif Display", weight: 400 },
  "swiss-mono": { family: "Inter", weight: 800 },
  "pop-creator": { family: "Varela Round", weight: 400 },
  // Confeitaria: serifa de vitrine no título; o arredondado fica nos rótulos.
  "doce-vitrine": { family: "DM Serif Display", weight: 400 },
  // Saúde: Sora — geométrica e limpa, ainda não usada por outro preset.
  "clinica-clara": { family: "Sora", weight: 600 },
  // Advocacia: a serifa do Serif Luxe; o que muda é a estrutura.
  tribuna: { family: "DM Serif Display", weight: 400 },
};

/**
 * Fonte de destaque a usar num overlay, dado o preset de layout e a
 * fonte da marca. `fallback` vale pro Editorial Noir (e pra preset
 * ausente/desconhecido), que segue a escolha de Ajustes.
 */
export function displayFontFor(
  preset: LayoutPreset | undefined,
  fallback: string
): { family: string; weight: number } {
  const chosen = preset ? PRESET_DISPLAY_FONT[preset] : null;
  return chosen ?? { family: fallback || "Inter", weight: 800 };
}

/** Fonte mono usada por todos os presets alternativos nos rótulos. */
export const MONO_FONT = "IBM Plex Mono";

/**
 * Como cada preset assina a marca — a peça que dá identidade visual
 * imediata ao card:
 *  - "rule": wordmark centralizado entre dois filetes (Editorial Noir,
 *    Serif Luxe);
 *  - "block": bloco sólido na cor de destaque com o texto vazado
 *    (Brutalism);
 *  - "bar": barra vertical de destaque à esquerda do texto (Swiss Mono);
 *  - "pill": cápsula arredondada preenchida com a cor de destaque
 *    (Pop Creator);
 *  - "scallop": barra ondulada, a "bandeja rendada" da confeitaria
 *    (Doce Vitrine);
 *  - "pulse": filete com um pico de batimento no meio (Clínica Clara);
 *  - "double-rule": régua dupla, o traço de papelaria jurídica
 *    (Tribuna).
 */
export type BrandRowKind =
  | "rule"
  | "block"
  | "bar"
  | "pill"
  | "scallop"
  | "pulse"
  | "double-rule";

export interface VideoIdentity {
  /** Tipografia do título. */
  display: { family: string; weight: number; letterSpacing: number };
  /** Assinatura da marca no quadro. */
  brandRow: BrandRowKind;
  /** Alinhamento do título — "middle" nos presets editoriais. */
  anchor: "start" | "middle";
  /** Rótulos (eyebrow/marca) em mono nos presets alternativos. */
  labelFont: "mono" | "display";
  /** Texto do canto superior esquerdo da CAPA, no formato do preset. */
  eyebrow: string;
  /** Chamada de deslize da capa, no tom do preset. */
  swipeHint: string;
}

const PRESET_VIDEO_IDENTITY: Record<LayoutPreset, Omit<VideoIdentity, "display">> = {
  "editorial-noir": {
    brandRow: "rule",
    anchor: "middle",
    labelFont: "display",
    eyebrow: "Nº01 · ENSAIO",
    swipeHint: "DESLIZE PARA VER →",
  },
  "serif-luxe": {
    brandRow: "rule",
    anchor: "middle",
    labelFont: "mono",
    eyebrow: "Nº01 · ENSAIO",
    swipeHint: "Deslize para conhecer",
  },
  brutalism: {
    brandRow: "block",
    anchor: "start",
    labelFont: "mono",
    eyebrow: "Nº01 — ENSAIO",
    swipeHint: "Deslize para conhecer",
  },
  "swiss-mono": {
    brandRow: "bar",
    anchor: "start",
    labelFont: "mono",
    eyebrow: "01 / ENSAIO",
    swipeHint: "Deslize para conhecer",
  },
  "pop-creator": {
    brandRow: "pill",
    anchor: "start",
    labelFont: "mono",
    eyebrow: "Nº 01",
    swipeHint: "Deslize para ver mais →",
  },
  tribuna: {
    brandRow: "double-rule",
    anchor: "start",
    labelFont: "mono",
    eyebrow: "DIREITO NA PRÁTICA",
    swipeHint: "Deslize para os pontos",
  },
  "clinica-clara": {
    brandRow: "pulse",
    anchor: "start",
    labelFont: "display",
    eyebrow: "SAÚDE EM DIA",
    swipeHint: "Deslize para entender",
  },
  "doce-vitrine": {
    brandRow: "scallop",
    anchor: "middle",
    // Rótulo arredondado, não mono: é o que separa esta vitrine do
    // Serif Luxe, que usa a mesma serifa no título.
    labelFont: "display",
    eyebrow: "FRESQUINHO DO DIA",
    swipeHint: "Deslize e escolha o seu",
  },
};

/**
 * Identidade completa a aplicar nos overlays de VÍDEO (Reels, feed e
 * card interior). Existe porque esses três formatos desenham SVG
 * próprio em image.ts, sem passar pelos builders de card de cada
 * layout-*.ts — sem isso saíam todos iguais, qualquer que fosse o
 * preset escolhido em Ajustes.
 */
export function videoIdentityFor(
  preset: LayoutPreset | undefined,
  fallbackFamily: string
): VideoIdentity {
  const base = PRESET_VIDEO_IDENTITY[preset ?? "editorial-noir"];
  const font = displayFontFor(preset, fallbackFamily);
  // Serifada e Varela pedem espaçamento neutro; grotescas fecham um
  // pouco pra dar a mancha compacta que os layouts de card já usam.
  const letterSpacing = font.weight >= 800 ? -1 : 0;
  return { ...base, display: { ...font, letterSpacing } };
}

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
  /** Cor do WORDMARK (migration 043). Ausente = cor de realce, que era o
   * comportamento antes de existir escolha. */
  markColor?: string | null;
  /** Rótulo do TOPO da capa (migration 046). Ausente/nulo = o padrão do
   * preset ("Nº01 · ENSAIO" e companhia), que era o único valor possível
   * antes de existir escolha. */
  eyebrow?: string | null;
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

// ============================================================
// AFASTAMENTO WORDMARK → TÍTULO (2026-07-29)
//
// Sempre que a assinatura da marca (o divisor ———WORDMARK®——— ou a
// linha de marca de um preset) fica logo ACIMA do título, a distância
// entre as duas é a mesma em todo o produto: a que o Reels já usava e
// que ficou visualmente certa. Antes cada formato tinha o seu número
// (Reels 50, feed 4:5 36, capa com vídeo 58, capa estática 130) e o
// mesmo carrossel parecia respirar diferente em cada peça.
//
// A distância NÃO é fixa em pixels: a posição do texto é dada pela
// BASELINE, então título grande "come" o espaço por cima. O termo
// proporcional ao corpo da fonte mantém a folga ÓTICA parecida entre
// título curto (fonte grande) e longo (fonte pequena).
// ============================================================
/** Parte fixa da distância, como o Reels sempre usou. */
export const WORDMARK_TO_HEADLINE_GAP = 50;
/** Parte proporcional ao corpo da fonte do título, como no Reels. */
export const WORDMARK_TO_HEADLINE_SCALE = 0.6;
/** Corpo do título do Reels — a peça em que essa folga foi calibrada. */
const REELS_HEADLINE_SIZE = 52;

/**
 * A folga é PROPORCIONAL ao corpo do título, calibrada pelo Reels.
 *
 * Copiar os 50px crus pra uma capa (corpo 104) daria metade da folga
 * ótica do Reels (corpo 52) — em pixels bate, aos olhos não: o que se
 * enxerga é o vão entre o filete e o topo das letras, e letra grande come
 * esse vão. Então o que se propaga é a RAZÃO folga/corpo do Reels
 * (~1,56×), não o número absoluto. No próprio Reels o resultado é
 * idêntico ao de antes.
 */
export const WORDMARK_TO_HEADLINE_RATIO =
  (WORDMARK_TO_HEADLINE_GAP + REELS_HEADLINE_SIZE * WORDMARK_TO_HEADLINE_SCALE) /
  REELS_HEADLINE_SIZE;

/** Distância baseline-a-baseline entre o wordmark e a 1ª linha do título. */
export function wordmarkToHeadlineGap(headlineSize: number): number {
  return Math.round(headlineSize * WORDMARK_TO_HEADLINE_RATIO);
}

// ============================================================
// IDs LOCAIS DE SVG (2026-07-30)
//
// `id` em SVG inline é GLOBAL no documento HTML. A Fila desenha dezenas
// de prévias na mesma página, e todas usavam ids fixos ("card-video-hole",
// "feed-video-hole", "video-hatch"…) — então `url(#card-video-hole)`
// resolvia pro PRIMEIRO do documento, que é a máscara de OUTRO card. O
// buraco do vídeo saía no lugar e no tamanho errados: um bloco do fundo
// do container aparecendo colado no título, e a moldura do vídeo com
// medida alheia (relatado no #0585 em 30/07).
//
// No render final isso nunca apareceu porque o resvg rasteriza cada SVG
// isolado — é um defeito que só existe no browser, onde eles convivem.
//
// O sufixo vem do CONTEÚDO, não de contador nem de random: estes
// builders rodam no servidor (RSC) E no cliente (LayoutPreview é client
// component), e um id que mudasse entre as duas passadas quebraria a
// hidratação. Mesma geometria ⇒ mesmo id ⇒ máscaras idênticas, que é
// justamente o caso em que compartilhar não faz mal.
// ============================================================

/** djb2 — curto, estável e suficiente pra distinguir geometrias. */
function hashParts(parts: (string | number | null | undefined)[]): string {
  let h = 5381;
  const s = parts.map((p) => (p == null ? "" : String(p))).join("|");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Id único por conteúdo pra `<mask>`, `<pattern>`, `<linearGradient>` e
 * afins dentro de um SVG que pode conviver com outros na mesma página.
 */
export function svgLocalId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  return `${prefix}-${hashParts(parts)}`;
}
