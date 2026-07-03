// ============================================================
// FILA DE APROVAÇÃO — tela principal.
// Mobile-first: 1 coluna de cards. Desktop: sidebar + coluna
// central mais larga. Estado vazio auto-explicativo com CTA.
// ============================================================
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FirstScanKickoff } from "@/components/FirstScanKickoff";
import { PostCard } from "@/components/PostCard";
import { ScanButton } from "@/components/ScanButton";
import { AppShell } from "@/components/ui/AppShell";
import type {
  IgProfile,
  PostWithNews,
  TemplateApplyMode,
  VisualIdentity,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  const { data: queue } = await supabase
    .from("posts")
    .select(
      "*, news_items(title, url, viral_score, image_url, image_license_hint)"
    )
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false });

  const { count: readyCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");

  // Usuário NOVO = nunca teve nenhum post (qualquer status).
  // Distingue "acabou de chegar" (onboarding) de "fila vazia normal".
  const { count: totalPosts } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true });
  const isNewUser = (totalPosts ?? 0) === 0;

  // Perfil do IG exibido no header dos previews (config em Ajustes)
  const { data: config } = await supabase
    .from("notification_configs")
    .select("*")
    .maybeSingle();

  const profile: IgProfile = {
    handle: config?.ig_handle ?? "seuperfil.ia",
    displayName: config?.ig_display_name ?? "Seu Perfil de IA",
    avatarUrl: config?.ig_avatar_url ?? null,
    verified: config?.ig_verified ?? false,
    showProfileChip: config?.show_profile_chip ?? true,
  };

  // Defaults da identidade visual (prefill do modal na aprovação)
  const identityDefaults: VisualIdentity = {
    colorBackground: config?.color_background ?? "#0B0B12",
    colorAccent: config?.color_accent ?? "#7C5CFF",
    colorText: config?.color_text ?? "#FFFFFF",
    colorKeywordBox: config?.color_keyword_box ?? "#7C5CFF",
    keyword: config?.tpl_keyword ?? "IA",
    topText: config?.tpl_top_text ?? "A NOVIDADE DE",
    bottomText: config?.tpl_bottom_text ?? "QUE MUDA TUDO",
    ctaEnabled: config?.tpl_cta_enabled ?? false,
  };
  const applyMode: TemplateApplyMode =
    config?.template_apply_mode === "on_approval" ? "on_approval" : "all";

  const posts = (queue ?? []) as PostWithNews[];

  return (
    <AppShell readyCount={readyCount ?? 0}>
      {/* Cabeçalho da tela: título + ação de varredura */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-display">Fila de aprovação</h1>
          <p className="text-caption text-muted">
            {posts.length === 0
              ? "Nada aguardando revisão"
              : `${posts.length} ${posts.length === 1 ? "post aguarda" : "posts aguardam"} sua decisão`}
          </p>
        </div>
        <ScanButton />
      </div>

      {posts.length === 0 && isNewUser ? (
        /* ===== Usuário novo: dispara o 1º scan e acompanha ao vivo ===== */
        <FirstScanKickoff />
      ) : posts.length === 0 ? (
        /* ===== Estado vazio: explica o que acontece e o que fazer ===== */
        <div className="animate-fade-up rounded-card border border-dashed border-line px-6 py-14 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <h2 className="mb-1 text-title">Nenhum candidato na fila</h2>
          <p className="mx-auto mb-6 max-w-xs text-body text-muted">
            O monitor varre suas fontes a cada 3 horas e traz aqui as notícias
            com potencial viral, já transformadas em post.
          </p>
          <div className="flex flex-col items-center gap-3">
            <ScanButton />
            <Link
              href="/settings"
              className="text-caption text-subtle underline-offset-2 transition-colors hover:text-muted hover:underline"
            >
              Conferir fontes monitoradas →
            </Link>
          </div>
        </div>
      ) : (
        /* ===== Fila: cards entram escalonados ===== */
        <div className="space-y-6">
          {posts.map((post, i) => (
            <div key={post.id} style={{ animationDelay: `${i * 60}ms` }} className="animate-fade-up">
              <PostCard
                post={post}
                profile={profile}
                identityDefaults={identityDefaults}
                applyMode={applyMode}
              />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
