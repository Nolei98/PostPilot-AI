// ============================================================
// Montagem automática de vídeo curto a partir de um VideoScript +
// b-roll real (Sprint D, TAREFA D2). Grátis: ffmpeg (ffmpeg-static, já
// no projeto) + Pexels Video (mesma key de stock-photos.ts) — sem
// Remotion (licença comercial) nem geração de vídeo por IA.
//
// Legendas: MESMA técnica do vídeo manual (video.ts/composeReelsVideo)
// — PNG transparente renderizado via SVG+resvg (fonte da marca,
// já testada) composto por cima com o filtro overlay do ffmpeg, nunca
// ffmpeg drawtext (exigiria um .ttf disponível pro processo do ffmpeg,
// que o resvg já resolve pra nós). Cada legenda some/aparece na janela
// de tempo do beat (`enable='between(t,start,end)'`).
//
// Escopo desta v1: b-roll + legendas queimadas. Logo/chip de marca fica
// pra depois (o vídeo manual já cobre isso; aqui prioriza legenda).
// ============================================================
import fs from "node:fs";
import sharp from "sharp";
import { wrapText } from "@/lib/carousel-render";
import { rasterizeSvg } from "@/lib/svg-render";
import { tmpPath, runFfmpeg, extractPosterFrame } from "@/lib/video";
import type { VideoScript } from "@/lib/ai/video-script";
import { HOOK_MAX_SECONDS } from "@/lib/ai/video-script";

export const ASSEMBLY_W = 1080;
export const ASSEMBLY_H = 1920;

export interface ScriptSegment {
  text: string;
  start: number;
  end: number;
}

/**
 * Deriva a timeline (texto + janela de tempo) do roteiro: hook nos
 * primeiros HOOK_MAX_SECONDS, cada beat na sua duração declarada, cta
 * preenchendo o resto até totalSeconds (nunca negativo).
 */
export function buildScriptTimeline(script: VideoScript): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  let t = 0;

  const hookEnd = Math.min(HOOK_MAX_SECONDS, script.totalSeconds);
  segments.push({ text: script.hook, start: 0, end: hookEnd });
  t = hookEnd;

  for (const beat of script.beats) {
    const end = Math.min(t + beat.seconds, script.totalSeconds);
    if (end <= t) continue; // sem tempo sobrando (roteiro no limite)
    segments.push({ text: beat.text, start: t, end });
    t = end;
  }

  if (t < script.totalSeconds) {
    segments.push({ text: script.cta, start: t, end: script.totalSeconds });
  }

  return segments;
}

/** Duração de cada segmento (pra saber quanto b-roll baixar por trecho). */
export function segmentDurations(segments: ScriptSegment[]): number[] {
  return segments.map((s) => Math.max(0.5, s.end - s.start));
}

/** Corta+escala um clipe de b-roll pra exatamente `seconds`, sem áudio,
 * cover-fit 1080×1920 (crop o excesso — b-roll de fundo não precisa
 * preservar o quadro inteiro como o vídeo pessoal do usuário precisa).
 * Retorna o caminho do arquivo normalizado (mesmo codec/params de
 * todos os clipes — permite concat por stream-copy, rápido). */
async function normalizeClip(buffer: Buffer, seconds: number): Promise<string> {
  const inPath = tmpPath("in.mp4");
  const outPath = tmpPath("clip.mp4");
  fs.writeFileSync(inPath, buffer);
  try {
    await runFfmpeg([
      "-y",
      "-i", inPath,
      "-t", seconds.toFixed(2),
      "-vf", `scale=${ASSEMBLY_W}:${ASSEMBLY_H}:force_original_aspect_ratio=increase,crop=${ASSEMBLY_W}:${ASSEMBLY_H},setsar=1,fps=30`,
      "-an",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      outPath,
    ]);
    return outPath;
  } finally {
    fs.rmSync(inPath, { force: true });
  }
}

/** Concatena clipes já normalizados (mesmo codec/params) via demuxer
 * concat do ffmpeg — stream-copy, rápido, sem recodificar de novo. */
async function concatClips(clipPaths: string[]): Promise<string> {
  const listPath = tmpPath("list.txt");
  const outPath = tmpPath("concat.mp4");
  const list = clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  fs.writeFileSync(listPath, list);
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
    return outPath;
  } finally {
    fs.rmSync(listPath, { force: true });
  }
}

/** Altura (em px) da faixa onde o texto senta — mesma conta usada pra
 * saber de onde amostrar a cor e pra desenhar o gradiente. */
function captionTextBandHeight(text: string): number {
  const fontSize = 56;
  const maxChars = 22;
  const lines = wrapText(text.toUpperCase(), maxChars).slice(0, 3);
  return 120 + lines.length * fontSize * 1.2;
}

/** Cor média (RGB) do terço inferior do frame — de onde o gradiente da
 * legenda "puxa" a cor, em vez de ser um preto genérico sem relação com
 * a imagem. Mesma ideia de measureImageLuminance (contrast.ts), mas
 * preservando a cor (não só a luminância) pra tingir o scrim. */
