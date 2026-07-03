"use client";

// ============================================================
// Onboarding do usuário NOVO (zero posts na conta):
// 1. Dispara o primeiro scan automaticamente (uma vez — guarda em
//    localStorage para não re-disparar a cada visita).
// 2. Mostra o que está acontecendo ("garimpando notícias...").
// 3. Recarrega a fila a cada 20s até os primeiros posts chegarem —
//    o usuário vê a fila encher sozinha, sem apertar nada.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { triggerScan } from "@/app/actions";

const KICKOFF_KEY = "postpilot_first_scan_fired";

export function FirstScanKickoff() {
  const router = useRouter();
  const fired = useRef(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    // Dispara o scan uma única vez por conta/navegador
    if (!fired.current && !localStorage.getItem(KICKOFF_KEY)) {
      fired.current = true;
      localStorage.setItem(KICKOFF_KEY, "1");
      setScanning(true);
      triggerScan().catch(() => {
        // Falhou? Libera para tentar de novo na próxima visita.
        localStorage.removeItem(KICKOFF_KEY);
      });
    } else {
      setScanning(true); // já disparado antes — segue acompanhando
    }

    // Fila é server component: refresh periódico até os posts chegarem.
    // O componente desmonta sozinho quando a fila deixa de estar vazia.
    const interval = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="animate-fade-up rounded-card border border-dashed border-primary/40 bg-primary/5 px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
        {/* radar girando */}
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="animate-spin"
          style={{ animationDuration: "3s" }}
        >
          <circle cx="12" cy="12" r="9" opacity="0.3" />
          <path d="M12 3a9 9 0 0 1 9 9" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <h2 className="mb-1 text-title">Bem-vindo! Seu radar já está ligado 🚀</h2>
      <p className="mx-auto mb-2 max-w-sm text-body text-muted">
        {scanning
          ? "Estamos garimpando as notícias de IA de agora, escolhendo as com potencial viral e transformando em posts prontos."
          : "Preparando sua primeira varredura..."}
      </p>
      <p className="text-caption text-subtle">
        Seus primeiros posts chegam aqui em ~10 minutos — a página
        atualiza sozinha, pode deixar aberta.
      </p>
    </div>
  );
}
