// ============================================================
// Job: re-renderiza TODOS os posts pendentes do cliente com o
// layout_preset atual — disparado ao salvar o layout em Ajustes
// (saveLayoutPreset, em actions.ts).
//
// Antes isso rodava SÍNCRONO dentro do Server Action. Numa conta com
// centenas de posts únicos pendentes (a página 1 agora também depende
// do layout_preset — antes só a contra-capa dependia), o loop demorava
// minutos e arriscava estourar o timeout do Server Action/serverless.
// Cada post vira um step próprio (retry independente, igual ao padrão
// já usado em generate-carousel.ts) — falha isolada não derruba os
// demais nem perde o progresso já feito.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePostFontFamily } from "@/lib/font-data";
import type { CardBrand } from "@/lib/carousel-render";
import type { BrandTemplate, IgProfile, VisualIdentity } from "@/lib/types";

export const resyncLayoutPreset = inngest.createFunction(
  { id: "resync-layout-preset", retries: 2, concurrency: { limit: 1 } },
  { event: "post/resync-layout.requested" },
  async ({ event, step }) => {
    const { clientId, userId } = event.data as { clientId: string; userId: string };
    const supabase = createAdminClient();

    const prefs = await step.run("fetch-brand", async () => {
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
      const brandTemplate: BrandTemplate = {
        fontFamily: resolvePostFontFamily(bk?.post_font_family),
        logoUrl: bk?.logo_url ?? null,
        showLogo: bk?.show_brand_logo ?? true,
      };
      return { profile, cardBrand, brandTemplate };
    });

    const watermark = await step.run("check-plan", async () => {
      const { getUserPlan } = await import("@/lib/subscription");
      return (await getUserPlan(userId)) === "free";
    });

    // --- Carrosséis pendentes ---
    const carouselPosts = await step.run("fetch-carousel-posts", async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, news_item_id")
        .eq("client_id", clientId)
        .eq("status", "pending_approval")
        .eq("format", "carousel");
      return data ?? [];
    });

    for (const post of carouselPosts) {
      await step.run(`carousel-${post.id}`, async () => {
        const { renderAndUploadCard } = await import("@/lib/carousel-render");
        let newsImg: string | null = null;
        const { data: news } = await supabase
          .from("news_items")
          .select("image_url")
          .eq("id", post.news_item_id)
          .maybeSingle();
        newsImg = news?.image_url ?? null;

        const { data: cards } = await supabase
          .from("carousel_cards")
          .select("*")
          .eq("post_id", post.id)
          .order("idx");
        if (!cards || cards.length === 0) return { skipped: true };

        let coverUrl: string | null = null;
        const lastIdx = cards.length - 1;
        for (const c of cards) {
          const isCover = c.idx === 0;
          const isClosing = c.idx === lastIdx;
          const pageKind = isCover ? "cover" : isClosing ? "closing" : "interior";
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
              prefs.cardBrand,
              pageKind,
              bgBuf,
              prefs.profile,
              cards.length
            );
            await supabase.from("carousel_cards").update({ image_url: url }).eq("id", c.id);
            if (isCover) coverUrl = url;
          } catch (err) {
            console.error(`[resync-layout-preset] falha no card ${c.idx} do post ${post.id}:`, err);
          }
        }
        if (coverUrl) {
          await supabase.from("posts").update({ image_url: coverUrl }).eq("id", post.id);
        }
        return { cards: cards.length };
      });
    }

    // --- Posts únicos pendentes ---
    const singlePosts = await step.run("fetch-single-posts", async () => {
      const { data } = await supabase
        .from("posts")
        .select(
          "id, hook, template_applied, tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, tpl_color_background, tpl_color_accent, tpl_color_text, tpl_color_keyword_box"
        )
        .eq("client_id", clientId)
        .eq("status", "pending_approval")
        .eq("format", "single");
      return data ?? [];
    });

    for (const post of singlePosts) {
      await step.run(`single-page1-${post.id}`, async () => {
        const { regenerateContentImage } = await import("@/lib/image");
        try {
          const imageUrl = await regenerateContentImage(
            post.id,
            post.hook ?? "",
            prefs.profile,
            watermark,
            prefs.brandTemplate
          );
          if (imageUrl) await supabase.from("posts").update({ image_url: imageUrl }).eq("id", post.id);
          return { updated: !!imageUrl };
        } catch (err) {
          console.error(`[resync-layout-preset] falha na página 1 do post ${post.id}:`, err);
          return { updated: false };
        }
      });

      if (post.template_applied) {
        await step.run(`single-closing-${post.id}`, async () => {
          const { renderAndUploadTemplateArt } = await import("@/lib/image");
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
          try {
            const closingImageUrl = await renderAndUploadTemplateArt(
              post.id,
              identity,
              prefs.profile,
              watermark,
              prefs.brandTemplate
            );
            await supabase.from("posts").update({ closing_image_url: closingImageUrl }).eq("id", post.id);
            return { updated: true };
          } catch (err) {
            console.error(`[resync-layout-preset] falha na contra-capa do post ${post.id}:`, err);
            return { updated: false };
          }
        });
      }
    }

    return { carouselCount: carouselPosts.length, singleCount: singlePosts.length };
  }
);
