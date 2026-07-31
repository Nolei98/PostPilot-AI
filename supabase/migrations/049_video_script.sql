-- ============================================================
-- 049 — Vídeo GERADO (Sprint D): o roteiro vira coluna do post.
--
-- Até aqui todo vídeo vinha de upload manual: o arquivo era a única
-- verdade e não havia nada a guardar. O vídeo do Sprint D nasce de um
-- ROTEIRO (video-script.ts: gancho + 2-4 beats com duração + CTA), e sem
-- guardar esse roteiro qualquer re-render exigiria chamar a IA de novo —
-- pagando outra vez por um texto que já tínhamos, e devolvendo um
-- resultado DIFERENTE do que a pessoa aprovou.
--
-- video_origin separa os dois caminhos pra sempre. Sem ele não dá pra
-- responder "esse vídeo veio da máquina ou da pessoa?" nem no debug nem
-- na conta de custo — e os dois caminhos gravam no MESMO arquivo
-- (`{post_id}-video-source.mp4`), então o Storage não conta essa
-- história.
--
-- Default 'upload': todo post de vídeo que já existe veio de upload, e é
-- isso que o backfill implícito do default grava.
-- ============================================================

alter table posts
  add column if not exists video_script jsonb,
  add column if not exists video_origin text not null default 'upload';

-- CHECK separado do ADD COLUMN: rodar a migration duas vezes não pode
-- estourar por constraint duplicada (o `if not exists` da coluna já é
-- idempotente, o da constraint não existe em Postgres < 16).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_video_origin_check'
  ) then
    alter table posts
      add constraint posts_video_origin_check
      check (video_origin in ('upload', 'generated'));
  end if;
end $$;

comment on column posts.video_script is
  'Roteiro do vídeo gerado (VideoScript: hook, beats[], cta, totalSeconds). Null em vídeo de upload.';
comment on column posts.video_origin is
  'upload = arquivo enviado pela pessoa; generated = montado pelo generate-video-post (Sprint D).';
