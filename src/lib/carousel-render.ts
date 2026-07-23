// ============================================================
// Render de um card de carrossel: monta um SVG 1080x1350 com o Brand
// Kit (cores + fonte) e o texto do card, rasteriza em PNG (resvg, via
// svg-render) e sobe no Storage. O builder do SVG é puro e testável;
// a rasterização/upload usa infra nativa (não roda em unit test).
// ============================================================
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { rasterizeSvg } from "@/lib/svg-render";
import { buildProfileChipLayers } from "@/lib/profile-chip";
import { buildOverlayGradientSvg } from "@/lib/contrast";
import {
  pickTheme,
  textColorForTheme,
  overlayAlphaFor,
  measureImageLuminance,
  type Theme,
} from "@/lib/contrast";
import {
  CARD_W,
  CARD_H,
  CLOSING_CORNER_MARGIN,
  actionIconsRail,
  type CoverPageKind,
  type CardBrand,
  type LayoutPreset,
} from "@/lib/render-shared";
import { buildBrutalismCoverSvg, buildBrutalismCardSvg } from "@/lib/layout-brutalism";
import { buildSerifLuxeCoverSvg, buildSerifLuxeCardSvg } from "@/lib/layout-serif-luxe";
import { buildSwissMonoCoverSvg, buildSwissMonoCardSvg } from "@/lib/layout-swiss-mono";
import { buildPopCreatorCoverSvg, buildPopCreatorCardSvg } from "@/lib/layout-pop-creator";
import type { CarouselCard } from "@/lib/ai/carousel";
import type { IgProfile } from "@/lib/types";

/** Builders de um preset de layout ALTERNATIVO (Fase 3) — mesma forma
 * pros 4 presets (brutalism/serif-luxe/swiss-mono/pop-creator), o que
 * permite despachar por tabela em vez de repetir a lógica de render. */
interface AltLayoutBuilders {
  buildCover: typeof buildBrutalismCoverSvg;
  buildCard: typeof buildBrutalismCardSvg;
}

const ALT_LAYOUTS: Partial<Record<LayoutPreset, AltLayoutBuilders>> = {
  brutalism: { buildCover: buildBrutalismCoverSvg, buildCard: buildBrutalismCardSvg },
  "serif-luxe": { buildCover: buildSerifLuxeCoverSvg, buildCard: buildSerifLuxeCardSvg },
  "swiss-mono": { buildCover: buildSwissMonoCoverSvg, buildCard: buildSwissMonoCardSvg },
  "pop-creator": { buildCover: buildPopCreatorCoverSvg, buildCard: buildPopCreatorCardSvg },
};

// Reexportados — quem já importava CARD_W/CARD_H/CoverPageKind/CardBrand
// daqui (actions.ts, generate-carousel.ts, image.ts) continua funcionando.
export { CARD_W, CARD_H, CLOSING_CORNER_MARGIN, actionIconsRail };
export type { CoverPageKind, CardBrand, LayoutPreset };

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Remove emoji e normaliza pontuação "esperta" (travessões/espaço sem
 * quebra) que a IA às vezes gera — as fontes embutidas (Inter/Sora/Space
 * Grotesk) não têm esses glifos, e o resvg desenha um quadrado com "?"
 * no lugar (tofu) em vez de simplesmente pular o caractere. */
