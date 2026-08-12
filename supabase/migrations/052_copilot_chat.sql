-- ============================================================
-- Migration 052 (Sprint F): Copiloto de chat.
--
-- Uma tabela só, conversa CONTÍNUA por cliente (sem "threads" — mesmo
-- espírito de "vale pra fila inteira" que já existe em Ajustes). Cada
-- linha é uma mensagem: do usuário, do agente (texto final) ou de uma
-- ferramenta chamada no meio do caminho (guardada pra reconstruir o
-- histórico exibido na tela, não só o resultado final).
--
-- Rodar no SQL Editor do Supabase.
-- ============================================================

create table if not exists copilot_messages (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,

  role          text not null check (role in ('user', 'assistant', 'tool')),
  content       text not null,

  -- Preenchidos só quando role = 'tool': qual ferramenta rodou, com que
  -- entrada e o que devolveu. Guardado pra reexibir o passo-a-passo ao
  -- recarregar a tela, não só pro agente reler no próximo turno.
  tool_name     text,
  tool_input    jsonb,
  tool_output   jsonb,

  created_at    timestamptz not null default now()
);

create index if not exists idx_copilot_messages_client_created
  on copilot_messages (client_id, created_at);

alter table copilot_messages enable row level security;

-- Mesma forma das outras tabelas do projeto: o dono enxerga e mexe no que
-- é dele; a rota do copiloto grava com a sessão do próprio usuário (não
-- service_role), então precisa de policy de insert também — diferente de
-- viral_references, que só é escrita por job.
drop policy if exists "dono lê suas mensagens do copiloto" on copilot_messages;
create policy "dono lê suas mensagens do copiloto"
  on copilot_messages for select
  using (user_id = auth.uid());

drop policy if exists "dono grava suas mensagens do copiloto" on copilot_messages;
create policy "dono grava suas mensagens do copiloto"
  on copilot_messages for insert
  with check (user_id = auth.uid());

drop policy if exists "dono apaga suas mensagens do copiloto" on copilot_messages;
create policy "dono apaga suas mensagens do copiloto"
  on copilot_messages for delete
  using (user_id = auth.uid());
