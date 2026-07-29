// ============================================================
// Construtores de SVG da PÁGINA 1 e da CONTRA-CAPA — puros: nenhuma
// dependência de sharp, resvg, rede ou banco.
//
// Extraídos de image.ts, que arrasta os SDKs de provider de imagem
// (fal, google-genai) e o sharp. O preview ao vivo da Fila precisa
// EXATAMENTE destes builders e de mais nada — mantê-los aqui é o que
// permite o preview e a arte final compartilharem o desenho sem o
// preview carregar meio pipeline junto.
// ============================================================
import { buildCoverSvg, type CardBrand } from "@/lib/carousel-render";
import { buildBrutalismCoverSvg } from "@/lib/layout-brutalism";
import { buildSerifLuxeCoverSvg } from "@/lib/layout-serif-luxe";
import { buildSwissMonoCoverSvg } from "@/lib/layout-swiss-mono";
import { buildPopCreatorCoverSvg } from "@/lib/layout-pop-creator";
import { buildCenteredPhraseSvg } from "@/lib/layout-centered";
import {
  pickTheme,
  textColorForTheme,
  needsOverlay,
  relativeLuminanceOfHex,
} from "@/lib/contrast";
import { FONT_FAMILY } from "@/lib/font-data";
import type { VisualIdentity } from "@/lib/types";

export const WIDTH = 1080;
export const HEIGHT = 1350;

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Construtor de capa/fechamento de cada preset de layout ALTERNATIVO
 * (Fase 3) — mesma assinatura (headline, brand, transparent, opts) →
 * {svg, blurBandTop}, despachado por tabela a partir de layout_preset. */
export const ALT_COVER_BUILDERS: Partial<
  Record<NonNullable<CardBrand["layoutPreset"]>, typeof buildBrutalismCoverSvg>
> = {
  brutalism: buildBrutalismCoverSvg,
  "serif-luxe": buildSerifLuxeCoverSvg,
  "swiss-mono": buildSwissMonoCoverSvg,
  "pop-creator": buildPopCreatorCoverSvg,
};

/** Dispatcher único da PÁGINA 1 do post único — 2 variações (kit v2 §3),
 * ortogonais ao layoutPreset (que decide a tipografia):
 * - "centered" (fonte no meio): frase curta centralizada, minimalista,
 *   sem wordmark/marca — mesmo em qualquer preset de layout.
 * - "cover" (estilo capa, default): mesma função usada pela contra-capa,
 *   wordmark + título display, herda os 5 layouts (Editorial Noir OU um
 *   dos 4 alternativos), sem chip (decisão do usuário — igual à capa do
 *   carrossel). */
export function buildPageOneCoverSvg(
  headline: string,
  cardBrand: CardBrand,
  transparent: boolean,
  opts: {
    showSwipeHint?: boolean;
    overlay?: { theme: "light" | "dark"; alpha: number };
    /** Placa da meta-linha do topo dos 4 layouts alternativos — ver
     * carousel-render.ts (renderAltLayoutCard) pra mesma lógica. */
    topOverlay?: { theme: "light" | "dark"; alpha: number };
  }
): { svg: string; blurBandTop: number } {
  if (cardBrand.singlePostStyle === "centered") {
    return buildCenteredPhraseSvg(headline, cardBrand, transparent, { overlay: opts.overlay });
  }
  const alt = cardBrand.layoutPreset ? ALT_COVER_BUILDERS[cardBrand.layoutPreset] : undefined;
  // showActionIcons: false explícito — sem essa força, a heurística padrão
  // dos 4 layouts alternativos (overlay presente + sem swipe hint) confunde
  // a página 1 com a CONTRA-CAPA (mesma condição, papel diferente) e
  // desenha os ícones de ação indevidamente.
  // eyebrow: o rótulo do POST (046) vence o default do preset; ausente
  // deixa `undefined`, que é o que faz cada layout usar o próprio.
  if (alt)
    return alt(headline, cardBrand, transparent, {
      ...opts,
      eyebrow: cardBrand.eyebrow ?? undefined,
      showActionIcons: false,
    });
  // align NÃO é forçado aqui de propósito — herda o default de buildCoverSvg
  // ("bottom"), pra ficar EXATAMENTE igual à capa do carrossel (post único
  // e vídeo/Reels usam este mesmo builder).
  return buildCoverSvg({ idx: 0, role: "hook", headline, body: "" }, cardBrand, transparent, {
    showSwipeHint: opts.showSwipeHint,
    overlay: opts.overlay,
    showActionIcons: false,
  });
}

