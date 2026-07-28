-- ============================================================
-- Migration 042 — fundo escolhido POR POST.
--
-- Até aqui a cor de fundo da arte vinha só do Brand Kit
-- (brand_kits.color_background): uma cor para todos os posts do cliente.
-- Na prática o fundo muda com o conteúdo — a mesma marca quer um post
-- em preto e o seguinte em branco, sem trocar a identidade inteira em
-- Ajustes (e sem afetar o que já está na fila).
--
-- bg_mode:
--   'brand'  — usa o Brand Kit (default; nada muda pra quem já existe)
--   'light'  — fundo claro do sistema
--   'dark'   — fundo escuro do sistema
--   'custom' — cor livre, escolhida no seletor RGB (bg_color)
--
-- A cor de TEXTO não é gravada: ela é derivada da luminância do fundo no
-- momento de montar o RenderSpec. Guardar as duas deixaria criar
-- combinação ilegível (texto branco em fundo branco), e o sistema já
-- sabe decidir isso — é a mesma regra do contraste sobre foto.
--
-- Como todo o resto da arte, isto CONGELA na aprovação junto do
-- render_spec (migration 040): mudar o fundo depois não mexe no que já
-- foi aprovado.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

alter table public.posts
  add column if not exists bg_mode text not null default 'brand'
    check (bg_mode in ('brand', 'light', 'dark', 'custom')),
  -- Só faz sentido em 'custom'; nos outros modos fica nulo.
  add column if not exists bg_color text
    check (bg_color is null or bg_color ~* '^#[0-9a-f]{6}$');
