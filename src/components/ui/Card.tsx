// ============================================================
// Card base — superfície padrão do app.
// `interactive` adiciona hover (borda acende) para cards clicáveis.
// ============================================================
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({
  interactive,
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={`rounded-[22px] border border-white/8 bg-[#221038]/55 backdrop-blur-[20px] shadow-card transition-all duration-200
        ${interactive ? "hover:border-[#E0219C]/50 hover:bg-[#221038]/70" : ""}
        ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/** Rodapé de ações do card (linha divisória + espaçamento padrão) */
export function CardActions({
  className = "",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex gap-2 border-t border-white/8 p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
