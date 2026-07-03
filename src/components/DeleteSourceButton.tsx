"use client";

// Remover fonte — pede confirmação num modal (ação destrutiva
// apaga também as notícias coletadas da fonte).
import { useState, useTransition } from "react";
import { deleteSource } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function DeleteSourceButton({ sourceId }: { sourceId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="rounded-control p-1.5 text-subtle transition-colors hover:bg-error/10 hover:text-error"
        title="Remover fonte"
        aria-label="Remover fonte"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Remover fonte?"
      >
        <p className="mb-4 text-body text-muted">
          As notícias já coletadas desta fonte também serão apagadas. Posts já
          gerados não são afetados.
        </p>
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            loading={isPending}
            onClick={() =>
              startTransition(async () => {
                await deleteSource(sourceId);
                setConfirming(false);
              })
            }
          >
            Remover
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>
    </>
  );
}
