-- ============================================================
-- Migration 008: o "Comente:" da contra-capa vira um TOGGLE
-- (liga/desliga a palavra fixa "COMENTE:"), não mais um campo de
-- texto livre. Substitui tpl_cta_text (string) por
-- tpl_cta_enabled (boolean).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  drop column if exists tpl_cta_text,
  add column if not exists tpl_cta_enabled boolean not null default false;

alter table posts
  drop column if exists tpl_cta_text,
  add column if not exists tpl_cta_enabled boolean;
