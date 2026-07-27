// ============================================================
// Casca das páginas legais (privacidade, termos, exclusão de dados).
//
// Deliberadamente FORA do AppShell: precisam abrir sem login, porque o
// App Review do Meta exige que o revisor alcance a política de
// privacidade e as instruções de exclusão de dados sem ter conta. Ver
// a allowlist em src/middleware.ts e §4.3.3 do PROGRESSO-2.0.md.
// ============================================================
import Link from "next/link";

/** Contato público das páginas legais — o Meta exige um canal que funcione. */
export const CONTATO_EMAIL = "noleirodrigues@gmail.com";

export function LegalPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  /** Data da última revisão do texto, formato "27 de julho de 2026". */
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/" className="text-caption text-subtle hover:text-content">
        ← PostPilot
      </Link>

      <h1 className="mt-8 text-display">{title}</h1>
      <p className="mt-2 text-caption text-subtle">
        Última atualização: {updatedAt}
      </p>

      <div className="mt-10 space-y-8">{children}</div>

      <footer className="mt-16 border-t border-line pt-6 text-caption text-subtle">
        <p>
          Dúvidas sobre este documento:{" "}
          <a href={`mailto:${CONTATO_EMAIL}`} className="text-content underline">
            {CONTATO_EMAIL}
          </a>
        </p>
        <nav className="mt-3 flex flex-wrap gap-4">
          <Link href="/privacidade" className="hover:text-content">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:text-content">
            Termos
          </Link>
          <Link href="/exclusao-de-dados" className="hover:text-content">
            Exclusão de dados
          </Link>
        </nav>
      </footer>
    </main>
  );
}

/** Seção com título — só pra não repetir as classes em 3 arquivos. */
export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-title text-content">{title}</h2>
      <div className="space-y-3 text-body text-muted">{children}</div>
    </section>
  );
}
