-- ============================================================
-- Seed: fontes RSS iniciais + config de notificação.
-- 1. Crie seu usuário no Supabase (Authentication → Users)
-- 2. Copie o UUID do usuário e substitua abaixo
-- 3. Rode no SQL Editor
-- ============================================================

-- ⚠️ SUBSTITUA pelo UUID do seu usuário:
-- (Authentication → Users → clique no usuário → copie o ID)
do $$
declare
  my_user uuid := '67e99084-7ecd-4acf-aa7d-03b87fbe34bd';
begin
  insert into source_configs (user_id, name, feed_url, threshold) values
    (my_user, 'TechCrunch AI',        'https://techcrunch.com/category/artificial-intelligence/feed/', 70),
    (my_user, 'The Verge AI',         'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 70),
    (my_user, 'Hacker News (front)',  'https://hnrss.org/frontpage', 75),
    (my_user, 'VentureBeat AI',       'https://venturebeat.com/category/ai/feed/', 70)
  on conflict (user_id, feed_url) do nothing;

  insert into notification_configs (user_id, telegram_chat_id)
  values (my_user, null)
  on conflict (user_id) do nothing;
end $$;
