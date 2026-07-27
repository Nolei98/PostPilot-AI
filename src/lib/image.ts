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
import type { BrandTemplate, IgProfile, VisualIdentity } from "@/lib/types";
import { FONT_FAMILY } from "@/lib/font-data";
import { rasterizeSvg } from "@/lib/svg-render";
import { videoIdentityFor, MONO_FONT, type BrandRowKind } from "@/lib/render-shared";
import { searchStockPhoto, fetchStockPhotoBuffer } from "@/lib/stock-photos";
import { buildProfileChipLayers } from "@/lib/profile-chip";
import { buildCoverSvg, composePhotoBg, coverHeadlineSize, stripEmoji, wrapText, brandLabelText, type CardBrand } from "@/lib/carousel-render";
import { buildBrutalismCoverSvg } from "@/lib/layout-brutalism";
import { buildSerifLuxeCoverSvg } from "@/lib/layout-serif-luxe";
import { buildSwissMonoCoverSvg } from "@/lib/layout-swiss-mono";
import { buildPopCreatorCoverSvg } from "@/lib/layout-pop-creator";
import { buildCenteredPhraseSvg } from "@/lib/layout-centered";

/** Construtor de capa/fechamento de cada preset de layout ALTERNATIVO
 * (Fase 3) — mesma assinatura (headline, brand, transparent, opts) →
 * {svg, blurBandTop}, despachado por tabela a partir de layout_preset. */
const ALT_COVER_BUILDERS: Partial<Record<NonNullable<CardBrand["layoutPreset"]>, typeof buildBrutalismCoverSvg>> = {
  brutalism: buildBrutalismCoverSvg,
  "serif-luxe": buildSerifLuxeCoverSvg,
  "swiss-mono": buildSwissMonoCoverSvg,
  "pop-creator": buildPopCreatorCoverSvg,
};

/** Dispatcher único da PÁGINA 1 do post único — 2 variações (kit v2 §3),
 * ortogonais ao layoutPreset (que decide a tipografia):
 * - "centered" (fonte no meio): frase curta centralizada, minimalista,
 *   sem wordmark/marca — mesmo em qualquer preset de layout.
 * - "cover" (estilo capa, default): mesma função usada pela contra-capa
 *   (fetchIdentityLabel já existia) — wordmark + título display, herda
 *   os 5 layouts (Editorial Noir OU um dos 4 alternativos), sem chip
 *   (decisão do usuário — igual à capa do carrossel). */
function buildPageOneCoverSvg(
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
  if (alt) return alt(headline, cardBrand, transparent, { ...opts, showActionIcons: false });
  // align NÃO é forçado aqui de propósito — herda o default de buildCoverSvg
  // ("bottom"), pra ficar EXATAMENTE igual à capa do carrossel (post único
  // e vídeo/Reels usam este mesmo builder). Estava fixo em "center" antes,
  // contradizendo o próprio comentário da função ("igual à capa do
  // carrossel") — bug real, não decisão de design.
  return buildCoverSvg({ idx: 0, role: "hook", headline, body: "" }, cardBrand, transparent, {
    showSwipeHint: opts.showSwipeHint,
    overlay: opts.overlay,
    showActionIcons: false,
  });
}

import {
  pickTheme,
  textColorForTheme,
  needsOverlay,
  relativeLuminanceOfHex,
  measureImageLuminance,
  overlayAlphaFor,
  buildOverlayGradientSvg,
} from "@/lib/contrast";

/** Template de marca default (posts antigos / config ausente) */
const DEFAULT_BRAND: BrandTemplate = { logoUrl: null, showLogo: true, fontFamily: FONT_FAMILY };

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

type CompositeLayer = { input: Buffer; top: number; left: number };

/** Baixa e recorta uma imagem em círculo (avatar do chip, logo da marca). */
async function circularAvatar(url: string, size: number): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
    return await sharp(raw)
      .resize(size, size, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

// Chip de perfil (avatar + nome + @handle) mora em profile-chip.ts —
// reexportado aqui pra não quebrar quem já importava daqui (evita import
// circular com carousel-render.ts, que também usa o chip e agora é usado
// POR image.ts, na contra-capa unificada).
export { buildProfileChipLayers };
// Exposto apenas para o teste visual (scripts/test-chip.ts)
export { buildProfileChipLayers as __testBuildProfileChipLayers };

/** Exposto apenas para teste visual (scripts/test-watermark.ts) */
export async function __testComposeTemplate(
  hook: string,
  _profile: IgProfile,
  watermark = false
): Promise<Buffer> {
  const base = await mockGenerateImage();
  const cardBrand: CardBrand = {
    colorBackground: "#0B0B12",
    colorAccent: "#7C5CFF",
    colorText: "#FFFFFF",
    fontFamily: FONT_FAMILY,
    brandName: null,
    wordmark: "POSTPILOT®",
  };
  const jpeg = await composeCoverStyleContent(base, hook, cardBrand);
  if (!watermark) return jpeg;
  return sharp(jpeg).composite([buildWatermarkLayer(WIDTH, HEIGHT)]).jpeg({ quality: 90 }).toBuffer();
}

/** Exposto apenas para QA visual (debug route) — testa a PÁGINA 1 sobre
 * uma foto de verdade (não mock), com o preset de layout escolhido. */
export async function __testPageOneCover(
  hook: string,
  layoutPreset: NonNullable<CardBrand["layoutPreset"]>,
  photo: Buffer,
  singlePostStyle: CardBrand["singlePostStyle"] = "cover"
): Promise<Buffer> {
  const cardBrand: CardBrand = {
    colorBackground: "#0B0B12",
    colorAccent: "#E11D2A",
    colorText: "#FFFFFF",
    fontFamily: FONT_FAMILY,
    brandName: "Debug",
    wordmark: "POSTPILOT®",
    handle: "debug.ia",
    keywords: ["DESIGN", "IA"],
    layoutPreset,
    singlePostStyle,
  };
  return composeCoverStyleContent(photo, hook, cardBrand);
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
      <text x="${textX}" y="${textY}" font-family="${FONT_FAMILY}" font-size="${fontSize}"
            font-weight="600" fill="rgba(255,255,255,0.92)">${escapeXml(WATERMARK_TEXT)}</text>
    </svg>`;
  return { input: rasterizeSvg(svg), top: 0, left: 0 };
}

/**
 * Badge circular com a LOGO da marca (Template da marca, Ajustes) —
 * canto superior direito, discreto, nas duas páginas do carrossel.
 * Reaproveita o mesmo recorte circular do avatar do chip. Sem logo
 * configurada, não desenha nada (layers vazio).
 */
async function buildLogoLayer(
  logoUrl: string | null,
  width: number
): Promise<CompositeLayer | null> {
  if (!logoUrl) return null;
  const s = width / 1080;
  const size = Math.round(64 * s);
  const margin = Math.round(40 * s);
  const circle = await circularAvatar(logoUrl, size);
  if (!circle) return null;
  const ring = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none"
              stroke="rgba(255,255,255,0.5)" stroke-width="${Math.max(1, Math.round(1.5 * s))}"/>
    </svg>`
  );
  const withRing = await sharp(circle)
    .composite([{ input: ring, top: 0, left: 0 }])
    .png()
    .toBuffer();
  return { input: withRing, top: margin, left: width - size - margin };
}

