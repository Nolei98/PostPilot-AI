-- ============================================================
-- Migration 019: liga/desliga a logo da marca nas artes geradas.
-- Antes disso a logo, uma vez enviada em Ajustes, sempre aparecia
-- como selo no canto da arte — sem opção de desligar.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists show_brand_logo boolean not null default true;
