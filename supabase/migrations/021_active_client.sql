-- ============================================================
-- Migration 021: cliente ATIVO persistido por usuário.
--
-- Decisão de fan-out: o cron de 3h gera só para o cliente ATIVO de
-- cada usuário (custo 1x). O "cliente ativo" era só um cookie
-- (pp_active_client) — mas o cron não tem cookie/sessão. Então
-- persistimos o ativo no banco: notification_configs.active_client_id.
--
-- O cookie continua valendo como override rápido de UI por aba; a
-- coluna é a fonte da verdade para o cron e o fallback do app.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists active_client_id uuid references clients(id) on delete set null;

-- Backfill: ativo = cliente mais antigo do usuário (o default do 020).
update notification_configs nc
set active_client_id = (
  select c.id from clients c
  where c.owner_user_id = nc.user_id
  order by c.created_at asc
  limit 1
)
where active_client_id is null;

-- ------------------------------------------------------------
-- Trigger de signup: reordenado para já gravar active_client_id.
-- Cria o cliente PRIMEIRO (precisa do id), depois notification_configs
-- apontando pra ele, brand_kit e fontes vinculadas.
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
  -- 1. Cliente default + seu Brand Kit.
  insert into public.clients (owner_user_id, name)
  values (new.id, coalesce(nullif(trim(chosen_brand_name), ''), 'Minha Marca'))
  returning id into new_client_id;

  insert into public.brand_kits (client_id, niche, brand_name)
  values (new_client_id, chosen_niche, chosen_brand_name);

  -- 2. Config de notificação (per-usuário), já com o cliente ativo.
  insert into public.notification_configs (user_id, niche, brand_name, active_client_id)
  values (new.id, chosen_niche, chosen_brand_name, new_client_id)
  on conflict (user_id) do update set active_client_id = excluded.active_client_id;

  -- 3. Fontes padrão por nicho, vinculadas ao cliente.
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
