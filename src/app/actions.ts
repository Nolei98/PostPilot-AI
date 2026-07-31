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
import { PLANS } from "@/lib/plans";
import { getUserPlan } from "@/lib/subscription";
import { assertPublicHost } from "@/lib/feed-url";

/**
 * A Fila mora em `/fila`. `/` é a landing ESTÁTICA (src/app/route.ts, um
 * Route Handler que só serve public/index.html) — revalidar "/" nunca
 * invalidou o cache da fila, e era por isso que trocar o layout em
 * Ajustes "só pegava depois de salvar de novo": o que fazia a arte nova
 * aparecer era o Router Cache expirando por tempo, não o save.
 */
const QUEUE_PATH = "/fila";

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

/**
 * Fundo DESTE post (migration 042) — 'brand' volta pro Brand Kit,
 * 'light'/'dark' usam os fundos do sistema e 'custom' guarda o hex do
 * seletor RGB. Só vale enquanto o post está na fila: depois de aprovado
 * a arte está congelada em render_spec e não deve mudar sozinha.
 *
 * Não re-renderiza nada: a Fila desenha o preview ao vivo, então a troca
 * aparece no próximo load. A cor do texto sai da luminância do fundo, no
 * resolveRenderSpec — não é escolhida aqui.
 */
export async function savePostBackground(
  postId: string,
  mode: "brand" | "light" | "dark" | "custom",
  color?: string | null
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const hex = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  if (mode === "custom" && !hex) throw new Error("Cor inválida");

  const { error } = await supabase
    .from("posts")
    .update({ bg_mode: mode, bg_color: mode === "custom" ? hex : null })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
}

/**
 * Cor do WORDMARK deste post (migration 043): 'accent' é o realce do
 * Brand Kit (padrão histórico), 'title' faz a marca acompanhar o título
 * — inclusive quando o título virou escuro por causa do fundo — e
 * 'custom' guarda o hex do seletor.
 */
export async function savePostMarkColor(
  postId: string,
  mode: "accent" | "title" | "custom",
  color?: string | null
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const hex = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
  if (mode === "custom" && !hex) throw new Error("Cor inválida");

  const { error } = await supabase
    .from("posts")
    .update({ mark_mode: mode, mark_color: mode === "custom" ? hex : null })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
}

/** Limite do rótulo do topo: a linha é desenhada em ~24px com
 * espaçamento de 2 e divide o topo com o @handle. Passando disso ela
 * encosta no handle em vez de ser cortada com elegância. */
const EYEBROW_MAX = 28;

/**
 * Rótulo do TOPO da capa deste post (migration 046). Era constante do
 * preset — a única linha de texto da arte que o cliente não podia
 * editar, justamente a que costuma levar edição/seção ("EDIÇÃO 12").
 *
 * Vazio grava NULL, e não string vazia: nulo é o que faz cada layout
 * cair no próprio default, então "apagar" precisa VOLTAR ao padrão em
 * vez de deixar o topo em branco.
 */
export async function savePostEyebrow(postId: string, eyebrow: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const value = eyebrow.trim().slice(0, EYEBROW_MAX);

  const { error } = await supabase
    .from("posts")
    .update({ eyebrow: value || null })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
}

/**
 * Troca o formato do post na fila: único ⇄ carrossel (migration 044).
 *
 * Marca 'pending' e delega pro job — único→carrossel precisa de uma
 * chamada de IA pra estrutura dos cards, o que não cabe num Server
 * Action. A Fila mostra o estado e destrava sozinha quando o job termina.
 */
export async function convertPostFormat(
  postId: string,
  target: "single" | "carousel",
  videoOn?: "cover" | "interior"
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("posts")
    .update({ convert_status: "pending", convert_error: null })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);

  await enqueue("convertPostFormat", {
    name: "post/convert-format.requested",
    data: { postId, target, videoOn },
  });
  revalidatePath(QUEUE_PATH);
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
  revalidatePath(QUEUE_PATH);
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
  revalidatePath(QUEUE_PATH);
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

