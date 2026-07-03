-- ============================================================
-- Migration 004: chip de perfil no topo dos slides.
-- ig_verified: selo azul ao lado do nome.
-- show_profile_chip: liga/desliga o chip na arte (default ON).
-- Defaults preservam usuários/posts existentes.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists ig_verified boolean not null default false,
  add column if not exists show_profile_chip boolean not null default true;
