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
import { renderTemplateCardPng } from "@/lib/template-render";
import { resolveTemplateSpecs } from "@/lib/template-selection";
import { resolvePostFontFamily } from "@/lib/font-data";
import type { IgProfile, NewsItem, Surface, TemplateSpec } from "@/lib/types";

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

    // Template Studio (Sprint B+, B15): só busca specs pras superfícies que
    // o cliente escolheu de propósito. Sem seleção → objeto vazio → cai no
    // motor antigo (renderAndUploadCard), zero mudança pra quem não escolheu.
    const templateSpecs = await step.run("fetch-templates", async () => {
      return resolveTemplateSpecs(prefs.templateSelection, [
        "cover_image",
        "carousel_page",
        "carousel_last",
      ]);
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

    // Renderiza e grava cada card (step por card = retry independente).
    const cardUrls: string[] = [];
    for (const card of pkg.cards) {
      const url = await step.run(`card-${card.idx}`, async () => {
        const bgUrl = bgUrls[card.idx] ?? null;
        let bgBuf: Buffer | null = null;
        if (bgUrl) {
          try {
            const r = await fetch(bgUrl);
            if (r.ok) bgBuf = Buffer.from(await r.arrayBuffer());
          } catch {
            /* sem foto → fundo sólido */
          }
        }
        // card 0 = capa; último = fechamento (mesmo tratamento @0verlens da
        // capa, sem "deslize p/ ver"); demais = card interior.
        const pageKind = card.idx === 0 ? "cover" : card.idx === lastIdx ? "closing" : "interior";
        const surface: Surface =
          pageKind === "cover" ? "cover_image" : pageKind === "closing" ? "carousel_last" : "carousel_page";
        const chosenSpec: TemplateSpec | undefined = templateSpecs[surface];

        let imageUrl: string;
        if (chosenSpec) {
          // Template Studio (B15): cliente escolheu um modelo pra essa
          // superfície — renderiza pela spec em vez do motor antigo.
          const png = await renderTemplateCardPng(
            chosenSpec,
            prefs.card,
            { headline: card.headline ?? undefined, body: card.body ?? undefined },
            bgBuf
          );
          const path = `${postId}-card-${card.idx}.png`;
          const { error: uploadError } = await supabase.storage
            .from("post-images")
            .upload(path, png, { contentType: "image/png", upsert: true });
          if (uploadError) throw new Error(`upload do card falhou: ${uploadError.message}`);
          const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
          imageUrl = `${pub.publicUrl}?v=${Date.now()}`;
        } else {
          imageUrl = await renderAndUploadCard(
            postId,
            card,
            prefs.card,
            pageKind,
            bgBuf,
            prefs.profile,
            pkg.cards.length
          );
        }
        const { data: inserted, error } = await supabase
          .from("carousel_cards")
          .insert({
            post_id: postId,
            idx: card.idx,
            role: card.role,
            headline: card.headline,
            body: card.body,
            image_url: imageUrl,
          })
          .select("id")
          .single();
        if (error) throw new Error(`Erro ao gravar card ${card.idx}: ${error.message}`);
        // bg_url best-effort (migration 029): permite o resync reusar a foto.
        if (bgUrl && inserted) {
          const { error: bgErr } = await supabase
            .from("carousel_cards")
            .update({ bg_url: bgUrl })
            .eq("id", inserted.id);
          if (bgErr) console.warn("[generate-carousel] bg_url não salvo (migration 029?):", bgErr.message);
        }
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
