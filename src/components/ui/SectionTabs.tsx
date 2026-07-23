"use client";

// ============================================================
// Abas simples pra agrupar sub-seções dentro de uma seção maior de
// Ajustes (ex: "Marca & Visual" reúne Perfil/Cores/Layouts/Modelos).
// Todo o conteúdo fica montado o tempo todo (só troca via CSS) —
// nenhum form perde estado ao trocar de aba.
// ============================================================
import { useState, type ReactNode } from "react";

export interface TabPanel {
  id: string;
  label: string;
  content: ReactNode;
}

export function SectionTabs({ panels }: { panels: TabPanel[] }) {
  const [active, setActive] = useState(panels[0]?.id);
  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {panels.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActive(p.id)}
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
