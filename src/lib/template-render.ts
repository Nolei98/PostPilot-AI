// ============================================================
// Renderer dirigido por SPEC (Sprint B+, TAREFA B12). Generaliza o B8:
// desenha cada elemento da `spec` (posição/estilo/binding) em SVG, que
// o resvg rasteriza. É o motor por trás dos presets do Template Studio
// e do editor visual (B14). Ver HANDOFF-overlens-template.md seção 6B.3.
//
// Reusa o pipeline SVG+resvg existente (decisão: sem Satori).
// ============================================================
import sharp from "sharp";
import { wrapText, stripEmoji, type CardBrand } from "@/lib/carousel-render";
import { brandLabelText } from "@/lib/carousel-render";
import { rasterizeSvg } from "@/lib/svg-render";
import {
  measureImageLuminance,
  pickTheme,
  textColorForTheme,
  overlayAlphaFor,
} from "@/lib/contrast";
import type {
  TemplateSpec,
  TemplateElement,
  TemplateElementType,
  TemplateAnchor,
} from "@/lib/types";
import type { LegibilityResult } from "@/lib/legibility";

/** Conteúdo dinâmico injetado nos elementos (via element.bind). */
export interface TemplateContent {
  headline?: string;
  body?: string;
  cta?: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Alinhamento horizontal do texto a partir da âncora. */
function textAnchor(anchor: TemplateAnchor): "start" | "middle" | "end" {
  if (anchor.endsWith("-left")) return "start";
  if (anchor.endsWith("-right")) return "end";
  return "middle";
}

/**
 * Resolve uma cor do estilo: auto/accent/bg/text ou hex literal.
 *
 * `isMark` marca os elementos de MARCA (wordmark, divisor, rótulo do @).
 * Neles, "accent" passa a significar a cor do wordmark escolhida no post
 * (migration 043) em vez do realce cru do Brand Kit — sem isso, quem tem
 * template do Template Studio selecionado (o caso do cliente ativo, que
 * usa template em cover_image/carousel_page/carousel_last) via a escolha
 * de "Cor da marca na arte" não surtir efeito nenhum no carrossel,
 * enquanto os formatos que não passam por template obedeciam.
 */
function resolveColor(
  color: string | undefined,
  brand: CardBrand,
  legibility?: LegibilityResult,
  isMark = false
): string {
  if (!color || color === "auto") {
    if (legibility) return legibility.textColor === "dark" ? "#111111" : "#FFFFFF";
    return brand.colorText || "#FFFFFF";
  }
  if (color === "accent") {
    if (isMark && brand.markColor) return brand.markColor;
    return brand.colorAccent || "#7C5CFF";
  }
  if (color === "bg") return brand.colorBackground || "#0B0B12";
  if (color === "text") return brand.colorText || "#FFFFFF";
  return color; // hex
}

/** Texto de um elemento a partir do bind + brand/content. */
function resolveText(
  el: TemplateElement,
  brand: CardBrand,
  content: TemplateContent
): string {
  const bind = el.bind ?? "";
  if (bind === "content.headline") return content.headline ?? "";
  if (bind === "content.body") return content.body ?? "";
  // Sem texto fixo no fallback: quem sabe se a página convida a deslizar é
  // o CHAMADOR (só a capa de um carrossel com página seguinte convida). O
  // default "DESLIZE PARA VER →" que morava aqui vazava pro FECHAMENTO —
  // o template dele tem elemento cta, e post-render/post-preview nunca
  // mandam `cta`, então o fim do carrossel pedia pra deslizar pra lugar
  // nenhum.
  if (bind === "content.cta") return content.cta ?? "";
  if (bind === "brand.wordmark") return (brand.wordmark || brand.brandName || "").toUpperCase();
  if (bind === "brand.handle") return brand.handle ? `@${brand.handle}` : "";
  if (bind === "brand.name") return brand.brandName ?? "";
  if (bind === "brand.label") return brandLabelText(brand) ?? "";
  return "";
}

function tspans(lines: string[], x: number, startY: number, lineH: number): string {
  return lines
    .map((l, i) => `<tspan x="${x}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`)
    .join("");
}

/** Tipos que `renderTextElement` desenha — mesma lista do switch de
 * `renderFromSpec`, extraída pra medição e desenho nunca discordarem
 * sobre o que é texto. */
const TEXT_ELEMENT_TYPES: TemplateElementType[] = [
  "headline",
  "body",
  "cta",
  "handleLabel",
  "wordmark",
];

/** Geometria de um elemento de texto já quebrado em linhas. `baselineLast`
 * é a baseline da ÚLTIMA linha — é o que permite ancorar algo logo abaixo
 * do bloco (o chip da contra-capa) sem chutar uma fração fixa da altura. */
interface TextBlockMetrics {
  text: string;
  x: number;
  y: number;
  lineH: number;
  fontSize: number;
  lines: string[];
  baselineLast: number;
}

/** Mede um elemento de texto SEM desenhar. Uma conta só, usada tanto pelo
 * desenho quanto por quem precisa saber onde o bloco termina — duas
 * implementações da mesma quebra de linha sairiam de sincronia na primeira
 * mudança de tipografia. */
function measureTextElement(
  el: TemplateElement,
  brand: CardBrand,
  content: TemplateContent,
  W: number,
  H: number
): TextBlockMetrics | null {
  // stripEmoji só no texto vindo do CONTEÚDO (headline/body/cta), que é
  // onde a IA põe emoji: as fontes embutidas não têm esses glifos e o resvg
  // desenha um quadrado com "?" (tofu). O motor SEM template já limpava
  // (carousel-render.ts); este não, então o MESMO texto saía limpo num
  // caminho e quebrado no outro — visto numa contra-capa de produção em
  // 31/07, com "🔖 Salve e siga...".
  //
  // NÃO vale pro texto de marca: `®` é Extended_Pictographic, então limpar
  // `brand.wordmark` apagaria o símbolo da marca do cliente.
  const bruto = resolveText(el, brand, content);
  const raw = (el.bind ?? "").startsWith("content.") ? stripEmoji(bruto) : bruto;
  if (!raw) return null;
  const text = el.style?.case === "upper" ? raw.toUpperCase() : raw;
  const x = Math.round((el.offset?.x ?? 0.5) * W);
  const y = Math.round((el.offset?.y ?? 0.5) * H);
  const fontSize = el.size?.fontSize ?? 40;
  const maxWidth = (el.size?.maxWidth ?? 0.84) * W;
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * 0.56)));
  const lineH = Math.round(fontSize * (el.style?.lineHeight ?? 1.15));
  const lines = wrapText(text, maxChars).slice(0, 6);
  return { text, x, y, lineH, fontSize, lines, baselineLast: y + (lines.length - 1) * lineH };
}

