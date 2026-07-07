-- ============================================================
-- Migration 016: contas ilimitadas (uso interno).
-- Flag manual para 3~4 contas próprias sem limite de posts e
-- forçadas a usar Pollinations (grátis) em texto e imagem, sem
-- depender de plano pago no Stripe.
-- Marcar uma conta: update subscriptions set unlimited = true
-- where user_id = '<uuid>';
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table subscriptions
  add column if not exists unlimited boolean not null default false;
