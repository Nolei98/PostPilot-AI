-- ============================================================
-- Migration 007: card "COMENTE: ..." (opcional) no slide de
-- fechamento — texto fixo + frase editável por post, igual aos
-- outros campos de identidade visual.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists tpl_cta_text text not null default '';

alter table posts
  add column if not exists tpl_cta_text text;
