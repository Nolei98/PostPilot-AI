"use client";

// ============================================================
// Botão "Varrer agora" — dispara a varredura sem esperar o cron.
// Estados: idle → loading (spinner) → confirmação temporária.
// ============================================================
import { useState, useTransition } from "react";
import { triggerScan } from "@/app/actions";
import { Button } from "@/components/ui/Button";

export function ScanButton() {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={isPending}
      disabled={done}
      onClick={() =>
        startTransition(async () => {
          await triggerScan();
          setDone(true);
          // Reabilita após 30s (a varredura leva um tempo para popular)
          setTimeout(() => setDone(false), 30000);
        })
      }
    >
      {done ? (
        <span className="animate-pop text-success">✓ Varredura iniciada</span>
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
