"use client";

// ============================================================
// Modal do design system.
// Backdrop com blur, entrada animada, fecha no ESC / clique fora.
// Mobile: sobe como sheet do rodapé. Desktop: centralizado.
// ============================================================
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  // Fecha com ESC + trava o scroll do body enquanto aberto
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Só monta o portal no client — document não existe durante o SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  // Portal pro <body>: renderizar o modal dentro do card (que tem
  // animate-fade-up) faz o card virar containing block do `fixed`
  // assim que a animação termina (transform: translateY(0) != none),
  // descentralizando o modal em telas roladas. Fora da árvore do
  // card, position: fixed sempre centraliza contra a viewport.
  return createPortal(
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-in flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-card border border-line bg-surface p-5 shadow-modal sm:rounded-card"
      >
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h3 className="text-title">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-control p-1 text-muted transition-colors hover:bg-surface-2 hover:text-content"
            aria-label="Fechar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Conteúdo rola dentro do modal em vez de estourar a tela —
            sem isso, modais altos (ex: editar post) ficavam com o topo
            cortado acima da viewport, parecendo "fora do centro". */}
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
