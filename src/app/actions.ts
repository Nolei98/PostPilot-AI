"use server";

// ============================================================
// Server Actions do dashboard — rodam no servidor com a sessão
// do usuário (RLS garante que só mexe nos próprios dados).
// ============================================================
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import { enqueue } from "@/lib/enqueue";
import type {
  BrandTemplate,
  CardLayoutOverride,
  IgProfile,
  Surface,
  TemplateSpec,
  VisualIdentity,
} from "@/lib/types";
import type { CardBrand } from "@/lib/carousel-render";
import { resolvePostFontFamily } from "@/lib/font-data";

/** Monta o CardBrand (render de carrossel) a partir de uma linha de brand_kits. */
function buildCardBrand(bk: Record<string, unknown> | null): CardBrand {
  return {
    colorBackground: (bk?.color_background as string) ?? "#0B0B12",
    colorAccent: (bk?.color_accent as string) ?? "#7C5CFF",
    colorText: (bk?.color_text as string) ?? "#FFFFFF",
    fontFamily: resolvePostFontFamily(bk?.post_font_family as string | null | undefined),
    brandName: (bk?.brand_name as string | null) ?? null,
    wordmark: (bk?.wordmark as string | null) ?? null,
    handle: (bk?.ig_handle as string | null) ?? null,
    keywords: (bk?.keywords as string[] | null) ?? null,
    brandMark: (bk?.brand_mark as CardBrand["brandMark"]) ?? "auto",
    layoutPreset: (bk?.layout_preset as CardBrand["layoutPreset"]) ?? "editorial-noir",
  };
}

/**
 * Re-renderiza os cards dos carrosséis PENDENTES do cliente com o
 * Brand Kit atual — chamado ao salvar identidade/template, para o novo
 * visual (@0verlens) aparecer nos carrosséis já na fila (não só nos
 * próximos). Card 0 = capa (divisor). Atualiza image_url dos cards + o
 * do post (thumbnail = capa).
 */
async function resyncCarouselOnPendingPosts(
  clientId: string,
  cardBrand: CardBrand,
  profile: IgProfile
) {
  const supabase = createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("id, news_item_id")
    .eq("client_id", clientId)
    .eq("status", "pending_approval")
    .eq("format", "carousel");
  if (!posts || posts.length === 0) return;

  const { renderAndUploadCard } = await import("@/lib/carousel-render");
  for (const post of posts) {
    // Fallback: imagem da notícia p/ a capa quando o card não tem bg_url salvo.
    let newsImg: string | null = null;
    const { data: news } = await supabase
      .from("news_items")
      .select("image_url")
      .eq("id", post.news_item_id)
      .maybeSingle();
    newsImg = news?.image_url ?? null;

    // select "*" p/ pegar bg_url sem quebrar se a migration 029 não rodou.
    const { data: cards } = await supabase
      .from("carousel_cards")
      .select("*")
      .eq("post_id", post.id)
      .order("idx");
    if (!cards || cards.length === 0) continue;

    let coverUrl: string | null = null;
    const lastIdx = cards.length - 1;
    for (const c of cards) {
      const isCover = c.idx === 0;
      const isClosing = c.idx === lastIdx;
      const pageKind = isCover ? "cover" : isClosing ? "closing" : "interior";
      // Reusa a foto salva (bg_url); capa/fechamento sem bg_url caem na
      // imagem da notícia.
      const bgUrl = (c.bg_url as string | null) ?? (isCover || isClosing ? newsImg : null);
      let bgBuf: Buffer | null = null;
      if (bgUrl) {
        try {
          const r = await fetch(bgUrl);
          if (r.ok) bgBuf = Buffer.from(await r.arrayBuffer());
        } catch {
          /* sem foto → sólido */
        }
      }
      try {
        const url = await renderAndUploadCard(
          post.id,
          {
            idx: c.idx,
            role: c.role as "hook" | "value" | "cta",
            headline: c.headline ?? "",
            body: c.body ?? "",
          },
          cardBrand,
          pageKind,
          bgBuf,
          profile,
          cards.length
        );
        await supabase.from("carousel_cards").update({ image_url: url }).eq("id", c.id);
        if (isCover) coverUrl = url;
      } catch (err) {
        console.error(`[resyncCarousel] falha no card ${c.idx} do post ${post.id}:`, err);
      }
    }
    if (coverUrl) {
      await supabase.from("posts").update({ image_url: coverUrl }).eq("id", post.id);
    }
  }
}

/** Monta o template de marca (fonte + logo) a partir de uma linha de notification_configs */
function buildBrand(config: {
  post_font_family?: string | null;
  logo_url?: string | null;
  show_brand_logo?: boolean | null;
} | null): BrandTemplate {
  return {
    fontFamily: resolvePostFontFamily(config?.post_font_family),
    logoUrl: config?.logo_url ?? null,
    showLogo: config?.show_brand_logo ?? true,
  };
}

// ------------------------------------------------------------
// SINCRONIZAÇÃO: sempre que o perfil ou a identidade visual são
// salvos em Ajustes, os posts ainda na fila (pending_approval) são
// re-renderizados para refletir a mudança — sem custo (Flux não é
// chamado de novo; só a composição local é refeita).
// ------------------------------------------------------------

/**
 * Re-renderiza o CHIP (foto/nome/@/selo) em todos os posts ainda na
 * fila do usuário. Chamada sempre que o perfil é salvo em Ajustes —
 * corrige o chip desatualizado em posts já gerados antes da mudança.
 */
async function resyncChipOnPendingPosts(
  userId: string,
  clientId: string,
  profile: IgProfile,
  brand: BrandTemplate
) {
  const supabase = createClient();
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(
      "id, hook, template_applied, tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, tpl_color_background, tpl_color_accent, tpl_color_text, tpl_color_keyword_box"
    )
    .eq("client_id", clientId)
    .eq("status", "pending_approval");
  if (postsError) {
    // Não deixa a sincronização falhar em silêncio — se a migration não
    // rodou (coluna ausente) ou outro erro de schema, aparece no log.
    console.error("[resyncChipOnPendingPosts] erro ao buscar posts:", postsError.message);
    return;
  }
  if (!posts || posts.length === 0) return;

  const { regenerateContentImage, renderAndUploadTemplateArt } = await import(
    "@/lib/image"
  );
  // Plano free → marca "feito com PostPilot"; pago → sem marca.
  // Computado aqui para o re-render manter (ou remover) a marca correta.
  const { getUserPlan } = await import("@/lib/subscription");
  const watermark = (await getUserPlan(userId)) === "free";

  for (const post of posts) {
    const updates: Record<string, string> = {};

    // Página 1 (conteúdo) — só re-renderiza se a base foi salva
    // (posts gerados antes desse recurso não têm base; ficam como estão)
    let newContentUrl: string | null = null;
    try {
      newContentUrl = await regenerateContentImage(post.id, post.hook, profile, watermark, brand);
    } catch (err) {
      console.error(`[resyncChipOnPendingPosts] erro ao regenerar conteúdo do post ${post.id}:`, err);
    }
    if (newContentUrl) updates.image_url = newContentUrl;

    // Página 2 (fechamento) — mantém a identidade PRÓPRIA do post,
    // só troca o perfil (chip)
    if (post.template_applied) {
      const identity: VisualIdentity = {
        colorBackground: post.tpl_color_background ?? "#0B0B12",
        colorAccent: post.tpl_color_accent ?? "#7C5CFF",
        colorText: post.tpl_color_text ?? "#FFFFFF",
        colorKeywordBox: post.tpl_color_keyword_box ?? "#7C5CFF",
        keyword: post.tpl_keyword ?? "IA",
        topText: post.tpl_top_text ?? "",
        bottomText: post.tpl_bottom_text ?? "",
        ctaEnabled: post.tpl_cta_enabled ?? false,
      };
      updates.closing_image_url = await renderAndUploadTemplateArt(
        post.id,
        identity,
        profile,
        watermark,
        brand
      );
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("posts").update(updates).eq("id", post.id);
    }
  }
}