async function sampleBandColor(frame: Buffer, bandY: number, bandH: number): Promise<[number, number, number]> {
  // margem de 2px: câmbio de subsampling do JPEG do poster frame às vezes
  // deixa a altura pós-resize com 1px a menos que ASSEMBLY_H — encolhe a
  // região um pouco em vez de arriscar "extract area" fora dos limites.
  const height = Math.max(1, Math.min(ASSEMBLY_H - 2, Math.round(bandH)));
  const top = Math.max(0, Math.min(ASSEMBLY_H - height - 2, Math.round(bandY)));
  try {
    // materializa o resize ANTES do extract — encadear os dois na mesma
    // pipeline sem um toBuffer() no meio faz o sharp validar a área de
    // corte contra as dimensões ORIGINAIS (pré-resize), não as finais.
    const covered = await sharp(frame).resize(ASSEMBLY_W, ASSEMBLY_H, { fit: "cover" }).toBuffer();
    const { data, info } = await sharp(covered)
      .extract({ left: 0, top, width: ASSEMBLY_W, height })
      .resize(24, 30) // reduz antes de amostrar — barato, suficiente pra média de cor
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let r = 0, g = 0, b = 0;
    const n = data.length / channels;
    for (let i = 0; i < data.length; i += channels) {
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    return n ? [r / n, g / n, b / n] : [0, 0, 0];
  } catch (err) {
    // amostragem é cosmética (calibra o tom do gradiente) — se falhar por
    // qualquer motivo, cai pro preto puro em vez de derrubar a montagem.
    console.warn("[video-assembly] sampleBandColor falhou, usando preto:", (err as Error).message);
    return [0, 0, 0];
  }
}

/**
 * Legenda em PNG transparente. O véu atrás do texto NÃO é uma caixa —
 * é um gradiente contínuo (sem borda reta) que nasce transparente,
 * passa pela cor MÉDIA do próprio b-roll daquele trecho (`bandColor`,
 * amostrada do frame real) e só then escurece até o preto — "puxa" a
 * cor da imagem em vez de ser um preto genérico carimbado por cima.
 */
function buildCaptionSvg(text: string, bandColor: [number, number, number]): string {
  const fontSize = 56;
  const maxChars = 22;
  const lines = wrapText(text.toUpperCase(), maxChars).slice(0, 3);
  const lineH = fontSize * 1.2;
  const textBandH = captionTextBandHeight(text);
  const startY = ASSEMBLY_H - 90 - (lines.length - 1) * lineH;
  const [r, g, b] = bandColor.map(Math.round);
  const tint = `rgb(${r},${g},${b})`;

  // gradiente cobre o quadro INTEIRO (sem rect com borda própria):
  // limpo até ~58%, a cor da imagem emerge gradualmente, escurece pro
  // preto só perto da base — nunca um degrau, sempre transição.
  const fadeStart = 1 - (textBandH * 1.6) / ASSEMBLY_H;

  const tspans = lines
    .map((l, i) => `<tspan x="${ASSEMBLY_W / 2}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ASSEMBLY_W}" height="${ASSEMBLY_H}" viewBox="0 0 ${ASSEMBLY_W} ${ASSEMBLY_H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tint}" stop-opacity="0"/>
      <stop offset="${Math.max(0, fadeStart).toFixed(3)}" stop-color="${tint}" stop-opacity="0"/>
      <stop offset="${Math.min(0.97, fadeStart + 0.16).toFixed(3)}" stop-color="${tint}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${ASSEMBLY_W}" height="${ASSEMBLY_H}" fill="url(#scrim)"/>
  <text font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">${tspans}</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Monta o vídeo final: normaliza+concatena os clipes de b-roll (1 por
 * segmento da timeline) e queima a legenda de cada segmento só na sua
 * janela de tempo. `clipBuffers` precisa ter o MESMO tamanho de
 * `segments` (um b-roll por segmento — hook/beats/cta).
 */
export async function assembleScriptVideo(
  script: VideoScript,
  clipBuffers: Buffer[]
): Promise<Buffer> {
  const segments = buildScriptTimeline(script);
  if (clipBuffers.length !== segments.length) {
    throw new Error(
      `assembleScriptVideo: ${clipBuffers.length} clipes pra ${segments.length} segmentos — precisa ser 1:1`
    );
  }

  const durations = segmentDurations(segments);
  const normalizedPaths: string[] = [];
  const captionPaths: string[] = [];
  const outPath = tmpPath("final.mp4");
  let concatPath: string | null = null;

  try {
    for (let i = 0; i < clipBuffers.length; i++) {
      normalizedPaths.push(await normalizeClip(clipBuffers[i], durations[i]));
    }
    concatPath = await concatClips(normalizedPaths);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      // amostra a cor de um frame do PRÓPRIO clipe deste segmento — é
      // essa cor que "puxa" o gradiente da legenda (não preto genérico).
      const frame = await extractPosterFrame(fs.readFileSync(normalizedPaths[i]), 0.15);
      const textBandH = captionTextBandHeight(seg.text);
      const bandColor = await sampleBandColor(frame, ASSEMBLY_H - textBandH, textBandH);

      const png = rasterizeSvg(buildCaptionSvg(seg.text, bandColor));
      const p = tmpPath("caption.png");
      fs.writeFileSync(p, png);
      captionPaths.push(p);
    }

    // filter_complex: encadeia um overlay por legenda, cada um só
    // visível na janela [start,end) do seu segmento.
    const inputs = ["-i", concatPath, ...captionPaths.flatMap((p) => ["-i", p])];
    const filterParts: string[] = [];
    let lastLabel = "0:v";
    segments.forEach((seg, i) => {
      const inputIdx = i + 1;
      const outLabel = i === segments.length - 1 ? "outv" : `v${i}`;
      filterParts.push(
        `[${lastLabel}][${inputIdx}:v]overlay=0:0:enable='between(t,${seg.start},${seg.end})'[${outLabel}]`
      );
      lastLabel = outLabel;
    });

    await runFfmpeg([
      "-y",
      ...inputs,
      "-filter_complex", filterParts.join(";"),
      "-map", "[outv]",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      outPath,
    ]);

    return fs.readFileSync(outPath);
  } finally {
    for (const p of [...normalizedPaths, ...captionPaths, outPath]) fs.rmSync(p, { force: true });
    if (concatPath) fs.rmSync(concatPath, { force: true });
  }
}
