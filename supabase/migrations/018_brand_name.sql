-- ============================================================
-- Migration 018: nome da marca — exibido na sidebar do app (em
-- vez do genérico "Sua Marca") e usado como fallback do nome de
-- exibição do perfil quando ig_display_name ainda não foi
-- preenchido. Preenchível no cadastro e em Ajustes.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists brand_name text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen_niche text := new.raw_user_meta_data ->> 'niche';
  chosen_brand_name text := new.raw_user_meta_data ->> 'brand_name';
begin
  insert into public.notification_configs (user_id, niche, brand_name)
  values (new.id, chosen_niche, chosen_brand_name)
  on conflict (user_id) do nothing;

  if chosen_niche = 'marketing' then
    insert into public.source_configs (user_id, name, feed_url, threshold)
    values
      (new.id, 'Marketing Land', 'https://martech.org/feed/', 70),
      (new.id, 'Social Media Today', 'https://www.socialmediatoday.com/feeds/news/', 70),
      (new.id, 'Neil Patel Blog', 'https://neilpatel.com/feed/', 70)
    on conflict (user_id, feed_url) do nothing;
  elsif chosen_niche = 'financas' then
    insert into public.source_configs (user_id, name, feed_url, threshold)
    values
      (new.id, 'InfoMoney', 'https://www.infomoney.com.br/feed/', 70),
      (new.id, 'Valor Investe', 'https://valorinveste.globo.com/rss/valor-investe/', 70)
    on conflict (user_id, feed_url) do nothing;
  elsif chosen_niche = 'saude' then
    insert into public.source_configs (user_id, name, feed_url, threshold)
    values
      (new.id, 'Saúde Abril', 'https://saude.abril.com.br/feed/', 70),
      (new.id, 'CNN Saúde', 'https://www.cnnbrasil.com.br/saude/feed/', 70)
    on conflict (user_id, feed_url) do nothing;
  elsif chosen_niche = 'games' then
    insert into public.source_configs (user_id, name, feed_url, threshold)
    values
      (new.id, 'IGN Brasil', 'https://br.ign.com/feed.xml', 70),
      (new.id, 'The Enemy', 'https://www.theenemy.com.br/rss', 70)
    on conflict (user_id, feed_url) do nothing;
  else
    insert into public.source_configs (user_id, name, feed_url, threshold)
    values
      (new.id, 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 70),
      (new.id, 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 70),
      (new.id, 'VentureBeat AI', 'https://venturebeat.com/category/ai/feed/', 70),
      (new.id, 'Hacker News (front)', 'https://hnrss.org/frontpage', 75)
    on conflict (user_id, feed_url) do nothing;
  end if;

  return new;
end;
$$;
