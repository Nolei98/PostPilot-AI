// ============================================================
// Cliente Supabase para o browser (Client Components).
// Usado no login e em ações interativas do dashboard.
// ============================================================
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