/**
 * Re-renderiza a página de fechamento nos posts pendentes.
 *
 * - Modo 'all' (força = true): o default rege TODOS os posts por
 *   definição — sincroniza incondicionalmente, mesmo que o post
 *   tenha valores diferentes do default antigo (ex: foi gerado antes
 *   de outra mudança, ou veio de um teste). Não existe "customização
 *   protegida" nesse modo.
 * - Modo 'on_approval' (força = false): só sincroniza os posts cujo
 *   template ainda bate EXATAMENTE com o default ANTIGO — preserva
 *   edições manuais feitas via "Editar" na fila.
 */
async function resyncIdentityOnUnmodifiedPendingPosts(
  userId: string,
  clientId: string,
  oldIdentity: VisualIdentity,
  newIdentity: VisualIdentity,
  profile: IgProfile,
  force: boolean,
  brand: BrandTemplate
) {
  const supabase = createClient();
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(
      "id, tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, tpl_color_background, tpl_color_accent, tpl_color_text, tpl_color_keyword_box"
    )
    .eq("client_id", clientId)
    .eq("status", "pending_approval")
    .eq("template_applied", true);
  if (postsError) {
    console.error(
      "[resyncIdentityOnUnmodifiedPendingPosts] erro ao buscar posts:",
      postsError.message
    );
    return;
  }
  if (!posts || posts.length === 0) return;

  const { renderAndUploadTemplateArt } = await import("@/lib/image");
  const { getUserPlan } = await import("@/lib/subscription");
  const watermark = (await getUserPlan(userId)) === "free";

  for (const post of posts) {
    const matchesOldDefault =
      (post.tpl_keyword ?? "") === oldIdentity.keyword &&
      (post.tpl_top_text ?? "") === oldIdentity.topText &&
      (post.tpl_bottom_text ?? "") === oldIdentity.bottomText &&
      (post.tpl_cta_enabled ?? false) === oldIdentity.ctaEnabled &&
      (post.tpl_color_background ?? "") === oldIdentity.colorBackground &&
      (post.tpl_color_accent ?? "") === oldIdentity.colorAccent &&
      (post.tpl_color_text ?? "") === oldIdentity.colorText &&
      (post.tpl_color_keyword_box ?? "") === oldIdentity.colorKeywordBox;
    if (!force && !matchesOldDefault) continue; // post customizado — preserva (só no modo on_approval)

    const closingImageUrl = await renderAndUploadTemplateArt(
      post.id,
      newIdentity,
      profile,
      watermark,
      brand
    );
    await supabase
      .from("posts")
      .update({
        closing_image_url: closingImageUrl,
        tpl_keyword: newIdentity.keyword,
        tpl_top_text: newIdentity.topText,
        tpl_bottom_text: newIdentity.bottomText,
        tpl_cta_enabled: newIdentity.ctaEnabled,
        tpl_color_background: newIdentity.colorBackground,
        tpl_color_accent: newIdentity.colorAccent,
        tpl_color_text: newIdentity.colorText,
        tpl_color_keyword_box: newIdentity.colorKeywordBox,
      })
      .eq("id", post.id);
  }
}

/**
 * Marca o post pra render e dispara o job (migration 040). Chamado por
 * TODA saída da fila (aprovar e agendar) — é aqui que a arte passa a
 * existir de verdade; até este ponto o que se via era preview ao vivo.
 *
 * O token novo é o que invalida um render anterior ainda em voo: aprovar
 * → desistir → aprovar de novo não pode terminar com a arte do primeiro
 * run gravada por cima da do segundo.
 */
async function requestRender(postId: string, userId: string) {
  const supabase = createClient();
  const token = crypto.randomUUID();
  await supabase
    .from("posts")
    .update({ render_status: "pending", render_error: null, render_token: token })
    .eq("id", postId);
  await enqueue("requestRender", {
    name: "post/render.requested",
    data: { postId, userId, token },
  });
}

/**
 * Tenta o render de novo depois de um `render_status='error'` (botão na
 * tela Prontos). Token novo, mesmo caminho da aprovação — não existe
 * "retomar" um render pela metade: ele é barato e idempotente.
 */
export async function retryRender(postId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  await requestRender(postId, user.id);
  revalidatePath("/ready");
}

/** Aprova um post → vai para a tela "post pronto" */
export async function approvePost(postId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("posts")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", "pending_approval"); // só aprova o que está na fila
  if (error) throw new Error(error.message);

  await requestRender(postId, user.id);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * Agenda um post pra publicação automática via Graph API (Sprint C) —
 * alternativa ao "Aprovar" manual. Exige Instagram conectado pro
 * cliente do post (senão o post ficaria 'scheduled' pra sempre, sem
 * ninguém publicar). O job publish-scheduled-posts (Inngest, cron a
 * cada 5min) pega daqui pra frente.
 */
export async function schedulePost(postId: string, scheduledForIso: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data: post } = await supabase
    .from("posts")
    .select("client_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) throw new Error("Post não encontrado");

  const { data: conn } = await supabase
    .from("social_connections")
    .select("id")
    .eq("client_id", post.client_id)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) throw new Error("Conecte o Instagram em Ajustes antes de agendar");

  const { error } = await supabase
    .from("posts")
    .update({ status: "scheduled", scheduled_for: scheduledForIso })
    .eq("id", postId)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);

  // Agendar também sai da fila, então também congela a arte agora. O job
  // de publicação só pega post com render_status='ready'.
  await requestRender(postId, user.id);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * Estado de render de um post que VOLTA pra fila (migration 040): a arte
 * deixa de estar congelada e o preview ao vivo manda de novo. Zerar o
 * token também mata um render ainda em voo — todo write dele é guardado
 * por `render_token`, que não vai mais bater.
 */
const backToQueueRender = {
  render_status: "none" as const,
  render_error: null,
  render_spec: null,
  render_token: null,
};

