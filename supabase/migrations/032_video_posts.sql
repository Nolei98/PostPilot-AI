-- Vídeo anexado a um post (Fase 4, kit v2 §3) — upload manual do
-- usuário, processado em background (Inngest + ffmpeg) que compõe o
-- quadro Reels 9:16 (wordmark + título, motor de layout + contraste
-- automático) sobre o vídeo enviado. video_status controla o estado
-- assíncrono pra fila mostrar "processando..." sem bloquear a tela.
alter table public.posts
  add column if not exists video_url text,
  add column if not exists video_poster_url text,
  add column if not exists video_status text not null default 'none'
    check (video_status in ('none', 'processing', 'ready', 'error')),
  add column if not exists video_error text;
