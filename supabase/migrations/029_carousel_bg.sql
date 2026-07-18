-- ============================================================
-- Migration 029 (Sprint B+): foto de fundo do card de carrossel.
--
-- bg_url = URL da foto crua usada como fundo do card (notícia / banco /
-- pollinations). Guardada pra o resync re-compor o card com o Brand Kit
-- novo SEM re-buscar a foto. null = card com fundo sólido da marca.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table carousel_cards
  add column if not exists bg_url text;
