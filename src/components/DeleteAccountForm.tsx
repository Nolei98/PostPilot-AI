"use client";

// ============================================================
// Excluir conta (auditoria §2.6).
//
// Fica fechado por padrão e só abre o formulário depois de um clique
// deliberado — não é ação que se ofereça pronta pra ser clicada por
// engano ao lado de "Salvar perfil". A confirmação é DIGITADA porque o
// gesto tem que ser diferente de todos os outros botões da tela: aqui
// não existe desfazer.
// ============================================================
import { useState } from "react";
import { deleteMyAccount } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function DeleteAccountForm() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const confirmado = texto.trim().toUpperCase() === "EXCLUIR";

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-caption text-subtle underline-offset-2 transition-colors hover:text-error hover:underline"
      >
        Excluir minha conta
      </button>
    );
  }

  return (
    <form action={deleteMyAccount} className="space-y-3">
      <p className="text-body font-medium text-error">Excluir a conta</p>
      <p className="text-caption text-muted">
        Apaga de vez a conta, todos os clientes, posts, fontes e as artes
        geradas. Não dá pra desfazer e não guardamos cópia.
      </p>
      <label htmlFor="confirmacao" className="block text-caption text-muted">
        Digite <strong className="text-content">EXCLUIR</strong> para confirmar
      </label>
      <input
        id="confirmacao"
        name="confirmacao"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoComplete="off"
        className="w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-body outline-none focus:border-error"
      />
      <div className="flex items-center gap-2">
        <SubmitButton savingLabel="Excluindo..." disabled={!confirmado}>
          Excluir permanentemente
        </SubmitButton>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setTexto("");
          }}
          className="text-caption text-subtle transition-colors hover:text-content"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
