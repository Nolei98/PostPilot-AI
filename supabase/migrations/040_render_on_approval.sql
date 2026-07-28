-- ============================================================
-- Migration 040 — a arte passa a ser montada na APROVAÇÃO, não na
-- geração.
--
-- Até aqui a arte final era composta antes do post chegar na Fila. Toda
-- troca de template/cor/layout em Ajustes deixava a fila inteira
-- dessincronizada, e a saída era re-renderizar tudo em massa (resync,
-- migration 039). Além de lento, o vínculo era incoerente: as CORES
-- viravam snapshot em tpl_* na geração, mas o TEMPLATE era resolvido por
-- referência em render time (brand_kits.template_selection) — duas
-- verdades sobre o mesmo post.
--
-- Novo modelo:
--   - a geração resolve só a imagem BASE (base_image_url) e mede a
--     luminância uma vez (base_luminance);
--   - a Fila desenha um preview ao vivo no browser a partir da base + do
--     brand_kit ATUAL — nenhum job, nenhuma arte gravada;
--   - aprovar dispara o render, que CONGELA tudo que decidiu a arte em
--     render_spec. Aprovado nunca mais herda mudança de Ajustes.
--
-- render_status é ortogonal a status de propósito: status continua sendo
-- a máquina de estados do post (fila → aprovado → agendado → publicado),
-- lida por shell.ts, ReadyTabs e publish-scheduled-posts. Mesma escolha
-- que a 039 fez com rerender_status.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists render_status text not null default 'none'
    check (render_status in ('none', 'pending', 'rendering', 'ready', 'error')),
  add column if not exists render_error text,
  -- snapshot COMPLETO do que decidiu a arte (cores, layout, perfil e a
  -- spec inline dos templates). Inline e não por id: editar um template
  -- no Studio depois não pode mexer em post já aprovado.
  add column if not exists render_spec jsonb,
  -- gera um token novo a cada aprovação/regeração; o job guarda todo
  -- write por ele, então um render superado vira no-op em vez de
  -- sobrescrever um mais recente.
  add column if not exists render_token uuid,
  add column if not exists base_image_url text,
  -- amostra 48x60 de luminância (LumGrid, ver src/lib/contrast.ts) —
  -- medida uma vez na geração pra que preview e render final decidam
  -- contraste/overlay pelo MESMO número.
  add column if not exists base_luminance jsonb,
  -- o formato do vídeo só existia no evento do attach-video, nunca no
  -- banco; sem isso o render da aprovação não sabe se é feed ou
  -- feed-blur.
  add column if not exists video_shape text
    check (video_shape in ('reels', 'feed', 'feed-blur'));

alter table public.carousel_cards
  -- cada card tem o próprio fundo (bg_url), logo a própria luminância
  add column if not exists bg_luminance jsonb;

-- CRÍTICO: posts que já passaram da fila têm arte pronta e nunca vão
-- passar pelo job novo. Sem marcá-los como 'ready', o guard que
-- publish-scheduled-posts vai ganhar congelaria todo agendamento
-- existente — e nada seria publicado.
update public.posts
  set render_status = 'ready'
  where status in ('approved', 'scheduled', 'published');

-- Índice parcial, mesmo padrão da 039: só interessa quem está no meio do
-- render, que é a minoria absoluta (e zero na maior parte do tempo).
create index if not exists idx_posts_render_pending
  on public.posts (client_id)
  where render_status in ('pending', 'rendering');
