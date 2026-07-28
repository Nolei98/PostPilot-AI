-- ============================================================
-- Migration 043 — cor do WORDMARK por post.
--
-- O wordmark (o `——— MARCA® ———` da capa e a assinatura de marca dos
-- outros layouts) sempre saiu na cor de REALCE do Brand Kit. Em fundo
-- claro, ou quando o realce é muito saturado, ele briga com o título em
-- vez de acompanhá-lo.
--
-- mark_mode:
--   'accent' — realce do Brand Kit (default; nada muda pra quem já existe)
--   'title'  — mesma cor do título, seja ela qual for depois que o fundo
--              do post (migration 042) foi resolvido
--   'custom' — cor livre (mark_color)
--
-- Congela na aprovação junto do render_spec, como o resto da arte.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists mark_mode text not null default 'accent'
    check (mark_mode in ('accent', 'title', 'custom')),
  add column if not exists mark_color text
    check (mark_color is null or mark_color ~* '^#[0-9a-f]{6}$');
