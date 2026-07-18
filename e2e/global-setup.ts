// ============================================================
// Global setup do e2e: cria um usuário EFÊMERO no Supabase real
// (service role, email já confirmado → dispara o trigger de signup
// que monta o tenant), loga pela UI real para gerar os cookies de
// sessão do @supabase/ssr e salva o storageState. O id do usuário vai
// pra um arquivo para o teardown apagá-lo.
// ============================================================
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");

export const E2E_EMAIL = `e2e-${Date.now()}@postpilot-e2e.dev`;
export const E2E_PASSWORD = "e2e-Test-123456";

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
