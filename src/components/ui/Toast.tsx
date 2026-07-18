"use client";

// ============================================================
// Toast global — feedback rápido pra qualquer ação (aprovar,
// copiar, salvar...), igual ao padrão do mockup Fable 5.
// Uso: const toast = useToast(); toast("✓ Post aprovado.");
// ============================================================
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastFn = (msg: string) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState("");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const toast = useCallback<ToastFn>((next) => {
    clearTimeout(timer.current);
    setMsg(next);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {visible && (
        <div
          role="status"
          className="animate-modal-in fixed bottom-7 left-1/2 z-[90] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 text-center rounded-[14px] border border-[#46E5B7]/50 bg-[#221038]/95 px-6 py-3.5 text-body text-content shadow-modal backdrop-blur-[20px]"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,.5), 0 0 30px rgba(70,229,183,.18)" }}
        >
          {msg}
        </div>
      )}
    </ToastContext.Provider>
  );
}
