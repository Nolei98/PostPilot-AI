// ============================================================
// Resolve o modelo escolhido (Template Studio, migration 028) por
// superfície, a partir de brand_kits.template_selection. Usado pelos
// jobs de geração (Sprint B+, TAREFA B15) — cliente sem seleção cai no
// motor antigo (fallback), zero mudança visual pra quem não escolheu nada.
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";
import type { Surface, TemplateSpec } from "@/lib/types";

/** Busca a spec de cada superfície pedida que o cliente tenha escolhido
 * (template_selection). Superfícies sem seleção ficam ausentes do retorno
 * — o chamador decide o fallback (motor antigo). */
export async function resolveTemplateSpecs(
  templateSelection: Partial<Record<Surface, string>> | null | undefined,
  surfaces: Surface[]
): Promise<Partial<Record<Surface, TemplateSpec>>> {
  const ids = surfaces
    .map((s) => templateSelection?.[s])
    .filter((id): id is string => !!id);
  if (ids.length === 0) return {};

  const supabase = createAdminClient();
  const { data } = await supabase.from("templates").select("id, surface, spec").in("id", ids);

  const bySurface: Partial<Record<Surface, TemplateSpec>> = {};
  for (const row of data ?? []) {
    const surface = row.surface as Surface;
    // confere que o id retornado é mesmo o escolhido pra essa superfície
    // (o .in() não garante o pareamento id↔superfície sozinho).
    if (templateSelection?.[surface] === row.id) {
      bySurface[surface] = row.spec as TemplateSpec;
    }
  }
  return bySurface;
}
