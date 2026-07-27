-- ============================================================
-- Migration 039 — estado de "re-renderizando" por post.
--
-- Ao trocar o layout em Ajustes, o resync roda em background e pode
-- levar MINUTOS (10 cards em PNG + vídeos re-encodados com ffmpeg,
-- concurrency 1). Até aqui a Fila não dava sinal nenhum disso: o
-- usuário via a arte antiga e concluía que o layout não tinha sido
-- aplicado — foi exatamente o que aconteceu em 2026-07-27.
--
-- 'pending' é marcado quando o job começa e volta pra 'idle' post a
-- post, conforme cada um termina. A UI usa isso pro mesmo polling de
-- 4s que o vídeo já usa (PostCard.tsx).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists rerender_status text not null default 'idle'
    check (rerender_status in ('idle', 'pending'));

-- Índice parcial: a Fila só pergunta por quem está 'pending', que é a
-- minoria absoluta das linhas (e zero na maior parte do tempo).
create index if not exists idx_posts_rerender_pending
  on public.posts (client_id)
  where rerender_status = 'pending';
