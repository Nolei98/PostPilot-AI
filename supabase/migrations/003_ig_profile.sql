-- ============================================================
-- Migration 003: perfil do Instagram exibido nos posts
-- (foto, nome e @) — configurável em Ajustes.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists ig_handle text not null default 'seuperfil.ia',
  add column if not exists ig_display_name text not null default 'Seu Perfil de IA',
  add column if not exists ig_avatar_url text;

-- Bucket público para a foto de perfil.
-- O upload é feito pelo servidor (service role, ignora RLS) —
-- não são necessárias policies de storage para usuários comuns.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
