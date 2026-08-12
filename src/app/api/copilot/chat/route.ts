// ============================================================
// POST /api/copilot/chat — turno de chat do Copiloto (Sprint F).
//
// Route Handler, não Server Action: é o único jeito de dar streaming
// real no App Router (Server Action serializa o retorno inteiro de uma
// vez). Primeiro precedente de streaming no projeto — ver
// src/lib/copilot/agent.ts pro porquê de ser stream de PROGRESSO
// (passo a passo das ferramentas), não token a token da resposta.
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { getActiveClientId } from "@/lib/client-context";
import { rodarTurno } from "@/lib/copilot/agent";

export const maxDuration = 60; // mesmo teto de src/app/radar/page.tsx

const HISTORICO_MENSAGENS = 20;

function sse(evento: unknown): string {
  return `data: ${JSON.stringify(evento)}\n\n`;
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientId = await getActiveClientId();
  if (!clientId) {
    return new Response(JSON.stringify({ error: "Nenhum cliente ativo" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { mensagem } = (await req.json().catch(() => ({}))) as { mensagem?: string };
  if (!mensagem || !mensagem.trim()) {
    return new Response(JSON.stringify({ error: "Mensagem vazia" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Histórico da MESMA conversa (contínua por cliente — ver migration
  // 052) vira texto simples pro agente (nvidiaChatJson não tem
  // histórico estruturado, ver agent.ts).
  const { data: anteriores } = await supabase
    .from("copilot_messages")
    .select("role, content")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(HISTORICO_MENSAGENS);
  const historico = (anteriores ?? [])
    .reverse()
    .map((m) => `${m.role === "user" ? "Usuário" : "Copiloto"}: ${m.content}`)
    .join("\n");

  await supabase.from("copilot_messages").insert({
    client_id: clientId,
    user_id: user.id,
    role: "user",
    content: mensagem.trim(),
  });

  const ctx = { userId: user.id, clientId };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const evento of rodarTurno(mensagem.trim(), historico, ctx)) {
          controller.enqueue(encoder.encode(sse(evento)));

          if (evento.tipo === "passo" && evento.status !== "inicio") {
            await supabase.from("copilot_messages").insert({
              client_id: clientId,
              user_id: user.id,
              role: "tool",
              content: evento.rotulo,
              tool_name: evento.ferramenta,
            });
          }
          if (evento.tipo === "mensagem") {
            await supabase.from("copilot_messages").insert({
              client_id: clientId,
              user_id: user.id,
              role: "assistant",
              content: evento.texto,
            });
          }
        }
      } catch (err) {
        console.error("[copilot/chat] falha no turno do agente:", err);
        controller.enqueue(
          encoder.encode(
            sse({ tipo: "mensagem", texto: "Deu um erro por aqui. Tenta de novo?" })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