/**
 * Onde termina o texto mais BAIXO da spec, em fração da altura (0..1).
 * `null` quando a spec não desenha texto nenhum. Serve pra ancorar o chip
 * de perfil logo abaixo do conteúdo da contra-capa: título de 2 linhas ou
 * de 5, o chip acompanha em vez de colidir.
 */
export function lowestTextBottomFrac(
  spec: TemplateSpec,
  brand: CardBrand,
  content: TemplateContent,
  W = 1080,
  H = 1350
): number | null {
  let lowest: number | null = null;
  for (const el of spec.elements) {
    if (el.visible === false) continue;
    if (!TEXT_ELEMENT_TYPES.includes(el.type)) continue;
    const m = measureTextElement(el, brand, content, W, H);
    if (!m) continue;
    // baseline + descida da última linha ≈ base visual do bloco.
    const bottom = m.baselineLast + m.fontSize * 0.24;
    if (lowest == null || bottom > lowest) lowest = bottom;
  }
  return lowest == null ? null : lowest / H;
}

/** Desenha um elemento de texto (headline/body/handleLabel/wordmark/cta). */
function renderTextElement(
  el: TemplateElement,
  brand: CardBrand,
  content: TemplateContent,
  W: number,
  H: number,
  legibility?: LegibilityResult
): string {
  const m = measureTextElement(el, brand, content, W, H);
  if (!m) return "";
  const { x, y, lineH, fontSize, lines } = m;
  const family = el.style?.font === "heading" ? brand.fontFamily : brand.fontFamily;
  const color = resolveColor(el.style?.color, brand, legibility, isMarkElement(el.type));
  const anchor = textAnchor(el.anchor);
  const weight = el.style?.weight ?? 400;
  const tracking = el.style?.tracking != null ? ` letter-spacing="${el.style.tracking * fontSize}"` : "";
  const opacity = el.style?.opacity != null ? ` fill-opacity="${el.style.opacity}"` : "";

  return `<text font-family="${family}" font-weight="${weight}" font-size="${fontSize}" fill="${color}" text-anchor="${anchor}"${tracking}${opacity}>${tspans(lines, x, y, lineH)}</text>`;
}

