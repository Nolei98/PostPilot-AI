-- ============================================================
-- Migration 044 — trocar o formato do post na fila.
--
-- O formato é decidido antes do cliente ver qualquer coisa
-- (brand_kits.default_format, lido pelo scan-news). Na fila ele já viu o
-- conteúdo e é aí que sabe se aquilo rende um carrossel ou um post único.
--
-- convert_status é só sinal de UI (mesma escolha do rerender_status da
-- 039 e do render_status da 040): a Fila mostra o card "convertendo…" e
-- trava os botões enquanto o job roda, porque a conversão troca o
-- conteúdo debaixo do preview.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists convert_status text not null default 'idle'
    check (convert_status in ('idle', 'pending')),
  add column if not exists convert_error text;
