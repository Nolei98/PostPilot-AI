// ============================================================
// Geração do ROTEIRO de um vídeo curto (Reels/TikTok) a partir de uma
// notícia + tom/nicho da marca (Sprint D, TAREFA D1). Gancho 0–3s +
// 2–4 beats + CTA; duração alvo por rede. Mesma pluralidade de
// providers de carousel.ts/generate.ts — só a estrutura muda.
//
// Escopo do D1: só o ROTEIRO (texto + timing). Montagem real (b-roll +
// legendas queimadas + Remotion) é D2; publicação é D3. Ver PROGRESSO
// §4.4.
//
// 🆓 MOCK (sem key): roteiro fixo derivado do título — $0, testável.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { nicheLabel } from "@/lib/niches";
import type { TextProvider } from "@/lib/types";

export type VideoNetwork = "reels" | "tiktok";

/** Duração alvo (segundos) por rede — HANDOFF/PROGRESSO §4.4: IG 7–15s, TikTok 15–34s. */
export const NETWORK_DURATION: Record<VideoNetwork, { min: number; max: number }> = {
  reels: { min: 7, max: 15 },
  tiktok: { min: 15, max: 34 },
};

export interface VideoBeat {
  idx: number;
  text: string;
  /** duração aproximada do beat em segundos. */
  seconds: number;
}

export interface VideoScript {
  /** gancho falado/legendado nos primeiros 0–3s — precisa prender antes do scroll. */
  hook: string;
  beats: VideoBeat[];
  cta: string;
  caption: string;
  hashtags: string;
  /** soma de hook+beats+cta, deve caber na janela da rede (NETWORK_DURATION). */
  totalSeconds: number;
}

export interface VideoScriptInput {
  title: string;
  summary: string | null;
  url: string;
  language?: string;
  niche?: string | null;
  network: VideoNetwork;
}

export const MIN_BEATS = 2;
export const MAX_BEATS = 4;
/** duração assumida do hook (script.hook não carrega "seconds" — timeline
 * de montagem, video-assembly.ts, deriva daqui + beats + resto p/ cta). */
export const HOOK_MAX_SECONDS = 3;

const LANGUAGE_NAMES: Record<string, string> = {
  "pt-BR": "português do Brasil",
  en: "inglês",
  es: "espanhol",
};
const languageName = (code: string) => LANGUAGE_NAMES[code] ?? code;
const nichePersona = (niche: string | null | undefined) =>
  !niche || niche === "tecnologia"
    ? "um perfil de notícias de IA"
    : `um perfil de notícias de ${nicheLabel(niche)}`;
const networkLabel = (network: VideoNetwork) => (network === "tiktok" ? "TikTok" : "Instagram Reels");

/**
 * Valida o roteiro. Lança se: hook vazio ou acima de 3s; fora de 2–4
 * beats; idx não sequencial 0..n; beat vazio; cta vazio; duração total
 * fora da janela da rede. Usado após o parse do JSON do modelo.
 */
export function validateVideoScript(script: VideoScript, network: VideoNetwork): void {
  if (!script.hook || !script.hook.trim()) throw new Error("hook vazio");
  if (script.hook.length > 0 && (script.beats[0]?.seconds ?? 0) < 0) {
    throw new Error("beat com duração negativa");
  }
  const { beats } = script;
  if (!Array.isArray(beats) || beats.length < MIN_BEATS || beats.length > MAX_BEATS) {
    throw new Error(`roteiro precisa de ${MIN_BEATS}–${MAX_BEATS} beats (veio ${beats?.length})`);
  }
  beats.forEach((b, i) => {
    if (b.idx !== i) throw new Error(`idx fora de ordem no beat ${i} (veio ${b.idx})`);
    if (!b.text || !b.text.trim()) throw new Error(`texto vazio no beat ${i}`);
    if (b.seconds <= 0) throw new Error(`duração inválida no beat ${i}`);
  });
  if (!script.cta || !script.cta.trim()) throw new Error("cta vazio");

  const { min, max } = NETWORK_DURATION[network];
  if (script.totalSeconds < min || script.totalSeconds > max) {
    throw new Error(
      `duração total ${script.totalSeconds}s fora da janela de ${network} (${min}–${max}s)`
    );
  }
}

/** Mock determinístico: gancho + 3 beats + CTA dentro da janela da rede. */
function mockVideoScript(input: VideoScriptInput): VideoScript {
  const t = input.title.slice(0, 60);
  const { min, max } = NETWORK_DURATION[input.network];
  const CTA_SECONDS = 2;
  // mira no meio da janela pra sobrar folga dos dois lados.
  const target = Math.round((min + max) / 2);
  const beatSeconds = Math.max(2, Math.floor((target - HOOK_MAX_SECONDS - CTA_SECONDS) / 3));
  const beats: VideoBeat[] = [
    { idx: 0, text: `[MOCK] ${t}`, seconds: beatSeconds },
    { idx: 1, text: "Por que isso muda o jogo pra quem trabalha com isso.", seconds: beatSeconds },
    { idx: 2, text: "O detalhe que passou batido pra maioria.", seconds: beatSeconds },
  ];
  const hook = `🚨 ${t}`;
  const cta = "Salva esse vídeo e me segue pra não perder a próxima.";
  const totalSeconds = HOOK_MAX_SECONDS + beats.reduce((s, b) => s + b.seconds, 0) + CTA_SECONDS;
  return {
    hook,
    beats,
    cta,
    caption: `[MOCK] ${t}\n\n👉 Salva e me segue!`,
    hashtags: "#inteligenciaartificial #ia #tecnologia #reels #shorts",
    totalSeconds,
  };
}

