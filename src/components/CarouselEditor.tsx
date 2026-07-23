"use client";

// ============================================================
// Editor de cards do carrossel: um bloco por card (título + texto).
// Salvar re-renderiza só aquele card (updateCarouselCard) e atualiza
// a galeria via router.refresh(). Overrides de marca (B9) só aparecem
// pros cards cuja superfície tem um modelo do Template Studio escolhido
// (senão não têm efeito nenhum no motor antigo).
// ============================================================
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateCarouselCard, uploadCarouselCardVideo } from "@/app/actions";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { LoadingOrb } from "@/components/ui/LoadingOrb";
import type { CardLayoutOverride, Surface } from "@/lib/types";

export interface EditableCard {
  id: string;
  idx: number;
  role: string;
  headline: string | null;
  body: string | null;
  layout?: CardLayoutOverride | null;
  // Vídeo anexado ao card (migration 037) — card "interior com vídeo".
  video_url?: string | null;
  video_poster_url?: string | null;
  video_status?: "none" | "processing" | "ready" | "error";
  video_error?: string | null;
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
  const [videoError, setVideoError] = useState<string | null>(null);
  const [uploadingVideo, startVideoUpload] = useTransition();
  const router = useRouter();
  const dirty =
    headline !== (card.headline ?? "") ||
    body !== (card.body ?? "") ||
    showLabel !== (card.layout?.showLabel ?? true) ||
    textColor !== (card.layout?.textColor ?? "auto");

  // Polling automático enquanto o vídeo do card processa em background
  // (mesmo padrão de PostCard.tsx) — sem isso o card ficava preso em
  // "processando" até o usuário dar refresh manual na página.
  useEffect(() => {
    if (card.video_status !== "processing") return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [card.video_status, router]);

  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVideoError(null);
    startVideoUpload(async () => {
      try {
        const fd = new FormData();
        fd.set("card_id", card.id);
        fd.set("video", file);
        const result = await uploadCarouselCardVideo(fd);
        if (!result.ok) setVideoError(result.error ?? "Falha ao subir vídeo.");
      } catch {
        setVideoError("Falha ao subir vídeo. Tente um arquivo menor.");
      }
    });
  }

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
      {/* Vídeo do card (migration 037) — "interior com vídeo": título +
          moldura 16:9 + corpo, mesmo pipeline do vídeo do post único. */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-micro text-subtle">🎬 Vídeo do card</span>
          {card.video_status === "processing" && (
            <span className="text-micro text-warning">Processando…</span>
          )}
        </div>
        {card.video_status === "ready" && card.video_url && (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            src={card.video_url}
            poster={card.video_poster_url ?? undefined}
            controls
            className="aspect-[4/5] w-full rounded-control bg-black"
          />
        )}
        {(uploadingVideo || card.video_status === "processing") && (
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-control bg-surface-2">
            <LoadingOrb />
          </div>
        )}
        <label
          className={`flex cursor-pointer items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-micro text-muted transition-colors hover:text-content ${
            card.video_status === "processing" ? "opacity-50" : ""
          }`}
        >
          <span>
            {uploadingVideo
              ? "Enviando…"
              : card.video_status === "processing"
                ? "Vídeo em processamento…"
                : card.video_status === "ready"
                  ? "Trocar vídeo (reprocessa)"
                  : "Anexar vídeo ao card (.mp4/.mov)"}
          </span>
          <input
            type="file"
            accept="video/mp4,video/quicktime"
            className="hidden"
            disabled={uploadingVideo || card.video_status === "processing"}
            onChange={handleVideoUpload}
          />
        </label>
        {videoError && <p className="text-micro text-error">{videoError}</p>}
        {card.video_status === "error" && !videoError && (
          <p className="text-micro text-error">
            Falha ao processar o vídeo{card.video_error ? `: ${card.video_error}` : "."} Tente de novo.
          </p>
        )}
      </div>
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