// ------------------------------------------------------------
// CONTRA-CAPA (página 2 do post single)
// Usa o MESMO motor da capa/fechamento do carrossel (buildCoverSvg):
// divisor com wordmark, headline grande centralizada, corpo de apoio,
// chip no canto inferior esquerdo, ícones (curtir/repostar/compartilhar/
// salvar) no canto inferior direito — "layout único pra todos" em vez de
// um sistema à parte de texto-cima/CTA/palavra-chave-em-caixa/texto-baixo.
//
// Mapeamento do modelo antigo (Ajustes ainda usa esses campos) pro novo:
// palavra-chave → headline (era o elemento mais forte visualmente, essa
// continua sendo); texto-cima + texto-baixo → corpo de apoio. O "COMENTE:"
// (CTA) não tem equivalente direto no novo layout — vira parte do corpo.
// Sem Flux — arte 100% local (custo $0).
// ------------------------------------------------------------

/**
 * Renderiza a contra-capa (identidade visual) completa. Canvas fixo
 * 1080x1350 (mesmo do carrossel) — os parâmetros width/height só
 * escalam a arte final se algum chamador pedir outro tamanho.
 */
export async function renderTemplateSlide(
  identity: VisualIdentity,
  profile: IgProfile,
  width = WIDTH,
  height = HEIGHT,
  watermark = false,
  brand: BrandTemplate = DEFAULT_BRAND,
  label: {
    wordmark?: string | null;
    handle?: string | null;
    layoutPreset?: CardBrand["layoutPreset"];
  } | null = null
): Promise<Buffer> {
  const fontFamily = brand.fontFamily;

  // Contraste automático (contrast.ts): a cor de texto configurada em
  // Ajustes só é respeitada se já tiver contraste suficiente contra o
  // fundo; senão troca pra cor segura do tema — nunca entrega um slide
  // ilegível, mesmo que o usuário tenha escolhido uma combinação ruim.
  const bgLuminance = relativeLuminanceOfHex(identity.colorBackground);
  const theme = pickTheme(bgLuminance);
  const textColor = needsOverlay(identity.colorText, bgLuminance)
    ? textColorForTheme(theme)
    : identity.colorText;

  // Palavra-chave era o elemento mais forte (caixa colorida, fonte
  // gigante) — vira a headline grande do novo layout. Texto-cima +
  // texto-baixo (+ o CTA "COMENTE:", sem equivalente visual direto)
  // viram o corpo de apoio.
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
    wordmark: label?.wordmark ?? null,
    handle: label?.handle ?? null,
    keywords: null,
    brandMark: "wordmark",
  };

  // Preset de layout (Fase 3): mesmo motor de contraste acima, só troca
  // qual construtor de SVG desenha a contra-capa.
  const altCoverBuilder = label?.layoutPreset ? ALT_COVER_BUILDERS[label.layoutPreset] : undefined;
  const svg = altCoverBuilder
    ? altCoverBuilder(headline, cardBrand, false, {
        showSwipeHint: false,
        body,
        eyebrowRight: "OBRIGADO",
        overlay: { theme, alpha: 0 }, // sinaliza "fechamento" → mostra os ícones
      }).svg
    : buildCoverSvg(
        { idx: 0, role: "hook", headline, body: body ?? "" },
        cardBrand,
        false,
        { showSwipeHint: false, body, align: "center", showActionIcons: true }
      ).svg;

  // Chip de perfil no canto inferior esquerdo (mesma margem dos ícones).
  const layers: CompositeLayer[] = [];
  if (profile.showProfileChip) {
    layers.push(
      ...(await buildProfileChipLayers(profile, width, fontFamily, {
        position: "bottom-left",
        canvasHeight: height,
        widthPercent: 0.3,
      }))
    );
  }
  const logoLayer = brand.showLogo ? await buildLogoLayer(brand.logoUrl, width) : null;
  if (logoLayer) layers.push(logoLayer);
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
/** Busca wordmark/@handle/preset de layout do Brand Kit do cliente do
 * post (best-effort — nunca quebra o render da contra-capa por causa
 * disso). */
