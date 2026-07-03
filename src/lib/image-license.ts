// ============================================================
// Heurística de licença de imagem — NÃO é uma confirmação jurídica.
// Serve só para dar um sinal rápido na tela de aprovação; a regra
// geral de direito autoral é "protegido por padrão" — o usuário
// deve conferir manualmente pelos links antes de publicar.
// ============================================================

// Domínios conhecidos de bancos de imagem livre/domínio público.
// Qualquer coisa fora dessa lista (ex: site do próprio veículo de
// notícia) é tratada como "verify" — direitos reservados ao veículo.
const FREE_IMAGE_DOMAINS = [
  "wikimedia.org",
  "wikipedia.org",
  "unsplash.com",
  "pexels.com",
  "pixabay.com",
  "publicdomainpictures.net",
  "flickr.com", // parcial — Flickr tem CC e "all rights reserved" misturados, ainda assim mais provável que um site de notícia
];

export type ImageLicenseHint = "likely_free" | "verify";

/** Heurística por domínio — NÃO confirma licença, só reduz falso-negativo óbvio. */
export function checkImageLicenseHint(imageUrl: string | null): ImageLicenseHint | null {
  if (!imageUrl) return null;
  try {
    const host = new URL(imageUrl).hostname.replace(/^www\./, "");
    const isGov = host.endsWith(".gov") || host.endsWith(".gov.br");
    const isFreeDomain = FREE_IMAGE_DOMAINS.some(
      (d) => host === d || host.endsWith(`.${d}`)
    );
    return isGov || isFreeDomain ? "likely_free" : "verify";
  } catch {
    return "verify";
  }
}
