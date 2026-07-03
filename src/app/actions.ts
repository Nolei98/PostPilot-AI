"use server";

// ============================================================
// Server Actions do dashboard — rodam no servidor com a sessão
// do usuário (RLS garante que só mexe nos próprios dados).
// ============================================================
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/inngest/client";
import type { IgProfile, VisualIdentity } from "@/lib/types";

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
async function resyncChipOnPendingPosts(userId: string, profile: IgProfile) {
  const supabase = createClient();
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(
      "id, hook, template_applied, tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, tpl_color_background, tpl_color_accent, tpl_color_text, tpl_color_keyword_box"
    )
    .eq("user_id", userId)
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
      newContentUrl = await regenerateContentImage(post.id, post.hook, profile, watermark);
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
        watermark
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
  oldIdentity: VisualIdentity,
  newIdentity: VisualIdentity,
  profile: IgProfile,
  force: boolean
) {
  const supabase = createClient();
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(
      "id, tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, tpl_color_background, tpl_color_accent, tpl_color_text, tpl_color_keyword_box"
    )
    .eq("user_id", userId)
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
      watermark
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

/** Aprova um post → vai para a tela "post pronto" */
export async function approvePost(postId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", "pending_approval"); // só aprova o que está na fila
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

/** Salva edições de legenda/hashtags feitas na fila */
export async function updatePost(
  postId: string,
  fields: { caption: string; hashtags: string }
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("posts")
    .update({ caption: fields.caption, hashtags: fields.hashtags })
    .eq("id", postId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
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

/** Dispara a varredura de fontes manualmente (botão no dashboard) */
export async function triggerScan(): Promise<{ ok: boolean; error?: string }> {
  try {
    await inngest.send({ name: "news/scan.requested", data: {} });
    return { ok: true };
  } catch (err) {
    console.error("[triggerScan] falha ao enviar evento para o Inngest:", err);
    return {
      ok: false,
      error:
        "Não foi possível iniciar a varredura. Verifique se INNGEST_EVENT_KEY e INNGEST_SIGNING_KEY estão configuradas.",
    };
  }
}

/** Adiciona uma fonte RSS */
export async function addSource(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("source_configs").insert({
    user_id: user.id,
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
  const textProvider =
    formData.get("text_provider") === "claude" ? "claude" : "gemini";
  const imageProvider =
    formData.get("image_provider") === "fal" ? "fal" : "gemini";

  // upsert: cria a config se não existir, atualiza se existir
  const { error } = await supabase.from("notification_configs").upsert(
    {
      user_id: user.id,
      telegram_chat_id: chatId,
      post_language: postLanguage,
      text_provider: textProvider,
      image_provider: imageProvider,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);
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

  const handle = String(formData.get("ig_handle") ?? "")
    .trim()
    .replace(/^@/, ""); // aceita com ou sem @
  const displayName = String(formData.get("ig_display_name") ?? "").trim();

  // Upload da foto (opcional)
  let avatarUrl: string | undefined;
  const file = formData.get("avatar") as File | null;
  if (file && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) {
      throw new Error("Foto muito grande (máx 2MB)");
    }
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${user.id}.${ext}`;
    // Upload via client ADMIN (service role): esta server action roda só
    // no servidor e o nome do arquivo é o user_id autenticado — seguro,
    // e dispensa policies de storage para o usuário comum.
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const { data } = admin.storage.from("avatars").getPublicUrl(path);
    // cache-bust: URL muda a cada upload para o browser não mostrar a antiga
    avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  }

  // Checkboxes: presentes no form → "on"; ausentes → false
  const verified = formData.get("ig_verified") === "on";
  const showChip = formData.get("show_profile_chip") === "on";

  const { error } = await supabase.from("notification_configs").upsert(
    {
      user_id: user.id,
      ...(handle && { ig_handle: handle }),
      ...(displayName && { ig_display_name: displayName }),
      ...(avatarUrl && { ig_avatar_url: avatarUrl }),
      ig_verified: verified,
      show_profile_chip: showChip,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);

  // Sincroniza o chip (foto/nome/@/selo) nos posts ainda na fila —
  // sem isso, um post gerado antes da mudança ficaria com dado velho.
  const { data: freshConfig } = await supabase
    .from("notification_configs")
    .select("ig_handle, ig_display_name, ig_avatar_url, ig_verified, show_profile_chip")
    .eq("user_id", user.id)
    .single();
  if (freshConfig) {
    const profile: IgProfile = {
      handle: freshConfig.ig_handle,
      displayName: freshConfig.ig_display_name,
      avatarUrl: freshConfig.ig_avatar_url,
      verified: freshConfig.ig_verified,
      showProfileChip: freshConfig.show_profile_chip,
    };
    await resyncChipOnPendingPosts(user.id, profile);
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

  // Captura o default ANTIGO antes de sobrescrever — usado para
  // detectar quais posts na fila ainda não foram customizados
  // individualmente (esses sim são re-sincronizados; os editados
  // manualmente são preservados).
  const { data: oldConfig } = await supabase
    .from("notification_configs")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const newIdentity: VisualIdentity = {
    colorBackground: hex("color_background", "#0B0B12"),
    colorAccent: hex("color_accent", "#7C5CFF"),
    colorText: hex("color_text", "#FFFFFF"),
    colorKeywordBox: hex("color_keyword_box", "#7C5CFF"),
    keyword: text("tpl_keyword", "IA"),
    topText: text("tpl_top_text", "A NOVIDADE DE"),
    bottomText: text("tpl_bottom_text", "QUE MUDA TUDO"),
    ctaEnabled: formData.get("tpl_cta_enabled") === "on",
  };

  const { error } = await supabase.from("notification_configs").upsert(
    {
      user_id: user.id,
      color_background: newIdentity.colorBackground,
      color_accent: newIdentity.colorAccent,
      color_text: newIdentity.colorText,
      color_keyword_box: newIdentity.colorKeywordBox,
      tpl_keyword: newIdentity.keyword,
      tpl_top_text: newIdentity.topText,
      tpl_bottom_text: newIdentity.bottomText,
      tpl_cta_enabled: newIdentity.ctaEnabled,
      template_apply_mode: mode,
    },
    { onConflict: "user_id" }
  );
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
      oldIdentity,
      newIdentity,
      profile,
      mode === "all" // modo 'all' sincroniza tudo, sem checar customização
    );
  }

  revalidatePath("/settings");
  revalidatePath("/");
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
    .select("id")
    .eq("id", postId)
    .single();
  if (postError || !post) throw new Error("Post não encontrado");

  // Perfil para o chip (mesma fonte da geração)
  const { data: config } = await supabase
    .from("notification_configs")
    .select("ig_handle, ig_display_name, ig_avatar_url, ig_verified, show_profile_chip")
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
    watermark
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
    .update({ status: target, approved_at: null })
    .eq("id", postId)
    .eq("status", "approved"); // só reverte o que está aprovado
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/ready");
}

/** Logout */
export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}
