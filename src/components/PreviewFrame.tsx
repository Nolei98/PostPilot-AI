// ============================================================
// Desenha UMA página do preview ao vivo (src/lib/post-preview.ts): a foto
// base, a banda borrada, o SVG do layout e as camadas raster (logo,
// avatar) — o mesmo empilhamento que o sharp faz no render final, só que
// em HTML/CSS.
//
// As medidas vêm todas em FRAÇÃO do quadro e viram unidades de container
// (cqw), então a página encolhe fielmente em qualquer tamanho de card. O
// blur usa cqw pelo mesmo motivo: um `blur(16px)` fixo seria proporcional
// ao quadro de 1080px, não ao preview de ~300px.
// ============================================================
import type { PreviewLayer, PreviewPage } from "@/lib/post-preview";

/** blur(16px) no quadro de 1080px = 1.48% da largura. */
const BLUR_CQW = (16 / 1080) * 100;

function Layer({ layer }: { layer: PreviewLayer }) {
  if (layer.kind === "photo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={layer.url}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }

  if (layer.kind === "blur") {
    return (
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          top: `${layer.topFrac * 100}%`,
          backdropFilter: `blur(${BLUR_CQW}cqw)`,
          WebkitBackdropFilter: `blur(${BLUR_CQW}cqw)`,
          // esfumaça a borda de cima pra não deixar costura visível entre
          // a foto nítida e a banda borrada
          maskImage: `linear-gradient(to bottom, transparent 0, #000 ${layer.featherFrac * 100}%, #000 100%)`,
          WebkitMaskImage: `linear-gradient(to bottom, transparent 0, #000 ${layer.featherFrac * 100}%, #000 100%)`,
        }}
      />
    );
  }

  if (layer.kind === "logo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={layer.url}
        alt=""
        aria-hidden
        className="absolute rounded-full object-cover ring-1 ring-inset ring-white/50"
        style={{
          top: `${layer.marginFrac * 100}cqw`,
          right: `${layer.marginFrac * 100}cqw`,
          width: `${layer.sizeFrac * 100}cqw`,
          height: `${layer.sizeFrac * 100}cqw`,
        }}
      />
    );
  }

  if (layer.kind === "video") {
    // Sem moldura = o vídeo É o fundo do quadro (Reels, feed-blur).
    // Com moldura = ele mora num retângulo 16:9 e o SVG desenha o resto
    // com um buraco exatamente aí — mesmo encaixe do ffmpeg no render.
    const style = layer.frame
      ? {
          left: `${layer.frame.xFrac * 100}%`,
          top: `${layer.frame.yFrac * 100}%`,
          width: `${layer.frame.wFrac * 100}%`,
          height: `${layer.frame.hFrac * 100}%`,
          borderRadius: `${layer.frame.radiusFrac * 100}cqw`,
        }
      : { inset: 0, width: "100%", height: "100%" };
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        src={layer.url}
        poster={layer.poster ?? undefined}
        muted
        loop
        playsInline
        autoPlay
        aria-hidden
        className="absolute object-cover"
        style={{
          ...style,
          ...(layer.blurredBackdrop ? { filter: "blur(2.5cqw)", transform: "scale(1.1)" } : {}),
        }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={layer.url}
      alt=""
      aria-hidden
      className="absolute rounded-full object-cover"
      style={{
        left: `${layer.xFrac * 100}%`,
        top: `${layer.yFrac * 100}%`,
        width: `${layer.sizeFrac * 100}cqw`,
        height: `${layer.sizeFrac * 100}cqw`,
      }}
    />
  );
}

export function PreviewFrame({
  page,
  alt,
  className = "",
}: {
  page: PreviewPage;
  alt: string;
  className?: string;
}) {
  // Post anterior à migration 040: não há foto crua pra desenhar por
  // cima, só a arte que já foi composta um dia. Mostra ela como está e
  // avisa — é honesto, e a aprovação vai gerar arte nova de qualquer jeito.
  if (page.legacyImageUrl) {
    return (
      <div className={`relative h-full w-full ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.legacyImageUrl} alt={alt} className="h-full w-full object-cover" />
        <span
          className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-micro text-white/90"
          title="Esta arte foi gerada antes do preview ao vivo existir. Ao aprovar, ela é regerada com o template atual."
        >
          arte antiga
        </span>
      </div>
    );
  }

  // Vídeo entra junto do fundo: o SVG do layout vem por cima e é ele que
  // recorta a moldura (buraco transparente) ou desenha o véu de leitura.
  const photos = page.layers.filter(
    (l) => l.kind === "photo" || l.kind === "blur" || l.kind === "video"
  );
  const marks = page.layers.filter((l) => l.kind === "logo" || l.kind === "avatar");

  return (
    <div
      role="img"
      aria-label={alt}
      className={`relative h-full w-full overflow-hidden bg-surface-2 ${className}`}
      style={{ containerType: "inline-size" }}
    >
      {photos.map((l, i) => (
        <Layer key={`bg-${i}`} layer={l} />
      ))}
      <div
        aria-hidden
        className="absolute inset-0"
        dangerouslySetInnerHTML={{ __html: page.svg }}
      />
      {marks.map((l, i) => (
        <Layer key={`mark-${i}`} layer={l} />
      ))}
    </div>
  );
}
