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
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
/* eslint-disable @next/next/no-img-element */
import {
  applyTemplateToPost,
  approvePost,
  discardPost,
  removeTemplateFromPost,
  schedulePost,
  updatePost,
  uploadPostImage,
  attachUploadedPostVideo,
  createVideoUploadTicket,
  convertPostFormat,
  savePostBackground,
  savePostEyebrow,
  savePostMarkColor,
} from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Card, CardActions } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Modal } from "@/components/ui/Modal";
import { LoadingOrb } from "@/components/ui/LoadingOrb";
import { Input, Textarea } from "@/components/ui/Input";
import { useQueueSelection } from "@/components/QueueSelection";
import { CarouselPreview } from "@/components/CarouselPreview";
import { CarouselDownload } from "@/components/CarouselDownload";
import { CarouselEditor } from "@/components/CarouselEditor";
import { resizeImageForUpload } from "@/lib/resizeImageClient";
import { MAX_VIDEO_BYTES, uploadVideoWithTicket } from "@/lib/upload-video-client";
import { useToast } from "@/components/ui/Toast";
import type { PreviewPage } from "@/lib/post-preview";
import type { IgProfile, PostWithNews, Surface, VisualIdentity } from "@/lib/types";

type ExitDirection = "right" | "left" | null;

/** Os três enquadramentos de vídeo, como ÍCONE — o nome longo de cada um
 * virava três linhas de texto empilhadas na fila. O rótulo continua no
 * title/aria pra quem precisa ler. */
