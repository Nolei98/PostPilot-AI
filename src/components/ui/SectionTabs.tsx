"use client";

// ============================================================
// Abas simples pra agrupar sub-seções dentro de uma seção maior de
// Ajustes (ex: "Marca & Visual" reúne Perfil/Cores/Layouts/Modelos).
// Todo o conteúdo fica montado o tempo todo (só troca via CSS) —
// nenhum form perde estado ao trocar de aba.
//
// A aba ativa fica em sessionStorage (2026-07-29): salvar o layout
// dispara router.refresh(), a árvore remonta pelo loading.tsx da rota e
// o estado local voltava pro primeiro painel — quem estava em "Layouts"
// era jogado pra "Perfil" logo depois de salvar, e parecia que o save
// tinha recarregado a página inteira.
// ============================================================
import { useEffect, useState, type ReactNode } from "react";

export interface TabPanel {
  id: string;
  label: string;
  content: ReactNode;
}

export function SectionTabs({ panels, storageKey }: { panels: TabPanel[]; storageKey?: string }) {
  const key = `section-tabs:${storageKey ?? panels.map((p) => p.id).join(",")}`;
  const [active, setActive] = useState(panels[0]?.id);

  // Só depois de montar: ler no primeiro render daria markup diferente do
  // servidor (hydration mismatch).
  useEffect(() => {
    const salvo = sessionStorage.getItem(key);
    if (salvo && panels.some((p) => p.id === salvo)) setActive(salvo);
    // key é derivado dos painéis, que não mudam em runtime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function choose(id: string) {
    setActive(id);
    sessionStorage.setItem(key, id);
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {panels.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choose(p.id)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-body transition-colors ${
              active === p.id
                ? "border-primary text-content"
                : "border-transparent text-muted hover:text-content"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <div key={p.id} className={active === p.id ? "space-y-4" : "hidden"}>
          {p.content}
        </div>
      ))}
    </div>
  );
}
