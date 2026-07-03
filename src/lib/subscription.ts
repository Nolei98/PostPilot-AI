// ============================================================
// Leitura do plano do usuário + checagem de cota mensal.
// Usado no gating (geração de posts, fontes, contra-capa).
// ============================================================
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS, type PlanId } from "@/lib/plans";

/**
 * Plano efetivo do usuário. Assinatura cancelada mas dentro do
 * período pago (current_period_end no futuro) ainda vale — o
 * usuário pagou até lá.
 */
export async function getUserPlan(userId: string): Promise<PlanId> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return "free";
  const paidUntil = data.current_period_end
    ? new Date(data.current_period_end).getTime()
    : 0;
  const stillPaid = data.status === "active" || paidUntil > Date.now();
  return stillPaid && (data.plan === "criador" || data.plan === "pro")
    ? (data.plan as PlanId)
    : "free";
}

/**
 * Cota do mês: quantos posts o usuário ainda pode gerar.
 * Ciclo = mês calendário (simples e previsível para o usuário).
 */
export async function getMonthlyQuota(userId: string): Promise<{
  plan: PlanId;
  used: number;
  limit: number;
  remaining: number;
}> {
  const plan = await getUserPlan(userId);
  const limit = PLANS[plan].postsPerMonth;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", monthStart.toISOString());

  const used = count ?? 0;
  return { plan, used, limit, remaining: Math.max(0, limit - used) };
}
