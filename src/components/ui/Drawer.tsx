"use client";

// ============================================================
// Drawer lateral (desliza da direita) — usado no "Editar post",
// igual ao painel do mockup Fable 5. Mesmo comportamento do
// Modal (ESC fecha, trava scroll, portal pro body).
// ============================================================
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="animate-backdrop-in fixed inset-0 z-[80] flex justify-end bg-[#0D0418]/66 backdrop-blur-[6px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col gap-5 overflow-y-auto border-l border-white/10 bg-[#1c0b33] p-6 animate-fade-up"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-title text-[16px] tracking-wider">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-control border border-white/18 text-content transition-colors hover:border-primary hover:text-primary"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
