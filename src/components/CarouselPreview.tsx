"use client";

// ============================================================
// Preview de carrossel (1 ou 2 páginas) com setas de navegação
// e indicador de página, estilo Instagram. Usado na fila de
// aprovação e na tela de "prontos para publicar".
// ============================================================
import { useState } from "react";
/* eslint-disable @next/next/no-img-element */

export function CarouselPreview({
  images,
  alt,
  className = "",
}: {
  images: string[];
  alt: string;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const hasMultiple = images.length > 1;

  function prev(e: React.MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i - 1 + images.length) % images.length);
  }
  function next(e: React.MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i + 1) % images.length);
  }

  if (images.length === 0) {
    return <div className={`skeleton ${className}`} />;
  }

  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
      <img
        src={images[index]}
        alt={`${alt} (página ${index + 1} de ${images.length})`}
        className="h-full w-full object-cover"
      />

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
            {index + 1}/{images.length}
          </span>

          {/* Dots no rodapé da imagem */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
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
