-- ============================================================
-- Migration 006: corrige a identidade visual para ser a ÚLTIMA
-- PÁGINA do carrossel (slide de fechamento) — não substitui mais
-- a imagem de conteúdo. Post pode ter 1 página (sem identidade)
-- ou 2 páginas (conteúdo + fechamento).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table posts
  add column if not exists closing_image_url text;
