// ============================================================
// Geração e composição da arte do post.
//
// 1. Flux (Fal.ai) gera a imagem base a partir do prompt
//    💰 flux/schnell ≈ $0.003/imagem → ~$2/mês no MVP
//    🆓 MOCK: sem FAL_KEY, gera fundo gradiente local com sharp
// 2. sharp compõe o template de marca: gradiente escuro embaixo
//    + hook em texto grande. A imagem BASE (antes do chip/hook) é
//    salva à parte (`{postId}-base.jpg`) para permitir re-renderizar
//    a página depois — ex: o perfil mudou em Ajustes — sem chamar
//    o Flux de novo (sem custo extra).
// 3. Upload no Supabase Storage (bucket público post-images)
//
// Formato: 1080x1350 (4:5) — proporção de feed do Instagram.
// ============================================================
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { GoogleGenAI } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IgProfile, VisualIdentity } from "@/lib/types";
import { FONT_FAMILY } from "@/lib/font-data";
import { rasterizeSvg } from "@/lib/svg-render";

/** font-family usada em todos os <text> do SVG — ver font-data.ts */
const TEXT_FONT = FONT_FAMILY;

const WIDTH = 1080;
const HEIGHT = 1350;

/** Perfil padrão (posts antigos / config ausente) */
const DEFAULT_PROFILE: IgProfile = {
  handle: "seuperfil.ia",
  displayName: "Seu Perfil de IA",
  avatarUrl: null,
  verified: false,
  showProfileChip: true,
};

/**
 * Reforço de realismo aplicado a QUALQUER image_prompt antes de mandar
 * pra qualquer provider (Flux, Gemini, Pollinations) — camada de
 * segurança independente do LLM que gerou o prompt (Claude, Gemini ou
 * um texto editado à mão em Ajustes). Só complementa se o prompt ainda
 * não menciona "photorealistic" (o texto do Claude/Gemini já termina
 * com o wrapper completo — não duplica).
 */
const REALISM_SUFFIX =
  "candid documentary photograph, shot on camera, 85mm lens, shallow depth of field, " +
  "natural window light, realistic skin texture with visible pores, muted natural color " +
  "grading, fine film grain, photorealistic, no CGI look, no AI-art look";

function withRealismSuffix(prompt: string): string {
  return /photorealistic/i.test(prompt) ? prompt : `${prompt}, ${REALISM_SUFFIX}`;
}

/**
 * Gera a imagem base via Flux (Fal.ai). Retorna o buffer PNG/JPEG.
 */
async function fluxGenerate(prompt: string): Promise<Buffer> {
  fal.config({ credentials: process.env.FAL_KEY! });

  // flux/schnell: mais barato e rápido; troque para "fal-ai/flux/dev"
  // se quiser mais qualidade (~10x o preço)
  const result = await fal.subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: { width: WIDTH, height: HEIGHT },
      num_images: 1,
    },
  });

  const imageUrl = (result.data as { images: { url: string }[] }).images[0]
    ?.url;
  if (!imageUrl) throw new Error("Fal.ai não retornou imagem");

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Falha ao baixar imagem: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Gera a imagem base via Gemini 2.5 Flash Image ("nano banana"),
 * alternativa ao Flux quando o usuário escolhe Gemini em Ajustes.
 */
async function geminiGenerateImage(prompt: string): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: prompt,
    config: {
      // Sem isso o modelo pode responder só com texto (recusa/descrição)
      // em vez de gerar a imagem.
      responseModalities: ["IMAGE"],
      // 4:5 = mesma proporção do feed do Instagram (1080x1350). Sem
      // isso o modelo gera em 1:1 e o sharp.resize({fit:"cover"})
      // corta as bordas depois — pedir já no formato certo evita crop.
      imageConfig: { aspectRatio: "4:5" },
    },
  });

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(
      `Gemini não retornou imagem${textPart ? ` (respondeu texto: "${textPart.slice(0, 200)}")` : ""}`
    );
  }
  return Buffer.from(imagePart.inlineData.data, "base64");
}