function buildSystemPrompt(lang: string, niche: string | null | undefined, network: VideoNetwork): string {
  const { min, max } = NETWORK_DURATION[network];
  return `Você cria ROTEIROS de vídeo curto (${networkLabel(network)}) para ${nichePersona(niche)}.

⚠️ IDIOMA: escreva tudo em ${lang}.

Regras do roteiro:
- "hook": gancho falado/legendado nos primeiros 0–${HOOK_MAX_SECONDS}s — precisa prender ANTES do scroll. Frase curta e direta.
- "beats": entre ${MIN_BEATS} e ${MAX_BEATS} blocos de conteúdo, 1 ideia por beat, texto curto (o que será falado/legendado naquele trecho) + "seconds" (duração estimada de fala daquele beat).
- "cta": pedido final (salvar/seguir/comentar), 1 frase.
- "totalSeconds": soma de todo o vídeo (hook + beats + cta) — precisa ficar entre ${min} e ${max} segundos, a janela ideal de ${networkLabel(network)}.
- Nunca copie conteúdo de terceiros; use o fato como matéria-prima.

Responda em JSON: { hook, beats: [{ idx, text, seconds }], cta, caption, hashtags, totalSeconds }.
idx começa em 0 e é sequencial. hashtags: 5–8 separadas por espaço.`;
}

function userPrompt(input: VideoScriptInput): string {
  return `Crie o roteiro de vídeo para esta notícia:\n\nTítulo: ${input.title}\nResumo: ${input.summary ?? "(sem resumo)"}\nFonte: ${input.url}\nRede: ${networkLabel(input.network)}`;
}

const BEAT_SCHEMA = {
  type: "object",
  properties: {
    idx: { type: "integer" },
    text: { type: "string" },
    seconds: { type: "number" },
  },
  required: ["idx", "text", "seconds"],
} as const;

const VIDEO_SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    beats: { type: "array", items: BEAT_SCHEMA },
    cta: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "string" },
    totalSeconds: { type: "number" },
  },
  required: ["hook", "beats", "cta", "caption", "hashtags", "totalSeconds"],
} as const;

async function claudeVideoScript(input: VideoScriptInput): Promise<VideoScript> {
  const anthropic = new Anthropic();
  const lang = languageName(input.language ?? "pt-BR");
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: buildSystemPrompt(lang, input.niche, input.network),
    messages: [{ role: "user", content: userPrompt(input) }],
    output_config: { format: { type: "json_schema", schema: VIDEO_SCRIPT_SCHEMA } },
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("roteiro sem bloco de texto");
  return JSON.parse(block.text) as VideoScript;
}

async function geminiVideoScript(input: VideoScriptInput): Promise<VideoScript> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const lang = languageName(input.language ?? "pt-BR");
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt(input),
    config: {
      systemInstruction: buildSystemPrompt(lang, input.niche, input.network),
      responseMimeType: "application/json",
      responseSchema: VIDEO_SCRIPT_SCHEMA,
    },
  });
  if (!res.text) throw new Error("roteiro (Gemini) sem texto");
  return JSON.parse(res.text) as VideoScript;
}

async function pollinationsVideoScript(input: VideoScriptInput): Promise<VideoScript> {
  const lang = languageName(input.language ?? "pt-BR");
  const apiKey = process.env.POLLINATIONS_API_KEY;
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey && { Authorization: `Bearer ${apiKey}` }) },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: buildSystemPrompt(lang, input.niche, input.network) },
        { role: "user", content: `${userPrompt(input)}\n\nResponda APENAS com o JSON do roteiro.` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Pollinations respondeu ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Pollinations não retornou conteúdo");
  const parsed = JSON.parse(content) as VideoScript & { hashtags: string | string[] };
  return { ...parsed, hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.join(" ") : parsed.hashtags };
}

async function nvidiaVideoScript(input: VideoScriptInput): Promise<VideoScript> {
  const { nvidiaChatJson } = await import("@/lib/ai/nvidia");
  const raw = await nvidiaChatJson(
    buildSystemPrompt(languageName(input.language ?? "pt-BR"), input.niche, input.network),
    `Crie o roteiro do vídeo para esta notícia:

Título: ${input.title}
Resumo: ${input.summary ?? "(sem resumo)"}
Fonte: ${input.url}

Responda APENAS com o JSON do roteiro.`,
    { maxTokens: 1200 }
  );
  const parsed = JSON.parse(raw) as VideoScript & { hashtags: string | string[] };
  return {
    ...parsed,
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.join(" ") : parsed.hashtags,
  };
}

function pickProvider(provider: TextProvider) {
  if (provider === "pollinations") return pollinationsVideoScript;
  if (provider === "nvidia" && process.env.NVIDIA_API_KEY) return nvidiaVideoScript;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return geminiVideoScript;
  if (!process.env.ANTHROPIC_API_KEY) return null; // sem key → mock
  return claudeVideoScript;
}

/**
 * Ponto de entrada. Gera + valida; se o JSON vier fora do contrato (ou
 * duração fora da janela da rede), tenta 1 vez de novo antes de
 * propagar o erro. Sem key de IA → mock.
 */
export async function generateVideoScript(
  input: VideoScriptInput,
  provider: TextProvider = "gemini"
): Promise<VideoScript> {
  const gen = pickProvider(provider);
  if (!gen) {
    console.warn("[video-script] nenhuma API key de IA — usando MOCK");
    const script = mockVideoScript(input);
    validateVideoScript(script, input.network);
    return script;
  }
  try {
    const script = await gen(input);
    validateVideoScript(script, input.network);
    return script;
  } catch (err) {
    console.warn("[video-script] 1ª geração inválida, tentando de novo:", (err as Error).message);
    const script = await gen(input);
    validateVideoScript(script, input.network); // se falhar de novo, propaga
    return script;
  }
}
