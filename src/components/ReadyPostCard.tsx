"use client";

// ============================================================
// Card do post aprovado — publicação manual em 3 passos óbvios:
// 1) copiar texto  2) baixar arte  3) marcar como postado.
// Feedback: "✓ Copiado!" com pop, saída animada ao concluir.
// ============================================================
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
/* eslint-disable @next/next/no-img-element */
import JSZip from "jszip";
import { cancelSchedule, markAsPosted, retryRender, revertApproval } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardActions } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { CarouselPreview } from "@/components/CarouselPreview";
import { useToast } from "@/components/ui/Toast";
import type { PostWithNews } from "@/lib/types";

export function ReadyPostCard({
  post,
  reach = null,
}: {
  post: PostWithNews;
  /** Sprint C — alcance (24h) já coletado, só presente em posts publicados. */
  reach?: number | null;
}) {
  const toast = useToast();
  const router = useRouter();
  // Carrossel: as páginas são os CARDS, em ordem. Antes esta tela lia só
  // post.image_url + closing, então um carrossel de N páginas aparecia
  // como 1 (a capa) e o .zip saía com uma imagem só (2026-07-28).
  const cards = (post.carousel_cards ?? []).slice().sort((a, b) => a.idx - b.idx);
  const isCarousel = post.format === "carousel";
  const pages = isCarousel
    ? cards.map((c) => c.image_url).filter((u): u is string => !!u)
    : [post.image_url, post.closing_image_url].filter((u): u is string => !!u);
  /** Vídeo por página, na mesma ordem — card sem vídeo fica `null`. */
  const cardVideos = isCarousel ? cards.map((c) => c.video_url ?? null) : [];
  const cardPosters = isCarousel ? cards.map((c) => c.video_poster_url ?? null) : [];
  const hasCardVideo = cardVideos.some(Boolean);
  // Render-on-approval (migration 040): entre aprovar e a arte existir há
  // uma janela de segundos. Baixar/postar nessa janela pegaria a arte
  // vazia (ou a anterior), então o card mostra o estado e trava as ações.
  const isRendering = post.render_status === "pending" || post.render_status === "rendering";
  const renderFailed = post.render_status === "error";
  const isVideo = (post.format === "video" || post.format === "video_feed") && !!post.video_url;
  // A proporção da miniatura sai do ENQUADRAMENTO gravado, não do formato:
  // `video_shape` é o que o ffmpeg obedeceu ao compor o arquivo. Os dois
  // andam juntos hoje (savePostVideoShape atualiza os dois), mas post
  // anterior à migration 040 tem shape nulo — daí o formato como reserva.
  const isFeedVideo = (post.video_shape ?? (post.format === "video_feed" ? "feed" : "reels")) !== "reels";
  const isScheduled = post.status === "scheduled";

  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);
  const [givingUp, setGivingUp] = useState(false); // modal "Desistir"
  const [isPending, startTransition] = useTransition();

  /** Desistir: reverte a aprovação (volta pra fila ou descarta) */
  function giveUp(target: "pending_approval" | "discarded") {
    setGivingUp(false);
    setExiting(true); // animação de saída p/ esquerda
    setTimeout(() => {
      setGone(true);
      startTransition(() => revertApproval(post.id, target));
    }, 400);
  }

  // Texto final: legenda + linha em branco + hashtags
  const fullText = `${post.caption}\n\n${post.hashtags}`;

  async function copyText() {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    toast("⧉ Legenda copiada para a área de transferência.");
    setTimeout(() => setCopied(false), 2000);
  }

  /**
   * Dispara o download de um blob local (o atributo `download` de <a>
   * é ignorado em URLs cross-origin — a imagem vive no domínio do
   * Supabase — então sempre baixamos via blob local).
   */
  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** Post de vídeo (Reels): baixa o .mp4 já processado. */
  async function downloadVideo() {
    if (!post.video_url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(post.video_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      triggerDownload(await res.blob(), `post-${post.id}.mp4`);
      toast("↓ Vídeo baixado.");
    } catch {
      window.open(post.video_url, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  /** Post de 1 página: baixa a imagem única. */
  async function downloadImage() {
    if (!post.image_url || downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(post.image_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      triggerDownload(await res.blob(), `post-${post.id}.jpg`);
      toast("↓ Arte baixada.");
    } catch {
      window.open(post.image_url, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  /** Carrossel (2 páginas): baixa as duas imagens juntas num .zip. */
  async function downloadZip() {
    if (pages.length === 0 || downloading) return;
    setDownloading(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        pages.map(async (url, i) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          zip.file(`post-${post.id}-${i + 1}.jpg`, await res.blob());
        })
      );
      // Card que virou vídeo vai como .mp4 junto — só a imagem seria a
      // arte estática do card, sem o vídeo que o usuário anexou.
      await Promise.all(
        cardVideos.map(async (url, i) => {
          if (!url) return;
          const res = await fetch(url);
          if (!res.ok) return;
          zip.file(`post-${post.id}-${i + 1}.mp4`, await res.blob());
        })
      );
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `post-${post.id}-carrossel.zip`);
      toast("↓ Arte baixada em .zip.");
    } catch {
      // Fallback: abre cada imagem em nova aba para salvar manualmente
      pages.forEach((url) => window.open(url, "_blank"));
    } finally {
      setDownloading(false);
    }
  }

  // Enquanto o job monta a arte, busca o post de novo a cada 3s — quando
  // render_status sai de pending/rendering o efeito para sozinho. Sem
  // isso o card ficaria travado até um refresh manual.
  useEffect(() => {
    if (!isRendering) return;
    const id = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(id);
  }, [isRendering, router]);

  /** Tenta de novo depois de uma falha de render. */
  function handleRetryRender() {
    startTransition(async () => {
      await retryRender(post.id);
      toast("⟳ Montando a arte de novo…");
    });
  }

  const isPosted = post.status === "published";

  /** Marca como postado — o card fica na aba "Postados", só muda de estado */
  function handlePosted() {
    startTransition(async () => {
      await markAsPosted(post.id);
      toast("✓ Marcado como postado. Bom trabalho!");
    });
  }

  /** Cancela o agendamento (Sprint C) — post volta pra Fila. */
  function handleCancelSchedule() {
    startTransition(async () => {
      await cancelSchedule(post.id);
      toast("↩ Agendamento cancelado — post voltou para a Fila.");
    });
  }

  const scheduledLabel = post.scheduled_for
    ? new Date(post.scheduled_for).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  if (gone) return null;

  return (
    <>
    <Card
      className={`overflow-hidden ${exiting ? "animate-exit-right" : ""} ${isPosted ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3 p-3">
        {isVideo ? (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <video
            src={post.video_url ?? undefined}
            poster={post.video_poster_url ?? undefined}
            controls
            className={`h-28 shrink-0 rounded-control bg-black ${isFeedVideo ? "w-[89.6px]" : "w-[63px]"}`}
          />
        ) : (
          <CarouselPreview
            images={pages}
            videos={isCarousel ? cardVideos : undefined}
            posters={isCarousel ? cardPosters : undefined}
            alt={post.hook}
            className="h-28 w-[89.6px] shrink-0 rounded-control"
          />
        )}
        <div className="min-w-0 flex-1">
          {isPosted && (
            <span className="mb-1 inline-block rounded-full border border-success/50 bg-[#0D0418]/70 px-2.5 py-0.5 text-micro tracking-wider text-success">
              ✓ POSTADO
            </span>
          )}
          {isScheduled && (
            <span className="mb-1 inline-block rounded-full border border-warning/50 bg-[#0D0418]/70 px-2.5 py-0.5 text-micro tracking-wider text-warning">
              🗓 AGENDADO · {scheduledLabel}
            </span>
          )}
          {isRendering && (
            <span className="mb-1 inline-block rounded-full border border-line bg-[#0D0418]/70 px-2.5 py-0.5 text-micro tracking-wider text-muted">
              ⟳ MONTANDO A ARTE…
            </span>
          )}
          {renderFailed && (
            <span className="mb-1 inline-block rounded-full border border-error/50 bg-[#0D0418]/70 px-2.5 py-0.5 text-micro tracking-wider text-error">
              ⚠ FALHA AO MONTAR A ARTE
            </span>
          )}
          <p className="mb-1 text-body font-semibold leading-snug">
            {post.hook}
          </p>
          <p className="line-clamp-3 text-caption text-muted">
            {post.caption}
          </p>
          {isVideo && (
            <span className="mt-1 inline-block text-micro text-subtle">
              {isFeedVideo ? "🎬 Vídeo (feed, 4:5)" : "🎬 Reels (vídeo)"}
            </span>
          )}
          {!isVideo && isCarousel && (
            <span className="mt-1 inline-block text-micro text-subtle">
              🖼 carrossel · {pages.length} página{pages.length === 1 ? "" : "s"}
              {hasCardVideo ? " · com vídeo" : ""}
            </span>
          )}
          {isPosted && reach !== null && (
            <span className="mt-1 inline-block text-micro text-subtle">
              📊 alcance (24h): {reach}
            </span>
          )}
        </div>
      </div>

      {isScheduled ? (
        <CardActions>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            loading={isPending}
            disabled={exiting}
            onClick={handleCancelSchedule}
          >
            ↩ Cancelar agendamento
          </Button>
        </CardActions>
      ) : (
        <>
          <CardActions className={isPosted ? "grid grid-cols-2" : "grid grid-cols-3"}>
            <Button variant="secondary" size="sm" onClick={copyText}>
              {copied ? (
                <span className="animate-pop text-success">✓ Copiado!</span>
              ) : (
                "Copiar texto"
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={downloading || isRendering}
              disabled={
                isRendering ||
                renderFailed ||
                (isVideo ? !post.video_url : pages.length === 0)
              }
              onClick={isVideo ? downloadVideo : isCarousel ? downloadZip : downloadImage}
            >
              {isVideo ? "Baixar vídeo" : isCarousel ? "Baixar .zip" : "Baixar arte"}
            </Button>
            {!isPosted && (
              <Button
                variant="success"
                size="sm"
                loading={isPending}
                disabled={exiting || isRendering || renderFailed}
                onClick={handlePosted}
              >
                ✓ Postei
              </Button>
            )}
          </CardActions>

          {/* Falha de render: o post está aprovado mas sem arte. Tentar de
              novo é a saída normal (a causa costuma ser transitória — foto
              de fundo que não baixou, timeout do Storage). */}
          {renderFailed && !isPosted && (
            <div className="border-t border-line px-3 py-2">
              <p className="mb-2 text-micro text-error">
                {post.render_error ?? "Erro desconhecido ao montar a arte."}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                loading={isPending}
                disabled={exiting}
                onClick={handleRetryRender}
              >
                ⟳ Tentar montar de novo
              </Button>
            </div>
          )}

          {/* Desistir da aprovação (com confirmação) — só faz sentido antes de postar */}
          {!isPosted && (
            <div className="border-t border-line px-3 py-2 text-center">
              <button
                onClick={() => setGivingUp(true)}
                disabled={isPending || exiting}
                className="text-caption text-subtle transition-colors hover:text-error disabled:opacity-50"
              >
                ↩ Desistir deste post
              </button>
            </div>
          )}
        </>
      )}
    </Card>

    {/* Modal de confirmação do Desistir */}
    <Modal
      open={givingUp}
      onClose={() => setGivingUp(false)}
      title="Desistir deste post?"
    >
      <p className="mb-4 text-body text-muted">
        O post sai da lista de prontos. Você pode devolvê-lo à fila de
        aprovação ou descartá-lo de vez.
      </p>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" onClick={() => giveUp("pending_approval")}>
          ↩ Voltar para a fila de aprovação
        </Button>
        <Button variant="danger" onClick={() => giveUp("discarded")}>
          ✕ Descartar de vez
        </Button>
        <Button variant="ghost" onClick={() => setGivingUp(false)}>
          Cancelar
        </Button>
      </div>
    </Modal>
    </>
  );
}