/**
 * Descongela também o VÍDEO de um post que volta pra fila.
 *
 * Zerar só os campos de render não bastava: o vídeo COMPOSTO (página
 * inteira, com fundo, texto e moldura já queimados) continuava em
 * `video_url`, e a Fila o encaixava DE NOVO dentro da moldura 16:9 que o
 * preview desenha — a página inteira aparecia espremida dentro do buraco
 * do vídeo (bug visto ao vivo em 29/07, no carrossel com vídeo).
 *
 * Voltar pro bruto é seguro porque o arquivo fonte
 * (`{postId}-video-source.mp4` / `{postId}-card-{idx}-video-source.mp4`)
 * fica guardado no Storage justamente pra isso: a próxima aprovação
 * recompõe do zero, agora com a spec nova.
 *
 * Os filtros `.not(video_url, is, null)` existem pra que post sem vídeo
 * nenhum não receba um pôster inventado.
 */
async function thawRenderedVideo(
  supabase: ReturnType<typeof createClient>,
  postId: string
) {
  const publicUrl = (name: string) =>
    `${supabase.storage.from("post-images").getPublicUrl(name).data.publicUrl}?v=${Date.now()}`;

  // Post de vídeo: o pôster gravado na aprovação também é do composto,
  // então volta pro pôster CRU que o attach-video extraiu.
  await supabase
    .from("posts")
    .update({
      video_url: null,
      video_poster_url: publicUrl(`${postId}-video-poster-raw.jpg`),
    })
    .eq("id", postId)
    .not("video_url", "is", null);

  // Card de carrossel: só `video_url` é do composto — o pôster do card
  // já é o cru (ver attach-card-video), por isso não é tocado aqui.
  await supabase
    .from("carousel_cards")
    .update({ video_url: null })
    .eq("post_id", postId)
    .not("video_url", "is", null);
}

/** Cancela o agendamento (Sprint C) — volta pro estado pré-agendamento (fila). */
export async function cancelSchedule(postId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "pending_approval", scheduled_for: null, ...backToQueueRender })
    .eq("id", postId)
    .eq("status", "scheduled");
  if (error) throw new Error(error.message);
  await thawRenderedVideo(supabase, postId);
  revalidatePath(QUEUE_PATH);
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
  revalidatePath(QUEUE_PATH);
}

/** Teto de uma ação em lote. Não é limite do banco — é o que evita que
 * um "selecionar tudo" numa fila de centenas dispare centenas de renders
 * de uma vez (a aprovação enfileira um job por post). */
const BATCH_MAX = 50;

/**
 * Descarta VÁRIOS posts de uma vez (seleção na fila). Um único UPDATE
 * com `in`: descarte não tem efeito colateral nenhum, então não há por
 * que pagar N viagens ao banco.
 */
export async function discardPosts(postIds: string[]) {
  const ids = postIds.slice(0, BATCH_MAX);
  if (ids.length === 0) return { discarded: 0 };

  const supabase = createClient();
  const { error, count } = await supabase
    .from("posts")
    .update({ status: "discarded" }, { count: "exact" })
    .in("id", ids)
    .eq("status", "pending_approval"); // não mexe no que já saiu da fila
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
  return { discarded: count ?? ids.length };
}

/**
 * Aprova VÁRIOS posts de uma vez (seleção na fila).
 *
 * Ao contrário do descarte, aprovar tem efeito colateral por post: cada
 * um precisa do próprio `render_token` e do próprio job de render. Por
 * isso o status vai num UPDATE só (barato, e o `eq('status')` garante
 * que só o que estava na fila é aprovado) e o render é pedido post a
 * post, para os IDs que realmente mudaram de estado.
 *
 * Falha de um render não derruba o lote: `requestRender` já enfileira
 * sem deixar erro escapar, e o post fica em `pending` — a tela Prontos
 * mostra "montando a arte" e oferece "tentar de novo".
 */
export async function approvePosts(postIds: string[]) {
  const ids = postIds.slice(0, BATCH_MAX);
  if (ids.length === 0) return { approved: 0 };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { data, error } = await supabase
    .from("posts")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "pending_approval")
    .select("id");
  if (error) throw new Error(error.message);

  const aprovados = (data ?? []).map((p) => p.id as string);
  for (const id of aprovados) await requestRender(id, user.id);

  revalidatePath(QUEUE_PATH);
  revalidatePath("/ready");
  return { approved: aprovados.length };
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
  revalidatePath(QUEUE_PATH);
  revalidatePath("/ready");
}

