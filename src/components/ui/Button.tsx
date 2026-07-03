"use client";

// ============================================================
// Botão base do design system.
// Variantes: primary | secondary | ghost | success | danger
// Estados: hover (cor + leve lift), active (escala), loading
// (spinner + trava), disabled.
// ============================================================
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover hover:shadow-glow",
  secondary:
    "bg-surface-2 text-content border border-line hover:border-primary/50 hover:bg-surface-2/70",
  ghost: "bg-transparent text-muted hover:text-content hover:bg-surface-2",
  success: "bg-success text-white hover:brightness-110",
  danger:
    "bg-surface-2 text-error border border-line hover:border-error/60 hover:bg-error/10",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-caption",
  md: "px-4 py-2.5 text-body font-medium",
};

/** Spinner minimalista para o estado loading */
function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="3" opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", loading, disabled, className = "", children, ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center gap-2 rounded-control
          transition-all duration-150 ease-out
          active:scale-[0.97]
          disabled:pointer-events-none disabled:opacity-50
          ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  }
);
