-- ============================================================
-- Migration 022: uniques corrigidas para multi-tenant.
--
-- (1) source_configs: a unique era (user_id, feed_url) — impedia um
--     mesmo usuário de ter o MESMO feed em dois clientes diferentes.
--     Passa a ser (client_id, feed_url): a dedup de fonte é por
--     cliente (tenant), não por dono.
--
-- (2) posts: garante idempotência a nível de banco — no máximo 1 post
--     por (client_id, news_item_id). news_items já é o "item de fonte"
--     deduplicado por (source_id, url) e é per-client (herda client_id
--     da fonte), então reprocessar a mesma notícia nunca gera post
--     duplicado (além do check que generate-post já faz).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

-- (1) source_configs: troca a unique de (user_id) para (client_id)
alter table source_configs
  drop constraint if exists source_configs_user_id_feed_url_key;
alter table source_configs
  add constraint source_configs_client_feed_key unique (client_id, feed_url);

-- (2) posts: idempotência por (cliente × notícia)
create unique index if not exists posts_client_news_item_uniq
  on posts (client_id, news_item_id);

-- ------------------------------------------------------------
-- Trigger de signup: mesma lógica da 021, mas o ON CONFLICT das
-- fontes agora usa (client_id, feed_url) — a unique antiga não existe
-- mais, então o conflito precisa referenciar a nova.
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
  insert into public.clients (owner_user_id, name)
  values (new.id, coalesce(nullif(trim(chosen_brand_name), ''), 'Minha Marca'))
  returning id into new_client_id;

  insert into public.brand_kits (client_id, niche, brand_name)
  values (new_client_id, chosen_niche, chosen_brand_name);

  insert into public.notification_configs (user_id, niche, brand_name, active_client_id)
  values (new.id, chosen_niche, chosen_brand_name, new_client_id)
  on conflict (user_id) do update set active_client_id = excluded.active_client_id;

  if chosen_niche = 'marketing' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'Marketing Land', 'https://martech.org/feed/', 70),
      (new.id, new_client_id, 'Social Media Today', 'https://www.socialmediatoday.com/feeds/news/', 70),
      (new.id, new_client_id, 'Neil Patel Blog', 'https://neilpatel.com/feed/', 70)
    on conflict (client_id, feed_url) do nothing;
  elsif chosen_niche = 'financas' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'InfoMoney', 'https://www.infomoney.com.br/feed/', 70),
      (new.id, new_client_id, 'Valor Investe', 'https://valorinveste.globo.com/rss/valor-investe/', 70)
    on conflict (client_id, feed_url) do nothing;
  elsif chosen_niche = 'saude' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'Saúde Abril', 'https://saude.abril.com.br/feed/', 70),
      (new.id, new_client_id, 'CNN Saúde', 'https://www.cnnbrasil.com.br/saude/feed/', 70)
    on conflict (client_id, feed_url) do nothing;
  elsif chosen_niche = 'games' then
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'IGN Brasil', 'https://br.ign.com/feed.xml', 70),
      (new.id, new_client_id, 'The Enemy', 'https://www.theenemy.com.br/rss', 70)
    on conflict (client_id, feed_url) do nothing;
  else
    insert into public.source_configs (user_id, client_id, name, feed_url, threshold)
    values
      (new.id, new_client_id, 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 70),
      (new.id, new_client_id, 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 70),
      (new.id, new_client_id, 'VentureBeat AI', 'https://venturebeat.com/category/ai/feed/', 70),
      (new.id, new_client_id, 'Hacker News (front)', 'https://hnrss.org/frontpage', 75)
    on conflict (client_id, feed_url) do nothing;
  end if;

  return new;
end;
$$;
