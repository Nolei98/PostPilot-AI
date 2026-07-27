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

    // Marca TUDO que este job vai reprocessar como 'pending' antes de
    // começar. A Fila usa isso pra mostrar "aplicando o layout novo"
    // enquanto o trabalho acontece de verdade — sem esse sinal o
    // usuário vê a arte antiga por minutos e conclui que o layout não
    // foi aplicado (aconteceu em 2026-07-27). Cada post volta pra
    // 'idle' assim que o seu render termina.
    await step.run("mark-rerendering", async () => {
      const { count } = await supabase
        .from("posts")
        .update({ rerender_status: "pending" }, { count: "exact" })
        .eq("client_id", clientId)
        .eq("status", "pending_approval")
        .in("format", ["single", "carousel", "video", "video_feed"]);
      return { marked: count ?? 0 };
    });

    /** Devolve o post pro estado normal — a UI para de mostrar o spinner. */
    async function clearRerender(postId: string) {
      await supabase.from("posts").update({ rerender_status: "idle" }).eq("id", postId);
    }

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
        await clearRerender(post.id);
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

      // Só depois da contra-capa (quando existe) o post único está
      // realmente pronto — liberar antes deixaria o card sem spinner
      // com a arte ainda mudando.
      await step.run(`single-done-${post.id}`, async () => {
        await clearRerender(post.id);
        return { done: true };
      });
    }

    // --- Posts de vídeo (Reels) já prontos ---
    // Reusa o vídeo-fonte já salvo (`-video-source.mp4`) — não precisa o
    // usuário reenviar o arquivo, só recompõe o overlay com o layout novo.
    const videoPosts = await step.run("fetch-video-posts", async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, hook")
        .eq("client_id", clientId)
        .eq("status", "pending_approval")
        .eq("format", "video")
        .eq("video_status", "ready");
      return data ?? [];
    });

    for (const post of videoPosts) {
      await step.run(`video-${post.id}`, async () => {
        try {
          const { data: srcFile, error: dlErr } = await supabase.storage
            .from("post-images")
            .download(`${post.id}-video-source.mp4`);
          if (dlErr || !srcFile) throw new Error("vídeo fonte não encontrado no Storage");
          const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

          const { extractPosterFrame, composeReelsVideo } = await import("@/lib/video");
          const { buildReelsVideoOverlayPng } = await import("@/lib/image");

          const poster = await extractPosterFrame(videoBuffer, 0.5);
          const overlay = await buildReelsVideoOverlayPng(post.hook ?? "", prefs.cardBrand, poster);
          const finalVideo = await composeReelsVideo(videoBuffer, overlay);
          // Pôster salvo precisa ser do vídeo FINAL (com overlay), não
          // do bruto usado só pra medir contraste — mesmo fix de attach-video.ts.
          const finalPoster = await extractPosterFrame(finalVideo, 0.5);

          const videoPath = `${post.id}-video.mp4`;
          const posterPath = `${post.id}-video-poster.jpg`;
          await supabase.storage.from("post-images").upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
          await supabase.storage.from("post-images").upload(posterPath, finalPoster, { contentType: "image/jpeg", upsert: true });
          const { data: videoUrlData } = supabase.storage.from("post-images").getPublicUrl(videoPath);
          const { data: posterUrlData } = supabase.storage.from("post-images").getPublicUrl(posterPath);

          await supabase
            .from("posts")
            .update({
              video_url: `${videoUrlData.publicUrl}?v=${Date.now()}`,
              video_poster_url: `${posterUrlData.publicUrl}?v=${Date.now()}`,
              video_error: null,
            })
            .eq("id", post.id);
          await clearRerender(post.id);
          return { updated: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[resync-layout-preset] falha no vídeo do post ${post.id}:`, err);
          // Não derruba video_status/video_url — o vídeo antigo continua válido,
          // só registra o erro em video_error pra ficar rastreável no banco
          // (a UI só mostra esse campo quando video_status='error').
          await supabase.from("posts").update({ video_error: message }).eq("id", post.id);
          return { updated: false };
        }
      });
    }

    // --- Posts de vídeo FEED (4:5, migration 036) já prontos ---
    const feedVideoPosts = await step.run("fetch-feed-video-posts", async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, hook")
        .eq("client_id", clientId)
        .eq("status", "pending_approval")
        .eq("format", "video_feed")
        .eq("video_status", "ready");
      return data ?? [];
    });

    for (const post of feedVideoPosts) {
      await step.run(`feed-video-${post.id}`, async () => {
        try {
          const { data: srcFile, error: dlErr } = await supabase.storage
            .from("post-images")
            .download(`${post.id}-video-source.mp4`);
          if (dlErr || !srcFile) throw new Error("vídeo fonte não encontrado no Storage");
          const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

          const { composeFeedVideo, extractPosterFrame } = await import("@/lib/video");
          const { buildFeedVideoOverlay } = await import("@/lib/image");

          const { overlayPng, frame } = buildFeedVideoOverlay(post.hook ?? "", prefs.cardBrand);
          const finalVideo = await composeFeedVideo(videoBuffer, overlayPng, frame);
          const finalPoster = await extractPosterFrame(finalVideo, 0.5);

          const videoPath = `${post.id}-video.mp4`;
          const posterPath = `${post.id}-video-poster.jpg`;
          await supabase.storage.from("post-images").upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
          await supabase.storage.from("post-images").upload(posterPath, finalPoster, { contentType: "image/jpeg", upsert: true });
          const { data: videoUrlData } = supabase.storage.from("post-images").getPublicUrl(videoPath);
          const { data: posterUrlData } = supabase.storage.from("post-images").getPublicUrl(posterPath);

          await supabase
            .from("posts")
            .update({
              video_url: `${videoUrlData.publicUrl}?v=${Date.now()}`,
              video_poster_url: `${posterUrlData.publicUrl}?v=${Date.now()}`,
              video_error: null,
            })
            .eq("id", post.id);
          await clearRerender(post.id);
          return { updated: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[resync-layout-preset] falha no vídeo feed do post ${post.id}:`, err);
          await supabase.from("posts").update({ video_error: message }).eq("id", post.id);
          return { updated: false };
        }
      });
    }

    // --- Cards de carrossel com vídeo (interior, migration 037) já prontos ---
    const videoCards = await step.run("fetch-video-cards", async () => {
      const { data } = await supabase
        .from("carousel_cards")
        .select("id, post_id, idx, headline, body, posts!inner(client_id, status)")
        .eq("posts.client_id", clientId)
        .eq("posts.status", "pending_approval")
        .eq("video_status", "ready");
      return data ?? [];
    });

    for (const card of videoCards) {
      await step.run(`card-video-${card.id}`, async () => {
        try {
          const sourcePath = `${card.post_id}-card-${card.idx}-video-source.mp4`;
          const { data: srcFile, error: dlErr } = await supabase.storage
            .from("post-images")
            .download(sourcePath);
          if (dlErr || !srcFile) throw new Error("vídeo fonte não encontrado no Storage");
          const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

          const { composeFeedVideo } = await import("@/lib/video");
          const { buildCardVideoOverlay } = await import("@/lib/image");

          // Mesmo cálculo do attach-card-video: capa, fechamento ou
          // interior — sem isso o resync devolvia a capa com estrutura
          // de card do meio, perdendo eyebrow/wordmark/deslize.
          const { count: totalCards } = await supabase
            .from("carousel_cards")
            .select("*", { count: "exact", head: true })
            .eq("post_id", card.post_id);
          const total = totalCards ?? 0;
          const pageKind =
            card.idx === 0 ? "cover" : total > 0 && card.idx === total - 1 ? "closing" : "interior";

          const { overlayPng, frame } = buildCardVideoOverlay(
            { headline: card.headline, body: card.body },
            prefs.cardBrand,
            { pageKind, index: card.idx, total }
          );
          const finalVideo = await composeFeedVideo(videoBuffer, overlayPng, frame);

          const videoPath = `${card.post_id}-card-${card.idx}-video.mp4`;
          await supabase.storage.from("post-images").upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
          const { data: videoUrlData } = supabase.storage.from("post-images").getPublicUrl(videoPath);

          await supabase
            .from("carousel_cards")
            .update({ video_url: `${videoUrlData.publicUrl}?v=${Date.now()}`, video_error: null })
            .eq("id", card.id);
          return { updated: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[resync-layout-preset] falha no vídeo do card ${card.id}:`, err);
          await supabase.from("carousel_cards").update({ video_error: message }).eq("id", card.id);
          return { updated: false };
        }
      });
    }

    // Varredura final: qualquer post que ficou 'pending' (render que
    // falhou no meio, formato que este job não cobre) volta pra 'idle'.
    // Sem isso um erro isolado deixaria o card girando pra sempre —
    // spinner eterno é pior que arte velha, porque promete algo.
    await step.run("clear-rerendering", async () => {
      const { count } = await supabase
        .from("posts")
        .update({ rerender_status: "idle" }, { count: "exact" })
        .eq("client_id", clientId)
        .eq("rerender_status", "pending");
      return { cleared: count ?? 0 };
    });

    return {
      carouselCount: carouselPosts.length,
      singleCount: singlePosts.length,
      videoCount: videoPosts.length,
      feedVideoCount: feedVideoPosts.length,
      videoCardCount: videoCards.length,
    };
  }
);
