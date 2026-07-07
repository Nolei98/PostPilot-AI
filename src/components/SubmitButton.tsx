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
}: {
  children: React.ReactNode;
  savingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} className={`w-full ${className ?? ""}`}>
      {pending ? savingLabel : children}
    </Button>
  );
}
