-- ============================================================
-- Migration 027 (Sprint B+, TAREFA B6): identidade de rótulo/tipografia
-- no Brand Kit, para os templates estilo @0verlens.
--
-- Reusa brand_kits.ig_handle como o "handle" do rótulo (não duplica).
-- Adiciona só o que é novo: keywords, wordmark, fonte da headline e os
-- defaults de layout (template_defaults, contrato em HANDOFF-overlens-
-- template.md seção 5).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table brand_kits
  add column if not exists keywords text[],                 -- {DESIGN, ARTE, TECH}
  add column if not exists wordmark text,                   -- OVERLENS® (divisor da capa)
  add column if not exists font_heading_url text,           -- .woff/.ttf p/ embutir no Satori
  add column if not exists brand_mark text not null default 'auto'
    check (brand_mark in ('wordmark', 'handle', 'icon', 'wordmark+handle', 'none', 'auto')),
  add column if not exists template_defaults jsonb not null default '{}'::jsonb;
