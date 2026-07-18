"use client";

// ============================================================
// Login + Cadastro — Supabase email + senha, no design system.
// Cadastro: o trigger handle_new_user (migration 010) já deixa a
// conta pronta (config default + fontes); o primeiro scan dispara
// na primeira visita à fila (FirstScanKickoff).
// ============================================================
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { NICHES } from "@/lib/niches";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [niche, setNiche] = useState(NICHES[0].key);
  const [brandName, setBrandName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError("E-mail ou senha inválidos.");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    // ===== Cadastro =====
    if (password.length < 6) {
      setError("A senha precisa de pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Lido pelo trigger handle_new_user (migration 017) pra salvar o
        // nicho na config default e semear fontes RSS curadas por nicho.
        data: { niche, brand_name: brandName.trim() || null },
        // Sem isso, o link de confirmação usa o Site URL do dashboard
        // Supabase (pode estar em localhost) em vez do domínio atual.
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (error) {
      setError(
        error.message.includes("already registered")
          ? "Este e-mail já tem conta — use Entrar."
          : "Não foi possível criar a conta. Tente de novo."
      );
      setLoading(false);
      return;
    }

    // Com confirmação de e-mail LIGADA no Supabase, não há sessão
    // ainda — avisa para conferir a caixa de entrada. Com confirmação
    // desligada, a sessão já vem e entramos direto.
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setNotice(
        "Conta criada! Confira seu e-mail e clique no link de confirmação para entrar."
      );
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-control border border-white/12 px-3.5 py-2 text-caption text-muted transition-colors hover:border-primary/45 hover:text-content sm:left-6 sm:top-6"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Voltar ao site
      </Link>
      <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-4 lg:grid-cols-2">
      {/* ===== Lado visual: preview da fila num celular ===== */}
      <div className="relative hidden items-center justify-center overflow-hidden p-16 lg:flex">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(123,47,247,.18) 0%, rgba(224,33,156,.08) 45%, transparent 70%)",
          }}
        />
        <div className="relative -rotate-6">
          <div
            className="h-[520px] w-[250px] rounded-[42px] border border-white/16 p-2.5"
            style={{
              background: "linear-gradient(160deg,#31184f 0%, #1c0b33 60%, #150726 100%)",
              boxShadow: "0 0 60px rgba(224,33,156,.35), 0 40px 80px rgba(0,0,0,.55)",
            }}
          >
            <div className="flex h-full w-full flex-col gap-2.5 overflow-hidden rounded-[34px] bg-[#0F0620] px-3.5 pb-3.5 pt-11">
              <div className="text-center font-title text-[10px] tracking-[.22em] text-muted">
                FILA DE APROVAÇÃO
              </div>
              <div className="flex gap-2 rounded-[12px] border border-white/8 bg-[#221038]/90 p-2.5">
                <span
                  aria-hidden
                  className="block h-11 w-11 shrink-0 rounded-[9px]"
                  style={{ background: "linear-gradient(140deg,#3b2a63,#b9736e)" }}
                />
                <span className="text-[8.5px] leading-relaxed text-muted">
                  A notícia do dia, no seu feed
                  <br />
                  <span className="text-success">Score 92</span>
                </span>
              </div>
              <div className="flex gap-1.5">
                <span className="flex-1 rounded-[8px] bg-gradient-to-br from-[#E0219C] to-[#7B2FF7] py-1.5 text-center text-[8.5px] text-white">
                  ✓ Aprovar
                </span>
                <span className="flex-1 rounded-[8px] border border-warning/40 py-1.5 text-center text-[8.5px] text-warning">
                  ✎ Editar
                </span>
              </div>
              <div className="flex gap-2 rounded-[12px] border border-white/8 bg-[#221038]/90 p-2.5 opacity-65">
                <span
                  aria-hidden
                  className="block h-11 w-11 shrink-0 rounded-[9px]"
                  style={{ background: "linear-gradient(200deg,#2f4d6b,#6b4a8f)" }}
                />
                <span className="text-[8.5px] leading-relaxed text-muted">
                  3 números que provam a tendência
                  <br />
                  <span className="text-success">Score 87</span>
                </span>
              </div>
              <div className="mt-auto text-center">
                <span aria-hidden className="orb-logo-pulse inline-block h-[38px] w-[38px] rounded-full" />
              </div>
            </div>
          </div>
          <span
            aria-hidden
            className="absolute right-[-26px] top-16 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-success/50 text-[20px] text-success"
            style={{ background: "rgba(70,229,183,.14)", boxShadow: "0 0 26px rgba(70,229,183,.3)" }}
          >
            ✓
          </span>
        </div>
      </div>

      {/* ===== Lado do formulário ===== */}
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:mb-11">
            <span aria-hidden className="orb-logo-pulse block h-10 w-10 rounded-full" />
            <span className="font-title text-[12px] font-bold uppercase tracking-[.24em]">
              PostPilot
            </span>
          </div>

          <Card className="p-6">
            {/* Alternador Entrar / Criar conta */}
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-control bg-surface-2 p-1">
              {(
                [
                  ["signin", "Entrar"],
                  ["signup", "Criar conta"],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError(null);
                    setNotice(null);
                  }}
                  className={`rounded-control px-3 py-2 text-body transition-colors
                    ${mode === m ? "bg-primary font-medium text-white" : "text-muted hover:text-content"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <h1 className="mb-1 font-title text-[22px] font-bold tracking-wide">
              {mode === "signin" ? "Vamos começar." : "Crie sua conta."}
            </h1>
            <p className="mb-6 text-caption text-muted">
              {mode === "signin"
                ? "Entre para ver o que o seu piloto já preparou."
                : "Grátis, sem cartão — em minutos seus primeiros posts estão prontos."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="E-mail"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Input
                label={mode === "signup" ? "Senha (mín. 6 caracteres)" : "Senha"}
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={error ?? undefined}
              />
              {mode === "signup" && (
                <Input
                  label="Nome da marca"
                  placeholder="Ex: Sua Marca"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                />
              )}
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label htmlFor="signup-niche" className="block text-caption text-muted">
                    Nicho do seu negócio
                  </label>
                  <select
                    id="signup-niche"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    className="w-full rounded-control border border-line bg-surface-2 px-3 py-2.5 text-body text-content outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
                  >
                    {NICHES.map((n) => (
                      <option key={n.key} value={n.key}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-micro text-subtle">
                    Direciona o tom dos posts e as fontes de notícias sugeridas — dá pra ajustar depois.
                  </p>
                </div>
              )}
              {notice && (
                <p className="rounded-control bg-success/10 px-3 py-2.5 text-caption text-success">
                  {notice}
                </p>
              )}
              <Button type="submit" loading={loading} className="w-full">
                {mode === "signin" ? "Entrar" : "Criar conta grátis"}
              </Button>
            </form>
          </Card>

          {mode === "signup" && (
            <p className="mt-4 text-center text-caption text-subtle">
              Grátis: 5 posts por mês, sem cartão. Em ~10 minutos seus
              primeiros posts estarão prontos para aprovar.
            </p>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}
