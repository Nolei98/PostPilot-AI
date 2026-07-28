// ============================================================
// Dados comuns da casca do app (AppShell): lista de clientes,
// cliente ativo e a marca exibida no sidebar. Centraliza o que
// antes cada página buscava solto de notification_configs.
//
// Marca (brand_name/logo) vem do brand_kit do cliente ATIVO — cada
// cliente tem sua identidade. Telegram fica em notification_configs.
// ============================================================
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_CLIENT_COOKIE, listClients } from "@/lib/client-context";
import type { Client } from "@/lib/types";

export interface ShellData {
  clients: Client[];
  activeClient: Client | null;
  activeClientId: string | null;
  brandName: string | null;
  logoUrl: string | null;
  readyCount: number;
  /** Dono da sessão — o preview da fila precisa pra resolver o plano
   * (marca d'água do free) na spec de render. */
  userId: string | null;
}

export async function getShellData(): Promise<ShellData> {
  const supabase = createClient();
  const clients = await listClients();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieId = cookies().get(ACTIVE_CLIENT_COOKIE)?.value;
  const activeClient =
    (cookieId ? clients.find((c) => c.id === cookieId) : undefined) ??
    clients[0] ??
    null;
  const activeClientId = activeClient?.id ?? null;

  let brandName: string | null = null;
  let logoUrl: string | null = null;
  let readyCount = 0;
  if (activeClientId) {
    const { data: bk } = await supabase
      .from("brand_kits")
      .select("brand_name, logo_url")
      .eq("client_id", activeClientId)
      .maybeSingle();
    brandName = bk?.brand_name ?? null;
    logoUrl = bk?.logo_url ?? null;

    const { count } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("client_id", activeClientId);
    readyCount = count ?? 0;
  }

  return {
    clients,
    activeClient,
    activeClientId,
    brandName,
    logoUrl,
    readyCount,
    userId: user?.id ?? null,
  };
}
