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
// de tempo do beat (`enable='gte(t,start)*lt(t,end)'` — meio aberta no
// fim, senão duas legendas dividem o frame da emenda).
//
// Escopo desta v1: b-roll + legendas queimadas. A MARCA não sai daqui:
// este mp4 é a fonte, e o wordmark/título é carimbado na aprovação
// (render-approved-post → renderVideoPost). Por isso a legenda respeita
// um rodapé reservado — ver CAPTION_SAFE_BOTTOM.
// ============================================================
import fs from "node:fs";
import sharp from "sharp";
import { wrapText, stripEmoji } from "@/lib/carousel-render";
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

/** Cor média (RGB) da faixa da legenda no frame — de onde o gradiente da
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
 * Rodapé RESERVADO: nada de legenda queimada abaixo desta altura.
 *
 * Duas coisas disputam a base do quadro e a legenda perdia pras duas:
 *  1. **A marca.** Este mp4 é a FONTE — na aprovação o `renderVideoPost`
 *     carimba divisor + wordmark + título por cima, com a última linha
 *     em `REELS_H - 220` (image.ts) e o bloco subindo conforme o título
 *     quebra. A legenda sentava exatamente aí e sumia embaixo da marca.
 *  2. **A UI do Instagram**, que desenha legenda/@/botões por cima dos
 *     ~220px de baixo — texto ali não é lido por ninguém.
 *
 * 780px cobre o pior caso da marca (título de 5 linhas + divisor + folga)
 * com sobra. A legenda passa a viver no terço central-baixo, acima de
 * tudo isso.
 */
const CAPTION_SAFE_BOTTOM = 780;

const CAPTION_FONT_SIZE = 56;
const CAPTION_MAX_CHARS = 22;
const CAPTION_MAX_LINES = 3;

/**
 * Geometria da legenda: onde o texto senta e qual faixa o véu precisa
 * cobrir. Uma conta só, dois consumidores — o desenho do SVG e a
 * amostragem da cor. Quando eram duas, o véu podia cair num lugar e o
 * texto em outro (mesmo motivo do `reelsTextZone` em image.ts).
 */
export function captionGeometry(text: string): {
  lines: string[];
  lineH: number;
  startY: number;
  bandTop: number;
  bandH: number;
} {
  const lines = wrapText(stripEmoji(text).toUpperCase(), CAPTION_MAX_CHARS).slice(
    0,
    CAPTION_MAX_LINES
  );
  const lineH = CAPTION_FONT_SIZE * 1.2;
  // Última baseline no piso reservado; as outras linhas sobem a partir dela.
  const startY = ASSEMBLY_H - CAPTION_SAFE_BOTTOM - (lines.length - 1) * lineH;
  const bandTop = Math.max(0, startY - CAPTION_FONT_SIZE - 48);
  const bandH = (lines.length - 1) * lineH + CAPTION_FONT_SIZE + 96;
  return { lines, lineH, startY, bandTop, bandH };
}

/**
 * Legenda em PNG transparente. O véu atrás do texto NÃO é uma caixa —
 * é um gradiente contínuo (sem borda reta) que nasce transparente,
 * passa pela cor MÉDIA do próprio b-roll daquele trecho (`bandColor`,
 * amostrada do frame real) e só then escurece até o preto — "puxa" a
 * cor da imagem em vez de ser um preto genérico carimbado por cima.
 */
function buildCaptionSvg(text: string, bandColor: [number, number, number]): string {
  const { lines, lineH, startY, bandTop, bandH } = captionGeometry(text);

  // A cor amostrada ESCURECIDA, não crua. Crua, um b-roll claro (tela de
  // terminal, céu, parede branca) devolve um cinza-claro, e o véu ficava
  // mais claro que o texto branco — legenda ilegível pelo caminho oposto
  // ao que o véu existe pra resolver. O fator mantém o TOM do clipe (é o
  // ponto de amostrar) e garante que a banda sempre escureça.
  const [r, g, b] = bandColor.map((c) => Math.round(c * 0.4));
  const tint = `rgb(${r},${g},${b})`;

  // O véu deixou de ser preso na base do quadro e virou uma FAIXA em
  // volta do texto: transparente nas duas pontas, cor do próprio b-roll
  // no meio. Preso embaixo, ele escurecia justamente a área onde a marca
  // é carimbada depois — dois véus empilhados no mesmo lugar.
  const bandBottom = bandTop + bandH;

  const tspans = lines
    .map((l, i) => `<tspan x="${ASSEMBLY_W / 2}" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ASSEMBLY_W}" height="${ASSEMBLY_H}" viewBox="0 0 ${ASSEMBLY_W} ${ASSEMBLY_H}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="${bandTop}" x2="0" y2="${bandBottom}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${tint}" stop-opacity="0"/>
      <stop offset="0.28" stop-color="${tint}" stop-opacity="0.72"/>
      <stop offset="0.72" stop-color="${tint}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${bandTop}" width="${ASSEMBLY_W}" height="${bandH}" fill="url(#scrim)"/>
  <text font-family="sans-serif" font-weight="800" font-size="${CAPTION_FONT_SIZE}" fill="#FFFFFF" text-anchor="middle" letter-spacing="0.5">${tspans}</text>
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
      const { bandTop, bandH } = captionGeometry(seg.text);
      const bandColor = await sampleBandColor(frame, bandTop, bandH);

      const png = rasterizeSvg(buildCaptionSvg(seg.text, bandColor));
      const p = tmpPath("caption.png");
      fs.writeFileSync(p, png);
      captionPaths.push(p);
    }

    // filter_complex: encadeia um overlay por legenda, cada um só
    // visível na janela [start,end) do seu segmento.
    //
    // `gte*lt` e não `between`: o between do ffmpeg é fechado dos DOIS
    // lados, e o fim de um segmento é exatamente o começo do próximo —
    // então no frame do limite as duas legendas apareciam juntas, uma por
    // cima da outra (visto no frame 9s do primeiro vídeo gerado: o CTA
    // sobreposto ao beat anterior). Meio aberto no fim resolve, e o
    // último segmento não perde nada porque o vídeo acaba junto com ele.
    const inputs = ["-i", concatPath, ...captionPaths.flatMap((p) => ["-i", p])];
    const filterParts: string[] = [];
    let lastLabel = "0:v";
    segments.forEach((seg, i) => {
      const inputIdx = i + 1;
      const outLabel = i === segments.length - 1 ? "outv" : `v${i}`;
      const ultimo = i === segments.length - 1;
      const janela = ultimo
        ? `gte(t,${seg.start})`
        : `gte(t,${seg.start})*lt(t,${seg.end})`;
      filterParts.push(
        `[${lastLabel}][${inputIdx}:v]overlay=0:0:enable='${janela}'[${outLabel}]`
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
