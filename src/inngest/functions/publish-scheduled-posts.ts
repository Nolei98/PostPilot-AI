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
import {
  createMediaContainer,
  createCarouselContainer,
  publishMedia,
  getContainerStatus,
  type ContainerStatusCode,
} from "@/lib/instagram-graph";

interface DuePost {
  id: string;
  client_id: string;
  format: "single" | "carousel" | "video" | "video_feed";
  caption: string;
  hashtags: string;
  image_url: string | null;
  video_url: string | null;
}

interface StepLike {
  // O tooling real do Inngest passa o retorno por Jsonify<T>, o que não bate
  // estruturalmente com um union literal estrito — tipamos frouxo aqui de propósito.
  run(id: string, fn: () => Promise<ContainerStatusCode> | ContainerStatusCode): Promise<ContainerStatusCode | unknown>;
  sleep(id: string, duration: string): Promise<unknown>;
}

/**
 * Espera o container de mídia terminar de processar antes de publicar. Sem isso,
 * `media_publish` falha com "Media ID is not available" — a Graph API devolve o
 * id do container na hora, mas o download/processamento é assíncrono.
 */
async function waitForContainerReady(
  step: StepLike,
  key: string,
  containerId: string,
  accessToken: string,
  maxAttempts: number,
  intervalSeconds: number
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await step.run(`container-status-${key}-${attempt}`, () =>
      getContainerStatus(containerId, accessToken)
    );
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`Container de mídia falhou no processamento da Meta (status ${status})`);
    }
    await step.sleep(`container-wait-${key}-${attempt}`, `${intervalSeconds}s`);
  }
  throw new Error("Container de mídia não terminou de processar a tempo");
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
      const conn = await step.run(`load-connection-${post.id}`, async () => {
        const { data } = await supabase
          .from("social_connections")
          .select("access_token, ig_business_account_id")
          .eq("client_id", post.client_id)
          .eq("status", "connected")
          .maybeSingle();
        return data;
      });

      if (!conn?.ig_business_account_id) {
        await step.run(`mark-error-${post.id}`, async () => {
          await supabase
            .from("posts")
            .update({ publish_error: "Instagram desconectado — reconecte em Ajustes para publicar" })
            .eq("id", post.id);
        });
        continue;
      }

      const accessToken = decryptSecret(conn.access_token);
      const igUserId = conn.ig_business_account_id;
      const caption = `${post.caption}\n\n${post.hashtags}`;

      try {
        let mediaId: string;

        if (post.format === "video" || post.format === "video_feed") {
          // Graph API só publica vídeo via container REELS — mesmo o
          // formato "feed" (4:5, sem letterbox) publica como Reels; o
          // Instagram aceita variações de aspect ratio no container.
          if (!post.video_url) throw new Error("Post de vídeo sem video_url");
          const container = await step.run(`create-container-${post.id}`, () =>
            createMediaContainer(igUserId, accessToken, { videoUrl: post.video_url!, caption, mediaType: "REELS" })
          );
          // vídeo/Reels demora mais a processar: até 4min (24 x 10s).
          await waitForContainerReady(step, `${post.id}-main`, container, accessToken, 24, 10);
          mediaId = await step.run(`publish-${post.id}`, () => publishMedia(igUserId, accessToken, container));
        } else if (post.format === "carousel") {
          const cards = await step.run(`fetch-cards-${post.id}`, async () => {
            const { data } = await supabase
              .from("carousel_cards")
              .select("image_url")
              .eq("post_id", post.id)
              .order("idx");
            return data ?? [];
          });
          const imageUrls = cards.map((c) => c.image_url).filter((u): u is string => !!u);
          if (imageUrls.length === 0) throw new Error("Carrossel sem cards renderizados");

          const childrenIds: string[] = [];
          for (let idx = 0; idx < imageUrls.length; idx++) {
            const childId = await step.run(`create-child-${post.id}-${idx}`, () =>
              createMediaContainer(igUserId, accessToken, { imageUrl: imageUrls[idx], isCarouselItem: true })
            );
            await waitForContainerReady(step, `${post.id}-child-${idx}`, childId, accessToken, 12, 5);
            childrenIds.push(childId);
          }
          const container = await step.run(`create-carousel-container-${post.id}`, () =>
            createCarouselContainer(igUserId, accessToken, childrenIds, caption)
          );
          await waitForContainerReady(step, `${post.id}-main`, container, accessToken, 12, 5);
          mediaId = await step.run(`publish-${post.id}`, () => publishMedia(igUserId, accessToken, container));
        } else {
          if (!post.image_url) throw new Error("Post sem image_url");
          const container = await step.run(`create-container-${post.id}`, () =>
            createMediaContainer(igUserId, accessToken, { imageUrl: post.image_url!, caption })
          );
          await waitForContainerReady(step, `${post.id}-main`, container, accessToken, 12, 5);
          mediaId = await step.run(`publish-${post.id}`, () => publishMedia(igUserId, accessToken, container));
        }

        await step.run(`mark-published-${post.id}`, async () => {
          await supabase
            .from("posts")
            .update({ status: "published", ig_media_id: mediaId, publish_error: null })
            .eq("id", post.id);
        });
        publishedCount++;

        // step.sendEvent (durável) em vez de inngest.send solto: sem
        // await e fora de step, a promise podia nunca resolver — em
        // serverless o processo é congelado assim que o handler retorna.
        // Era exatamente isso que fazia o collect-insights não rodar pra
        // parte dos posts publicados (métrica faltando sem erro nenhum).
        await step.sendEvent(`enqueue-metrics-${post.id}`, {
          name: "post/published",
          data: { postId: post.id },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[publish-scheduled-posts] falha ao publicar o post ${post.id}:`, err);
        await step.run(`mark-error-${post.id}-caught`, async () => {
          await supabase.from("posts").update({ publish_error: message }).eq("id", post.id);
        });
      }
    }

    return { dueCount: duePosts.length, publishedCount };
  }
);
