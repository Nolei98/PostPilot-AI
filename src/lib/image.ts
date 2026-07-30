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
import type { BrandTemplate, IgProfile, RenderSpec, VisualIdentity } from "@/lib/types";
import { FONT_FAMILY } from "@/lib/font-data";
import { rasterizeSvg } from "@/lib/svg-render";
import {
  videoIdentityFor,
  MONO_FONT,
  wordmarkToHeadlineGap,
  svgLocalId,
  type BrandRowKind,
  type CoverPageKind,
} from "@/lib/render-shared";
import { searchStockPhoto, fetchStockPhotoBuffer } from "@/lib/stock-photos";
import { buildProfileChipLayers } from "@/lib/profile-chip";
import { composePhotoBg, coverHeadlineSize, stripEmoji, wrapText, brandLabelText, type CardBrand } from "@/lib/carousel-render";

// Os construtores de SVG puros (página 1, contra-capa, marca d'água)
// vivem em cover-svg.ts — o preview ao vivo da Fila precisa deles sem
// arrastar sharp e os SDKs de provider que este módulo carrega.
import {
  buildPageOneCoverSvg,
  buildClosingCoverSvg,
  buildWatermarkSvg,
} from "@/lib/cover-svg";

import {
  pickTheme,
  textColorForTheme,
  measureImageLuminance,
  overlayAlphaFor,
  buildOverlayGradientSvg,
  buildLuminanceGrid,
  boostAccent,
  type LumGrid,
} from "@/lib/contrast";

/**
 * Luminância aproximada da PLACA de leitura, pra decidir contraste do que
 * é desenhado sobre ela. A placa é translúcida, então o valor exato
 * depende da foto embaixo; o que importa aqui é o lado — placa clara puxa
 * pra 1, escura pra 0 — e é isso que decide se o realce precisa ser
 * empurrado. Usar o valor da foto seria pior: é a placa que fica ENTRE a
 * foto e o texto.
 */
function plateLuminance(theme: "light" | "dark"): number {
  return theme === "light" ? 0.92 : 0.08;
}

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

