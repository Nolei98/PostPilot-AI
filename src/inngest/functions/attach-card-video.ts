// ============================================================
// Job: prepara o vídeo anexado a um card INTERIOR do carrossel
// (migration 037). Disparado por uploadCarouselCardVideo (actions.ts),
// que sobe o arquivo bruto de forma síncrona.
//
// A COMPOSIÇÃO (ffmpeg) não acontece mais aqui (migration 040) — mesma
// mudança de attach-video.ts. Este job só extrai o pôster CRU e mede a
// luminância dele; a moldura + texto são montados na aprovação
// (render-approved-post → renderCardVideo), uma vez só, com a spec
// congelada. Antes, cada troca de layout em Ajustes re-encodava o vídeo
// de todo card do carrossel.
//
// O step pesado NUNCA deixa exceção escapar — retorna {ok:false, error}
// em vez de lançar, pro segundo step sempre gravar o estado final.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const attachCardVideo = inngest.createFunction(
  { id: "attach-card-video", retries: 1, concurrency: { limit: 2 } },
  { event: "card/attach-video.requested" },
  async ({ event, step }) => {
    const { cardId } = event.data as { cardId: string };
    const supabase = createAdminClient();

    const result = await step.run("prepare-video", async () => {
      try {
        const { data: card, error: cardErr } = await supabase
          .from("carousel_cards")
          .select("post_id, idx")
          .eq("id", cardId)
          .maybeSingle();
        if (cardErr || !card) throw new Error("Card não encontrado");

        const sourcePath = `${card.post_id}-card-${card.idx}-video-source.mp4`;
        const { data: srcFile, error: dlErr } = await supabase.storage
          .from("post-images")
          .download(sourcePath);
        if (dlErr || !srcFile) throw new Error("Vídeo fonte não encontrado no Storage");
        const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

        const { extractPosterFrame } = await import("@/lib/video");
        const { buildLuminanceGrid } = await import("@/lib/contrast");

        // Pôster CRU: é o fundo do preview ao vivo na Fila e a base da
        // medição de contraste. O pôster COM a moldura só existe depois
        // da aprovação.
        const poster = await extractPosterFrame(videoBuffer, 0.5);
        const grid = await buildLuminanceGrid(poster);

        const posterPath = `${card.post_id}-card-${card.idx}-video-poster-raw.jpg`;
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
        console.error(`[attach-card-video] falha ao preparar o card ${cardId}:`, err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    await step.run("update-card", async () => {
      if (result.ok) {
        await supabase
          .from("carousel_cards")
          .update({
            // video_url continua nulo: o vídeo composto nasce na aprovação
            bg_url: result.posterUrl,
            bg_luminance: result.grid,
            video_poster_url: result.posterUrl,
            video_status: "ready",
            video_error: null,
          })
          .eq("id", cardId);
      } else {
        await supabase
          .from("carousel_cards")
          .update({ video_status: "error", video_error: result.error })
          .eq("id", cardId);
      }
    });

    return result;
  }
);
