// ============================================================
// Job: gera um CARROSSEL (7–10 cards) a partir de uma notícia.
//
// Fluxo: carrega notícia + brand_kit do cliente → Sonnet/Gemini gera a
// estrutura (carousel.ts) → cria o post (format='carousel') → resolve o
// FUNDO de cada card e insere as linhas em carousel_cards → post vira
// pending_approval → notifica. Roda em mock ($0).
//
// A ARTE dos cards não é renderizada aqui (migration 040). Um carrossel
// de 10 páginas gerava 10 PNGs neste job, todos jogados fora se o usuário
// trocasse o template ou descartasse o post. Agora o PNG nasce na
// aprovação; até lá a Fila desenha o preview ao vivo sobre bg_url.
//
// Disparo: evento post/generate-carousel.requested. Fluxo SEPARADO do
// generate-post (single) — não é chamado pelo cron ainda; a decisão de
// "quando fazer carrossel vs single" é do produto (a wirar depois).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateCarouselPackage } from "@/lib/ai/carousel";
import { type CardBrand } from "@/lib/carousel-render";
import { resolvePostFontFamily } from "@/lib/font-data";
import type { IgProfile, NewsItem, Surface } from "@/lib/types";

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
        // Identidade de rótulo @0verlens (migration 027; best-effort se ausente).
        wordmark: (data?.wordmark as string | null | undefined) ?? null,
        handle: (data?.ig_handle as string | null | undefined) ?? null,
        keywords: (data?.keywords as string[] | null | undefined) ?? null,
        brandMark: (data?.brand_mark as CardBrand["brandMark"]) ?? "auto",
        // Preset de layout (Fase 3; migration 030 — best-effort se ausente).
        layoutPreset: (data?.layout_preset as CardBrand["layoutPreset"]) ?? "editorial-noir",
      };
      const profile: IgProfile = {
        handle: (data?.ig_handle as string | undefined) ?? "seuperfil.ia",
        displayName: (data?.ig_display_name as string | undefined) ?? "Seu Perfil de IA",
        avatarUrl: (data?.ig_avatar_url as string | null | undefined) ?? null,
        verified: (data?.ig_verified as boolean | undefined) ?? false,
        showProfileChip: (data?.show_profile_chip as boolean | undefined) ?? true,
      };
      return {
        language: (data?.post_language as string | undefined) ?? "pt-BR",
        niche: (data?.niche as string | null | undefined) ?? null,
        textProvider,
        card,
        profile,
        templateSelection:
          (data?.template_selection as Partial<Record<Surface, string>> | null | undefined) ?? {},
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

    // Resolve o fundo de cada card: CAPA sempre tem imagem (notícia → banco
    // → pollinations); internos tentam o banco (opcional). Retorna as URLs
    // (serializável); o buffer é baixado no step de cada card.
    const lastIdx = pkg.cards.length - 1;
    const bgUrls = await step.run("resolve-backgrounds", async () => {
      const { getCardBg } = await import("@/lib/card-bg");
      const exclude = new Set<string>();
      const out: (string | null)[] = [];
      for (const card of pkg.cards) {
        const isCover = card.idx === 0;
        const isClosing = card.idx === lastIdx;
        const bg = await getCardBg({
          newsImageUrl: isCover ? news.image_url : null,
          niche: prefs.niche,
          headline: card.headline,
          excludeIds: exclude,
          allowGen: isCover || isClosing, // capa e fechamento: pollinations garante imagem
        });
        out.push(bg?.url ?? null);
      }
      return out;
    });

    // Grava os cards com o TEXTO e o FUNDO — sem renderizar arte
    // (migration 040). Um carrossel de 10 páginas renderizava 10 PNGs
    // aqui, todos jogados fora se o usuário trocasse o template ou
    // descartasse o post. Agora o PNG só nasce na aprovação; até lá a
    // Fila desenha o preview ao vivo por cima de bg_url.
    //
    // A luminância de cada fundo é medida UMA vez, agora, porque exige
    // sharp — o preview no browser não tem como medir, e precisa do
    // mesmo número que o render final vai usar.
    await step.run("insert-cards", async () => {
      const { buildLuminanceGrid } = await import("@/lib/contrast");
      for (const card of pkg.cards) {
        const bgUrl = bgUrls[card.idx] ?? null;
        let bgLuminance: unknown = null;
        if (bgUrl) {
          try {
            const r = await fetch(bgUrl);
            if (r.ok) bgLuminance = await buildLuminanceGrid(Buffer.from(await r.arrayBuffer()));
          } catch (err) {
            // sem amostra o preview cai num tema escuro seguro e o job
            // de aprovação mede na hora — não vale derrubar o carrossel
            console.warn(`[generate-carousel] luminância do card ${card.idx} não medida:`, err);
          }
        }
        const { error } = await supabase.from("carousel_cards").insert({
          post_id: postId,
          idx: card.idx,
          role: card.role,
          headline: card.headline,
          body: card.body,
          image_url: null,
          bg_url: bgUrl,
          bg_luminance: bgLuminance,
        });
        if (error) throw new Error(`Erro ao gravar card ${card.idx}: ${error.message}`);
      }
      return { cards: pkg.cards.length };
    });

    await step.run("mark-ready", async () => {
      const { error } = await supabase
        .from("posts")
        // image_url segue nulo: a arte nasce na aprovação. O thumbnail da
        // fila vem do preview ao vivo sobre o bg_url do card 0.
        .update({ status: "pending_approval", render_status: "none" })
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
