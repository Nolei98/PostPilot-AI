// ============================================================
// Job: monta a ARTE FINAL de um post no momento da aprovação
// (migration 040). Disparado por approvePost/schedulePost (actions.ts).
//
// Até aqui a arte era composta na geração: um carrossel de 10 páginas
// gastava 10 renders antes de alguém decidir se o post presta, e toda
// troca de cor/template/layout em Ajustes deixava a fila inteira
// dessincronizada (resync em massa, migration 039). Agora a fila só
// desenha preview ao vivo e o render acontece UMA vez, aqui.
//
// Duas garantias que este job precisa dar:
//  - CONGELAR: o RenderSpec resolvido é gravado em posts.render_spec, e é
//    ele — não o brand_kit de hoje — que manda em qualquer re-render
//    futuro. Post aprovado nunca mais herda mudança de Ajustes.
//  - NÃO SOBRESCREVER render mais novo: todo write é guardado por
//    render_token. Aprovar → desistir → aprovar de novo gera token novo;
//    o run antigo, se ainda estiver vivo, vira no-op em vez de gravar
//    arte velha por cima da nova.
//
// Falha não some: render_status='error' + render_error, e o post fica
// aprovado sem arte (a publicação é que segura — ver
// publish-scheduled-posts).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRenderSpec } from "@/lib/render-spec";
import {
  renderCardVideo,
  renderCarouselPost,
  renderSinglePost,
  renderVideoPost,
} from "@/lib/post-render";
import type { RenderSpec, VideoShape } from "@/lib/types";

/** Quadro do vídeo deste post. Post anterior à 040 não tem o campo. */
function shapeOf(format: string, stored: VideoShape | null): "reels" | "feed" | "feed-blur" {
  if (stored) return stored;
  return format === "video_feed" ? "feed" : "reels";
}

export const renderApprovedPost = inngest.createFunction(
  { id: "render-approved-post", retries: 2, concurrency: { limit: 3 } },
  { event: "post/render.requested" },
  async ({ event, step }) => {
    const { postId, userId, token } = event.data as {
      postId: string;
      userId: string;
      token: string;
    };
    const supabase = createAdminClient();

    const post = await step.run("fetch-post", async () => {
      const { data } = await supabase
        .from("posts")
        .select(
          "id, client_id, news_item_id, format, hook, video_status, video_shape, render_token, bg_mode, bg_color, mark_mode, mark_color, template_applied, tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, tpl_color_background, tpl_color_accent, tpl_color_text, tpl_color_keyword_box"
        )
        .eq("id", postId)
        .maybeSingle();
      return data;
    });

    if (!post) return { skipped: "post não encontrado" };
    // Token diferente = já existe um render mais novo pra este post. Sair
    // aqui, antes de qualquer write, é o que impede arte antiga de vencer.
    if (post.render_token !== token) return { skipped: "render superado" };

    const spec = (await step.run("resolve-spec", async () =>
      resolveRenderSpec({
        clientId: post.client_id,
        userId,
        post: {
          format: post.format,
          template_applied: post.template_applied,
          video_shape: post.video_shape,
          bg_mode: post.bg_mode,
          bg_color: post.bg_color,
          mark_mode: post.mark_mode,
          mark_color: post.mark_color,
          tpl_keyword: post.tpl_keyword,
          tpl_top_text: post.tpl_top_text,
          tpl_bottom_text: post.tpl_bottom_text,
          tpl_cta_enabled: post.tpl_cta_enabled,
          tpl_color_background: post.tpl_color_background,
          tpl_color_accent: post.tpl_color_accent,
          tpl_color_text: post.tpl_color_text,
          tpl_color_keyword_box: post.tpl_color_keyword_box,
        },
      })
    )) as RenderSpec;

    /** Aplica um patch só se este ainda for o render vigente. */
    async function patchPost(patch: Record<string, unknown>) {
      await supabase.from("posts").update(patch).eq("id", postId).eq("render_token", token);
    }

    await step.run("mark-rendering", () => patchPost({ render_status: "rendering" }));

    // O step pesado nunca deixa exceção escapar: o estado final (ready OU
    // error) precisa ser gravado no post em qualquer caminho — post
    // aprovado preso em 'rendering' pra sempre não sai da fila de
    // publicação nem avisa ninguém.
    const result = await step.run("render", async () => {
      try {
        if (post.format === "carousel") {
          const { data: news } = await supabase
            .from("news_items")
            .select("image_url")
            .eq("id", post.news_item_id)
            .maybeSingle();

          const { cardUrls, coverUrl, failed } = await renderCarouselPost(postId, spec, {
            fallbackBgUrl: news?.image_url ?? null,
          });
          if (cardUrls.length === 0) throw new Error("Carrossel sem cards pra renderizar");
          // Falha em TODOS os cards é falha do post; falha em alguns já é
          // tolerada dentro de renderCarouselPost (o card fica sem arte e o
          // erro vai pro log) — melhor publicar 9 de 10 páginas.
          if (failed === cardUrls.length) throw new Error("Nenhum card do carrossel renderizou");

          // Cards com vídeo pronto (migration 037) recompõem o quadro com a
          // mesma spec congelada — senão o vídeo do card sairia com a arte
          // que o attach-card-video nunca chegou a montar.
          const { data: videoCards } = await supabase
            .from("carousel_cards")
            .select("id")
            .eq("post_id", postId)
            .eq("video_status", "ready");
          for (const card of videoCards ?? []) {
            try {
              const { videoUrl } = await renderCardVideo(card.id, spec);
              await supabase
                .from("carousel_cards")
                .update({ video_url: videoUrl, video_error: null })
                .eq("id", card.id);
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[render-approved-post] vídeo do card ${card.id} falhou:`, err);
              await supabase
                .from("carousel_cards")
                .update({ video_error: message })
                .eq("id", card.id);
            }
          }
          return { ok: true as const, patch: coverUrl ? { image_url: coverUrl } : {} };
        }

        if (post.format === "video" || post.format === "video_feed") {
          if (post.video_status !== "ready") {
            throw new Error("Vídeo ainda não terminou de ser preparado");
          }
          const { videoUrl, posterUrl } = await renderVideoPost(
            postId,
            post.hook ?? "",
            spec,
            shapeOf(post.format, post.video_shape)
          );
          return {
            ok: true as const,
            patch: { video_url: videoUrl, video_poster_url: posterUrl, video_error: null },
          };
        }

        const { imageUrl, closingUrl } = await renderSinglePost(postId, post.hook ?? "", spec);
        if (!imageUrl) throw new Error("Página 1 não pôde ser composta (base ausente?)");
        const patch: Record<string, unknown> = { image_url: imageUrl };
        if (closingUrl) patch.closing_image_url = closingUrl;
        return { ok: true as const, patch };
      } catch (err) {
        console.error(`[render-approved-post] falha no post ${postId}:`, err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    await step.run("finish", async () => {
      if (result.ok) {
        await patchPost({
          ...result.patch,
          render_spec: spec,
          render_status: "ready",
          render_error: null,
        });
      } else {
        await patchPost({ render_status: "error", render_error: result.error });
      }
    });

    return result.ok ? { rendered: postId } : { failed: postId, error: result.error };
  }
);
