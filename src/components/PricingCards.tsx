"use client";

// ============================================================
// Cards de preço + botão de checkout (client: chama /api/checkout
// e redireciona para o Stripe). Free não tem checkout — CTA leva
// para a fila.
// ============================================================
import { useState } from "react";
import Link from "next/link";
import type { PlanId } from "@/lib/plans";

interface PlanCard {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight: boolean;
}

const CARDS: PlanCard[] = [
  {
    id: "free",
    name: "Radar",
    price: "R$0",
    period: "para sempre",
    tagline: "Sinta o poder do piloto automático",
    features: [
      "5 posts gerados por mês",
      "2 fontes de notícias monitoradas",
      "Fila de aprovação completa",
      "Arte com marca PostPilot",
    ],
    cta: "Começar grátis",
    highlight: false,
  },
  {
    id: "criador",
    name: "Criador",
    price: "R$79",
    period: "/mês",
    tagline: "1 post por dia, todo dia, sem esforço",
    features: [
      "30 posts gerados por mês",
      "5 fontes de notícias monitoradas",
      "Contra-capa 100% personalizada",
      "Sync automático da fila ao salvar ajustes",
      "Posts em português, inglês ou espanhol",
      "Notificações no Telegram",
    ],
    cta: "Assinar Criador",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "R$149",
    period: "/mês",
    tagline: "Frequência que o algoritmo recompensa",
    features: [
      "90 posts gerados por mês (3/dia)",
      "Fontes ilimitadas",
      "Tudo do Criador",
      "Prioridade na geração",
      "Acesso antecipado: publicação automática",
      "Suporte prioritário",
    ],
    cta: "Assinar Pro",
    highlight: false,
  },
];

export function PricingCards({ currentPlan }: { currentPlan: PlanId }) {
  const [loading, setLoading] = useState<PlanId | null>(null);

  async function checkout(plan: "criador" | "pro") {
    setLoading(plan);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // → Stripe Checkout
      } else {
        alert(data.error ?? "Erro ao iniciar o pagamento");
        setLoading(null);
      }
    } catch {
      alert("Erro de conexão. Tente de novo.");
      setLoading(null);
    }
  }

  async function openPortal() {
    setLoading(currentPlan);
    const res = await fetch("/api/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else setLoading(null);
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {CARDS.map((card) => {
        const isCurrent = card.id === currentPlan;
        return (
          <div
            key={card.id}
            className={`relative flex flex-col rounded-[22px] border p-6 backdrop-blur-[20px] transition-all duration-200
              ${card.highlight 
                ? "border-[#E0219C]/50 bg-[#221038]/75 shadow-card" 
                : "border-white/8 bg-[#221038]/55 shadow-card"}`}
          >
            {card.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#E0219C] to-[#7B2FF7] px-3 py-0.5 text-micro font-semibold text-white tracking-wider uppercase">
                MAIS POPULAR
              </span>
            )}

            <h3 className="text-title font-semibold font-title tracking-wide">{card.name}</h3>
            <p className="mt-0.5 text-caption text-muted">{card.tagline}</p>

            <p className="mt-4">
              <span className="text-display font-bold font-title">{card.price}</span>
              <span className="text-caption text-muted"> {card.period}</span>
            </p>

            <ul className="mt-4 flex-1 space-y-2.5">
              {card.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-body">
                  <span className="mt-0.5 text-[#46E5B7]">✓</span>
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {isCurrent ? (
                currentPlan === "free" ? (
                  <p className="rounded-control bg-[#2A1545] border border-white/10 px-4 py-3 text-center text-caption text-muted font-title font-semibold tracking-wider uppercase">
                    Seu plano atual
                  </p>
                ) : (
                  <button
                    onClick={openPortal}
                    disabled={loading !== null}
                    className="w-full rounded-control border border-white/20 py-3 text-body font-title font-semibold tracking-wider text-muted-foreground transition-all duration-200 hover:border-[#E0219C] hover:text-[#E0219C] disabled:opacity-50 uppercase"
                  >
                    Gerenciar assinatura
                  </button>
                )
              ) : card.id === "free" ? (
                <Link
                  href="/fila"
                  className="block w-full text-center rounded-control border border-white/20 py-3 text-body font-title font-semibold tracking-wider text-white transition-all duration-200 hover:border-[#E0219C] hover:text-[#E0219C] uppercase"
                >
                  {card.cta}
                </Link>
              ) : (
                <button
                  onClick={() => checkout(card.id as "criador" | "pro")}
                  disabled={loading !== null}
                  className={`w-full rounded-control py-3 text-body font-title font-semibold tracking-wider text-white transition-all duration-200 active:scale-[0.97] disabled:opacity-50 uppercase
                    ${card.highlight 
                      ? "bg-gradient-to-br from-[#E0219C] via-[#A020F0] to-[#7B2FF7] shadow-[0_0_34px_rgba(224,33,156,0.35)] hover:shadow-[0_0_50px_rgba(224,33,156,0.6)]" 
                      : "bg-transparent border border-white/20 hover:border-[#E0219C] hover:text-[#E0219C]"}`}
                >
                  {loading === card.id ? "Abrindo pagamento…" : card.cta}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
