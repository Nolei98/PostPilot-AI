"use client";

// ============================================================
// Painel do brief de remix — a fórmula por trás das referências.
//
// Fica fechado até o usuário pedir: gerar custa uma chamada de IA, e
// abrir a tela do Radar não deveria disparar isso sozinho.
// ============================================================
import { useState } from "react";
import { gerarBriefDeRemix } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import type { RemixBrief } from "@/lib/ai/remix";

export function RemixBriefPanel({ temReferencias }: { temReferencias: boolean }) {
  const [brief, setBrief] = useState<RemixBrief | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setCarregando(true);
    setErro(null);
    const r = await gerarBriefDeRemix();
    setCarregando(false);
    if (!r.ok || !r.brief) {
      setErro(r.error ?? "Falhou.");
      return;
    }
    setBrief(r.brief);
  }

  async function copiar() {
    if (!brief) return;
    const texto = [
      `Padrão: ${brief.padrao}`,
      `Por que funciona: ${brief.porQueFunciona}`,
      `Ângulo: ${brief.angulo}`,
      "",
      "Ganchos:",
      ...brief.ganchos.map((g) => `- ${g}`),
    ].join("\n");
    await navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (!temReferencias) return null;

  return (
    <div className="mb-5 rounded-xl border border-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold">Brief de remix</h2>
          <p className="text-caption text-muted">
            A fórmula por trás das referências de topo — estrutura, não conteúdo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brief && (
            <Button variant="secondary" onClick={copiar}>
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          )}
          <Button onClick={gerar} disabled={carregando}>
            {carregando ? "Analisando..." : brief ? "Gerar de novo" : "Extrair fórmula"}
          </Button>
        </div>
      </div>

      {erro && <p className="text-caption text-danger mt-3">{erro}</p>}

      {brief && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="text-caption text-muted">Padrão</p>
            <p className="text-body">{brief.padrao}</p>
          </div>
          <div>
            <p className="text-caption text-muted">Por que funciona</p>
            <p className="text-body">{brief.porQueFunciona}</p>
          </div>
          <div>
            <p className="text-caption text-muted">Ângulo sugerido</p>
            <p className="text-body">{brief.angulo}</p>
          </div>
          <div>
            <p className="text-caption text-muted">Ganchos originais</p>
            <ul className="flex flex-col gap-1">
              {brief.ganchos.map((g, i) => (
                <li key={i} className="text-body">
                  · {g}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
