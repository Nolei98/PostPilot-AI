-- Vídeo anexado a um CARD do carrossel (kit v2, exemplo-modelos-com-
-- video.png caso "interior") — upload manual por card, mesmo pipeline
-- do vídeo do post único (migration 032/036): título + moldura 16:9 +
-- corpo, fundo sólido preto. video_status controla o estado assíncrono
-- (ffmpeg roda em background, Inngest).
alter table public.carousel_cards
  add column if not exists video_url text,
  add column if not exists video_poster_url text,
  add column if not exists video_status text not null default 'none'
    check (video_status in ('none', 'processing', 'ready', 'error')),
  add column if not exists video_error text;
