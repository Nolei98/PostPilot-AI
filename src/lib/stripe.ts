// Cliente Stripe singleton (server-only).
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada no .env.local");
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}
