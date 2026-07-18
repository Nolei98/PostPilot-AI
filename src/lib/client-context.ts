// ============================================================
// Contexto do CLIENTE ativo (multi-tenant).
//
// Todo dado de conteúdo pertence a um cliente (tenant). O app
// resolve "qual cliente estou vendo" a partir de um cookie,
// validando contra os clientes que o usuário logado possui — a
// RLS (por user_id) já garante que ele só enxerga os próprios.
//
// Usar em Server Components / Server Actions. Nunca no browser.
// ============================================================
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Client, BrandKit } from "@/lib/types";

export const ACTIVE_CLIENT_COOKIE = "pp_active_client";

/**
 * Lista os clientes do usuário logado (mais antigo primeiro — o
 * primeiro é o default histórico criado no backfill/signup).
 */
export async function listClients(): Promise<Client[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[listClients] erro:", error.message);
    return [];
  }
  return (data ?? []) as Client[];
}

/**
 * Resolve o cliente ativo: o do cookie se pertencer ao usuário,
 * senão o primeiro (mais antigo). Retorna null só se o usuário não
 * tiver nenhum cliente (não deveria acontecer após o backfill).
 */
export async function getActiveClient(): Promise<Client | null> {
  const clients = await listClients();
  if (clients.length === 0) return null;

  const cookieId = cookies().get(ACTIVE_CLIENT_COOKIE)?.value;
  const fromCookie = cookieId ? clients.find((c) => c.id === cookieId) : undefined;
  return fromCookie ?? clients[0];
}

/**
 * Atalho: só o id do cliente ativo (a maioria das queries precisa
 * apenas dele para o `.eq("client_id", ...)`).
 */
export async function getActiveClientId(): Promise<string | null> {
  return (await getActiveClient())?.id ?? null;
}

/**
 * Brand Kit do cliente ativo — fonte da verdade da identidade
 * (cores, perfil IG, logo, providers, niche). Substitui as leituras
 * de notification_configs para dados de conteúdo/marca.
 */
export async function getActiveBrandKit(): Promise<BrandKit | null> {
  const clientId = await getActiveClientId();
  if (!clientId) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) {
    console.error("[getActiveBrandKit] erro:", error.message);
    return null;
  }
  return (data as BrandKit) ?? null;
}
