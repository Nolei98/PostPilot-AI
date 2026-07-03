-- ============================================================
-- Migration 010: onboarding automático de usuário novo.
--
-- Problema: quem cria conta chega num app VAZIO (sem config, sem
-- fontes, fila vazia) e vai embora. Este trigger roda no signup e
-- deixa tudo pronto: config default + 4 fontes de notícias de IA.
-- O primeiro scan é disparado pelo app na primeira visita à fila
-- (componente FirstScanKickoff) — em ~10 min o usuário novo já tem
-- posts para aprovar.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Config default (todas as colunas têm default — só o user_id basta)
  insert into public.notification_configs (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Fontes padrão de notícias de IA (as mesmas do seed original)
  insert into public.source_configs (user_id, name, feed_url, threshold)
  values
    (new.id, 'TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/feed/', 70),
    (new.id, 'The Verge AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 70),
    (new.id, 'VentureBeat AI', 'https://venturebeat.com/category/ai/feed/', 70),
    (new.id, 'Hacker News (front)', 'https://hnrss.org/frontpage', 75)
  on conflict (user_id, feed_url) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