/**
 * Sobe uma imagem gerada MANUALMENTE pelo usuário (ex: colou o
 * image_prompt do post no Gemini/nano banana e baixou o resultado) e
 * substitui a página de conteúdo do post, aplicando o mesmo overlay
 * de chip + hook do fluxo automático.
 */
/**
 * Foto de FUNDO deste post (migration 048).
 *
 * Coluna própria (`bg_image_url`) e caminho próprio (`{postId}-bg.jpg`)
 * de propósito: `base_image_url` é onde o attach-video grava o PÔSTER do
 * vídeo pra medir contraste. Compartilhar o campo fazia o pôster virar
 * fundo sem ninguém pedir, e a foto escolhida sumir no próximo upload de
 * vídeo — que foi o que aconteceu no teste de 29/07.
 *
 * Grava a foto CRUA, não arte composta: no modelo render-on-approval
 * quem monta a peça é a aprovação, e a fila desenha o preview por cima.
 */
export async function uploadPostBackgroundImage(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const postId = String(formData.get("post_id") ?? "");
  const file = formData.get("image") as File | null;
  if (!postId || !file || file.size === 0) return { ok: false, error: "Selecione uma imagem." };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "Imagem muito grande (máx 20MB)." };

  const { data: post } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval")
    .maybeSingle();
  if (!post) return { ok: false, error: "Post não encontrado." };

  try {
    const sharp = (await import("sharp")).default;
    const { buildLuminanceGrid } = await import("@/lib/contrast");
    const buf = Buffer.from(await file.arrayBuffer());
    const jpeg = await sharp(buf)
      .resize(1080, 1350, { fit: "cover", position: "attention" })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Storage vai pelo client ADMIN, como todo upload do repo
    // (uploadCarouselCardImage, attach-video, render): as políticas do
    // bucket não liberam escrita pro usuário logado, então subir com o
    // client dele falhava por RLS e a foto nunca chegava — a fila
    // continuava mostrando só a cor do fundo (relatado em 29/07).
    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from("post-images")
      .upload(`${postId}-bg.jpg`, jpeg, { contentType: "image/jpeg", upsert: true });
    if (upErr) return { ok: false, error: upErr.message };

    const { data: pub } = admin.storage.from("post-images").getPublicUrl(`${postId}-bg.jpg`);
    // `?v=` porque o caminho é fixo e o upload é upsert — sem carimbo, a
    // imagem antiga fica no cache do navegador/CDN (mesma armadilha que
    // segurava o vídeo trocado em 29/07).
    const { error } = await supabase
      .from("posts")
      .update({
        bg_image_url: `${pub.publicUrl}?v=${Date.now()}`,
        bg_image_luminance: await buildLuminanceGrid(jpeg),
      })
      .eq("id", postId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    console.error("[uploadPostBackgroundImage] falha ao processar imagem:", err);
    return { ok: false, error: "Não foi possível processar essa imagem. Tente um JPG/PNG." };
  }

  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

/** Tira a foto de fundo — o post volta pro fundo por COR (042). */
export async function removePostBackgroundImage(postId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("posts")
    .update({ bg_image_url: null, bg_image_luminance: null })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
}

/**
 * Véu de leitura sobre a foto de fundo (migration 048): 'auto' só
 * escurece quando o contraste exige, 'on' sempre, 'off' nunca. Existe
 * porque foto limpa não precisa de véu, e foto cheia às vezes precisa de
 * mais do que o mínimo pra WCAG — é decisão de gosto, não só de medida.
 */
export async function savePostBackgroundOverlay(
  postId: string,
  overlay: "auto" | "on" | "off"
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase
    .from("posts")
    .update({ bg_overlay: overlay })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval");
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
}

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

  revalidatePath(QUEUE_PATH);
  revalidatePath("/ready");
  return { ok: true };
}

