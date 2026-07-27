-- ============================================================
-- Migration 038 — renovação do token do Instagram + visibilidade de
-- falha na coleta de métricas.
--
-- 1) O token de longa duração do Instagram vale ~60 dias. Até aqui ele
--    era gravado no OAuth e nunca mais tocado: passados os 60 dias a
--    publicação passa a falhar em silêncio (publish-scheduled-posts só
--    grava publish_error e tenta de novo a cada 5min, pra sempre). O job
--    refresh-social-tokens renova antes de vencer; estas colunas são o
--    rastro dele (quando renovou, e por que falhou se falhou).
--
-- 2) collect-insights engolia a exceção (só console.error) — falha de
--    coleta era invisível no banco. Mesmo padrão de video_error/
--    publish_error: registra o erro sem derrubar nada.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.social_connections
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists last_error text;

alter table public.posts
  add column if not exists metrics_error text;