async function fetchIdentityLabel(postId: string): Promise<{
  wordmark: string | null;
  handle: string | null;
  layoutPreset: CardBrand["layoutPreset"];
} | null> {
  try {
    const supabase = createAdminClient();
    const { data: post } = await supabase
      .from("posts")
      .select("client_id")
      .eq("id", postId)
      .maybeSingle();
    if (!post?.client_id) return null;
    const { data: bk } = await supabase
      .from("brand_kits")
      .select("wordmark, ig_handle, layout_preset")
      .eq("client_id", post.client_id)
      .maybeSingle();
    if (!bk) return null;
    return {
      wordmark: (bk.wordmark as string | null) ?? null,
      handle: (bk.ig_handle as string | null) ?? null,
      layoutPreset: (bk.layout_preset as CardBrand["layoutPreset"]) ?? "editorial-noir",
    };
  } catch {
    return null;
  }
}

/** Busca o CardBrand completo (cores + rótulo + preset de layout) do
 * cliente do post — usado pela PÁGINA 1 (hook sobre a foto), que agora
 * herda os 5 layouts igual à capa do carrossel e à contra-capa.
 * Best-effort: nunca quebra a geração por causa disso (cai no default
 * Editorial Noir com as cores neutras). */
async function fetchCoverBrand(postId: string, fontFamily: string): Promise<CardBrand> {
  const fallback: CardBrand = {
    colorBackground: "#0B0B12",
    colorAccent: "#7C5CFF",
    colorText: "#FFFFFF",
    fontFamily,
    brandName: null,
  };
  try {
    const supabase = createAdminClient();
    const { data: post } = await supabase
      .from("posts")
      .select("client_id")
      .eq("id", postId)
      .maybeSingle();
    if (!post?.client_id) return fallback;
    const { data: bk } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("client_id", post.client_id)
      .maybeSingle();
    if (!bk) return fallback;
    return {
      colorBackground: (bk.color_background as string | null) ?? fallback.colorBackground,
      colorAccent: (bk.color_accent as string | null) ?? fallback.colorAccent,
      colorText: (bk.color_text as string | null) ?? fallback.colorText,
      fontFamily,
      brandName: (bk.brand_name as string | null) ?? null,
      wordmark: (bk.wordmark as string | null) ?? null,
      handle: (bk.ig_handle as string | null) ?? null,
      keywords: (bk.keywords as string[] | null) ?? null,
      brandMark: (bk.brand_mark as CardBrand["brandMark"]) ?? "auto",
      layoutPreset: (bk.layout_preset as CardBrand["layoutPreset"]) ?? "editorial-noir",
      singlePostStyle: (bk.single_post_style as CardBrand["singlePostStyle"]) ?? "cover",
    };
  } catch {
    return fallback;
  }
}

/**
 * Compõe a PÁGINA 1 (hook sobre a foto) usando o MESMO motor de layouts
 * da capa do carrossel/contra-capa: mede a luminância REAL da banda de
 * identidade, escolhe tema claro/escuro + overlay calibrado (contrast.ts),
 * desenha wordmark + headline no preset de layout escolhido em Ajustes.
 * Sem chip (decisão do usuário — igual à capa do carrossel, o Instagram
 * já mostra o perfil por cima do post).
 */
async function composeCoverStyleContent(baseImage: Buffer, hook: string, cardBrand: CardBrand): Promise<Buffer> {
  const probe = buildPageOneCoverSvg(hook, { ...cardBrand, colorText: "#FFFFFF" }, true, { showSwipeHint: false });
  const covered = await sharp(baseImage).resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" }).toBuffer();
  const band = await sharp(covered)
    .extract({ left: 0, top: probe.blurBandTop, width: WIDTH, height: HEIGHT - probe.blurBandTop })
    .toBuffer();
  const luminance = await measureImageLuminance(band);
  const theme = pickTheme(luminance);
  const textColor = textColorForTheme(theme);
  const alpha = overlayAlphaFor(theme, textColor, luminance);
  // Meta-linha do topo dos 4 layouts alternativos (fora da banda de
  // identidade) — mesma checagem de contraste LOCAL de renderAltLayoutCard
  // (carousel-render.ts); sem efeito no Editorial Noir (não tem topRow).
  const topBand = await sharp(covered).extract({ left: 0, top: 0, width: WIDTH, height: 140 }).toBuffer();
  const topLuminance = await measureImageLuminance(topBand);
  const topAlpha = overlayAlphaFor(theme, textColor, topLuminance);
  const { svg, blurBandTop } = buildPageOneCoverSvg(hook, { ...cardBrand, colorText: textColor }, true, {
    showSwipeHint: false,
    overlay: { theme, alpha },
    topOverlay: { theme, alpha: topAlpha },
  });
  const png = await composePhotoBg(baseImage, svg, blurBandTop);
  return sharp(png).jpeg({ quality: 90 }).toBuffer();
}

// ------------------------------------------------------------
// REELS 9:16 (Fase 4, kit v2 §3 → redesenhado 2026-07-23 pra bater com
// o protótipo de referência, exemplo-modelos-com-video.png caso 3).
//
// O vídeo cobre o quadro 1080×1920 NATIVO INTEIRO (cover-fit) — não
// mais "encaixa a capa 4:5 pela largura + extensão desfocada no topo".
// O texto (marca pequena no topo-esquerda + título alinhado à
// esquerda) fica dentro de uma ZONA SEGURA que deixa espaço pros
// elementos nativos do Instagram (legenda/@ embaixo, ícones de
// curtir/comentar/compartilhar à direita) — nunca centralizado.
// ------------------------------------------------------------
const REELS_W = 1080;
const REELS_H = 1920;
/** Margem esquerda (mesma ideia de "padding" dos layouts) e direita —
 * a direita é bem maior pra não invadir a coluna de ícones do IG. */
const REELS_SAFE_MARGIN_X = 64;
const REELS_SAFE_MARGIN_RIGHT = 170;
/** Distância da base do quadro até a baseline da última linha — deixa
 * espaço pra legenda/@ que o próprio Instagram desenha por cima. */
