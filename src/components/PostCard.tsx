"use client";

// ============================================================
// Card da fila de aprovação — o coração do produto.
//
// Preview fiel ao Instagram (header, imagem 4:5, legenda) +
// 3 ações auto-explicativas com micro-interações:
//   Aprovar  → card desliza p/ direita (verde) e some
//   Descartar→ card desliza p/ esquerda (vermelho) e some
//   Editar   → modal com legenda + hashtags
// ============================================================
import { useState, useTransition } from "react";
/* eslint-disable @next/next/no-img-element */
import {
  applyTemplateToPost,
  approvePost,
  discardPost,
  removeTemplateFromPost,
  schedulePost,
  updatePost,
  uploadPostImage,
  uploadPostVideo,
} from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardActions } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Input";
import { CarouselPreview } from "@/components/CarouselPreview";
import { CarouselDownload } from "@/components/CarouselDownload";
import { CarouselEditor } from "@/components/CarouselEditor";
import { resizeImageForUpload } from "@/lib/resizeImageClient";
import { useToast } from "@/components/ui/Toast";
import type { IgProfile, PostWithNews, Surface, VisualIdentity } from "@/lib/types";

type ExitDirection = "right" | "left" | null;

/** Cor do badge de score: verde ≥85, âmbar ≥70, neutro abaixo */
function scoreColor(score: number | null) {
  if ((score ?? 0) >= 85) return "bg-success/15 text-success";
  if ((score ?? 0) >= 70) return "bg-warning/15 text-warning";
  return "bg-surface-2 text-muted";
}