function buildWatermarkLayer(width: number, height: number): CompositeLayer {
  return { input: rasterizeSvg(buildWatermarkSvg(width, height)), top: 0, left: 0 };
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

  // O desenho em si (contraste automático + mapeamento dos campos antigos
  // de Ajustes pro layout atual) vive em cover-svg.ts, compartilhado com o
  // preview ao vivo da Fila. Aqui ficam só as camadas raster.
  const svg = buildClosingCoverSvg(
    identity,
    {
      colorBackground: identity.colorBackground,
      colorAccent: identity.colorAccent,
      colorText: identity.colorText,
      fontFamily,
      brandName: null,
      wordmark: label?.wordmark ?? null,
      handle: label?.handle ?? null,
      keywords: null,
      brandMark: "wordmark",
      layoutPreset: label?.layoutPreset,
    },
    fontFamily
  );

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
async function composeCoverStyleContent(
  baseImage: Buffer,
  hook: string,
  cardBrand: CardBrand,
  /**
   * Véu escolhido pra FOTO de fundo (048). Nasceu no vídeo em feed 4:5,
   * mas a foto de fundo vale no post único também — e até 29/07 só a
   * foto era respeitada aqui: escolher 'on'/'off' não mudava nada na
   * página 1. 'auto' (padrão) é o comportamento de sempre.
   */
  bgOverlay: "auto" | "on" | "off" = "auto"
): Promise<Buffer> {
  const probe = buildPageOneCoverSvg(hook, { ...cardBrand, colorText: "#FFFFFF" }, true, { showSwipeHint: false });
  const covered = await sharp(baseImage).resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" }).toBuffer();
  const band = await sharp(covered)
    .extract({ left: 0, top: probe.blurBandTop, width: WIDTH, height: HEIGHT - probe.blurBandTop })
    .toBuffer();
  const luminance = await measureImageLuminance(band);
  const theme = pickTheme(luminance);
  const textColor = textColorForTheme(theme);
  const medido = overlayAlphaFor(theme, textColor, luminance);
  const alpha = bgOverlay === "off" ? 0 : bgOverlay === "on" ? Math.max(0.55, medido) : medido;
  // Meta-linha do topo dos 4 layouts alternativos (fora da banda de
  // identidade) — mesma checagem de contraste LOCAL de renderAltLayoutCard
  // (carousel-render.ts); sem efeito no Editorial Noir (não tem topRow).
  const topBand = await sharp(covered).extract({ left: 0, top: 0, width: WIDTH, height: 140 }).toBuffer();
  const topLuminance = await measureImageLuminance(topBand);
  const topMedido = overlayAlphaFor(theme, textColor, topLuminance);
  const topAlpha = bgOverlay === "off" ? 0 : bgOverlay === "on" ? Math.max(0.55, topMedido) : topMedido;
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

/**
 * Constrói só o OVERLAY de texto (PNG transparente 1080×1920 — divisor
 * (———WORDMARK®———) + título juntos, alinhados dentro da zona segura
 * inferior) pro Reels de VÍDEO — o ffmpeg faz a composição final sobre
 * o vídeo (video.ts), não o sharp. Regra do kit: a luminância/contraste
 * vem do FRAME DE PÔSTER (posterFrame) — mede exatamente a região da
 * zona segura (onde o texto realmente vai), não a foto/vídeo inteiro.
 */
/**
 * Piso do véu de legibilidade nos formatos em que o FUNDO É O VÍDEO
 * (Reels e feed-blur). A medição só enxerga o frame de pôster: um vídeo
 * que começa escuro e clareia depois faz o texto branco sumir no meio da
 * reprodução (relatado em 2026-07-28). Como não dá pra medir o futuro, o
 * gradiente nunca some de vez — fica um mínimo discreto sempre.
 *
 * Não se aplica ao vídeo feed 4:5 nem ao card de carrossel: nesses o
 * texto senta em fundo SÓLIDO da marca, fora da moldura do vídeo.
 */
const VIDEO_SCRIM_FLOOR = 0.32;

/** Contraste já decidido de uma região — ver buildReelsVideoOverlaySvg. */
interface OverlayContrast {
  theme: "light" | "dark";
  textColor: string;
  alpha: number;
}

export async function buildReelsVideoOverlayPng(
  headline: string,
  cardBrand: CardBrand,
  posterFrame: Buffer
): Promise<Buffer> {
  const { zone } = reelsTextZone(headline);

  // Mede a luminância REAL da zona segura (divisor + título juntos, já
  // cover-fit igual ao vídeo final) — não a foto/vídeo inteiro.
  const covered = await sharp(posterFrame).resize(REELS_W, REELS_H, { fit: "cover", position: "attention" }).toBuffer();
  const zoneCrop = await sharp(covered)
    .extract({ left: REELS_SAFE_MARGIN_X, top: zone.top, width: zone.width, height: REELS_H - zone.top })
    .toBuffer();
  const luminance = await measureImageLuminance(zoneCrop);
  const theme = pickTheme(luminance);
  const textColor = textColorForTheme(theme);
  // Piso: a medição só enxerga o frame de pôster. Vídeo que começa
  // escuro e clareia no meio fazia o texto branco sumir (2026-07-28).
  const alpha = Math.max(VIDEO_SCRIM_FLOOR, overlayAlphaFor(theme, textColor, luminance));

  return rasterizeSvg(buildReelsVideoOverlaySvg(headline, cardBrand, { theme, textColor, alpha }));
}

/**
 * Geometria do bloco de texto do Reels (zona segura inferior). Existe
 * separada porque a medição de contraste e o desenho precisam da MESMA
 * conta — quando eram duas, o gradiente e o texto podiam divergir.
 */
function reelsTextZone(headline: string): {
  lines: string[];
  size: number;
  lineH: number;
  headStartY: number;
  dividerY: number;
  zone: { top: number; width: number };
} {
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
  // Distância padrão do produto — calibrada AQUI e propagada como razão
  // folga/corpo pros outros formatos (ver wordmarkToHeadlineGap).
  const dividerY = headStartY - wordmarkToHeadlineGap(size);
  return {
    lines,
    size,
    lineH,
    headStartY,
    dividerY,
    zone: { top: Math.max(0, dividerY - 40), width: safeWidth },
  };
}

/**
 * SVG do overlay do Reels com o contraste JÁ decidido. Separado do PNG
 * porque o preview ao vivo da Fila desenha este mesmo SVG no browser
 * (post-preview.ts): lá a luminância vem da grade medida na geração,
 * aqui do frame de pôster. Uma geometria só, dois consumidores.
 */
export function buildReelsVideoOverlaySvg(
  headline: string,
  cardBrand: CardBrand,
  contrast: OverlayContrast
): string {
  // Identidade do PRESET de layout (tipografia + assinatura da marca):
  // sem isso os três formatos de vídeo saíam idênticos em qualquer
  // preset, enquanto o carrossel mudava — ver videoIdentityFor().
  const identity = videoIdentityFor(cardBrand.layoutPreset, cardBrand.fontFamily);
  const { family, weight: displayWeight } = identity.display;
  const labelFamily = identity.labelFont === "mono" ? MONO_FONT : family;
  const accent = cardBrand.colorAccent || "#7C5CFF";
  const wm = (cardBrand.wordmark || cardBrand.brandName || "").toUpperCase();
  const { lines, size, lineH, headStartY, dividerY, zone } = reelsTextZone(headline);
  const { theme, textColor, alpha } = contrast;

  // Gradiente de legibilidade (mesmo motor de contrast.ts) cobrindo a
  // zona segura inferior inteira — divisor + título já entram juntos
  // na mesma banda, sem precisar de placa separada pra marca.
  // Rótulo do topo (046) — precisa estar decidido ANTES do scrim, porque
  // o véu de legibilidade tem que crescer pra cobrir ele também: texto
  // fora do véu some quando o vídeo clareia naquele trecho.
  const eyebrowText = (cardBrand.eyebrow ?? "").trim().toUpperCase();
  const scrimTop = eyebrowText ? Math.max(0, zone.top - 48) : zone.top;
  const scrim = buildOverlayGradientSvg("reels-safezone", scrimTop, REELS_H - scrimTop, REELS_W, theme, alpha, "bottom");

  // Assinatura da marca no estilo do preset (filete, bloco, barra ou
  // cápsula) — o Reels mantém a geometria de zona segura de 2026-07-23;
  // o que muda por preset é a identidade, não o enquadramento.
  const dividerSvg = brandRowSvg({
    kind: identity.brandRow,
    text: wm,
    x: REELS_SAFE_MARGIN_X,
    y: dividerY + 6,
    width: zone.width,
    textColor,
    // Wordmark pode ter cor própria (043); sem escolha, segue o realce.
    accent: cardBrand.markColor || accent,
    labelFamily,
    fontSize: 20,
  });
  const headlineSvg = `<text font-family="${family}" font-weight="${displayWeight}" font-size="${size}" fill="${textColor}" text-anchor="start" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(lines, REELS_SAFE_MARGIN_X, headStartY, lineH)}</text>`;

  // Rótulo do topo (046) no Reels: fica ACIMA da assinatura de marca, e
  // não no topo do quadro. O topo de um Reels é território do Instagram
  // (nome, som, botões) — texto ali some atrás da interface. Dentro da
  // zona segura ele é lido junto do resto, que é o ponto do rótulo.
  const eyebrowSvg = eyebrowText
    ? `<text x="${REELS_SAFE_MARGIN_X}" y="${dividerY - 44}" font-family="${labelFamily}" font-weight="400" font-size="24" letter-spacing="2" fill="${cardBrand.markColor || accent}" fill-opacity="0.9">${escapeXmlLocal(eyebrowText)}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${REELS_W}" height="${REELS_H}" viewBox="0 0 ${REELS_W} ${REELS_H}">
  ${scrim}
  ${eyebrowSvg}
  ${dividerSvg}
  ${headlineSvg}
</svg>`;
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
const FEED_GAP_FRAME_TO_DIVIDER = 92;

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
  // Divisor → título: a MESMA folga ótica do resto do produto (29/07).
  // Era 36 + 0.6·corpo aqui, o que deixava o feed 4:5 mais apertado que
  // o Reels na mesma marca. Ver wordmarkToHeadlineGap (render-shared).
  const headStartYRel = dividerYRel + wordmarkToHeadlineGap(size);
  const lastLineYRel = headStartYRel + (lines.length - 1) * lineH;
  // Rótulo do topo (046): no feed 4:5 ele cabe no TOPO de verdade — o
  // quadro é do post, não tem interface do Instagram por cima como no
  // Reels. Quando existe, o grupo (vídeo + marca + título) é empurrado
  // pra baixo o suficiente pra não encostar nele.
  const eyebrowText = (cardBrand.eyebrow ?? "").trim().toUpperCase();
  const EYEBROW_Y = 92;
  const groupTop = Math.max(
    eyebrowText ? EYEBROW_Y + 58 : 0,
    Math.round((HEIGHT - lastLineYRel) / 2)
  );

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
    // Wordmark pode ter cor própria (043); sem escolha, segue o realce.
    accent: cardBrand.markColor || accent,
    labelFamily,
    fontSize: 26,
  });

  // Presets não-editoriais alinham o título à esquerda, como fazem nos
  // cards; Editorial Noir e Serif Luxe mantêm o centro.
  const headAnchor = identity.anchor;
  const headX = headAnchor === "middle" ? cx : FEED_FRAME_MARGIN_X;
  const eyebrowSvg = eyebrowText
    ? `<text x="${FEED_FRAME_MARGIN_X}" y="${EYEBROW_Y}" font-family="${labelFamily}" font-weight="400" font-size="24" letter-spacing="2" fill="${cardBrand.markColor || accent}" fill-opacity="0.9">${escapeXmlLocal(eyebrowText)}</text>`
    : "";
  const headlineSvg = `${eyebrowSvg}<text font-family="${family}" font-weight="${displayWeight}" font-size="${size}" fill="${text}" text-anchor="${headAnchor}" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(lines, headX, headStartY, lineH)}</text>`;

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
  const { svg, frame } = buildFeedVideoOverlaySvg(headline, cardBrand);
  return { overlayPng: rasterizeSvg(svg), frame };
}

