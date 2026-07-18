// ============================================================
// /pricing — página de planos. Mostra o plano atual do usuário,
// uso do mês e os 3 cards com checkout via Stripe.
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { getMonthlyQuota } from "@/lib/subscription";
import { AppShell } from "@/components/ui/AppShell";
import { getShellData } from "@/lib/shell";
import { PricingCards } from "@/components/PricingCards";
import { PLANS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const quota = user
    ? await getMonthlyQuota(user.id)
    : { plan: "free" as const, used: 0, limit: PLANS.free.postsPerMonth, remaining: PLANS.free.postsPerMonth };

  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));

  const shell = await getShellData();

  return (
    <AppShell
      readyCount={shell.readyCount}
      brandName={shell.brandName}
      logoUrl={shell.logoUrl}
      clients={shell.clients}
      activeClientId={shell.activeClientId}
    >
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-display">Um social media custa R$1.500/mês.</h1>
          <p className="mt-1 text-body text-muted">
            O PostPilot faz o garimpo, o texto e a arte por uma fração disso —
            você só aprova.
          </p>
        </div>

        {/* Uso do mês — âncora visual do gatilho de upgrade */}
        <div className="mb-8 rounded-[22px] border border-white/8 bg-[#221038]/55 backdrop-blur-[20px] p-6 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-caption text-[#B9A9D6] uppercase tracking-wider font-title font-semibold text-[10.5px]">
              Seu uso este mês — plano{" "}
              <strong className="text-white font-bold">{PLANS[quota.plan].label}</strong>
            </span>
            <span className="text-caption font-bold font-title text-white">
              {quota.used}/{quota.limit} posts
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-black/70">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#E0219C] via-[#A020F0] to-[#7B2FF7] shadow-[0_0_16px_rgba(224,33,156,0.6)] transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          {quota.remaining === 0 && (
            <p className="mt-2 text-caption text-warning">
              Cota esgotada — as próximas notícias virais estão esperando um
              upgrade para virar posts.
            </p>
          )}
        </div>

        <PricingCards currentPlan={quota.plan} />

        <p className="mt-8 text-center text-caption text-subtle">
          Cancele quando quiser direto no painel — o acesso vale até o fim do
          período pago. Sem fidelidade, sem multa.
        </p>
      </div>
    </AppShell>
  );
}
