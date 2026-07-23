// ============================================================
// Job: compõe o quadro (Reels 9:16, feed 4:5 fundo sólido — migration
// 036, ou feed 4:5 fundo borrado — 2026-07-23) sobre o vídeo que o
// usuário anexou a um post pendente (Fase 4, kit v2 §3). Disparado por
// uploadPostVideo (actions.ts) — o upload em si é síncrono (só sobe o
// arquivo bruto), o processamento pesado (ffmpeg) roda aqui, em
// background, porque pode levar dezenas de segundos.
// `event.data.shape` ("reels"|"feed"|"feed-blur", default "reels")
// decide qual quadro é montado.
//
// LIMITAÇÃO CONHECIDA: qual variante ("feed" vs "feed-blur") foi usada
// não fica salva no post — só o format final ("video_feed" pra ambas).
// resync-layout-preset.ts SEMPRE reaplica a variante "feed" (fundo
// sólido) ao resincronizar; um post que usou "feed-blur" perderia o
// fundo borrado se o layout for salvo de novo em Ajustes. OK por
// enquanto (feature em teste, ainda sem botão na UI de produção).
//
// Um único step faz o trabalho pesado e NUNCA deixa exceção escapar —
// captura o erro e retorna {ok:false, error} em vez de lançar, pra o
// segundo step sempre conseguir gravar o estado final no post (sucesso
// OU erro), mesmo que o encode falhe.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePostFontFamily } from "@/lib/font-data";
import type { CardBrand } from "@/lib/carousel-render";

export const attachVideo = inngest.createFunction(
  { id: "attach-video", retries: 1, concurrency: { limit: 2 } },
  { event: "post/attach-video.requested" },
  async ({ event, step }) => {
    const { postId, shape } = event.data as { postId: string; shape?: "reels" | "feed" | "feed-blur" };
    const isFeed = shape === "feed";
    const isFeedBlur = shape === "feed-blur";
    const supabase = createAdminClient();

    const result = await step.run("process-video", async () => {
      try {
        const { data: post, error: postErr } = await supabase
          .from("posts")
          .select("client_id, hook")
          .eq("id", postId)
          .maybeSingle();
        if (postErr || !post) throw new Error("Post não encontrado");

        const { data: bk } = await supabase
          .from("brand_kits")
          .select("*")
          .eq("client_id", post.client_id)
          .maybeSingle();
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

        const { data: srcFile, error: dlErr } = await supabase.storage
          .from("post-images")
          .download(`${postId}-video-source.mp4`);
        if (dlErr || !srcFile) throw new Error("Vídeo fonte não encontrado no Storage");
        const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

        const { extractPosterFrame, composeReelsVideo, composeFeedVideo, composeFeedVideoBlurBg } = await import("@/lib/video");
        const { buildReelsVideoOverlayPng, buildFeedVideoOverlay, buildFeedVideoOverlayBlurBg, roundedRectMaskPng } = await import("@/lib/image");

        // Regra do kit: luminância medida pelo FRAME DE PÔSTER, não o vídeo inteiro.
        const poster = await extractPosterFrame(videoBuffer, 0.5);
        let finalVideo: Buffer;
        if (isFeedBlur) {
          // Feed 4:5 (fundo borrado, 2026-07-23): o MESMO vídeo vira o
          // fundo inteiro (borrado) — a moldura nítida fica por cima.
          const { overlayPng, frame } = await buildFeedVideoOverlayBlurBg(post.hook ?? "", cardBrand, poster);
          const maskPng = roundedRectMaskPng(frame.w, frame.h, frame.radius);
          finalVideo = await composeFeedVideoBlurBg(videoBuffer, overlayPng, maskPng, frame);
        } else if (isFeed) {
          // Feed 4:5: vídeo numa MOLDURA própria (16:9, cantos
          // arredondados) — fundo sólido (padrão preto) + texto na
          // seção dele, nunca sobrepostos (ver buildFeedVideoOverlay).
          const { overlayPng, frame } = buildFeedVideoOverlay(post.hook ?? "", cardBrand);
          finalVideo = await composeFeedVideo(videoBuffer, overlayPng, frame);
        } else {
          // Reels 9:16: overlay já em 1080x1350, encaixado no rodapé do quadro maior.
          const overlay = await buildReelsVideoOverlayPng(post.hook ?? "", cardBrand, poster);
          finalVideo = await composeReelsVideo(videoBuffer, overlay);
        }

        // Pôster pro <video poster=...> da Fila/Prontos precisa ser um
        // frame do vídeo FINAL (já com overlay/marca/moldura) — não o
        // `poster` bruto (usado só pra medir luminância/contraste antes
        // de compor). Sem isso a Fila mostrava o vídeo cru sem nenhum
        // design até o usuário clicar em play (bug real reportado).
        const finalPoster = await extractPosterFrame(finalVideo, 0.5);

        const videoPath = `${postId}-video.mp4`;
        const posterPath = `${postId}-video-poster.jpg`;
        const { error: videoUpErr } = await supabase.storage
          .from("post-images")
          .upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
        if (videoUpErr) throw new Error(`Erro no upload do vídeo: ${videoUpErr.message}`);
        const { error: posterUpErr } = await supabase.storage
          .from("post-images")
          .upload(posterPath, finalPoster, { contentType: "image/jpeg", upsert: true });
        if (posterUpErr) throw new Error(`Erro no upload do pôster: ${posterUpErr.message}`);

        const { data: videoUrlData } = supabase.storage.from("post-images").getPublicUrl(videoPath);
        const { data: posterUrlData } = supabase.storage.from("post-images").getPublicUrl(posterPath);

        return {
          ok: true as const,
          videoUrl: `${videoUrlData.publicUrl}?v=${Date.now()}`,
          posterUrl: `${posterUrlData.publicUrl}?v=${Date.now()}`,
        };
      } catch (err) {
        console.error(`[attach-video] falha ao processar o post ${postId}:`, err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    await step.run("update-post", async () => {
      if (result.ok) {
        await supabase
          .from("posts")
          .update({
            video_url: result.videoUrl,
            video_poster_url: result.posterUrl,
            video_status: "ready",
            video_error: null,
            format: isFeed || isFeedBlur ? "video_feed" : "video",
          })
          .eq("id", postId);
      } else {
        await supabase
          .from("posts")
          .update({ video_status: "error", video_error: result.error })
          .eq("id", postId);
      }
    });

    return result;
  }
);
