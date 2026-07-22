-- ============================================================
-- Migration 035 (Sprint B+, TAREFA B9): override manual por card do
-- Template Studio — mostrar/esconder rótulo de marca e forçar cor do
-- texto, independente do modelo escolhido pra superfície inteira.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================
alter table carousel_cards add column if not exists layout jsonb;
