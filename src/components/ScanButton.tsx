"use client";

// ============================================================
// Botão "Varrer agora" — dispara a varredura sem esperar o cron.
// Estados: idle → running (polling em scan_runs) → done/error
// → volta a idle. Ao terminar, atualiza a fila sozinho (router.refresh).
// ============================================================
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getScanRunStatus, triggerScan } from "@/app/actions";
import { Button } from "@/components/ui/Button";

type Phase = "idle" | "running" | "done" | "error";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 60; // ~3 min — triagem em lote pode demorar

export function ScanButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Rodando...");
  const [runId, setRunId] = useState<string | null>(null);
  const pollCount = useRef(0);

  // Volta pro estado inicial depois de mostrar o resultado por um tempo
  function backToIdleAfter(ms: number) {
    setTimeout(() => {
      setPhase("idle");
      setRunId(null);
    }, ms);
  }

  useEffect(() => {
    if (phase !== "running" || !runId) return;
    const interval = setInterval(async () => {
      pollCount.current += 1;
      const status = await getScanRunStatus(runId);

      if (status.status === "done") {
        clearInterval(interval);
        const n = status.candidates ?? 0;
        setMessage(
          n === 0
            ? "Nada novo encontrado"
            : `${n} notícia${n > 1 ? "s" : ""} encontrada${n > 1 ? "s" : ""}, gerando post${n > 1 ? "s" : ""}...`
        );
        setPhase("done");
        router.refresh();
        backToIdleAfter(5000);
      } else if (status.status === "error") {
        clearInterval(interval);
        setMessage(status.errorMessage ?? "Falha na varredura.");
        setPhase("error");
        backToIdleAfter(4000);
      } else if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval);
        setMessage("Ainda rodando — os posts aparecem sozinhos quando prontos.");
        setPhase("done");
        router.refresh();
        backToIdleAfter(5000);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, runId]);

  async function handleClick() {
    setPhase("running");
    setMessage("Rodando...");
    pollCount.current = 0;
    const result = await triggerScan();
    if (!result.ok || !result.scanRunId) {
      setMessage(result.error ?? "Falha ao iniciar a varredura.");
      setPhase("error");
      backToIdleAfter(4000);
      return;
    }
    setRunId(result.scanRunId);
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={phase === "running"}
      disabled={phase === "running" || phase === "done"}
      onClick={handleClick}
    >
      {phase === "error" ? (
        <span className="text-error">{message}</span>
      ) : phase === "done" ? (
        <span className="animate-pop text-success">✓ {message}</span>
      ) : phase === "running" ? (
        <span>{message}</span>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
          </svg>
          Varrer agora
        </>
      )}
    </Button>
  );
}
