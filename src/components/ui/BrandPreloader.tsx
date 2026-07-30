"use client";

// ============================================================
// Preloader da marca em tela cheia (2026-07-29).
//
// Usado depois de salvar algo que muda a FILA inteira (layout, estilo da
// página 1, modelo). O overlay do próprio card só cobria o formulário —
// o resto da tela continuava clicável e a pessoa podia navegar antes de
// o RSC novo chegar, vendo a fila antiga e concluindo que não salvou.
// Aqui a tela toda fica travada até a árvore nova estar montada, com o
// mesmo orbe do resto do app (orb-logo-spin).
// ============================================================
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function BrandPreloader({
  label = "Aplicando...",
  hint = "Atualizando a fila com o novo visual",
}: {
  label?: string;
  /** Segunda linha: diz o que está sendo esperado nesta tela. */
  hint?: string;
}) {
  // Vai pro <body> por portal: `fixed` é ancorado pelo ancestral mais
  // próximo que tenha transform/filter, e os cards de Ajustes entram com
  // animate-fade-up (transform) — sem o portal o overlay cobria só o
  // cartão, não a tela.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
    >
      <span aria-hidden="true" className="orb-logo-spin block h-16 w-16 rounded-full" />
      <p className="text-body font-semibold uppercase tracking-wider text-white">{label}</p>
      <p className="text-caption text-white/60">{hint}</p>
    </div>,
    document.body
  );
}
