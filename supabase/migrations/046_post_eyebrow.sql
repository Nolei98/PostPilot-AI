-- ============================================================
-- Migration 046 — rótulo do TOPO editável por post.
--
-- A meta-linha do topo da capa ("Nº01 · ENSAIO", "01 / ENSAIO", "Nº 01",
-- conforme o preset) era uma CONSTANTE do layout: nenhum caminho do app
-- deixava trocar. Na prática ela é a única linha de texto da arte que o
-- cliente não conseguia editar — e é justamente onde vai a edição, a
-- seção ou o número do conteúdo ("EDIÇÃO 12", "GUIA RÁPIDO").
--
-- NULL = usa o padrão do preset, que é o comportamento de antes. String
-- vazia é tratada como NULL pela aplicação (savePostEyebrow), então não
-- existe estado "rótulo em branco" gravado por acidente.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists eyebrow text;

comment on column public.posts.eyebrow is
  'Rótulo do topo da capa. NULL = padrão do preset de layout.';
