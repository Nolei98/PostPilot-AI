// Fase 4, fatia 2 — motor de vídeo real (ffmpeg via ffmpeg-static).
// Gera um vídeo sintético (16:9, deliberadamente NÃO 9:16) em runtime —
// evita depender de rede/arquivo externo — e valida a composição final.
import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";
import { extractPosterFrame, composeReelsVideo, REELS_W, REELS_H } from "@/lib/video";

const execFileAsync = promisify(execFile);

let sourceVideo: Buffer;
let overlayPng: Buffer;

beforeAll(async () => {
  const srcPath = path.join(os.tmpdir(), `postpilot-video-test-src-${Date.now()}.mp4`);
  await execFileAsync(ffmpegPath as string, [
    "-y",
    "-f", "lavfi",
    "-i", "testsrc=size=640x360:rate=15",
    "-t", "1",
    "-pix_fmt", "yuv420p",
    srcPath,
  ]);
  sourceVideo = fs.readFileSync(srcPath);
  fs.rmSync(srcPath, { force: true });

  // Overlay transparente simples (retângulo semitransparente) — não
  // precisa do motor de layout completo pra testar a composição em si.
  overlayPng = await sharp({
    create: { width: 1080, height: 1350, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 1080, height: 300, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
        })
          .png()
          .toBuffer(),
        top: 1050,
        left: 0,
      },
    ])
    .png()
    .toBuffer();
}, 20_000);

describe("extractPosterFrame", () => {
  it("extrai um frame JPEG válido do vídeo", async () => {
    const frame = await extractPosterFrame(sourceVideo, 0.2);
    expect(frame.length).toBeGreaterThan(500);
    expect([frame[0], frame[1], frame[2]]).toEqual([0xff, 0xd8, 0xff]);
  });
});

describe("composeReelsVideo", () => {
  it("gera um vídeo 9:16 EXATO, sem cortar as laterais (fonte 16:9)", async () => {
    const out = await composeReelsVideo(sourceVideo, overlayPng);
    expect(out.length).toBeGreaterThan(1000);

    const outPath = path.join(os.tmpdir(), `postpilot-video-test-out-${Date.now()}.mp4`);
    fs.writeFileSync(outPath, out);
    try {
      // `ffmpeg -i <arquivo>` (sem saída) sempre sai com código 1 e
      // escreve o relatório dos streams no stderr — captura via catch.
      const report: string = await execFileAsync(ffmpegPath as string, ["-i", outPath])
        .then(() => "")
        .catch((e: { stderr?: string }) => e.stderr ?? "");
      expect(report).toContain(`${REELS_W}x${REELS_H}`);
    } finally {
      fs.rmSync(outPath, { force: true });
    }
  }, 30_000);
});
