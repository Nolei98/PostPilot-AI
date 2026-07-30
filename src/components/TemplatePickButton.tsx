"use client";

// ============================================================
// Escolha de modelo (Modelos avançados) com a MESMA trava do
// SaveLockForm: enquanto a seleção não estiver confirmada no banco e a
// fila revalidada, a miniatura fica travada com o orbe da marca girando
// por cima. Sem isso dava pra clicar em três modelos seguidos e ficar
// sem saber qual venceu.
// ============================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BrandPreloader } from "@/components/ui/BrandPreloader";

export function TemplatePickButton({
  action,
  surface,
  templateId,
  name,
  thumbnailUrl,
  selected,
}: {
  action: (formData: FormData) => Promise<unknown>;
  surface: string;
  templateId: string;
  name: string;
  thumbnailUrl: string | null;
  selected: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const router = useRouter();
  const busy = saving || refreshing;

  async function pick() {
    if (busy || selected) return;
    const data = new FormData();
    data.set("surface", surface);
    data.set("template_id", templateId);
    setSaving(true);
    setErro(null);
    try {
      await action(data);
      startRefresh(() => router.refresh());
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível aplicar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        className={`block w-32 overflow-hidden rounded-control border-2 text-left transition-colors disabled:cursor-wait ${
          selected ? "border-primary" : "border-line hover:border-subtle"
        }`}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt={name} className="aspect-[4/5] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center bg-surface-2 text-micro text-subtle">
            sem preview
          </div>
        )}
        <p className="truncate px-2 py-1.5 text-micro text-content">
          {name}
          {selected && " ✓"}
        </p>
      </button>

      {busy && <BrandPreloader label="Aplicando modelo..." />}
      {erro && <p className="mt-1 text-micro text-[#FF5C7A]">{erro}</p>}
    </div>
  );
}
