"use client";

// ============================================================
// Input de arquivo da foto de perfil, com validação de tamanho no
// navegador (feedback imediato) — evita depender só da checagem do
// servidor, que sem isso derrubava a página inteira com o form
// action padrão (throw numa server action sem tratamento de erro
// vira "Application error" pro usuário).
// ============================================================
import { useState } from "react";

const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarFileInput() {
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_BYTES) {
      setError(
        `Foto muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB, máx 2MB) — escolha outra.`
      );
      e.target.value = ""; // limpa a seleção inválida, não deixa submeter
    } else {
      setError(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor="avatar" className="block text-caption text-muted">
        Foto de perfil (JPG/PNG, máx 2MB)
      </label>
      <input
        id="avatar"
        name="avatar"
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleChange}
        className="w-full text-caption text-muted file:mr-3 file:rounded-control file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-caption file:text-content hover:file:bg-line"
      />
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  );
}
