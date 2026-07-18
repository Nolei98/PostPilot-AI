"use client";

// ============================================================
// Seletor de CLIENTE (tenant) no sidebar. Troca o cliente ativo
// (grava cookie via server action) e permite criar um novo.
// ============================================================
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setActiveClient, createClientTenant } from "@/app/actions";

interface ClientLite {
  id: string;
  name: string;
}

export function ClientSwitcher({
  clients,
  activeClientId,
}: {
  clients: ClientLite[];
  activeClientId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block px-1 font-title text-[10px] font-semibold uppercase tracking-wider text-[#B9A9D6]">
        Cliente
      </label>

      <select
        value={activeClientId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(async () => {
            await setActiveClient(id);
            router.refresh();
          });
        }}
        className="w-full rounded-control border border-white/12 bg-[#221038] px-3 py-2 font-sans text-[12.5px] text-white outline-none transition-colors focus:border-primary/60 disabled:opacity-60"
      >
        {clients.length === 0 && <option value="">Nenhum cliente</option>}
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {adding ? (
        <form
          action={createClientTenant}
          className="flex items-center gap-1.5"
        >
          <input
            name="name"
            autoFocus
            required
            placeholder="Nome da marca"
            className="min-w-0 flex-1 rounded-control border border-white/12 bg-[#221038] px-2.5 py-1.5 font-sans text-[12px] text-white outline-none focus:border-primary/60"
          />
          <button
            type="submit"
            className="shrink-0 rounded-control bg-primary/80 px-2.5 py-1.5 font-title text-[10px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-primary"
          >
            Criar
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-control border border-dashed border-white/15 py-1.5 font-title text-[10px] font-semibold uppercase tracking-wider text-[#B9A9D6] transition-colors hover:border-white/30 hover:text-white"
        >
          + Novo cliente
        </button>
      )}
    </div>
  );
}
