// ============================================================
// Job: geração completa do post a partir de uma notícia candidata.
//
// Disparado pelo scan-news (evento post/generate.requested).
// Fluxo: Sonnet gera texto → cria Post (draft) → resolve a imagem BASE
// (foto da matéria ou provider de Ajustes) → Post vira pending_approval
// → dispara notificação.
//
// A ARTE não é montada aqui (migration 040). Este job resolve só a metade
// CARA — os bytes da foto, onde estão as chamadas pagas. A metade barata,
// compor o layout por cima, roda na APROVAÇÃO, porque é ela que precisa
// mudar quando o usuário troca template ou cor. Enquanto o post está na
// fila, a Fila desenha um preview ao vivo sobre a base.
// Cada passo tem retry independente (steps da Inngest).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTextProvider } from "@/lib/ai/provider";
import { generatePostPackage } from "@/lib/ai/generate";
import {
  embedText,
  toPgVector,
  DUPLICATE_MAX_DISTANCE,
} from "@/lib/ai/embedding";
import { persistBaseImage, resolveBaseImage } from "@/lib/image";
import { resolvePostFontFamily } from "@/lib/font-data";
import type {
  BrandTemplate,
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
      // Config de marca/geração vem do brand_kit do cliente da notícia.
      const { data } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("client_id", news.client_id)
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
      // A flag `unlimited` (manual, uso interno) libera o TETO de posts do
      // plano — e só isso. Ela NÃO escolhe provider: até 2026-07-27 forçava
      // pollinations "pra custo zero", o que deixou a conta ilimitada presa
      // no único provider que passou a cobrar (402 em requests
      // multi-mensagem), com a fila parada e Ajustes sem efeito nenhum.
      const textProvider = resolveTextProvider(data?.text_provider);
      const imageProvider: "fal" | "gemini" | "pollinations" | "stock" =
        data?.image_provider === "fal" ||
        data?.image_provider === "pollinations" ||
        data?.image_provider === "gemini"
          ? data.image_provider
          : "stock";
      const brand: BrandTemplate = {
        fontFamily: resolvePostFontFamily(data?.post_font_family),
        logoUrl: data?.logo_url ?? null,
        showLogo: data?.show_brand_logo ?? true,
      };
      return {
        language: (data?.post_language as string | undefined) ?? "pt-BR",
        niche: (data?.niche as string | null | undefined) ?? null,
        profile,
        identity,
        applyMode,
        textProvider,
        imageProvider,
        brand,
      };
    });
    const language = prefs.language;
    const applyTemplate = prefs.applyMode === "all";

    // 3. Gera o pacote de texto no idioma e provider configurados
    let pkg = await step.run("generate-text", async () => {
      return generatePostPackage(
        {
          title: news.title,
          summary: news.summary,
          url: news.url,
          language,
          niche: prefs.niche,
        },
        prefs.textProvider
      );
    });

    // 3b. Guardrail anti-duplicata (intra-cliente): se a legenda ficou
    //     parecida demais com outro post do MESMO cliente, regenera uma
    //     vez pedindo um ângulo novo. Guarda o embedding pra comparar
    //     com futuros posts. Em modo mock o embedding é determinístico.
    let embedding = await step.run("embed-caption", () => embedText(pkg.caption));

    const duplicateId = await step.run("check-duplicate", async () => {
      const { data, error } = await supabase.rpc("find_duplicate_caption", {
        p_client_id: news.client_id,
        p_embedding: toPgVector(embedding),
        p_max_distance: DUPLICATE_MAX_DISTANCE,
      });
      if (error) {
        console.error("[generate-post] find_duplicate_caption:", error.message);
        return null;
      }
      return (data as string | null) ?? null;
    });

    if (duplicateId) {
      pkg = await step.run("regenerate-text", async () => {
        return generatePostPackage(
          {
            title: news.title,
            summary: news.summary,
            url: news.url,
            language,
            niche: prefs.niche,
            angleHint:
              "Já existe um post deste cliente muito parecido com este.",
          },
          prefs.textProvider
        );
      });
      embedding = await step.run("re-embed-caption", () => embedText(pkg.caption));
    }

    // 3. Cria o Post como draft. Se o modo for 'all', já grava os
    //    valores da identidade visual como override do post (editável
    //    depois na aprovação sem tocar no default de Ajustes).
    const postId = await step.run("create-draft", async () => {
      const { data, error } = await supabase
        .from("posts")
        .insert({
          news_item_id: newsItemId,
          user_id: userId,
          client_id: news.client_id, // herda o tenant da notícia
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

    // Guarda o embedding da legenda (best-effort): se a migration 023
    // ainda não rodou, o update falha em silêncio e o post segue normal.
    await step.run("store-embedding", async () => {
      const { error } = await supabase
        .from("posts")
        .update({ caption_embedding: toPgVector(embedding) })
        .eq("id", postId);
      if (error) {
        console.warn("[generate-post] caption_embedding não salvo:", error.message);
      }
      return null;
    });

    // 4. Imagem BASE — só a foto, sem nenhuma marca. Usa a imagem
    //    original da matéria quando o feed trouxe uma; senão o provider
    //    configurado em Ajustes.
    //
    //    A ARTE não é composta aqui (migration 040). Enquanto o post está
    //    na fila, a Fila desenha um preview ao vivo sobre esta base com o
    //    Brand Kit ATUAL — então trocar template/cor em Ajustes aparece na
    //    hora, sem re-renderizar nada. A arte de verdade só é montada na
    //    aprovação, e aí congela.
    const baseImage = await step.run("resolve-base-image", async () => {
      // Fotos de banco já usadas por este usuário — não repetir a mesma
      // foto em dois posts.
      const excludeStockIds = new Set<string>();
      const { data: used } = await supabase
        .from("posts")
        .select("stock_photo_id")
        .eq("user_id", userId)
        .not("stock_photo_id", "is", null);
      for (const row of used ?? []) {
        if (row.stock_photo_id) excludeStockIds.add(row.stock_photo_id as string);
      }

      const { buffer, stock } = await resolveBaseImage({
        imagePrompt: pkg.image_prompt,
        sourceImageUrl: news.image_url,
        imageProvider: prefs.imageProvider,
        excludeStockIds,
      });
      const { baseUrl, grid } = await persistBaseImage(postId, buffer);

      await supabase
        .from("posts")
        .update({
          base_image_url: baseUrl,
          base_luminance: grid,
          ...(stock && { stock_photo_id: stock.id, stock_photo_credit: stock.credit }),
        })
        .eq("id", postId);

      return { baseUrl };
    });

    // 5. Post pronto para aprovação. image_url segue nulo de propósito —
    //    a arte nasce na aprovação.
    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("posts")
        .update({ status: "pending_approval", render_status: "none" })
        .eq("id", postId);
      if (error) throw new Error(`Erro ao finalizar post: ${error.message}`);
    });

    // 6. Notifica o usuário no Telegram (job separado)
    await step.sendEvent("dispatch-notify", {
      name: "post/ready.notify",
      data: { postId, userId },
    });

    return { postId, baseImageUrl: baseImage.baseUrl };
  }
);
