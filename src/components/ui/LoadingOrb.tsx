// ============================================================
// Indicador de carregamento (upload/processamento de imagem ou vídeo
// em andamento) — o mesmo orbe da marca (orb-logo-pulse, AppShell),
// girando em vez de pulsando. Overlay sobre a prévia do post.
// ============================================================
export function LoadingOrb({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55">
      <span aria-hidden="true" className="orb-logo-spin block h-12 w-12 rounded-full" />
      {label && <span className="text-micro font-semibold uppercase tracking-wider text-white">{label}</span>}
    </div>
  );
}
