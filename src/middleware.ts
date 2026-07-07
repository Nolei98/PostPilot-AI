// ============================================================
// Middleware: renova a sessão do Supabase em cada request e
// protege as rotas do app — sem login → redireciona p/ /login.
// ============================================================
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() valida o token no servidor do Supabase (não confia só no cookie)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isRootPage = request.nextUrl.pathname === "/";

  // Sem sessão e fora de rotas públicas (/) e (/login) → manda para o login
  if (!user && !isLoginPage && !isRootPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Já logado e tentando abrir /login ou a landing page (/) → manda para /fila
  if (user && (isLoginPage || isRootPage)) {
    return NextResponse.redirect(new URL("/fila", request.url));
  }

  return response;
}

export const config = {
  // Protege tudo, exceto: rotas do Inngest (assinadas pela própria
  // Inngest), o webhook do Stripe (assinado pelo Stripe — sem cookie
  // de sessão, era redirecionado pro /login e o pagamento nunca
  // sincronizava), assets estáticos e favicon.
  matcher: [
    "/((?!api/inngest|api/stripe/webhook|_next/static|_next/image|favicon.ico|support.js|image-slot.js|uploads).*)",
  ],
};
