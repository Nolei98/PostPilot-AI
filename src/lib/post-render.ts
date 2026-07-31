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
import { applyBackground } from "@/lib/render-spec";
import { swipeHintFor } from "@/lib/render-shared";
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
/** Baixa uma URL pública; null se falhar (fundo é opcional, não pode
 * derrubar o render por causa de uma foto que sumiu do Storage). */
async function fetchOptional(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** Baixa se existir; null quando o arquivo não está lá (fundo opcional). */
async function downloadOptional(path: string): Promise<Buffer | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

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
    // Foto de fundo escolhida (048) vence a base gerada — mesma regra do
    // preview, senão a arte final sairia diferente do que a fila mostrou.
    const base = (await downloadOptional(`${postId}-bg.jpg`)) ?? (await download(`${postId}-base.jpg`));
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

/**
 * Cola o chip de perfil (avatar + @handle) na contra-capa, CENTRALIZADO e
 * logo abaixo do texto. A altura vem de `lowestTextBottomFrac` — medida
 * real do bloco de texto da spec, não uma fração fixa: título de 2 linhas
 * e de 5 ancoram em lugares diferentes, e um valor chutado colidiria com
 * o segundo. Sem texto medível, cai no rodapé.
 */
async function withClosingChip(
  png: Buffer,
  kind: PageKind,
  profile: RenderSpec["profile"],
  brand: RenderSpec["cardBrand"],
  spec: TemplateSpec,
  content: Parameters<typeof import("@/lib/template-render").lowestTextBottomFrac>[2]
): Promise<Buffer> {
  // Sem checar showProfileChip: a contra-capa SEMPRE assina, em qualquer
  // layout. A flag governa a capa/página 1, onde o chip é opcional porque
  // o Instagram já mostra o perfil por cima do post — no fim do carrossel
  // não há essa moldura, então a assinatura é o que identifica quem
  // escreveu. É o que carousel-render.ts já fazia no caminho sem template.
  if (kind !== "closing" || !profile) return png;
  const sharp = (await import("sharp")).default;
  const { buildProfileChipLayers } = await import("@/lib/profile-chip");
  const { CARD_W, CARD_H } = await import("@/lib/render-shared");
  const { lowestTextBottomFrac } = await import("@/lib/template-render");
  const { closingChipPlacement } = await import("@/lib/profile-chip");
  const layers = await buildProfileChipLayers(profile, CARD_W, brand.fontFamily, {
    canvasHeight: CARD_H,
    ...closingChipPlacement(lowestTextBottomFrac(spec, brand, content, CARD_W, CARD_H)),
  });
  return sharp(png).composite(layers).png().toBuffer();
}

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
    // Card com vídeo não tem foto de fundo: o fundo é a cor sólida da
    // marca e o vídeo mora numa moldura 16:9 no meio. Até 2026-07-28 o
    // attach-card-video gravava o PÔSTER do vídeo em bg_url, então a arte
    // saía com o frame do vídeo esticado no card inteiro.
    const isVideoCard = card.video_status === "ready";
    const bgUrl = isVideoCard
      ? null
      : (card.bg_url as string | null) ??
        (kind === "cover" || kind === "closing" ? opts.fallbackBgUrl ?? null : null);
    const bg = await fetchBg(bgUrl);
    // Override manual do card (migration 035): esconder o rótulo de marca
    // ou forçar a cor do texto vale por card e sobrevive a re-render.
    const override = (card.layout as CardLayoutOverride | null) ?? {};
    // Fundo por card (override no jsonb `layout`) — a mesma função que o
    // preview usa, senão prévia e arte final divergiriam justo na cor.
    const cardBrand = applyBackground(spec.cardBrand, override.bgMode, override.bgColor);
    const chosen: TemplateSpec | undefined = spec.templates[surfaceForCard(card.idx, total)]?.spec;

    try {
      let url: string;
      if (chosen) {
        const content = {
          headline: card.headline ?? undefined,
          body: card.body ?? undefined,
          // Convite a deslizar SÓ na capa e SÓ quando existe página
          // seguinte — mesma regra do motor sem template (image.ts).
          cta: kind === "cover" && total > 1 ? swipeHintFor(cardBrand.layoutPreset) : undefined,
        };
        const png = await renderTemplateCardPng(chosen, cardBrand, content, bg, {
          showLabel: override.showLabel,
          textColor: override.textColor,
        });
        // Chip de perfil no FECHAMENTO — vale em qualquer layout, com ou
        // sem modelo do Template Studio. O caminho sem template já fazia
        // isso (carousel-render.ts) e o preview desenha o chip sempre
        // (post-preview.ts), então a contra-capa COM modelo saía sem chip
        // e a prévia prometia o que a arte final não entregava.
        const comChip = await withClosingChip(png, kind, spec.profile, cardBrand, chosen, content);
        url = await upload(`${postId}-card-${card.idx}.png`, comChip, "image/png");
      } else {
        url = await renderAndUploadCard(
          postId,
          {
            idx: card.idx,
            role: card.role as "hook" | "value" | "cta",
            headline: card.headline ?? "",
            body: card.body ?? "",
          },
          cardBrand,
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
/**
 * Quanto tempo o título fica quando o post pede que ele SAIA (050).
 *
 * 4s e não 3: o gancho do roteiro ocupa os primeiros 3s
 * (HOOK_MAX_SECONDS), e sumir exatamente no fim dele deixaria a troca
 * acontecendo no mesmo frame da primeira legenda — dois movimentos
 * juntos. O fade de saída começa 0,6s antes.
 */
export const TITLE_EXIT_SECONDS = 4;

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
    //
    // Contraste medido em CINCO frames ao longo do vídeo, não só no do
    // meio. Um frame bastava quando todo vídeo era upload de cena
    // contínua; o vídeo gerado (Sprint D) troca de b-roll a cada
    // segmento, e um Reel de 31/07 saiu com o wordmark invisível nos
    // trechos claros porque o frame medido era escuro. O overlay é um só
    // pro vídeo inteiro, então ele tem que servir ao pior momento.
    const { buildReelsVideoOverlayPng } = await import("@/lib/image");
    const amostras = await Promise.all(
      [0.1, 0.3, 0.5, 0.7, 0.9].map((t) => extractPosterFrame(source, t))
    );
    const overlay = await buildReelsVideoOverlayPng(hook, spec.cardBrand, amostras);
    // Título "some depois" (050): o texto SEMPRE aparece — o que muda é
    // se ele fica. Fixo entrega o assunto o vídeo inteiro; temporário
    // entrega nos primeiros segundos (que é quando a pessoa decide se
    // fica) e depois libera o quadro.
    finalVideo = await composeReelsVideo(
      source,
      overlay,
      spec.videoTitle === "off" ? TITLE_EXIT_SECONDS : undefined
    );
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
    // Fundo por FOTO quando o post tem uma base (2026-07-29); senão, a
    // cor sólida da marca, que era o único fundo possível antes.
    const { buildFeedVideoOverlay, buildFeedVideoOverlayPhotoBg } = await import("@/lib/image");
    const photo = await downloadOptional(`${postId}-bg.jpg`);
    const built = photo
      ? await buildFeedVideoOverlayPhotoBg(hook, spec.cardBrand, photo, spec.bgOverlay)
      : buildFeedVideoOverlay(hook, spec.cardBrand);
    finalVideo = await composeFeedVideo(source, built.overlayPng, built.frame);
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
    .select("id, post_id, idx, headline, body, layout, bg_url")
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
  const { buildCardVideoOverlay, buildCardVideoOverlayPhotoBg } = await import("@/lib/image");

  const override = (card.layout as CardLayoutOverride | null) ?? {};
  const brand = applyBackground(spec.cardBrand, override.bgMode, override.bgColor);
  const conteudo = { headline: card.headline, body: card.body };
  const geometria = { pageKind: pageKindForCard(card.idx, total), index: card.idx, total };

  // Foto do card vira o fundo do card com vídeo (2026-07-29) — mesma
  // regra do preview, senão a arte final ignoraria a foto que a fila
  // mostrou. Sem foto, segue o fundo sólido da marca.
  const photo = card.bg_url ? await fetchOptional(card.bg_url as string) : null;
  const { overlayPng, frame } = photo
    ? await buildCardVideoOverlayPhotoBg(conteudo, brand, photo, geometria)
    : buildCardVideoOverlay(conteudo, brand, geometria);
  const finalVideo = await composeFeedVideo(source, overlayPng, frame);
  const videoUrl = await upload(
    `${card.post_id}-card-${card.idx}-video.mp4`,
    finalVideo,
    "video/mp4"
  );
  return { videoUrl };
}
