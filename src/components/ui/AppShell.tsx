"use client";

// ============================================================
// Casca do app: Navbar no mobile (topo, sticky) + Sidebar fixa
// no desktop (lg+). Navegação auto-explicativa: 3 destinos com
// ícone + rótulo, item ativo destacado, badge de posts prontos.
// ============================================================
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { ClientSwitcher } from "@/components/ClientSwitcher";

interface ClientLite {
  id: string;
  name: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

function navItems(readyCount: number): NavItem[] {
  return [
    {
      href: "/fila",
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
      href: "/radar",
      label: "Radar",
      icon: (
        // círculos concêntricos + ponto = varredura de radar
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" opacity="0.45" />
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 12 18 6" />
        </svg>
      ),
    },
    {
      href: "/copilot",
      label: "Copiloto",
      icon: (
        // balão de chat = conversa com o agente
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z" />
          <path d="M8 10h8M8 13h5" opacity="0.6" />
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
    <Link href="/fila" className="flex items-center gap-3 font-bold transition-opacity hover:opacity-90">
      <span aria-hidden="true" className="orb-logo-pulse block h-7 w-7 rounded-full" />
      <span className="font-title tracking-wide text-[13px] uppercase">PostPilot</span>
    </Link>
  );
}

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto bg-gradient-to-r from-[#E0219C] to-[#7B2FF7] rounded-full text-[10px] px-2 py-0.5 text-white font-sans font-semibold animate-pop">
      {count}
    </span>
  );
}

export function AppShell({
  readyCount = 0,
  brandName,
  logoUrl,
  clients = [],
  activeClientId = null,
  children,
}: {
  readyCount?: number;
  brandName?: string | null;
  logoUrl?: string | null;
  clients?: ClientLite[];
  activeClientId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const items = navItems(readyCount);

  return (
    <div className="min-h-screen lg:pl-[230px] flex flex-col w-full">
      {/* ===== SIDEBAR (desktop lg+) ===== */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[230px] flex-col border-r border-white/7 bg-[#150726] px-4 py-[26px] lg:flex">
        <div className="mb-5 px-[10px]">
          <Logo />
        </div>
        <div className="mb-5 px-[6px]">
          <ClientSwitcher clients={clients} activeClientId={activeClientId} />
        </div>
        <nav className="flex-1 space-y-1.5">
          {items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-control border px-3.5 py-3 font-title text-[11.5px] font-semibold tracking-wider transition-all duration-200 uppercase
                  ${active
                    ? "bg-primary/16 border-primary/45 text-white"
                    : "border-transparent text-muted hover:border-white/20 hover:text-white"}`}
              >
                <span className="w-[18px] text-center text-sm">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                <Badge count={item.badge ?? 0} />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/7 pt-4">
          <div className="flex items-center gap-2.5 px-2 py-2">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName ?? "Logo da marca"}
                className="h-[30px] w-[30px] shrink-0 rounded-full object-cover ring-1 ring-white/15"
              />
            ) : (
              <span aria-hidden="true" className="h-[30px] w-[30px] rounded-full bg-gradient-to-br from-[#46E5B7] to-[#37C8F5] block shrink-0" />
            )}
            <span className="min-w-0 truncate font-sans text-[12px] leading-tight text-white">
              {brandName || "Sua Marca"}
              <br />
              <span className="text-[10.5px] text-[#B9A9D6]">Plano Pro</span>
            </span>
          </div>
          <form action={signOut} className="mt-2">
            <button className="flex w-full items-center justify-center rounded-control border border-white/12 py-2.5 font-title text-[11px] font-semibold tracking-wider text-[#B9A9D6] transition-colors hover:border-[#FF5C7A]/40 hover:text-[#FF5C7A] uppercase">
              Sair
            </button>
          </form>
        </div>
      </aside>

      {/* ===== NAVBAR (mobile, topo sticky) ===== */}
      <header className="sticky top-0 z-20 border-b border-white/7 bg-[#150726]/85 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-1.5">
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={`relative rounded-control p-2 transition-all duration-150 border
                    ${active ? "bg-primary/16 border-primary/45 text-white" : "border-transparent text-muted hover:text-white"}`}
                >
                  <span className="text-sm block">{item.icon}</span>
                  {(item.badge ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gradient-to-r from-[#E0219C] to-[#7B2FF7]" />
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

      {/* ===== BARRA DE CLIENTE (mobile) ===== */}
      <div className="sticky top-[57px] z-10 border-b border-white/7 bg-[#150726]/85 px-4 py-2 backdrop-blur lg:hidden">
        <ClientSwitcher clients={clients} activeClientId={activeClientId} />
      </div>

      {/* ===== CONTEÚDO ===== */}
      <main className="flex-1 p-4 pb-24 pt-4 md:p-[34px_38px_80px] min-w-0 max-w-[1240px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
