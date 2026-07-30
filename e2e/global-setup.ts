// ============================================================
// Global setup do e2e: cria um usuário EFÊMERO no Supabase real
// (service role, email já confirmado → dispara o trigger de signup
// que monta o tenant), loga pela UI real para gerar os cookies de
// sessão do @supabase/ssr e salva o storageState. O id do usuário vai
// pra um arquivo para o teardown apagá-lo.
// ============================================================
import { chromium } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");

export const E2E_EMAIL = `e2e-${Date.now()}@postpilot-e2e.dev`;
export const E2E_PASSWORD = "e2e-Test-123456";

const IMG = (n: number) => `https://picsum.photos/seed/pp-e2e-${n}/300/375`;

/**
 * Coloca o usuário de teste num plano PAGO.
 *
 * Desde 30/07 o plano grátis tem teto de 1 cliente (auditoria §2.2), e o
 * spec de multi-tenant precisa criar um SEGUNDO cliente pra provar que a
 * fila e as fontes ficam isoladas. Sem isto o teste passaria a medir o
 * gating de plano em vez do isolamento, que é o que ele existe pra
 * garantir. O teto em si tem teste próprio em src/lib/plans.test.ts.
 */
async function seedPlanoPago(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin
    .from("subscriptions")
    .upsert({ user_id: userId, plan: "pro", status: "active" }, { onConflict: "user_id" });
  if (error) throw new Error(`e2e: falha ao dar plano pago ao usuário: ${error.message}`);
}

/** Cria um post format='carousel' com 3 cards no cliente do usuário. */
async function seedCarousel(admin: SupabaseClient, userId: string): Promise<void> {
  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .single();
  const { data: src } = await admin
    .from("source_configs")
    .select("id")
    .eq("client_id", client!.id)
    .limit(1)
    .single();
  const { data: news } = await admin
    .from("news_items")
    .insert({
      source_id: src!.id,
      client_id: client!.id,
      url: `https://ex.com/e2e-carousel-${Date.now()}`,
      title: "Notícia e2e carrossel",
      status: "candidate",
    })
    .select("id")
    .single();
  const { data: post } = await admin
    .from("posts")
    .insert({
      news_item_id: news!.id,
      user_id: userId,
      client_id: client!.id,
      format: "carousel",
      hook: "Gancho e2e",
      caption: "Legenda e2e do carrossel",
      hashtags: "#e2e #carrossel",
      image_prompt: "",
      image_url: IMG(0),
      status: "pending_approval",
    })
    .select("id")
    .single();
  await admin.from("carousel_cards").insert([
    { post_id: post!.id, idx: 0, role: "hook", headline: "Card 1", body: "b", image_url: IMG(0) },
    { post_id: post!.id, idx: 1, role: "value", headline: "Card 2", body: "b", image_url: IMG(1) },
    { post_id: post!.id, idx: 2, role: "cta", headline: "Card 3", body: "b", image_url: IMG(2) },
  ]);
}

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "e2e precisa de NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY em .env.local"
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email: E2E_EMAIL,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { niche: "tecnologia", brand_name: "E2E Marca" },
  });
  if (error) throw new Error(`Falha ao criar usuário e2e: ${error.message}`);
  const userId = data.user.id;

  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(path.join(AUTH_DIR, "user-id.txt"), userId);

  // Semeia 1 post carrossel (3 cards) no cliente do signup, para o e2e da
  // UI de carrossel. Usa service role (ignora RLS). URLs de imagem são
  // placeholders — o teste checa a estrutura da galeria, não o pixel.
  await seedPlanoPago(admin, userId);
  await seedCarousel(admin, userId);

  // Login pela UI real → cookies de sessão válidos no storageState.
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: "http://localhost:3000" });
  await page.goto("/login");
  await page.locator("input[type=email]").fill(E2E_EMAIL);
  await page.locator("input[type=password]").fill(E2E_PASSWORD);
  await page.locator("button[type=submit]").click();
  await page.waitForURL("**/fila", { timeout: 30_000 });
  await page.context().storageState({ path: path.join(AUTH_DIR, "user.json") });
  await browser.close();
}