function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}‍️]/gu, "")
    .replace(/[‐‑‒–—―]/g, "-") // travessões → hífen normal
    .replace(/[   ]/g, " ") // espaços especiais → espaço normal
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Quebra texto em linhas por número máximo de caracteres (greedy por palavra). */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length === 0) {
      line = w;
    } else if ((line + " " + w).length <= maxChars) {
      line += " " + w;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function tspans(lines: string[], x: number, startY: number, lineH: number): string {
  return lines
    .map(
      (l, i) =>
        `<tspan x="${x}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`
    )
    .join("");
}

/** Rótulo de marca dos cards INTERIORES: sempre o @handle do Instagram (com
 * @ na frente) + palavras-chave, quando existirem. O wordmark (nome/logo
 * por extenso) é exclusivo do divisor da capa/fechamento — nas páginas de
 * conteúdo o que identifica é o @ do perfil, igual a qualquer carrossel do
 * Instagram. null = sem rótulo (brandMark "none"/"icon"). */
export function brandLabelText(brand: CardBrand): string | null {
  const bm = brand.brandMark ?? "auto";
  if (bm === "none" || bm === "icon") return null;
  const handle = brand.handle ? `@${brand.handle}` : null;
  const kws =
    brand.keywords && brand.keywords.length
      ? brand.keywords.join(", ").toUpperCase()
      : null;
  const parts: string[] = [];
  if (handle) parts.push(handle);
  if (kws) parts.push(kws);
  return parts.length ? parts.join("  ·  ") : null;
}

/** Tamanho de fonte da headline da capa/fechamento por comprimento (auto-fit simples). */
function coverHeadlineSize(headline: string): { size: number; lineH: number; maxChars: number } {
  const n = headline.length;
  if (n <= 36) return { size: 104, lineH: 114, maxChars: 15 };
  if (n <= 64) return { size: 86, lineH: 96, maxChars: 19 };
  return { size: 70, lineH: 80, maxChars: 25 };
}

/** Fonte do texto de apoio (embaixo da headline) — cresce junto com a
 * headline pra manter a proporção visual entre os dois. */
const COVER_BODY_SIZE = 48;
const COVER_BODY_LINE_H = 56;

/** Corpo do card INTERIOR escala junto com o título (mesmo critério da
 * capa via coverHeadlineSize) — título curto e gigante pede um corpo
 * maior também; título mais longo (fonte menor) usa um corpo discreto. */
function interiorBodySize(headSize: number): { size: number; lineH: number; maxChars: number } {
  if (headSize >= 104) return { size: 52, lineH: 68, maxChars: 26 };
  if (headSize >= 86) return { size: 44, lineH: 58, maxChars: 30 };
  return { size: 38, lineH: 50, maxChars: 34 };
}

/** Opções da CAPA/FECHAMENTO. showSwipeHint=false na última página (não faz
 * sentido "deslize para ver" quando não há mais nada depois); body é o
 * texto de apoio (fechamento pode ter uma frase curta além da headline).
 * align="bottom" (capa, default) gruda o grupo perto do rodapé, junto do
 * "deslize para ver"; align="center" (fechamento) centraliza o grupo no
 * quadro — sem o gancho do swipe, fica melhor centralizado do que colado
 * embaixo. showActionIcons desenha a trilha vertical curtir/repostar/
 * compartilhar/salvar no canto inferior direito (só no fechamento). */
export interface CoverOptions {
  showSwipeHint?: boolean;
  body?: string | null;
  align?: "bottom" | "center";
  showActionIcons?: boolean;
  /** Overlay translúcido (calibrado por contrast.ts a partir da luminância
   * REAL da banda de fundo) — substitui o escurecimento fixo de antes. */
  overlay?: { theme: Theme; alpha: number };
}

export interface CoverRender {
  svg: string;
  /** Topo da região que deve levar blur/escurecido quando há foto de fundo
   * — cobre TODO o grupo de identidade (divisor + headline [+ body] +
   * CTA), calculado dinamicamente porque a altura do grupo varia com o
   * número de linhas. */
  blurBandTop: number;
}

/** Desenha o ® como VETOR (círculo + "R") em vez de depender do glifo
 * U+00AE da fonte embutida — em produção o resvg às vezes não tem esse
 * glifo mesmo com o arquivo de fonte certo carregado (falha observada:
 * todo o resto do texto renderiza normalmente, só o ® some). Desenhando
 * à mão o símbolo nunca depende de cobertura de fonte. */
function registeredMarkGlyph(cx: number, baselineY: number, color: string): string {
  const r = 9;
  const cy = baselineY - 9;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.4"/>
  <text x="${cx}" y="${cy + 4}" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="${color}" text-anchor="middle">R</text>`;
}

/**
 * SVG da CAPA (card 0) ou do FECHAMENTO (última página) no estilo
 * @0verlens: um único grupo — divisor (———— WORDMARK ————), headline (+
 * body, no fechamento) e, na capa, "deslize para ver". Na capa fica
 * grudado no RODAPÉ (align="bottom", default); no fechamento fica
 * CENTRALIZADO no quadro (align="center", sem o gancho do swipe), com o
 * chip de perfil no canto inferior esquerdo e a trilha de ícones
 * (curtir/repostar/compartilhar/salvar) no canto inferior direito. Mesmo
 * estilo de texto das
 * páginas interiores (preenchimento simples, sem contorno); com foto de
 * fundo, a legibilidade vem do blur/escurecido aplicado só na banda do
 * grupo (composePhotoBg) — o resto da foto fica normal.
 */
export function buildCoverSvg(
  card: CarouselCard,
  brand: CardBrand,
  transparent = false,
  opts: CoverOptions = {}
): CoverRender {
  const family = brand.fontFamily || "Inter";
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#7C5CFF";
  const text = brand.colorText || "#FFFFFF";
  const pad = 90;
  const cx = CARD_W / 2;
  const showSwipeHint = opts.showSwipeHint !== false;
  const align = opts.align ?? "bottom";
  const showActionIcons = opts.showActionIcons ?? false;

  const wm = (brand.wordmark || brand.brandName || "").toUpperCase();
  const headlineText = stripEmoji(card.headline ?? "");
  const { size, lineH, maxChars } = coverHeadlineSize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 5);
  const bodyLines = opts.body ? wrapText(stripEmoji(opts.body), 34).slice(0, 3) : [];

  // Chip (esquerda) e trilha de ícones (direita) agora vivem nos CANTOS —
  // não precisam mais de uma faixa reservada na largura toda; só uma
  // margem inferior confortável pro grupo de texto não encostar nelas.
  const bottomEdge = CARD_H - 120;

  // Monta o grupo (divisor → headline (+ body) → swipe hint) de BAIXO PRA
  // CIMA a partir de um cursor — reaproveitado pros dois modos de
  // alinhamento (só muda de onde o cursor começa).
  const layout = (startCursor: number) => {
    let cursor = startCursor;
    let swipeY: number | null = null;
    if (showSwipeHint) {
      swipeY = cursor;
      cursor -= 74;
    }
    let bodyStartY: number | null = null;
    if (bodyLines.length) {
      bodyStartY = cursor - (bodyLines.length - 1) * COVER_BODY_LINE_H;
      cursor = bodyStartY - 66;
    }
    const headStartY = cursor - (lines.length - 1) * lineH;
    // Gap ESCALA com o tamanho da fonte do título: um valor fixo (90)
    // ficava colado em títulos grandes (size~104) — a altura das letras
    // "come" parte do espaço já que a posição é pela BASELINE, não pelo
    // topo do glifo. size*0.6 mantém a folga visual (não a distância de
    // baseline) parecida entre título curto/grande.
    cursor = headStartY - Math.round(90 + size * 0.6);
    const dividerY = cursor;
    return { dividerY, headStartY, bodyStartY, swipeY };
  };

  let startCursor: number;
  if (align === "center") {
    // 1ª passada só pra medir a altura total do grupo; 2ª com o cursor
    // certo pra centralizar (a foto de foto de referência é arbitrária —
    // só usada pra calcular a diferença).
    const probe = layout(2000);
    const totalH = 2000 - probe.dividerY;
    const centerY = (140 + bottomEdge) / 2;
    startCursor = centerY + totalH / 2;
  } else {
    startCursor = bottomEdge;
  }
  const { dividerY, headStartY, bodyStartY, swipeY } = layout(startCursor);

  // ® sai do texto e vira um vetor desenhado à parte (ver registeredMarkGlyph).
  const hasRegMark = wm.endsWith("®");
  const wmBase = hasRegMark ? wm.slice(0, -1).trimEnd() : wm;
  const halfText = wm ? (wmBase.length * 22) / 2 + 24 + (hasRegMark ? 30 : 0) : 0;
  const regMarkX = cx + (wmBase.length * 22) / 2 + 28;
  const divider = wm
    ? `<line x1="${pad}" y1="${dividerY}" x2="${cx - halfText}" y2="${dividerY}" stroke="${text}" stroke-opacity="0.45" stroke-width="1.5"/>
  <line x1="${cx + halfText}" y1="${dividerY}" x2="${CARD_W - pad}" y2="${dividerY}" stroke="${text}" stroke-opacity="0.45" stroke-width="1.5"/>
  <text x="${cx}" y="${dividerY + 8}" font-family="${family}" font-weight="600" font-size="26" letter-spacing="6" fill="${accent}" text-anchor="middle">${escapeXml(wmBase)}</text>
  ${hasRegMark ? registeredMarkGlyph(regMarkX, dividerY + 8, accent) : ""}`
    : "";
  const swipeHint =
    swipeY != null
      ? `<text x="${cx}" y="${swipeY}" font-family="${family}" font-weight="600" font-size="26" letter-spacing="4" fill="${text}" fill-opacity="0.75" text-anchor="middle">DESLIZE PARA VER →</text>`
      : "";
  // Trilha de ícones no canto inferior DIREITO (curtir/repostar/
  // compartilhar/salvar, de cima pra baixo), grudada na mesma margem do
  // chip (canto inferior esquerdo).
  const iconRailX = CARD_W - CLOSING_CORNER_MARGIN - 21;
  const iconRailBottomY = CARD_H - CLOSING_CORNER_MARGIN - 21;
  const actionIcons = showActionIcons ? actionIconsRail(iconRailX, iconRailBottomY, text) : "";

  // Mesmo estilo das páginas interiores: preenchimento simples, sem
  // contorno — a legibilidade sobre foto vem do blur/escurecido da banda.
  const headlineSvg = `<text font-family="${family}" font-weight="800" font-size="${size}" fill="${text}" text-anchor="middle" letter-spacing="-1">${tspans(lines, cx, headStartY, lineH)}</text>`;
  const bodySvg = bodyLines.length
    ? `<text font-family="${family}" font-weight="400" font-size="${COVER_BODY_SIZE}" fill="${text}" fill-opacity="0.9" text-anchor="middle">${tspans(bodyLines, cx, bodyStartY as number, COVER_BODY_LINE_H)}</text>`
    : "";

  // Sem foto: fundo sólido da marca. Com foto, o quadro fica visível
  // "normal" — só a banda de identidade leva blur (composePhotoBg) +
  // este overlay tematizado, calibrado pela luminância REAL da banda
  // (contrast.ts) — nunca mais um escurecimento fixo às cegas.
  const bgRect = transparent ? "" : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;
  const overlayBandY = Math.max(0, dividerY - 90);
  const overlayRect =
    transparent && opts.overlay
      ? buildOverlayGradientSvg("overlay-noir", overlayBandY, CARD_H - overlayBandY, CARD_W, opts.overlay.theme, opts.overlay.alpha)
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${bgRect}
  ${overlayRect}
  ${headlineSvg}
  ${bodySvg}
  ${divider}
  ${swipeHint}
  ${actionIcons}
</svg>`;

  // Margem de segurança acima do divisor (topo do grupo).
  const blurBandTop = Math.max(0, dividerY - 90);
  return { svg, blurBandTop };
}

/**
 * SVG do card interior (string). role define o layout: hook = headline
 * grande centralizado; cta = faixa de destaque; value = headline + body.
 * Rótulo de marca/palavras-chave no topo-esquerdo (brandLabelText); SEM
 * nome de marca no rodapé (só o número da página).
 */
export function buildCardSvg(
  card: CarouselCard,
  brand: CardBrand,
  transparent = false,
  overlay?: { theme: Theme; alpha: number }
): string {
  const family = brand.fontFamily || "Inter";
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#7C5CFF";
  const text = brand.colorText || "#FFFFFF";
  const pad = 96;

  const headlineText = stripEmoji(card.headline ?? "");
  const { size: headSize, lineH: headLineH, maxChars: headMaxChars } = coverHeadlineSize(headlineText);
  const headlineLines = wrapText(headlineText, headMaxChars).slice(0, 4);
  const { size: bodySize, lineH: bodyLineH, maxChars: bodyMaxChars } = interiorBodySize(headSize);
  const bodyLines = card.body ? wrapText(stripEmoji(card.body), bodyMaxChars) : [];

  const isHook = card.role === "hook";
  const isCta = card.role === "cta";

  // Rótulo (@handle · palavras-chave) SEMPRE em uma linha só — nunca
  // quebra; se não couber, corta com reticências (nunca estoura o quadro).
  const rawLabel = brandLabelText(brand);
  const label = rawLabel && rawLabel.length > 50 ? rawLabel.slice(0, 49).trimEnd() + "…" : rawLabel;
  // Alterna topo/rodapé pelas páginas internas (ritmo editorial) — par de
  // baixo pra cima seguindo a paridade do índice do card (determinístico:
  // mesmo carrossel sempre produz a mesma alternância).
  const labelAtBottom = card.idx % 2 === 1;
  const labelY = labelAtBottom ? CARD_H - 70 : 130;

  // Cards "value" (a maioria do miolo do carrossel): o bloco título+corpo
  // acompanha o @ em vez de ficar sempre fixo no mesmo lugar — quando o
  // rótulo sobe pro topo, o bloco desce pro terço inferior (e vice-versa).
  // Sem isso o bloco ficava sempre colado em y=300, então metade das
  // páginas tinha o rótulo bem perto do título (topo) e a outra metade
  // sempre "no lado oposto" — nunca variava de verdade, só o rótulo
  // bailava em volta de um texto parado. Hook/cta mantêm o centro fixo
  // (composição deliberada, não sofre desse problema).
  let headStartY = isHook ? 520 : 300;
  if (!isHook && !isCta) {
    const blockBottomMargin = CARD_H - 220; // folga acima do número da página
    // Distância do início do bloco (headStartY) até a baseline da ÚLTIMA
    // linha (corpo, se houver — senão a própria headline) — mesma conta
    // usada mais abaixo pra posicionar o corpo a partir de headStartY.
    const lastBaselineOffset = bodyLines.length
      ? headLineH * headlineLines.length + Math.round(headSize * 0.6) + bodyLineH * (bodyLines.length - 1)
      : headLineH * (headlineLines.length - 1);
    const lowerHeadStartY = blockBottomMargin - lastBaselineOffset;
    headStartY = labelAtBottom ? 300 : lowerHeadStartY;
  }

  // Sem foto: fundo sólido. Com foto: SEM retângulo fixo — o overlay agora
  // é calibrado pela luminância real da foto (contrast.ts); só aparece
  // (e só na opacidade necessária) quando o contraste do texto precisa.
  const cardBg = transparent
    ? overlay && overlay.alpha > 0
      ? `<rect width="${CARD_W}" height="${CARD_H}" fill="${overlay.theme === "dark" ? "#000" : "#fff"}" fill-opacity="${overlay.alpha}"/>`
      : ""
    : `<rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  ${cardBg}
  ${label ? `<text x="${pad}" y="${labelY}" font-family="${family}" font-weight="600" font-size="24" letter-spacing="3" fill="${text}" fill-opacity="0.85">${escapeXml(label)}</text>` : ""}
  ${isCta ? `<rect x="${pad}" y="${headStartY - 120}" width="${CARD_W - pad * 2}" height="${headLineH * headlineLines.length + 80}" rx="28" fill="${accent}" opacity="0.16"/>` : ""}
  <text font-family="${family}" font-weight="700" font-size="${headSize}" fill="${text}" text-anchor="${isHook || isCta ? "middle" : "start"}">
    ${tspans(headlineLines, isHook || isCta ? CARD_W / 2 : pad, headStartY, headLineH)}
  </text>
  ${
    bodyLines.length
      ? `<text font-family="${family}" font-weight="400" font-size="${bodySize}" fill="${text}" opacity="0.82" text-anchor="${isCta ? "middle" : "start"}">
    ${tspans(bodyLines, isCta ? CARD_W / 2 : pad, headStartY + headLineH * headlineLines.length + Math.round(headSize * 0.6), bodyLineH)}
  </text>`
      : ""
  }
  <text x="${CARD_W - pad}" y="${CARD_H - 70}" font-family="${family}" font-weight="400" font-size="30" fill="${text}" opacity="0.5" text-anchor="end">${card.idx + 1}</text>
</svg>`;
}

/**
 * Rasteriza o card e sobe no bucket post-images. Retorna a URL pública.
 * Usa service role (job) — não roda em unit test.
 */
/** Compõe o card sobre uma FOTO. `blurBandTop === null` (cards interiores):
 * blur estético cobre o quadro inteiro. `blurBandTop` numérico (capa/
 * fechamento): blur fica SÓ na banda inferior de identidade (com borda
 * superior esfumaçada) — o resto da foto fica normal. O ESCURECIMENTO em
 * si não vem mais daqui (era fixo, às cegas) — vem do overlay tematizado
 * desenhado no SVG (buildCardSvg/buildCoverSvg), calibrado pela
 * luminância REAL medida em contrast.ts. Aqui só o desfoque (estético). */
export async function composePhotoBg(
  photo: Buffer,
  svg: string,
  blurBandTop: number | null
): Promise<Buffer> {
  const base = await sharp(photo)
    .resize(CARD_W, CARD_H, { fit: "cover", position: "attention" })
    .toBuffer();

  let backdrop: Buffer;
  if (blurBandTop == null) {
    backdrop = await sharp(base).blur(8).toBuffer();
  } else {
    const bandH = CARD_H - blurBandTop;
    const bandCrop = await sharp(base)
      .extract({ left: 0, top: blurBandTop, width: CARD_W, height: bandH })
      .blur(16)
      .toBuffer();
    // Máscara de alfa (gradiente) esfumaça a borda superior da banda para
    // não deixar costura visível entre a foto normal e a banda borrada.
    const featherSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${bandH}">
      <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset="${Math.min(0.35, 70 / bandH)}" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="1"/>
      </linearGradient></defs>
      <rect width="${CARD_W}" height="${bandH}" fill="url(#f)"/>
    </svg>`;
    const mask = rasterizeSvg(featherSvg);
    const maskedBand = await sharp(bandCrop)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    backdrop = await sharp(base)
      .composite([{ input: maskedBand, top: blurBandTop, left: 0 }])
      .toBuffer();
  }

  const overlay = rasterizeSvg(svg); // PNG transparente (texto/divisor)
  return sharp(backdrop)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Renderiza um card em qualquer preset de layout ALTERNATIVO (Fase 3) —
 * mesmo motor de contraste (luminância real → tema → overlay) do layout
 * padrão, só a tipografia/estrutura do SVG muda (layout-*.ts). */
async function renderAltLayoutCard(
  builders: AltLayoutBuilders,
  card: CarouselCard,
  brand: CardBrand,
  pageKind: CoverPageKind,
  bgImage: Buffer | null,
  totalCards: number
): Promise<Buffer> {
  const { buildCover, buildCard } = builders;
  const isCoverStyle = pageKind === "cover" || pageKind === "closing";

  if (isCoverStyle) {
    const eyebrowRight = pageKind === "closing" ? "OBRIGADO" : null;
    const opts = {
      showSwipeHint: pageKind === "cover",
      body: pageKind === "closing" ? card.body : null,
      eyebrowRight,
    };
    if (bgImage) {
      const probe = buildCover(card.headline ?? "", { ...brand, colorText: "#FFFFFF" }, true, opts);
      const band = await sharp(bgImage)
        .resize(CARD_W, CARD_H, { fit: "cover", position: "attention" })
        .extract({ left: 0, top: probe.blurBandTop, width: CARD_W, height: CARD_H - probe.blurBandTop })
        .toBuffer();
      const luminance = await measureImageLuminance(band);
      const theme = pickTheme(luminance);
      const textColor = textColorForTheme(theme);
      const alpha = overlayAlphaFor(theme, textColor, luminance);
      const { svg, blurBandTop } = buildCover(card.headline ?? "", { ...brand, colorText: textColor }, true, {
        ...opts,
        overlay: { theme, alpha },
      });
      return composePhotoBg(bgImage, svg, blurBandTop);
    }
    const { svg } = buildCover(card.headline ?? "", brand, false, opts);
    return rasterizeSvg(svg);
  }

  if (bgImage) {
    const luminance = await measureImageLuminance(bgImage);
    const theme = pickTheme(luminance);
    const textColor = textColorForTheme(theme);
    const alpha = overlayAlphaFor(theme, textColor, luminance);
    const svg = buildCard(
      card.headline ?? "",
      card.body ?? null,
      { ...brand, colorText: textColor },
      { index: card.idx + 1, total: totalCards },
      true,
      { theme, alpha }
    );
    return composePhotoBg(bgImage, svg, null);
  }
  const svg = buildCard(card.headline ?? "", card.body ?? null, brand, {
    index: card.idx + 1,
    total: totalCards,
  });
  return rasterizeSvg(svg);
}

export async function renderAndUploadCard(
  postId: string,
  card: CarouselCard,
  brand: CardBrand,
  pageKind: CoverPageKind = "interior",
  bgImage: Buffer | null = null,
  profile: IgProfile | null = null,
  totalCards = 1
): Promise<string> {
  const isCoverStyle = pageKind === "cover" || pageKind === "closing";
  const altLayout = brand.layoutPreset ? ALT_LAYOUTS[brand.layoutPreset] : undefined;

  let png: Buffer;
  if (altLayout) {
    png = await renderAltLayoutCard(altLayout, card, brand, pageKind, bgImage, totalCards);
  } else if (isCoverStyle) {
    const coverOpts: CoverOptions = {
      showSwipeHint: pageKind === "cover",
      body: pageKind === "closing" ? card.body : null,
      align: pageKind === "closing" ? "center" : "bottom",
      showActionIcons: pageKind === "closing",
    };
    if (bgImage) {
      // 1ª passada (sem overlay) só pra descobrir onde cai a banda de
      // identidade; mede a luminância REAL dessa banda (não a foto toda) e
      // calibra tema + overlay a partir dela (contrast.ts).
      const probe = buildCoverSvg(card, { ...brand, colorText: "#FFFFFF" }, true, coverOpts);
      const band = await sharp(bgImage)
        .resize(CARD_W, CARD_H, { fit: "cover", position: "attention" })
        .extract({
          left: 0,
          top: probe.blurBandTop,
          width: CARD_W,
          height: CARD_H - probe.blurBandTop,
        })
        .toBuffer();
      const luminance = await measureImageLuminance(band);
      const theme = pickTheme(luminance);
      const textColor = textColorForTheme(theme);
      const alpha = overlayAlphaFor(theme, textColor, luminance);
      const { svg, blurBandTop } = buildCoverSvg(card, { ...brand, colorText: textColor }, true, {
        ...coverOpts,
        overlay: { theme, alpha },
      });
      png = await composePhotoBg(bgImage, svg, blurBandTop);
    } else {
      const { svg } = buildCoverSvg(card, brand, false, coverOpts);
      png = rasterizeSvg(svg);
    }
  } else if (bgImage) {
    const luminance = await measureImageLuminance(bgImage);
    const theme = pickTheme(luminance);
    const textColor = textColorForTheme(theme);
    const alpha = overlayAlphaFor(theme, textColor, luminance);
    const onPhoto: CardBrand = { ...brand, colorText: textColor };
    png = await composePhotoBg(bgImage, buildCardSvg(card, onPhoto, true, { theme, alpha }), null);
  } else {
    png = rasterizeSvg(buildCardSvg(card, brand));
  }

  // Fechamento: chip de perfil (avatar + @handle) no canto inferior
  // ESQUERDO — mesma margem da trilha de ícones (canto inferior direito).
  if (pageKind === "closing" && profile) {
    const chipLayers = await buildProfileChipLayers(profile, CARD_W, brand.fontFamily, {
      position: "bottom-left",
      canvasHeight: CARD_H,
      widthPercent: 0.3,
    });
    png = await sharp(png).composite(chipLayers).png().toBuffer();
  }

  const supabase = createAdminClient();
  const path = `${postId}-card-${card.idx}.png`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload do card falhou: ${error.message}`);
  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