const REELS_SAFE_BOTTOM = 220;
/** Divisor (———WORDMARK®———) → título, gap fixo entre a baseline do
 * divisor e a 1ª linha do título — mesma ideia "grudados" da capa/vídeo
 * feed (2026-07-24: a marca saiu do canto-topo isolado e veio pra perto
 * do título, exatamente como nos outros modelos de vídeo). */
const REELS_DIVIDER_GAP = 50;

/**
 * Constrói só o OVERLAY de texto (PNG transparente 1080×1920 — divisor
 * (———WORDMARK®———) + título juntos, alinhados dentro da zona segura
 * inferior) pro Reels de VÍDEO — o ffmpeg faz a composição final sobre
 * o vídeo (video.ts), não o sharp. Regra do kit: a luminância/contraste
 * vem do FRAME DE PÔSTER (posterFrame) — mede exatamente a região da
 * zona segura (onde o texto realmente vai), não a foto/vídeo inteiro.
 */
export async function buildReelsVideoOverlayPng(
  headline: string,
  cardBrand: CardBrand,
  posterFrame: Buffer
): Promise<Buffer> {
  // Identidade do PRESET de layout (tipografia + assinatura da marca):
  // sem isso os três formatos de vídeo saíam idênticos em qualquer
  // preset, enquanto o carrossel mudava — ver videoIdentityFor().
  const identity = videoIdentityFor(cardBrand.layoutPreset, cardBrand.fontFamily);
  const { family, weight: displayWeight } = identity.display;
  const labelFamily = identity.labelFont === "mono" ? MONO_FONT : family;
  const accent = cardBrand.colorAccent || "#7C5CFF";
  const wm = (cardBrand.wordmark || cardBrand.brandName || "").toUpperCase();

  const headlineText = stripEmoji(headline ?? "");
  const { size, lineH, maxChars } = coverHeadlineSize(headlineText);
  const safeWidth = REELS_W - REELS_SAFE_MARGIN_X - REELS_SAFE_MARGIN_RIGHT;
  // A zona segura é mais estreita que a capa 4:5 inteira — reduz o nº
  // de caracteres por linha na mesma proporção pra não estourar a
  // largura reservada (mesma fonte, só quebra mais cedo).
  const safeMaxChars = Math.max(8, Math.round(maxChars * (safeWidth / (WIDTH - 180))));
  const lines = wrapText(headlineText, safeMaxChars).slice(0, 5);

  const lastBaselineY = REELS_H - REELS_SAFE_BOTTOM;
  const headStartY = lastBaselineY - (lines.length - 1) * lineH;
  // Divisor gruda no título — mesma conta de "gap escala com o tamanho
  // da fonte" já usada na capa (carousel-render.ts).
  const dividerY = headStartY - Math.round(REELS_DIVIDER_GAP + size * 0.6);
  const zoneTop = Math.max(0, dividerY - 40);

  // Mede a luminância REAL da zona segura (divisor + título juntos, já
  // cover-fit igual ao vídeo final) — não a foto/vídeo inteiro.
  const covered = await sharp(posterFrame).resize(REELS_W, REELS_H, { fit: "cover", position: "attention" }).toBuffer();
  const zoneCrop = await sharp(covered)
    .extract({ left: REELS_SAFE_MARGIN_X, top: zoneTop, width: safeWidth, height: REELS_H - zoneTop })
    .toBuffer();
  const luminance = await measureImageLuminance(zoneCrop);
  const theme = pickTheme(luminance);
  const textColor = textColorForTheme(theme);
  const alpha = overlayAlphaFor(theme, textColor, luminance);

  // Gradiente de legibilidade (mesmo motor de contrast.ts) cobrindo a
  // zona segura inferior inteira — divisor + título já entram juntos
  // na mesma banda, sem precisar de placa separada pra marca.
  const scrim = buildOverlayGradientSvg("reels-safezone", zoneTop, REELS_H - zoneTop, REELS_W, theme, alpha, "bottom");

  // Assinatura da marca no estilo do preset (filete, bloco, barra ou
  // cápsula) — o Reels mantém a geometria de zona segura de 2026-07-23;
  // o que muda por preset é a identidade, não o enquadramento.
  const dividerSvg = brandRowSvg({
    kind: identity.brandRow,
    text: wm,
    x: REELS_SAFE_MARGIN_X,
    y: dividerY + 6,
    width: safeWidth,
    textColor,
    accent,
    labelFamily,
    fontSize: 20,
  });
  const headlineSvg = `<text font-family="${family}" font-weight="${displayWeight}" font-size="${size}" fill="${textColor}" text-anchor="start" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(lines, REELS_SAFE_MARGIN_X, headStartY, lineH)}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${REELS_W}" height="${REELS_H}" viewBox="0 0 ${REELS_W} ${REELS_H}">
  ${scrim}
  ${dividerSvg}
  ${headlineSvg}
</svg>`;
  return rasterizeSvg(svg);
}

/** Retângulo do vídeo dentro do quadro feed (4:5) — TAMANHO YOUTUBE
 * (16:9), como uma "moldurinha" própria, nunca o quadro inteiro (ver
 * editorial-noir-prototype.html, seção 06 "Modelos com vídeo": o vídeo
 * é um retângulo com cantos arredondados dentro do card, texto abaixo,
 * NUNCA colado nas bordas). Margem lateral igual ao `pad` da capa
 * (90px) — a mesma margem segura usada em todo o resto do sistema. */
export interface FeedVideoFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

const FEED_FRAME_MARGIN_X = 90;
const FEED_FRAME_W = WIDTH - FEED_FRAME_MARGIN_X * 2;
const FEED_FRAME_H = Math.round((FEED_FRAME_W * 9) / 16); // 16:9, "tamanho YouTube"
const FEED_FRAME_RADIUS = 32;
/** Vídeo em cima, divisor+título juntos logo abaixo (grupo único),
 * tudo centralizado verticalmente no quadro (2026-07-23). */
