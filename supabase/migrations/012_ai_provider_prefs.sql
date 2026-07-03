-- ============================================================
-- Migration 012: escolha de provider de IA (texto e imagem) por
-- usuário, configurável em Ajustes. Default 'gemini'/'gemini' (AI
-- Studio) — inclusive faz backfill nas linhas existentes.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table notification_configs
  add column if not exists text_provider text not null default 'gemini'
    check (text_provider in ('claude', 'gemini')),
  add column if not exists image_provider text not null default 'gemini'
    check (image_provider in ('fal', 'gemini'));
