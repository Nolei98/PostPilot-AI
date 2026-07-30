"use client";

// ============================================================
// Form com TRAVA de salvamento (2026-07-29).
//
// O problema que isto resolve: trocar o layout em Ajustes e não ver a
// mudança na fila — "às vezes preciso salvar duas ou três vezes". Eram
// duas coisas somadas:
//   1. as actions revalidavam "/", que é a landing estática, e nunca
//      "/fila" (corrigido em actions.ts);
//   2. o botão destravava assim que a action retornava, então dava pra
//      salvar de novo (ou navegar) antes de o RSC novo chegar — e a
//      pessoa via a tela velha e concluía que não salvou.
//
// Aqui a trava só solta quando a action CONFIRMOU no banco e o
// router.refresh() terminou de trocar a árvore — a transição do React é
// quem diz quando isso aconteceu. Enquanto isso, o orbe da marca gira
// por cima do form (mesmo indicador de "carregando" do resto do app).
// ============================================================
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { BrandPreloader } from "@/components/ui/BrandPreloader";

export function SaveLockForm({
  action,
  children,
  label,
  savingLabel = "Salvando...",
  className,
}: {
  /** Server action; pode devolver qualquer coisa — o retorno só serve
   * como confirmação de que o write foi aceito. */
  action: (formData: FormData) => Promise<unknown>;
  children: React.ReactNode;
  label: string;
  savingLabel?: string;
  className?: string;
}) {
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const busy = saving || refreshing;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return; // trava: nenhum segundo submit enquanto o 1º roda
    const data = new FormData(e.currentTarget);
    setSaving(true);
    setErro(null);
    try {
      await action(data);
      // Só agora o valor está confirmado no banco e /fila foi revalidada.
      // A transição segura a trava até a árvore nova estar montada.
      startRefresh(() => router.refresh());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <form ref={formRef} onSubmit={onSubmit} className={className ?? "space-y-3"}>
        <fieldset disabled={busy} className="space-y-3 border-0 p-0">
          {children}
        </fieldset>
        <Button type="submit" loading={busy} className="w-full">
          {busy ? savingLabel : label}
        </Button>
        {erro && <p className="text-caption text-[#FF5C7A]">{erro}</p>}
      </form>

      {/* Preloader da marca do começo ao fim: da gravação até a fila nova
          estar montada. Cobrir a tela toda é o ponto — travar só o
          formulário deixava navegar no meio e ver a fila antiga. */}
      {busy && <BrandPreloader label={savingLabel} />}
    </div>
  );
}
