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
import {
  updateCarouselCard,
  attachUploadedCardVideo,
  createVideoUploadTicket,
  uploadCarouselCardImage,
} from "@/app/actions";
import { MAX_VIDEO_BYTES, uploadVideoWithTicket } from "@/lib/upload-video-client";
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
          isInterior={c.idx !== 0 && c.idx !== lastIdx}
          onSaved={() => router.refresh()}
        />
      ))}
    </div>
  );
}

function CardRow({
  card,
  hasTemplate,
  isInterior,
  onSaved,
}: {
  card: EditableCard;
  hasTemplate: boolean;
  /** Só cards interiores (nem capa nem fechamento) aceitam a posição de
   * imagem topo/base — capa/fechamento têm banda de identidade própria. */
  isInterior: boolean;
  onSaved: () => void;
}) {
  const [headline, setHeadline] = useState(card.headline ?? "");
  const [body, setBody] = useState(card.body ?? "");
  const [showLabel, setShowLabel] = useState(card.layout?.showLabel ?? true);
  const [textColor, setTextColor] = useState<"auto" | "light" | "dark">(
    card.layout?.textColor ?? "auto"
  );
  const [imagePosition, setImagePosition] = useState<"top" | "bottom" | "">(
    card.layout?.imagePosition ?? ""
  );
  // Fundo DESTE card. 'brand' aqui significa "herda o fundo do post" — o
  // post já pode ter trocado o dele (migration 042).
  const [bgMode, setBgMode] = useState<"brand" | "light" | "dark" | "custom">(
    card.layout?.bgMode ?? "brand"
  );
  const [bgColor, setBgColor] = useState(card.layout?.bgColor ?? "#FFFFFF");
  const [pending, start] = useTransition();
  const [videoError, setVideoError] = useState<string | null>(null);
  const [uploadingVideo, startVideoUpload] = useTransition();
  const [imageError, setImageError] = useState<string | null>(null);
  const [uploadingImage, startImageUpload] = useTransition();
  const router = useRouter();
  const dirty =
    headline !== (card.headline ?? "") ||
    body !== (card.body ?? "") ||
    showLabel !== (card.layout?.showLabel ?? true) ||
    textColor !== (card.layout?.textColor ?? "auto") ||
    imagePosition !== (card.layout?.imagePosition ?? "") ||
    bgMode !== (card.layout?.bgMode ?? "brand") ||
    (bgMode === "custom" && bgColor !== (card.layout?.bgColor ?? "#FFFFFF"));

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError(null);
    startImageUpload(async () => {
      try {
        const fd = new FormData();
        fd.set("card_id", card.id);
        fd.set("image", file);
        const result = await uploadCarouselCardImage(fd);
        if (!result.ok) setImageError(result.error ?? "Falha ao subir imagem.");
        else onSaved();
      } catch {
        setImageError("Falha ao subir imagem. Tente um arquivo menor.");
      }
    });
  }

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
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError("Vídeo muito grande (máx 50MB).");
      return;
    }
    startVideoUpload(async () => {
      try {
        // Direto pro Storage — Server Action tem teto de 4,5MB na Vercel.
        const ticket = await createVideoUploadTicket({ cardId: card.id });
        const sent = await uploadVideoWithTicket(file, ticket);
        if (!sent.ok) {
          setVideoError(sent.error ?? "Falha ao subir vídeo.");
          return;
        }
        const result = await attachUploadedCardVideo(card.id);
        if (!result.ok) setVideoError(result.error ?? "Falha ao subir vídeo.");
      } catch {
        setVideoError("Falha ao subir vídeo. Tente de novo.");
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
      {/* Imagem de fundo do card — capa, interior e fechamento. */}
      <div className="space-y-1.5">
        <label
          className={`flex cursor-pointer items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-micro text-muted transition-colors hover:text-content ${
            uploadingImage ? "opacity-50" : ""
          }`}
        >
          <span>{uploadingImage ? "Enviando…" : "Trocar imagem de fundo"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            disabled={uploadingImage}
            onChange={handleImageUpload}
          />
        </label>
        {uploadingImage && (
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-control bg-surface-2">
            <LoadingOrb />
          </div>
        )}
        {imageError && <p className="text-micro text-error">{imageError}</p>}
        {/* Fundo deste card — sobrepõe o do post. Útil pra dar ritmo ao
            carrossel (uma página escura no meio de páginas claras). */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-caption text-muted">Fundo</span>
          {(
            [
              ["brand", "Do post"],
              ["light", "Claro"],
              ["dark", "Escuro"],
              ["custom", "Outra"],
            ] as ["brand" | "light" | "dark" | "custom", string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={bgMode === mode}
              onClick={() => setBgMode(mode)}
              className={`rounded-full px-2.5 py-1 text-micro transition-colors ${
                bgMode === mode
                  ? "bg-content text-surface"
                  : "bg-surface-2 text-muted hover:text-content"
              }`}
            >
              {label}
            </button>
          ))}
          {bgMode === "custom" && (
            <label className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-1">
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                aria-label={`Cor de fundo do card ${card.idx + 1}`}
                className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <span className="text-micro text-muted">{bgColor.toUpperCase()}</span>
            </label>
          )}
        </div>
        {isInterior && (
          <div className="flex items-center gap-2">
            <label htmlFor={`imgpos-${card.id}`} className="text-caption text-muted">
              Posição da imagem
            </label>
            <select
              id={`imgpos-${card.id}`}
              value={imagePosition}
              onChange={(e) => setImagePosition(e.target.value as "top" | "bottom" | "")}
              className="rounded-control border border-line bg-surface-1 px-2 py-1 text-caption text-content"
            >
              <option value="">Padrão (foto no card inteiro)</option>
              <option value="top">Imagem no topo, texto embaixo</option>
              <option value="bottom">Imagem embaixo, texto em cima</option>
            </select>
          </div>
        )}
      </div>
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
            await updateCarouselCard(card.id, {
              headline,
              body,
              showLabel,
              textColor,
              imagePosition: imagePosition || null,
              bgMode,
              bgColor: bgMode === "custom" ? bgColor : null,
            });
            onSaved();
          })
        }
      >
        {dirty ? "Salvar e re-renderizar" : "Sem alterações"}
      </Button>
    </div>
  );
}