/**
 * Passo 1 do upload de vídeo: devolve uma URL ASSINADA pra o browser
 * mandar o arquivo DIRETO pro Storage.
 *
 * Por que não recebe o arquivo aqui: um Server Action passa pelo corpo
 * da requisição da função serverless, e a Vercel corta esse corpo em
 * **4,5MB** — teto da plataforma, que `serverActions.bodySizeLimit` não
 * vence (o limite do Next só afrouxa o lado do Next). Vídeo de celular
 * passa disso com folga, e o erro chegava no client como resposta
 * não-JSON ("Falha ao subir vídeo"), parecendo arquivo inválido.
 * Com a URL assinada o binário vai browser → Storage, sem tocar na
 * função: o que trafega aqui é só o ticket.
 *
 * O ticket é curto (2h) e vale pra UM caminho, derivado do post/card no
 * servidor — o browser não escolhe onde grava.
 */
export async function createVideoUploadTicket(input: {
  postId?: string;
  cardId?: string;
}): Promise<{ ok: boolean; path?: string; token?: string; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  let path: string;
  if (input.cardId) {
    // RLS de carousel_cards já garante que o card é do usuário (join com
    // posts.user_id) — se não for, a leitura volta vazia.
    const { data: card } = await supabase
      .from("carousel_cards")
      .select("id, post_id, idx")
      .eq("id", input.cardId)
      .maybeSingle();
    if (!card) return { ok: false, error: "Card não encontrado." };
    path = `${card.post_id}-card-${card.idx}-video-source.mp4`;
  } else if (input.postId) {
    const { data: post } = await supabase
      .from("posts")
      .select("id")
      .eq("id", input.postId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!post) return { ok: false, error: "Post não encontrado." };
    path = `${post.id}-video-source.mp4`;
  } else {
    return { ok: false, error: "Post ou card não informado." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("post-images")
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    console.error("[createVideoUploadTicket] falha ao assinar upload:", error);
    return { ok: false, error: "Não foi possível preparar o envio. Tente de novo." };
  }
  return { ok: true, path: data.path, token: data.token };
}

/**
 * Passo 2 do upload de vídeo do POST: o arquivo JÁ está no Storage
 * (mandado pelo browser com o ticket acima). Aqui só marca o estado e
 * dispara o processamento em BACKGROUND (Inngest): o ffmpeg compõe o
 * quadro (Reels 9:16, feed 4:5 sólido ou feed-blur), o que leva dezenas
 * de segundos — não dá pra fazer síncrono como a foto.
 *
 * `video_status` vira 'processing' na hora; a Fila mostra isso e
 * atualiza sozinha quando o job terminar.
 */
/**
 * Troca só o ENQUADRAMENTO de um vídeo que já está anexado.
 *
 * O quadro (Reels 9:16, feed 4:5, feed borrado) é uma coluna do post e o
 * arquivo fonte serve aos três — mas os ícones da fila são inputs de
 * arquivo, então mudar de enquadramento exigia subir o vídeo DE NOVO.
 * Pior: como o caminho no Storage é fixo, reenviar sobrescrevia o
 * arquivo, e era fácil achar que o vídeo tinha "sumido" (relatado em
 * 29/07). Com o vídeo pronto, agora é só um update.
 */
export async function savePostVideoShape(
  postId: string,
  shape: "reels" | "feed" | "feed-blur"
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // O formato acompanha o quadro: 'reels' é post de Reels, os outros dois
  // são post de vídeo no feed. Sem isso a tela de Prontos e a publicação
  // olhariam pro formato errado.
  const { error } = await supabase
    .from("posts")
    .update({ video_shape: shape, format: shape === "reels" ? "video" : "video_feed" })
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval")
    .eq("video_status", "ready"); // sem vídeo pronto não há o que reenquadrar
  if (error) throw new Error(error.message);
  revalidatePath(QUEUE_PATH);
}

export async function attachUploadedPostVideo(
  postId: string,
  shape: "reels" | "feed" | "feed-blur"
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase
    .from("posts")
    .update({ video_status: "processing", video_error: null })
    .eq("id", postId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  // COM await de propósito (ver enqueue() em @/lib/enqueue): sem ele o
  // vídeo ficava "processando" pra sempre em produção, porque a função
  // serverless congela no return antes do evento sair.
  await enqueue("attachUploadedPostVideo", {
    name: "post/attach-video.requested",
    data: { postId, userId: user.id, shape },
  });

  revalidatePath(QUEUE_PATH);
  revalidatePath("/ready");
  return { ok: true };
}

/**
 * Gera um vídeo do ZERO pro post (Sprint D, migration 049): roteiro por
 * IA, b-roll do Pexels, legenda queimada. O trabalho todo roda em
 * background (Inngest) — só a montagem já leva dezenas de segundos.
 *
 * Marca 'processing' aqui, e não só no job, pra fila reagir no mesmo
 * clique: sem isso o botão parecia não ter feito nada até o job pegar.
 *
 * Não sobrescreve vídeo existente sem querer: com vídeo pronto o botão
 * nem aparece na fila, e o filtro de status protege o resto.
 */
export async function generateVideoForPost(
  postId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const { data: post, error: readErr } = await supabase
    .from("posts")
    .select("id, video_status")
    .eq("id", postId)
    .eq("user_id", user.id)
    .eq("status", "pending_approval")
    .maybeSingle();
  if (readErr || !post) return { ok: false, error: "Post não encontrado na fila." };
  if (post.video_status === "processing") {
    return { ok: false, error: "Já tem um vídeo sendo montado pra este post." };
  }

  const { error } = await supabase
    .from("posts")
    .update({ video_status: "processing", video_error: null })
    .eq("id", postId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: error.message };

  // COM await (ver enqueue() em @/lib/enqueue): sem ele a função
  // serverless congela no return antes de o evento sair, e o post fica
  // "processando" pra sempre.
  await enqueue("generateVideoForPost", {
    name: "post/generate-video.requested",
    data: { postId, userId: user.id },
  });

  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

/**
 * Passo 2 do upload de vídeo de um CARD de carrossel (migration 037) —
 * mesmo desenho do post: o arquivo já subiu direto pro Storage, aqui só
 * marca 'processing' e enfileira a composição do card "interior com
 * vídeo" (título + moldura 16:9 + corpo).
 */
export async function attachUploadedCardVideo(
  cardId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Não autenticado" };

  const { error } = await supabase
    .from("carousel_cards")
    .update({ video_status: "processing", video_error: null })
    .eq("id", cardId);
  if (error) return { ok: false, error: error.message };

  await enqueue("attachUploadedCardVideo", {
    name: "card/attach-video.requested",
    data: { cardId, userId: user.id },
  });

  revalidatePath(QUEUE_PATH);
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

  const feedUrl = String(formData.get("feed_url") ?? "").trim();

  // SSRF: o scan-news busca esta URL no SERVIDOR. Sem isto, "fonte RSS"
  // vira requisição pra qualquer endereço que a pessoa digitar, incluindo
  // rede interna e endpoint de metadados de nuvem. A checagem de DNS
  // (assertPublicHost) pega o domínio público que aponta pra 127.0.0.1 —
  // o que a inspeção do texto sozinha nunca pegaria.
  const urlOk = await assertPublicHost(feedUrl);
  if (!urlOk.ok) throw new Error(urlOk.error ?? "Endereço de feed inválido.");

  // Teto de fontes do plano. Existia em plans.ts desde sempre e NUNCA era
  // lido — free dizia 2 e aceitava 200 (auditoria §2.1). O teto é por
  // CLIENTE porque o custo de varredura é por fonte de cada cliente.
  const plano = await getUserPlan(user.id);
  const limite = PLANS[plano].maxSources;
  if (Number.isFinite(limite)) {
    const { count } = await supabase
      .from("source_configs")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if ((count ?? 0) >= limite) {
      throw new Error(
        `Seu plano (${PLANS[plano].label}) permite ${limite} ${limite === 1 ? "fonte" : "fontes"} por cliente. Remova uma fonte ou mude de plano.`
      );
    }
  }

  const { error } = await supabase.from("source_configs").insert({
    user_id: user.id,
    client_id: clientId,
    name: String(formData.get("name") ?? "").trim(),
    feed_url: feedUrl,
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

  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
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


  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
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


  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
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
  revalidatePath(QUEUE_PATH);
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
  revalidatePath(QUEUE_PATH);
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
  // Descartado também descongela: se voltar pra fila depois, o vídeo
  // composto não pode estar lá esperando pra ser desenhado duas vezes.
  await thawRenderedVideo(supabase, postId);
  revalidatePath(QUEUE_PATH);
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
    /** Fundo só DESTE card, sobrepondo o do post (ver CardLayoutOverride). */
    bgMode?: "brand" | "light" | "dark" | "custom" | null;
    bgColor?: string | null;
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
    ...(fields.bgMode !== undefined ? { bgMode: fields.bgMode } : {}),
    ...(fields.bgColor !== undefined ? { bgColor: fields.bgColor } : {}),
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
  revalidatePath(QUEUE_PATH);
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
    .select("id, post_id, idx, role, headline, body, layout, video_status")
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

    // Luminância da foto, medida UMA vez aqui: é o número que decide o
    // véu de leitura no preview e no render (mesma régua do resto do
    // pipeline). Sem ela o card com vídeo assumia "fundo escuro" às
    // cegas e podia entregar texto claro sobre foto clara.
    const { buildLuminanceGrid } = await import("@/lib/contrast");
    const bgLuminance = await buildLuminanceGrid(buf);

    const layout = (card.layout as CardLayoutOverride | null) ?? {};

    // Card com VÍDEO não leva arte estática: a peça dele é montada na
    // aprovação (renderCardVideo), com a foto entrando como fundo atrás
    // da moldura. Compor um card normal aqui gastaria sharp pra gerar uma
    // imagem que ninguém usa — e ainda gravaria image_url, fazendo a tela
    // de Prontos achar que o card tem arte pronta.
    const cardComVideo = card.video_status === "ready" || card.video_status === "processing";

    const imageUrl = cardComVideo
      ? null
      : await (async () => {
          const { renderAndUploadCard } = await import("@/lib/carousel-render");
          return renderAndUploadCard(
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
        })();

    const { error } = await supabase
      .from("carousel_cards")
      .update({
        ...(cardComVideo ? {} : { image_url: imageUrl }),
        bg_url: bgUrl,
        bg_luminance: bgLuminance,
      })
      .eq("id", cardId);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    console.error("[uploadCarouselCardImage] falha ao processar imagem:", err);
    return {
      ok: false,
      error: "Não foi possível processar essa imagem. Tente um JPG/PNG.",
    };
  }

  revalidatePath(QUEUE_PATH);
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

  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
}

/**
 * Confirma que uma coluna do brand_kit está com o valor esperado ANTES
 * de a action retornar. Sem isto o botão destravava no instante do
 * `update`, e uma réplica de leitura ainda atrasada devolvia o valor
 * velho pro próximo load da fila — a origem do "tive que salvar de novo".
 * Poucas tentativas curtas: o caso normal acerta na primeira.
 */
async function confirmBrandKitValue(
  clientId: string,
  column: string,
  expected: unknown
): Promise<void> {
  const supabase = createClient();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await supabase
      .from("brand_kits")
      .select(column)
      .eq("client_id", clientId)
      .maybeSingle();
    const got = (data as Record<string, unknown> | null)?.[column];
    if (JSON.stringify(got) === JSON.stringify(expected)) return;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error("O salvamento não foi confirmado pelo banco. Tente de novo.");
}

/**
 * Salva o preset de LAYOUT (Fase 3 — Editorial Noir / Brutalismo
 * Editorial / ...) do cliente ativo.
 *
 * NÃO re-renderiza nada: post na fila não tem arte (migration 040), o que
 * se vê lá é preview ao vivo. A arte real só nasce ao aprovar/agendar.
 * Retorna o preset confirmado pra UI destravar só quando o valor já está
 * de fato no banco.
 */
export async function saveLayoutPreset(formData: FormData): Promise<{ layoutPreset: string }> {
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

  await confirmBrandKitValue(clientId, "layout_preset", layoutPreset);

  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
  return { layoutPreset };
}

/**
 * Salva a variação de conteúdo da PÁGINA 1 do post único (kit v2 §3):
 * "cover" (estilo capa, com wordmark) ou "centered" (fonte no meio,
 * minimalista) — ortogonal ao layout_preset (tipografia). Reusa o MESMO
 * job de resync em background do layout (fetchCoverBrand já busca
 * single_post_style fresco por post, então o job não precisa mudar).
 */
export async function saveSinglePostStyle(formData: FormData): Promise<{ singlePostStyle: string }> {
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

  await confirmBrandKitValue(clientId, "single_post_style", singlePostStyle);

  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
  return { singlePostStyle };
}

/**
 * Salva o modelo escolhido do Template Studio (Sprint B+, B15) pra UMA
 * superfície (cover_image/carousel_page/carousel_last) do cliente ativo —
 * merge em brand_kits.template_selection (jsonb), as outras superfícies
 * ficam intactas.
 *
 * Não re-renderiza nada (a fila é preview ao vivo); o que garante que a
 * escolha apareça é a confirmação no banco + revalidação de /fila.
 */
export async function saveTemplateSelection(
  formData: FormData
): Promise<{ surface: string; templateId: string }> {
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

  await confirmBrandKitValue(clientId, "template_selection", next);

  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
  return { surface, templateId };
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
 * Liga/pausa a geração automática do cliente ativo (migration 047).
 *
 * Pausado, o radar continua: as fontes são varridas, as notícias entram
 * e são pontuadas — só o disparo de generate-post/generate-carousel não
 * acontece. É por isso que a pausa vive aqui e não no `enabled` das
 * fontes: desligar fonte apagaria a coleta junto.
 *
 * O que já está na fila não é tocado — pausa vale pra criação nova.
 */
export async function saveAutoGenerate(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { getActiveClientId } = await import("@/lib/client-context");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");

  // Checkbox ausente no FormData = desmarcado.
  const ligado = formData.get("auto_generate") === "on";
  const { error } = await supabase
    .from("brand_kits")
    .update({ auto_generate: ligado })
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath(QUEUE_PATH);
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

  // Teto de clientes do plano (auditoria §2.2). Sem ele, o teto de FONTES
  // não segura nada: bastava criar uma marca nova pra ganhar mais fontes,
  // e cada marca é varrida a cada 3h com triagem paga por notícia.
  const plano = await getUserPlan(user.id);
  const limite = PLANS[plano].maxClients;
  if (Number.isFinite(limite)) {
    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id);
    if ((count ?? 0) >= limite) {
      throw new Error(
        `Seu plano (${PLANS[plano].label}) permite ${limite} ${limite === 1 ? "cliente" : "clientes"}. Mude de plano para adicionar outra marca.`
      );
    }
  }

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

/**
 * EXCLUSÃO DE CONTA (auditoria §2.6).
 *
 * A página /exclusao-de-dados descrevia o processo desde o dossiê do App
 * Review, mas não existia ação nenhuma — a pessoa lia como excluir e não
 * tinha onde clicar. LGPD (e o próprio App Review do Meta) pedem caminho
 * efetivo, não instruções.
 *
 * Ordem importa:
 *  1. Storage primeiro. Os arquivos NÃO têm chave estrangeira pro banco;
 *     apagar o usuário antes deixaria arte e vídeo órfãos pra sempre, sem
 *     nem dar pra descobrir de quem eram.
 *  2. Depois o usuário em auth.users. O resto do banco cai por cascata
 *     (posts, clients → brand_kits, source_configs, notification_configs,
 *     subscriptions; carousel_cards caem junto com os posts).
 *
 * Os nomes dos arquivos saem das COLUNAS de URL, não de `storage.list()`.
 * Listar custava uma requisição por post — numa conta com centenas de posts
 * a server action estourava o tempo e morria ANTES do `deleteUser`, ou seja,
 * falhava exatamente onde não pode falhar. A URL pública já carrega o nome
 * do objeto, então derivar dela é exato e cabe em poucas chamadas.
 *
 * São DOIS buckets: `post-images` (arte, foto base, fundo, vídeo, pôster,
 * contra-capa e os mesmos campos de cada card) e `avatars` (a foto de perfil
 * do Brand Kit, gravada como `{client_id}.png|jpg`). Esquecer o segundo
 * deixaria justamente o dado mais pessoal para trás.
 *
 * A limpeza do Storage é BEST-EFFORT e registrada no log: um arquivo que
 * resista não pode impedir a exclusão da conta, que é o direito exercido.
 */

/** Extrai o nome do objeto de uma URL pública do Storage.
 *  `.../object/public/post-images/abc-cover.png?v=123` → `abc-cover.png` */
function nomeNoBucket(url: string | null, bucket: string): string | null {
  if (!url) return null;
  const marca = `/object/public/${bucket}/`;
  const i = url.indexOf(marca);
  if (i === -1) return null;
  const nome = url.slice(i + marca.length).split("?")[0];
  return nome ? decodeURIComponent(nome) : null;
}
export async function deleteMyAccount(formData: FormData): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  // Confirmação digitada: exclusão é irreversível e não tem "desfazer".
  const confirmacao = String(formData.get("confirmacao") ?? "").trim().toUpperCase();
  if (confirmacao !== "EXCLUIR") {
    throw new Error('Digite EXCLUIR para confirmar a exclusão da conta.');
  }

  const admin = createAdminClient();

  // 1. Arquivos do Storage, derivados das colunas de URL.
  try {
    const { data: posts } = await admin
      .from("posts")
      .select(
        "id, image_url, closing_image_url, base_image_url, bg_image_url, video_url, video_poster_url"
      )
      .eq("user_id", user.id);

    const doPost = posts ?? [];
    const nomes = new Set<string>();
    for (const p of doPost) {
      for (const url of [
        p.image_url,
        p.closing_image_url,
        p.base_image_url,
        p.bg_image_url,
        p.video_url,
        p.video_poster_url,
      ]) {
        const nome = nomeNoBucket(url, "post-images");
        if (nome) nomes.add(nome);
      }
    }

    // Cards do carrossel: têm as próprias fotos e vídeos, e caem por cascata
    // no banco — no Storage, não.
    if (doPost.length > 0) {
      const { data: cards } = await admin
        .from("carousel_cards")
        .select("image_url, bg_url, video_url, video_poster_url")
        .in(
          "post_id",
          doPost.map((p) => p.id)
        );
      for (const c of cards ?? []) {
        for (const url of [c.image_url, c.bg_url, c.video_url, c.video_poster_url]) {
          const nome = nomeNoBucket(url, "post-images");
          if (nome) nomes.add(nome);
        }
      }
    }

    // O remove() aceita lote; 100 por vez pra não montar payload gigante.
    const lote = [...nomes];
    for (let i = 0; i < lote.length; i += 100) {
      const { error: rmErr } = await admin.storage
        .from("post-images")
        .remove(lote.slice(i, i + 100));
      if (rmErr) console.error("[deleteMyAccount] falha ao apagar artes:", rmErr.message);
    }

    // Avatares: um por cliente, nome = `{client_id}.png|jpg`. Não dá pra
    // saber a extensão sem ler a URL do kit, então tenta as duas — remover
    // um nome inexistente não é erro no Storage.
    const { data: clientes } = await admin
      .from("clients")
      .select("id")
      .eq("user_id", user.id);
    const avatares = (clientes ?? []).flatMap((c) => [`${c.id}.png`, `${c.id}.jpg`]);
    if (avatares.length > 0) {
      const { error: avErr } = await admin.storage.from("avatars").remove(avatares);
      if (avErr) console.error("[deleteMyAccount] falha ao apagar avatares:", avErr.message);
    }
  } catch (err) {
    // Best-effort: arquivo preso não pode travar o direito de exclusão.
    console.error("[deleteMyAccount] limpeza do Storage incompleta:", err);
  }

  // 2. O usuário. Cascata do Postgres leva o resto.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Falha ao excluir a conta: ${error.message}`);

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login?conta=excluida");
}
