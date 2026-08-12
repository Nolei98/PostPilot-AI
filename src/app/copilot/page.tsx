// ============================================================
// COPILOTO — chat com o agente que aciona Radar/brief/geração por
// conversa. Conversa CONTÍNUA por cliente (migration 052), sem threads.
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import { CopilotChat } from "@/components/CopilotChat";

export const dynamic = "force-dynamic";

export interface CopilotMensagem {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_name: string | null;
  created_at: string;
}

const HISTORICO_INICIAL = 50;

export default async function CopilotPage() {
  const supabase = createClient();
  const shell = await getShellData();

  const { data } = await supabase
    .from("copilot_messages")
    .select("id, role, content, tool_name, created_at")
    .eq("client_id", shell.activeClientId ?? "")
    .order("created_at", { ascending: false })
    .limit(HISTORICO_INICIAL);

  const mensagens = ((data ?? []) as CopilotMensagem[]).reverse();

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={shell.brandName}
      logoUrl={shell.logoUrl}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
      <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-3xl flex-col px-4 py-6 lg:h-screen">
        <div className="mb-4">
          <h1 className="text-display">Copiloto</h1>
          <p className="text-caption text-muted">
            Conversa com o agente — ele busca referências, monta o brief e gera
            posts/carrosséis. Tudo cai na Fila de aprovação; ele nunca publica sozinho.
          </p>
        </div>
        <CopilotChat mensagensIniciais={mensagens} />
      </div>
    </AppShell>
  );
}
