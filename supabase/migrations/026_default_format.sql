-- ============================================================
-- Migration 026: formato padrão de geração por cliente.
--
-- brand_kits.default_format decide se o pipeline gera post single ou
-- carrossel para aquele cliente. Default 'single' = comportamento
-- atual (nada muda até o cliente optar por carrossel em Ajustes).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table brand_kits
  add column if not exists default_format text not null default 'single'
    check (default_format in ('single', 'carousel'));
