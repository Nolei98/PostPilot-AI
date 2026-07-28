// ============================================================
// Job: prepara o vídeo que o usuário anexou a um post pendente (Fase 4,
// kit v2 §3). Disparado por uploadPostVideo (actions.ts), que sobe o
// arquivo bruto de forma síncrona.
//
// A COMPOSIÇÃO (ffmpeg) não acontece mais aqui (migration 040): o vídeo
// era encodado inteiro no anexo e re-encodado do zero a cada troca de
// layout em Ajustes — dezenas de segundos por vez, jogados fora se o post
// fosse descartado. Agora este job só extrai um pôster CRU e mede a
// luminância dele; a montagem do quadro roda na aprovação
// (render-approved-post → renderVideoPost), uma vez só.
//
// `event.data.shape` ("reels"|"feed"|"feed-blur", default "reels") agora
// é PERSISTIDO em posts.video_shape. Antes vivia só no evento, e o
// re-render sempre reaplicava "feed" — um post feito em "feed-blur"
// perdia o fundo borrado ao salvar o layout de novo.
//
// O step pesado NUNCA deixa exceção escapar — retorna {ok:false, error}
// em vez de lançar, pra o segundo step sempre gravar o estado final no
// post (sucesso OU erro).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const attachVideo = inngest.createFunction(
  { id: "attach-video", retries: 1, concurrency: { limit: 2 } },
  { event: "post/attach-video.requested" },
  async ({ event, step }) => {
    const { postId, shape } = event.data as {
      postId: string;
      shape?: "reels" | "feed" | "feed-blur";
    };
    const videoShape = shape ?? "reels";
    const isFeed = videoShape === "feed" || videoShape === "feed-blur";
    const supabase = createAdminClient();

    const result = await step.run("prepare-video", async () => {
      try {
        const { data: srcFile, error: dlErr } = await supabase.storage
          .from("post-images")
          .download(`${postId}-video-source.mp4`);
        if (dlErr || !srcFile) throw new Error("Vídeo fonte não encontrado no Storage");
        const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

        const { extractPosterFrame } = await import("@/lib/video");
        const { buildLuminanceGrid } = await import("@/lib/contrast");

        // Pôster CRU: é o que a Fila mostra no preview (com o overlay
        // desenhado por cima no browser) e a base da medição de contraste.
        // O pôster COM a arte só existe depois da aprovação.
        const poster = await extractPosterFrame(videoBuffer, 0.5);
        const grid = await buildLuminanceGrid(poster);

        const posterPath = `${postId}-video-poster-raw.jpg`;
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(posterPath, poster, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error(`Erro no upload do pôster: ${upErr.message}`);

        const { data: url } = supabase.storage.from("post-images").getPublicUrl(posterPath);
        return {
          ok: true as const,
          posterUrl: `${url.publicUrl}?v=${Date.now()}`,
          grid,
        };
      } catch (err) {
        console.error(`[attach-video] falha ao preparar o post ${postId}:`, err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    await step.run("update-post", async () => {
      if (result.ok) {
        await supabase
          .from("posts")
          .update({
            // video_url continua nulo: o vídeo composto nasce na aprovação
            base_image_url: result.posterUrl,
            base_luminance: result.grid,
            video_poster_url: result.posterUrl,
            video_status: "ready",
            video_error: null,
            video_shape: videoShape,
            format: isFeed ? "video_feed" : "video",
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
