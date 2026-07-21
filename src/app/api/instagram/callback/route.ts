// ============================================================
// GET /api/instagram/callback — recebe o `code` do diálogo OAuth do
// Facebook, troca por token de longa duração, acha a Página com conta
// Instagram Business/Creator vinculada, e grava a conexão (token
// cifrado) em social_connections. Redireciona pra /settings com o
// resultado (?ig=connected|error).
// ============================================================
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyOAuthState, encryptSecret } from "@/lib/crypto-secrets";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  getFacebookPages,
  getInstagramUsername,
} from "@/lib/instagram-graph";

export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/settings?ig=error&reason=missing_params`);
  }

  const clientId = verifyOAuthState(state);
  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/settings?ig=error&reason=invalid_state`);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  try {
    const redirectUri = `${appUrl}/api/instagram/callback`;
    const shortLived = await exchangeCodeForToken(code, redirectUri);
    const longLived = await getLongLivedToken(shortLived.accessToken);
    const pages = await getFacebookPages(longLived.accessToken);
    const pageWithIg = pages.find((p) => p.instagram_business_account?.id);

    if (!pageWithIg || !pageWithIg.instagram_business_account) {
      return NextResponse.redirect(`${appUrl}/settings?ig=error&reason=no_ig_business_account`);
    }

    const igBusinessId = pageWithIg.instagram_business_account.id;
    const igUsername = await getInstagramUsername(igBusinessId, pageWithIg.access_token);
    const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000).toISOString();

    // A política RLS de social_connections só deixa passar se `clientId`
    // pertencer ao usuário logado (join clients.owner_user_id = auth.uid()).
    const { error } = await supabase.from("social_connections").upsert(
      {
        client_id: clientId,
        platform: "instagram",
        access_token: encryptSecret(pageWithIg.access_token),
        ig_business_account_id: igBusinessId,
        ig_username: igUsername,
        facebook_page_id: pageWithIg.id,
        token_expires_at: expiresAt,
        status: "connected",
        connected_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    );
    if (error) throw new Error(error.message);

    return NextResponse.redirect(`${appUrl}/settings?ig=connected`);
  } catch (err) {
    console.error("[instagram/callback] falha ao conectar:", err);
    return NextResponse.redirect(`${appUrl}/settings?ig=error&reason=exchange_failed`);
  }
}
