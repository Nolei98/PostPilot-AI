-- Preset de LAYOUT (tipografia + posicionamento + estrutura) por marca —
-- ortogonal ao preset de cores/identidade (Fase 3, postpilot-layouts.html).
-- 'editorial-noir' é o padrão atual (não muda nada em quem já existe).
alter table public.brand_kits
  add column if not exists layout_preset text not null default 'editorial-noir';
