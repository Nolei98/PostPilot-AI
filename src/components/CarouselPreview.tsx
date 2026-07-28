"use client";

// ============================================================
// Preview de carrossel (1 ou 2 páginas) com setas de navegação
// e indicador de página, estilo Instagram. Usado na fila de
// aprovação e na tela de "prontos para publicar".
// ============================================================
import { useState } from "react";
import { PreviewFrame } from "@/components/PreviewFrame";
import type { PreviewPage } from "@/lib/post-preview";
/* eslint-disable @next/next/no-img-element */

export function CarouselPreview({
  images,
  pages,
  alt,
  className = "",
  videos,
  posters,
}: {
  images: string[];
  /** Páginas do preview AO VIVO (post ainda na fila, arte não existe
   * — ver src/lib/post-preview.ts). Quando presente vence `images`:
   * cada slide é desenhado na hora com o Brand Kit atual. */
  pages?: PreviewPage[];
  alt: string;
  className?: string;
  /** Vídeo por slide (mesma ordem/tamanho de `images`) — quando o card
   * tem um vídeo pronto (migration 037), mostra ele em vez da imagem
   * estática. `null`/ausente nessa posição = slide continua imagem.
   * Sem isso o vídeo processava certinho no backend mas a prévia
   * principal nunca trocava pra ele (bug real reportado). */
  videos?: (string | null)[];
  posters?: (string | null)[];
}) {
  const [index, setIndex] = useState(0);
  const count = pages?.length ?? images.length;
  const hasMultiple = count > 1;
  // `videos` é o caminho ANTIGO (arte já composta, vídeo cobrindo o
  // slide). Com preview ao vivo o vídeo entra como camada da própria
  // página, no lugar certo do layout — usar os dois ao mesmo tempo
  // pintava o vídeo em tela cheia por cima do card (2026-07-28).
  const currentVideo = pages ? null : videos?.[index];

  function prev(e: React.MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i - 1 + count) % count);
  }
  function next(e: React.MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i + 1) % count);
  }

  if (count === 0) {
    return <div className={`skeleton ${className}`} />;
  }

  const slideAlt = `${alt} (página ${index + 1} de ${count})`;
  const livePage = pages?.[index];

  return (
    <div
      className={`relative overflow-hidden bg-surface-2 ${className}`}
      // O Reels é 9:16, não 4:5 — sem isso a prévia dele saía esmagada
      // dentro do quadro do feed.
      style={livePage?.aspect ? { aspectRatio: livePage.aspect.replace(" / ", "/") } : undefined}
    >
      {currentVideo ? (
        /* eslint-disable-next-line jsx-a11y/media-has-caption */
        <video
          src={currentVideo}
          poster={posters?.[index] ?? undefined}
          controls
          className="h-full w-full object-cover"
        />
      ) : livePage ? (
        <PreviewFrame page={livePage} alt={slideAlt} />
      ) : (
        <img src={images[index]} alt={slideAlt} className="h-full w-full object-cover" />
      )}

      {hasMultiple && (
        <>
          {/* Setas de navegação */}
          <button
            onClick={prev}
            aria-label="Página anterior"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={next}
            aria-label="Próxima página"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

          {/* Indicador "1/2" no canto — não colide com o chip (esquerda) */}
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-micro text-white">
            {index + 1}/{count}
          </span>

          {/* Dots no rodapé da imagem */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setIndex(i);
                }}
                aria-label={`Ir para página ${i + 1}`}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