const FEED_GAP_FRAME_TO_DIVIDER = 56;
const FEED_GAP_DIVIDER_TO_HEADLINE = 36;

/**
 * Peças reaproveitáveis do layout do vídeo FEED — divisor (wordmark) +
 * headline + geometria da moldura, SEM decidir o que vai dentro dela
 * (o render real usa um buraco transparente pro vídeo; o preview de
 * Ajustes usa uma hachura + play, já que não há vídeo real pra mostrar
 * ali) — evita duas fontes de verdade pra mesma geometria/posição.
 *
 * Ordem (2026-07-23): vídeo no TOPO do grupo, divisor+título JUNTOS
 * logo abaixo — os 3 elementos formam um bloco único, CENTRALIZADO
 * verticalmente no quadro (nem colado no topo nem no rodapé).
 */
export function feedVideoLayoutParts(
  headline: string,
  cardBrand: CardBrand
): { bg: string; text: string; frame: FeedVideoFrame; dividerSvg: string; headlineSvg: string } {
  // Identidade do PRESET de layout (tipografia + assinatura da marca):
  // sem isso os três formatos de vídeo saíam idênticos em qualquer
  // preset, enquanto o carrossel mudava — ver videoIdentityFor().
  const identity = videoIdentityFor(cardBrand.layoutPreset, cardBrand.fontFamily);
  const { family, weight: displayWeight } = identity.display;
  const labelFamily = identity.labelFont === "mono" ? MONO_FONT : family;
  const bg = cardBrand.colorBackground || "#0A0A0A"; // padrão preto (kit v2, editorial-noir-prototype.html)
  const accent = cardBrand.colorAccent || "#7C5CFF";
  const text = cardBrand.colorText || "#FFFFFF";
  const cx = WIDTH / 2;

  const wm = (cardBrand.wordmark || cardBrand.brandName || "").toUpperCase();
  const headlineText = stripEmoji(headline ?? "");
  const { size, lineH, maxChars } = coverHeadlineSize(headlineText);
  const lines = wrapText(headlineText, maxChars).slice(0, 4);

  // 1ª passada com topo arbitrário (0) só pra medir a altura TOTAL do
  // grupo (vídeo + divisor + título) — os gaps são fixos, então a
  // altura não muda com a posição, só com o nº de linhas do título.
  const dividerYRel = FEED_FRAME_H + FEED_GAP_FRAME_TO_DIVIDER;
  const headStartYRel = dividerYRel + FEED_GAP_DIVIDER_TO_HEADLINE + Math.round(size * 0.6);
  const lastLineYRel = headStartYRel + (lines.length - 1) * lineH;
  const groupTop = Math.round((HEIGHT - lastLineYRel) / 2);

  const frame: FeedVideoFrame = {
    x: FEED_FRAME_MARGIN_X,
    y: groupTop,
    w: FEED_FRAME_W,
    h: FEED_FRAME_H,
    radius: FEED_FRAME_RADIUS,
  };
  const dividerY = dividerYRel + groupTop;
  const headStartY = headStartYRel + groupTop;

  const dividerSvg = brandRowSvg({
    kind: identity.brandRow,
    text: wm,
    x: FEED_FRAME_MARGIN_X,
    y: dividerY + 8,
    width: WIDTH - FEED_FRAME_MARGIN_X * 2,
    textColor: text,
    accent,
    labelFamily,
    fontSize: 26,
  });

  // Presets não-editoriais alinham o título à esquerda, como fazem nos
  // cards; Editorial Noir e Serif Luxe mantêm o centro.
  const headAnchor = identity.anchor;
  const headX = headAnchor === "middle" ? cx : FEED_FRAME_MARGIN_X;
  const headlineSvg = `<text font-family="${family}" font-weight="${displayWeight}" font-size="${size}" fill="${text}" text-anchor="${headAnchor}" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(lines, headX, headStartY, lineH)}</text>`;

  return { bg, text, frame, dividerSvg, headlineSvg };
}

/**
 * Overlay do vídeo FEED (4:5, migration 036) — o vídeo vive numa
 * MOLDURA própria (16:9, cantos arredondados, com margem — nunca cobre
 * o quadro inteiro), igual ao protótipo Editorial Noir: divisor
 * (wordmark) → moldura do vídeo → título, cada um na sua seção, nunca
 * sobrepostos. Fundo SÓLIDO (cor da marca, padrão preto — `--ink` do
 * protótipo) — sem depender de luminância/cor do vídeo, mesma lógica
 * já usada pros cards sem foto (bg sólido + cor de texto da marca).
 * O SVG desenha o fundo com um RECÂNGULO ARREDONDADO TRANSPARENTE bem
 * no lugar da moldura (via `mask`) — o ffmpeg (composeFeedVideo,
 * video.ts) encaixa o vídeo exatamente atrás desse buraco.
 */
