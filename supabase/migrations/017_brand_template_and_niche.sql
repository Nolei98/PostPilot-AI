-- ============================================================
-- Migration 017: Template de marca (logo + fonte dos posts) e
-- nicho do usuário (escolhido no cadastro, editável em Ajustes).
--
-- O nicho também define as fontes RSS padrão semeadas no cadastro
-- (handle_new_user) — cai no set genérico de IA se não houver
-- correspondência ou o usuário não tiver escolhido nenhum.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists logo_url text,
  add column if not exists post_font_family text not null default 'Inter',
  add column if not exists niche text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  chosen_niche text := new.raw_user_meta_data ->> 'niche';
begin
  -- Config default (todas as colunas têm default — só o user_id basta)
  insert into public.notification_configs (user_id, niche)
  values (new.id, chosen_niche)
  on conflict (user_id) do nothing;

  -- Fontes padrão: curadas por nicho quando reconhecido, senão o
  -- set genérico de tecnologia/IA (comportamento original).
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
    -- Default original: tecnologia / IA
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
