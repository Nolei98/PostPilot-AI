-- ============================================================
-- Migration 050 — o título sobre o vídeo vira escolha do post.
--
-- No Reels o quadro INTEIRO é o vídeo, e por cima dele o render carimba
-- divisor + wordmark + título (buildReelsVideoOverlayPng). Isso é bom
-- quando o vídeo é b-roll silencioso e o título carrega a mensagem — e
-- atrapalha quando o vídeo JÁ tem texto próprio (legenda queimada,
-- captions do criador, tela gravada), porque viram dois textos brigando
-- pelo mesmo rodapé.
--
-- 'on'  = comportamento de sempre (título + marca sobre o vídeo);
-- 'off' = vídeo limpo, sem texto nenhum do render por cima.
--
-- DEFAULT 'on': é o que todo post de vídeo já faz hoje. Ninguém pode
-- acordar com a marca sumida da arte por causa de uma migration.
--
-- Vale só para Reels/9:16. No feed 4:5 o texto mora em faixa PRÓPRIA,
-- fora da moldura do vídeo — lá nunca houve sobreposição pra resolver.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists video_title_mode text not null default 'on';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'posts_video_title_mode_check'
  ) then
    alter table public.posts
      add constraint posts_video_title_mode_check
      check (video_title_mode in ('on', 'off'));
  end if;
end $$;

comment on column public.posts.video_title_mode is
  'Reels: on = título+marca carimbados sobre o vídeo; off = vídeo limpo. Não afeta o feed 4:5.';

-- Conferência (devolve linha sempre — "Success. No rows returned" não
-- distingue DDL que passou de select vazio).
select count(*) as tem_coluna
from information_schema.columns
where table_schema = 'public'
  and table_name = 'posts'
  and column_name = 'video_title_mode';