/**
 * Gera a imagem base via Pollinations.ai — sem key, sem custo.
 * width/height exatos evitam crop (mesma lógica do Gemini acima).
 * Sem key/registro a imagem pode vir com marca d'água deles; se
 * POLLINATIONS_API_KEY estiver setada, manda como Bearer pra tirar
 * a marca e usar o rate limit maior (ver docs.pollinations.ai).
 */
async function pollinationsGenerate(prompt: string): Promise<Buffer> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${WIDTH}&height=${HEIGHT}&model=flux&seed=${seed}` +
    // nologo: sem marca d'água deles | private: não vaza no feed público
    // deles | enhance=false: mantém o prompt como veio (o enhance reescreve
    // via LLM deles e quebra a consistência do wrapper de realismo)
    `&nologo=true&private=true&enhance=false`;

  const apiKey = process.env.POLLINATIONS_API_KEY;
  const res = await fetch(url, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(`Pollinations respondeu ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf).metadata(); // valida que veio uma imagem de verdade (não erro em texto/html)
  return buf;
}

/**
 * Baixa a imagem original da matéria (do feed RSS) para usar como
 * base da arte, em vez de gerar uma nova via Flux. Retorna null em
 * qualquer falha (URL quebrada, timeout, formato inválido) — quem
 * chama cai de volta pro Flux/mock automaticamente.
 */
async function fetchSourceImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Valida que é uma imagem decodificável antes de seguir no pipeline
    await sharp(buf).metadata();
    return buf;
  } catch (err) {
    console.warn(`[image] falha ao baixar imagem da fonte (${url}):`, err);
    return null;
  }
}

/**
 * Mock local: fundo gradiente violeta gerado com SVG → PNG.
 * Zero custo, serve para validar a composição e o pipeline.
 */
