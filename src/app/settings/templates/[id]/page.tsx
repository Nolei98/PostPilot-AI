// ============================================================
// Editor visual de um modelo do Template Studio (Sprint B+, TAREFA B14).
// Só edita modelos PRÓPRIOS do cliente ativo — presets do sistema chegam
// aqui já duplicados (ver EditTemplateButton). Painel por elemento
// selecionado + prévia renderizada no servidor (mesmo motor do post real).
// ============================================================
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import { TemplateSpecEditor } from "@/components/TemplateSpecEditor";
import type { Template } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TemplateEditPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const shell = await getShellData();

  const { data: template } = await supabase
    .from("templates")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!template) notFound();
  // Preset do sistema nunca edita in-place — volta pra Ajustes, onde o
  // botão "Duplicar e editar" cria a cópia própria certa.
  if (template.is_system) redirect("/settings");

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={shell.brandName}
      logoUrl={shell.logoUrl}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
      <div className="mb-5">
        <h1 className="text-display">Editar modelo</h1>
        <p className="text-caption text-muted">
          Ajuste posição, tamanho, cor e visibilidade de cada elemento — a
          prévia é o mesmo motor que renderiza o post de verdade.
        </p>
      </div>
      <TemplateSpecEditor template={template as Template} />
    </AppShell>
  );
}
