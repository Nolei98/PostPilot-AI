// ============================================================
// POST /api/checkout — cria uma Stripe Checkout Session para o
// plano escolhido ('criador' | 'pro') e devolve a URL de pagamento.
// O front só redireciona: window.location.href = url.
// ============================================================
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { STRIPE_PRICES } from "@/lib/plans";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { plan } = (await req.json().catch(() => ({}))) as {
    plan?: "criador" | "pro";
  };
  const priceId = plan ? STRIPE_PRICES[plan] : undefined;
  if (!plan || !priceId) {
    return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
  }

  const stripe = getStripe();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Reusa o customer do Stripe se o usuário já teve assinatura
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // customer existente OU cria um novo com o e-mail do usuário
    ...(sub?.stripe_customer_id
      ? { customer: sub.stripe_customer_id }
      : { customer_email: user.email }),
    // amarra a sessão ao usuário do Supabase — o webhook usa isto
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id, plan } },
    success_url: `${appUrl}/?upgraded=1`,
    cancel_url: `${appUrl}/pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
