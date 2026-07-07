"use client";

// ============================================================
// Botão base do design system.
// Variantes: primary | secondary | ghost | success | danger
// Estados: hover (cor + leve lift), active (escala), loading
// (spinner + trava), disabled.
// ============================================================
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger" | "warning";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-[#E0219C] via-[#A020F0] to-[#7B2FF7] text-white font-title font-semibold tracking-wider shadow-[0_0_34px_rgba(224,33,156,0.35)] hover:shadow-[0_0_50px_rgba(224,33,156,0.6)] hover:-translate-y-[2px] active:translate-y-0 transition-all duration-200",
  secondary:
    "bg-transparent text-content border border-white/20 hover:border-[#E0219C] hover:text-[#E0219C] active:scale-[0.97] transition-all duration-200",
  ghost: "bg-transparent text-muted hover:text-content hover:bg-surface-2 active:scale-[0.97] transition-all duration-150",
  success: "bg-[#46E5B7]/12 border border-[#46E5B7]/50 text-[#46E5B7] hover:bg-[#46E5B7]/20 active:scale-[0.97] transition-all duration-150 font-title font-semibold tracking-wider uppercase text-micro",
  danger:
    "bg-transparent border border-[#FF5C7A]/45 text-[#FF5C7A] hover:bg-[#FF5C7A]/10 active:scale-[0.97] transition-all duration-150 font-title font-semibold tracking-wider uppercase text-micro",
  warning:
    "bg-transparent border border-[#F5B93B]/45 text-[#F5B93B] hover:bg-[#F5B93B]/10 active:scale-[0.97] transition-all duration-150 font-title font-semibold tracking-wider uppercase text-micro",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-caption rounded-[10px]",
  md: "px-5 py-3.5 text-body font-medium",
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
