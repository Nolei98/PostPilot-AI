"use client";

// ============================================================
// Formulário da CONTRA-CAPA (Ajustes) com preview ao vivo: cores,
// palavra-chave, textos (com opção de quebra de linha) e o toggle
// "COMENTE:". O preview reproduz o layout real (barra, texto-cima,
// COMENTE:, caixa, texto-baixo).
// ============================================================
import { useState } from "react";
import type { TemplateApplyMode, VisualIdentity } from "@/lib/types";

interface Props {
  initial: VisualIdentity;
  initialMode: TemplateApplyMode;
  /** server action (form action) */
  action: (formData: FormData) => Promise<void>;
  fieldClasses: string;
}

export function IdentityForm({ initial, initialMode, action, fieldClasses }: Props) {
  // Estado local só para o preview ao vivo (o submit envia o form)
  const [v, setV] = useState<VisualIdentity>(initial);
  const [mode, setMode] = useState<TemplateApplyMode>(initialMode);

  const set = (key: keyof VisualIdentity) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [key]: e.target.value }));
  const toggleCta = (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((prev) => ({ ...prev, ctaEnabled: e.target.checked }));

  type ColorKey = "colorBackground" | "colorAccent" | "colorText" | "colorKeywordBox";
  const colorInput = (name: ColorKey, label: string) => (
    <label className="flex items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2">
      <span className="text-caption text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-micro text-subtle">{v[name]}</span>
        <input
          type="color"
          name={name === "colorBackground" ? "color_background"
            : name === "colorAccent" ? "color_accent"
            : name === "colorText" ? "color_text"
            : "color_keyword_box"}
          value={v[name]}
          onChange={set(name)}
          className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
        />
      </span>
    </label>
  );

  return (
    <form action={action} className="space-y-4">
      {/* ===== Preview ao vivo do slide (centralizado, multi-linha) ===== */}
      <div
        className="flex aspect-[4/5] max-h-80 w-full flex-col items-center justify-center gap-3 rounded-control px-6"
        style={{ background: v.colorBackground }}
      >
        <div
          className="h-1.5 w-12 rounded-full"
          style={{ background: v.colorAccent }}
        />
        <p
          className="whitespace-pre-line text-center text-caption font-extrabold uppercase tracking-wide"
          style={{ color: v.colorText }}
        >
          {v.topText}
        </p>
        {v.ctaEnabled && (
          <p
            className="rounded-full px-3 py-1 text-center text-micro font-extrabold uppercase"
            style={{ background: v.colorAccent, color: v.colorText }}
          >
            COMENTE:
          </p>
        )}
        <p
          className="rounded-lg px-4 py-1.5 text-center text-title font-black uppercase"
          style={{ background: v.colorKeywordBox, color: v.colorText }}
        >
          {v.keyword}
        </p>
        <p
          className="whitespace-pre-line text-center text-caption font-extrabold uppercase tracking-wide"
          style={{ color: v.colorText }}
        >
          {v.bottomText}
        </p>
      </div>

      {/* ===== Textos (aceitam Enter para pular linha) ===== */}
      <div className="space-y-1.5">
        <label className="block text-caption text-muted">
          Texto em cima
        </label>
        <textarea
          name="tpl_top_text"
          value={v.topText}
          onChange={set("topText")}
          rows={2}
          placeholder="Texto em cima (Enter pula linha)"
          className={`${fieldClasses} resize-y text-center`}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 rounded-control bg-surface-2 px-3 py-2.5">
        <input
          type="checkbox"
          name="tpl_cta_enabled"
          checked={v.ctaEnabled}
          onChange={toggleCta}
          className="h-4 w-4 accent-[#7C5CFF]"
        />
        <span className="text-caption text-muted">
          Mostrar &quot;COMENTE:&quot; acima da palavra-chave
        </span>
      </label>
      <input
        name="tpl_keyword"
        value={v.keyword}
        onChange={set("keyword")}
        placeholder="Palavra-chave (na caixa)"
        className={`${fieldClasses} text-center`}
      />
      <div className="space-y-1.5">
        <label className="block text-caption text-muted">
          Texto embaixo
        </label>
        <textarea
          name="tpl_bottom_text"
          value={v.bottomText}
          onChange={set("bottomText")}
          rows={2}
          placeholder="Texto embaixo (Enter pula linha)"
          className={`${fieldClasses} resize-y text-center`}
        />
      </div>

      {/* ===== Cores ===== */}
      <div className="grid grid-cols-2 gap-2">
        {colorInput("colorBackground", "Fundo")}
        {colorInput("colorAccent", "Realce")}
        {colorInput("colorText", "Texto")}
        {colorInput("colorKeywordBox", "Caixa")}
      </div>

      {/* ===== Modo de aplicação ===== */}
      <div className="space-y-2 rounded-control bg-surface-2 p-3">
        <p className="text-caption text-muted">Aplicar identidade visual em:</p>
        <label className="flex cursor-pointer items-center gap-2 text-body">
          <input
            type="radio"
            name="template_apply_mode"
            value="all"
            checked={mode === "all"}
            onChange={() => setMode("all")}
            className="accent-[#7C5CFF]"
          />
          Todos os posts{" "}
          <span className="text-caption text-subtle">(automático)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-body">
          <input
            type="radio"
            name="template_apply_mode"
            value="on_approval"
            checked={mode === "on_approval"}
            onChange={() => setMode("on_approval")}
            className="accent-[#7C5CFF]"
          />
          Só quando eu marcar na aprovação
        </label>
      </div>

      <button className="w-full rounded-control bg-primary px-4 py-2.5 text-body font-medium text-white transition-all duration-150 hover:bg-primary-hover hover:shadow-glow active:scale-[0.97]">
        Salvar contra-capa
      </button>
      <p className="text-center text-micro text-subtle">
        Posts ainda na fila que usam o default são atualizados
        automaticamente ao salvar.
      </p>
    </form>
  );
}