async function mockGenerateImage(): Promise<Buffer> {
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1b4b"/>
          <stop offset="50%" stop-color="#4c1d95"/>
          <stop offset="100%" stop-color="#0f0f23"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="540" cy="500" r="260" fill="#7c3aed" opacity="0.25"/>
      <circle cx="300" cy="900" r="180" fill="#a78bfa" opacity="0.15"/>
    </svg>`;
  return rasterizeSvg(svg);
}

/**
 * Quebra o hook em linhas de no máx `maxChars` caracteres,
 * respeitando palavras (para o SVG de texto).
 */
function wrapText(text: string, maxChars: number, maxLines = 4): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

/**
 * Divide texto respeitando quebras MANUAIS (Enter) e TAMBÉM quebra
 * automaticamente linhas longas que estourariam a largura do canvas
 * (uma linha sem Enter mas com texto grande não deve vazar pra fora
 * da imagem). Usado no texto-cima/texto-baixo do slide de fechamento.
 */
function wrapMultiline(
  text: string,
  maxCharsPerLine: number,
  maxTotalLines = 4
): string[] {
  const paragraphs = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [""];

  const allLines: string[] = [];
  for (const para of paragraphs) {
    allLines.push(...wrapText(para, maxCharsPerLine, maxTotalLines));
  }
  return allLines.slice(0, maxTotalLines);
}

// Emoji/pictogramas não existem na fonte Inter embutida (só glifos
// latinos) — sem filtrar, o resvg desenha uma caixa "NO GLYPH" no
// lugar, pior que não ter nada. Cobre os blocos Unicode de emoji
// mais comuns (símbolos, pictogramas, transporte, bandeiras, dingbats).
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

/** Remove emoji (sem glifo na fonte) e escapa caracteres especiais de XML */
function escapeXml(s: string): string {
  return s
    .replace(EMOJI_RE, "")
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ------------------------------------------------------------
// CHIP DE PERFIL (topo do slide)
// Card pequeno e centralizado, com borda tracejada, avatar
// circular, nome em bold + selo azul de verificado e @handle em
// cinza. Ocupa ~33% da largura do canvas, sempre centralizado.
// Reutilizável: retorna camadas para o sharp.composite() — serve
// para qualquer página/slide e escala com a largura do canvas.
// ------------------------------------------------------------

type CompositeLayer = { input: Buffer; top: number; left: number };

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
async function circularAvatar(
  url: string,
  size: number
): Promise<Buffer | null> {
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

/**
 * Monta as camadas do chip de perfil para compor no topo do slide.
 * Largura fixa em 33% do canvas, sempre centralizado horizontalmente,
 * com borda tracejada. Todas as medidas escalam com a largura do
 * canvas (base 1080), então funciona em 1080x1350, 1080x1080 etc.
 */
async function buildProfileChipLayers(
  profile: IgProfile,
  canvasWidth: number
): Promise<CompositeLayer[]> {
  const s = canvasWidth / 1080; // fator de escala

  // Chip ocupa 33% da largura do canvas, sempre centralizado.
  const chipW = Math.round(canvasWidth * 0.33);
  const chipX = Math.round((canvasWidth - chipW) / 2);
  const chipY = Math.round(48 * s); // margem de segurança do topo

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
  const avatarLayer = profile.avatarUrl
    ? await circularAvatar(profile.avatarUrl, avatarSize)
    : null;
  const fallbackAvatarSvg = avatarLayer
    ? ""
    : `<circle cx="${avatarX + avatarSize / 2}" cy="${avatarY + avatarSize / 2}" r="${avatarSize / 2}" fill="url(#avatarGrad)"/>
       <text x="${avatarX + avatarSize / 2}" y="${avatarY + avatarSize / 2 + nameSize * 0.36}"
             font-family="${TEXT_FONT}" font-size="${nameSize}" font-weight="800"
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
      <text x="${textX}" y="${nameY}" font-family="${TEXT_FONT}"
            font-size="${nameSize}" font-weight="800" fill="#ffffff">${escapeXml(name)}</text>
      ${verifiedSvg}
      <text x="${textX}" y="${handleY}" font-family="${TEXT_FONT}"
            font-size="${handleSize}" font-weight="500" fill="#B0B3C0">${escapeXml(handleText)}</text>
    </svg>`;

  const layers: CompositeLayer[] = [
    { input: rasterizeSvg(chipSvg), top: 0, left: 0 },
  ];
  // Avatar raster entra como camada própria, por cima do chip
  if (avatarLayer) {
    layers.push({ input: avatarLayer, top: avatarY, left: avatarX });
  }
  return layers;
}

// Exposto apenas para o teste visual (scripts/test-chip.ts)
export { buildProfileChipLayers as __testBuildProfileChipLayers };

/** Exposto apenas para teste visual (scripts/test-watermark.ts) */
export async function __testComposeTemplate(
  hook: string,
  profile: IgProfile,
  watermark = false
): Promise<Buffer> {
  const base = await mockGenerateImage();
  return composeTemplate(base, hook, profile, watermark);
}

// ------------------------------------------------------------
// MARCA "feito com PostPilot" (plano FREE)
// Pill discreto no rodapé, centralizado — presente nas DUAS
// páginas da arte de quem está no plano gratuito. É o loop viral
// do produto: cada post free publicado divulga o app. Some
// automaticamente no upgrade (o resync re-renderiza sem a marca).
// ------------------------------------------------------------

const WATERMARK_TEXT = "feito com PostPilot";

function buildWatermarkLayer(width: number, height: number): CompositeLayer {
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

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h / 2)}"
            fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.22)" stroke-width="${Math.max(1, Math.round(s))}"/>
      <g transform="translate(${boltX}, ${boltY}) scale(${(bolt / 24).toFixed(3)})">
        <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" fill="#A78BFA"/>
      </g>
      <text x="${textX}" y="${textY}" font-family="${TEXT_FONT}" font-size="${fontSize}"
            font-weight="600" fill="rgba(255,255,255,0.92)">${escapeXml(WATERMARK_TEXT)}</text>
    </svg>`;
  return { input: rasterizeSvg(svg), top: 0, left: 0 };
}

