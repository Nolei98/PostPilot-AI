// ============================================================
// Harness de integração: Postgres real em WASM (pglite) — sem Docker,
// roda local e no CI. Aplica as MIGRATIONS REAIS (supabase/migrations)
// sobre shims mínimos do Supabase (auth/storage), para testar as
// policies de RLS e o trigger de signup como estão em produção.
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MIG_DIR = fileURLToPath(new URL("../../supabase/migrations", import.meta.url));

// Shims do que o Supabase provê em produção e o pglite não tem:
// - auth.users + auth.uid() (lê o "sub" do JWT via GUC de sessão)
// - storage.buckets (as migrations inserem buckets)
// - roles authenticated/anon (RLS só é aplicada a não-donos da tabela)
const SHIM = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false
);
create role authenticated nologin;
create role anon nologin;
`;

export type Db = PGlite;

/** Boota o pglite, aplica shims + todas as migrations e os grants. */
export async function bootTestDb(): Promise<Db> {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(SHIM);

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    // pgcrypto não existe no pglite (gen_random_uuid é core) — remove só
    // essa linha; `create extension vector` (023) precisa continuar.
    const sql = readFileSync(path.join(MIG_DIR, f), "utf8").replace(
      /create extension[^;]*pgcrypto[^;]*;/gi,
      ""
    );
    await db.exec(sql);
  }

  // Supabase concede esses grants ao papel authenticated; a RLS é quem
  // filtra por usuário (o grant só libera o acesso à tabela).
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant all on all tables in schema public to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated, anon;
  `);

  return db;
}

/**
 * Simula um signup: insere em auth.users (dispara o trigger real
 * handle_new_user → cria client + brand_kit + notification_configs +
 * fontes). Retorna o id do usuário.
 */
export async function signup(
  db: Db,
  opts: { email: string; niche?: string; brandName?: string } = { email: "u@x.com" }
): Promise<string> {
  const meta = JSON.stringify({
    ...(opts.niche ? { niche: opts.niche } : {}),
    ...(opts.brandName ? { brand_name: opts.brandName } : {}),
  });
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1, $2::jsonb) returning id`,
    [opts.email, meta]
  );
  return rows[0].id;
}

/**
 * Executa `fn` no contexto RLS de um usuário: assume o papel
 * authenticated (não-dono → RLS aplicada) e injeta o sub do JWT.
 * Sempre reseta o papel/GUC ao final.
 */
export async function asUser<T>(db: Db, uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
  }
}
