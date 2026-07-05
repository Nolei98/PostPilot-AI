-- ============================================================
-- Migration 016: tabela scan_runs — rastreia o status de cada
-- varredura disparada manualmente ("Varrer agora") pra dar feedback
-- em tempo real no botão (rodando / nada novo / N encontrados).
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create table if not exists scan_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  sources int,
  inserted int,
  triaged int,
  candidates int,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table scan_runs enable row level security;

drop policy if exists "users can view their own scan runs" on scan_runs;
create policy "users can view their own scan runs"
  on scan_runs for select
  using (requested_by = auth.uid());

drop policy if exists "users can create their own scan runs" on scan_runs;
create policy "users can create their own scan runs"
  on scan_runs for insert
  with check (requested_by = auth.uid());
