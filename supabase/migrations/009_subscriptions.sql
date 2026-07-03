-- ============================================================
-- Migration 009: assinaturas (monetização).
-- Tabela separada — 1 linha por usuário, espelha o estado do
-- Stripe via webhook (fonte da verdade = Stripe; isto é cache
-- local para gating rápido sem chamada externa).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  -- 'free' | 'criador' | 'pro'
  plan text not null default 'free',
  -- 'active' | 'past_due' | 'canceled' (espelho do status Stripe)
  status text not null default 'active',
  -- fim do período pago atual (acesso vale até aqui mesmo se cancelar)
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- usuário lê a própria assinatura; escrita só via service role (webhook)
create policy "read own subscription"
  on subscriptions for select
  using (auth.uid() = user_id);
