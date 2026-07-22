-- Sprint C — conexão OAuth com rede social por cliente (Graph API).
-- Genérico por `platform` pensando no TikTok (Sprint D) reusar a mesma
-- tabela depois. Token fica cifrado em repouso (src/lib/crypto-secrets.ts)
-- — primeiro segredo por tenant guardado no banco (antes só existia como
-- env var global). RLS espelha exatamente o padrão de brand_kits (020).
create table if not exists public.social_connections (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null unique references public.clients(id) on delete cascade,
  platform                 text not null default 'instagram' check (platform in ('instagram')),
  access_token             text not null,
  ig_business_account_id   text,
  ig_username              text,
  facebook_page_id         text,
  token_expires_at         timestamptz,
  status                   text not null default 'connected'
    check (status in ('connected', 'error', 'disconnected')),
  connected_at             timestamptz not null default now()
);
create index if not exists idx_social_connections_client on public.social_connections (client_id);

alter table public.social_connections enable row level security;
drop policy if exists "own social connections" on public.social_connections;
create policy "own social connections" on public.social_connections
  for all using (
    exists (select 1 from public.clients c
            where c.id = social_connections.client_id and c.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.clients c
            where c.id = social_connections.client_id and c.owner_user_id = auth.uid())
  );
