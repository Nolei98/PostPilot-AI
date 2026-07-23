-- Segundo formato de vídeo: "feed" (4:5, 1080×1350 — mesmo quadro do
-- post único/carrossel) além do "video" existente (Reels 9:16). Upload
-- manual, mesmo pipeline (attach-video.ts) — só o quadro de composição
-- muda (composeFeedVideo em video.ts em vez de composeReelsVideo), sem
-- letterbox/extensão desfocada porque o vídeo já cobre o quadro inteiro.
alter table public.posts
  drop constraint if exists posts_format_check;
alter table public.posts
  add constraint posts_format_check
    check (format in ('single', 'carousel', 'video', 'video_feed'));