/**
 * O mesmo overlay em SVG. O preview ao vivo da Fila desenha exatamente
 * este markup no browser e encaixa o `<video>` ATRÁS do buraco
 * (post-preview.ts) — é o que garante que o vídeo apareça no lugar certo
 * na prévia, e não cobrindo o quadro inteiro (bug de 2026-07-28).
 */
export function buildFeedVideoOverlaySvg(
  headline: string,
  cardBrand: CardBrand,
  /**
   * Fundo por FOTO em vez da cor sólida da marca. Quando presente, o
   * retângulo de fundo não é desenhado (quem pinta é a imagem, atrás) e
   * entra um véu de leitura na faixa do texto — mesma matemática do
   * feed-blur, que também tem fundo imprevisível.
   */
  photoBg?: { theme: "light" | "dark"; alpha: number; textColor?: string }
): { svg: string; frame: FeedVideoFrame } {
  // Com foto de fundo a cor do texto NÃO pode ser a da marca: a foto
  // manda. Sem isto, foto clara + colorText branco dava título invisível
  // — visto na fila em 29/07, e o render real tinha o mesmo defeito
  // porque os dois passam por aqui.
  //
  // O `?? textColorForTheme` é a rede (30/07): antes, chamador que
  // passasse a placa e esquecesse o textColor caía silenciosamente na cor
  // da marca — exatamente o que aconteceu no card com vídeo. A placa e o
  // texto passam a ser decididos sempre juntos.
  const brand = photoBg
    ? {
        ...cardBrand,
        colorText: photoBg.textColor ?? textColorForTheme(photoBg.theme),
        colorAccent: boostAccent(cardBrand.colorAccent || "#7C5CFF", plateLuminance(photoBg.theme)),
      }
    : cardBrand;
  const { bg, frame, dividerSvg, headlineSvg } = feedVideoLayoutParts(headline, brand);

  const feedHoleId = svgLocalId("feed-video-hole", frame.x, frame.y, frame.w, frame.h, frame.radius);

  // Placa contínua com o mesmo recorte do fundo sólido — ver
  // buildCardVideoOverlaySvg: preta e branca são a mesma placa, muda a
  // cor dela e a do texto; nunca um degradê parcial, que sobre foto
  // clara virava mancha no card.
  const bgLayer = photoBg
    ? photoBg.alpha > 0
      ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${
          photoBg.theme === "dark" ? "#000000" : "#FFFFFF"
        }" fill-opacity="${photoBg.alpha}" mask="url(#${feedHoleId})"/>`
      : ""
    : `<rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}" mask="url(#${feedHoleId})"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <mask id="${feedHoleId}">
      <rect width="100%" height="100%" fill="#fff"/>
      <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="#000"/>
    </mask>
  </defs>
  ${bgLayer}
  ${dividerSvg}
  ${headlineSvg}
</svg>`;

  return { svg, frame };
}

/**
 * Overlay do feed 4:5 com FOTO de fundo (2026-07-29). O fundo do feed
 * era só a cor sólida da marca; com foto, o post de vídeo ganha a mesma
 * liberdade que o post único já tinha.
 *
 * A foto é achatada no PNG do overlay, e o buraco da moldura é recortado
 * DELA também (`dest-out` com a máscara arredondada) — senão a foto
 * taparia o vídeo, que o ffmpeg encaixa por baixo.
 */
export async function buildFeedVideoOverlayPhotoBg(
  headline: string,
  cardBrand: CardBrand,
  photo: Buffer,
  /** Véu por cima da foto (048): 'auto' segue a medição. */
  overlayMode: "auto" | "on" | "off" = "auto"
): Promise<{ overlayPng: Buffer; frame: FeedVideoFrame }> {
  const textColorBrand = cardBrand.colorText || "#FFFFFF";
  const { frame } = feedVideoLayoutParts(headline, cardBrand);

  const covered = await sharp(photo)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
    .toBuffer();

  // Contraste medido na faixa onde o texto senta de verdade (abaixo da
  // moldura), não no quadro inteiro: é a mesma regra do feed-blur.
  const bandTop = frame.y + frame.h;
  const band = await sharp(covered)
    .extract({ left: 0, top: bandTop, width: WIDTH, height: HEIGHT - bandTop })
    .toBuffer();
  const luminance = await measureImageLuminance(band);
  const theme = pickTheme(luminance);
  const medido = overlayAlphaFor(theme, textColorBrand, luminance);
  // 'off' é escolha consciente de quem olhou a foto: nem o piso de vídeo
  // se aplica. 'on' força um véu forte mesmo que a medida dispensasse.
  const alpha =
    overlayMode === "off"
      ? 0
      : overlayMode === "on"
        ? Math.max(0.55, medido)
        : Math.max(VIDEO_SCRIM_FLOOR, medido);

  const { svg } = buildFeedVideoOverlaySvg(headline, cardBrand, {
    theme,
    alpha,
    textColor: textColorForTheme(theme),
  });
  const overlayPng = await sharp(covered)
    .composite([
      { input: rasterizeSvg(svg), top: 0, left: 0 },
      // Abre o buraco da moldura na foto — o vídeo entra por trás.
      {
        input: roundedRectMaskPng(frame.w, frame.h, frame.radius),
        top: frame.y,
        left: frame.x,
        blend: "dest-out",
      },
    ])
    .png()
    .toBuffer();

  return { overlayPng, frame };
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
  // Mesmo piso do Reels: aqui o fundo TAMBÉM é o vídeo, então um trecho
  // claro no meio da reprodução apagaria o texto se o véu pudesse zerar.
  const alpha = Math.max(VIDEO_SCRIM_FLOOR, overlayAlphaFor(theme, textColorBrand, luminance));
  // Gradiente (não mais placa sólida) — ancorado no RODAPÉ do quadro
  // (mesma direção da capa): sólido na base, funde subindo até a
  // moldura do vídeo. Só aparece quando o contraste local não é
  // suficiente (alpha=0 não desenha nada — mesma condição de sempre).
  const plate = buildOverlayGradientSvg("blurbg-band", bandTop, HEIGHT - bandTop, WIDTH, theme, alpha, "bottom");

  return { overlayPng: rasterizeSvg(feedVideoBlurBgSvg(plate, dividerSvg, headlineSvg)), frame };
}

/**
 * Overlay do feed-blur em SVG puro, pro PREVIEW ao vivo.
 *
 * Existe porque a fila estava desenhando o feed-blur com o overlay do
 * feed SÓLIDO (buildFeedVideoOverlaySvg): aquele markup pinta o quadro
 * inteiro com a cor da marca e abre só o buraco da moldura, então a cópia
 * borrada do vídeo ficava escondida atrás da cor e o enquadramento
 * parecia idêntico ao feed comum (relatado em 29/07). Aqui não há
 * retângulo de fundo: só o véu de leitura, a marca e o título — o que o
 * render final faz.
 */
export function buildFeedVideoBlurBgOverlaySvg(
  headline: string,
  cardBrand: CardBrand,
  contrast: OverlayContrast
): { svg: string; frame: FeedVideoFrame } {
  const { frame, dividerSvg, headlineSvg } = feedVideoLayoutParts(headline, cardBrand);
  // Mesma placa contínua dos outros formatos de vídeo (ver
  // buildCardVideoOverlaySvg): cobre tudo menos a moldura, onde o vídeo
  // nítido entra. O fundo borrado continua aparecendo por baixo dela.
  const blurHoleId = svgLocalId("blurbg-hole", frame.x, frame.y, frame.w, frame.h, frame.radius);
  const plate =
    contrast.alpha > 0
      ? `<defs><mask id="${blurHoleId}">
      <rect width="100%" height="100%" fill="#fff"/>
      <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="#000"/>
    </mask></defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${
    contrast.theme === "dark" ? "#000000" : "#FFFFFF"
  }" fill-opacity="${contrast.alpha}" mask="url(#${blurHoleId})"/>`
      : "";
  return { svg: feedVideoBlurBgSvg(plate, dividerSvg, headlineSvg), frame };
}

/** Markup do overlay do feed-blur — compartilhado com o preview. */
export function feedVideoBlurBgSvg(plate: string, dividerSvg: string, headlineSvg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${plate}
  ${dividerSvg}
  ${headlineSvg}
</svg>`;
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
/**
 * Base do título → topo da moldura de vídeo. Subiu de 40 pra 72 em
 * 29/07: com o título do interior em "nível capa" (corpo até 104), 40px
 * deixavam o vídeo grudado embaixo da fonte — lido como defeito, não
 * como composição. Fica MAIOR que o gap de baixo de propósito: o título
 * é o peso visual da página e precisa de mais ar que o corpo, que
 * pertence à moldura logo acima dele.
 */
const CARD_VIDEO_GAP_HEAD_TO_FRAME = 72;
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
  cardBrand: CardBrand,
  /**
   * Papel da página no carrossel + posição. "capa é capa, ainda com
   * vídeo": sem isso o card 0 com vídeo saía com a MESMA estrutura de
   * um card do meio (título, moldura, corpo, rodapé), perdendo a faixa
   * de eyebrow, o wordmark e a chamada de deslize que identificam uma
   * capa em todos os 5 presets.
   */
  opts: { pageKind?: CoverPageKind; index?: number; total?: number } = {}
): { bg: string; frame: FeedVideoFrame; headlineSvg: string; bodySvg: string; labelSvg: string } {
  const pageKind = opts.pageKind ?? "interior";
  const isCoverLike = pageKind === "cover" || pageKind === "closing";
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

  const accent = cardBrand.colorAccent || "#7C5CFF";
  const anchorX = identity.anchor === "middle" ? WIDTH / 2 : pad;

  // ---- CAPA (e fechamento) com vídeo -------------------------------
  // Estrutura de capa: faixa de eyebrow no topo, moldura de vídeo,
  // assinatura da marca, título display e chamada de deslize. Mesma
  // ordem de leitura da capa estática de cada preset.
  if (isCoverLike) {
    const eyebrowY = 92;
    const frame: FeedVideoFrame = {
      x: pad,
      y: eyebrowY + 60,
      w: WIDTH - pad * 2,
      h: CARD_VIDEO_FRAME_H,
      radius: CARD_VIDEO_FRAME_RADIUS,
    };
    const brandY = frame.y + frame.h + 78;
    // Mesma distância wordmark→título do resto do produto (29/07).
    const headStart = brandY + wordmarkToHeadlineGap(headSize);

    const handle = cardBrand.handle ? `@${cardBrand.handle}`.toUpperCase() : "";
    // Rótulo do topo (046): o do POST vence o default do preset. Sobe em
    // caixa alta como o do preset, senão a capa com vídeo sairia com uma
    // meta-linha em caixa diferente da capa estática do mesmo carrossel.
    const eyebrowText = (cardBrand.eyebrow || identity.eyebrow).toUpperCase();
    const eyebrowSvg =
      `<text x="${pad}" y="${eyebrowY}" font-family="${labelFamily}" font-weight="400" font-size="24" letter-spacing="2" fill="${cardBrand.markColor || accent}" fill-opacity="0.9">${escapeXmlLocal(eyebrowText)}</text>` +
      (handle
        ? `<text x="${WIDTH - pad}" y="${eyebrowY}" font-family="${labelFamily}" font-weight="400" font-size="24" letter-spacing="2" fill="${text}" fill-opacity="0.8" text-anchor="end">${escapeXmlLocal(handle)}</text>`
        : "");

    const wm = (cardBrand.wordmark || cardBrand.brandName || "").toUpperCase();
    const brandSvg = brandRowSvg({
      kind: identity.brandRow,
      text: wm,
      x: pad,
      y: brandY,
      width: WIDTH - pad * 2,
      textColor: text,
      // Wordmark pode ter cor própria (043); sem escolha, segue o realce.
      accent: cardBrand.markColor || accent,
      labelFamily,
      fontSize: 24,
    });

    const headlineSvg =
      eyebrowSvg +
      brandSvg +
      `<text font-family="${family}" font-weight="${displayWeight}" font-size="${headSize}" fill="${text}" text-anchor="${identity.anchor}" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(headlineLines, anchorX, headStart, headLineH)}</text>`;

    // Fechamento não convida a deslizar — é o fim do carrossel.
    const swipeSvg =
      pageKind === "cover"
        ? `<text x="${anchorX}" y="${HEIGHT - 96}" font-family="${labelFamily}" font-weight="600" font-size="26" letter-spacing="4" fill="${text}" fill-opacity="0.75" text-anchor="${identity.anchor === "middle" ? "middle" : "start"}">${escapeXmlLocal(identity.swipeHint)}</text>`
        : "";

    // O corpo só entra se couber ACIMA da chamada de deslize — sem essa
    // checagem as duas se sobrepunham na capa (título longo empurra o
    // corpo pra cima da linha do "Deslize").
    const bodyTop = headStart + headlineLines.length * headLineH + 20;
    const bodyBottom = bodyTop + bodyLines.length * CARD_VIDEO_BODY_LINE_H;
    const cabeCorpo = bodyLines.length > 0 && bodyBottom < HEIGHT - 150;
    const bodySvg = cabeCorpo
      ? `<text font-family="${family}" font-weight="400" font-size="${CARD_VIDEO_BODY_SIZE}" fill="${text}" fill-opacity="0.82" text-anchor="${identity.anchor}">${tspansLocal(bodyLines, anchorX, bodyTop, CARD_VIDEO_BODY_LINE_H)}</text>`
      : "";

    return { bg, frame, headlineSvg, bodySvg, labelSvg: swipeSvg };
  }

  // ---- INTERIOR com vídeo -----------------------------------------
  // Numeral de destaque no topo (como o card interior estático de todos
  // os presets), título, moldura, corpo e rodapé com marca + contador.
  const idx = opts.index ?? 0;
  const total = opts.total ?? 0;
  const numeralY = 108;
  const numeralSvg = idx
    ? `<text x="${anchorX}" y="${numeralY}" font-family="${family}" font-weight="${displayWeight}" font-size="44" fill="${accent}" text-anchor="${identity.anchor}">${String(idx).padStart(2, "0")}</text>`
    : "";

  const headStartY = idx ? 200 : 160;
  const frame: FeedVideoFrame = {
    x: pad,
    y: headStartY + (headlineLines.length - 1) * headLineH + Math.round(headSize * 0.6) + CARD_VIDEO_GAP_HEAD_TO_FRAME,
    w: WIDTH - pad * 2,
    h: CARD_VIDEO_FRAME_H,
    radius: CARD_VIDEO_FRAME_RADIUS,
  };
  const bodyStartY = frame.y + frame.h + CARD_VIDEO_GAP_FRAME_TO_BODY;

  const headlineSvg =
    numeralSvg +
    `<text font-family="${family}" font-weight="${displayWeight}" font-size="${headSize}" fill="${text}" text-anchor="${identity.anchor}" letter-spacing="${identity.display.letterSpacing}">${tspansLocal(headlineLines, anchorX, headStartY, headLineH)}</text>`;
  const bodySvg = bodyLines.length
    ? `<text font-family="${family}" font-weight="400" font-size="${CARD_VIDEO_BODY_SIZE}" fill="${text}" fill-opacity="0.82" text-anchor="${identity.anchor}">${tspansLocal(bodyLines, anchorX, bodyStartY, CARD_VIDEO_BODY_LINE_H)}</text>`
    : "";
  const rawLabel = brandLabelText(cardBrand);
  const label = rawLabel && rawLabel.length > 50 ? rawLabel.slice(0, 49).trimEnd() + "…" : rawLabel;
  // Rótulo de marca do card interior também segue o preset (bloco no
  // Brutalism, barra no Swiss, cápsula no Pop, filete nos editoriais).
  const labelSvg =
    brandRowSvg({
      kind: identity.brandRow,
      text: label ?? "",
      x: pad,
      // Reserva o canto direito quando há contador ("04/10"), senão o
      // filete passa por trás do número.
      width: WIDTH - pad * 2 - (idx && total ? 130 : 0),
      y: HEIGHT - 70,
      textColor: text,
      // Wordmark pode ter cor própria (043); sem escolha, segue o realce.
      accent: cardBrand.markColor || accent,
      labelFamily,
      fontSize: 24,
    }) +
    (idx && total
      ? `<text x="${WIDTH - pad}" y="${HEIGHT - 70}" font-family="${labelFamily}" font-weight="400" font-size="22" letter-spacing="1.5" fill="${accent}" text-anchor="end">${String(idx).padStart(2, "0")}/${String(total).padStart(2, "0")}</text>`
      : "");

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
  cardBrand: CardBrand,
  /** Papel da página + posição — ver cardVideoLayoutParts. */
  opts: { pageKind?: CoverPageKind; index?: number; total?: number } = {}
): { overlayPng: Buffer; frame: FeedVideoFrame } {
  const { svg, frame } = buildCardVideoOverlaySvg(card, cardBrand, opts);
  return { overlayPng: rasterizeSvg(svg), frame };
}

/**
 * O mesmo overlay em SVG, pro preview ao vivo encaixar o `<video>` atrás
 * do buraco em vez de cobrir o card inteiro. Só o card que TEM vídeo
 * recebe esse tratamento — antes a prévia mostrava o vídeo em todos os
 * interiores (bug de 2026-07-28).
 */
export function buildCardVideoOverlaySvg(
  card: { headline: string | null; body: string | null },
  cardBrand: CardBrand,
  opts: {
    pageKind?: CoverPageKind;
    index?: number;
    total?: number;
    /**
     * Card com vídeo sobre FOTO (2026-07-29). Sem isso o card com vídeo
     * era obrigado a ter fundo sólido da marca: subir foto nele não
     * mudava nada na prévia, porque o retângulo sólido cobria tudo menos
     * o buraco da moldura. Com foto, o retângulo dá lugar ao véu.
     */
    photoBg?: { theme: "light" | "dark"; alpha: number; textColor?: string };
  } = {}
): { svg: string; frame: FeedVideoFrame } {
  // A cor do texto é decidida AQUI, junto com a placa, e não pelo
  // chamador: a placa clara com o texto branco da marca por cima deixou
  // título e corpo invisíveis no card com foto (visto no #0585 em
  // 30/07). Quem escolhe a placa tem que escolher o texto no mesmo
  // ponto, senão a próxima chamada esquece de novo — foi assim que o
  // caminho do preview e o do render erraram os dois igual.
  const brand = opts.photoBg
    ? {
        ...cardBrand,
        colorText: opts.photoBg.textColor ?? textColorForTheme(opts.photoBg.theme),
        // O numeral, o contador e a assinatura saem no REALCE, e realce
        // é escolhido contra o fundo do kit — sobre a placa clara ele
        // some pelo mesmo motivo que o texto sumia. Mesma rede do
        // wordmark (boostAccent, §0-C.2).
        colorAccent: boostAccent(
          cardBrand.colorAccent || "#7C5CFF",
          plateLuminance(opts.photoBg.theme)
        ),
      }
    : cardBrand;
  const { bg, frame, headlineSvg, bodySvg, labelSvg } = cardVideoLayoutParts(card, brand, opts);

  // Id por conteúdo: vários cards convivem na mesma página da Fila e um
  // id fixo fazia todos apontarem pra máscara do primeiro (ver
  // svgLocalId em render-shared).
  const holeId = svgLocalId("card-video-hole", frame.x, frame.y, frame.w, frame.h, frame.radius);

  // A placa de leitura é UMA superfície contínua sobre a foto, com o
  // mesmo recorte do fundo sólido: o quadro inteiro menos o buraco da
  // moldura, onde quem manda é o vídeo. Foi assim que virou em 29/07 —
  // antes era um degradê só na faixa de baixo, o que deixava o título
  // (que vive ACIMA da moldura) sem proteção e, no tema claro, pintava
  // manchas brancas soltas no card em vez de uma placa.
  //
  // Preta e branca são a MESMA placa: muda a cor dela e a do texto.
  const bgLayer = opts.photoBg
    ? opts.photoBg.alpha > 0
      ? `<rect width="${WIDTH}" height="${HEIGHT}" fill="${
          opts.photoBg.theme === "dark" ? "#000000" : "#FFFFFF"
        }" fill-opacity="${opts.photoBg.alpha}" mask="url(#${holeId})"/>`
      : ""
    : `<rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}" mask="url(#${holeId})"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <mask id="${holeId}">
      <rect width="100%" height="100%" fill="#fff"/>
      <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="${frame.radius}" fill="#000"/>
    </mask>
  </defs>
  ${bgLayer}
  ${headlineSvg}
  ${bodySvg}
  ${labelSvg}
</svg>`;

  return { svg, frame };
}

