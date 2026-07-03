"use client";

// ============================================================
// Input e Textarea do design system.
// Label integrada, foco com anel violeta, erro em vermelho.
// ============================================================
import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const FIELD_CLASSES = `w-full rounded-control border border-line bg-surface-2
  px-3 py-2.5 text-body text-content placeholder:text-subtle
  outline-none transition-colors duration-150
  focus:border-primary focus:ring-2 focus:ring-primary/25`;

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, className = "", id, ...props },
  ref
) {
  const inputId = id ?? props.name;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-caption text-muted">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`${FIELD_CLASSES} ${error ? "border-error focus:border-error focus:ring-error/25" : ""} ${className}`}
        {...props}
      />
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, error, className = "", id, ...props }, ref) {
    const inputId = id ?? props.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-caption text-muted">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`${FIELD_CLASSES} resize-y ${error ? "border-error" : ""} ${className}`}
          {...props}
        />
        {error && <p className="text-caption text-error">{error}</p>}
      </div>
    );
  }
);
