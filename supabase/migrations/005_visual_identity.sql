-- ============================================================
-- Migration 005: identidade visual da arte.
-- Defaults globais em notification_configs (Ajustes) +
-- overrides por post em posts (não alteram o default).
-- Defaults preservam usuários/posts existentes.
-- Rodar no SQL Editor do Supabase.
-- ============================================================

-- ---- Defaults globais (Ajustes) ----------------------------
alter table notification_configs
  add column if not exists color_background   text not null default '#0B0B12',
  add column if not exists color_accent       text not null default '#7C5CFF',
  add column if not exists color_text         text not null default '#FFFFFF',
  add column if not exists color_keyword_box  text not null default '#7C5CFF',
  add column if not exists tpl_keyword        text not null default 'IA',
  add column if not exists tpl_top_text       text not null default 'A NOVIDADE DE',
  add column if not exists tpl_bottom_text    text not null default 'QUE MUDA TUDO',
  -- 'all' = aplica em todos os posts | 'on_approval' = só quando marcado
  add column if not exists template_apply_mode text not null default 'all'
    check (template_apply_mode in ('all', 'on_approval'));

-- ---- Overrides por post ------------------------------------
-- Nulos = post sem template aplicado (comportamento antigo).
alter table posts
  add column if not exists template_applied     boolean not null default false,
  add column if not exists tpl_keyword          text,
  add column if not exists tpl_top_text         text,
  add column if not exists tpl_bottom_text      text,
  add column if not exists tpl_color_background text,
  add column if not exists tpl_color_accent     text,
  add column if not exists tpl_color_text       text,
  add column if not exists tpl_color_keyword_box text;
