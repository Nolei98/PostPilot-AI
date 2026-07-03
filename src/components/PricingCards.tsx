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
            className={`relative flex flex-col rounded-card border bg-surface p-5
              ${card.highlight ? "border-primary shadow-glow" : "border-line"}`}
          >
            {card.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-micro font-semibold text-white">
                MAIS POPULAR
              </span>
            )}

            <h3 className="text-title font-semibold">{card.name}</h3>
            <p className="mt-0.5 text-caption text-muted">{card.tagline}</p>

            <p className="mt-4">
              <span className="text-display font-bold">{card.price}</span>
              <span className="text-caption text-muted"> {card.period}</span>
            </p>

            <ul className="mt-4 flex-1 space-y-2">
              {card.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-body">
                  <span className="mt-0.5 text-success">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5">
              {isCurrent ? (
                currentPlan === "free" ? (
                  <p className="rounded-control bg-surface-2 px-4 py-2.5 text-center text-caption text-muted">
                    Seu plano atual
                  </p>
                ) : (
                  <button
                    onClick={openPortal}
                    disabled={loading !== null}
                    className="w-full rounded-control bg-surface-2 px-4 py-2.5 text-body text-muted transition-colors hover:text-content disabled:opacity-50"
                  >
                    Gerenciar assinatura
                  </button>
                )
              ) : card.id === "free" ? (
                <Link
                  href="/"
                  className="block w-full rounded-control bg-surface-2 px-4 py-2.5 text-center text-body transition-colors hover:bg-surface"
                >
                  {card.cta}
                </Link>
              ) : (
                <button
                  onClick={() => checkout(card.id as "criador" | "pro")}
                  disabled={loading !== null}
                  className={`w-full rounded-control px-4 py-2.5 text-body font-medium text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-50
                    ${card.highlight ? "bg-primary hover:bg-primary-hover hover:shadow-glow" : "bg-surface-2 hover:bg-primary"}`}
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
