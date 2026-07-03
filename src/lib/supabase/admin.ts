// ============================================================
// Cliente Supabase ADMIN (service_role) — ignora RLS.
// Usado APENAS nos jobs de backend (Inngest): coleta de RSS,
// triagem, geração de conteúdo e upload de imagem.
// NUNCA importar em código que roda no browser.
// ============================================================
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        // Jobs não têm sessão de usuário — desliga persistência
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
