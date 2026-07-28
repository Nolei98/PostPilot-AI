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
import { resolveRenderSpec, withPost } from "@/lib/render-spec";
import {
  renderCardVideo,
  renderCarouselPost,
  renderSinglePost,
  renderVideoPost,
} from "@/lib/post-render";
import type { RenderSpec } from "@/lib/types";

export const resyncLayoutPreset = inngest.createFunction(
  { id: "resync-layout-preset", retries: 2, concurrency: { limit: 1 } },
  { event: "post/resync-layout.requested" },
  async ({ event, step }) => {
    const { clientId, userId } = event.data as { clientId: string; userId: string };
    const supabase = createAdminClient();

    // Uma resolução só pro cliente inteiro (Brand Kit + modelos do
    // Template Studio + plano). Cada post deriva daqui com withPost, que
    // só troca formato/contra-capa/overrides tpl_* — o resto é igual pra
    // todos, então não faz sentido reler por post.
    //
    // Template Studio (B15): respeitar o modelo escolhido por superfície é
    // obrigatório aqui. Antes o resync re-renderizava todo card pelo motor
    // antigo, então salvar o layout em Ajustes revertia silenciosamente a
    // arte dos carrosséis que tinham modelo — era exatamente o "post não
    // herdou o template" de 2026-07-27. Sem seleção → motor antigo.
    const baseSpec = (await step.run("resolve-spec", async () =>
      resolveRenderSpec({ clientId, userId, post: { format: "single" } })
    )) as RenderSpec;

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
        const { data: news } = await supabase
          .from("news_items")
          .select("image_url")
          .eq("id", post.news_item_id)
          .maybeSingle();

        const { cardUrls, coverUrl } = await renderCarouselPost(
          post.id,
          withPost(baseSpec, { format: "carousel" }),
          { fallbackBgUrl: news?.image_url ?? null }
        );
        if (coverUrl) {
          await supabase.from("posts").update({ image_url: coverUrl }).eq("id", post.id);
        }
        await clearRerender(post.id);
        return { cards: cardUrls.length };
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
      await step.run(`single-${post.id}`, async () => {
        try {
          const { imageUrl, closingUrl } = await renderSinglePost(
            post.id,
            post.hook ?? "",
            withPost(baseSpec, {
              format: "single",
              template_applied: post.template_applied,
              tpl_keyword: post.tpl_keyword,
              tpl_top_text: post.tpl_top_text,
              tpl_bottom_text: post.tpl_bottom_text,
              tpl_cta_enabled: post.tpl_cta_enabled,
              tpl_color_background: post.tpl_color_background,
              tpl_color_accent: post.tpl_color_accent,
              tpl_color_text: post.tpl_color_text,
              tpl_color_keyword_box: post.tpl_color_keyword_box,
            })
          );
          const patch: Record<string, string> = {};
          if (imageUrl) patch.image_url = imageUrl;
          if (closingUrl) patch.closing_image_url = closingUrl;
          if (Object.keys(patch).length) {
            await supabase.from("posts").update(patch).eq("id", post.id);
          }
          return { updated: !!imageUrl };
        } catch (err) {
          // Post gerado antes da migration 040 pode não ter
          // `{id}-base.jpg` (o upload da base era best-effort) — sem base
          // não dá pra recompor, e a arte antiga segue válida.
          console.error(`[resync-layout-preset] falha no post único ${post.id}:`, err);
          return { updated: false };
        } finally {
          await clearRerender(post.id);
        }
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
          const { videoUrl, posterUrl } = await renderVideoPost(
            post.id,
            post.hook ?? "",
            withPost(baseSpec, { format: "video" }),
            "reels"
          );
          await supabase
            .from("posts")
            .update({ video_url: videoUrl, video_poster_url: posterUrl, video_error: null })
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
          const { videoUrl, posterUrl } = await renderVideoPost(
            post.id,
            post.hook ?? "",
            withPost(baseSpec, { format: "video_feed" }),
            "feed"
          );
          await supabase
            .from("posts")
            .update({ video_url: videoUrl, video_poster_url: posterUrl, video_error: null })
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
          // renderCardVideo recalcula capa/interior/fechamento a partir da
          // posição — sem isso a capa saía com estrutura de card do meio,
          // perdendo eyebrow/wordmark/deslize.
          const { videoUrl } = await renderCardVideo(
            card.id,
            withPost(baseSpec, { format: "carousel" })
          );
          await supabase
            .from("carousel_cards")
            .update({ video_url: videoUrl, video_error: null })
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
