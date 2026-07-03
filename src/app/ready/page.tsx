// ============================================================
// PRONTOS PARA PUBLICAR — posts aprovados (Plano B: manual).
// Fluxo: copiar texto → baixar arte → postar no IG → "Postei".
// ============================================================
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReadyPostCard } from "@/components/ReadyPostCard";
import { AppShell } from "@/components/ui/AppShell";
import type { PostWithNews } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("posts")
    .select("*, news_items(title, url, viral_score)")
    .eq("status", "approved")
    .order("approved_at", { ascending: false });

  const posts = (data ?? []) as PostWithNews[];

  return (
    <AppShell readyCount={posts.length}>
      <div className="mb-5">
        <h1 className="text-display">Prontos para publicar</h1>
        <p className="text-caption text-muted">
          Copie o texto, baixe a arte e publique no Instagram
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="animate-fade-up rounded-card border border-dashed border-line px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.5 2.5 2.5 5-5.5" />
            </svg>
          </div>
          <h2 className="mb-1 text-title">Tudo publicado</h2>
          <p className="mx-auto mb-6 max-w-xs text-body text-muted">
            Nenhum post aprovado aguardando publicação. Aprove novos posts na
            fila.
          </p>
          <Link
            href="/"
            className="text-caption text-primary underline-offset-2 hover:underline"
          >
            Ir para a fila →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => (
            <div key={post.id} style={{ animationDelay: `${i * 60}ms` }} className="animate-fade-up">
              <ReadyPostCard post={post} />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
