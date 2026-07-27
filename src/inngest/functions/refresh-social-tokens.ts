// ============================================================
// Job: renova os tokens de longa duração do Instagram antes de vencer.
//
// O token do fluxo "Login do Instagram" vale ~60 dias. Até aqui ele era
// gravado uma vez no OAuth (callback/route.ts) e nunca mais tocado — no
// dia 61 a publicação passaria a falhar em silêncio pra sempre, porque
// publish-scheduled-posts só grava publish_error e tenta de novo a cada
// 5min (o post nunca sai, e nada avisa o dono).
//
// Roda 1x por dia. A decisão de renovar é pura e testada em
// src/lib/token-refresh.ts; aqui fica só o efeito colateral (rede +
// banco). Cada conexão é um step próprio: falha numa não derruba as
// outras (mesmo padrão de resync-layout-preset/generate-carousel).
//
// 🆓 MOCK: sem META_APP_ID, refreshLongLivedToken devolve um token
//    determinístico sem tocar a rede — o job roda inteiro a $0.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/crypto-secrets";
import { refreshLongLivedToken } from "@/lib/instagram-graph";
import { decideTokenRefresh } from "@/lib/token-refresh";

interface ConnectionRow {
  id: string;
  client_id: string;
  access_token: string;
  token_expires_at: string | null;
  connected_at: string | null;
  last_refreshed_at: string | null;
}

export const refreshSocialTokens = inngest.createFunction(
  { id: "refresh-social-tokens", retries: 2, concurrency: { limit: 1 } },
  [
    { cron: "0 6 * * *" }, // todo dia às 06:00 UTC
    { event: "social/refresh-tokens.requested" }, // ou disparo manual
  ],
  async ({ step }) => {
    const supabase = createAdminClient();

    const connections = await step.run("fetch-connections", async () => {
      const { data } = await supabase
        .from("social_connections")
        .select("id, client_id, access_token, token_expires_at, connected_at, last_refreshed_at")
        .eq("platform", "instagram")
        .eq("status", "connected");
      return (data ?? []) as ConnectionRow[];
    });

    let refreshed = 0;
    let needReconnect = 0;
    let failed = 0;

    for (const conn of connections) {
      const decision = decideTokenRefresh(
        {
          tokenExpiresAt: conn.token_expires_at,
          tokenIssuedAt: conn.last_refreshed_at ?? conn.connected_at,
        },
        new Date()
      );

      if (decision.action === "skip") continue;

      // Token vencido: a Meta não renova mais. Marca 'error' pra UI de
      // Ajustes pedir reconexão — e pra publish-scheduled-posts parar de
      // tentar às cegas e gravar a razão certa no publish_error.
      if (decision.action === "reconnect") {
        await step.run(`mark-expired-${conn.id}`, async () => {
          await supabase
            .from("social_connections")
            .update({
              status: "error",
              last_error: "Token do Instagram expirou — reconecte a conta em Ajustes",
            })
            .eq("id", conn.id);
        });
        needReconnect++;
        continue;
      }

      try {
        const next = await step.run(`refresh-${conn.id}`, async () => {
          const current = decryptSecret(conn.access_token);
          const result = await refreshLongLivedToken(current);
          return {
            token: encryptSecret(result.accessToken),
            expiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
          };
        });

        await step.run(`store-${conn.id}`, async () => {
          await supabase
            .from("social_connections")
            .update({
              access_token: next.token,
              token_expires_at: next.expiresAt,
              last_refreshed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", conn.id);
        });
        refreshed++;
      } catch (err) {
        // Falha de renovação NÃO desconecta: o token atual continua
        // válido até a data de expiração, então publicar segue
        // funcionando. Só registra o motivo — o job tenta de novo
        // amanhã, e ainda sobra a janela de 14 dias.
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[refresh-social-tokens] falha ao renovar a conexão ${conn.id}:`, err);
        await step.run(`mark-error-${conn.id}`, async () => {
          await supabase.from("social_connections").update({ last_error: message }).eq("id", conn.id);
        });
        failed++;
      }
    }

    return { checked: connections.length, refreshed, needReconnect, failed };
  }
);