export function buildFeedVideoOverlay(
  headline: string,
  cardBrand: CardBrand
): { overlayPng: Buffer; frame: FeedVideoFrame } {
  const { bg, frame, dividerSvg, headlineSvg } = feedVideoLayoutParts(headline, cardBrand);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <mask id="feed-video-hole">
      <rect width="100%" height="100%" fill="#fff"/>
      <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="#000"/>
    </mask>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}" mask="url(#feed-video-hole)"/>
  ${dividerSvg}
  ${headlineSvg}
</svg>`;

  return { overlayPng: rasterizeSvg(svg), frame };
}

/**
 * Variante "fundo do próprio vídeo, borrado" (modelo alternativo,
 * 2026-07-23) — em vez de fundo sólido, o fundo inteiro é o MESMO
 * vídeo, borrado, esticado pro quadro inteiro (mesma técnica de blur
 * de fundo já usada em composePhotoBg pras fotos). O overlay aqui é
 * SÓ o texto (divisor+título), transparente no resto — nem fundo
 * sólido nem buraco: quem "é" o fundo é o próprio vídeo borrado,
 * montado em video.ts (composeFeedVideoBlurBg).
 */
export async function buildFeedVideoOverlayBlurBg(
  headline: string,
  cardBrand: CardBrand,
  posterFrame: Buffer
): Promise<{ overlayPng: Buffer; frame: FeedVideoFrame }> {
  const textColorBrand = cardBrand.colorText || "#FFFFFF";
  const { frame, dividerSvg, headlineSvg } = feedVideoLayoutParts(headline, cardBrand);

  // Fundo aqui é o vídeo borrado (luminância desconhecida até render) —
  // mede a banda onde o texto realmente senta (logo abaixo da moldura)
  // no frame de pôster, cover-fit igual ao vídeo final, e só desenha
  // placa quando o contraste local não é suficiente pro texto da marca.
  const covered = await sharp(posterFrame).resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" }).toBuffer();
  const bandTop = frame.y + frame.h;
  const band = await sharp(covered)
    .extract({ left: 0, top: bandTop, width: WIDTH, height: HEIGHT - bandTop })
    .toBuffer();
  const luminance = await measureImageLuminance(band);
  const theme = pickTheme(luminance);
  const alpha = overlayAlphaFor(theme, textColorBrand, luminance);
  // Gradiente (não mais placa sólida) — ancorado no RODAPÉ do quadro
  // (mesma direção da capa): sólido na base, funde subindo até a
  // moldura do vídeo. Só aparece quando o contraste local não é
  // suficiente (alpha=0 não desenha nada — mesma condição de sempre).
  const plate = buildOverlayGradientSvg("blurbg-band", bandTop, HEIGHT - bandTop, WIDTH, theme, alpha, "bottom");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${plate}
  ${dividerSvg}
  ${headlineSvg}
</svg>`;

  return { overlayPng: rasterizeSvg(svg), frame };
}

/** Máscara (PNG, luminância = alfa) de um retângulo arredondado branco
 * sobre fundo preto — usada via `alphamerge` no ffmpeg pra recortar
 * cantos arredondados de um vídeo de verdade (não dá pra usar SVG
 * `mask` num vídeo, só em imagem estática/SVG). */
export function roundedRectMaskPng(w: number, h: number, radius: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="#000"/>
  <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="#fff"/>
</svg>`;
  return rasterizeSvg(svg);
}

const CARD_VIDEO_PAD = 96; // mesma margem lateral do card interior comum (carousel-render.ts)
const CARD_VIDEO_FRAME_H = Math.round((WIDTH - CARD_VIDEO_PAD * 2) * (9 / 16)); // 16:9, "tamanho YouTube"
const CARD_VIDEO_FRAME_RADIUS = 28;
const CARD_VIDEO_GAP_HEAD_TO_FRAME = 40;
const CARD_VIDEO_GAP_FRAME_TO_BODY = 44;
const CARD_VIDEO_BODY_SIZE = 40;
const CARD_VIDEO_BODY_LINE_H = 54;

/**
 * Peças reaproveitáveis do card INTERIOR com vídeo — TÍTULO no topo →
 * moldura de vídeo (16:9) → CORPO abaixo → rótulo de marca no rodapé
 * (exemplo-modelos-com-video.png, caso "Interior"). Mesma separação
 * bg/frame/pedaços de feedVideoLayoutParts — o render real usa um
 * buraco transparente; o preview de Ajustes usa hachura + play.
 */
export function cardVideoLayoutParts(
  card: { headline: string | null; body: string | null },
  cardBrand: CardBrand
): { bg: string; frame: FeedVideoFrame; headlineSvg: string; bodySvg: string; labelSvg: string } {
  // Identidade do PRESET de layout (tipografia + assinatura da marca):
  // sem isso os três formatos de vídeo saíam idênticos em qualquer
  // preset, enquanto o carrossel mudava — ver videoIdentityFor().
  const identity = videoIdentityFor(cardBrand.layoutPreset, cardBrand.fontFamily);
  const { family, weight: displayWeight } = identity.display;
  const labelFamily = identity.labelFont === "mono" ? MONO_FONT : family;
  const bg = cardBrand.colorBackground || "#0A0A0A";
  const text = cardBrand.colorText || "#FFFFFF";
  const pad = CARD_VIDEO_PAD;

  const headlineText = stripEmoji(card.headline ?? "");
  const { size: headSize, lineH: headLineH, maxChars } = coverHeadlineSize(headlineText);
  const headlineLines = wrapText(headlineText, maxChars).slice(0, 3);
  const bodyLines = card.body ? wrapText(stripEmoji(card.body), 34).slice(0, 3) : [];

  const headStartY = 160;
  const frame: FeedVideoFrame = {
    x: pad,
    y: headStartY + (headlineLines.length - 1) * headLineH + Math.round(headSize * 0.6) + CARD_VIDEO_GAP_HEAD_TO_FRAME,
    w: WIDTH - pad * 2,
    h: CARD_VIDEO_FRAME_H,
    radius: CARD_VIDEO_FRAME_RADIUS,
  };
  const bodyStartY = frame.y + frame.h + CARD_VIDEO_GAP_FRAME_TO_BODY;

  const headlineSvg = `<text font-family="${family}" font-weight="${displayWeight}" font-size="${headSize}" fill="${text}" text-anchor="start" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(headlineLines, pad, headStartY, headLineH)}</text>`;
  const bodySvg = bodyLines.length
    ? `<text font-family="${family}" font-weight="400" font-size="${CARD_VIDEO_BODY_SIZE}" fill="${text}" fill-opacity="0.82" text-anchor="start">${tspansLocal(bodyLines, pad, bodyStartY, CARD_VIDEO_BODY_LINE_H)}</text>`
    : "";
  const rawLabel = brandLabelText(cardBrand);
  const label = rawLabel && rawLabel.length > 50 ? rawLabel.slice(0, 49).trimEnd() + "…" : rawLabel;
  // Rótulo de marca do card interior também segue o preset (bloco no
  // Brutalism, barra no Swiss, cápsula no Pop, filete nos editoriais).
  const labelSvg = brandRowSvg({
    kind: identity.brandRow,
    text: label ?? "",
    x: pad,
    y: HEIGHT - 70,
    width: WIDTH - pad * 2,
    textColor: text,
    accent: cardBrand.colorAccent || "#7C5CFF",
    labelFamily,
    fontSize: 24,
  });

  return { bg, frame, headlineSvg, bodySvg, labelSvg };
}

/**
 * Overlay do card INTERIOR com vídeo (carrossel, migration 037) — ver
 * cardVideoLayoutParts pra geometria. Fundo com um buraco arredondado
 * transparente exatamente na moldura — o ffmpeg (composeFeedVideo,
 * video.ts) encaixa o vídeo atrás desse buraco.
 */
export function buildCardVideoOverlay(
  card: { headline: string | null; body: string | null },
  cardBrand: CardBrand
): { overlayPng: Buffer; frame: FeedVideoFrame } {
  const { bg, frame, headlineSvg, bodySvg, labelSvg } = cardVideoLayoutParts(card, cardBrand);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <mask id="card-video-hole">
      <rect width="100%" height="100%" fill="#fff"/>
      <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="#000"/>
    </mask>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}" mask="url(#card-video-hole)"/>
  ${headlineSvg}
  ${bodySvg}
  ${labelSvg}
</svg>`;

  return { overlayPng: rasterizeSvg(svg), frame };
}

