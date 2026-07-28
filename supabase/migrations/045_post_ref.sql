-- ============================================================
-- Migration 045 — identificador curto de post.
--
-- O id é um UUID: serve pro sistema, não pra pessoa. Quem usa a
-- plataforma precisa conseguir dizer "o post 128 saiu errado" — no
-- suporte, num print, numa conversa — e hoje teria que colar
-- `ebb2f862-cecb-499d-af8f-de4240a4660c`.
--
-- Sequência GLOBAL (não por cliente) de propósito: dois clientes nunca
-- têm o mesmo número, então o código identifica o post sozinho, sem
-- precisar dizer de quem é. Numeração por cliente exigiria contador
-- próprio e travas por linha pra não repetir em geração concorrente.
--
-- Linhas antigas recebem número na hora do ALTER (o DEFAULT é aplicado a
-- todas), na ordem física da tabela — não é a ordem cronológica exata,
-- mas todo post fica com um número único e estável a partir daqui.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create sequence if not exists public.posts_ref_seq;

alter table public.posts
  add column if not exists ref bigint not null default nextval('public.posts_ref_seq');

-- Índice único: o código é meio de identificação, não pode repetir nem
-- se alguém gravar um valor à mão.
create unique index if not exists idx_posts_ref on public.posts (ref);

-- A sequência continua de onde as linhas existentes pararam.
select setval('public.posts_ref_seq', coalesce((select max(ref) from public.posts), 0) + 1, false);
