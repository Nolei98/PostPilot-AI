"use client";

// ============================================================
// Card do post aprovado — publicação manual em 3 passos óbvios:
// 1) copiar texto  2) baixar arte  3) marcar como postado.
// Feedback: "✓ Copiado!" com pop, saída animada ao concluir.
// ============================================================
import { useState, useTransition } from "react";
/* eslint-disable @next/next/no-img-element */
import JSZip from "jszip";
import { markAsPosted, revertApproval } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardActions } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { CarouselPreview } from "@/components/CarouselPreview";
import { useToast } from "@/components/ui/Toast";
import type { PostWithNews } from "@/lib/types";

export function ReadyPostCard({ post }: { post: PostWithNews }) {
  const toast = useToast();
  const pages = [post.image_url, post.closing_image_url].filter(
    (u): u is string => !!u
  );
  const isCarousel = pages.length > 1;

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

  const isPosted = post.status === "published";

  /** Marca como postado — o card fica na aba "Postados", só muda de estado */
  function handlePosted() {
    startTransition(async () => {
      await markAsPosted(post.id);
      toast("✓ Marcado como postado. Bom trabalho!");
    });
  }

  if (gone) return null;

  return (
    <>
    <Card
      className={`overflow-hidden ${exiting ? "animate-exit-right" : ""} ${isPosted ? "opacity-60" : ""}`}
    >
      <div className="flex gap-3 p-3">
        <CarouselPreview
          images={pages}
          alt={post.hook}
          className="h-28 w-[89.6px] shrink-0 rounded-control"
        />
        <div className="min-w-0 flex-1">
          {isPosted && (
            <span className="mb-1 inline-block rounded-full border border-success/50 bg-[#0D0418]/70 px-2.5 py-0.5 text-micro tracking-wider text-success">
              ✓ POSTADO
            </span>
          )}
          <p className="mb-1 text-body font-semibold leading-snug">
            {post.hook}
          </p>
          <p className="line-clamp-3 text-caption text-muted">
            {post.caption}
          </p>
          {isCarousel && (
            <span className="mt-1 inline-block text-micro text-subtle">
              🖼 carrossel · 2 páginas
            </span>
          )}
        </div>
      </div>

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
          loading={downloading}
          disabled={pages.length === 0}
          onClick={isCarousel ? downloadZip : downloadImage}
        >
          {isCarousel ? "Baixar .zip" : "Baixar arte"}
        </Button>
        {!isPosted && (
          <Button
            variant="success"
            size="sm"
            loading={isPending}
            disabled={exiting}
            onClick={handlePosted}
          >
            ✓ Postei
          </Button>
        )}
      </CardActions>

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
