-- ============================================================
-- Migration 013: adiciona 'pollinations' como opção válida de
-- image_provider (grátis, sem key) — nova opção em Ajustes ao lado
-- de Gemini e Fal.ai.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  drop constraint if exists notification_configs_image_provider_check;

alter table notification_configs
  add constraint notification_configs_image_provider_check
    check (image_provider in ('fal', 'gemini', 'pollinations'));
