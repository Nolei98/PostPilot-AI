-- ============================================================
-- Migration 014: adiciona 'pollinations' como opção válida de
-- text_provider (grátis, sem key) — nova opção em Ajustes ao lado
-- de Gemini e Claude.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  drop constraint if exists notification_configs_text_provider_check;

alter table notification_configs
  add constraint notification_configs_text_provider_check
    check (text_provider in ('claude', 'gemini', 'pollinations'));
