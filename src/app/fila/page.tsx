// ============================================================
// FILA DE APROVAÇÃO — tela principal.
// Mobile-first: 1 coluna de cards. Desktop: sidebar + coluna
// central mais larga. Estado vazio auto-explicativo com CTA.
// ============================================================
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FirstScanKickoff } from "@/components/FirstScanKickoff";
import { PostCard } from "@/components/PostCard";
import { QueueSelection } from "@/components/QueueSelection";
import { ScanButton } from "@/components/ScanButton";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import { getMonthlyQuota } from "@/lib/subscription";
import { PLANS } from "@/lib/plans";
import { resolveRenderSpec, withPost } from "@/lib/render-spec";
import { buildPostPreview, type PreviewPage } from "@/lib/post-preview";
import type { IgProfile, PostWithNews, VisualIdentity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const shell = await getShellData();
  const clientId = shell.activeClientId;

  const { data: queue } = await supabase
    .from("posts")
    .select(
      "*, news_items(title, url, viral_score, image_url, image_license_hint), carousel_cards(id, idx, role, headline, body, image_url, bg_url, bg_luminance, layout, video_url, video_poster_url, video_status, video_error)"
    )
    .eq("status", "pending_approval")
    .eq("client_id", clientId ?? "")
    .order("created_at", { ascending: false });

  // Usuário NOVO neste cliente = nunca teve nenhum post (qualquer status).
  // Distingue "acabou de chegar" (onboarding) de "fila vazia normal".
  const { count: totalPosts } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId ?? "");
  const isNewUser = (totalPosts ?? 0) === 0;

  // Cota do plano (auditoria §2.4). Sem este aviso, quem estoura o teto
  // do mês vê a fila simplesmente parar de encher: o generate-post grava
  // o motivo no log do job e mais nada. É o mesmo modo de falha que custou
  // dias no bloqueio de provider de julho, e no plano grátis (5 posts) ele
  // acontece por DESENHO todo mês.
  const {
    data: { user: quotaUser },
  } = await supabase.auth.getUser();
  const quota = quotaUser ? await getMonthlyQuota(quotaUser.id) : null;
  const quotaEstourada = !!quota && !quota.unlimited && quota.remaining <= 0;

  // Perfil do IG exibido no header dos previews — brand_kit do cliente ativo
  const { data: config } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId ?? "")
    .maybeSingle();

  const profile: IgProfile = {
    handle: config?.ig_handle ?? "seuperfil",
    displayName: config?.ig_display_name ?? "Seu Perfil",
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
    keyword: config?.tpl_keyword ?? "TECNOLOGIA",
    topText: config?.tpl_top_text ?? "A NOVIDADE DE",
    bottomText: config?.tpl_bottom_text ?? "QUE MUDA TUDO",
    ctaEnabled: config?.tpl_cta_enabled ?? false,
  };
  const posts = (queue ?? []) as PostWithNews[];

  // Sprint C — só oferece "Agendar" se o cliente tiver Instagram conectado
  // (senão o post nunca sairia de 'scheduled', já que ninguém publica).
  const { data: igConn } = await supabase
    .from("social_connections")
    .select("id")
    .eq("client_id", clientId ?? "")
    .eq("status", "connected")
    .maybeSingle();
  const hasInstagramConnected = !!igConn;

  // PREVIEW AO VIVO (migration 040): post na fila não tem arte — ela só é
  // montada na aprovação. O que se vê aqui é desenhado agora, com o Brand
  // Kit ATUAL, então trocar template/cor/layout em Ajustes aparece no
  // próximo carregar desta página, sem nenhum job de re-render.
  //
  // A spec é resolvida UMA vez pro cliente (Brand Kit + modelos + plano) e
  // derivada por post com withPost — não faz sentido reler tudo por card.
  const previews = new Map<string, PreviewPage[]>();
  if (posts.length > 0 && clientId && shell.userId) {
    const baseSpec = await resolveRenderSpec({
      clientId,
      userId: shell.userId,
      post: { format: "single" },
      brandKit: config,
    });
    await Promise.all(
      posts.map(async (post) => {
        try {
          const pages = await buildPostPreview(
            post,
            withPost(baseSpec, post),
            (post.carousel_cards ?? []).slice().sort((a, b) => a.idx - b.idx)
          );
          previews.set(post.id, pages);
        } catch (err) {
          // Um preview quebrado não pode derrubar a fila inteira: o card
          // cai no fallback (arte antiga ou esqueleto).
          console.error(`[fila] preview do post ${post.id} falhou:`, err);
        }
      })
    );
  }

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={shell.brandName}
      logoUrl={shell.logoUrl}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
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

      {/* Piloto pausado (migration 047): sem este aviso, fila parada
          parece defeito — foi exatamente o que aconteceu no bloqueio de
          provider de julho, com dias perdidos até alguém investigar. */}
      {config?.auto_generate === false && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-line px-4 py-3">
          <p className="text-caption text-muted">
            ⏸ Criação automática pausada. As fontes continuam sendo varridas;
            nenhum post novo é criado até você religar.
          </p>
          <Link
            href="/settings"
            className="text-caption text-subtle underline-offset-2 transition-colors hover:text-muted hover:underline"
          >
            Religar em Ajustes →
          </Link>
        </div>
      )}

      {/* Cota do mês estourada: mesma faixa do piloto pausado, pelo mesmo
          motivo — fila que para sem explicação parece defeito. A diferença
          é que aqui a saída é mudar de plano, não religar um botão. */}
      {quotaEstourada && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-warning/50 bg-warning/5 px-4 py-3">
          <p className="text-caption text-muted">
            🚦 Você usou os {quota!.limit} posts do plano{" "}
            {PLANS[quota!.plan].label} este mês. As fontes continuam sendo
            varridas e as notícias ficam guardadas; nenhum post novo é criado
            até virar o mês.
          </p>
          <Link
            href="/pricing"
            className="text-caption text-subtle underline-offset-2 transition-colors hover:text-muted hover:underline"
          >
            Ver planos →
          </Link>
        </div>
      )}

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
        <QueueSelection postIds={posts.map((p) => p.id)}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {posts.map((post, i) => (
            <div key={post.id} style={{ animationDelay: `${i * 60}ms` }} className="animate-fade-up">
              <PostCard
                post={post}
                profile={profile}
                identityDefaults={identityDefaults}
                hasInstagramConnected={hasInstagramConnected}
                templateSelection={config?.template_selection ?? {}}
                previewPages={previews.get(post.id)}
              />
            </div>
          ))}
        </div>
        </QueueSelection>
      )}
    </AppShell>
  );
}
