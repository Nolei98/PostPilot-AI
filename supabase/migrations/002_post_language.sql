-- ============================================================
-- Migration 002: idioma dos posts gerados.
-- notification_configs funciona como "preferências do usuário"
-- (1 linha por usuário) — o idioma entra aqui.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists post_language text not null default 'pt-BR';
