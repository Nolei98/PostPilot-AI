// ============================================================
// Previews de layout em Ajustes (kit v2 §7.7) — 4 miniaturas por preset
// (capa/carrossel/vídeo/híbrido), fiéis ao render real (mesmos builders
// SVG). Server Component puro — sem interatividade, só markup.
// ============================================================
import {
  buildCoverPreview,
  buildCarouselPreview,
  buildVideoPreview,
  buildFeedVideoPreview,
  buildHybridPreview,
  scaleSvg,
  type PreviewFormat,
} from "@/lib/layout-preview";
import type { CardBrand, LayoutPreset } from "@/lib/render-shared";

function Frame({
  svg,
  aspect,
  label,
}: {
  svg: string;
  aspect: "4:5" | "9:16";
  label?: string;
}) {
  return (
    <div className="w-full">
      <div
        className="w-full overflow-hidden rounded-md bg-black"
        style={{ aspectRatio: aspect === "4:5" ? "1080 / 1350" : "1080 / 1920" }}
        dangerouslySetInnerHTML={{ __html: scaleSvg(svg) }}
      />
      {label && <p className="mt-1 text-center text-micro text-subtle">{label}</p>}
    </div>
  );
}

export function LayoutPreview({
  layoutPreset,
  format,
  brand,
}: {
  layoutPreset: LayoutPreset;
  format: PreviewFormat;
  brand: CardBrand;
}) {
  if (format === "cover") {
    return (
      <div aria-label={`${layoutPreset} — capa normal`} className="w-24 shrink-0">
        <Frame svg={buildCoverPreview(layoutPreset, brand)} aspect="4:5" />
      </div>
    );
  }
  if (format === "carousel") {
    const [cover, interior, closing] = buildCarouselPreview(layoutPreset, brand);
    return (
      <div aria-label={`${layoutPreset} — carrossel`} className="flex w-[19.5rem] shrink-0 gap-1.5">
        <Frame svg={cover} aspect="4:5" />
        <Frame svg={interior} aspect="4:5" />
        <Frame svg={closing} aspect="4:5" />
      </div>
    );
  }
  if (format === "video") {
    return (
      <div aria-label={`${layoutPreset} — vídeo (Reels)`} className="w-16 shrink-0">
        <Frame svg={buildVideoPreview(layoutPreset, brand)} aspect="9:16" />
      </div>
    );
  }
  if (format === "video-feed") {
    return (
      <div aria-label={`${layoutPreset} — vídeo (feed, 4:5)`} className="w-24 shrink-0">
        <Frame svg={buildFeedVideoPreview(layoutPreset, brand)} aspect="4:5" />
      </div>
    );
  }
  // hybrid
  const { video, interior } = buildHybridPreview(layoutPreset, brand);
  return (
    <div aria-label={`${layoutPreset} — modelo com vídeo`} className="flex w-32 shrink-0 gap-1.5">
      <div className="w-16">
        <Frame svg={video} aspect="9:16" />
      </div>
      <div className="w-16">
        <Frame svg={interior} aspect="4:5" />
      </div>
    </div>
  );
}
