-- ============================================================
-- Migration 015: adiciona 'stock' (fotos reais de banco — Pexels
-- principal, Unsplash fallback) como opção de image_provider, e
-- colunas em posts pra rastrear qual foto foi usada (dedup entre
-- posts do usuário + crédito quando o banco exigir atribuição).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  drop constraint if exists notification_configs_image_provider_check;

alter table notification_configs
  add constraint notification_configs_image_provider_check
    check (image_provider in ('fal', 'gemini', 'pollinations', 'stock'));

alter table posts add column if not exists stock_photo_id text;
alter table posts add column if not exists stock_photo_credit text;
