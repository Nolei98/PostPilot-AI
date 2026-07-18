"use client";

// ============================================================
// Editor de cards do carrossel: um bloco por card (título + texto).
// Salvar re-renderiza só aquele card (updateCarouselCard) e atualiza
// a galeria via router.refresh().
// ============================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCarouselCard } from "@/app/actions";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export interface EditableCard {
  id: string;
  idx: number;
  role: string;
  headline: string | null;
  body: string | null;
}

export function CarouselEditor({ cards }: { cards: EditableCard[] }) {
  const router = useRouter();
  const sorted = [...cards].sort((a, b) => a.idx - b.idx);
  return (
    <div className="space-y-3">
      {sorted.map((c) => (
        <CardRow key={c.id} card={c} onSaved={() => router.refresh()} />
      ))}
    </div>
  );
}

function CardRow({ card, onSaved }: { card: EditableCard; onSaved: () => void }) {
  const [headline, setHeadline] = useState(card.headline ?? "");
  const [body, setBody] = useState(card.body ?? "");
  const [pending, start] = useTransition();
  const dirty = headline !== (card.headline ?? "") || body !== (card.body ?? "");

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
      <Button
        className="w-full"
        loading={pending}
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            await updateCarouselCard(card.id, { headline, body });
            onSaved();
          })
        }
      >
        {dirty ? "Salvar e re-renderizar" : "Sem alterações"}
      </Button>
    </div>
  );
}