/**
 * Assinatura da marca nos overlays de VÍDEO, no estilo do preset de
 * layout escolhido — é a peça que faz o Reels/feed/interior parecerem
 * do mesmo "kit" que os cards do carrossel. Antes de 2026-07-27 os três
 * desenhavam sempre o filete central (estilo Editorial Noir), então
 * todos os presets saíam idênticos no vídeo.
 *
 * `y` é a linha de base do texto; a peça é desenhada em volta dela,
 * dentro da faixa [x, x + width].
 */
function brandRowSvg(opts: {
  kind: BrandRowKind;
  text: string;
  x: number;
  y: number;
  width: number;
  textColor: string;
  accent: string;
  /** Fonte do rótulo (mono nos presets alternativos). */
  labelFamily: string;
  fontSize: number;
}): string {
  const { kind, text, x, y, width, textColor, accent, labelFamily, fontSize } = opts;
  if (!text) return "";
  const label = escapeXmlLocal(text);
  const letter = 4;
  // Largura aproximada do texto: mono/uppercase renderiza perto de
  // 0.62em por caractere, mais o letter-spacing acumulado.
  const textW = text.length * (fontSize * 0.62 + letter);
  const base = `font-family="${labelFamily}" font-weight="600" font-size="${fontSize}" letter-spacing="${letter}"`;

  // Todas as variantes ocupam a MESMA faixa, terminando 6px acima de `y`
  // (onde o filete é desenhado). Sem isso, as peças com caixa (bloco e
  // cápsula) avançavam sobre a primeira linha do título.
  const bandBottom = y - 6;

  if (kind === "block") {
    // Brutalism: bloco sólido na cor de destaque, texto vazado.
    const padX = 18;
    const h = fontSize + 18;
    const top = bandBottom - h;
    const baseline = top + h / 2 + fontSize * 0.36;
    return `<rect x="${x}" y="${top}" width="${textW + padX * 2}" height="${h}" fill="${accent}"/>
  <text x="${x + padX}" y="${baseline}" ${base} fill="#0A0A0A">${label}</text>`;
  }

  if (kind === "bar") {
    // Swiss Mono: barra vertical de destaque à esquerda do rótulo.
    const barW = 6;
    const h = fontSize + 12;
    const top = bandBottom - h;
    const baseline = top + h / 2 + fontSize * 0.36;
    return `<rect x="${x}" y="${top}" width="${barW}" height="${h}" fill="${accent}"/>
  <text x="${x + barW + 16}" y="${baseline}" ${base} fill="${textColor}">${label}</text>`;
  }

  if (kind === "pill") {
    // Pop Creator: cápsula preenchida com a cor de destaque.
    const padX = 22;
    const h = fontSize + 20;
    const w = textW + padX * 2;
    const top = bandBottom - h;
    const baseline = top + h / 2 + fontSize * 0.36;
    return `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" fill="${accent}"/>
  <text x="${x + w / 2}" y="${baseline}" ${base} fill="#0A0A0A" text-anchor="middle">${label}</text>`;
  }

  // "rule" (Editorial Noir / Serif Luxe): wordmark entre dois filetes.
  const cx = x + width / 2;
  const half = textW / 2 + 20;
  return `<line x1="${x}" y1="${y - 6}" x2="${cx - half}" y2="${y - 6}" stroke="${textColor}" stroke-opacity="0.45" stroke-width="1.5"/>
  <line x1="${cx + half}" y1="${y - 6}" x2="${x + width}" y2="${y - 6}" stroke="${textColor}" stroke-opacity="0.45" stroke-width="1.5"/>
  <text x="${cx}" y="${y}" ${base} fill="${accent}" text-anchor="middle">${label}</text>`;
}

