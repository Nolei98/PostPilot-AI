// ============================================================
// Global teardown do e2e: apaga o usuário efêmero criado no setup.
// A FK on delete cascade remove clients/brand_kits/source_configs/
// posts junto — não deixa lixo no banco.
// ============================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), "e2e", ".auth");

export default async function globalTeardown() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  let userId: string;
  try {
    userId = readFileSync(path.join(AUTH_DIR, "user-id.txt"), "utf8").trim();
  } catch {
    return; // nada a limpar
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.warn(`[e2e teardown] falha ao apagar usuário: ${error.message}`);

  try {
    rmSync(AUTH_DIR, { recursive: true, force: true });
  } catch {
    /* ok */
  }
}
