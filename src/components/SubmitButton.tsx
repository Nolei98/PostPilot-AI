"use client";

// Botão de submit de form nativo (server action) com feedback de
// loading via useFormStatus — evita duplo submit e mostra spinner
// enquanto a server action roda.
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";

export function SubmitButton({
  children,
  savingLabel = "Salvando...",
  className,
  /** Trava o envio até uma condição do próprio form (ex: confirmação
   * digitada na exclusão de conta). */
  disabled = false,
}: {
  children: React.ReactNode;
  savingLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      loading={pending}
      disabled={disabled || pending}
      className={`w-full ${className ?? ""}`}
    >
      {pending ? savingLabel : children}
    </Button>
  );
}