/** Desenha o divisor com wordmark (réguas fora do texto). */
function renderDivider(
  el: TemplateElement,
  brand: CardBrand,
  W: number,
  H: number,
  legibility?: LegibilityResult
): string {
  const wm = (brand.wordmark || brand.brandName || "").toUpperCase();
  if (!wm) return "";
  const cx = Math.round((el.offset?.x ?? 0.5) * W);
  const y = Math.round((el.offset?.y ?? 0.22) * H);
  const family = brand.fontFamily;
  const rule = resolveColor(el.style?.color ?? "text", brand, legibility);
  // O TEXTO do divisor é o wordmark: segue a cor da marca do post (043),
  // não o realce cru. Os filetes continuam na cor de texto.
  const accent = brand.markColor || brand.colorAccent || "#7C5CFF";
  const halfText = (wm.length * 22) / 2 + 28;
  const ruleLen = 150;
  return `<line x1="${cx - halfText - ruleLen}" y1="${y}" x2="${cx - halfText}" y2="${y}" stroke="${rule}" stroke-opacity="0.45" stroke-width="1.5"/>
  <line x1="${cx + halfText}" y1="${y}" x2="${cx + halfText + ruleLen}" y2="${y}" stroke="${rule}" stroke-opacity="0.45" stroke-width="1.5"/>
  <text x="${cx}" y="${y + 8}" font-family="${family}" font-weight="600" font-size="26" letter-spacing="6" fill="${accent}" text-anchor="middle">${escapeXml(wm)}</text>`;
}

export interface RenderSpecOptions {
  /** Pula o fundo sólido da marca — usado quando uma foto vai ser
   * composta por baixo (renderTemplateCardPng). */
  transparentBg?: boolean;
  /** Escurece (dark) ou clareia (light) o fundo com um véu translúcido,
   * calibrado pelo motor de contraste (contrast.ts) — mesma matemática
   * já usada no resto do pipeline (luminância → tema → alpha WCAG). */
  overlay?: { theme: "light" | "dark"; alpha: number };
}

/**
 * Renderiza uma spec completa em SVG. Fundo sólido da marca por padrão;
 * com `opts.transparentBg` o fundo fica vazio (photo composta por fora,
 * ver renderTemplateCardPng) e `opts.overlay` desenha o véu de legibilidade.
 * Elementos não suportados (media/logo/badge/dots/shape) são ignorados.
 */
export function renderFromSpec(
  spec: TemplateSpec,
  brand: CardBrand,
  content: TemplateContent,
  legibility?: LegibilityResult,
  opts?: RenderSpecOptions
): string {
  const W = spec.canvas?.w ?? 1080;
  const H = spec.canvas?.h ?? 1350;
  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#7C5CFF";

  const els = [...spec.elements]
    .filter((e) => e.visible !== false)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  const body = els
    .map((el) => {
      switch (el.type) {
        case "headline":
        case "body":
        case "cta":
        case "handleLabel":
        case "wordmark":
          return renderTextElement(el, brand, content, W, H, legibility);
        case "divider":
          return renderDivider(el, brand, W, H, legibility);
        default:
          return ""; // media/logo/badge/dots/shape: futuro
      }
    })
    .join("\n  ");

  const bgRect = opts?.transparentBg ? "" : `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  const overlayRect = opts?.overlay
    ? `<rect width="${W}" height="${H}" fill="${opts.overlay.theme === "dark" ? "#000000" : "#FFFFFF"}" fill-opacity="${opts.overlay.alpha}"/>`
    : "";

  // Rótulo do topo (046) não é elemento do Template Studio — nenhuma spec
  // tem esse tipo, e criar um exigiria mexer no editor. Como é decisão do
  // POST (não do modelo), entra como camada fixa no topo-esquerdo, e só
  // quando existe: sem rótulo, o template sai exatamente como antes.
  const eyebrowText = (brand.eyebrow ?? "").trim().toUpperCase();
  const eyebrowSvg = eyebrowText
    ? `<text x="${Math.round(W * 0.074)}" y="${Math.round(H * 0.068)}" font-family="${brand.fontFamily}" font-weight="400" font-size="24" letter-spacing="2" fill="${brand.markColor || brand.colorAccent || resolveColor("auto", brand, legibility)}" fill-opacity="0.9">${escapeXml(eyebrowText)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${bgRect}
  <rect x="0" y="0" width="${W}" height="14" fill="${accent}"/>
  ${overlayRect}
  ${eyebrowSvg}
  ${body}
</svg>`;
}

