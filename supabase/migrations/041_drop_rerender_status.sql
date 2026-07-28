-- ============================================================
-- Migration 041 — aposenta o resync de layout.
--
-- `rerender_status` (migration 039) existia pra a Fila mostrar "aplicando
-- layout" enquanto o job resync-layout-preset re-renderizava, em massa, a
-- arte dos posts pendentes. Com o render-on-approval (migration 040) esse
-- job perdeu o motivo de existir: post na fila não tem arte gravada — o
-- que se vê é preview ao vivo, desenhado a cada load com o Brand Kit
-- atual. Trocar cor/layout/template em Ajustes aparece na hora, sem job,
-- sem espera e sem render nenhum.
--
-- O job, os três disparos em Ajustes (layout_preset, single_post_style,
-- template_selection) e o orbe da Fila foram removidos do código. A
-- coluna é só sinal de UI transitório — nenhum conteúdo mora nela.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts drop column if exists rerender_status;
