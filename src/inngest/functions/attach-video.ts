// ============================================================
// Job: compõe o quadro Reels 9:16 sobre o vídeo que o usuário anexou a
// um post pendente (Fase 4, kit v2 §3). Disparado por uploadPostVideo
// (actions.ts) — o upload em si é síncrono (só sobe o arquivo bruto),
// o processamento pesado (ffmpeg) roda aqui, em background, porque pode
// levar dezenas de segundos.
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
    const { postId } = event.data as { postId: string };
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

        const { extractPosterFrame, composeReelsVideo } = await import("@/lib/video");
        const { buildReelsVideoOverlayPng } = await import("@/lib/image");

        // Regra do kit: luminância medida pelo FRAME DE PÔSTER, não o vídeo inteiro.
        const poster = await extractPosterFrame(videoBuffer, 0.5);
        const overlay = await buildReelsVideoOverlayPng(post.hook ?? "", cardBrand, poster);
        const finalVideo = await composeReelsVideo(videoBuffer, overlay);

        const videoPath = `${postId}-video.mp4`;
        const posterPath = `${postId}-video-poster.jpg`;
        const { error: videoUpErr } = await supabase.storage
          .from("post-images")
          .upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
        if (videoUpErr) throw new Error(`Erro no upload do vídeo: ${videoUpErr.message}`);
        const { error: posterUpErr } = await supabase.storage
          .from("post-images")
          .upload(posterPath, poster, { contentType: "image/jpeg", upsert: true });
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
            format: "video",
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
