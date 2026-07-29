-- ============================================================
-- Migration 048 — foto de FUNDO por post (e o véu por cima dela).
--
-- Motivo de existir em vez de reusar `base_image_url`: naquele campo o
-- attach-video já grava o PÔSTER do vídeo, que serve pra medir contraste
-- — não é uma foto que a pessoa escolheu. Usar a mesma coluna pras duas
-- coisas fazia o pôster virar fundo sem ninguém pedir, e a foto escolhida
-- ser sobrescrita no próximo upload de vídeo.
--
-- `bg_image_url` é a foto ESCOLHIDA (Storage: `{postId}-bg.jpg`), e
-- `bg_image_luminance` é a grade medida no upload — mesma matemática de
-- contraste do resto do pipeline, medida uma vez só.
--
-- `bg_overlay` decide o véu de leitura por cima da foto:
--   'auto' (padrão) = só escurece/clareia quando o contraste exige;
--   'on'            = sempre aplica, pra quem quer a foto mais discreta;
--   'off'           = nunca aplica, pra foto que já é fundo limpo.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists bg_image_url text,
  add column if not exists bg_image_luminance jsonb,
  add column if not exists bg_overlay text not null default 'auto';

alter table public.posts
  drop constraint if exists posts_bg_overlay_check;

alter table public.posts
  add constraint posts_bg_overlay_check
  check (bg_overlay in ('auto', 'on', 'off'));

comment on column public.posts.bg_image_url is
  'Foto de fundo escolhida pra ESTE post. NULL = fundo é a cor (bg_mode/bg_color).';
comment on column public.posts.bg_overlay is
  'Véu de leitura sobre a foto: auto (só quando precisa), on, off.';