export function PostCard({
  post,
  profile,
  identityDefaults,
  hasInstagramConnected = false,
  templateSelection = {},
}: {
  post: PostWithNews;
  profile: IgProfile;
  identityDefaults: VisualIdentity;
  /** Sprint C — só habilita o botão "Agendar" se o cliente tiver Instagram conectado. */
  hasInstagramConnected?: boolean;
  /** Template Studio (B9) — modelo escolhido por superfície do cliente ativo. */
  templateSelection?: Partial<Record<Surface, string>>;
}) {
  const HANDLE = profile.handle;
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [hook, setHook] = useState(post.hook);
  const [caption, setCaption] = useState(post.caption);
  const [hashtags, setHashtags] = useState(post.hashtags);
  const [expanded, setExpanded] = useState(false);
  const [exit, setExit] = useState<ExitDirection>(null);
  const [gone, setGone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [promptCopied, setPromptCopied] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [removingTpl, startRemoveTpl] = useTransition();
  const [videoError, setVideoError] = useState<string | null>(null);
  const [uploadingVideo, startVideoUpload] = useTransition();
  const [scheduling, setScheduling] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    d.setSeconds(0, 0);
    // datetime-local espera horário LOCAL sem timezone (YYYY-MM-DDTHH:mm)
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  function handleToggleTemplate(checked: boolean) {
    if (checked) {
      openTplModal();
    } else {
      startRemoveTpl(() => removeTemplateFromPost(post.id));
    }
  }

  function copyImagePrompt() {
    navigator.clipboard.writeText(post.image_prompt).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    startUpload(async () => {
      try {
        // Comprime no navegador antes de enviar — evita estourar o
        // limite de payload da plataforma com fotos de celular grandes.
        const resized = await resizeImageForUpload(file);
        const fd = new FormData();
        fd.set("post_id", post.id);
        fd.set("image", resized);
        const result = await uploadPostImage(fd);
        if (!result.ok) setUploadError(result.error ?? "Falha ao subir imagem.");
      } catch {
        setUploadError("Falha ao subir imagem. Tente um arquivo menor.");
      }
    });
  }

  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setVideoError(null);
    startVideoUpload(async () => {
      try {
        const fd = new FormData();
        fd.set("post_id", post.id);
        fd.set("video", file);
        const result = await uploadPostVideo(fd);
        if (!result.ok) setVideoError(result.error ?? "Falha ao subir vídeo.");
      } catch {
        setVideoError("Falha ao subir vídeo. Tente um arquivo menor.");
      }
    });
  }

  // ---- Identidade visual (por post) ----
  // Modal prefilled: valores do post (se já aplicado) ou defaults de Ajustes.
  // IMPORTANTE: não inicializar via useState(valorInicial) — esse valor só
  // é usado no primeiro render e nunca mais é recalculado, mesmo que
  // identityDefaults mude (ex: você salvou um novo default em Ajustes).
  // Por isso o estado é recalculado toda vez que o modal ABRE, com
  // openTplModal(), lendo os props mais atuais na hora do clique.
  const [tplOpen, setTplOpen] = useState(false);
  const buildTplFromProps = (): VisualIdentity => ({
    keyword: post.tpl_keyword ?? identityDefaults.keyword,
    topText: post.tpl_top_text ?? identityDefaults.topText,
    bottomText: post.tpl_bottom_text ?? identityDefaults.bottomText,
    ctaEnabled: post.tpl_cta_enabled ?? identityDefaults.ctaEnabled,
    colorBackground:
      post.tpl_color_background ?? identityDefaults.colorBackground,
    colorAccent: post.tpl_color_accent ?? identityDefaults.colorAccent,
    colorText: post.tpl_color_text ?? identityDefaults.colorText,
    colorKeywordBox:
      post.tpl_color_keyword_box ?? identityDefaults.colorKeywordBox,
  });
  const [tpl, setTpl] = useState<VisualIdentity>(buildTplFromProps);
  const setTplField = (key: keyof VisualIdentity) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setTpl((prev) => ({ ...prev, [key]: e.target.value }));
  const toggleTplCta = (e: React.ChangeEvent<HTMLInputElement>) =>
    setTpl((prev) => ({ ...prev, ctaEnabled: e.target.checked }));

  /** Abre o modal já com os valores MAIS RECENTES (post ou default de Ajustes) */
  function openTplModal() {
    setTpl(buildTplFromProps());
    setTplOpen(true);
  }

  function submitTemplate() {
    startTransition(async () => {
      await applyTemplateToPost(post.id, {
        keyword: tpl.keyword,
        topText: tpl.topText,
        bottomText: tpl.bottomText,
        ctaEnabled: tpl.ctaEnabled,
        colorBackground: tpl.colorBackground,
        colorAccent: tpl.colorAccent,
        colorText: tpl.colorText,
        colorKeywordBox: tpl.colorKeywordBox,
      });
      setTplOpen(false);
    });
  }

  const score = post.news_items.viral_score;
  // Corta por CODE POINT (Array.from), não por índice de string: caption.slice(0,120)
  // corta no meio de um par substituto UTF-16 sempre que um emoji (ex: 🚨) cai na
  // fronteira — o caractere quebrado ("\uD83D" solto) é serializado de forma
  // diferente no HTML da SSR vs. no texto hidratado no cliente, causando o erro
  // de hydration mismatch ("Text content did not match").
  const captionChars = [...caption];
  const shortCaption =
    captionChars.length > 120 && !expanded
      ? captionChars.slice(0, 120).join("") + "…"
      : caption;

  // Carrossel (format='carousel'): a galeria são os cards renderizados,
  // em ordem. Post single: página de conteúdo + contra-capa (se houver).
  const isCarousel = post.format === "carousel";
  const cardImages = (post.carousel_cards ?? [])
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map((c) => c.image_url)
    .filter((u): u is string => !!u);
  const previewImages =
    isCarousel && cardImages.length > 0
      ? cardImages
      : [post.image_url, post.closing_image_url].filter(
          (u): u is string => !!u
        );

  /** Toca a animação de saída e só então executa a action */
  function exitAndRun(direction: Exclude<ExitDirection, null>, action: () => Promise<void>) {
    setExit(direction);
    // Espera a animação (400ms) antes de remover + revalidar
    setTimeout(() => {
      setGone(true);
      startTransition(action);
    }, 400);
  }

  if (gone) return null; // removido otimisticamente; revalidate confirma

  return (
    <>
      <Card
        className={`animate-fade-up overflow-hidden
          ${exit === "right" ? "animate-exit-right" : ""}
          ${exit === "left" ? "animate-exit-left" : ""}`}
      >
        {/* Contexto da notícia de origem */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <a
            href={post.news_items.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-caption text-muted transition-colors hover:text-content"
            title={post.news_items.title}
          >
            {post.news_items.title}
          </a>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-micro ${scoreColor(score)}`}
            title="Score viral (0-100)"
          >
            🔥 {score}
          </span>
        </div>

        {/* Imagem original da matéria (se a arte usou ela como base) —
            link direto + selo heurístico. NÃO é confirmação jurídica:
            sempre confira antes de publicar. */}
        {post.news_items.image_url && (
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-micro">
            <a
              href={post.news_items.image_url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-muted transition-colors hover:text-content"
            >
              🖼 Imagem original da fonte ↗
            </a>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 ${
                post.news_items.image_license_hint === "likely_free"
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning"
              }`}
              title="Heurística por domínio — não é confirmação jurídica. Confira sempre antes de publicar."
            >
              {post.news_items.image_license_hint === "likely_free"
                ? "provável uso livre"
                : "confirmar direitos"}
            </span>
          </div>
        )}

        {/* Foto real de banco (Pexels/Unsplash) usada na página de
            conteúdo — Unsplash exige atribuição visível; Pexels não,
            mas mostramos o crédito dos dois por transparência. */}
        {post.stock_photo_credit && (
          <div className="border-b border-line px-4 py-2 text-micro text-subtle">
            📷 {post.stock_photo_credit}
          </div>
        )}

        {/* Single: prompt de imagem + upload manual (carrossel não usa). */}
        {!isCarousel && (
        <div className="space-y-1.5 border-b border-line px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-micro text-subtle">🎨 Prompt de imagem</span>
            <div className="flex items-center gap-2">
              <a
                href="https://gemini.google.com/app"
                target="_blank"
                rel="noreferrer"
                className="text-micro text-muted transition-colors hover:text-content"
              >
                Abrir Gemini ↗
              </a>
              <button
                type="button"
                onClick={copyImagePrompt}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-muted transition-colors hover:text-content"
              >
                {promptCopied ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          </div>
          <p className="line-clamp-2 text-micro text-subtle">
            {post.image_prompt}
          </p>
          <label className="flex cursor-pointer items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-micro text-muted transition-colors hover:text-content">
            <span>
              {uploading ? "Enviando…" : "Subir imagem gerada (nano banana)"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              disabled={uploading}
              onChange={handleImageUpload}
            />
          </label>
          {uploadError && <p className="text-micro text-error">{uploadError}</p>}

          {/* Vídeo anexado (Fase 4, kit v2 §3) — upload manual, composto
              em background (Inngest + ffmpeg) no quadro Reels 9:16. */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-micro text-subtle">🎬 Reels (vídeo)</span>
            {post.video_status === "processing" && (
              <span className="text-micro text-warning">Processando…</span>
            )}
          </div>
          <label
            className={`flex cursor-pointer items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-micro text-muted transition-colors hover:text-content ${
              post.video_status === "processing" ? "opacity-50" : ""
            }`}
          >
            <span>
              {uploadingVideo
                ? "Enviando…"
                : post.video_status === "processing"
                  ? "Vídeo em processamento…"
                  : post.video_status === "ready"
                    ? "Trocar vídeo (reprocessa)"
                    : "Anexar vídeo (.mp4/.mov)"}
            </span>
            <input
              type="file"
              accept="video/mp4,video/quicktime"
              className="hidden"
              disabled={uploadingVideo || post.video_status === "processing"}
              onChange={handleVideoUpload}
            />
          </label>
          {videoError && <p className="text-micro text-error">{videoError}</p>}
          {post.video_status === "error" && !videoError && (
            <p className="text-micro text-error">
              Falha ao processar o vídeo{post.video_error ? `: ${post.video_error}` : "."} Tente de novo.
            </p>
          )}
        </div>
        )}

        {/* ===== Preview fiel ao Instagram ===== */}
        <div className="bg-black">
          {/* Header (foto/nome/@) removido: já aparece no chip da imagem — evita redundância */}

          {/* Vídeo pronto (Reels 9:16) vira a mídia principal do post —
              senão, mesma preview de sempre (single: pág 1 + contra-capa;
              carrossel: todos os cards, em ordem). */}
          {post.video_status === "ready" && post.video_url ? (
            <video
              src={post.video_url}
              poster={post.video_poster_url ?? undefined}
              controls
              className="aspect-[9/16] w-full bg-black"
            />
          ) : (
            <CarouselPreview
              images={previewImages}
              alt={post.hook}
              className="aspect-[4/5] w-full"
            />
          )}

          <div className="flex gap-4 px-3 py-2.5">
            {/* coração / comentário / compartilhar — fiéis ao IG */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7.5-4.7-9.8-9.2C.7 8.6 2.7 5 6.2 5c2.1 0 3.7 1.2 4.6 2.9L12 9.5l1.2-1.6C14.1 6.2 15.7 5 17.8 5c3.5 0 5.5 3.6 4 6.8C19.5 16.3 12 21 12 21z"/></svg>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4c-1.5 0-3-.4-4.2-1.1L3 20l1.2-5.3A8.4 8.4 0 1 1 21 11.5z"/></svg>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m22 2-11 11M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          </div>

          <div className="px-3 pb-3 text-body">
            <p className="whitespace-pre-wrap">
              <span className="font-semibold">{HANDLE}</span> {shortCaption}
            </p>
            {caption.length > 120 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-subtle transition-colors hover:text-muted"
              >
                {expanded ? "menos" : "mais"}
              </button>
            )}
            <p className="mt-1 text-secondary">{hashtags}</p>
          </div>
          {isCarousel && (
            <div className="flex flex-col gap-2 px-3 pb-3">
              {(post.carousel_cards?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => setCardsOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-caption text-muted transition-colors hover:text-content"
                >
                  ✎ Editar cards
                </button>
              )}
              <CarouselDownload
                images={previewImages}
                name={`carrossel-${post.id.slice(0, 8)}`}
              />
            </div>
          )}
        </div>

        {/* ===== Contra-capa (por post) — só para post single ===== */}
        {!isCarousel && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={post.template_applied}
              onChange={(e) => handleToggleTemplate(e.target.checked)}
              disabled={isPending || removingTpl || exit !== null}
              className="h-4 w-4 accent-[#7C5CFF]"
            />
            <span className="text-caption text-muted">
              {post.template_applied
                ? "🎨 Contra-capa adicionada (2 páginas)"
                : "Adicionar contra-capa"}
            </span>
          </label>
          {post.template_applied && (
            <button
              onClick={openTplModal}
              disabled={isPending || removingTpl || exit !== null}
              className="text-caption text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
            >
              Editar
            </button>
          )}
        </div>
        )}

        {/* ===== Ações — 1 clique, sem manual ===== */}
        <CardActions>
          <Button
            variant="primary"
            className="flex-1"
            disabled={isPending || exit !== null}
            onClick={() =>
              exitAndRun("right", async () => {
                await approvePost(post.id);
                toast("✓ Post aprovado — movido para Prontos.");
              })
            }
          >
            ✓ Aprovar
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={isPending || exit !== null || !hasInstagramConnected}
            title={
              hasInstagramConnected
                ? undefined
                : "Conecte o Instagram em Ajustes para agendar"
            }
            onClick={() => setScheduling(true)}
          >
            🗓 Agendar
          </Button>
          <Button
            variant="warning"
            className="flex-1"
            disabled={isPending || exit !== null}
            onClick={() => setEditing(true)}
          >
            ✎ Editar
          </Button>
          <Button
            variant="danger"
            className="flex-grow-0 w-[50px] shrink-0"
            disabled={isPending || exit !== null}
            onClick={() =>
              exitAndRun("left", async () => {
                await discardPost(post.id);
                toast("✕ Post descartado.");
              })
            }
          >
            ✕
          </Button>
        </CardActions>
      </Card>

      {/* ===== Drawer de edição (desliza da direita) ===== */}
      <Drawer open={editing} onClose={() => setEditing(false)} title="Editar post">
        <div className="space-y-4">
          {post.image_url && (
            <div
              className="relative h-[180px] overflow-hidden rounded-control bg-cover bg-center"
              style={{ backgroundImage: `url(${post.image_url})` }}
            />
          )}
          <Textarea
            label="Título (aparece NA IMAGEM)"
            rows={2}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
          />
          <p className="-mt-2 text-micro text-subtle">
            Ao salvar, a imagem é re-renderizada com o novo título — sem
            custo (não busca foto/gera de novo, só troca o texto).
          </p>
          <Textarea
            label="Legenda"
            rows={8}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <Textarea
            label="Hashtags"
            rows={2}
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            className="text-secondary"
          />
          <div className="rounded-control border border-white/8 bg-[#0D0418]/55 p-3.5">
            <span className="mb-1.5 block font-title text-[9.5px] tracking-[.22em] text-muted">
              NOTÍCIA-FONTE
            </span>
            <a
              href={post.news_items.url}
              target="_blank"
              rel="noreferrer"
              className="text-caption text-primary hover:underline"
            >
              {post.news_items.title} ↗
            </a>
          </div>
          <div className="mt-auto flex gap-2">
            <Button
              className="flex-1"
              loading={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updatePost(post.id, { hook, caption, hashtags });
                  setEditing(false);
                  toast("✓ Alterações salvas.");
                })
              }
            >
              Salvar alterações
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setHook(post.hook);
                setCaption(post.caption);
                setHashtags(post.hashtags);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Drawer>

      {/* ===== Drawer de edição dos cards do carrossel ===== */}
      <Drawer
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
        title="Editar cards do carrossel"
      >
        <p className="mb-3 text-caption text-muted">
          Ajuste o texto de cada card. Salvar re-renderiza só aquele card
          com as cores/fonte da marca.
        </p>
        <CarouselEditor cards={post.carousel_cards ?? []} templateSelection={templateSelection} />
      </Drawer>

      {/* ===== Modal da contra-capa (por post) ===== */}
      <Modal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title="Contra-capa deste post"
      >
        <div className="space-y-4">
          {/* Mini preview ao vivo — centralizado, multi-linha */}
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-control px-4 py-6"
            style={{ background: tpl.colorBackground }}
          >
            <div className="h-1 w-10 rounded-full" style={{ background: tpl.colorAccent }} />
            <p className="whitespace-pre-line text-center text-caption font-extrabold uppercase" style={{ color: tpl.colorText }}>
              {tpl.topText}
            </p>
            {tpl.ctaEnabled && (
              <p
                className="rounded-full px-3 py-1 text-center text-micro font-extrabold uppercase"
                style={{ background: tpl.colorAccent, color: tpl.colorText }}
              >
                COMENTE:
              </p>
            )}
            <p
              className="rounded-lg px-3 py-1 text-center text-body font-black uppercase"
              style={{ background: tpl.colorKeywordBox, color: tpl.colorText }}
            >
              {tpl.keyword}
            </p>
            <p className="whitespace-pre-line text-center text-caption font-extrabold uppercase" style={{ color: tpl.colorText }}>
              {tpl.bottomText}
            </p>
          </div>

          <Textarea
            label="Texto em cima (Enter pula linha)"
            rows={2}
            value={tpl.topText}
            onChange={setTplField("topText")}
            className="text-center"
          />
          <label className="flex cursor-pointer items-center gap-2 rounded-control bg-surface-2 px-3 py-2.5">
            <input
              type="checkbox"
              checked={tpl.ctaEnabled}
              onChange={toggleTplCta}
              className="h-4 w-4 accent-[#7C5CFF]"
            />
            <span className="text-caption text-muted">
              Mostrar &quot;COMENTE:&quot; acima da palavra-chave
            </span>
          </label>
          <Input label="Palavra-chave" value={tpl.keyword} onChange={setTplField("keyword")} className="text-center" />
          <Textarea
            label="Texto embaixo (Enter pula linha)"
            rows={2}
            value={tpl.bottomText}
            onChange={setTplField("bottomText")}
            className="text-center"
          />

          {/* Cores (default de Ajustes; editar aqui vale só p/ este post) */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["colorBackground", "Fundo"],
                ["colorAccent", "Realce"],
                ["colorText", "Texto"],
                ["colorKeywordBox", "Caixa"],
              ] as [
                "colorBackground" | "colorAccent" | "colorText" | "colorKeywordBox",
                string,
              ][]
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2"
              >
                <span className="text-caption text-muted">{label}</span>
                <input
                  type="color"
                  value={tpl[key]}
                  onChange={setTplField(key)}
                  className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent"
                />
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" loading={isPending} onClick={submitTemplate}>
              {post.template_applied ? "Salvar e re-renderizar" : "Aplicar ao post"}
            </Button>
            <Button variant="ghost" onClick={() => setTplOpen(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-micro text-subtle">
            Adiciona (ou edita) a contra-capa (2ª página do carrossel) — a
            página de conteúdo não é alterada. Os valores acima valem só
            para este post; o default de Ajustes não muda.
          </p>
        </div>
      </Modal>

      {/* ===== Modal de agendamento (Sprint C) ===== */}
      <Modal
        open={scheduling}
        onClose={() => setScheduling(false)}
        title="Agendar publicação"
      >
        <div className="space-y-4">
          <p className="text-caption text-muted">
            O post publica sozinho no Instagram no horário escolhido — sem
            precisar copiar legenda nem baixar arte.
          </p>
          <label className="block space-y-1.5">
            <span className="block text-caption text-muted">Data e hora</span>
            <input
              type="datetime-local"
              value={scheduledFor}
              min={new Date(Date.now() + 60 * 1000).toISOString().slice(0, 16)}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full rounded-control border border-line bg-surface-2 px-3 py-2.5 text-body text-content outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </label>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              loading={isPending}
              onClick={() => {
                setScheduling(false);
                exitAndRun("right", async () => {
                  await schedulePost(post.id, new Date(scheduledFor).toISOString());
                  toast("🗓 Post agendado.");
                });
              }}
            >
              Confirmar agendamento
            </Button>
            <Button variant="ghost" onClick={() => setScheduling(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
