-- ============================================================
-- Migration 049 — vídeo GERADO (Sprint D): o roteiro vira coluna do post.
--
-- Até aqui todo vídeo vinha de upload manual: o arquivo era a única
-- verdade e não havia nada a guardar. O vídeo do Sprint D nasce de um
-- ROTEIRO (`src/lib/ai/video-script.ts`: gancho + 2-4 beats com duração +
-- CTA), e sem guardar esse roteiro qualquer re-render exigiria chamar a
-- IA de novo — pagando outra vez por um texto que já tínhamos e
-- devolvendo um resultado DIFERENTE do que a pessoa aprovou.
--
-- `video_origin` separa os dois caminhos pra sempre. Sem ele não dá pra
-- responder "esse vídeo veio da máquina ou da pessoa?" nem no debug nem
-- na conta de custo — e os dois gravam no MESMO arquivo do Storage
-- (`{post_id}-video-source.mp4`), então o Storage não conta essa
-- história. O job gerador escreve 'generated'; o upload manual não mexe
-- na coluna e fica no default.
--
-- DEFAULT 'upload': todo post de vídeo que já existe veio de upload, e é
-- isso que o default grava nas linhas antigas.
--
-- Rodar no SQL Editor do Supabase.
-- Aplicada em produção em 2026-07-30.
-- ============================================================

alter table public.posts
  add column if not exists video_script jsonb,
  add column if not exists video_origin text not null default 'upload';

-- CHECK em bloco separado, e não junto do ADD COLUMN: `add constraint`
-- não aceita `if not exists` no Postgres do Supabase, então rodar a
-- migration duas vezes estouraria por constraint duplicada — e a 049 é
-- justamente uma que se cola de novo no SQL Editor quando dá dúvida se
-- passou.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_video_origin_check'
  ) then
    alter table public.posts
      add constraint posts_video_origin_check
      check (video_origin in ('upload', 'generated'));
  end if;
end $$;

comment on column public.posts.video_script is
  'Roteiro do vídeo gerado (VideoScript: hook, beats[], cta, caption, hashtags, totalSeconds). Null em vídeo de upload.';
comment on column public.posts.video_origin is
  'upload = arquivo enviado pela pessoa; generated = montado pelo generate-video-post (Sprint D).';

-- Conferência: as duas colunas existem? (o SQL Editor mostra a MESMA
-- mensagem "Success. No rows returned" pra DDL que funcionou e pra select
-- vazio, então a checagem tem que devolver linha sempre — count devolve).
select
  count(*) filter (where column_name = 'video_script')  as tem_script,
  count(*) filter (where column_name = 'video_origin') as tem_origin
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posts'
  and column_name in ('video_script', 'video_origin');
