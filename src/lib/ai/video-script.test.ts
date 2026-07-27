import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateVideoScript,
  validateVideoScript,
  NETWORK_DURATION,
  MIN_BEATS,
  MAX_BEATS,
  type VideoScript,
  type VideoNetwork,
} from "@/lib/ai/video-script";

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("GEMINI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

const baseInput = (network: VideoNetwork = "reels") => ({
  title: "OpenAI lançou algo enorme",
  summary: null,
  url: "https://ex.com/n",
  network,
});

describe("generateVideoScript (mock)", () => {
  it("gera um roteiro válido dentro de 2–4 beats", async () => {
    const script = await generateVideoScript(baseInput());
    expect(script.beats.length).toBeGreaterThanOrEqual(MIN_BEATS);
    expect(script.beats.length).toBeLessThanOrEqual(MAX_BEATS);
    expect(script.hook).toBeTruthy();
    expect(script.cta).toBeTruthy();
    expect(script.hashtags).toContain("#");
  });

  it("beats têm idx sequencial a partir de 0", async () => {
    const script = await generateVideoScript(baseInput());
    script.beats.forEach((b, i) => expect(b.idx).toBe(i));
  });

  it("duração total cabe na janela do Reels (7–15s)", async () => {
    const script = await generateVideoScript(baseInput("reels"));
    expect(script.totalSeconds).toBeGreaterThanOrEqual(NETWORK_DURATION.reels.min);
    expect(script.totalSeconds).toBeLessThanOrEqual(NETWORK_DURATION.reels.max);
  });

  it("duração total cabe na janela do TikTok (15–34s)", async () => {
    const script = await generateVideoScript(baseInput("tiktok"));
    expect(script.totalSeconds).toBeGreaterThanOrEqual(NETWORK_DURATION.tiktok.min);
    expect(script.totalSeconds).toBeLessThanOrEqual(NETWORK_DURATION.tiktok.max);
  });

  it("é determinístico", async () => {
    expect(await generateVideoScript(baseInput())).toEqual(await generateVideoScript(baseInput()));
  });
});

describe("validateVideoScript", () => {
  const base = (): VideoScript => ({
    hook: "gancho forte",
    beats: [
      { idx: 0, text: "beat 0", seconds: 3 },
      { idx: 1, text: "beat 1", seconds: 3 },
      { idx: 2, text: "beat 2", seconds: 3 },
    ],
    cta: "salva e segue",
    caption: "legenda",
    hashtags: "#a #b",
    totalSeconds: 12,
  });

  it("aceita um roteiro bem formado dentro da janela do Reels", () => {
    expect(() => validateVideoScript(base(), "reels")).not.toThrow();
  });

  it("rejeita hook vazio", () => {
    const s = base();
    s.hook = "  ";
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("rejeita menos de 2 beats", () => {
    const s = base();
    s.beats = s.beats.slice(0, 1);
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("rejeita mais de 4 beats", () => {
    const s = base();
    s.beats = [...s.beats, { idx: 3, text: "x", seconds: 2 }, { idx: 4, text: "y", seconds: 2 }];
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("rejeita idx fora de ordem", () => {
    const s = base();
    s.beats[1].idx = 99;
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("rejeita beat com texto vazio", () => {
    const s = base();
    s.beats[0].text = "";
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("rejeita cta vazio", () => {
    const s = base();
    s.cta = "";
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("rejeita duração fora da janela da rede (Reels)", () => {
    const s = base();
    s.totalSeconds = 60;
    expect(() => validateVideoScript(s, "reels")).toThrow();
  });

  it("mesmo roteiro passa pro Reels e falha pro TikTok (janelas diferentes)", () => {
    const s = base(); // 12s
    expect(() => validateVideoScript(s, "reels")).not.toThrow();
    expect(() => validateVideoScript(s, "tiktok")).toThrow();
  });
});
