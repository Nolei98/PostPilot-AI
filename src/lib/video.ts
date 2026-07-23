// ============================================================
// Motor de vídeo (Fase 4, kit v2 §3) — compõe o quadro Reels 9:16 sobre
// um vídeo enviado pelo usuário (upload manual, sem geração por IA).
//
// Usa ffmpeg (via ffmpeg-static, binário próprio — não depende de nada
// instalado no sistema) rodado como processo filho — não existe wrapper
// de vídeo em SVG/sharp (esses só fazem imagem estática). Roda em
// background (Inngest), nunca síncrono num Server Action: o encode
// pode levar dezenas de segundos.
//
// Técnica validada manualmente antes de codar (ver conversa): a MESMA
// regra da foto — encaixar o vídeo pela LARGURA (nunca cortar as
// laterais) e completar o topo/base com uma extensão desfocada do
// próprio vídeo — funciona idêntica via filtro ffmpeg (scale+crop+blur
// + overlay), só trocando sharp por ffmpeg.
// ============================================================
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

export const REELS_W = 1080;
export const REELS_H = 1920;
/** Onde o quadro 4:5 (capa) fica ancorado dentro do 9:16 — mesma
 * constante de composeReelsFrame em image.ts (imagem estática). */
export const REELS_TOP_EXTENSION = REELS_H - 1350;

/** Quadro do vídeo "feed" (4:5, migration 036) — MESMA proporção do post
 * único/carrossel, sem letterbox: o vídeo cobre o quadro inteiro (cover-fit,
 * corta o excesso), diferente do Reels que encaixa pela largura e completa
 * com extensão desfocada. */
export const FEED_VIDEO_W = 1080;
export const FEED_VIDEO_H = 1350;

/** Caminho temporário único (pid+timestamp evita colisão entre execuções
 * concorrentes) — reusado pela montagem automática (video-assembly.ts). */
export function tmpPath(name: string): string {
  return path.join(os.tmpdir(), `postpilot-video-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`);
}

/** Roda o binário do ffmpeg (ffmpeg-static, sem depender do sistema). */
export async function runFfmpeg(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error("Binário do ffmpeg (ffmpeg-static) não encontrado");
  await execFileAsync(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 64 });
}

/** Extrai um frame do vídeo (pra medir contraste/luminância — mesma
 * lógica das fotos, mas o "frame de pôster" no lugar da foto inteira,
 * regra explícita do kit v2: "quando a mídia é vídeo, a luminância é
 * medida pelo frame de pôster"). `atSeconds` evita pegar o 1º frame
 * (às vezes preto/em transição) — mira num ponto estável do vídeo. */
export async function extractPosterFrame(videoBuffer: Buffer, atSeconds = 0.5): Promise<Buffer> {
  const inPath = tmpPath("in.mp4");
  const outPath = tmpPath("poster.jpg");
  try {
    fs.writeFileSync(inPath, videoBuffer);
    await runFfmpeg([
      "-y",
      "-ss", String(atSeconds),
      "-i", inPath,
      "-frames:v", "1",
      "-q:v", "2",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

/**
 * Compõe o quadro Reels 9:16 final: encaixa o vídeo enviado pela
 * LARGURA (1080px, sem cortar lateral), completa o topo/base com uma
 * extensão desfocada do próprio vídeo, e sobrepõe o overlay de texto
 * (PNG transparente, já com wordmark/título/contraste calculados a
 * partir do frame de pôster — ver buildReelsOverlayPng em image.ts).
 * Retorna o .mp4 final (h264, mesmo áudio do original se houver).
 */
export async function composeReelsVideo(videoBuffer: Buffer, overlayPng: Buffer): Promise<Buffer> {
  const inPath = tmpPath("in.mp4");
  const overlayPath = tmpPath("overlay.png");
  const outPath = tmpPath("out.mp4");
  try {
    fs.writeFileSync(inPath, videoBuffer);
    fs.writeFileSync(overlayPath, overlayPng);

    const filter = [
      `[0:v]scale=${REELS_W}:-2,setsar=1,split=2[fit1][fit2]`,
      `[fit2]scale=${REELS_W}:${REELS_H}:force_original_aspect_ratio=increase,crop=${REELS_W}:${REELS_H},gblur=sigma=30[bgblur]`,
      `[bgblur][fit1]overlay=(W-w)/2:(H-h)/2[base]`,
      `[base][1:v]overlay=0:${REELS_TOP_EXTENSION}[outv]`,
    ].join(";");

    await runFfmpeg([
      "-y",
      "-i", inPath,
      "-i", overlayPath,
      "-filter_complex", filter,
      "-map", "[outv]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outPath,
    ]);

    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(overlayPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}

/**
 * Compõe o quadro FEED 4:5 final (migration 036): o vídeo enviado fica
 * SÓ na caixa de cima (`boxHeight` px, cover-fit, corta o excesso
 * lateral) — NÃO cobre o quadro inteiro. O restante (rodapé, onde mora
 * a banda de identidade) é preenchido com `bgColorHex` (cor sólida
 * amostrada do próprio vídeo — ver buildFeedVideoOverlay em image.ts),
 * não uma extensão desfocada: aqui não tem "resto de vídeo" pra
 * estender, é cor pura escolhida pra combinar. O overlay de texto (PNG
 * transparente acima da caixa, texto na banda) vai por cima de tudo.
 * Retorna o .mp4 final (h264, mesmo áudio do original se houver).
 */
export async function composeFeedVideo(
  videoBuffer: Buffer,
  overlayPng: Buffer,
  boxHeight: number,
  bgColorHex: string
): Promise<Buffer> {
  const inPath = tmpPath("in.mp4");
  const overlayPath = tmpPath("overlay.png");
  const outPath = tmpPath("out.mp4");
  try {
    fs.writeFileSync(inPath, videoBuffer);
    fs.writeFileSync(overlayPath, overlayPng);

    const padColor = `0x${bgColorHex.replace("#", "")}`;
    const box = Math.max(1, Math.min(FEED_VIDEO_H, Math.round(boxHeight)));
    const filter = [
      `[0:v]scale=${FEED_VIDEO_W}:${box}:force_original_aspect_ratio=increase,crop=${FEED_VIDEO_W}:${box},setsar=1,` +
        `pad=${FEED_VIDEO_W}:${FEED_VIDEO_H}:0:0:color=${padColor}[bg]`,
      `[bg][1:v]overlay=0:0[outv]`,
    ].join(";");

    await runFfmpeg([
      "-y",
      "-i", inPath,
      "-i", overlayPath,
      "-filter_complex", filter,
      "-map", "[outv]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outPath,
    ]);

    return fs.readFileSync(outPath);
  } finally {
    fs.rmSync(inPath, { force: true });
    fs.rmSync(overlayPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}
