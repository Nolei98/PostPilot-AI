-- Sprint C — métricas reais coletadas via Graph API (24h/72h depois de
-- publicar) + campo de erro de publicação (mesmo padrão de video_error:
-- falha não derruba o post, só fica visível pra retry/depuração).
alter table public.posts
  add column if not exists publish_error text;

create table if not exists public.post_metrics (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  collected_at  timestamptz not null default now(),
  metric_window text not null check (metric_window in ('24h', '72h')),
  reach         integer,
  saved         integer,
  shares        integer,
  likes         integer,
  comments      integer
);
create index if not exists idx_post_metrics_post on public.post_metrics (post_id);

alter table public.post_metrics enable row level security;
drop policy if exists "own post metrics" on public.post_metrics;
create policy "own post metrics" on public.post_metrics
  for all using (
    exists (
      select 1 from public.posts p
      join public.clients c on c.id = p.client_id
      where p.id = post_metrics.post_id and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      join public.clients c on c.id = p.client_id
      where p.id = post_metrics.post_id and c.owner_user_id = auth.uid()
    )
  );
