"use client";

// ============================================================
// Login + Cadastro — Supabase email + senha, no design system.
// Cadastro: o trigger handle_new_user (migration 010) já deixa a
// conta pronta (config default + fontes); o primeiro scan dispara
// na primeira visita à fila (FirstScanKickoff).
// ============================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const { data, error } = await supabase.auth.signUp({ email, password });
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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-card bg-primary/15 text-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />
            </svg>
          </div>
          <h1 className="text-display">PostPilot AI</h1>
          <p className="text-caption text-muted">
            Seu perfil de IA posta sozinho. Você só aprova.
          </p>
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
    </main>
  );
}