const VIDEO_SHAPES: {
  shape: "reels" | "feed" | "feed-blur";
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    shape: "reels",
    label: "Reels (vertical, 9:16)",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="6" y="2" width="12" height="20" rx="2.5" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    shape: "feed",
    label: "Feed (4:5, fundo da marca)",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    shape: "feed-blur",
    label: "Feed (4:5, fundo borrado do vídeo)",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="4" width="18" height="16" rx="2.5" strokeDasharray="3 2.5" />
        <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

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
  previewPages,
}: {
  post: PostWithNews;
  profile: IgProfile;
  identityDefaults: VisualIdentity;
  /** Sprint C — só habilita o botão "Agendar" se o cliente tiver Instagram conectado. */
  hasInstagramConnected?: boolean;
  /** Template Studio (B9) — modelo escolhido por superfície do cliente ativo. */
  templateSelection?: Partial<Record<Surface, string>>;
  /** Preview AO VIVO (migration 040): post na fila não tem arte gravada —
   * estas páginas são desenhadas na hora, com o Brand Kit atual. Ausente
   * só se a montagem do preview falhou (cai na arte antiga). */
  previewPages?: PreviewPage[];
}) {
  const HANDLE = profile.handle;
  const toast = useToast();
  const router = useRouter();
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

  // Polling automático enquanto o vídeo processa em background (Inngest
  // + ffmpeg pode levar dezenas de segundos) — sem isso o card ficava
  // preso em "processando" até o usuário dar refresh manual na página.
  // router.refresh() busca o post de novo no servidor; quando o job
  // termina, video_status muda e o efeito abaixo para sozinho.
  useEffect(() => {
    const trabalhando = post.video_status === "processing" || post.convert_status === "pending";
    if (!trabalhando) return;
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [post.video_status, post.convert_status, router]);

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

  // ---- Fundo deste post (migration 042) ----
  // A cor do TEXTO não entra aqui de propósito: ela é derivada da
  // luminância do fundo no resolveRenderSpec, senão dava pra escolher
  // texto branco em fundo branco.
  const [bgMode, setBgMode] = useState(post.bg_mode ?? "brand");
  const [bgColor, setBgColor] = useState(post.bg_color ?? "#FFFFFF");
  const [bgPending, startBgSave] = useTransition();

  function applyBackground(mode: "brand" | "light" | "dark" | "custom", color?: string) {
    setBgMode(mode);
    if (color) setBgColor(color);
    startBgSave(async () => {
      await savePostBackground(post.id, mode, color ?? bgColor);
      // O preview é montado no servidor com o Brand Kit + os campos do
      // post, então precisa de um refresh pra redesenhar com a cor nova.
      router.refresh();
    });
  }

  // ---- Cor do wordmark (migration 043) ----
  const [markMode, setMarkMode] = useState(post.mark_mode ?? "accent");
  const [markColor, setMarkColor] = useState(post.mark_color ?? "#FFFFFF");

  function applyMark(mode: "accent" | "title" | "custom", color?: string) {
    setMarkMode(mode);
    if (color) setMarkColor(color);
    startBgSave(async () => {
      await savePostMarkColor(post.id, mode, color ?? markColor);
      router.refresh();
    });
  }

  // ---- Rótulo do topo (migration 046) ----
  // Salva no blur/Enter, não a cada tecla: é campo de texto, e um save
  // por caractere renderizaria o preview do servidor a cada letra.
  const [eyebrow, setEyebrow] = useState(post.eyebrow ?? "");

  function saveEyebrow() {
    const value = eyebrow.trim();
    if (value === (post.eyebrow ?? "")) return;
    startBgSave(async () => {
      await savePostEyebrow(post.id, value);
      router.refresh();
    });
  }

  // Seleção múltipla da fila (null fora da grade — ver QueueSelection).
  const selection = useQueueSelection();

  const [advanced, setAdvanced] = useState(false);
  const isVideoPost = post.format === "video" || post.format === "video_feed";
  const videoPronto = post.video_status === "ready";
  /** Enquadramento em uso — só marca o ícone quando o vídeo está pronto. */
  const videoAtivo =
    videoPronto && isVideoPost ? post.video_shape ?? (post.format === "video_feed" ? "feed" : "reels") : null;
  const videoOcupado = uploadingVideo || post.video_status === "processing";
  const convertendo = post.convert_status === "pending";

  /** Post de vídeo virando carrossel: o vídeo tem que ir pra ALGUM card,
   * e só o cliente sabe se ele é o gancho (capa) ou a explicação (miolo). */
  const [videoDestino, setVideoDestino] = useState(false);

  // Trava LOCAL do clique: `convertendo` vem do servidor e só chega no
  // próximo refresh, então dois cliques rápidos enfileiravam dois jobs
  // pro mesmo post (aconteceu em 29/07 — dois runs, e o segundo deixava
  // o post preso em 'pending' até o conserto do job).
  const [convertPedido, setConvertPedido] = useState(false);

  function convertFormat(target: "single" | "carousel", videoOn?: "cover" | "interior") {
    if (convertPedido || convertendo) return;
    setConvertPedido(true);
    setVideoDestino(false);
    startTransition(async () => {
      try {
        await convertPostFormat(post.id, target, videoOn);
        router.refresh();
      } finally {
        setConvertPedido(false);
      }
    });
  }

  function pedirConversao() {
    // Vídeo pronto + virando carrossel = pergunta onde ele fica.
    if (!isCarousel && videoPronto) setVideoDestino(true);
    else convertFormat(isCarousel ? "single" : "carousel");
  }

  function handleVideoUpload(shape: "reels" | "feed" | "feed-blur") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
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
          // O arquivo vai DIRETO pro Storage: passar por Server Action
          // esbarra no teto de 4,5MB da função serverless da Vercel.
          const ticket = await createVideoUploadTicket({ postId: post.id });
          const sent = await uploadVideoWithTicket(file, ticket);
          if (!sent.ok) {
            setVideoError(sent.error ?? "Falha ao subir vídeo.");
            return;
          }
          const result = await attachUploadedPostVideo(post.id, shape);
          if (!result.ok) setVideoError(result.error ?? "Falha ao subir vídeo.");
        } catch {
          setVideoError("Falha ao subir vídeo. Tente de novo.");
        }
      });
    };
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
  const sortedCards = (post.carousel_cards ?? []).slice().sort((a, b) => a.idx - b.idx);
  const cardsWithImage = sortedCards.filter((c) => !!c.image_url);
  // videos/posters ficam na MESMA ordem/tamanho de previewImages — cada
  // posição corresponde ao mesmo card, null quando esse card não tem
  // vídeo pronto (CarouselPreview mostra a imagem nesse caso).
  const previewImages =
    isCarousel && cardsWithImage.length > 0
      ? cardsWithImage.map((c) => c.image_url as string)
      : [post.image_url, post.closing_image_url].filter(
          (u): u is string => !!u
        );
  const previewVideos =
    isCarousel && cardsWithImage.length > 0
      ? cardsWithImage.map((c) => (c.video_status === "ready" ? c.video_url : null))
      : undefined;
  const previewPosters =
    isCarousel && cardsWithImage.length > 0
      ? cardsWithImage.map((c) => c.video_poster_url)
      : undefined;

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
        {/* Contexto da notícia de origem + código do post (045), que é o
            que a pessoa cita no suporte — o id é UUID. */}
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
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Seleção múltipla: só aparece dentro da grade da fila (fora
                dela o contexto é null). Aprovar/descartar em lote ficam
                na barra do topo — ver QueueSelection. */}
            {selection && (
              <input
                type="checkbox"
                checked={selection.isSelected(post.id)}
                disabled={selection.busy}
                onChange={() => selection.toggle(post.id)}
                aria-label={`Selecionar post #${String(post.ref ?? 0).padStart(4, "0")}`}
                className="h-4 w-4 cursor-pointer accent-[rgb(var(--color-primary))]"
              />
            )}
            <span
              className="font-mono text-micro text-subtle"
              title="Código deste post — use ele pra falar do post no suporte"
            >
              #{String(post.ref ?? 0).padStart(4, "0")}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-micro ${scoreColor(score)}`}
              title="Score viral (0-100)"
            >
              🔥 {score}
            </span>
          </div>
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

        {/* ===== Barra de decisão =====
            A fila é onde o cliente OLHA o conteúdo e decide o que fazer
            com ele. Então só o que é decisão fica aqui: virar vídeo,
            trocar de formato, ou abrir os ajustes finos. Tudo o que é
            acabamento (prompt, fundo, wordmark, imagem manual) foi pro
            painel "Ajustes avançados" — a tela é usada por gente que não
            é de tecnologia, e antes tinha 8 controles empilhados. */}
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <div className="flex items-center gap-1.5">
            {VIDEO_SHAPES.map(({ shape, label, icon }) => {
              const ativo = videoAtivo === shape;
              return (
                <label
                  key={shape}
                  title={label}
                  aria-label={label}
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors ${
                    ativo
                      ? "bg-content text-surface"
                      : "bg-surface-2 text-muted hover:text-content"
                  } ${videoOcupado ? "pointer-events-none opacity-50" : ""}`}
                >
                  {icon}
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime"
                    className="hidden"
                    disabled={videoOcupado}
                    onChange={handleVideoUpload(shape)}
                  />
                </label>
              );
            })}
            {videoAtivo && (
              <span className="ml-1 text-micro text-subtle">
                {VIDEO_SHAPES.find((v) => v.shape === videoAtivo)?.label}
              </span>
            )}
            {videoOcupado && (
              <span className="ml-1 text-micro text-warning">
                {uploadingVideo ? "enviando…" : "processando…"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Trocar de formato (migration 044): o formato foi decidido
                antes do cliente ver o conteúdo, aqui ele corrige. */}
            <button
              type="button"
              onClick={pedirConversao}
              disabled={convertendo || convertPedido}
              title={
                isCarousel
                  ? "Transformar em post único"
                  : videoPronto
                    ? "Transformar em carrossel (o vídeo vira um card)"
                    : "Transformar em carrossel"
              }
              className="rounded-full bg-surface-2 px-2.5 py-1 text-micro text-muted transition-colors hover:text-content disabled:opacity-40"
            >
              {convertendo ? "convertendo…" : isCarousel ? "→ Post único" : "→ Carrossel"}
            </button>
            <button
              type="button"
              onClick={() => setAdvanced(true)}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-micro text-muted transition-colors hover:text-content"
            >
              ⚙ Ajustes avançados
            </button>
          </div>
        </div>
        {(videoError || post.convert_error) && (
          <p className="border-b border-line px-4 pb-2 text-micro text-error">
            {videoError ?? post.convert_error}
          </p>
        )}

        {/* ===== Preview fiel ao Instagram ===== */}
        <div className="bg-black">
          {/* Header (foto/nome/@) removido: já aparece no chip da imagem — evita redundância */}

          {/* Vídeo pronto (Reels 9:16 ou feed 4:5) vira a mídia principal do
              post — senão, mesma preview de sempre (single: pág 1 +
              contra-capa; carrossel: todos os cards, em ordem). Enquanto
              upload/processamento (imagem OU vídeo) está rolando, o orbe
              da marca gira por cima pra deixar claro que tem algo em
              andamento (sem isso só o botão dizia "processando", a
              prévia ficava parada/enganosa). */}
          {post.video_status === "ready" && post.video_url ? (
            <video
              src={post.video_url}
              poster={post.video_poster_url ?? undefined}
              controls
              className={`w-full bg-black ${post.format === "video_feed" ? "aspect-[4/5]" : "aspect-[9/16]"}`}
            />
          ) : (
            <div className="relative">
              <CarouselPreview
                images={previewImages}
                pages={previewPages}
                videos={previewVideos}
                posters={previewPosters}
                alt={post.hook}
                className="aspect-[4/5] w-full"
              />
              {/* Conversão de formato (044) roda em job: sem o orbe, o
                  card ficava parado com os botões apagados e nenhuma
                  pista de que algo estava acontecendo — o `router.refresh`
                  não dispara o loading.tsx da rota. */}
              {convertendo ? (
                <LoadingOrb label={isCarousel ? "virando post único" : "virando carrossel"} />
              ) : (
                (uploading || uploadingVideo || post.video_status === "processing") && <LoadingOrb />
              )}
            </div>
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

        {/* ===== Ações — 1 clique, sem manual =====
            Só ícone + title (tooltip nativo no hover) — o texto ao lado
            de cada botão poluía o card; o ícone já é reconhecível e o
            tooltip cobre quem precisar confirmar. */}
        <CardActions>
          <Button
            variant="primary"
            className="flex-1"
            title="Aprovar"
            aria-label="Aprovar"
            disabled={isPending || exit !== null}
            onClick={() =>
              exitAndRun("right", async () => {
                await approvePost(post.id);
                toast("✓ Post aprovado — movido para Prontos.");
              })
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            title={hasInstagramConnected ? "Agendar" : "Conecte o Instagram em Ajustes para agendar"}
            aria-label="Agendar"
            disabled={isPending || exit !== null || !hasInstagramConnected}
            onClick={() => setScheduling(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 3v3M16 3v3" /></svg>
          </Button>
          <Button
            variant="warning"
            className="flex-1"
            title="Editar"
            aria-label="Editar"
            disabled={isPending || exit !== null}
            onClick={() => setEditing(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </Button>
          <Button
            variant="danger"
            className="flex-grow-0 w-[50px] shrink-0"
            title="Descartar"
            aria-label="Descartar"
            disabled={isPending || exit !== null}
            onClick={() =>
              exitAndRun("left", async () => {
                await discardPost(post.id);
                toast("✕ Post descartado.");
              })
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </Button>
        </CardActions>
      </Card>

      {/* Onde o vídeo fica quando o post vira carrossel */}
      <Modal
        open={videoDestino}
        onClose={() => setVideoDestino(false)}
        title="Onde entra o vídeo?"
      >
        <p className="mb-4 text-body text-muted">
          O carrossel vai ter várias páginas. O vídeo que você anexou fica
          em uma delas — as outras viram cards de texto.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={() => convertFormat("carousel", "cover")}>
            Na capa — o vídeo é o gancho
          </Button>
          <Button variant="secondary" onClick={() => convertFormat("carousel", "interior")}>
            No meio — o vídeo explica um ponto
          </Button>
          <Button variant="ghost" onClick={() => setVideoDestino(false)}>
            Cancelar
          </Button>
        </div>
      </Modal>

      {/* ===== Ajustes avançados =====
          Tudo o que é ACABAMENTO mora aqui: prompt, imagem manual, fundo
          e cor do wordmark. Na fila ficam só as decisões. */}
      <Drawer open={advanced} onClose={() => setAdvanced(false)} title="Ajustes avançados">
        <div className="space-y-5">
          {/* O básico primeiro: o que a pessoa procura quando abre o
              painel sem saber o que quer mexer. Código do post pra citar
              no suporte, formato atual e a contra-capa, que é a única
              escolha simples que vale por post. */}
          <section className="space-y-2 rounded-control bg-surface-2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption text-muted">Este post</span>
              <span className="font-mono text-micro text-subtle">
                #{String(post.ref ?? 0).padStart(4, "0")}
              </span>
            </div>
            <p className="text-micro text-subtle">
              {isCarousel
                ? `Carrossel · ${post.carousel_cards?.length ?? 0} páginas`
                : isVideoPost
                  ? `Vídeo · ${post.video_shape === "reels" ? "Reels 9:16" : "feed 4:5"}`
                  : "Post único · 1 página"}
            </p>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={post.template_applied}
                disabled={isCarousel || removingTpl}
                onChange={(e) => handleToggleTemplate(e.target.checked)}
                className="h-4 w-4 accent-[rgb(var(--color-primary))]"
              />
              <span className="text-micro text-muted">
                Página final com a identidade da marca
                {isCarousel ? " (só em post único)" : ""}
              </span>
            </label>
          </section>
          {/* Prompt: de VÍDEO quando o post é vídeo. Antes mostrava
              sempre o prompt de imagem, que num Reels não descreve nada
              do que se vê. */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption text-muted">
                {isVideoPost ? "🎬 O que gravar/buscar" : "🎨 Prompt de imagem"}
              </span>
              {!isVideoPost && (
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
              )}
            </div>
            <p className="text-micro text-subtle">
              {isVideoPost
                ? "Grave (ou baixe) um clipe que mostre o assunto do título. Vertical vira Reels; deitado encaixa melhor no feed 4:5."
                : post.image_prompt}
            </p>
            {!isVideoPost && (
              <label className="flex cursor-pointer items-center justify-between gap-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-micro text-muted transition-colors hover:text-content">
                <span>{uploading ? "Enviando…" : "Subir imagem gerada"}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  disabled={uploading}
                  onChange={handleImageUpload}
                />
              </label>
            )}
            {uploadError && <p className="text-micro text-error">{uploadError}</p>}
          </section>

          {/* Fundo da arte (migration 042) — vale só pra ESTE post e
              congela na aprovação. */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption text-muted">🎨 Fundo da arte</span>
              {bgPending && <span className="text-micro text-subtle">salvando…</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["brand", "Marca"],
                  ["light", "Claro"],
                  ["dark", "Escuro"],
                  ["custom", "Outra"],
                ] as ["brand" | "light" | "dark" | "custom", string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={bgMode === mode}
                  onClick={() => applyBackground(mode)}
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
                    onChange={(e) => applyBackground("custom", e.target.value)}
                    aria-label="Cor de fundo personalizada"
                    className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="text-micro text-muted">{bgColor.toUpperCase()}</span>
                </label>
              )}
            </div>
            <p className="text-micro text-subtle">
              A cor do texto se ajusta sozinha ao fundo escolhido.
            </p>
          </section>

          {/* Cor do wordmark (migration 043). */}
          <section className="space-y-1.5">
            <span className="text-caption text-muted">✒️ Cor da marca na arte</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["accent", "Realce"],
                  ["title", "Igual ao título"],
                  ["custom", "Outra"],
                ] as ["accent" | "title" | "custom", string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={markMode === mode}
                  onClick={() => applyMark(mode)}
                  className={`rounded-full px-2.5 py-1 text-micro transition-colors ${
                    markMode === mode
                      ? "bg-content text-surface"
                      : "bg-surface-2 text-muted hover:text-content"
                  }`}
                >
                  {label}
                </button>
              ))}
              {markMode === "custom" && (
                <label className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-1">
                  <input
                    type="color"
                    value={markColor}
                    onChange={(e) => applyMark("custom", e.target.value)}
                    aria-label="Cor do wordmark"
                    className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                  <span className="text-micro text-muted">{markColor.toUpperCase()}</span>
                </label>
              )}
            </div>
          </section>

          {/* Rótulo do topo (migration 046) — era constante do preset, e
              é onde vai edição/seção do conteúdo. Vazio volta ao padrão. */}
          <section className="space-y-1.5">
            <span className="text-caption text-muted">🏷 Rótulo do topo</span>
            <Input
              value={eyebrow}
              maxLength={28}
              placeholder="Nº01 · ENSAIO"
              aria-label="Rótulo do topo da capa"
              onChange={(e) => setEyebrow(e.target.value)}
              onBlur={saveEyebrow}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <p className="text-micro text-subtle">
              Aparece no canto superior da capa, ao lado do @. Em branco usa o
              padrão do layout.
            </p>
          </section>
        </div>
      </Drawer>

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
