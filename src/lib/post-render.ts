// ============================================================
// Render da arte de um post a partir de um [[RenderSpec]] CONGELADO.
//
// Extraído de resync-layout-preset.ts, que já cobria os cinco casos
// (carrossel com/sem modelo, página 1 do post único, contra-capa, Reels,
// vídeo feed e vídeo de card). A diferença é de onde vêm as decisões: o
// resync lia o brand_kit ao vivo a cada render; aqui tudo vem da spec
// recebida. É isso que permite um post aprovado ser re-renderizado anos
// depois e sair idêntico, e o preview da fila usar a mesma spec resolvida
// ao vivo pra prometer exatamente o que vai sair.
//
// Nenhuma destas funções lê brand_kits, templates ou posts.tpl_* —
// se precisar de um dado novo, ele entra no RenderSpec.
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardLayoutOverride, RenderSpec, Surface, TemplateSpec } from "@/lib/types";

const BUCKET = "post-images";

/** Sobe um arquivo e devolve a URL pública com cache-buster. */
async function upload(path: string, body: Buffer, contentType: string): Promise<string> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload de ${path} falhou: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Baixa uma foto de fundo. Falha vira `null` — a arte cai no fundo sólido. */
async function fetchBg(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** Baixa um arquivo do Storage do post (vídeo fonte, base). */
async function download(path: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`${path} não encontrado no Storage`);
  return Buffer.from(await data.arrayBuffer());
}

// ------------------------------------------------------------
// Post único
// ------------------------------------------------------------

/**
 * Página 1 (foto + título no layout escolhido) e, quando o post tem
 * contra-capa, a página 2. A base é `{postId}-base.jpg`, gravada na
 * geração — re-render nunca chama provider de imagem de novo.
 */
export async function renderSinglePost(
  postId: string,
  hook: string,
  spec: RenderSpec
): Promise<{ imageUrl: string | null; closingUrl: string | null }> {
  const { composeFromSpec, renderClosingFromSpec } = await import("@/lib/image");

  // As duas páginas são independentes de propósito: a contra-capa é 100%
  // sintética (não usa foto), então post antigo sem `-base.jpg` — o upload
  // da base era best-effort antes da migration 040 — ainda tem a página 2
  // atualizada em vez de perder as duas.
  let imageUrl: string | null = null;
  try {
    const base = await download(`${postId}-base.jpg`);
    imageUrl = await upload(`${postId}.jpg`, await composeFromSpec(base, hook, spec), "image/jpeg");
  } catch (err) {
    console.error(`[post-render] página 1 do post ${postId} não pôde ser composta:`, err);
  }

  let closingUrl: string | null = null;
  if (spec.closingPage) {
    closingUrl = await upload(
      `${postId}-closing.jpg`,
      await renderClosingFromSpec(postId, spec),
      "image/jpeg"
    );
  }
  return { imageUrl, closingUrl };
}

// ------------------------------------------------------------
// Carrossel
// ------------------------------------------------------------

/** Superfície do Template Studio correspondente à posição do card. */
function surfaceForCard(idx: number, total: number): Surface {
  if (idx === 0) return "cover_image";
  if (idx === total - 1) return "carousel_last";
  return "carousel_page";
}

type PageKind = "cover" | "closing" | "interior";

function pageKindForCard(idx: number, total: number): PageKind {
  if (idx === 0) return "cover";
  if (idx === total - 1) return "closing";
  return "interior";
}

/**
 * Renderiza cada card. Card com modelo escolhido (template_selection,
 * congelado em spec.templates) vai pelo motor de spec; sem modelo, cai no
 * motor de layouts antigo — mesmo fallback de sempre, zero mudança pra
 * quem nunca escolheu modelo.
 *
 * Falha de UM card não derruba os outros: o card fica com a arte anterior
 * e o erro é registrado. Um carrossel de 10 páginas não pode ser perdido
 * inteiro porque uma foto de fundo caiu.
 */
export async function renderCarouselPost(
  postId: string,
  spec: RenderSpec,
  opts: { fallbackBgUrl?: string | null } = {}
): Promise<{ cardUrls: (string | null)[]; coverUrl: string | null; failed: number }> {
  const supabase = createAdminClient();
  const { renderAndUploadCard } = await import("@/lib/carousel-render");
  const { renderTemplateCardPng } = await import("@/lib/template-render");

  const { data: cards } = await supabase
    .from("carousel_cards")
    .select("*")
    .eq("post_id", postId)
    .order("idx");
  if (!cards || cards.length === 0) return { cardUrls: [], coverUrl: null, failed: 0 };

  const total = cards.length;
  const cardUrls: (string | null)[] = [];
  let coverUrl: string | null = null;
  let failed = 0;

  for (const card of cards) {
    const kind = pageKindForCard(card.idx, total);
    const bgUrl =
      (card.bg_url as string | null) ??
      (kind === "cover" || kind === "closing" ? opts.fallbackBgUrl ?? null : null);
    const bg = await fetchBg(bgUrl);
    // Override manual do card (migration 035): esconder o rótulo de marca
    // ou forçar a cor do texto vale por card e sobrevive a re-render.
    const override = (card.layout as CardLayoutOverride | null) ?? {};
    const chosen: TemplateSpec | undefined = spec.templates[surfaceForCard(card.idx, total)]?.spec;

    try {
      let url: string;
      if (chosen) {
        const png = await renderTemplateCardPng(
          chosen,
          spec.cardBrand,
          { headline: card.headline ?? undefined, body: card.body ?? undefined },
          bg,
          { showLabel: override.showLabel, textColor: override.textColor }
        );
        url = await upload(`${postId}-card-${card.idx}.png`, png, "image/png");
      } else {
        url = await renderAndUploadCard(
          postId,
          {
            idx: card.idx,
            role: card.role as "hook" | "value" | "cta",
            headline: card.headline ?? "",
            body: card.body ?? "",
          },
          spec.cardBrand,
          kind,
          bg,
          spec.profile,
          total,
          override.imagePosition ?? null
        );
      }
      await supabase.from("carousel_cards").update({ image_url: url }).eq("id", card.id);
      cardUrls.push(url);
      if (kind === "cover") coverUrl = url;
    } catch (err) {
      failed++;
      cardUrls.push(null);
      console.error(`[post-render] falha no card ${card.idx} do post ${postId}:`, err);
    }
  }

  return { cardUrls, coverUrl, failed };
}

