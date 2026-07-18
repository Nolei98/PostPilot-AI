"use client";

// ============================================================
// Abas da tela "Prontos": Todos / A postar / Postados.
// Filtra client-side a lista já carregada pelo server component —
// sem round-trip, igual ao comportamento do mockup Fable 5.
// ============================================================
import { useState } from "react";
import { ReadyPostCard } from "@/components/ReadyPostCard";
import type { PostWithNews } from "@/lib/types";

type Filtro = "todos" | "apostar" | "postados";

const TABS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "apostar", label: "A postar" },
  { key: "postados", label: "Postados" },
];

export function ReadyTabs({ posts }: { posts: PostWithNews[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const filtrados = posts.filter((p) => {
    if (filtro === "apostar") return p.status === "approved";
    if (filtro === "postados") return p.status === "published";
    return true;
  });

  return (
    <div>
      <div className="mb-6 flex gap-2.5">
        {TABS.map((t) => {
          const active = filtro === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setFiltro(t.key)}
              className={`rounded-full border px-5 py-2 font-title text-[11px] tracking-wider transition-colors
                ${active ? "border-primary/55 bg-primary/20 text-content" : "border-white/15 bg-transparent text-muted hover:text-content"}`}
            >
              {t.label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {filtrados.length === 0 ? (
        <div className="animate-fade-up rounded-card border border-dashed border-line px-6 py-14 text-center">
          <h2 className="mb-1 text-title">Nada por aqui ainda</h2>
          <p className="mx-auto max-w-xs text-body text-muted">
            {filtro === "postados"
              ? "Marque posts como postados e eles aparecem aqui, como histórico."
              : "Aprove posts na fila e eles aparecem aqui, prontos para publicar."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtrados.map((post, i) => (
            <div key={post.id} style={{ animationDelay: `${i * 60}ms` }} className="animate-fade-up">
              <ReadyPostCard post={post} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
