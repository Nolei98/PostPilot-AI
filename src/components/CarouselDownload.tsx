"use client";

// ============================================================
// Baixa todos os cards de um carrossel como um .zip (card-01.png…),
// na ordem. Client-side: busca as imagens públicas e zipa com jszip.
// ============================================================
import { useState } from "react";
import JSZip from "jszip";

export function CarouselDownload({
  images,
  name = "carrossel",
}: {
  images: string[];
  name?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function download() {
    if (images.length === 0 || busy) return;
    setBusy(true);
    setError(false);
    try {
      const zip = new JSZip();
      await Promise.all(
        images.map(async (url, i) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`card ${i + 1}: ${res.status}`);
          zip.file(`card-${String(i + 1).padStart(2, "0")}.png`, await res.blob());
        })
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${name}.zip`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (images.length === 0) return null;

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-caption text-muted transition-colors hover:text-content disabled:opacity-60"
    >
      {busy
        ? "Zipando…"
        : error
          ? "Erro — tentar de novo"
          : `⬇ Baixar carrossel (${images.length} imagens)`}
    </button>
  );
}