// ------------------------------------------------------------
// Vídeo
// ------------------------------------------------------------

/**
 * Recompõe o vídeo a partir de `{postId}-video-source.mp4` — o arquivo
 * que o usuário enviou fica guardado justamente pra isso: trocar layout
 * nunca exige reenviar o vídeo.
 *
 * `reels` = quadro 9:16 nativo; `feed`/`feed-blur` = 4:5, mesmo quadro do
 * post único. O pôster salvo é extraído do vídeo FINAL (com overlay), não
 * do bruto — o bruto só serve pra medir contraste.
 */
export async function renderVideoPost(
  postId: string,
  hook: string,
  spec: RenderSpec,
  shape: "reels" | "feed" | "feed-blur"
): Promise<{ videoUrl: string; posterUrl: string }> {
  const source = await download(`${postId}-video-source.mp4`);
  const { extractPosterFrame, composeReelsVideo, composeFeedVideo, composeFeedVideoBlurBg } =
    await import("@/lib/video");

  let finalVideo: Buffer;
  if (shape === "reels") {
    // Reels 9:16: overlay em 1080x1350 encaixado no rodapé do quadro maior.
    // Regra do kit: contraste medido pelo FRAME DE PÔSTER, não pelo vídeo.
    const { buildReelsVideoOverlayPng } = await import("@/lib/image");
    const poster = await extractPosterFrame(source, 0.5);
    const overlay = await buildReelsVideoOverlayPng(hook, spec.cardBrand, poster);
    finalVideo = await composeReelsVideo(source, overlay);
  } else if (shape === "feed-blur") {
    // Feed 4:5 com fundo BORRADO: o mesmo vídeo vira o fundo inteiro
    // (borrado) e a moldura nítida fica por cima.
    //
    // Antes da migration 040 o shape só existia no evento do attach-video,
    // nunca no banco — então re-renderizar SEMPRE reaplicava "feed" (fundo
    // sólido) e um post feito em "feed-blur" perdia o fundo borrado.
    // Estava documentado como limitação conhecida em attach-video.ts.
    const { buildFeedVideoOverlayBlurBg, roundedRectMaskPng } = await import("@/lib/image");
    const poster = await extractPosterFrame(source, 0.5);
    const { overlayPng, frame } = await buildFeedVideoOverlayBlurBg(hook, spec.cardBrand, poster);
    const maskPng = roundedRectMaskPng(frame.w, frame.h, frame.radius);
    finalVideo = await composeFeedVideoBlurBg(source, overlayPng, maskPng, frame);
  } else {
    // Feed 4:5 sólido: vídeo numa moldura própria (16:9, cantos
    // arredondados), texto na seção dele — nunca sobrepostos.
    const { buildFeedVideoOverlay } = await import("@/lib/image");
    const { overlayPng, frame } = buildFeedVideoOverlay(hook, spec.cardBrand);
    finalVideo = await composeFeedVideo(source, overlayPng, frame);
  }

  const finalPoster = await extractPosterFrame(finalVideo, 0.5);
  const [videoUrl, posterUrl] = await Promise.all([
    upload(`${postId}-video.mp4`, finalVideo, "video/mp4"),
    upload(`${postId}-video-poster.jpg`, finalPoster, "image/jpeg"),
  ]);
  return { videoUrl, posterUrl };
}

/**
 * Vídeo anexado a UM card de carrossel (migration 037). O tratamento
 * depende da posição do card (capa/interior/fechamento) — sem isso a capa
 * sairia com estrutura de card do meio, perdendo eyebrow e wordmark.
 */
export async function renderCardVideo(
  cardId: string,
  spec: RenderSpec
): Promise<{ videoUrl: string }> {
  const supabase = createAdminClient();
  const { data: card } = await supabase
    .from("carousel_cards")
    .select("id, post_id, idx, headline, body")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) throw new Error(`card ${cardId} não encontrado`);

  const { count } = await supabase
    .from("carousel_cards")
    .select("*", { count: "exact", head: true })
    .eq("post_id", card.post_id);
  const total = count ?? 0;

  const source = await download(`${card.post_id}-card-${card.idx}-video-source.mp4`);
  const { composeFeedVideo } = await import("@/lib/video");
  const { buildCardVideoOverlay } = await import("@/lib/image");

  const { overlayPng, frame } = buildCardVideoOverlay(
    { headline: card.headline, body: card.body },
    spec.cardBrand,
    { pageKind: pageKindForCard(card.idx, total), index: card.idx, total }
  );
  const finalVideo = await composeFeedVideo(source, overlayPng, frame);
  const videoUrl = await upload(
    `${card.post_id}-card-${card.idx}-video.mp4`,
    finalVideo,
    "video/mp4"
  );
  return { videoUrl };
}
