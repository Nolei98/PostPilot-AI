"use client";

// ============================================================
// Casca do app: Navbar no mobile (topo, sticky) + Sidebar fixa
// no desktop (lg+). Navegação auto-explicativa: 3 destinos com
// ícone + rótulo, item ativo destacado, badge de posts prontos.
// ============================================================
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

function navItems(readyCount: number): NavItem[] {
  return [
    {
      href: "/",
      label: "Fila",
      icon: (
        // pilha de cards = fila de aprovação
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="8" width="18" height="13" rx="2.5" />
          <path d="M6 4.5h12M8 1.5h8" opacity="0.5" />
        </svg>
      ),
    },
    {
      href: "/ready",
      label: "Prontos",
      badge: readyCount,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12.5 2.5 2.5 5-5.5" />
        </svg>
      ),
    },
    {
      href: "/pricing",
      label: "Planos",
      icon: (
        // cartão/selo = plano de assinatura
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M2.5 10h19M6 15h4" />
        </svg>
      ),
    },
    {
      href: "/settings",
      label: "Ajustes",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
        </svg>
      ),
    },
  ];
}

function Logo() {
  return (
    <span className="flex items-center gap-2 font-bold">
      <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary/20 text-primary">
        {/* raio = automação */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
        </svg>
      </span>
      PostPilot
    </span>
  );
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="animate-pop min-w-[1.25rem] rounded-full bg-success px-1.5 py-0.5 text-center text-micro text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppShell({
  readyCount = 0,
  children,
}: {
  readyCount?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = navItems(readyCount);

  return (
    <div className="min-h-screen lg:pl-60">
      {/* ===== SIDEBAR (desktop lg+) ===== */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="mb-8 px-2 text-display">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-body transition-colors duration-150
                  ${active
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-muted hover:bg-surface-2 hover:text-content"}`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                <Badge count={item.badge ?? 0} />
              </Link>
            );
          })}
        </nav>
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-body text-muted transition-colors hover:bg-surface-2 hover:text-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Sair
          </button>
        </form>
      </aside>

      {/* ===== NAVBAR (mobile, topo sticky) ===== */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-1">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={`relative rounded-control p-2 transition-colors duration-150
                    ${active ? "bg-primary/15 text-primary" : "text-muted hover:text-content"}`}
                >
                  {item.icon}
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-bg" />
                  )}
                </Link>
              );
            })}
            <form action={signOut}>
              <button
                aria-label="Sair"
                className="rounded-control p-2 text-muted transition-colors hover:text-content"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </form>
          </nav>
        </div>
      </header>

      {/* ===== CONTEÚDO ===== */}
      <main className="mx-auto max-w-lg px-4 pb-24 pt-4 lg:max-w-2xl lg:pt-8">
        {children}
      </main>
    </div>
  );
}
