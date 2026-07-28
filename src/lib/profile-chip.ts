// ============================================================
// CHIP DE PERFIL (avatar + nome + @handle), reutilizável em qualquer
// slide/página: posts single (image.ts) e carrossel (carousel-render.ts).
// Extraído pra módulo próprio pra evitar import circular entre os dois
// (carousel-render.ts usa o chip; image.ts vai usar o buildCoverSvg do
// carousel-render.ts — se o chip continuasse em image.ts, os dois
// arquivos importariam um do outro).
//
// Card com borda tracejada, avatar circular (foto real ou gradiente com
// iniciais), nome em bold + selo de verificado + @handle em cinza.
// Retorna camadas prontas para sharp.composite(); escala com a largura
// do canvas (base 1080), então funciona em 1080x1350, 1080x1080 etc.
// ============================================================
import sharp from "sharp";
import { rasterizeSvg } from "@/lib/svg-render";
import { FONT_FAMILY } from "@/lib/font-data";
import type { IgProfile } from "@/lib/types";

export type CompositeLayer = { input: Buffer; top: number; left: number };

// Emoji/pictogramas não existem na fonte Inter embutida (só glifos
// latinos) — sem filtrar, o resvg desenha uma caixa "NO GLYPH" no lugar.
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

function escapeXml(s: string): string {
  return s
    .replace(EMOJI_RE, "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Gradiente de marca usado no avatar de fallback (iniciais)
const AVATAR_GRADIENT_FROM = "#8B6BFF";
const AVATAR_GRADIENT_TO = "#4C1D95";

/** Iniciais do nome para o fallback de avatar (máx 2 letras) */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
  return chars.toUpperCase();
}

/**
 * Trunca texto com reticências para caber em `maxWidthPx`, usando a
 * mesma estimativa de largura de caractere do resto do chip (Arial:
 * ~0.58em bold, ~0.52em regular). Sem isso, nomes/handles longos
 * (ex: bio completa do Instagram) estouram a caixa do chip.
 */
function truncateToWidth(
  text: string,
  fontSize: number,
  emFactor: number,
  maxWidthPx: number
): string {
  const charW = fontSize * emFactor;
  if (text.length * charW <= maxWidthPx) return text;
  const maxChars = Math.max(1, Math.floor(maxWidthPx / charW) - 1); // -1 para o "…"
  return text.slice(0, maxChars).trimEnd() + "…";
}

/** Baixa e recorta o avatar em círculo. Retorna null se falhar. */
async function circularAvatar(url: string, size: number): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    // Máscara circular via SVG (blend dest-in mantém só o círculo)
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
    return await sharp(raw)
      .resize(size, size, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null; // fallback de iniciais assume
  }
}

/** Onde o avatar raster entra por cima do SVG do chip (coords do canvas). */
export interface ChipAvatarSlot {
  x: number;
  y: number;
  size: number;
}

export interface ChipMarkup {
  svg: string;
  /** null quando o perfil não tem foto — o SVG já traz as iniciais. */
  avatar: ChipAvatarSlot | null;
}

export interface ChipOptions {
  position?: "top-center" | "bottom-left";
  /** Altura do canvas — obrigatório pra calcular a margem inferior em "bottom-left". */
  canvasHeight?: number;
  /** Largura do chip em % do canvas (default 33%, "bottom-left" usa algo mais compacto). */
  widthPercent?: number;
}

/**
 * SVG do chip de perfil — PURO: sem sharp, sem rede, sem rasterizar.
 * Devolve também onde o avatar entra, pra quem for compor de verdade
 * (buildProfileChipLayers) ou pro preview da Fila desenhar um <img> ali.
 *
 * Existe separado porque o preview roda no browser: se ele recalculasse a
 * geometria do chip por conta própria, chip do preview e chip da arte
 * final divergiriam na primeira mudança que alguém fizesse aqui.
 */
