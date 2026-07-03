// ============================================================
// Job: notificação no Telegram quando um post fica pronto
// para aprovação (evento post/ready.notify).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramPhoto, sendTelegramMessage } from "@/lib/telegram";
import type { NotificationConfig, Post } from "@/lib/types";

export const notifyPostReady = inngest.createFunction(
  { id: "notify-post-ready", retries: 3 },
  { event: "post/ready.notify" },
  async ({ event, step }) => {
    const { postId, userId } = event.data;
    const supabase = createAdminClient();

    // 1. Config de notificação do usuário
    const config = await step.run("fetch-config", async () => {
      const { data } = await supabase
        .from("notification_configs")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return data as NotificationConfig | null;
    });

    if (!config?.telegram_chat_id || !config.notify_on_candidate) {
      return { skipped: true, reason: "Telegram não configurado" };
    }

    // 2. Dados do post
    const post = await step.run("fetch-post", async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("id", postId)
        .single();
      if (error) throw new Error(`Post não encontrado: ${error.message}`);
      return data as Post;
    });

    // 3. Envia a notificação com preview + link para a fila
    await step.run("send-telegram", async () => {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const caption = `🔥 <b>Novo post na fila!</b>\n\n${post.hook}\n\n👉 Aprovar: ${appUrl}`;

      if (post.image_url) {
        await sendTelegramPhoto(config.telegram_chat_id!, post.image_url, caption);
      } else {
        await sendTelegramMessage(config.telegram_chat_id!, caption);
      }
    });

    return { notified: true };
  }
);
