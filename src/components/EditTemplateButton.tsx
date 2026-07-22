"use client";

// ============================================================
// Botão "Editar" de um modelo do Template Studio (Sprint B+, B14).
// Preset do sistema (is_system) nunca é editado in-place — sempre
// duplica pra uma cópia própria do cliente ativo antes de abrir o
// editor, senão a edição afetaria todo mundo que usa aquele preset.
// ============================================================
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateTemplateForEditing } from "@/app/actions";

export function EditTemplateButton({
  templateId,
  isSystem,
}: {
  templateId: string;
  isSystem: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (isSystem) {
            const newId = await duplicateTemplateForEditing(templateId);
            router.push(`/settings/templates/${newId}`);
          } else {
            router.push(`/settings/templates/${templateId}`);
          }
        })
      }
      className="rounded-control bg-surface-2 px-2 py-1 text-micro text-muted transition-colors hover:text-content disabled:opacity-50"
    >
      {pending ? "Abrindo..." : isSystem ? "Duplicar e editar" : "Editar"}
    </button>
  );
}