/** Override manual por card (Sprint B+, TAREFA B9) — ver CardLayoutOverride. */
export interface TemplateCardOverride {
  /** false esconde wordmark/divisor/rótulo de marca (visible:false neles). */
  showLabel?: boolean;
  /** força a cor do texto, ignorando a escolha automática por contraste. */
  textColor?: "auto" | "light" | "dark";
}

const MARK_ELEMENT_TYPES: TemplateElementType[] = ["wordmark", "divider", "handleLabel"];

/** Elemento de MARCA? Decide se "accent" vira a cor do wordmark (043). */
function isMarkElement(type: TemplateElementType): boolean {
  return MARK_ELEMENT_TYPES.includes(type);
}

/** Clona a spec escondendo os elementos de marca (showLabel:false do override). */
function hideMarkElements(spec: TemplateSpec): TemplateSpec {
  return {
    ...spec,
    elements: spec.elements.map((el) =>
      MARK_ELEMENT_TYPES.includes(el.type) ? { ...el, visible: false } : el
    ),
  };
}

/**
 * Renderiza uma spec como PNG final — sobre uma foto (se `bgImage`) ou
 * sobre o fundo sólido da marca (se `null`). Sobre foto: mede a luminância
 * real (mesmo motor de contraste.ts do resto do pipeline), escolhe tema
 * claro/escuro pro texto e calibra um véu translúcido até bater WCAG 4.5:1
 * — nunca entrega card ilegível. Cor do texto "auto" nos elementos passa
 * a resolver pro tema calculado (via brand.colorText sobrescrito).
 *
 * `override` (B9): showLabel:false esconde a marca só neste card;
 * textColor != "auto" força a cor do texto (e recalibra o véu pra ela),
 * ignorando o tema escolhido automaticamente pela foto.
 */
export async function renderTemplateCardPng(
  spec: TemplateSpec,
  brand: CardBrand,
  content: TemplateContent,
  bgImage: Buffer | null,
  override?: TemplateCardOverride
): Promise<Buffer> {
  const W = spec.canvas?.w ?? 1080;
  const H = spec.canvas?.h ?? 1350;
  const effectiveSpec = override?.showLabel === false ? hideMarkElements(spec) : spec;
  const forcedTextColor =
    override?.textColor && override.textColor !== "auto" ? override.textColor : null;

  if (!bgImage) {
    const brandWithOverride = forcedTextColor
      ? { ...brand, colorText: forcedTextColor === "light" ? "#FFFFFF" : "#111111" }
      : brand;
    return rasterizeSvg(renderFromSpec(effectiveSpec, brandWithOverride, content));
  }

  const resized = await sharp(bgImage).resize(W, H, { fit: "cover", position: "attention" }).toBuffer();
  const luminance = await measureImageLuminance(resized);
  // theme = tom do FUNDO (dark → texto claro); texto claro forçado implica
  // fundo tratado como escuro, e vice-versa — mesma matemática do overlay.
  const theme = forcedTextColor ? (forcedTextColor === "light" ? "dark" : "light") : pickTheme(luminance);
  const textColor = textColorForTheme(theme);
  const alpha = overlayAlphaFor(theme, textColor, luminance);

  const svg = renderFromSpec(
    effectiveSpec,
    { ...brand, colorText: textColor },
    content,
    undefined,
    { transparentBg: true, overlay: { theme, alpha } }
  );
  const overlay = rasterizeSvg(svg);
  return sharp(resized).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
}