// ------------------------------------------------------------
// CONTRA-CAPA (página 2 do carrossel)
// Fundo de cor sólida + texto-cima (multi-linha) + "COMENTE:"
// opcional (toggle, sem texto livre) + PALAVRA-CHAVE numa caixa +
// texto-baixo (multi-linha) + chip de perfil no topo.
// Ordem vertical: barra → texto-cima → COMENTE: → caixa → texto-baixo.
// Tudo centralizado. Sem Flux — arte 100% local (custo $0).
// ------------------------------------------------------------

/**
 * Renderiza a contra-capa (identidade visual) completa.
 * Escala com a largura do canvas; funciona em 1080x1350 e 1080x1080.
 */
export async function renderTemplateSlide(
  identity: VisualIdentity,
  profile: IgProfile,
  width = WIDTH,
  height = HEIGHT,
  watermark = false
): Promise<Buffer> {
  const s = width / 1080;
  const centerX = width / 2;

  const sideFontSize = Math.round(52 * s);
  const lineHeight = Math.round(sideFontSize * 1.3);

  // Texto-cima e texto-baixo aceitam quebra manual de linha (Enter,
  // configurável em Ajustes ou por post) E quebram automaticamente se
  // uma linha for larga demais para o canvas (evita o texto vazar
  // pra fora da imagem). ~0.60em é a largura média de um caractere
  // maiúsculo em Arial bold com o letter-spacing usado aqui.
  const sideTextMaxWidthPx = width - Math.round(96 * s);
  const sideMaxChars = Math.max(
    6,
    Math.floor(sideTextMaxWidthPx / (sideFontSize * 0.6))
  );
  const topLines = wrapMultiline(identity.topText, sideMaxChars);
  const bottomLines = wrapMultiline(identity.bottomText, sideMaxChars);
  const kwFontSize = Math.round(100 * s);

  const barW = Math.round(120 * s);
  const barH = Math.round(8 * s);

  // Caixa da palavra-chave
  const keyword = identity.keyword.toUpperCase();
  const kwTextW = Math.ceil(keyword.length * kwFontSize * 0.62);
  const boxPadX = Math.round(44 * s);
  const boxPadY = Math.round(20 * s);
  const boxW = Math.min(kwTextW + boxPadX * 2, width - Math.round(96 * s));
  const boxH = kwFontSize + boxPadY * 2;

  // "COMENTE:" — toggle liga/desliga (não é mais texto livre), fica
  // ACIMA da palavra-chave, entre o texto-cima e a caixa.
  const hasCta = identity.ctaEnabled;
  const CTA_LABEL = "COMENTE:";
  const ctaFontSize = Math.round(32 * s);
  const ctaPadX = Math.round(28 * s);
  const ctaPadY = Math.round(14 * s);
  const ctaTextW = Math.ceil(CTA_LABEL.length * ctaFontSize * 0.56);
  const ctaW = Math.min(ctaTextW + ctaPadX * 2, width - Math.round(96 * s));
  const ctaH = ctaFontSize + ctaPadY * 2;

  // Espaçamentos entre os blocos do stack vertical
  const gapBarTop = Math.round(28 * s);
  const gapTopCta = Math.round(28 * s); // texto-cima → CTA
  const gapCtaBox = Math.round(28 * s); // CTA → caixa da palavra-chave
  const gapTopBox = Math.round(36 * s); // texto-cima → caixa (sem CTA)
  const gapBoxBottom = Math.round(72 * s);

  const topBlockH = topLines.length * lineHeight;
  const bottomBlockH = bottomLines.length * lineHeight;

  // Altura total do bloco (barra → texto-baixo), para centralizar
  // tudo verticalmente independente de quantas linhas cada texto tem.
  const stackH =
    barH +
    gapBarTop +
    topBlockH +
    (hasCta ? gapTopCta + ctaH + gapCtaBox : gapTopBox) +
    boxH +
    gapBoxBottom +
    bottomBlockH;

  // Centro um pouco abaixo do meio, deixando espaço pro chip no topo
  let cursorY = Math.round(height * 0.56) - stackH / 2;

  const barY = cursorY;
  cursorY += barH + gapBarTop;

  const topLinesSvg = topLines
    .map((line, i) => {
      const y = cursorY + i * lineHeight + Math.round(sideFontSize * 0.8);
      return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="${TEXT_FONT}" font-size="${sideFontSize}" font-weight="800" fill="${identity.colorText}" letter-spacing="${Math.round(2 * s)}">${escapeXml(line.toUpperCase())}</text>`;
    })
    .join("\n");
  cursorY += topBlockH;

  // "COMENTE:" — logo abaixo do texto-cima, antes da palavra-chave
  let ctaSvg = "";
  if (hasCta) {
    cursorY += gapTopCta;
    const ctaY = cursorY;
    const ctaX = centerX - ctaW / 2;
    ctaSvg = `
      <rect x="${ctaX}" y="${ctaY}" width="${ctaW}" height="${ctaH}"
            rx="${Math.round(ctaH / 2)}" fill="${identity.colorAccent}"/>
      <text x="${centerX}" y="${ctaY + ctaH - ctaPadY - Math.round(ctaFontSize * 0.2)}" text-anchor="middle"
            font-family="${TEXT_FONT}" font-size="${ctaFontSize}" font-weight="800"
            fill="${identity.colorText}">${escapeXml(CTA_LABEL)}</text>`;
    cursorY += ctaH + gapCtaBox;
  } else {
    cursorY += gapTopBox;
  }

  const boxY = cursorY;
  const boxX = centerX - boxW / 2;
  cursorY += boxH + gapBoxBottom;

  const bottomLinesSvg = bottomLines
    .map((line, i) => {
      const y = cursorY + i * lineHeight + Math.round(sideFontSize * 0.8);
      return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="${TEXT_FONT}" font-size="${sideFontSize}" font-weight="800" fill="${identity.colorText}" letter-spacing="${Math.round(2 * s)}">${escapeXml(line.toUpperCase())}</text>`;
    })
    .join("\n");

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- fundo sólido + brilhos sutis de profundidade -->
      <rect width="100%" height="100%" fill="${identity.colorBackground}"/>
      <circle cx="${width * 0.85}" cy="${height * 0.18}" r="${Math.round(260 * s)}"
              fill="${identity.colorAccent}" opacity="0.10"/>
      <circle cx="${width * 0.12}" cy="${height * 0.9}" r="${Math.round(200 * s)}"
              fill="${identity.colorAccent}" opacity="0.08"/>

      <!-- barra de realce -->
      <rect x="${centerX - barW / 2}" y="${barY}" width="${barW}" height="${barH}"
            rx="${Math.round(4 * s)}" fill="${identity.colorAccent}"/>

      <!-- texto em cima (multi-linha) -->
      ${topLinesSvg}

      <!-- "COMENTE:" (toggle) — antes da caixa da palavra-chave -->
      ${ctaSvg}

      <!-- caixa da palavra-chave -->
      <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}"
            rx="${Math.round(24 * s)}" fill="${identity.colorKeywordBox}"/>
      <text x="${centerX}" y="${boxY + boxH - boxPadY - Math.round(kwFontSize * 0.16)}" text-anchor="middle"
            font-family="${TEXT_FONT}" font-size="${kwFontSize}" font-weight="900"
            fill="${identity.colorText}">${escapeXml(keyword)}</text>

      <!-- texto embaixo (multi-linha) -->
      ${bottomLinesSvg}
    </svg>`;

  // Chip de perfil por cima (mesmo componente dos slides normais)
  const layers: CompositeLayer[] = [];
  if (profile.showProfileChip) {
    layers.push(...(await buildProfileChipLayers(profile, width)));
  }
  // Plano free: marca "feito com PostPilot" no rodapé
  if (watermark) {
    layers.push(buildWatermarkLayer(width, height));
  }

  return sharp(rasterizeSvg(svg))
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Renderiza a CONTRA-CAPA (última página do carrossel, com a
 * identidade visual) e sobe no Storage num path próprio
 * (`{postId}-closing.jpg`) — nunca sobrescreve a página de conteúdo
 * (`{postId}.jpg`), que é gerada separadamente por generatePostImage.
 * Usada na geração (modo 'all') e no re-render pós-aprovação/edição.
 * Retorna a URL pública com cache-bust (?v=) para o browser não
 * mostrar uma versão antiga em cache ao re-renderizar.
 */
export async function renderAndUploadTemplateArt(
  postId: string,
  identity: VisualIdentity,
  profile: IgProfile,
  watermark = false
): Promise<string> {
  const final = await renderTemplateSlide(identity, profile, WIDTH, HEIGHT, watermark);

  const supabase = createAdminClient();
  const path = `${postId}-closing.jpg`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, final, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Erro no upload da arte: ${error.message}`);

  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Compõe o template de marca sobre a imagem base: gradiente escuro
 * no rodapé + hook + chip de perfil no topo. O @handle NÃO aparece
 * mais no rodapé — o chip já mostra avatar/nome/@ no topo.
 */
