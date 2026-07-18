-- ============================================================
-- Migration 023: anti-duplicata por embedding (pgvector).
--
-- Guarda o embedding da legenda de cada post e permite achar posts
-- do MESMO cliente com legenda parecida demais (distância de cosseno
-- baixa) — usado no generate-post para regenerar com "novo ângulo"
-- antes de criar um post quase igual a outro do mesmo cliente.
--
-- Dedup é INTRA-cliente de propósito: clientes diferentes DEVEM poder
-- falar do mesmo fato na própria voz.
--
-- Dimensão 768 = Gemini text-embedding-004 (e o mock usa a mesma).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create extension if not exists vector;

alter table posts
  add column if not exists caption_embedding vector(768);

-- Retorna o id do post mais parecido do cliente dentro do limiar de
-- distância, ou NULL se não houver. stable: só lê.
create or replace function public.find_duplicate_caption(
  p_client_id uuid,
  p_embedding vector(768),
  p_max_distance float8
) returns uuid
language sql
stable
as $$
  select id
  from posts
  where client_id = p_client_id
    and caption_embedding is not null
    and (caption_embedding <=> p_embedding) <= p_max_distance
  order by caption_embedding <=> p_embedding
  limit 1
$$;
