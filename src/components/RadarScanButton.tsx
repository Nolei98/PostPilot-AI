"use client";

// ============================================================
// Botão "Atualizar radar" — dispara a coleta de referências.
//
// Mais simples que o ScanButton da fila de propósito: o Radar não gasta
// IA e termina em segundos, então não precisa de tabela de execução nem
// de polling. Espera curta e router.refresh resolve.
// ============================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { triggerRadarScan } from "@/app/actions";
import { Button } from "@/components/ui/Button";

const ESPERA_MS = 6000;

export function RadarScanButton() {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "rodando" | "erro">("idle");
  const [erro, setErro] = useState<string | null>(null);

  async function rodar() {
    setEstado("rodando");
    setErro(null);
    const r = await triggerRadarScan();
    if (!r.ok) {
      setErro(r.error ?? "Falhou.");
      setEstado("erro");
      return;
    }
    // O job é rápido, mas não é síncrono: dar um tempo antes de recarregar
    // evita a tela voltar igual e parecer que o botão não fez nada.
    setTimeout(() => {
      router.refresh();
      setEstado("idle");
    }, ESPERA_MS);
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={rodar} disabled={estado === "rodando"}>
        {estado === "rodando" ? "Buscando..." : "Atualizar radar"}
      </Button>
      {erro && <span className="text-caption text-danger">{erro}</span>}
    </div>
  );
}
