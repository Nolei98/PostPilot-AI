// ============================================================
// PRONTOS PARA PUBLICAR — posts aprovados (Plano B: manual).
// Fluxo: copiar texto → baixar arte → postar no IG → "Postei".
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { ReadyTabs } from "@/components/ReadyTabs";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import type { PostWithNews } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const supabase = createClient();
  const shell = await getShellData();

  // "Prontos" cobre os dois estados pós-fila: aprovados (aguardando
  // publicação) e publicados (histórico) — a aba filtra client-side.
  const { data } = await supabase
    .from("posts")
    .select("*, news_items(title, url, viral_score)")
    .in("status", ["approved", "published"])
    .eq("client_id", shell.activeClientId ?? "")
    .order("approved_at", { ascending: false });

  const posts = (data ?? []) as PostWithNews[];

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

      <ReadyTabs posts={posts} />
    </AppShell>
  );
}