export function buildProfileChipSvg(
  profile: IgProfile,
  canvasWidth: number,
  fontFamily: string = FONT_FAMILY,
  opts: ChipOptions = {}
): ChipMarkup {
  const position = opts.position ?? "top-center";
  const s = canvasWidth / 1080; // fator de escala
  const canvasHeight = opts.canvasHeight ?? Math.round(canvasWidth * 1.25);

  const chipW = Math.round(canvasWidth * (opts.widthPercent ?? 0.33));
  const margin = Math.round(60 * s);

  // Medidas internas (px @1080, escalonadas)
  const pad = Math.round(14 * s);
  const avatarSize = Math.round(60 * s);
  const gap = Math.round(10 * s);
  const nameSize = Math.round(23 * s);
  const handleSize = Math.round(17 * s);
  const badgeR = Math.round(10 * s); // raio do selo azul
  const radius = Math.round(18 * s); // corner radius do card
  const borderW = Math.max(1.4, Math.round(1.6 * s * 10) / 10);
  const dashLen = Math.round(5 * s);
  const dashGap = Math.round(4 * s);

  const chipH = pad * 2 + avatarSize;
  const chipX = position === "bottom-left" ? margin : Math.round((canvasWidth - chipW) / 2);
  const chipY = position === "bottom-left" ? canvasHeight - margin - chipH : Math.round(48 * s);

  const rawName = profile.displayName || "Seu Perfil";
  const rawHandle = `@${profile.handle}`;
  const badgeW = profile.verified ? badgeR * 2 + Math.round(8 * s) : 0;

  // Espaço disponível para nome/handle dentro do chip (33% fixo) —
  // nomes longos truncam com reticências em vez de estourar o card.
  const maxTextW = chipW - pad * 2 - avatarSize - gap;
  const name = truncateToWidth(rawName, nameSize, 0.58, maxTextW - badgeW);
  const handleText = truncateToWidth(rawHandle, handleSize, 0.52, maxTextW);
  const nameW = Math.ceil(name.length * nameSize * 0.58);

  // Posições internas (coordenadas do canvas)
  const avatarX = chipX + pad;
  const avatarY = chipY + pad;
  const textX = avatarX + avatarSize + gap;
  const nameY = avatarY + Math.round(avatarSize * 0.42); // baseline do nome
  const handleY = avatarY + Math.round(avatarSize * 0.85); // baseline do @

  // Selo de verificado: círculo azul + check branco, após o nome
  const badgeCx = Math.min(
    textX + nameW + Math.round(8 * s) + badgeR,
    chipX + chipW - pad - badgeR
  );
  const badgeCy = nameY - Math.round(nameSize * 0.32);
  const check = badgeR * 0.5;
  const verifiedSvg = profile.verified
    ? `<circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="#3897F0"/>
       <path d="M ${badgeCx - check} ${badgeCy} l ${check * 0.7} ${check * 0.7} l ${check * 1.2} -${check * 1.3}"
             stroke="#ffffff" stroke-width="${Math.max(2.2, Math.round(3.5 * s))}" fill="none"
             stroke-linecap="round" stroke-linejoin="round"/>`
    : "";

  // Avatar: imagem real (circular, com anel sutil) ou fallback em
  // gradiente de marca com as iniciais do nome.
  const fallbackAvatarSvg = profile.avatarUrl
    ? ""
    : `<circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2}" fill="url(#avatarGrad)"/>
       <text x="${avatarX + avatarSize / 2}" y="${avatarY + avatarSize / 2 + nameSize * 0.36}"
             font-family="${fontFamily}" font-size="${nameSize}" font-weight="800"
             fill="#ffffff" text-anchor="middle">${escapeXml(initials(name))}</text>`;

  // SVG do chip: fundo escuro semitransparente + borda tracejada +
  // sombra sutil + textos. Card menor e mais elegante que a versão
  // anterior (largura fixa em 33%, sempre centralizado).
  const chipSvg = `
    <svg width="${canvasWidth}" height="${chipY + chipH + Math.round(8 * s)}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="chipShadow" x="-30%" y="-30%" width="160%" height="200%">
          <feDropShadow dx="0" dy="${Math.round(3 * s)}" stdDeviation="${Math.round(6 * s)}" flood-color="#000000" flood-opacity="0.4"/>
        </filter>
        <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${AVATAR_GRADIENT_FROM}"/>
          <stop offset="100%" stop-color="${AVATAR_GRADIENT_TO}"/>
        </linearGradient>
      </defs>
      <rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}"
            rx="${radius}" fill="rgba(15,15,20,0.82)" filter="url(#chipShadow)"/>
      <rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}"
            rx="${radius}" fill="none" stroke="rgba(255,255,255,0.4)"
            stroke-width="${borderW}" stroke-dasharray="${dashLen},${dashGap}"/>
      ${fallbackAvatarSvg}
      <circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2}"
              fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="${Math.max(1, Math.round(1.5 * s))}"/>
      <text x="${textX}" y="${nameY}" font-family="${fontFamily}"
            font-size="${nameSize}" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>
      ${verifiedSvg}
      <text x="${textX}" y="${handleY}" font-family="${fontFamily}"
            font-size="${handleSize}" font-weight="500" fill="#B0B3C0">${escapeXml(handleText)}</text>
    </svg>`;

  return {
    svg: chipSvg,
    avatar: profile.avatarUrl ? { x: avatarX, y: avatarY, size: avatarSize } : null,
  };
}

/**
 * Monta as camadas do chip de perfil para compor em qualquer slide.
 * position "top-center" (default, posts single) ou "bottom-left"
 * (fechamento do carrossel — mesma margem da trilha de ícones).
 */
export async function buildProfileChipLayers(
  profile: IgProfile,
  canvasWidth: number,
  fontFamily: string = FONT_FAMILY,
  opts: ChipOptions = {}
): Promise<CompositeLayer[]> {
  const { svg, avatar } = buildProfileChipSvg(profile, canvasWidth, fontFamily, opts);
  // Baixar a foto pode falhar (URL morta, host fora do ar) — nesse caso o
  // SVG precisa ser remontado COM as iniciais, senão sobra o buraco do
  // avatar que nunca chegou.
  const avatarLayer = avatar ? await circularAvatar(profile.avatarUrl!, avatar.size) : null;
  if (avatar && !avatarLayer) {
    const fallback = buildProfileChipSvg(
      { ...profile, avatarUrl: null },
      canvasWidth,
      fontFamily,
      opts
    );
    return [{ input: rasterizeSvg(fallback.svg), top: 0, left: 0 }];
  }

  const layers: CompositeLayer[] = [{ input: rasterizeSvg(svg), top: 0, left: 0 }];
  if (avatarLayer && avatar) {
    layers.push({ input: avatarLayer, top: avatar.y, left: avatar.x });
  }
  return layers;
}
