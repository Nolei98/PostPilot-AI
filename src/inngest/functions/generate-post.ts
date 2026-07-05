// ============================================================
// Job: geração completa do post a partir de uma notícia candidata.
//
// Disparado pelo scan-news (evento post/generate.requested).
// Fluxo: Sonnet gera texto → cria Post (draft) → gera a página de
// conteúdo (Flux/mock + hook + chip) e, se o modo for 'all', TAMBÉM
// a página de fechamento (identidade visual) → Post vira
// pending_approval → dispara notificação.
// As duas páginas nunca se substituem: conteúdo = image_url,
// fechamento = closing_image_url (carrossel de até 2 páginas).
// Cada passo tem retry independente (steps da Inngest).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePostPackage } from "@/lib/ai/generate";
import { generatePostImage, renderAndUploadTemplateArt } from "@/lib/image";
import type {
  IgProfile,
  NewsItem,
  TemplateApplyMode,
  VisualIdentity,
} from "@/lib/types";

export const generatePost = inngest.createFunction(
  {
    id: "generate-post",
    retries: 2,
    // Evita estourar rate limit de Fal/Anthropic num pico de candidatas
    concurrency: { limit: 3 },
  },
  { event: "post/generate.requested" },
  async ({ event, step }) => {
    const { newsItemId, userId } = event.data;
    const supabase = createAdminClient();

    // 1. Carrega a notícia
    const news = await step.run("fetch-news", async () => {
      const { data, error } = await supabase
        .from("news_items")
        .select("*")
        .eq("id", newsItemId)
        .single();
      if (error) throw new Error(`Notícia não encontrada: ${error.message}`);
      return data as NewsItem;
    });

    // Idempotência: se já existe post para esta notícia, não duplica
    const existing = await step.run("check-existing", async () => {
      const { data } = await supabase
        .from("posts")
        .select("id")
        .eq("news_item_id", newsItemId)
        .maybeSingle();
      return data?.id ?? null;
    });
    if (existing) {
      return { skipped: true, reason: "Post já existe", postId: existing };
    }

    // Cota do plano: free = 5/mês, criador = 30, pro = 90. Sem cota,
    // a notícia continua 'candidate' (não é descartada) — se o usuário
    // fizer upgrade ainda no mesmo mês, o próximo scan a aproveita.
    const quota = await step.run("check-quota", async () => {
      const { getMonthlyQuota } = await import("@/lib/subscription");
      return getMonthlyQuota(userId);
    });
    if (quota.remaining <= 0) {
      return {
        skipped: true,
        reason: `Cota mensal do plano ${quota.plan} atingida (${quota.used}/${quota.limit})`,
      };
    }

    // 2. Preferências: idioma + perfil (chip) + identidade visual + modo
    const prefs = await step.run("fetch-prefs", async () => {
      const { data } = await supabase
        .from("notification_configs")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      const profile: IgProfile = {
        handle: data?.ig_handle ?? "seuperfil.ia",
        displayName: data?.ig_display_name ?? "Seu Perfil de IA",
        avatarUrl: data?.ig_avatar_url ?? null,
        verified: data?.ig_verified ?? false,
        showProfileChip: data?.show_profile_chip ?? true,
      };
      const identity: VisualIdentity = {
        colorBackground: data?.color_background ?? "#0B0B12",
        colorAccent: data?.color_accent ?? "#7C5CFF",
        colorText: data?.color_text ?? "#FFFFFF",
        colorKeywordBox: data?.color_keyword_box ?? "#7C5CFF",
        keyword: data?.tpl_keyword ?? "IA",
        topText: data?.tpl_top_text ?? "A NOVIDADE DE",
        bottomText: data?.tpl_bottom_text ?? "QUE MUDA TUDO",
        ctaEnabled: data?.tpl_cta_enabled ?? false,
      };
      const applyMode: TemplateApplyMode =
        data?.template_apply_mode === "on_approval" ? "on_approval" : "all";
      const textProvider: "claude" | "gemini" | "pollinations" =
        data?.text_provider === "claude" || data?.text_provider === "pollinations"
          ? data.text_provider
          : "gemini";
      const imageProvider: "fal" | "gemini" | "pollinations" =
        data?.image_provider === "fal" || data?.image_provider === "pollinations"
          ? data.image_provider
          : "gemini";
      return {
        language: (data?.post_language as string | undefined) ?? "pt-BR",
        profile,
        identity,
        applyMode,
        textProvider,
        imageProvider,
      };
    });
    const language = prefs.language;
    const applyTemplate = prefs.applyMode === "all";

    // 3. Gera o pacote de texto no idioma e provider configurados
    const pkg = await step.run("generate-text", async () => {
      return generatePostPackage(
        {
          title: news.title,
          summary: news.summary,
          url: news.url,
          language,
        },
        prefs.textProvider
      );
    });

    // 3. Cria o Post como draft. Se o modo for 'all', já grava os
    //    valores da identidade visual como override do post (editável
    //    depois na aprovação sem tocar no default de Ajustes).
    const postId = await step.run("create-draft", async () => {
      const { data, error } = await supabase
        .from("posts")
        .insert({
          news_item_id: newsItemId,
          user_id: userId,
          hook: pkg.hook,
          caption: pkg.caption,
          hashtags: pkg.hashtags,
          image_prompt: pkg.image_prompt,
          status: "draft",
          template_applied: applyTemplate,
          ...(applyTemplate && {
            tpl_keyword: prefs.identity.keyword,
            tpl_top_text: prefs.identity.topText,
            tpl_bottom_text: prefs.identity.bottomText,
            tpl_cta_enabled: prefs.identity.ctaEnabled,
            tpl_color_background: prefs.identity.colorBackground,
            tpl_color_accent: prefs.identity.colorAccent,
            tpl_color_text: prefs.identity.colorText,
            tpl_color_keyword_box: prefs.identity.colorKeywordBox,
          }),
        })
        .select("id")
        .single();
      if (error) throw new Error(`Erro ao criar post: ${error.message}`);
      return data.id as string;
    });

    // Plano free → arte sai com a marca "feito com PostPilot"
    // (loop viral do produto; some no upgrade via resync)
    const watermark = quota.plan === "free";

    // 4. Página de CONTEÚDO — usa a imagem original da matéria quando
    //    o feed trouxe uma; senão o provider configurado em Ajustes.
    const imageUrl = await step.run("generate-content-image", async () => {
      return generatePostImage(
        pkg.image_prompt,
        pkg.hook,
        postId,
        prefs.profile,
        watermark,
        news.image_url,
        prefs.imageProvider
      );
    });

    // 4b. Página de FECHAMENTO — só no modo 'all'. Não substitui a
    //     página de conteúdo; é uma segunda imagem do carrossel.
    const closingImageUrl = applyTemplate
      ? await step.run("generate-closing-image", async () => {
          return renderAndUploadTemplateArt(
            postId,
            prefs.identity,
            prefs.profile,
            watermark
          );
        })
      : null;

    // 5. Post pronto para aprovação
    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("posts")
        .update({
          image_url: imageUrl,
          closing_image_url: closingImageUrl,
          status: "pending_approval",
        })
        .eq("id", postId);
      if (error) throw new Error(`Erro ao finalizar post: ${error.message}`);
    });

    // 6. Notifica o usuário no Telegram (job separado)
    await step.sendEvent("dispatch-notify", {
      name: "post/ready.notify",
      data: { postId, userId },
    });

    return { postId, imageUrl, closingImageUrl };
  }
);
