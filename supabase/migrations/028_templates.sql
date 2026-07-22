-- ============================================================
-- Migration 028 (Sprint B+, TAREFA B11): Template Studio — galeria de
-- presets do sistema + modelos personalizados por cliente, e a escolha
-- por superfície. Ver HANDOFF-overlens-template.md seção 6B.
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create table if not exists templates (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete cascade,  -- null = preset do sistema
  surface       text not null
    check (surface in ('cover_image', 'video_cover', 'carousel_page', 'carousel_last')),
  name          text not null,
  spec          jsonb not null,        -- contrato de elementos (seção 6B.3)
  thumbnail_url text,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_templates_surface on templates (surface);
create index if not exists idx_templates_client on templates (client_id);

-- Modelo escolhido por superfície, por cliente.
alter table brand_kits
  add column if not exists template_selection jsonb not null default '{}'::jsonb;

-- RLS: presets do sistema legíveis por todos os autenticados; modelos
-- custom só do dono (escrita idem). Presets do sistema entram via service
-- role (seed) — usuário não consegue inserir com client_id null.
alter table templates enable row level security;

drop policy if exists "read templates" on templates;
create policy "read templates" on templates
  for select using (
    is_system = true
    or client_id in (select id from clients where owner_user_id = auth.uid())
  );

drop policy if exists "write own templates" on templates;
create policy "write own templates" on templates
  for all using (
    client_id in (select id from clients where owner_user_id = auth.uid())
  ) with check (
    client_id in (select id from clients where owner_user_id = auth.uid())
  );