async function composeTemplate(
  baseImage: Buffer,
  hook: string,
  profile: IgProfile,
  watermark = false
): Promise<Buffer> {
  const lines = wrapText(hook, 24);
  const fontSize = 72;
  const lineHeight = 88;
  // Bloco de texto ancorado próximo ao rodapé (sobe um pouco quando
  // há marca d'água do plano free, para não colarem)
  const textBlockBottom = HEIGHT - (watermark ? 140 : 90);
  const firstLineY = textBlockBottom - (lines.length - 1) * lineHeight;

  const textSvg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="40%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="75%" stop-color="#000000" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)"/>
      ${lines
        .map(
          (line, i) =>
            `<text x="60" y="${firstLineY + i * lineHeight}" font-family="${TEXT_FONT}" font-size="${fontSize}" font-weight="900" fill="#ffffff">${escapeXml(line)}</text>`
        )
        .join("\n")}
    </svg>`;

  // Camadas: gradiente+hook embaixo, chip de perfil no topo.
  // Chip fica no topo e o hook no rodapé — não colidem; nenhum
  // offset extra de conteúdo é necessário.
  const layers: CompositeLayer[] = [
    { input: rasterizeSvg(textSvg), top: 0, left: 0 },
  ];
  if (profile.showProfileChip) {
    layers.push(...(await buildProfileChipLayers(profile, WIDTH)));
  }
  // Plano free: marca "feito com PostPilot" no rodapé
  if (watermark) {
    layers.push(buildWatermarkLayer(WIDTH, HEIGHT));
  }

  return sharp(baseImage)
    .resize(WIDTH, HEIGHT, { fit: "cover" })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Pipeline completo: gera base (Flux ou mock) → salva a base à parte
 * (para re-render futuro sem custo) → aplica template → sobe no
 * Supabase Storage → retorna URL pública.
 */
export async function generatePostImage(
  imagePrompt: string,
  hook: string,
  postId: string,
  profile: IgProfile = DEFAULT_PROFILE,
  watermark = false,
  sourceImageUrl: string | null = null,
  imageProvider: "fal" | "gemini" | "pollinations" = "gemini"
): Promise<string> {
  // 1. Imagem base — prioriza a imagem original da matéria (evita
  //    custo de gerar do zero e mantém a foto real da notícia); cai
  //    pro provider escolhido em Ajustes (Gemini, Fal.ai ou
  //    Pollinations) se não tiver imagem-fonte ou o download falhar;
  //    MOCK se faltar key (Fal).
  let base: Buffer | null = sourceImageUrl
    ? await fetchSourceImage(sourceImageUrl)
    : null;
  const prompt = withRealismSuffix(imagePrompt);
  if (!base && imageProvider === "gemini" && process.env.GEMINI_API_KEY) {
    try {
      base = await geminiGenerateImage(prompt);
    } catch (err) {
      console.warn("[image] Gemini falhou ao gerar imagem, caindo pro próximo provider:", err);
    }
  }
  if (!base && imageProvider === "pollinations") {
    try {
      base = await pollinationsGenerate(prompt);
    } catch (err) {
      console.warn("[image] Pollinations falhou ao gerar imagem, caindo pro próximo provider:", err);
    }
  }
  if (!base) {
    if (!process.env.FAL_KEY) {
      console.warn("[image] FAL_KEY ausente — usando MOCK (gradiente local)");
      base = await mockGenerateImage();
    } else {
      base = await fluxGenerate(prompt);
    }
  }

  return composeAndUploadContentImage(base, hook, postId, profile, watermark);
}

/**
 * Compõe (chip + hook) e sobe a página de CONTEÚDO a partir de uma
 * imagem base já pronta — compartilhado entre generatePostImage
 * (base gerada por IA/mock) e applyCustomBaseImage (base enviada
 * manualmente pelo usuário, ex: gerada por fora no nano banana).
 */
async function composeAndUploadContentImage(
  base: Buffer,
  hook: string,
  postId: string,
  profile: IgProfile,
  watermark: boolean
): Promise<string> {
  const supabase = createAdminClient();

  // Guarda a imagem BASE (antes do chip/hook) para permitir
  // re-renderizar a página de conteúdo depois — ex: nome/foto do
  // perfil mudou em Ajustes — sem gerar a base de novo.
  // Best-effort: uma falha aqui não derruba a geração do post.
  try {
    const baseJpeg = await sharp(base).jpeg({ quality: 92 }).toBuffer();
    await supabase.storage
      .from("post-images")
      .upload(`${postId}-base.jpg`, baseJpeg, {
        contentType: "image/jpeg",
        upsert: true,
      });
  } catch (err) {
    console.warn("[image] falha ao salvar base para re-render futuro", err);
  }

  // Template de marca: chip de perfil no topo (se habilitado) + hook
  const final = await composeTemplate(base, hook, profile, watermark);

  // Upload no Storage (bucket público criado na migration)
  const path = `${postId}.jpg`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, final, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Erro no upload da imagem: ${error.message}`);

  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Normaliza uma imagem enviada pelo usuário antes de compor: corrige
 * orientação EXIF (fotos de celular) e reduz para no máx 2000px no
 * maior lado — a página final sai em 1080x1350 de qualquer forma
 * (composeTemplate faz resize "cover"), então não há motivo pra
 * carregar/guardar o arquivo original de 10-20MB de uma foto de
 * celular. Isso permite aceitar uploads grandes sem rejeitar por
 * tamanho: só compactamos em vez de bloquear.
 */
