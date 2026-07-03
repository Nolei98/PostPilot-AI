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
      className={`rounded-card border border-line bg-surface shadow-card
        ${interactive ? "transition-colors duration-150 hover:border-primary/40" : ""}
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
      className={`flex gap-2 border-t border-line p-3 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
