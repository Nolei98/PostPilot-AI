// ============================================================
// Loading global do App Router — o Next mostra isto durante
// qualquer transição de rota (inclusive o redirect pro /login
// quando a sessão expira), evitando a tela em branco/"flash"
// entre uma página protegida e o login.
// ============================================================
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <span aria-hidden="true" className="orb-logo-pulse block h-12 w-12 rounded-full" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
