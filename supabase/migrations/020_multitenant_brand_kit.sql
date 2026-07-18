-- ============================================================
-- Migration 020: multi-tenant + Brand Kit por cliente.
--
-- Introduz o conceito de CLIENTE (tenant). Um usuário (dono) pode
-- ter N clientes; cada cliente tem 1 Brand Kit com toda a config
-- de conteúdo/marca/perfil/providers (o que antes era per-usuário
-- em notification_configs). notification_configs continua existindo
-- e per-usuário (telegram) — este PR NÃO dropa colunas antigas, só
-- ADD + COPY, para o código atual não quebrar no deploy. O drop das
-- colunas migradas vem num PR posterior, após verificação.
--
-- Isolamento: a RLS existente (por user_id) NÃO é alterada — ela
-- garante que um usuário só vê os próprios dados. client_id é um
-- filtro DENTRO dos dados do próprio usuário (qual marca). Assim o
-- multi-tenant não mexe nas policies de source_configs/posts/
-- news_items — reduz risco.
--
-- subscriptions continua per-usuário (o dono paga o plano, que
-- cobre todos os clientes dele) — não recebe client_id.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. CLIENTES (tenants)
-- ------------------------------------------------------------
create table if not exists clients (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_clients_owner on clients (owner_user_id);

alter table clients enable row level security;
drop policy if exists "own clients" on clients;
create policy "own clients" on clients
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. BRAND KIT (config de conteúdo/marca por cliente)
--    Espelha as colunas de conteúdo que hoje vivem em
--    notification_configs. Defaults mirram os atuais; o backfill
--    (passo 4) copia os valores reais de cada usuário.
-- ------------------------------------------------------------
create table if not exists brand_kits (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null unique references clients(id) on delete cascade,
  -- geração
  post_language       text not null default 'pt-BR',
  text_provider       text not null default 'gemini',
  image_provider      text not null default 'gemini',
  niche               text,
  -- perfil IG exibido nas artes
  ig_handle           text not null default 'seuperfil.ia',
  ig_display_name     text not null default 'Seu Perfil de IA',
  ig_avatar_url       text,
  ig_verified         boolean not null default false,
  show_profile_chip   boolean not null default true,
  -- identidade visual (contra-capa)
  color_background    text not null default '#0B0B12',
  color_accent        text not null default '#7C5CFF',
  color_text          text not null default '#FFFFFF',
  color_keyword_box   text not null default '#7C5CFF',
  tpl_keyword         text not null default 'IA',
  tpl_top_text        text not null default 'A NOVIDADE DE',
  tpl_bottom_text     text not null default 'QUE MUDA TUDO',
  tpl_cta_enabled     boolean not null default true,
  template_apply_mode text not null default 'all'
    check (template_apply_mode in ('all', 'on_approval')),
  -- template da marca (logo + fonte + nome)
  brand_name          text,
  logo_url            text,
  show_brand_logo     boolean not null default true,
  post_font_family    text not null default 'Inter',
  created_at          timestamptz not null default now()
);
create index if not exists idx_brand_kits_client on brand_kits (client_id);

alter table brand_kits enable row level security;
drop policy if exists "own brand kits" on brand_kits;
create policy "own brand kits" on brand_kits
  for all using (
    exists (select 1 from clients c
            where c.id = brand_kits.client_id and c.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from clients c
            where c.id = brand_kits.client_id and c.owner_user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 3. client_id nas tabelas de conteúdo (nullable por enquanto)
-- ------------------------------------------------------------
alter table source_configs add column if not exists client_id uuid references clients(id) on delete cascade;
alter table posts          add column if not exists client_id uuid references clients(id) on delete cascade;
alter table news_items     add column if not exists client_id uuid references clients(id) on delete cascade;
alter table scan_runs      add column if not exists client_id uuid references clients(id) on delete cascade;

-- ------------------------------------------------------------
-- 4. BACKFILL — 1 cliente por usuário existente, migra a config
-- ------------------------------------------------------------
-- 4a. cria 1 cliente por usuário que tenha qualquer dado.
--     nome = brand_name (se houver) senão 'Minha Marca'.
insert into clients (owner_user_id, name)
select u.uid, coalesce(nullif(trim(nc.brand_name), ''), 'Minha Marca')
from (
  select user_id as uid from notification_configs
  union select user_id from source_configs
  union select user_id from posts
  union select user_id from subscriptions
) u
left join notification_configs nc on nc.user_id = u.uid
where not exists (select 1 from clients c where c.owner_user_id = u.uid);

-- 4b. cria o brand_kit de cada cliente, copiando de notification_configs
--     (coalesce p/ defaults quando o usuário não tiver a linha).
insert into brand_kits (
  client_id, post_language, text_provider, image_provider, niche,
  ig_handle, ig_display_name, ig_avatar_url, ig_verified, show_profile_chip,
  color_background, color_accent, color_text, color_keyword_box,
  tpl_keyword, tpl_top_text, tpl_bottom_text, tpl_cta_enabled, template_apply_mode,
  brand_name, logo_url, show_brand_logo, post_font_family
)
select
  c.id,
  coalesce(nc.post_language, 'pt-BR'),
  coalesce(nc.text_provider, 'gemini'),
  coalesce(nc.image_provider, 'gemini'),
  nc.niche,
  coalesce(nc.ig_handle, 'seuperfil.ia'),
  coalesce(nc.ig_display_name, 'Seu Perfil de IA'),
  nc.ig_avatar_url,
  coalesce(nc.ig_verified, false),
  coalesce(nc.show_profile_chip, true),
  coalesce(nc.color_background, '#0B0B12'),
  coalesce(nc.color_accent, '#7C5CFF'),
  coalesce(nc.color_text, '#FFFFFF'),
  coalesce(nc.color_keyword_box, '#7C5CFF'),
  coalesce(nc.tpl_keyword, 'IA'),
  coalesce(nc.tpl_top_text, 'A NOVIDADE DE'),
  coalesce(nc.tpl_bottom_text, 'QUE MUDA TUDO'),
  coalesce(nc.tpl_cta_enabled, true),
  coalesce(nc.template_apply_mode, 'all'),
  nc.brand_name,
  nc.logo_url,
  coalesce(nc.show_brand_logo, true),
  coalesce(nc.post_font_family, 'Inter')
from clients c
left join notification_configs nc on nc.user_id = c.owner_user_id
where not exists (select 1 from brand_kits bk where bk.client_id = c.id);

-- 4c. carimba client_id nas linhas existentes (1 cliente por usuário).
update source_configs sc set client_id = c.id
  from clients c where c.owner_user_id = sc.user_id and sc.client_id is null;

update posts p set client_id = c.id
  from clients c where c.owner_user_id = p.user_id and p.client_id is null;

update scan_runs sr set client_id = c.id
  from clients c where c.owner_user_id = sr.requested_by and sr.client_id is null;

-- news_items herda o cliente da fonte
update news_items ni set client_id = sc.client_id
  from source_configs sc where sc.id = ni.source_id and ni.client_id is null;

-- ------------------------------------------------------------
-- 5. Torna client_id obrigatório onde faz sentido (após backfill)
--    scan_runs fica nullable (requested_by pode ser null / legado).
-- ------------------------------------------------------------
alter table source_configs alter column client_id set not null;
alter table posts          alter column client_id set not null;
alter table news_items     alter column client_id set not null;

create index if not exists idx_source_configs_client on source_configs (client_id);
create index if not exists idx_posts_client on posts (client_id, status);
create index if not exists idx_news_items_client on news_items (client_id);

-- ------------------------------------------------------------
-- 6. Trigger de signup: cria cliente + brand_kit + fontes já
--    vinculadas ao cliente. Baseado na versão da migration 018,
--    estendida com client/brand_kit.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen_niche text := new.raw_user_meta_data ->> 'niche';
  chosen_brand_name text := new.raw_user_meta_data ->> 'brand_name';
  new_client_id uuid;
begin
  -- Config de notificação (per-usuário) — mantida como antes.
  insert into public.notification_configs (user_id, niche, brand_name)
  values (new.id, chosen_niche, chosen_brand_name)
  on conflict (user_id) do nothing;

  -- Cliente default do usuário + seu Brand Kit.
  insert into public.clients (owner_user_id, name)
  values (new.id, coalesce(nullif(trim(chosen_brand_name), ''), 'Minha Marca'))
  returning id into new_client_id;

  insert into public.brand_kits (client_id, niche, brand_name)
  values (new_client_id, chosen_niche, chosen_brand_name);

  -- Fontes padrão por nicho, já vinculadas ao cliente.
  if chosen_niche = 'marketing' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'Marketing Land', 'https://martech.org/feed/', 70),
      (new.id, new_client_id, 'Social Media Today', 'https://www.socialmediatoday.com/feeds/news/', 70),
      (new.id, new_client_id, 'Neil Patel Blog', 'https://neilpatel.com/feed/', 70)
    on conflict (user_id, feed_url) do nothing;
  elsif chosen_niche = 'financas' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'InfoMoney', 'https://www.infomoney.com.br/feed/', 70),
      (new.id, new_client_id, 'Valor Investe', 'https://valorinveste.globo.com/rss/valor-investe/', 70)
    on conflict (user_id, feed_url) do nothing;
  elsif chosen_niche = 'saude' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'Saúde Abril', 'https://saude.abril.com.br/feed/', 70),
      (new.id, new_client_id, 'CNN Saúde', 'https://www.cnnbrasil.com.br/saude/feed/', 70)
    on conflict (user_id, feed_url) do nothing;
  elsif chosen_niche = 'games' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'IGN Brasil', 'https://br.ign.com/feed.xml', 70),
      (new.id, new_client_id, 'The Enemy', 'https://www.theenemy.com.br/rss', 70)
    on conflict (user_id, feed_url) do nothing;
  else
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 70),
      (new.id, new_client_id, 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 70),
      (new.id, new_client_id, 'VentureBeat AI', 'https://venturebeat.com/category/ai/feed/', 70),
      (new.id, new_client_id, 'Hacker News (front)', 'https://hnrss.org/frontpage', 75)
    on conflict (user_id, feed_url) do nothing;
  end if;

  return new;
end;
$$;
