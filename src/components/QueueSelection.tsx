"use client";

// ============================================================
// Seleção MÚLTIPLA na fila: aprovar ou descartar vários posts de uma
// vez. Uma fila de dezenas de posts (o normal depois de alguns dias de
// varredura) era limpa um card por vez, com animação de saída a cada um.
//
// O estado mora aqui e não no PostCard porque é compartilhado: a barra
// de ações precisa saber quantos estão marcados, e o "selecionar todos"
// precisa alcançar cards que o próprio PostCard não conhece. O provider
// envolve a GRADE inteira (renderizada no servidor) e cada card lê o
// contexto — assim a página continua sendo Server Component.
//
// Fora do provider o contexto é null e o PostCard simplesmente não
// desenha a caixinha: é o que mantém o card usável em qualquer tela que
// não tenha seleção.
// ============================================================
import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approvePosts, discardPosts } from "@/app/actions";
import { useToast } from "@/components/ui/Toast";

type SelectionValue = {
  selected: Set<string>;
  toggle: (postId: string) => void;
  isSelected: (postId: string) => boolean;
  busy: boolean;
};

const SelectionContext = createContext<SelectionValue | null>(null);

/** Estado de seleção do card, pra quem estiver dentro da grade da fila. */
export function useQueueSelection(): SelectionValue | null {
  return useContext(SelectionContext);
}

export function QueueSelection({
  postIds,
  children,
}: {
  /** Todos os posts da fila, na ordem da tela — o "selecionar todos". */
  postIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  // QUAL ação está rodando. Sem isso, os dois botões liam o mesmo
  // `pending` e o de aprovar entrava em "Aprovando…" durante um DESCARTE
  // (visto em 29/07) — o rótulo dizia o oposto do que estava acontecendo.
  const [rodando, setRodando] = useState<"approve" | "discard" | null>(null);
  // Descarte em lote pede um segundo clique: é a única ação daqui que
  // tira conteúdo da frente do cliente sem ele ter olhado post a post.
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  function toggle(postId: string) {
    setConfirmarDescarte(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  function limpar() {
    setSelected(new Set());
    setConfirmarDescarte(false);
  }

  function run(qual: "approve" | "discard", action: () => Promise<{ ok: string } | void>) {
    setRodando(qual);
    startTransition(async () => {
      try {
        const result = await action();
        limpar();
        if (result && "ok" in result) toast(result.ok);
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Não foi possível concluir.");
      } finally {
        setRodando(null);
      }
    });
  }

  const ids = [...selected];
  const total = ids.length;
  const todosMarcados = postIds.length > 0 && total === postIds.length;

  return (
    <SelectionContext.Provider
      value={{ selected, toggle, isSelected: (id) => selected.has(id), busy: pending }}
    >
      {/* Barra de ações — só existe quando há seleção, pra não competir
          com o conteúdo no uso normal (decidir post a post). */}
      {total > 0 && (
        <div className="sticky top-2 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-2/95 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-caption text-content">
              {total} {total === 1 ? "post selecionado" : "posts selecionados"}
            </span>
            <button
              type="button"
              onClick={() =>
                todosMarcados ? limpar() : setSelected(new Set(postIds))
              }
              className="text-micro text-subtle underline-offset-2 transition-colors hover:text-content hover:underline"
            >
              {todosMarcados ? "Limpar seleção" : `Selecionar todos (${postIds.length})`}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run("approve", async () => {
                  const { approved } = await approvePosts(ids);
                  return { ok: `${approved} ${approved === 1 ? "post aprovado" : "posts aprovados"} — montando a arte.` };
                })
              }
              className="rounded-full bg-content px-3 py-1.5 text-micro text-surface transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {rodando === "approve" ? "Aprovando…" : `✓ Aprovar ${total}`}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirmarDescarte) {
                  setConfirmarDescarte(true);
                  return;
                }
                run("discard", async () => {
                  const { discarded } = await discardPosts(ids);
                  return { ok: `${discarded} ${discarded === 1 ? "post descartado" : "posts descartados"}.` };
                });
              }}
              className={`rounded-full px-3 py-1.5 text-micro transition-colors disabled:opacity-50 ${
                confirmarDescarte
                  ? "bg-error text-white"
                  : "bg-surface text-muted hover:text-content"
              }`}
            >
              {rodando === "discard"
                ? "Descartando…"
                : confirmarDescarte
                  ? `Confirmar descarte de ${total}?`
                  : `✕ Descartar ${total}`}
            </button>
            <button
              type="button"
              onClick={limpar}
              disabled={pending}
              className="text-micro text-subtle transition-colors hover:text-content disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {children}
    </SelectionContext.Provider>
  );
}
