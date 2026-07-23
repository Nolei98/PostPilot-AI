// ============================================================
// Job: compõe o card INTERIOR "com vídeo" do carrossel (migration 037)
// — título + moldura de vídeo (16:9) + corpo, fundo sólido preto (ver
// buildCardVideoOverlay, image.ts). Disparado por uploadCarouselCardVideo
// (actions.ts) — o upload em si é síncrono (só sobe o arquivo bruto),
// o processamento pesado (ffmpeg) roda aqui, em background.
//
// Mesmo padrão de attach-video.ts: um único step faz o trabalho pesado
// e NUNCA deixa exceção escapar — captura o erro e retorna {ok:false,
// error} em vez de lançar, pro segundo step sempre conseguir gravar o
// estado final no card (sucesso OU erro), mesmo que o encode falhe.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePostFontFamily } from "@/lib/font-data";
import type { CardBrand } from "@/lib/carousel-render";

export const attachCardVideo = inngest.createFunction(
  { id: "attach-card-video", retries: 1, concurrency: { limit: 2 } },
  { event: "card/attach-video.requested" },
  async ({ event, step }) => {
    const { cardId } = event.data as { cardId: string };
    const supabase = createAdminClient();

    const result = await step.run("process-video", async () => {
      try {
        const { data: card, error: cardErr } = await supabase
          .from("carousel_cards")
          .select("post_id, idx, headline, body")
          .eq("id", cardId)
          .maybeSingle();
        if (cardErr || !card) throw new Error("Card não encontrado");

        const { data: post, error: postErr } = await supabase
          .from("posts")
          .select("client_id")
          .eq("id", card.post_id)
          .maybeSingle();
        if (postErr || !post) throw new Error("Post do card não encontrado");

        const { data: bk } = await supabase
          .from("brand_kits")
          .select("*")
          .eq("client_id", post.client_id)
          .maybeSingle();
        const cardBrand: CardBrand = {
          colorBackground: bk?.color_background ?? "#0A0A0A",
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

        const sourcePath = `${card.post_id}-card-${card.idx}-video-source.mp4`;
        const { data: srcFile, error: dlErr } = await supabase.storage
          .from("post-images")
          .download(sourcePath);
        if (dlErr || !srcFile) throw new Error("Vídeo fonte não encontrado no Storage");
        const videoBuffer = Buffer.from(await srcFile.arrayBuffer());

        const { extractPosterFrame, composeFeedVideo } = await import("@/lib/video");
        const { buildCardVideoOverlay } = await import("@/lib/image");

        const poster = await extractPosterFrame(videoBuffer, 0.5);
        const { overlayPng, frame } = buildCardVideoOverlay(
          { headline: card.headline, body: card.body },
          cardBrand
        );
        const finalVideo = await composeFeedVideo(videoBuffer, overlayPng, frame);

        const videoPath = `${card.post_id}-card-${card.idx}-video.mp4`;
        const posterPath = `${card.post_id}-card-${card.idx}-video-poster.jpg`;
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
        console.error(`[attach-card-video] falha ao processar o card ${cardId}:`, err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    await step.run("update-card", async () => {
      if (result.ok) {
        await supabase
          .from("carousel_cards")
          .update({
            video_url: result.videoUrl,
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
