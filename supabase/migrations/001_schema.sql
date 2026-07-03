-- ============================================================
-- PostPilot AI — Schema inicial (MVP Plano B)
-- Rodar no SQL Editor do Supabase (ou via supabase db push)
-- ============================================================

-- Extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

-- Status da notícia no funil de triagem
create type news_status as enum (
  'new',        -- recém coletada, aguardando triagem
  'scored',     -- triada pela IA, aguardando decisão (vira candidato ou não)
  'candidate',  -- passou do threshold → vai gerar post
  'discarded'   -- abaixo do threshold ou duplicada
);

-- Status do post. 'scheduled' e 'published' já reservados para a
-- Fase 2 (Graph API) — sem migração estrutural depois.
create type post_status as enum (
  'draft',             -- gerado, ainda processando imagem
  'pending_approval',  -- pronto, aguardando aprovação do usuário
  'approved',          -- aprovado → tela "post pronto"
  'discarded',         -- descartado pelo usuário
  'scheduled',         -- Fase 2: agendado para publicação automática
  'published'          -- Fase 2: publicado via Graph API
);

-- ------------------------------------------------------------
-- TABELAS
-- ------------------------------------------------------------

-- Fontes RSS monitoradas por usuário
create table source_configs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,                 -- ex: "TechCrunch AI"
  feed_url    text not null,                 -- URL do feed RSS
  threshold   int  not null default 70,      -- score mínimo (0-100) para virar candidato
  enabled     boolean not null default true, -- permite pausar uma fonte sem apagar
  created_at  timestamptz not null default now(),
  unique (user_id, feed_url)                 -- evita cadastrar o mesmo feed 2x
);

-- Configuração de notificação (Telegram) por usuário
create table notification_configs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  telegram_chat_id text,                     -- chat_id do usuário no bot
  notify_on_candidate boolean not null default true, -- avisar quando houver post p/ aprovar
  created_at      timestamptz not null default now(),
  unique (user_id)                           -- 1 config por usuário
);

-- Notícias coletadas dos feeds
create table news_items (
  id             uuid primary key default gen_random_uuid(),
  source_id      uuid not null references source_configs(id) on delete cascade,
  url            text not null,
  title          text not null,
  summary        text,                       -- resumo/descrição vinda do feed
  published_at   timestamptz,                -- data de publicação da notícia
  viral_score    int,                        -- 0-100, atribuído pelo Haiku
  score_reason   text,                       -- justificativa curta da IA (debug/feedback)
  status         news_status not null default 'new',
  created_at     timestamptz not null default now(),
  unique (source_id, url)                    -- deduplicação por fonte
);

-- Posts gerados a partir de notícias candidatas
create table posts (
  id             uuid primary key default gen_random_uuid(),
  news_item_id   uuid not null references news_items(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  hook           text not null,              -- frase de impacto (headline do post)
  caption        text not null,              -- legenda completa
  hashtags       text not null,              -- hashtags separadas por espaço
  image_prompt   text not null,              -- prompt usado na geração da arte
  image_url      text,                       -- URL da imagem final no Supabase Storage
  status         post_status not null default 'draft',
  approved_at    timestamptz,                -- quando foi aprovado
  -- Campos reservados para a Fase 2 (Graph API) — já existem para
  -- evitar migração estrutural depois:
  scheduled_for  timestamptz,                -- quando publicar (Fase 2)
  ig_media_id    text,                       -- id retornado pela Graph API (Fase 2)
  created_at     timestamptz not null default now()
);

-- Índices para as consultas mais comuns
create index idx_news_items_status on news_items (status);
create index idx_posts_status on posts (user_id, status);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Jobs de backend usam a service_role key (ignora RLS).
-- O app (usuário logado) só enxerga os próprios dados.
-- ------------------------------------------------------------

alter table source_configs enable row level security;
alter table notification_configs enable row level security;
alter table news_items enable row level security;
alter table posts enable row level security;

create policy "own source_configs" on source_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own notification_configs" on notification_configs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- news_items não tem user_id direto — herda via source_configs
create policy "own news_items" on news_items
  for all using (
    exists (
      select 1 from source_configs s
      where s.id = news_items.source_id and s.user_id = auth.uid()
    )
  );

create policy "own posts" on posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- STORAGE: bucket público para as artes dos posts
-- (público = URL direta para download/preview; sem dados sensíveis)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Apenas service_role escreve no bucket (jobs de geração).
-- Leitura é pública (bucket public), escrita não tem policy para
-- usuários comuns — proposital.
