// ============================================================
// PRONTOS PARA PUBLICAR — posts aprovados (Plano B: manual).
// Fluxo: copiar texto → baixar arte → postar no IG → "Postei".
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { ReadyTabs } from "@/components/ReadyTabs";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import type { PostMetrics, PostWithNews } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const supabase = createClient();
  const shell = await getShellData();

  // "Prontos" cobre os estados pós-fila: aprovados (a postar manualmente),
  // agendados (Sprint C — publicação automática pendente) e publicados
  // (histórico) — a aba filtra client-side.
  const { data } = await supabase
    .from("posts")
    // carousel_cards entram aqui porque a arte do carrossel mora nos
    // CARDS, não no post: sem eles a tela mostrava (e baixava) só a capa.
    .select(
      "*, news_items(title, url, viral_score), carousel_cards(id, idx, role, headline, body, image_url, bg_url, bg_luminance, layout, video_url, video_poster_url, video_status, video_error)"
    )
    .in("status", ["approved", "scheduled", "published"])
    .eq("client_id", shell.activeClientId ?? "")
    .order("approved_at", { ascending: false });

  const posts = (data ?? []) as PostWithNews[];

  // Métricas reais (Sprint C) dos posts publicados — badge discreto na
  // aba Postados. Uma query só pra todos os posts desta página.
  const publishedIds = posts.filter((p) => p.status === "published").map((p) => p.id);
  const { data: metrics } =
    publishedIds.length > 0
      ? await supabase
          .from("post_metrics")
          .select("post_id, reach")
          .in("post_id", publishedIds)
          .eq("metric_window", "24h")
      : { data: [] as Pick<PostMetrics, "post_id" | "reach">[] };
  const reachByPost: Record<string, number | null> = Object.fromEntries(
    (metrics ?? []).map((m) => [m.post_id, m.reach])
  );

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={shell.brandName}
      logoUrl={shell.logoUrl}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
      <div className="mb-5">
        <h1 className="text-display">Prontos</h1>
        <p className="text-caption text-muted">
          Aprovados e à espera do feed. Copie, baixe e marque como postado.
        </p>
      </div>

      <ReadyTabs posts={posts} reachByPost={reachByPost} />
    </AppShell>
  );
}