/** Cancela o agendamento (Sprint C) — volta pro estado pré-agendamento (fila). */
export async function cancelSchedule(postId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "pending_approval", scheduled_for: null, ...backToQueueRender })
    .eq("id", postId)
    .eq("status", "scheduled");
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/** Descarta um post da fila */
export async function discardPost(postId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "discarded" })
    .eq("id", postId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

/**
 * Salva edições de título (hook)/legenda/hashtags feitas na fila.
 * Se o hook mudou, re-renderiza a imagem em cima da base salva —
 * sem custo (não busca foto/gera de novo, só refaz o texto no SVG).
 */
export async function updatePost(
  postId: string,
  fields: { hook: string; caption: string; hashtags: string }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data: post } = await supabase
    .from("posts")
    .select("hook, client_id")
    .eq("id", postId)
    .single();

  const updates: { hook: string; caption: string; hashtags: string; image_url?: string } = {
    hook: fields.hook,
    caption: fields.caption,
    hashtags: fields.hashtags,
  };

  if (post && post.hook !== fields.hook) {
    const { data: config } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("client_id", post.client_id)
      .maybeSingle();
    const profile: IgProfile = {
      handle: config?.ig_handle ?? "seuperfil.ia",
      displayName: config?.ig_display_name ?? "Seu Perfil de IA",
      avatarUrl: config?.ig_avatar_url ?? null,
      verified: config?.ig_verified ?? false,
      showProfileChip: config?.show_profile_chip ?? true,
    };
    const { getUserPlan } = await import("@/lib/subscription");
    const watermark = (await getUserPlan(user.id)) === "free";
    const { regenerateContentImage } = await import("@/lib/image");
    const newImageUrl = await regenerateContentImage(postId, fields.hook, profile, watermark, buildBrand(config));
    if (newImageUrl) updates.image_url = newImageUrl;
  }

  const { error } = await supabase.from("posts").update(updates).eq("id", postId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * Sobe uma imagem gerada MANUALMENTE pelo usuário (ex: colou o
 * image_prompt do post no Gemini/nano banana e baixou o resultado) e
 * substitui a página de conteúdo do post, aplicando o mesmo overlay
 * de chip + hook do fluxo automático.
 */
export async function uploadPostImage(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const postId = String(formData.get("post_id") ?? "");
  const file = formData.get("image") as File | null;
  if (!postId || !file || file.size === 0) {
    return { ok: false, error: "Selecione uma imagem." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: "Imagem muito grande (máx 20MB)." };
  }

  const { data: post } = await supabase
    .from("posts")
    .select("id, hook, client_id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!post) return { ok: false, error: "Post não encontrado." };

  const { data: notif } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", post.client_id)
    .maybeSingle();
  const profile: IgProfile = {
    handle: notif?.ig_handle ?? "seuperfil.ia",
    displayName: notif?.ig_display_name ?? "Seu Perfil de IA",
    avatarUrl: notif?.ig_avatar_url ?? null,
    verified: notif?.ig_verified ?? false,
    showProfileChip: notif?.show_profile_chip ?? true,
  };

  try {
    const { getUserPlan } = await import("@/lib/subscription");
    const watermark = (await getUserPlan(user.id)) === "free";
    const { applyCustomBaseImage } = await import("@/lib/image");
    const buf = Buffer.from(await file.arrayBuffer());
    const imageUrl = await applyCustomBaseImage(
      postId,
      post.hook,
      profile,
      watermark,
      buf,
      buildBrand(notif)
    );

    const { error } = await supabase
      .from("posts")
      .update({ image_url: imageUrl })
      .eq("id", postId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    console.error("[uploadPostImage] falha ao processar imagem:", err);
    return {
      ok: false,
      error: "Não foi possível processar essa imagem. Tente um JPG/PNG.",
    };
  }

  revalidatePath("/");
  revalidatePath("/ready");
  return { ok: true };
}

/**
 * Anexa um vídeo a um post pendente (Fase 4, kit v2 §3) — sobe o
 * arquivo bruto pro Storage e dispara o processamento em BACKGROUND
 * (Inngest): o ffmpeg compõe o quadro por cima (Reels 9:16 ou feed 4:5,
 * migration 036 — `shape` no FormData), o que pode levar dezenas de
 * segundos — não dá pra fazer síncrono como a foto.
 * `video_status` vira 'processing' na hora; a fila mostra isso e
 * atualiza quando o job terminar (revalidatePath cobre o próximo load).
 */
export async function uploadPostVideo(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const postId = String(formData.get("post_id") ?? "");
  const file = formData.get("video") as File | null;
  // "reels" (9:16, default), "feed" (4:5, fundo sólido — migration 036)
  // ou "feed-blur" (4:5, fundo = o próprio vídeo borrado, 2026-07-23) —
  // decide o quadro de composição em attach-video.ts.
  const shapeRaw = formData.get("shape");
  const shape = shapeRaw === "feed" ? "feed" : shapeRaw === "feed-blur" ? "feed-blur" : "reels";
  if (!postId || !file || file.size === 0) {
    return { ok: false, error: "Selecione um vídeo." };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { ok: false, error: "Vídeo muito grande (máx 50MB)." };
  }

  const { data: post } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!post) return { ok: false, error: "Post não encontrado." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from("post-images")
      .upload(`${postId}-video-source.mp4`, buf, {
        contentType: file.type || "video/mp4",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    const { error } = await supabase
      .from("posts")
      .update({ video_status: "processing", video_error: null })
      .eq("id", postId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    console.error("[uploadPostVideo] falha ao subir vídeo:", err);
    return {
      ok: false,
      error: "Não foi possível processar esse vídeo. Tente outro arquivo (.mp4/.mov).",
    };
  }

  // COM await de propósito (ver enqueue() em @/lib/enqueue): sem ele o
  // vídeo ficava "processando" pra sempre em produção, porque a função
  // serverless congela no return antes do evento sair.
  await enqueue("uploadPostVideo", {
    name: "post/attach-video.requested",
    data: { postId, userId: user.id, shape },
  });

  revalidatePath("/");
  revalidatePath("/ready");
  return { ok: true };
}

/**
 * Anexa um vídeo a um CARD do carrossel (migration 037) — mesmo padrão
 * de uploadPostVideo: sobe o arquivo bruto pro Storage e dispara o
 * processamento em BACKGROUND (Inngest); o ffmpeg compõe o card
 * "interior com vídeo" (título + moldura 16:9 + corpo). RLS de
 * carousel_cards já garante que o card pertence ao usuário (join com
 * posts.user_id) — não precisa de checagem extra aqui.
 */
export async function uploadCarouselCardVideo(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const cardId = String(formData.get("card_id") ?? "");
  const file = formData.get("video") as File | null;
  if (!cardId || !file || file.size === 0) {
    return { ok: false, error: "Selecione um vídeo." };
  }
  if (file.size > 50 * 1024 * 1024) {
    return { ok: false, error: "Vídeo muito grande (máx 50MB)." };
  }

  const { data: card } = await supabase
    .from("carousel_cards")
    .select("id, post_id, idx")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) return { ok: false, error: "Card não encontrado." };

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const admin = createAdminClient();
    const sourcePath = `${card.post_id}-card-${card.idx}-video-source.mp4`;
    const { error: upErr } = await admin.storage.from("post-images").upload(sourcePath, buf, {
      contentType: file.type || "video/mp4",
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);

    const { error } = await supabase
      .from("carousel_cards")
      .update({ video_status: "processing", video_error: null })
      .eq("id", cardId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    console.error("[uploadCarouselCardVideo] falha ao subir vídeo:", err);
    return {
      ok: false,
      error: "Não foi possível processar esse vídeo. Tente outro arquivo (.mp4/.mov).",
    };
  }

  await enqueue("uploadCarouselCardVideo", {
    name: "card/attach-video.requested",
    data: { cardId, userId: user.id },
  });

  revalidatePath("/");
  revalidatePath("/ready");
  return { ok: true };
}

/**
 * Marca um post aprovado como publicado (Plano B: publicação manual).
 * Reusa o status 'published' — na Fase 2 a Graph API usa o mesmo.
 */
export async function markAsPosted(postId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "published" })
    .eq("id", postId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  revalidatePath("/ready");
}

/**
 * Dispara a varredura de fontes manualmente (botão no dashboard).
 * Cria uma linha em scan_runs ANTES de mandar o evento — o job (que
 * roda em background no Inngest) atualiza essa linha quando termina,
 * e o botão faz polling nela (getScanRunStatus) pra mostrar
 * "rodando..." → "nada novo" ou "N encontrados, gerando...".
 */
export async function triggerScan(): Promise<{
  ok: boolean;
  error?: string;
  scanRunId?: string;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  try {
    const { getActiveClientId } = await import("@/lib/client-context");
    const clientId = await getActiveClientId();
    const { data: run, error } = await supabase
      .from("scan_runs")
      .insert({ requested_by: user.id, client_id: clientId, status: "running" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await inngest.send({
      name: "news/scan.requested",
      // clientId → scan manual varre só as fontes do cliente ativo.
      data: { scanRunId: run.id as string, clientId: clientId ?? undefined },
    });
    return { ok: true, scanRunId: run.id as string };
  } catch (err) {
    console.error("[triggerScan] falha ao iniciar varredura:", err);
    return {
      ok: false,
      error:
        "Não foi possível iniciar a varredura. Verifique se INNGEST_EVENT_KEY e INNGEST_SIGNING_KEY estão configuradas.",
    };
  }
}

/** Status de uma varredura disparada manualmente — usado pelo botão via polling */
export async function getScanRunStatus(scanRunId: string): Promise<{
  status: "running" | "done" | "error";
  candidates?: number;
  errorMessage?: string;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("scan_runs")
    .select("status, candidates, error_message")
    .eq("id", scanRunId)
    .maybeSingle();
  if (error || !data) return { status: "error", errorMessage: "Varredura não encontrada." };
  return {
    status: data.status as "running" | "done" | "error",
    candidates: data.candidates ?? undefined,
    errorMessage: data.error_message ?? undefined,
  };
}

/** Adiciona uma fonte RSS */
export async function addSource(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const { error } = await supabase.from("source_configs").insert({
    user_id: user.id,
    client_id: clientId,
    name: String(formData.get("name") ?? "").trim(),
    feed_url: String(formData.get("feed_url") ?? "").trim(),
    threshold: Number(formData.get("threshold") ?? 70),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/** Remove uma fonte RSS */
export async function deleteSource(sourceId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("source_configs")
    .delete()
    .eq("id", sourceId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/** Salva o chat_id do Telegram para notificações */
export async function saveTelegramChatId(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const chatId = String(formData.get("telegram_chat_id") ?? "").trim() || null;
  const postLanguage =
    String(formData.get("post_language") ?? "").trim() || "pt-BR";
  const textProviderRaw = formData.get("text_provider");
  const textProvider =
    textProviderRaw === "claude" || textProviderRaw === "pollinations"
      ? textProviderRaw
      : "gemini";
  const imageProviderRaw = formData.get("image_provider");
  const imageProvider =
    imageProviderRaw === "fal" ||
    imageProviderRaw === "pollinations" ||
    imageProviderRaw === "gemini"
      ? imageProviderRaw
      : "stock";

  // Telegram é per-usuário (notifica o dono, não a marca).
  const { error } = await supabase.from("notification_configs").upsert(
    { user_id: user.id, telegram_chat_id: chatId },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);

  // Idioma + providers são do cliente ativo (config de geração da marca).
  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (clientId) {
    const { error: bkError } = await supabase
      .from("brand_kits")
      .update({
        post_language: postLanguage,
        text_provider: textProvider,
        image_provider: imageProvider,
      })
      .eq("client_id", clientId);
    if (bkError) throw new Error(bkError.message);
  }
  revalidatePath("/settings");
}

/**
 * Salva o perfil do Instagram (foto, nome, @) exibido nos posts.
 * A foto sobe para o bucket público 'avatars' com o user_id no nome.
 */
export async function saveIgProfile(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const handle = String(formData.get("ig_handle") ?? "")
    .trim()
    .replace(/^@/, ""); // aceita com ou sem @
  const displayName = String(formData.get("ig_display_name") ?? "").trim();

  // Upload da foto (opcional). Falha aqui (tamanho, erro de upload) não
  // derruba o salvamento do resto do perfil — só a foto fica como estava.
  let avatarUrl: string | undefined;
  const file = formData.get("avatar") as File | null;
  if (file && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) {
      console.warn(`[saveIgProfile] foto rejeitada (${file.size} bytes > 2MB)`);
    } else {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${clientId}.${ext}`; // avatar por cliente (tenant)
      // Upload via client ADMIN (service role): esta server action roda só
      // no servidor e o nome do arquivo é o user_id autenticado — seguro,
      // e dispensa policies de storage para o usuário comum.
      const admin = createAdminClient();
      const { error: uploadError } = await admin.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        console.error("[saveIgProfile] falha no upload da foto:", uploadError.message);
      } else {
        const { data } = admin.storage.from("avatars").getPublicUrl(path);
        // cache-bust: URL muda a cada upload para o browser não mostrar a antiga
        avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      }
    }
  }

  // Checkboxes: presentes no form → "on"; ausentes → false
  const verified = formData.get("ig_verified") === "on";
  const showChip = formData.get("show_profile_chip") === "on";

  const { error } = await supabase
    .from("brand_kits")
    .update({
      ...(handle && { ig_handle: handle }),
      ...(displayName && { ig_display_name: displayName }),
      ...(avatarUrl && { ig_avatar_url: avatarUrl }),
      ig_verified: verified,
      show_profile_chip: showChip,
    })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  // Sincroniza o chip (foto/nome/@/selo) nos posts ainda na fila —
  // sem isso, um post gerado antes da mudança ficaria com dado velho.
  const { data: freshConfig } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId)
    .single();
  if (freshConfig) {
    const profile: IgProfile = {
      handle: freshConfig.ig_handle,
      displayName: freshConfig.ig_display_name,
      avatarUrl: freshConfig.ig_avatar_url,
      verified: freshConfig.ig_verified,
      showProfileChip: freshConfig.show_profile_chip,
    };
    await resyncChipOnPendingPosts(user.id, clientId, profile, buildBrand(freshConfig));
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Salva a identidade visual default (Ajustes): cores, palavra-chave,
 * textos e o modo de aplicação ('all' | 'on_approval').
 */
export async function saveVisualIdentity(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const hex = (name: string, fallback: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  };
  // Textos: NÃO usar .trim() aqui — apagaria quebras de linha
  // intencionais no início/fim (opção de "pular linha" pedida).
  const text = (name: string, fallback: string) => {
    const v = String(formData.get(name) ?? "");
    return v.length > 0 ? v : fallback;
  };

  const mode =
    formData.get("template_apply_mode") === "on_approval" ? "on_approval" : "all";

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  // Captura o default ANTIGO antes de sobrescrever — usado para
  // detectar quais posts na fila ainda não foram customizados
  // individualmente (esses sim são re-sincronizados; os editados
  // manualmente são preservados).
  const { data: oldConfig } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  // colorAccent NÃO vem do formData deste form de propósito — é editado
  // só em "Cor da marca" (saveBrandTemplate/BrandColorPicker), pra não ter
  // 2 controles da mesma coluna se sobrescrevendo. Aqui só lê o valor
  // atual (oldConfig) pra manter o resync/preview corretos.
  const newIdentity: VisualIdentity = {
    colorBackground: hex("color_background", "#0B0B12"),
    colorAccent: oldConfig?.color_accent ?? "#7C5CFF",
    colorText: hex("color_text", "#FFFFFF"),
    colorKeywordBox: hex("color_keyword_box", "#7C5CFF"),
    keyword: text("tpl_keyword", "IA"),
    topText: text("tpl_top_text", "A NOVIDADE DE"),
    bottomText: text("tpl_bottom_text", "QUE MUDA TUDO"),
    ctaEnabled: formData.get("tpl_cta_enabled") === "on",
  };

  const { error } = await supabase
    .from("brand_kits")
    .update({
      color_background: newIdentity.colorBackground,
      color_text: newIdentity.colorText,
      color_keyword_box: newIdentity.colorKeywordBox,
      tpl_keyword: newIdentity.keyword,
      tpl_top_text: newIdentity.topText,
      tpl_bottom_text: newIdentity.bottomText,
      tpl_cta_enabled: newIdentity.ctaEnabled,
      template_apply_mode: mode,
    })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  // Sincroniza os posts na fila que ainda usam o default (não
  // customizados post-a-post).
  if (oldConfig) {
    const oldIdentity: VisualIdentity = {
      colorBackground: oldConfig.color_background,
      colorAccent: oldConfig.color_accent,
      colorText: oldConfig.color_text,
      colorKeywordBox: oldConfig.color_keyword_box,
      keyword: oldConfig.tpl_keyword,
      topText: oldConfig.tpl_top_text,
      bottomText: oldConfig.tpl_bottom_text,
      ctaEnabled: oldConfig.tpl_cta_enabled ?? false,
    };
    const profile: IgProfile = {
      handle: oldConfig.ig_handle,
      displayName: oldConfig.ig_display_name,
      avatarUrl: oldConfig.ig_avatar_url,
      verified: oldConfig.ig_verified,
      showProfileChip: oldConfig.show_profile_chip,
    };
    await resyncIdentityOnUnmodifiedPendingPosts(
      user.id,
      clientId,
      oldIdentity,
      newIdentity,
      profile,
      mode === "all", // modo 'all' sincroniza tudo, sem checar customização
      buildBrand(oldConfig)
    );
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Salva o Template da marca (logo + fonte das artes) e re-sincroniza
 * os posts ainda na fila com a nova fonte/logo/cor — mesmo mecanismo
 * de resync do perfil (regenera a partir da imagem BASE salva, sem
 * chamar o Flux de novo).
 */
export async function saveBrandTemplate(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const postFontFamily = String(formData.get("post_font_family") ?? "inter");
  const brandName = String(formData.get("brand_name") ?? "").trim();
  const brandColorRaw = String(formData.get("brand_color") ?? "").trim();
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(brandColorRaw) ? brandColorRaw : null;
  const showBrandLogo = formData.get("show_brand_logo") === "on";

  // Upload da logo (opcional) — mesmo bucket público 'avatars' usado
  // pela foto de perfil, com sufixo próprio no nome do arquivo.
  let logoUrl: string | undefined;
  const file = formData.get("logo") as File | null;
  if (file && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) {
      console.warn(`[saveBrandTemplate] logo rejeitada (${file.size} bytes > 2MB)`);
    } else {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${clientId}-logo.${ext}`; // logo por cliente (tenant)
      const admin = createAdminClient();
      const { error: uploadError } = await admin.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) {
        console.error("[saveBrandTemplate] falha no upload da logo:", uploadError.message);
      } else {
        const { data } = admin.storage.from("avatars").getPublicUrl(path);
        logoUrl = `${data.publicUrl}?v=${Date.now()}`;
      }
    }
  }

  // Captura o default ANTIGO — necessário pra resincronizar a cor da
  // contra-capa nos posts ainda não customizados (mesma lógica de
  // saveVisualIdentity).
  const { data: oldConfig } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  const { error } = await supabase
    .from("brand_kits")
    .update({
      post_font_family: postFontFamily,
      show_brand_logo: showBrandLogo,
      ...(brandName && { brand_name: brandName }),
      ...(logoUrl && { logo_url: logoUrl }),
      ...(brandColor && { color_accent: brandColor }),
    })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  const { data: freshConfig } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId)
    .single();
  if (freshConfig) {
    const profile: IgProfile = {
      handle: freshConfig.ig_handle,
      displayName: freshConfig.ig_display_name,
      avatarUrl: freshConfig.ig_avatar_url,
      verified: freshConfig.ig_verified,
      showProfileChip: freshConfig.show_profile_chip,
    };
    const brand = buildBrand(freshConfig);
    await resyncChipOnPendingPosts(user.id, clientId, profile, brand);
    // Carrosséis pendentes também re-renderizam com a nova fonte/logo/cor.
    await resyncCarouselOnPendingPosts(clientId, buildCardBrand(freshConfig), profile);

    if (brandColor && oldConfig) {
      const oldIdentity: VisualIdentity = {
        colorBackground: oldConfig.color_background,
        colorAccent: oldConfig.color_accent,
        colorText: oldConfig.color_text,
        colorKeywordBox: oldConfig.color_keyword_box,
        keyword: oldConfig.tpl_keyword,
        topText: oldConfig.tpl_top_text,
        bottomText: oldConfig.tpl_bottom_text,
        ctaEnabled: oldConfig.tpl_cta_enabled ?? false,
      };
      const newIdentity: VisualIdentity = { ...oldIdentity, colorAccent: brandColor };
      await resyncIdentityOnUnmodifiedPendingPosts(user.id, clientId, oldIdentity, newIdentity, profile, false, brand);
    }
  }

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Salva o nicho do negócio (Ajustes) — direciona o tom dos posts
 * gerados e o critério de triagem viral (ver lib/ai/generate.ts e
 * lib/ai/triage.ts). Não re-renderiza posts existentes: só afeta
 * conteúdo gerado dali pra frente.
 */
export async function saveNiche(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const niche = String(formData.get("niche") ?? "").trim() || null;

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const { error } = await supabase
    .from("brand_kits")
    .update({ niche })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  // Semeia as fontes RSS curadas do nicho — sem isso, trocar o nicho
  // em Ajustes não trazia nenhuma fonte nova pra fila gerar conteúdo.
  // ignoreDuplicates: fontes que o usuário já tem (mesma feed_url) não
  // duplicam nem sobrescrevem o threshold customizado.
  const { sourcesForNiche } = await import("@/lib/niche-sources");
  const rows = sourcesForNiche(niche).map((s) => ({
    user_id: user.id,
    client_id: clientId,
    name: s.name,
    feed_url: s.feed_url,
    threshold: s.threshold,
  }));
  const { error: sourcesError } = await supabase
    .from("source_configs")
    .upsert(rows, { onConflict: "client_id,feed_url", ignoreDuplicates: true });
  if (sourcesError) {
    console.error("[saveNiche] falha ao semear fontes do nicho:", sourcesError.message);
  }

  revalidatePath("/settings");
}

/**
 * Aplica (ou edita) a identidade visual como CONTRA-CAPA (última
 * página do carrossel) de um post. NÃO mexe na página de conteúdo
 * (image_url) — apenas cria/re-renderiza closing_image_url.
 * Override por post — o default de Ajustes não muda.
 */
export async function applyTemplateToPost(
  postId: string,
  fields: {
    keyword: string;
    topText: string;
    bottomText: string;
    ctaEnabled: boolean;
    colorBackground: string;
    colorAccent: string;
    colorText: string;
    colorKeywordBox: string;
  }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // Confirma que o post é do usuário (RLS já garante, mas o erro fica claro)
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id, client_id")
    .eq("id", postId)
    .single();
  if (postError || !post) throw new Error("Post não encontrado");

  // Perfil para o chip (mesma fonte da geração) — brand_kit do cliente do post
  const { data: config } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", post.client_id)
    .maybeSingle();

  const identity: VisualIdentity = {
    colorBackground: fields.colorBackground,
    colorAccent: fields.colorAccent,
    colorText: fields.colorText,
    colorKeywordBox: fields.colorKeywordBox,
    keyword: fields.keyword,
    topText: fields.topText,
    bottomText: fields.bottomText,
    ctaEnabled: fields.ctaEnabled,
  };
  const profile = {
    handle: config?.ig_handle ?? "seuperfil.ia",
    displayName: config?.ig_display_name ?? "Seu Perfil de IA",
    avatarUrl: config?.ig_avatar_url ?? null,
    verified: config?.ig_verified ?? false,
    showProfileChip: config?.show_profile_chip ?? true,
  };

  // Renderiza/re-renderiza APENAS a página de fechamento (path próprio
  // `{postId}-closing.jpg`) — a página de conteúdo fica intacta.
  // URL ganha ?v= novo para furar o cache do browser.
  const { renderAndUploadTemplateArt } = await import("@/lib/image");
  const { getUserPlan } = await import("@/lib/subscription");
  const watermark = (await getUserPlan(user.id)) === "free";
  const closingImageUrl = await renderAndUploadTemplateArt(
    postId,
    identity,
    profile,
    watermark,
    buildBrand(config)
  );

  const { error } = await supabase
    .from("posts")
    .update({
      closing_image_url: closingImageUrl,
      template_applied: true,
      tpl_keyword: fields.keyword,
      tpl_top_text: fields.topText,
      tpl_bottom_text: fields.bottomText,
      tpl_cta_enabled: fields.ctaEnabled,
      tpl_color_background: fields.colorBackground,
      tpl_color_accent: fields.colorAccent,
      tpl_color_text: fields.colorText,
      tpl_color_keyword_box: fields.colorKeywordBox,
    })
    .eq("id", postId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * Remove a contra-capa (2ª página) de um post — desfaz o que
 * applyTemplateToPost aplicou. Mantém os campos tpl_* salvos (não
 * apaga), então se o usuário marcar de novo, o modal reabre com os
 * últimos valores em vez de voltar pro default de Ajustes.
 */
export async function removeTemplateFromPost(postId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("posts")
    .update({ template_applied: false, closing_image_url: null })
    .eq("id", postId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * "Desistir" de um post já aprovado: reverte para a fila
 * (pending_approval) ou descarta de vez, conforme escolha.
 */
export async function revertApproval(
  postId: string,
  target: "pending_approval" | "discarded"
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({
      status: target,
      approved_at: null,
      // Descartado não precisa disso, mas zerar é inofensivo e evita um
      // segundo caminho de update só pra distinguir os dois destinos.
      ...backToQueueRender,
    })
    .eq("id", postId)
    .eq("status", "approved"); // só reverte o que está aprovado
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * Edita o texto de UM card de carrossel e re-renderiza só ele (SVG →
 * PNG com o Brand Kit do cliente do post). Não toca nos outros cards.
 */
export async function updateCarouselCard(
  cardId: string,
  fields: {
    headline: string;
    body: string;
    showLabel?: boolean;
    textColor?: "auto" | "light" | "dark";
    imagePosition?: "top" | "bottom" | null;
  }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // RLS garante posse (via post). Pega o card + o cliente do post.
  const { data: card, error: cardErr } = await supabase
    .from("carousel_cards")
    .select("id, post_id, idx, role, bg_url, layout")
    .eq("id", cardId)
    .single();
  if (cardErr || !card) throw new Error("Card não encontrado");

  const { count: totalCards } = await supabase
    .from("carousel_cards")
    .select("id", { count: "exact", head: true })
    .eq("post_id", card.post_id);
  const lastIdx = (totalCards ?? 1) - 1;
  const pageKind =
    card.idx === 0 ? "cover" : card.idx === lastIdx ? "closing" : "interior";
  const surface: Surface =
    pageKind === "cover" ? "cover_image" : pageKind === "closing" ? "carousel_last" : "carousel_page";

  const { data: post } = await supabase
    .from("posts")
    .select("client_id")
    .eq("id", card.post_id)
    .single();
  const { data: bk } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", post?.client_id ?? "")
    .maybeSingle();

  // Reusa a foto salva do card (se houver) — editar o texto não deve
  // derrubar o fundo pra cor sólida.
  let bgBuf: Buffer | null = null;
  if (card.bg_url) {
    try {
      const r = await fetch(card.bg_url as string);
      if (r.ok) bgBuf = Buffer.from(await r.arrayBuffer());
    } catch {
      /* sem foto → sólido */
    }
  }

  const { resolvePostFontFamily } = await import("@/lib/font-data");
  const cardBrand: CardBrand = {
    colorBackground: bk?.color_background ?? "#0B0B12",
    colorAccent: bk?.color_accent ?? "#7C5CFF",
    colorText: bk?.color_text ?? "#FFFFFF",
    fontFamily: resolvePostFontFamily(bk?.post_font_family),
    brandName: bk?.brand_name ?? null,
    wordmark: bk?.wordmark ?? null,
    handle: bk?.ig_handle ?? null,
    keywords: bk?.keywords ?? null,
    brandMark: bk?.brand_mark ?? "auto",
    layoutPreset: bk?.layout_preset ?? "editorial-noir",
  };

  // Override do card (B9) — merge com o que já existia, só os campos enviados.
  const previousLayout = (card.layout as CardLayoutOverride | null) ?? {};
  const layout: CardLayoutOverride = {
    ...previousLayout,
    ...(fields.showLabel !== undefined ? { showLabel: fields.showLabel } : {}),
    ...(fields.textColor !== undefined ? { textColor: fields.textColor } : {}),
    ...(fields.imagePosition !== undefined ? { imagePosition: fields.imagePosition } : {}),
  };

  // Template Studio (B15): se o cliente escolheu um modelo pra essa
  // superfície, edita/re-renderiza por ele (senão o texto voltaria a sair
  // no motor antigo, revertendo silenciosamente a escolha de modelo).
  const { resolveTemplateSpecs } = await import("@/lib/template-selection");
  const templateSelection =
    (bk?.template_selection as Partial<Record<Surface, string>> | null) ?? {};
  const specs = await resolveTemplateSpecs(templateSelection, [surface]);
  const chosenSpec = specs[surface];

  let imageUrl: string;
  if (chosenSpec) {
    const { renderTemplateCardPng } = await import("@/lib/template-render");
    const png = await renderTemplateCardPng(
      chosenSpec,
      cardBrand,
      { headline: fields.headline, body: fields.body },
      bgBuf,
      { showLabel: layout.showLabel, textColor: layout.textColor }
    );
    const path = `${card.post_id}-card-${card.idx}.png`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("post-images")
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(`upload do card falhou: ${uploadError.message}`);
    const { data: pub } = admin.storage.from("post-images").getPublicUrl(path);
    imageUrl = `${pub.publicUrl}?v=${Date.now()}`;
  } else {
    const { renderAndUploadCard } = await import("@/lib/carousel-render");
    imageUrl = await renderAndUploadCard(
      card.post_id,
      {
        idx: card.idx,
        role: card.role as "hook" | "value" | "cta",
        headline: fields.headline,
        body: fields.body,
      },
      cardBrand,
      pageKind,
      bgBuf,
      {
        handle: bk?.ig_handle ?? "seuperfil.ia",
        displayName: bk?.ig_display_name ?? "Seu Perfil",
        avatarUrl: bk?.ig_avatar_url ?? null,
        verified: bk?.ig_verified ?? false,
        showProfileChip: bk?.show_profile_chip ?? true,
      },
      totalCards ?? 1,
      layout.imagePosition ?? null
    );
  }

  const { error } = await supabase
    .from("carousel_cards")
    .update({ headline: fields.headline, body: fields.body, image_url: imageUrl, layout })
    .eq("id", cardId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/**
 * Troca a foto de fundo de um card do carrossel (capa, interior ou
 * fechamento) — mesmo padrão de uploadPostImage, mas por card. Sobe a
 * foto bruta pro Storage (vira o novo `bg_url`, reusado em edições de
 * texto futuras) e re-renderiza esse card na hora (sharp é rápido,
 * não precisa de job em background como vídeo/ffmpeg).
 */
export async function uploadCarouselCardImage(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const cardId = String(formData.get("card_id") ?? "");
  const file = formData.get("image") as File | null;
  if (!cardId || !file || file.size === 0) {
    return { ok: false, error: "Selecione uma imagem." };
  }
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: "Imagem muito grande (máx 20MB)." };
  }

  const { data: card } = await supabase
    .from("carousel_cards")
    .select("id, post_id, idx, role, headline, body, layout")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) return { ok: false, error: "Card não encontrado." };

  try {
    const { count: totalCards } = await supabase
      .from("carousel_cards")
      .select("id", { count: "exact", head: true })
      .eq("post_id", card.post_id);
    const lastIdx = (totalCards ?? 1) - 1;
    const pageKind: "cover" | "interior" | "closing" =
      card.idx === 0 ? "cover" : card.idx === lastIdx ? "closing" : "interior";

    const { data: post } = await supabase
      .from("posts")
      .select("client_id")
      .eq("id", card.post_id)
      .single();
    const { data: bk } = await supabase
      .from("brand_kits")
      .select("*")
      .eq("client_id", post?.client_id ?? "")
      .maybeSingle();

    const { resolvePostFontFamily } = await import("@/lib/font-data");
    const cardBrand: CardBrand = {
      colorBackground: bk?.color_background ?? "#0B0B12",
      colorAccent: bk?.color_accent ?? "#7C5CFF",
      colorText: bk?.color_text ?? "#FFFFFF",
      fontFamily: resolvePostFontFamily(bk?.post_font_family),
      brandName: bk?.brand_name ?? null,
      wordmark: bk?.wordmark ?? null,
      handle: bk?.ig_handle ?? null,
      keywords: bk?.keywords ?? null,
      brandMark: bk?.brand_mark ?? "auto",
      layoutPreset: bk?.layout_preset ?? "editorial-noir",
    };
    const profile: IgProfile = {
      handle: bk?.ig_handle ?? "seuperfil.ia",
      displayName: bk?.ig_display_name ?? "Seu Perfil",
      avatarUrl: bk?.ig_avatar_url ?? null,
      verified: bk?.ig_verified ?? false,
      showProfileChip: bk?.show_profile_chip ?? true,
    };

    const buf = Buffer.from(await file.arrayBuffer());
    const admin = createAdminClient();
    const bgPath = `${card.post_id}-card-${card.idx}-bg-source.jpg`;
    const { error: bgUpErr } = await admin.storage.from("post-images").upload(bgPath, buf, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
    if (bgUpErr) throw new Error(bgUpErr.message);
    const { data: bgPub } = admin.storage.from("post-images").getPublicUrl(bgPath);
    const bgUrl = `${bgPub.publicUrl}?v=${Date.now()}`;

    const layout = (card.layout as CardLayoutOverride | null) ?? {};
    const { renderAndUploadCard } = await import("@/lib/carousel-render");
    const imageUrl = await renderAndUploadCard(
      card.post_id,
      {
        idx: card.idx,
        role: card.role as "hook" | "value" | "cta",
        headline: card.headline ?? "",
        body: card.body ?? "",
      },
      cardBrand,
      pageKind,
      buf,
      profile,
      totalCards ?? 1,
      layout.imagePosition ?? null
    );

    const { error } = await supabase
      .from("carousel_cards")
      .update({ image_url: imageUrl, bg_url: bgUrl })
      .eq("id", cardId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    console.error("[uploadCarouselCardImage] falha ao processar imagem:", err);
    return {
      ok: false,
      error: "Não foi possível processar essa imagem. Tente um JPG/PNG.",
    };
  }

  revalidatePath("/");
  revalidatePath("/ready");
  return { ok: true };
}

/**
 * Salva a identidade de rótulo do Brand Kit (Sprint B+, @0verlens):
 * wordmark (divisor da capa), keywords do rótulo e o tratamento de
 * marca padrão dos cards (brand_mark).
 */
export async function saveBrandLabel(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const wordmark = String(formData.get("wordmark") ?? "").trim() || null;
  const keywordsRaw = String(formData.get("keywords") ?? "").trim();
  const keywords = keywordsRaw
    ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
    : null;
  const marks = ["wordmark", "handle", "icon", "wordmark+handle", "none", "auto"];
  const bm = String(formData.get("brand_mark") ?? "auto");
  const brandMark = marks.includes(bm) ? bm : "auto";

  const { error } = await supabase
    .from("brand_kits")
    .update({ wordmark, keywords, brand_mark: brandMark })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  // Re-renderiza os carrosséis pendentes com a nova identidade.
  const { data: bk } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  const profile: IgProfile = {
    handle: bk?.ig_handle ?? "seuperfil.ia",
    displayName: bk?.ig_display_name ?? "Seu Perfil",
    avatarUrl: bk?.ig_avatar_url ?? null,
    verified: bk?.ig_verified ?? false,
    showProfileChip: bk?.show_profile_chip ?? true,
  };
  await resyncCarouselOnPendingPosts(clientId, buildCardBrand(bk), profile);

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Salva o preset de LAYOUT (Fase 3 — Editorial Noir / Brutalismo
 * Editorial / ...) do cliente ativo e re-renderiza tudo que está
 * pendente (carrosséis + fechamento dos posts únicos) pra refletir na
 * hora, sem esperar a próxima geração.
 */
export async function saveLayoutPreset(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const presets = ["editorial-noir", "brutalism", "serif-luxe", "swiss-mono", "pop-creator"];
  const raw = String(formData.get("layout_preset") ?? "editorial-noir");
  const layoutPreset = presets.includes(raw) ? raw : "editorial-noir";

  const { error } = await supabase
    .from("brand_kits")
    .update({ layout_preset: layoutPreset })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  // Resync roda em BACKGROUND (Inngest) — contas grandes têm centenas de
  // posts únicos pendentes (a página 1 também depende do layout_preset
  // desde a unificação com o motor de layouts) e rodar isso síncrono
  // dentro do Server Action arrisca estourar o timeout serverless.
  // O envio do evento, porém, PRECISA ser aguardado: sem await a função
  // serverless congela no return e o evento nunca sai — era por isso que
  // salvar o layout não atualizava a fila em produção.
  await enqueue("saveLayoutPreset", {
    name: "post/resync-layout.requested",
    data: { clientId, userId: user.id },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Salva a variação de conteúdo da PÁGINA 1 do post único (kit v2 §3):
 * "cover" (estilo capa, com wordmark) ou "centered" (fonte no meio,
 * minimalista) — ortogonal ao layout_preset (tipografia). Reusa o MESMO
 * job de resync em background do layout (fetchCoverBrand já busca
 * single_post_style fresco por post, então o job não precisa mudar).
 */
export async function saveSinglePostStyle(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const styles = ["cover", "centered"];
  const raw = String(formData.get("single_post_style") ?? "cover");
  const singlePostStyle = styles.includes(raw) ? raw : "cover";

  const { error } = await supabase
    .from("brand_kits")
    .update({ single_post_style: singlePostStyle })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  await enqueue("saveSinglePostStyle", {
    name: "post/resync-layout.requested",
    data: { clientId, userId: user.id },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Salva o modelo escolhido do Template Studio (Sprint B+, B15) pra UMA
 * superfície (cover_image/carousel_page/carousel_last) do cliente ativo —
 * merge em brand_kits.template_selection (jsonb), as outras superfícies
 * ficam intactas.
 *
 * Dispara o MESMO resync em background do layout_preset: escolher um
 * modelo e ver a fila continuar na arte antiga lê como "o template não
 * foi aplicado" (reclamação de 2026-07-27). O job já sabe pular o que
 * não muda, e o resync respeita a seleção de modelo desde a mesma data.
 */
export async function saveTemplateSelection(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const surfaces = ["cover_image", "video_cover", "carousel_page", "carousel_last"];
  const surface = String(formData.get("surface") ?? "");
  if (!surfaces.includes(surface)) throw new Error("Superfície inválida");
  const templateId = String(formData.get("template_id") ?? "");
  if (!templateId) throw new Error("Modelo inválido");

  const { data: bk, error: fetchError } = await supabase
    .from("brand_kits")
    .select("template_selection")
    .eq("client_id", clientId)
    .maybeSingle();
  if (fetchError) throw new Error(fetchError.message);

  const current = (bk?.template_selection as Record<string, string> | null) ?? {};
  const next = { ...current, [surface]: templateId };

  const { error } = await supabase
    .from("brand_kits")
    .update({ template_selection: next })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);

  await enqueue("saveTemplateSelection", {
    name: "post/resync-layout.requested",
    data: { clientId, userId: user.id },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Duplica um modelo (preset do sistema OU já seu) pra uma cópia própria
 * editável do cliente ativo (Sprint B+, TAREFA B14) — nunca edita o preset
 * do sistema em si (é compartilhado por todos). Se a origem já for uma
 * cópia própria deste cliente, ainda assim duplica (edição sempre em
 * cópia nova, mais previsível que mutar in-place).
 */
export async function duplicateTemplateForEditing(templateId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const { data: source, error: fetchError } = await supabase
    .from("templates")
    .select("surface, name, spec")
    .eq("id", templateId)
    .single();
  if (fetchError || !source) throw new Error("Modelo não encontrado");

  const { data: created, error } = await supabase
    .from("templates")
    .insert({
      client_id: clientId,
      surface: source.surface,
      name: `${source.name} (meu)`,
      spec: source.spec,
      is_system: false,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Erro ao duplicar modelo");

  return created.id as string;
}

/** Salva a spec (e opcionalmente o nome) editada de um modelo PRÓPRIO do
 * cliente ativo (B14). RLS garante que só edita templates do próprio
 * cliente; o filtro is_system=false é defesa extra contra editar preset. */
export async function saveTemplateSpec(templateId: string, spec: TemplateSpec, name?: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("templates")
    .update(name ? { spec, name } : { spec })
    .eq("id", templateId)
    .eq("is_system", false);
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  revalidatePath(`/settings/templates/${templateId}`);
}

/**
 * Renderiza uma prévia (PNG em data URL) de uma spec em edição — mesmo
 * `renderFromSpec` usado no post de verdade (sem foto, fundo sólido da
 * marca), pra o editor nunca divergir do resultado real. Conteúdo de
 * exemplo fixo (a marca real do cliente ativo entra nas cores/fonte).
 */
export async function previewTemplateSpec(spec: TemplateSpec): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  const { data: bk } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId ?? "")
    .maybeSingle();

  const brand = buildCardBrand(bk as Record<string, unknown> | null);
  const { renderFromSpec } = await import("@/lib/template-render");
  const { rasterizeSvg } = await import("@/lib/svg-render");
  const svg = renderFromSpec(spec, brand, {
    headline: "Um título forte que prende a atenção",
    body: "Um resumo curto que dá contexto pro leitor em uma frase.",
    cta: "DESLIZE PARA VER →",
  });
  const png = rasterizeSvg(svg);
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * Salva o formato padrão de geração do cliente ativo (single | carousel).
 * O scan-news usa isso para decidir qual job disparar em cada candidata.
 */
export async function saveDefaultFormat(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const fmt = formData.get("default_format") === "carousel" ? "carousel" : "single";
  const { error } = await supabase
    .from("brand_kits")
    .update({ default_format: fmt })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/**
 * Desconecta o Instagram do cliente ativo (Sprint C). Não apaga a
 * linha — só marca 'disconnected', pra manter o histórico e permitir
 * reconectar sem perder o registro de quando foi conectado antes.
 */
export async function disconnectInstagram() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  const { error } = await supabase
    .from("social_connections")
    .update({ status: "disconnected" })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}

/**
 * Troca o cliente (tenant) ativo — grava o id num cookie que
 * getActiveClient() lê. Valida que o cliente pertence ao usuário
 * antes de gravar (a RLS já filtra, mas evita cookie com id alheio).
 */
export async function setActiveClient(clientId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data: owned } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();
  if (!owned) throw new Error("Cliente não encontrado");

  // Persiste o ativo no banco também — o cron (sem cookie/sessão) usa
  // active_client_id para saber pra qual cliente gerar (fan-out 1x).
  await supabase
    .from("notification_configs")
    .update({ active_client_id: clientId })
    .eq("user_id", user.id);

  const { ACTIVE_CLIENT_COOKIE } = await import("@/lib/client-context");
  cookies().set(ACTIVE_CLIENT_COOKIE, clientId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/** Cria um novo cliente (tenant) e o torna ativo. */
export async function createClientTenant(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const name = String(formData.get("name") ?? "").trim() || "Nova Marca";
  const { data: client, error } = await supabase
    .from("clients")
    .insert({ owner_user_id: user.id, name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Todo cliente precisa de um Brand Kit (defaults do schema).
  const { error: bkError } = await supabase
    .from("brand_kits")
    .insert({ client_id: client.id, brand_name: name });
  if (bkError) throw new Error(bkError.message);

  // Torna o novo cliente o ativo (cookie + banco p/ o cron).
  await supabase
    .from("notification_configs")
    .update({ active_client_id: client.id })
    .eq("user_id", user.id);

  const { ACTIVE_CLIENT_COOKIE } = await import("@/lib/client-context");
  cookies().set(ACTIVE_CLIENT_COOKIE, client.id as string, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/** Logout */
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  // redirect() lança internamente — sem isso o form action só invalida
  // cache e o client fica preso na página protegida até a próxima
  // navegação manual "pescar" o middleware. Com redirect(), a troca
  // pro /login é imediata (mesma resposta do server action).
  redirect("/login");
}
