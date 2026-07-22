-- Variação de conteúdo da página 1 do post único (kit v2 §3) — ortogonal
-- ao layout_preset (que decide a tipografia/estrutura). "cover" = estilo
-- capa do carrossel (wordmark + título). "centered" = fonte no meio,
-- minimalista, sem wordmark.
alter table public.brand_kits
  add column if not exists single_post_style text not null default 'cover';
