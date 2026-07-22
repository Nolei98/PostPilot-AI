"use client";

// ============================================================
// Editor de cards do carrossel: um bloco por card (título + texto).
// Salvar re-renderiza só aquele card (updateCarouselCard) e atualiza
// a galeria via router.refresh(). Overrides de marca (B9) só aparecem
// pros cards cuja superfície tem um modelo do Template Studio escolhido
// (senão não têm efeito nenhum no motor antigo).
// ============================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCarouselCard } from "@/app/actions";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { CardLayoutOverride, Surface } from "@/lib/types";

export interface EditableCard {
  id: string;
  idx: number;
  role: string;
  headline: string | null;
  body: string | null;
  layout?: CardLayoutOverride | null;
}

/** cover_image = card 0; carousel_last = último; os demais = carousel_page. */
function surfaceOf(idx: number, lastIdx: number): Surface {
  if (idx === 0) return "cover_image";
  if (idx === lastIdx) return "carousel_last";
  return "carousel_page";
}

export function CarouselEditor({
  cards,
  templateSelection = {},
}: {
  cards: EditableCard[];
  templateSelection?: Partial<Record<Surface, string>>;
}) {
  const router = useRouter();
  const sorted = [...cards].sort((a, b) => a.idx - b.idx);
  const lastIdx = sorted.length - 1;
  return (
    <div className="space-y-3">
      {sorted.map((c) => (
        <CardRow
          key={c.id}
          card={c}
          hasTemplate={!!templateSelection[surfaceOf(c.idx, lastIdx)]}
          onSaved={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function CardRow({
  card,
  hasTemplate,
  onSaved,
}: {
  card: EditableCard;
  hasTemplate: boolean;
  onSaved: () => void;
}) {
  const [headline, setHeadline] = useState(card.headline ?? "");
  const [body, setBody] = useState(card.body ?? "");
  const [showLabel, setShowLabel] = useState(card.layout?.showLabel ?? true);
  const [textColor, setTextColor] = useState<"auto" | "light" | "dark">(
    card.layout?.textColor ?? "auto"
  );
  const [pending, start] = useTransition();
  const dirty =
    headline !== (card.headline ?? "") ||
    body !== (card.body ?? "") ||
    showLabel !== (card.layout?.showLabel ?? true) ||
    textColor !== (card.layout?.textColor ?? "auto");

  return (
    <div className="space-y-2 rounded-control border border-line p-3">
      <span className="text-micro uppercase tracking-wider text-subtle">
        Card {card.idx + 1} · {card.role}
      </span>
      <Textarea
        label="Título"
        rows={2}
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
      />
      <Textarea
        label="Texto"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {hasTemplate && (
        <div className="space-y-2 rounded-control bg-surface-2 p-2.5">
          <p className="text-micro text-subtle">
            Ajustes deste card (modelo do Template Studio)
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-caption text-content">
            <input
              type="checkbox"
              checked={showLabel}
              onChange={(e) => setShowLabel(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Mostrar rótulo de marca neste card
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor={`textColor-${card.id}`} className="text-caption text-muted">
              Cor do texto
            </label>
            <select
              id={`textColor-${card.id}`}
              value={textColor}
              onChange={(e) => setTextColor(e.target.value as "auto" | "light" | "dark")}
              className="rounded-control border border-line bg-surface-1 px-2 py-1 text-caption text-content"
            >
              <option value="auto">Automática (por contraste)</option>
              <option value="light">Sempre clara</option>
              <option value="dark">Sempre escura</option>
            </select>
          </div>
        </div>
      )}
      <Button
        className="w-full"
        loading={pending}
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            await updateCarouselCard(card.id, { headline, body, showLabel, textColor });
            onSaved();
          })
        }
      >
        {dirty ? "Salvar e re-renderizar" : "Sem alterações"}
      </Button>
    </div>
  );
}
