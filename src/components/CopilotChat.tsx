"use client";

// ============================================================
// Chat do Copiloto (Sprint F). Consome /api/copilot/chat via
// fetch + ReadableStream (não dá pra usar EventSource — é GET-only, e
// aqui a mensagem do usuário vai no corpo do POST). Formato SSE simples:
// linhas "data: {...}\n\n", um evento por linha (ver agent.ts/route.ts).
// ============================================================
import { useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { CopilotMensagem } from "@/app/copilot/page";

type CopilotEvento =
  | { tipo: "passo"; ferramenta: string; status: "inicio" | "fim" | "erro"; rotulo: string }
  | { tipo: "mensagem"; texto: string };

interface LinhaChat {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
}

function converterHistorico(mensagens: CopilotMensagem[]): LinhaChat[] {
  return mensagens.map((m) => ({ id: m.id, role: m.role, content: m.content }));
}

export function CopilotChat({ mensagensIniciais }: { mensagensIniciais: CopilotMensagem[] }) {
  const [linhas, setLinhas] = useState<LinhaChat[]>(() => converterHistorico(mensagensIniciais));
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [passoAtual, setPassoAtual] = useState<string | null>(null);
  const contador = useRef(0);

  function proximoId(): string {
    contador.current += 1;
    return `local-${Date.now()}-${contador.current}`;
  }

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;

    setLinhas((prev) => [...prev, { id: proximoId(), role: "user", content: mensagem }]);
    setTexto("");
    setEnviando(true);
    setPassoAtual(null);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem }),
      });
      if (!res.ok || !res.body) {
        const erro = await res.json().catch(() => ({}));
        setLinhas((prev) => [
          ...prev,
          {
            id: proximoId(),
            role: "assistant",
            content: erro.error ?? "Deu um erro por aqui. Tenta de novo?",
          },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocos = buffer.split("\n\n");
        buffer = blocos.pop() ?? "";
        for (const bloco of blocos) {
          const linha = bloco.trim();
          if (!linha.startsWith("data:")) continue;
          const evento = JSON.parse(linha.slice(5).trim()) as CopilotEvento;

          if (evento.tipo === "passo") {
            setPassoAtual(evento.status === "inicio" ? evento.rotulo : null);
            if (evento.status !== "inicio") {
              setLinhas((prev) => [
                ...prev,
                { id: proximoId(), role: "tool", content: evento.rotulo },
              ]);
            }
          } else if (evento.tipo === "mensagem") {
            setLinhas((prev) => [
              ...prev,
              { id: proximoId(), role: "assistant", content: evento.texto },
            ]);
          }
        }
      }
    } catch (err) {
      console.error("[CopilotChat] falha no stream:", err);
      setLinhas((prev) => [
        ...prev,
        { id: proximoId(), role: "assistant", content: "Perdi a conexão no meio da conversa. Tenta de novo?" },
      ]);
    } finally {
      setEnviando(false);
      setPassoAtual(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <Card className="flex-1 space-y-3 overflow-y-auto p-4">
        {linhas.length === 0 && (
          <p className="text-caption text-muted">
            Pergunte algo como &quot;faz um post sobre o que bombou em IA hoje&quot;.
          </p>
        )}
        {linhas.map((linha) => (
          <Bolha key={linha.id} linha={linha} />
        ))}
        {passoAtual && (
          <div className="flex items-center gap-2 text-caption text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#E0219C]" />
            {passoAtual}
          </div>
        )}
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Escreva pro copiloto…"
          rows={2}
          className="flex-1 resize-none rounded-control border border-white/12 bg-surface-2 p-3 text-body outline-none focus:border-[#E0219C]/60"
        />
        <Button type="submit" loading={enviando} disabled={!texto.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  );
}

function Bolha({ linha }: { linha: LinhaChat }) {
  if (linha.role === "tool") {
    return <p className="text-micro uppercase tracking-wide text-muted">✓ {linha.content}</p>;
  }
  const doUsuario = linha.role === "user";
  return (
    <div className={`flex ${doUsuario ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-control px-3.5 py-2.5 text-body ${
          doUsuario
            ? "bg-gradient-to-br from-[#E0219C] via-[#A020F0] to-[#7B2FF7] text-white"
            : "bg-surface-2 text-content"
        }`}
      >
        {linha.content}
      </div>
    </div>
  );
}
