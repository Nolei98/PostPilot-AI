// ============================================================
// Job: coleta métricas reais (alcance/salvamentos/etc) de um post
// publicado via Graph API, 24h e 72h depois (Sprint C).
//
// Disparado por post/published (ver publish-scheduled-posts.ts).
// Usa o sleep durável do Inngest — uma função só cobre os dois
// pontos de coleta, sem precisar de um segundo cron nem de tabela
// de "jobs pendentes".
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto-secrets";
import { getMediaInsights } from "@/lib/instagram-graph";

async function collectOnce(postId: string, metricWindow: "24h" | "72h") {
  const supabase = createAdminClient();
  const { data: post } = await supabase
    .from("posts")
    .select("client_id, ig_media_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post?.ig_media_id) return { skipped: true };

  const { data: conn } = await supabase
    .from("social_connections")
    .select("access_token")
    .eq("client_id", post.client_id)
    .eq("status", "connected")
    .maybeSingle();
  if (!conn) return { skipped: true };

  try {
    const accessToken = decryptSecret(conn.access_token);
    const insights = await getMediaInsights(post.ig_media_id, accessToken);
    await supabase.from("post_metrics").insert({
      post_id: postId,
      metric_window: metricWindow,
      reach: insights.reach,
      saved: insights.saved,
      shares: insights.shares,
      likes: insights.likes,
      comments: insights.comments,
    });
    return { collected: true };
  } catch (err) {
    console.error(`[collect-insights] falha ao coletar ${metricWindow} do post ${postId}:`, err);
    return { collected: false };
  }
}

export const collectInsights = inngest.createFunction(
  { id: "collect-insights", retries: 2 },
  { event: "post/published" },
  async ({ event, step }) => {
    const { postId } = event.data;

    await step.sleep("wait-24h", "24h");
    await step.run("collect-24h", () => collectOnce(postId, "24h"));

    await step.sleep("wait-72h", "48h");
    await step.run("collect-72h", () => collectOnce(postId, "72h"));

    return { postId };
  }
);
