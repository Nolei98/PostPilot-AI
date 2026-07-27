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
// Redesenhado 2026-07-23 pro estilo "zona segura" (exemplo-modelos-com-
// video.png, caso 3): o vídeo cobre o quadro 1080×1920 INTEIRO
// (cover-fit) — não mais "encaixa pela largura + extensão desfocada".
// O texto (marca + título alinhado à esquerda) fica numa zona segura
// calculada em image.ts (buildReelsVideoOverlayPng), longe de onde o
// Instagram desenha sua própria UI (legenda embaixo, ícones à direita).
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
 * Compõe o quadro Reels 9:16 final: o vídeo enviado cobre o quadro
 * INTEIRO (cover-fit, corta o excesso — nunca esticado), e sobrepõe o
 * overlay de texto (PNG transparente 1080×1920, já com marca/título/
 * contraste calculados a partir do frame de pôster e posicionados na
 * zona segura — ver buildReelsVideoOverlayPng em image.ts).
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
      `[0:v]scale=${REELS_W}:${REELS_H}:force_original_aspect_ratio=increase,crop=${REELS_W}:${REELS_H},setsar=1[bg]`,
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

/**
 * Compõe o quadro FEED 4:5 final (migration 036): o vídeo enviado fica
 * SÓ na sua MOLDURA (16:9, "tamanho YouTube", cantos arredondados,
 * `frame` calculado por buildFeedVideoOverlay em image.ts) — cover-fit
 * dentro dela, nunca esticado pro quadro inteiro. O overlay (PNG com um
 * buraco arredondado exatamente do tamanho da moldura, fundo sólido +
 * texto no resto) fica por cima: o vídeo só aparece através do buraco,
 * o que garante os cantos arredondados sem precisar mascarar o vídeo
 * em si. Retorna o .mp4 final (h264, mesmo áudio do original se houver).
 */
export async function composeFeedVideo(
  videoBuffer: Buffer,
  overlayPng: Buffer,
  frame: { x: number; y: number; w: number; h: number }
): Promise<Buffer> {
  const inPath = tmpPath("in.mp4");
  const overlayPath = tmpPath("overlay.png");
  const outPath = tmpPath("out.mp4");
  try {
    fs.writeFileSync(inPath, videoBuffer);
    fs.writeFileSync(overlayPath, overlayPng);

    const { x, y, w, h } = frame;
    const filter = [
      `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,` +
        `pad=${FEED_VIDEO_W}:${FEED_VIDEO_H}:${x}:${y}:color=black[bg]`,
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

/**
 * Variante "fundo do próprio vídeo, borrado" do quadro FEED 4:5
 * (modelo alternativo, 2026-07-23): em vez de cor sólida, o fundo
 * INTEIRO é o MESMO vídeo, cover-fit + bem borrado (gblur) — e por
 * cima, na moldura (16:9), o MESMO vídeo de novo, nítido, com cantos
 * arredondados (via `maskPng` — um vídeo não aceita SVG `mask`, então
 * o corte de canto usa `alphamerge` com uma máscara PNG luminância→
 * alfa, ver roundedRectMaskPng em image.ts). Texto (overlayPng) por
 * cima de tudo — aqui SEM fundo/buraco, só o texto (ver
 * buildFeedVideoOverlayBlurBg, image.ts).
 */
export async function composeFeedVideoBlurBg(
  videoBuffer: Buffer,
  overlayPng: Buffer,
  maskPng: Buffer,
  frame: { x: number; y: number; w: number; h: number }
): Promise<Buffer> {
  const inPath = tmpPath("in.mp4");
  const overlayPath = tmpPath("overlay.png");
  const maskPath = tmpPath("mask.png");
  const outPath = tmpPath("out.mp4");
  try {
    fs.writeFileSync(inPath, videoBuffer);
    fs.writeFileSync(overlayPath, overlayPng);
    fs.writeFileSync(maskPath, maskPng);

    const { x, y, w, h } = frame;
    const filter = [
      `[0:v]split=2[full][fit]`,
      `[full]scale=${FEED_VIDEO_W}:${FEED_VIDEO_H}:force_original_aspect_ratio=increase,crop=${FEED_VIDEO_W}:${FEED_VIDEO_H},gblur=sigma=30,setsar=1[bgblur]`,
      `[fit]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1[fg]`,
      `[fg][2:v]alphamerge[fgmasked]`,
      `[bgblur][fgmasked]overlay=${x}:${y}[base]`,
      `[base][1:v]overlay=0:0[outv]`,
    ].join(";");

    await runFfmpeg([
      "-y",
      "-i", inPath,
      "-i", overlayPath,
      "-i", maskPath,
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
    fs.rmSync(maskPath, { force: true });
    fs.rmSync(outPath, { force: true });
  }
}
