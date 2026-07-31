-- ============================================================
-- Migration 051 (Sprint E, fatia 1): Viral Radar — referências REAIS,
-- com número de engajamento medido, não opinião da IA.
--
-- Por que uma tabela nova e não `news_items`: são coisas diferentes.
-- `news_items` é pauta ("essa notícia merece virar post?", score dado
-- pela IA lendo a manchete). Aqui é REFERÊNCIA ("isso performou de
-- verdade, com N pontos e M comentários") — o número vem da plataforma.
-- Misturar as duas faria o teto de triagem competir com a coleta, e o
-- viral_score da IA se confundir com engajamento medido.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create table if not exists viral_references (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- Plataforma de origem. 'reddit' já entra no check: o coletor existe,
  -- só depende do app OAuth do usuário (o .json público virou 403 em
  -- 2025). Deixar no check evita uma migration só pra isso depois.
  platform      text not null check (platform in ('hackernews', 'reddit', 'youtube')),
  external_id   text not null,              -- id do item NA plataforma
  url           text not null,              -- link do item original
  title         text not null,
  author        text,
  topic         text,                       -- consulta/subreddit que trouxe o item

  -- Engajamento CRU, como a plataforma devolveu. Guardado separado do
  -- score pra fórmula poder mudar sem perder o dado medido.
  points        int not null default 0,     -- upvotes / points
  comments      int not null default 0,
  published_at  timestamptz,

  -- Score normalizado 0-100 (ver src/lib/radar/score.ts). É derivado:
  -- recalculável a partir das colunas acima.
  score         int not null default 0,

  collected_at  timestamptz not null default now(),

  -- O mesmo item não entra duas vezes para o mesmo cliente. Sem client_id
  -- na chave, dois clientes do mesmo dono brigariam pelo item.
  unique (client_id, platform, external_id)
);

create index if not exists idx_viral_refs_client_score
  on viral_references (client_id, score desc);
create index if not exists idx_viral_refs_collected
  on viral_references (collected_at desc);

alter table viral_references enable row level security;

-- Mesma forma das outras tabelas do projeto: o dono enxerga o que é dele;
-- os jobs usam service_role e ignoram RLS.
drop policy if exists "dono lê suas referências" on viral_references;
create policy "dono lê suas referências"
  on viral_references for select
  using (user_id = auth.uid());

drop policy if exists "dono apaga suas referências" on viral_references;
create policy "dono apaga suas referências"
  on viral_references for delete
  using (user_id = auth.uid());
