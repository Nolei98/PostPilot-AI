// ============================================================
// Job: gera um CARROSSEL (7–10 cards) a partir de uma notícia.
//
// Fluxo: carrega notícia + brand_kit do cliente → Sonnet/Gemini gera a
// estrutura (carousel.ts) → cria o post (format='carousel') → renderiza
// e insere cada card (carousel_cards) → post vira pending_approval →
// notifica. Cada card é um step (retry independente). Roda em mock ($0).
//
// Disparo: evento post/generate-carousel.requested. Fluxo SEPARADO do
// generate-post (single) — não é chamado pelo cron ainda; a decisão de
// "quando fazer carrossel vs single" é do produto (a wirar depois).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCarouselPackage } from "@/lib/ai/carousel";
import { renderAndUploadCard, type CardBrand } from "@/lib/carousel-render";
import { resolvePostFontFamily } from "@/lib/font-data";
import type { NewsItem } from "@/lib/types";

export const generateCarousel = inngest.createFunction(
  { id: "generate-carousel", retries: 2, concurrency: { limit: 2 } },
  { event: "post/generate-carousel.requested" },
  async ({ event, step }) => {
    const { newsItemId, userId } = event.data;
    const supabase = createAdminClient();

    const news = await step.run("fetch-news", async () => {
      const { data, error } = await supabase
        .from("news_items")
        .select("*")
        .eq("id", newsItemId)
        .single();
      if (error) throw new Error(`Notícia não encontrada: ${error.message}`);
      return data as NewsItem;
    });

    // Idempotência: (client_id, news_item_id) é unique → um post por notícia.
    const existing = await step.run("check-existing", async () => {
      const { data } = await supabase
        .from("posts")
        .select("id")
        .eq("news_item_id", newsItemId)
        .maybeSingle();
      return data?.id ?? null;
    });
    if (existing) return { skipped: true, reason: "Post já existe", postId: existing };

    // Config de marca/geração do cliente da notícia.
    const prefs = await step.run("fetch-brand", async () => {
      const { data } = await supabase
        .from("brand_kits")
        .select("*")
        .eq("client_id", news.client_id)
        .maybeSingle();
      const textProvider: "claude" | "gemini" | "pollinations" =
        data?.text_provider === "claude" || data?.text_provider === "pollinations"
          ? data.text_provider
          : "gemini";
      const card: CardBrand = {
        colorBackground: data?.color_background ?? "#0B0B12",
        colorAccent: data?.color_accent ?? "#7C5CFF",
        colorText: data?.color_text ?? "#FFFFFF",
        fontFamily: resolvePostFontFamily(data?.post_font_family),
        brandName: data?.brand_name ?? null,
      };
      return {
        language: (data?.post_language as string | undefined) ?? "pt-BR",
        niche: (data?.niche as string | null | undefined) ?? null,
        textProvider,
        card,
      };
    });

    const pkg = await step.run("generate-structure", async () => {
      return generateCarouselPackage(
        {
          title: news.title,
          summary: news.summary,
          url: news.url,
          language: prefs.language,
          niche: prefs.niche,
        },
        prefs.textProvider
      );
    });

    const postId = await step.run("create-post", async () => {
      const { data, error } = await supabase
        .from("posts")
        .insert({
          news_item_id: newsItemId,
          user_id: userId,
          client_id: news.client_id,
          format: "carousel",
          hook: pkg.cards[0].headline,
          caption: pkg.caption,
          hashtags: pkg.hashtags,
          image_prompt: "", // carrossel não usa prompt de imagem única
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw new Error(`Erro ao criar post: ${error.message}`);
      return data.id as string;
    });

    // Renderiza e grava cada card (step por card = retry independente).
    const cardUrls: string[] = [];
    for (const card of pkg.cards) {
      const url = await step.run(`card-${card.idx}`, async () => {
        const imageUrl = await renderAndUploadCard(postId, card, prefs.card);
        const { error } = await supabase.from("carousel_cards").insert({
          post_id: postId,
          idx: card.idx,
          role: card.role,
          headline: card.headline,
          body: card.body,
          image_url: imageUrl,
        });
        if (error) throw new Error(`Erro ao gravar card ${card.idx}: ${error.message}`);
        return imageUrl;
      });
      cardUrls.push(url);
    }

    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("posts")
        // image_url = card do gancho: faz o carrossel aparecer como
        // thumbnail nos lugares que mostram uma imagem só (Prontos,
        // Telegram). A galeria completa vem de carousel_cards.
        .update({ status: "pending_approval", image_url: cardUrls[0] ?? null })
        .eq("id", postId);
      if (error) throw new Error(`Erro ao finalizar carrossel: ${error.message}`);
    });

    await step.sendEvent("dispatch-notify", {
      name: "post/ready.notify",
      data: { postId, userId },
    });

    return { postId, cards: pkg.cards.length };
  }
);
