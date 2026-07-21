// ============================================================
// Job: publica automaticamente os posts agendados (Sprint C).
//
// Roda a cada 5min (cron) ou sob demanda (evento post/publish.requested).
// Pega todo post 'scheduled' com scheduled_for <= agora, publica via
// Graph API (single/carrossel/vídeo) usando o token do cliente em
// social_connections, e marca 'published'. Falha não muda o status
// (continua 'scheduled', tenta de novo no próximo tick) — só grava
// publish_error, mesmo padrão já usado em video_error.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto-secrets";
import { createMediaContainer, createCarouselContainer, publishMedia } from "@/lib/instagram-graph";

interface DuePost {
  id: string;
  client_id: string;
  format: "single" | "carousel" | "video";
  caption: string;
  hashtags: string;
  image_url: string | null;
  video_url: string | null;
}

export const publishScheduledPosts = inngest.createFunction(
  { id: "publish-scheduled-posts", retries: 2, concurrency: { limit: 1 } },
  [
    { cron: "*/5 * * * *" }, // a cada 5 minutos
    { event: "post/publish.requested" }, // ou disparo manual
  ],
  async ({ step }) => {
    const supabase = createAdminClient();

    const duePosts = await step.run("fetch-due-posts", async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, client_id, format, caption, hashtags, image_url, video_url")
        .eq("status", "scheduled")
        .lte("scheduled_for", new Date().toISOString());
      return (data ?? []) as DuePost[];
    });

    let publishedCount = 0;

    for (const post of duePosts) {
      const result = await step.run(`publish-${post.id}`, async () => {
        const { data: conn } = await supabase
          .from("social_connections")
          .select("access_token, ig_business_account_id")
          .eq("client_id", post.client_id)
          .eq("status", "connected")
          .maybeSingle();

        if (!conn?.ig_business_account_id) {
          const message = "Instagram desconectado — reconecte em Ajustes para publicar";
          await supabase.from("posts").update({ publish_error: message }).eq("id", post.id);
          return { published: false };
        }

        try {
          const accessToken = decryptSecret(conn.access_token);
          const igUserId = conn.ig_business_account_id;
          const caption = `${post.caption}\n\n${post.hashtags}`;

          let mediaId: string;

          if (post.format === "video") {
            if (!post.video_url) throw new Error("Post de vídeo sem video_url");
            const container = await createMediaContainer(igUserId, accessToken, {
              videoUrl: post.video_url,
              caption,
              mediaType: "REELS",
            });
            mediaId = await publishMedia(igUserId, accessToken, container);
          } else if (post.format === "carousel") {
            const { data: cards } = await supabase
              .from("carousel_cards")
              .select("image_url")
              .eq("post_id", post.id)
              .order("idx");
            const imageUrls = (cards ?? []).map((c) => c.image_url).filter((u): u is string => !!u);
            if (imageUrls.length === 0) throw new Error("Carrossel sem cards renderizados");

            const childrenIds = await Promise.all(
              imageUrls.map((url) =>
                createMediaContainer(igUserId, accessToken, { imageUrl: url, isCarouselItem: true })
              )
            );
            const container = await createCarouselContainer(igUserId, accessToken, childrenIds, caption);
            mediaId = await publishMedia(igUserId, accessToken, container);
          } else {
            if (!post.image_url) throw new Error("Post sem image_url");
            const container = await createMediaContainer(igUserId, accessToken, {
              imageUrl: post.image_url,
              caption,
            });
            mediaId = await publishMedia(igUserId, accessToken, container);
          }

          await supabase
            .from("posts")
            .update({ status: "published", ig_media_id: mediaId, publish_error: null })
            .eq("id", post.id);

          inngest
            .send({ name: "post/published", data: { postId: post.id } })
            .catch((err) => console.warn("[publish-scheduled-posts] não foi possível enfileirar métricas:", err));

          return { published: true };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[publish-scheduled-posts] falha ao publicar o post ${post.id}:`, err);
          await supabase.from("posts").update({ publish_error: message }).eq("id", post.id);
          return { published: false };
        }
      });

      if (result.published) publishedCount++;
    }

    return { dueCount: duePosts.length, publishedCount };
  }
);
