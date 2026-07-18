-- ============================================================
-- Migration 024: remove de notification_configs as colunas de marca
-- que foram migradas para brand_kits (migration 020). A partir daqui
-- notification_configs guarda SÓ o que é per-usuário: telegram +
-- active_client_id.
--
-- Pré-condição (verificada no código antes de escrever esta migration):
-- nenhum caminho lê essas colunas de notification_configs — tudo de
-- marca vem de brand_kits do cliente ativo.
--
-- ⚠️ DESTRUTIVO e irreversível. Rode só depois de confirmar em produção
-- que a leitura por brand_kit está funcionando (o backfill da 020 já
-- copiou os valores para brand_kits).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  drop column if exists post_language,
  drop column if exists ig_handle,
  drop column if exists ig_display_name,
  drop column if exists ig_avatar_url,
  drop column if exists ig_verified,
  drop column if exists show_profile_chip,
  drop column if exists color_background,
  drop column if exists color_accent,
  drop column if exists color_text,
  drop column if exists color_keyword_box,
  drop column if exists tpl_keyword,
  drop column if exists tpl_top_text,
  drop column if exists tpl_bottom_text,
  drop column if exists tpl_cta_enabled,
  drop column if exists template_apply_mode,
  drop column if exists text_provider,
  drop column if exists image_provider,
  drop column if exists brand_name,
  drop column if exists logo_url,
  drop column if exists show_brand_logo,
  drop column if exists post_font_family,
  drop column if exists niche;

-- ------------------------------------------------------------
-- Trigger de signup: notification_configs agora recebe só user_id +
-- active_client_id (niche e brand_name vivem no brand_kit).
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

  insert into public.notification_configs (user_id, active_client_id)
  values (new.id, new_client_id)
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