function escapeXmlLocal(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tspansLocal(lines: string[], x: number, startY: number, lineH: number): string {
  return lines.map((l, i) => `<tspan x="${x}" y="${startY + i * lineH}">${escapeXmlLocal(l)}</tspan>`).join("");
}

export async function renderAndUploadTemplateArt(
  postId: string,
  identity: VisualIdentity,
  profile: IgProfile,
  watermark = false,
  brand: BrandTemplate = DEFAULT_BRAND
): Promise<string> {
  const label = await fetchIdentityLabel(postId);
  const final = await renderTemplateSlide(identity, profile, WIDTH, HEIGHT, watermark, brand, label);

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
  imageProvider: "fal" | "gemini" | "pollinations" | "stock" = "stock",
  userId: string | null = null,
  brand: BrandTemplate = DEFAULT_BRAND
): Promise<string> {
  // 1. Imagem base — prioriza a imagem original da matéria (evita
  //    custo de gerar do zero e mantém a foto real da notícia); cai
  //    pro provider escolhido em Ajustes (fotos reais, Gemini, Fal.ai
  //    ou Pollinations) se não tiver imagem-fonte ou o download falhar;
  //    MOCK se faltar key (Fal).
  let base: Buffer | null = sourceImageUrl
    ? await fetchSourceImage(sourceImageUrl)
    : null;
  const prompt = withRealismSuffix(imagePrompt);

  // 'stock': foto real de pessoa de verdade (Pexels → Unsplash), sem
  // os artefatos de rosto/mãos da IA. Sem resultado (sem key ou sem
  // match), cai pra IA de ilustração SEM pessoas — nunca gera rosto.
  if (!base && imageProvider === "stock") {
    try {
      const supabase = createAdminClient();
      const excludeIds = new Set<string>();
      if (userId) {
        const { data } = await supabase
          .from("posts")
          .select("stock_photo_id")
          .eq("user_id", userId)
          .not("stock_photo_id", "is", null);
        for (const row of data ?? []) {
          if (row.stock_photo_id) excludeIds.add(row.stock_photo_id);
        }
      }
      const photo = await searchStockPhoto(imagePrompt, excludeIds);
      if (photo) {
        base = await fetchStockPhotoBuffer(photo);
        await supabase
          .from("posts")
          .update({ stock_photo_id: photo.id, stock_photo_credit: photo.credit })
          .eq("id", postId);
      } else {
        console.warn(
          "[image] Nenhuma foto real encontrada (sem key ou sem match) — caindo pra IA (ilustração sem pessoas)"
        );
      }
    } catch (err) {
      console.warn("[image] Busca de foto real falhou, caindo pra IA:", err);
    }
    if (!base) {
      try {
        base = await pollinationsGenerate(
          withRealismSuffix(`${imagePrompt}, empty scene, no people, abstract tech illustration`)
        );
      } catch (err) {
        console.warn("[image] Pollinations (fallback do stock) falhou:", err);
      }
    }
  }
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

  return composeAndUploadContentImage(base, hook, postId, profile, watermark, brand);
}

/**
 * Compõe a PÁGINA 1 no preset de layout do cliente (capa-style: wordmark
 * + headline + contraste automático, sem chip) + logo/marca d'água por
 * cima (independem do layout), e sobe no Storage. Compartilhado entre
 * composeAndUploadContentImage (geração nova) e regenerateContentImage
 * (re-render a partir da base salva).
 */
async function composeAndUploadFinal(
  base: Buffer,
  hook: string,
  postId: string,
  watermark: boolean,
  brand: BrandTemplate
): Promise<string> {
  const cardBrand = await fetchCoverBrand(postId, brand.fontFamily);
  let final = await composeCoverStyleContent(base, hook, cardBrand);

  const layers: CompositeLayer[] = [];
  const logoLayer = brand.showLogo ? await buildLogoLayer(brand.logoUrl, WIDTH) : null;
  if (logoLayer) layers.push(logoLayer);
  if (watermark) layers.push(buildWatermarkLayer(WIDTH, HEIGHT));
  if (layers.length) {
    final = await sharp(final).composite(layers).jpeg({ quality: 90 }).toBuffer();
  }

  const supabase = createAdminClient();
  const path = `${postId}.jpg`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, final, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Erro no upload da imagem: ${error.message}`);

  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/**
 * Compõe e sobe a página de CONTEÚDO a partir de uma imagem base já
 * pronta — compartilhado entre generatePostImage (base gerada por
 * IA/mock) e applyCustomBaseImage (base enviada manualmente pelo
 * usuário, ex: gerada por fora no nano banana). `profile` não é mais
 * usado aqui (a página 1 não tem chip — decisão do usuário, igual à
 * capa do carrossel); mantido na assinatura por compatibilidade com
 * quem já chama esta função.
 */
async function composeAndUploadContentImage(
  base: Buffer,
  hook: string,
  postId: string,
  _profile: IgProfile,
  watermark: boolean,
  brand: BrandTemplate = DEFAULT_BRAND
): Promise<string> {
  const supabase = createAdminClient();

  // Guarda a imagem BASE (antes do wordmark/hook) para permitir
  // re-renderizar a página de conteúdo depois — ex: layout ou cores
  // mudaram em Ajustes — sem gerar a base de novo.
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

  return composeAndUploadFinal(base, hook, postId, watermark, brand);
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
  base: Buffer,
  brand: BrandTemplate = DEFAULT_BRAND
): Promise<string> {
  const normalized = await normalizeUploadedImage(base);
  return composeAndUploadContentImage(normalized, hook, postId, profile, watermark, brand);
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
  _profile: IgProfile,
  watermark = false,
  brand: BrandTemplate = DEFAULT_BRAND
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from("post-images")
    .download(`${postId}-base.jpg`);
  if (error || !data) return null;

  const baseBuffer = Buffer.from(await data.arrayBuffer());
  return composeAndUploadFinal(baseBuffer, hook, postId, watermark, brand);
}
