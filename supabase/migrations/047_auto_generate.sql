-- ============================================================
-- Migration 047 — pausa da geração automática, por cliente.
--
-- Até aqui toda notícia candidata virava post: o cron de 3h triava e
-- disparava generate-post/generate-carousel sem nenhuma trava. Não havia
-- como dizer "para de gerar" sem desligar as fontes (o que também mata a
-- coleta e perde o histórico do radar).
--
-- `auto_generate = false` PAUSA só a criação: a varredura continua, as
-- notícias continuam entrando e sendo pontuadas, e as candidatas ficam
-- lá — o que não acontece é o disparo do job de geração.
--
-- DEFAULT true: quem já usa o produto não pode acordar com o piloto
-- desligado por causa de uma migration.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.brand_kits
  add column if not exists auto_generate boolean not null default true;

comment on column public.brand_kits.auto_generate is
  'false pausa o disparo de geração no scan-news; a varredura continua.';
