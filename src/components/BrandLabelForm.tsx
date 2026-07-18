"use client";

// ============================================================
// Identidade de rótulo do Brand Kit (Sprint B+, estilo @0verlens):
// wordmark (divisor da capa), keywords e brand_mark (tratamento de
// marca dos cards) — com PREVIEW AO VIVO do rótulo/divisor.
// O render final (Satori) é o B8; aqui é uma prévia em CSS.
// ============================================================
import { useState } from "react";
import { saveBrandLabel } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import type { BrandMark } from "@/lib/types";

const MARKS: { value: BrandMark; label: string }[] = [
  { value: "auto", label: "Automático (motor de legibilidade decide)" },
  { value: "wordmark", label: "Wordmark (ex.: OVERLENS®)" },
  { value: "handle", label: "Só o @handle" },
  { value: "wordmark+handle", label: "Wordmark + @handle" },
  { value: "icon", label: "Só o ícone/logo" },
  { value: "none", label: "Sem marca" },
];

export function BrandLabelForm({
  fieldClasses,
  handle,
  accent,
  initial,
}: {
  fieldClasses: string;
  handle: string;
  accent: string;
  initial: { wordmark: string; keywords: string; brandMark: BrandMark };
}) {
  const [wordmark, setWordmark] = useState(initial.wordmark);
  const [keywords, setKeywords] = useState(initial.keywords);
  const [brandMark, setBrandMark] = useState<BrandMark>(initial.brandMark);

  const kws = keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .join(", ")
    .toUpperCase();
  const wm = (wordmark || "SUA MARCA").toUpperCase();

  const showWordmark = brandMark === "wordmark" || brandMark === "wordmark+handle" || brandMark === "auto";
  const showHandle = brandMark === "handle" || brandMark === "wordmark+handle" || brandMark === "auto";

  return (
    <form action={saveBrandLabel} className="space-y-4">
      {/* Preview ao vivo do rótulo/divisor */}
      <div className="rounded-control bg-black p-6">
        {/* Divisor da CAPA: régua — WORDMARK — régua */}
        <div className="mb-5 flex items-center justify-center gap-3">
          <span className="h-px flex-1 bg-white/40" />
          <span
            className="font-title text-[12px] font-semibold uppercase tracking-[0.25em]"
            style={{ color: accent }}
          >
            {wm}
          </span>
          <span className="h-px flex-1 bg-white/40" />
        </div>
        <p className="text-center font-title text-[22px] font-extrabold uppercase leading-[1.05] tracking-tight text-white">
          Headline em caixa alta
        </p>
        {/* Rótulo dos CARDS interiores */}
        <div className="mt-5 text-center text-[11px] uppercase tracking-[0.2em] text-white/70">
          {brandMark === "none"
            ? "—"
            : brandMark === "icon"
              ? "◔ (ícone)"
              : [showHandle ? `@${handle}` : null, showWordmark ? wm : null, kws || null]
                  .filter(Boolean)
                  .join(" · ")}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="wordmark" className="block text-caption text-muted">
          Wordmark (aparece no divisor da capa — ex.: OVERLENS®)
        </label>
        <input
          id="wordmark"
          name="wordmark"
          value={wordmark}
          onChange={(e) => setWordmark(e.target.value)}
          placeholder="Ex: SUA MARCA®"
          className={fieldClasses}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="keywords" className="block text-caption text-muted">
          Palavras-chave do rótulo (separadas por vírgula)
        </label>
        <input
          id="keywords"
          name="keywords"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="Ex: DESIGN, ARTE, TECH"
          className={fieldClasses}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="brand_mark" className="block text-caption text-muted">
          Marca nos cards interiores
        </label>
        <select
          id="brand_mark"
          name="brand_mark"
          value={brandMark}
          onChange={(e) => setBrandMark(e.target.value as BrandMark)}
          className={fieldClasses}
        >
          {MARKS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <SubmitButton savingLabel="Salvando...">Salvar identidade de rótulo</SubmitButton>
    </form>
  );
}
