import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import {
  buildScriptTimeline,
  segmentDurations,
  assembleScriptVideo,
} from "@/lib/video-assembly";
import type { VideoScript } from "@/lib/ai/video-script";

const execFileAsync = promisify(execFile);

const script: VideoScript = {
  hook: "Isso muda tudo",
  beats: [
    { idx: 0, text: "Primeiro ponto importante", seconds: 3 },
    { idx: 1, text: "Segundo ponto que ninguém viu", seconds: 3 },
  ],
  cta: "Salva e me segue",
  caption: "legenda completa",
  hashtags: "#ia #tech",
  totalSeconds: 11,
};

/** Gera um clipe sintético (cor sólida) via ffmpeg — evita depender de
 * rede (Pexels) no teste; testa só a MONTAGEM (trim/scale/concat/legenda). */
async function makeSyntheticClip(color: string, seconds: number): Promise<Buffer> {
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const out = path.join(os.tmpdir(), `synthetic-${color}-${Date.now()}.mp4`);
  await execFileAsync(ffmpegPath as string, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${color}:s=640x360:d=${seconds}`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    out,
  ]);
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return buf;
}

describe("buildScriptTimeline", () => {
  it("hook nos primeiros 3s, beats em sequência, cta preenche o resto", () => {
    const segments = buildScriptTimeline(script);
    expect(segments[0]).toMatchObject({ text: "Isso muda tudo", start: 0, end: 3 });
    expect(segments[1]).toMatchObject({ text: "Primeiro ponto importante", start: 3, end: 6 });
    expect(segments[2]).toMatchObject({ text: "Segundo ponto que ninguém viu", start: 6, end: 9 });
    expect(segments[3]).toMatchObject({ text: "Salva e me segue", start: 9, end: 11 });
  });

  it("segmentDurations bate com start/end de cada segmento", () => {
    const segments = buildScriptTimeline(script);
    expect(segmentDurations(segments)).toEqual([3, 3, 3, 2]);
  });

  it("nunca gera segmento com duração negativa mesmo em roteiro apertado", () => {
    const tight: VideoScript = { ...script, totalSeconds: 2 };
    const segments = buildScriptTimeline(tight);
    segments.forEach((s) => expect(s.end).toBeGreaterThanOrEqual(s.start));
  });
});

describe("assembleScriptVideo (ffmpeg real, clipes sintéticos)", () => {
  it("monta um mp4 válido do tamanho certo de segmentos, com legendas queimadas", async () => {
    const segments = buildScriptTimeline(script);
    const durations = segmentDurations(segments);
    const clips = await Promise.all(
      ["red", "green", "blue", "yellow"].map((c, i) => makeSyntheticClip(c, durations[i]))
    );

    const final = await assembleScriptVideo(script, clips);
    expect(final.length).toBeGreaterThan(1000);
    // assinatura de container mp4 (ftyp) aparece nos primeiros bytes
    expect(final.subarray(4, 8).toString("ascii")).toBe("ftyp");
  }, 30_000);

  it("rejeita quando o número de clipes não bate com os segmentos", async () => {
    await expect(assembleScriptVideo(script, [])).rejects.toThrow(/precisa ser 1:1/);
  });
});
