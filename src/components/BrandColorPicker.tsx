"use client";

// ============================================================
// Seletor da "cor da marca" (color_accent) — ÚNICO lugar que edita essa
// cor (antes também dava pra mudar em Contra-capa, o que fazia um form
// sobrescrever o outro sem querer). Aplica no realce das artes; a caixa
// da palavra-chave da contra-capa agora é independente (aba Cores &
// logo → Contra-capa).
// ============================================================
import { useState } from "react";

const PRESET_COLORS = ["#E0219C", "#7B2FF7", "#46E5B7", "#F5B93B", "#37C8F5", "#FF5C7A"];

export function BrandColorPicker({ initial }: { initial: string }) {
  const [color, setColor] = useState(initial);

  return (
    <div className="space-y-1.5">
      <span className="block text-caption text-muted">Cor da marca</span>
      <div className="flex flex-wrap items-center gap-2.5">
        {PRESET_COLORS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => setColor(hex)}
            aria-label={`Cor ${hex}`}
            aria-pressed={color === hex}
            style={{ background: hex }}
            className={`h-8 w-8 rounded-full border-2 transition-transform ${
              color === hex ? "scale-110 border-white" : "border-transparent"
            }`}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Cor personalizada"
          className="h-8 w-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
      </div>
      <input type="hidden" name="brand_color" value={color} />
      <p className="text-micro text-subtle">
        Aplica no realce das artes (barra, CTA, destaques). A cor da caixa
        da palavra-chave da contra-capa se ajusta separadamente ali embaixo.
      </p>
    </div>
  );
}
