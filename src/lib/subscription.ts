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
 * Contas marcadas manualmente (SQL) como ilimitadas — uso interno,
 * sem cota de posts e forçadas a Pollinations (grátis) na geração.
 */
export async function isUnlimitedAccount(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("unlimited")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.unlimited ?? false;
}

/**
 * Cota do mês: quantos posts o usuário ainda pode gerar.
 * Ciclo = mês calendário (simples e previsível para o usuário).
 * Contas "unlimited" (flag manual) ignoram o teto do plano.
 */
export async function getMonthlyQuota(userId: string): Promise<{
  plan: PlanId;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
}> {
  const [plan, unlimited] = await Promise.all([
    getUserPlan(userId),
    isUnlimitedAccount(userId),
  ]);
  const limit = PLANS[plan].postsPerMonth;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const supabase = createAdminClient();
  // Post DESCARTADO não queima cota. Até 31/07 a conta era de toda linha
  // criada no mês, e o post nasce antes do usuário ver: quem descartasse 25
  // de 30 e aprovasse 5 teria pago por 30 e levado 5 — a cota puniria
  // justamente o uso correto da fila de aprovação. Cobrar pelo que o
  // usuário ACEITA é o que o plano promete.
  //
  // Invisível na conta do João (unlimited), então isto nunca apareceu em
  // teste — só apareceria no primeiro cliente pagante.
  const { count } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "discarded")
    .gte("created_at", monthStart.toISOString());

  const used = count ?? 0;
  return {
    plan,
    used,
    limit,
    // Number.MAX_SAFE_INTEGER, não Infinity: este valor passa pelo
    // step.run do Inngest (generate-post.ts), que serializa o retorno
    // em JSON pra memoização/replay — JSON.stringify(Infinity) vira
    // "null", e "quota.remaining <= 0" com null (coagido a 0) dava
    // TRUE, bloqueando a geração de posts em contas ilimitadas mesmo
    // com used bem abaixo do limite nominal do plano.
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used),
    unlimited,
  };
}
