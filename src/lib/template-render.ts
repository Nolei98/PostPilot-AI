// ============================================================
// Renderer dirigido por SPEC (Sprint B+, TAREFA B12). Generaliza o B8:
// desenha cada elemento da `spec` (posição/estilo/binding) em SVG, que
// o resvg rasteriza. É o motor por trás dos presets do Template Studio
// e do editor visual (B14). Ver HANDOFF-overlens-template.md seção 6B.3.
//
// Reusa o pipeline SVG+resvg existente (decisão: sem Satori).
// ============================================================
import { wrapText, type CardBrand } from "@/lib/carousel-render";
import { brandLabelText } from "@/lib/carousel-render";
import type {
  TemplateSpec,
  TemplateElement,
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

/** Resolve uma cor do estilo: auto/accent/bg/text ou hex literal. */
function resolveColor(
  color: string | undefined,
  brand: CardBrand,
  legibility?: LegibilityResult
): string {
  if (!color || color === "auto") {
    if (legibility) return legibility.textColor === "dark" ? "#111111" : "#FFFFFF";
    return brand.colorText || "#FFFFFF";
  }
  if (color === "accent") return brand.colorAccent || "#7C5CFF";
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
  if (bind === "content.cta") return content.cta ?? "DESLIZE PARA VER →";
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

/** Desenha um elemento de texto (headline/body/handleLabel/wordmark/cta). */
function renderTextElement(
  el: TemplateElement,
  brand: CardBrand,
  content: TemplateContent,
  W: number,
  H: number,
  legibility?: LegibilityResult
): string {
  const raw = resolveText(el, brand, content);
  if (!raw) return "";
  const text = el.style?.case === "upper" ? raw.toUpperCase() : raw;
  const x = Math.round((el.offset?.x ?? 0.5) * W);
  const y = Math.round((el.offset?.y ?? 0.5) * H);
  const fontSize = el.size?.fontSize ?? 40;
  const maxWidth = (el.size?.maxWidth ?? 0.84) * W;
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * 0.56)));
  const lineH = Math.round(fontSize * (el.style?.lineHeight ?? 1.15));
  const lines = wrapText(text, maxChars).slice(0, 6);
  const family = el.style?.font === "heading" ? brand.fontFamily : brand.fontFamily;
  const color = resolveColor(el.style?.color, brand, legibility);
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
  const accent = brand.colorAccent || "#7C5CFF";
  const halfText = (wm.length * 22) / 2 + 28;
  const ruleLen = 150;
  return `<line x1="${cx - halfText - ruleLen}" y1="${y}" x2="${cx - halfText}" y2="${y}" stroke="${rule}" stroke-opacity="0.45" stroke-width="1.5"/>
  <line x1="${cx + halfText}" y1="${y}" x2="${cx + halfText + ruleLen}" y2="${y}" stroke="${rule}" stroke-opacity="0.45" stroke-width="1.5"/>
  <text x="${cx}" y="${y + 8}" font-family="${family}" font-weight="600" font-size="26" letter-spacing="6" fill="${accent}" text-anchor="middle">${escapeXml(wm)}</text>`;
}

/**
 * Renderiza uma spec completa em SVG. Fundo sólido da marca por enquanto
 * (background image/gradiente e legibilidade sobre foto entram depois).
 * Elementos não suportados (media/logo/badge/dots/shape) são ignorados.
 */
export function renderFromSpec(
  spec: TemplateSpec,
  brand: CardBrand,
  content: TemplateContent,
  legibility?: LegibilityResult
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

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  <rect x="0" y="0" width="${W}" height="14" fill="${accent}"/>
  ${body}
</svg>`;
}
