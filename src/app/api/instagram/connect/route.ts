// ============================================================
// GET /api/instagram/connect?clientId=... — inicia o diálogo OAuth
// do Facebook (Meta for Developers) pra conectar a conta Instagram
// Business/Creator do cliente ativo. `state` é o clientId assinado
// (HMAC, ver src/lib/crypto-secrets.ts) — evita CSRF sem precisar de
// tabela de sessão nova.
// ============================================================
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signOAuthState } from "@/lib/crypto-secrets";

const GRAPH_OAUTH_VERSION = "v21.0";
const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export async function GET(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ error: "clientId ausente" }, { status: 400 });
  }
  // Confere que o clientId pedido é realmente de um cliente do usuário
  // logado (RLS já garante isso na query, aqui só formaliza o 404).
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const appId = process.env.META_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/instagram/callback`;
  const state = signOAuthState(clientId);

  if (!appId) {
    // Sem app do Meta configurado ainda: mock local — vai direto pro
    // callback como se o Facebook tivesse aprovado, com um `code` fake.
    return NextResponse.redirect(
      `${redirectUri}?code=mock-oauth-code&state=${encodeURIComponent(state)}`
    );
  }

  const dialogUrl =
    `https://www.facebook.com/${GRAPH_OAUTH_VERSION}/dialog/oauth` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(state)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&response_type=code`;

  return NextResponse.redirect(dialogUrl);
}
