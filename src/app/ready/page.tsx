// ============================================================
// PRONTOS PARA PUBLICAR — posts aprovados (Plano B: manual).
// Fluxo: copiar texto → baixar arte → postar no IG → "Postei".
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { ReadyTabs } from "@/components/ReadyTabs";
import { AppShell } from "@/components/ui/AppShell";
import type { PostWithNews } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const supabase = createClient();

  // "Prontos" cobre os dois estados pós-fila: aprovados (aguardando
  // publicação) e publicados (histórico) — a aba filtra client-side.
  const { data } = await supabase
    .from("posts")
    .select("*, news_items(title, url, viral_score)")
    .in("status", ["approved", "published"])
    .order("approved_at", { ascending: false });

  const posts = (data ?? []) as PostWithNews[];
  const readyCount = posts.filter((p) => p.status === "approved").length;

  const { data: config } = await supabase
    .from("notification_configs")
    .select("brand_name, logo_url")
    .maybeSingle();

  return (
    <AppShell
      readyCount={readyCount}
      brandName={config?.brand_name}
      logoUrl={config?.logo_url}
    >
      <div className="mb-5">
        <h1 className="text-display">Prontos</h1>
        <p className="text-caption text-muted">
          Aprovados e à espera do feed. Copie, baixe e marque como postado.
        </p>
      </div>

      <ReadyTabs posts={posts} />
    </AppShell>
  );
}
