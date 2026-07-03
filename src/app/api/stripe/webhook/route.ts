// ============================================================
// POST /api/stripe/webhook — espelha o estado da assinatura do
// Stripe na tabela `subscriptions` (cache local para gating).
//
// Eventos tratados:
//   checkout.session.completed        → ativa o plano
//   customer.subscription.updated     → upgrade/downgrade/renovação
//   customer.subscription.deleted     → volta para free
//
// Configurar no dashboard do Stripe:
//   endpoint: https://SEU_DOMINIO/api/stripe/webhook
//   secret → STRIPE_WEBHOOK_SECRET no .env
// ============================================================
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook não configurado" }, { status: 500 });
  }

  const stripe = getStripe();
  const signature = req.headers.get("stripe-signature") ?? "";
  const body = await req.text(); // corpo RAW — obrigatório p/ verificar assinatura

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 400 });
  }

  const admin = createAdminClient();

  /** Upsert do espelho local a partir de uma Subscription do Stripe */
  async function syncSubscription(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id;
    if (!userId) return; // sem vínculo — ignora (não veio do nosso checkout)
    const plan =
      sub.status === "active" || sub.status === "trialing"
        ? (sub.metadata?.plan ?? "criador")
        : "free";
    const periodEnd = sub.items.data[0]?.current_period_end;
    await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: String(sub.customer),
        stripe_subscription_id: sub.id,
        plan,
        status: sub.status === "trialing" ? "active" : sub.status,
        current_period_end: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          String(session.subscription)
        );
        await syncSubscription(sub);
      }
      break;
    }
    case "customer.subscription.updated":
      await syncSubscription(event.data.object);
      break;
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const userId = sub.metadata?.user_id;
      if (userId) {
        await admin
          .from("subscriptions")
          .update({
            plan: "free",
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
