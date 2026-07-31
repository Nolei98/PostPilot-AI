// ============================================================
// RADAR — referências que performaram de verdade no nicho.
//
// Diferente da Fila: aqui não há post nenhum. É a lista do que já
// funcionou lá fora, com engajamento MEDIDO (pontos e comentários da
// própria plataforma), pra servir de referência de gancho e estrutura.
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import { RadarScanButton } from "@/components/RadarScanButton";

export const dynamic = "force-dynamic";

interface ViralReference {
  id: string;
  platform: string;
  url: string;
  title: string;
  author: string | null;
  topic: string | null;
  points: number;
  comments: number;
  published_at: string | null;
  score: number;
}

const NOME_DA_PLATAFORMA: Record<string, string> = {
  hackernews: "Hacker News",
  reddit: "Reddit",
  youtube: "YouTube",
};

function comoTempoRelativo(iso: string | null): string {
  if (!iso) return "";
  const horas = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${Math.round(horas)}h`;
  return `há ${Math.round(horas / 24)}d`;
}

export default async function RadarPage() {
  const supabase = createClient();
  const shell = await getShellData();

  const { data } = await supabase
    .from("viral_references")
    .select("*")
    .eq("client_id", shell.activeClientId ?? "")
    .order("score", { ascending: false })
    .limit(50);

  const referencias = (data ?? []) as ViralReference[];

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={shell.brandName}
      logoUrl={shell.logoUrl}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-display">Radar</h1>
          <p className="text-caption text-muted">
            O que performou de verdade no seu nicho — engajamento medido, não
            palpite. Use como referência de gancho e estrutura.
          </p>
        </div>
        <RadarScanButton />
      </div>

      {referencias.length === 0 ? (
        <div className="rounded-xl border border-subtle p-8 text-center">
          <p className="text-body">Nenhuma referência coletada ainda.</p>
          <p className="text-caption text-muted mt-1">
            Clique em “Atualizar radar” — a primeira coleta leva alguns segundos.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {referencias.map((r, i) => (
            <li
              key={r.id}
              className="flex items-center gap-4 rounded-xl border border-subtle p-4"
            >
              <span className="text-caption text-muted w-6 shrink-0 text-right">
                {i + 1}
              </span>

              {/* O score é o que ordena a lista, então ele é o elemento
                  mais forte da linha depois do título. */}
              <span
                className="shrink-0 rounded-lg px-2 py-1 text-caption font-semibold"
                style={{
                  background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                }}
                title="Score normalizado 0-100: engajamento em escala log, com peso menor pra comentário e desconto por idade."
              >
                {r.score}
              </span>

              <div className="min-w-0 flex-1">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-body block truncate hover:underline"
                  title={r.title}
                >
                  {r.title}
                </a>
                <p className="text-caption text-muted truncate">
                  {NOME_DA_PLATAFORMA[r.platform] ?? r.platform}
                  {r.author ? ` · ${r.author}` : ""}
                  {r.topic ? ` · ${r.topic}` : ""}
                  {r.published_at ? ` · ${comoTempoRelativo(r.published_at)}` : ""}
                </p>
              </div>

              {/* Números crus ao lado do score: sem eles o 0-100 vira uma
                  nota sem lastro, e a pessoa não consegue julgar sozinha. */}
              <div className="text-caption text-muted shrink-0 text-right">
                <div>{r.points.toLocaleString("pt-BR")} pts</div>
                <div>{r.comments.toLocaleString("pt-BR")} coment.</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
}
