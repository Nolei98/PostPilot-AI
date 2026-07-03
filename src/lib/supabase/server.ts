// ============================================================
// Cliente Supabase para Server Components / Route Handlers.
// Usa os cookies da requisição → respeita a sessão do usuário
// logado e o RLS (usuário só vê os próprios dados).
// ============================================================
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // set() falha em Server Component puro — ok, o middleware
            // é quem renova a sessão.
          }
        },
      },
    }
  );
}