/**
 * Card com vídeo SOBRE FOTO, já rasterizado — a foto é achatada no PNG e
 * o buraco da moldura é recortado dela (dest-out), senão a foto taparia o
 * vídeo que o ffmpeg encaixa por baixo. Mesma técnica do feed 4:5.
 */
export async function buildCardVideoOverlayPhotoBg(
  card: { headline: string | null; body: string | null },
  cardBrand: CardBrand,
  photo: Buffer,
  opts: { pageKind?: CoverPageKind; index?: number; total?: number } = {}
): Promise<{ overlayPng: Buffer; frame: FeedVideoFrame }> {
  const textColorBrand = cardBrand.colorText || "#FFFFFF";
  const { frame } = cardVideoLayoutParts(card, cardBrand, opts);

  const covered = await sharp(photo)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
    .toBuffer();
  const bandTop = frame.y + frame.h;
  const band = await sharp(covered)
    .extract({ left: 0, top: bandTop, width: WIDTH, height: HEIGHT - bandTop })
    .toBuffer();
  const luminance = await measureImageLuminance(band);
  const theme = pickTheme(luminance);
  const alpha = Math.max(VIDEO_SCRIM_FLOOR, overlayAlphaFor(theme, textColorBrand, luminance));

  const { svg } = buildCardVideoOverlaySvg(card, cardBrand, {
    ...opts,
    photoBg: { theme, alpha, textColor: textColorForTheme(theme) },
  });
  const overlayPng = await sharp(covered)
    .composite([
      { input: rasterizeSvg(svg), top: 0, left: 0 },
      {
        input: roundedRectMaskPng(frame.w, frame.h, frame.radius),
        top: frame.y,
        left: frame.x,
        blend: "dest-out",
      },
    ])
    .png()
    .toBuffer();

  return { overlayPng, frame };
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

  if (kind === "scallop") {
    // Doce Vitrine: bordinha ondulada (a bandeja rendada) por cima do
    // rótulo — a mesma forma da capa/rodapé daquele preset.
    const r = 13;
    const ondas = Math.max(3, Math.round((textW + 40) / (r * 2)));
    const larguraOnda = ondas * r * 2;
    const inicio = x + width / 2 - larguraOnda / 2;
    const ondaY = bandBottom - fontSize - 14;
    let d = `M ${inicio} ${ondaY}`;
    for (let i = 0; i < ondas; i++) d += ` a ${r} ${r} 0 0 0 ${2 * r} 0`;
    return `<path d="${d}" fill="none" stroke="${accent}" stroke-width="3"/>
  <text x="${x + width / 2}" y="${y}" ${base} fill="${accent}" text-anchor="middle">${label}</text>`;
  }

  if (kind === "double-rule") {
    // Tribuna: régua dupla à esquerda do rótulo — o traço de papelaria
    // jurídica, alinhado à esquerda como o resto do preset.
    const yD = y - 6;
    const larguraRegua = 200;
    return `<line x1="${x}" y1="${yD}" x2="${x + larguraRegua}" y2="${yD}" stroke="${accent}" stroke-opacity="0.85" stroke-width="3"/>
  <line x1="${x}" y1="${yD + 8}" x2="${x + larguraRegua}" y2="${yD + 8}" stroke="${accent}" stroke-opacity="0.6" stroke-width="1.5"/>
  <text x="${x + larguraRegua + 24}" y="${y}" ${base} fill="${textColor}">${label}</text>`;
  }

  if (kind === "pulse") {
    // Clínica Clara: traço de batimento saindo do rótulo pros dois
    // lados — o filete reto dos editoriais, com um pico no meio.
    const cxP = x + width / 2;
    const halfP = textW / 2 + 24;
    const yP = y - 6;
    const pulso = (x1: number, x2: number) => {
      const meio = (x1 + x2) / 2;
      return `<path d="M ${x1} ${yP} L ${meio - 26} ${yP} L ${meio - 14} ${yP - 12} L ${meio - 2} ${yP + 12} L ${meio + 10} ${yP} L ${x2} ${yP}" fill="none" stroke="${accent}" stroke-opacity="0.75" stroke-width="2.5" stroke-linejoin="round"/>`;
    };
    return `${pulso(x, cxP - halfP)}${pulso(cxP + halfP, x + width)}
  <text x="${cxP}" y="${y}" ${base} fill="${textColor}" text-anchor="middle">${label}</text>`;
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

/** Foto de banco escolhida pela cascata, pra quem chamou gravar. */
export interface ResolvedStockPhoto {
  id: string;
  credit: string;
}

/**
 * CASCATA DE PROVIDERS — resolve só os BYTES da foto base, sem compor
 * nada, sem tocar em banco nem Storage.
 *
 * Ordem: foto original da matéria (grátis e real) → provider escolhido em
 * Ajustes (stock / Gemini / Pollinations / Fal) → MOCK se faltar key.
 *
 * É a metade CARA do pipeline (é onde tem chamada paga) e roda na
 * GERAÇÃO. A metade barata — compor o layout por cima — foi separada e
 * roda na aprovação, porque é ela que precisa mudar quando o usuário
 * troca template ou cor.
 *
 * A gravação de `stock_photo_id`/`stock_photo_credit` saiu daqui e virou
 * retorno: acoplar a cascata a um postId era o que impedia testá-la.
 */
export async function resolveBaseImage(opts: {
  imagePrompt: string;
  sourceImageUrl?: string | null;
  imageProvider?: "fal" | "gemini" | "pollinations" | "stock";
  /** ids de fotos já usadas pelo usuário — evita repetir a mesma foto. */
  excludeStockIds?: Set<string>;
}): Promise<{ buffer: Buffer; stock: ResolvedStockPhoto | null }> {
  const { imagePrompt, sourceImageUrl = null, imageProvider = "stock" } = opts;
  let base: Buffer | null = sourceImageUrl ? await fetchSourceImage(sourceImageUrl) : null;
  let stock: ResolvedStockPhoto | null = null;
  const prompt = withRealismSuffix(imagePrompt);

  // 'stock': foto real de pessoa de verdade (Pexels → Unsplash), sem
  // os artefatos de rosto/mãos da IA. Sem resultado (sem key ou sem
  // match), cai pra IA de ilustração SEM pessoas — nunca gera rosto.
  if (!base && imageProvider === "stock") {
    try {
      const photo = await searchStockPhoto(imagePrompt, opts.excludeStockIds ?? new Set());
      if (photo) {
        base = await fetchStockPhotoBuffer(photo);
        stock = { id: photo.id, credit: photo.credit };
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

  return { buffer: base, stock };
}

/**
 * Normaliza a base pro quadro da arte, sobe em `{postId}-base.jpg` e mede
 * a luminância.
 *
 * Normalizar AQUI, e não na hora de compor, é o que torna o preview da
 * fila fiel: o recorte é `position: "attention"`, que depende do conteúdo
 * e nenhum `object-fit` de browser reproduz. Gravando a base já recortada,
 * o preview é só um `<img>` full-bleed — e a grade de luminância passa a
 * descrever exatamente os pixels que a arte final vai usar.
 *
 * O bruto fica em `{postId}-base-raw.jpg` pra quem precisar de outro
 * enquadramento depois (ex: o mesmo post virar Reels 9:16).
 */
export async function persistBaseImage(
  postId: string,
  raw: Buffer
): Promise<{ baseUrl: string; grid: LumGrid }> {
  const supabase = createAdminClient();

  const normalized = await sharp(raw)
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "attention" })
    .jpeg({ quality: 92 })
    .toBuffer();

  const { error } = await supabase.storage
    .from("post-images")
    .upload(`${postId}-base.jpg`, normalized, { contentType: "image/jpeg", upsert: true });
  // Falha DURA de propósito: no modelo render-on-approval a base é o
  // insumo do preview e de todo render futuro. Antes este upload era
  // best-effort e um post sem base só dava problema meses depois, na
  // primeira vez que alguém tentava re-renderizar.
  if (error) throw new Error(`Erro no upload da imagem base: ${error.message}`);

  // Bruto guardado à parte, best-effort: é conveniência, não insumo.
  try {
    const rawJpeg = await sharp(raw)
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    await supabase.storage
      .from("post-images")
      .upload(`${postId}-base-raw.jpg`, rawJpeg, { contentType: "image/jpeg", upsert: true });
  } catch (err) {
    console.warn("[image] falha ao guardar a base bruta (não bloqueia)", err);
  }

  const { data } = supabase.storage.from("post-images").getPublicUrl(`${postId}-base.jpg`);
  return {
    baseUrl: `${data.publicUrl}?v=${Date.now()}`,
    grid: await buildLuminanceGrid(normalized),
  };
}

/**
 * Pipeline antigo completo (cascata → base → compõe → sobe). Mantido para
 * os caminhos que ainda compõem na hora (upload manual de imagem, edição
 * de hook). O fluxo de geração usa `resolveBaseImage` + `persistBaseImage`
 * e deixa a composição pra aprovação.
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
  const supabase = createAdminClient();
  const excludeStockIds = new Set<string>();
  if (userId) {
    const { data } = await supabase
      .from("posts")
      .select("stock_photo_id")
      .eq("user_id", userId)
      .not("stock_photo_id", "is", null);
    for (const row of data ?? []) {
      if (row.stock_photo_id) excludeStockIds.add(row.stock_photo_id as string);
    }
  }

  const { buffer, stock } = await resolveBaseImage({
    imagePrompt,
    sourceImageUrl,
    imageProvider,
    excludeStockIds,
  });
  if (stock) {
    await supabase
      .from("posts")
      .update({ stock_photo_id: stock.id, stock_photo_credit: stock.credit })
      .eq("id", postId);
  }

  return composeAndUploadContentImage(buffer, hook, postId, profile, watermark, brand);
}

/**
 * Compõe a PÁGINA 1 no preset de layout do cliente (capa-style: wordmark
 * + headline + contraste automático, sem chip) + logo/marca d'água por
 * cima (independem do layout), e sobe no Storage. Compartilhado entre
 * composeAndUploadContentImage (geração nova) e regenerateContentImage
 * (re-render a partir da base salva).
 */
/**
 * A composição em si da PÁGINA 1, sem tocar em banco nem Storage: layout
 * do preset por cima da foto + logo/marca d'água (que independem do
 * layout). Ponto único de composição — `composeAndUploadFinal` (caminho
 * antigo, que ainda lê o brand_kit ao vivo) e `composeFromSpec` (modelo
 * render-on-approval, que recebe tudo congelado) passam os dois por aqui,
 * então não há como as duas rotas divergirem.
 */
async function composeCoverImage(
  base: Buffer,
  hook: string,
  cardBrand: CardBrand,
  brand: BrandTemplate,
  watermark: boolean,
  bgOverlay: "auto" | "on" | "off" = "auto"
): Promise<Buffer> {
  let final = await composeCoverStyleContent(base, hook, cardBrand, bgOverlay);

  const layers: CompositeLayer[] = [];
  const logoLayer = brand.showLogo ? await buildLogoLayer(brand.logoUrl, WIDTH) : null;
  if (logoLayer) layers.push(logoLayer);
  if (watermark) layers.push(buildWatermarkLayer(WIDTH, HEIGHT));
  if (layers.length) {
    final = await sharp(final).composite(layers).jpeg({ quality: 90 }).toBuffer();
  }
  return final;
}

/**
 * Página 1 a partir de um [[RenderSpec]] congelado — nenhuma leitura de
 * brand_kits. Devolve o buffer; quem chama decide o caminho no Storage
 * (ver src/lib/post-render.ts).
 */
export async function composeFromSpec(
  base: Buffer,
  hook: string,
  spec: RenderSpec
): Promise<Buffer> {
  return composeCoverImage(
    base,
    hook,
    spec.cardBrand,
    spec.brandTemplate,
    spec.watermark,
    spec.bgOverlay
  );
}

/**
 * CONTRA-CAPA (página 2) a partir de um [[RenderSpec]] congelado. O
 * rótulo de identidade (wordmark/@/preset) vem da spec em vez de uma
 * consulta ao brand_kit — mesma informação, sem ida ao banco e sem risco
 * de a arte mudar porque Ajustes mudou depois.
 */
export async function renderClosingFromSpec(
  _postId: string,
  spec: RenderSpec
): Promise<Buffer> {
  return renderTemplateSlide(
    spec.identity,
    spec.profile,
    WIDTH,
    HEIGHT,
    spec.watermark,
    spec.brandTemplate,
    {
      wordmark: spec.cardBrand.wordmark ?? null,
      handle: spec.cardBrand.handle ?? null,
      layoutPreset: spec.cardBrand.layoutPreset,
    }
  );
}

async function composeAndUploadFinal(
  base: Buffer,
  hook: string,
  postId: string,
  watermark: boolean,
  brand: BrandTemplate
): Promise<string> {
  const cardBrand = await fetchCoverBrand(postId, brand.fontFamily);
  const final = await composeCoverImage(base, hook, cardBrand, brand, watermark);

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