async function normalizeUploadedImage(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
}

/**
 * Aplica uma imagem base ENVIADA PELO USUÁRIO (ex: gerada por fora
 * no Gemini/nano banana a partir do image_prompt do post) — mesmo
 * pipeline de composição (chip + hook) do fluxo automático.
 */
export async function applyCustomBaseImage(
  postId: string,
  hook: string,
  profile: IgProfile,
  watermark: boolean,
  base: Buffer
): Promise<string> {
  const normalized = await normalizeUploadedImage(base);
  return composeAndUploadContentImage(normalized, hook, postId, profile, watermark);
}

/**
 * Re-renderiza APENAS a página de conteúdo (hook + chip) usando a
 * imagem BASE já salva no Storage — sem chamar o Flux de novo, sem
 * custo. Usada para manter os posts na fila sincronizados sempre que
 * o perfil (foto/nome/@/selo) é salvo em Ajustes.
 * Retorna `null` se o post não tem base salva (gerado antes desta
 * função existir) — nesse caso a página de conteúdo não é atualizada,
 * mas a página de fechamento (se houver) continua sincronizando normalmente.
 */
export async function regenerateContentImage(
  postId: string,
  hook: string,
  profile: IgProfile,
  watermark = false
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("post-images")
    .download(`${postId}-base.jpg`);
  if (error || !data) return null;

  const baseBuffer = Buffer.from(await data.arrayBuffer());
  const final = await composeTemplate(baseBuffer, hook, profile, watermark);

  const path = `${postId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("post-images")
    .upload(path, final, { contentType: "image/jpeg", upsert: true });
  if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${pub.publicUrl}?v=${Date.now()}`;
}