/**
 * SVG da CONTRA-CAPA (página 2 do post único) — a metade pura do que
 * renderTemplateSlide desenha; o chip, a logo e a marca d'água entram
 * como camadas por cima (compostas no render, HTML no preview).
 *
 * Mapeamento do modelo antigo de Ajustes pro layout atual: palavra-chave
 * → headline (era o elemento mais forte visualmente); texto-cima +
 * texto-baixo (+ o "COMENTE:", sem equivalente direto) → corpo de apoio.
 *
 * Contraste automático: a cor de texto escolhida em Ajustes só é
 * respeitada se já tiver contraste suficiente contra o fundo; senão troca
 * pra cor segura do tema — nunca entrega um slide ilegível, mesmo que o
 * usuário tenha escolhido uma combinação ruim.
 */
export function buildClosingCoverSvg(
  identity: VisualIdentity,
  brand: CardBrand,
  fontFamily: string = FONT_FAMILY
): string {
  const bgLuminance = relativeLuminanceOfHex(identity.colorBackground);
  const theme = pickTheme(bgLuminance);
  const textColor = needsOverlay(identity.colorText, bgLuminance)
    ? textColorForTheme(theme)
    : identity.colorText;

  const headline = identity.keyword || identity.topText || "";
  const ctaLine = identity.ctaEnabled ? "Comente aqui embaixo" : null;
  const bodyParts = identity.keyword
    ? [identity.topText, ctaLine, identity.bottomText].filter(Boolean)
    : [ctaLine, identity.bottomText].filter(Boolean);
  const body = bodyParts.length ? bodyParts.join(" — ") : null;

  const cardBrand: CardBrand = {
    colorBackground: identity.colorBackground,
    colorAccent: identity.colorAccent,
    colorText: textColor,
    fontFamily,
    brandName: null,
    wordmark: brand.wordmark ?? null,
    handle: brand.handle ?? null,
    keywords: null,
    brandMark: "wordmark",
  };

  const alt = brand.layoutPreset ? ALT_COVER_BUILDERS[brand.layoutPreset] : undefined;
  return alt
    ? alt(headline, cardBrand, false, {
        showSwipeHint: false,
        body,
        eyebrowRight: "OBRIGADO",
        overlay: { theme, alpha: 0 }, // sinaliza "fechamento" → mostra os ícones
      }).svg
    : buildCoverSvg({ idx: 0, role: "hook", headline, body: body ?? "" }, cardBrand, false, {
        showSwipeHint: false,
        body,
        align: "center",
        showActionIcons: true,
      }).svg;
}

const WATERMARK_TEXT = "feito com PostPilot";

/**
 * Pill discreto no rodapé — presente nas duas páginas da arte de quem
 * está no plano gratuito. É o loop viral do produto: cada post free
 * publicado divulga o app. Some no upgrade.
 */
export function buildWatermarkSvg(width: number, height: number): string {
  const s = width / 1080;
  const fontSize = Math.round(26 * s);
  const padX = Math.round(18 * s);
  const padY = Math.round(10 * s);
  const bolt = Math.round(18 * s); // ícone raio (mesmo do logo)
  const gap = Math.round(8 * s);

  const textW = Math.ceil(WATERMARK_TEXT.length * fontSize * 0.5);
  const w = padX * 2 + bolt + gap + textW;
  const h = fontSize + padY * 2;
  const x = Math.round((width - w) / 2);
  const y = height - h - Math.round(22 * s);

  const boltX = x + padX;
  const boltY = y + Math.round((h - bolt) / 2);
  const textX = boltX + bolt + gap;
  const textY = y + h - padY - Math.round(fontSize * 0.16);

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h / 2)}"
            fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.22)" stroke-width="${Math.max(1, Math.round(s))}"/>
      <g transform="translate(${boltX}, ${boltY}) scale(${(bolt / 24).toFixed(3)})">
        <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" fill="#A78BFA"/>
      </g>
      <text x="${textX}" y="${textY}" font-family="${FONT_FAMILY}" font-size="${fontSize}"
            font-weight="600" fill="rgba(255,255,255,0.92)">${escapeXml(WATERMARK_TEXT)}</text>
    </svg>`;
}
