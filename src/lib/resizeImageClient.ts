// Redimensiona/comprime uma imagem NO NAVEGADOR antes do upload.
// A página final sempre sai em 1080x1350 (composeTemplate faz
// resize "cover" no servidor), então não há motivo pra mandar o
// arquivo original de 10-20MB de uma foto de celular — isso é o que
// estoura o limite de payload da plataforma e derruba o upload.
// Roda só no cliente (Image/canvas do browser).
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export async function resizeImageForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) return file;

  return new File([blob], "upload.jpg", { type: "image/jpeg" });
}
