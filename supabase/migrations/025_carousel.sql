-- ============================================================
-- Migration 025: Carousel Engine — formato do post + cards.
--
-- posts.format distingue single | carousel | video. carousel_cards
-- guarda os cards ordenados de um post do tipo carousel (card 0 =
-- gancho, último = CTA). Deletar o post apaga os cards (cascade).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table posts
  add column if not exists format text not null default 'single'
    check (format in ('single', 'carousel', 'video'));

create table if not exists carousel_cards (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  idx         int  not null,                 -- ordem (0..n)
  role        text not null check (role in ('hook', 'value', 'cta')),
  headline    text,
  body        text,
  image_url   text,                          -- render final do card (PNG)
  created_at  timestamptz not null default now(),
  unique (post_id, idx)
);
create index if not exists idx_carousel_cards_post on carousel_cards (post_id, idx);

-- RLS: dono do post enxerga os cards (herda via posts). Jobs usam
-- service role e ignoram RLS.
alter table carousel_cards enable row level security;
drop policy if exists "own carousel_cards" on carousel_cards;
create policy "own carousel_cards" on carousel_cards
  for all using (
    exists (
      select 1 from posts p
      where p.id = carousel_cards.post_id and p.user_id = auth.uid()
    )
  );
