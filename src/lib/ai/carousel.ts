// ============================================================
// Geração da ESTRUTURA de um carrossel (7–10 cards) a partir de uma
// notícia + tom/nicho da marca. Card 0 = gancho, último = CTA, meio =
// valor. Mesma pluralidade de providers do generate.ts.
//
// 🆓 MOCK (sem key): carrossel fixo derivado do título — $0, testável.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { nicheLabel } from "@/lib/niches";

export type CardRole = "hook" | "value" | "cta";

export interface CarouselCard {
  idx: number;
  role: CardRole;
  headline: string;
  body: string;
}

export interface CarouselPackage {
  caption: string;
  hashtags: string;
  cards: CarouselCard[];
}

export interface CarouselInput {
  title: string;
  summary: string | null;
  url: string;
  language?: string;
  niche?: string | null;
}

export const MIN_CARDS = 5;
export const MAX_CARDS = 7; // 7º card = contracapa (CTA/fechamento)

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

/**
 * Valida a estrutura do carrossel. Lança se: fora de 7–10 cards; idx
 * não sequencial 0..n; card 0 não é hook; último não é cta; headline
 * vazio. Usado após o parse do JSON do modelo (garante contrato).
 */
export function validateCarousel(pkg: CarouselPackage): void {
  const { cards } = pkg;
  if (!Array.isArray(cards) || cards.length < MIN_CARDS || cards.length > MAX_CARDS) {
    throw new Error(`carrossel precisa de ${MIN_CARDS}–${MAX_CARDS} cards (veio ${cards?.length})`);
  }
  cards.forEach((c, i) => {
    if (c.idx !== i) throw new Error(`idx fora de ordem no card ${i} (veio ${c.idx})`);
    if (!c.headline || !c.headline.trim()) throw new Error(`headline vazio no card ${i}`);
  });
  if (cards[0].role !== "hook") throw new Error("card 0 precisa ser role=hook");
  if (cards[cards.length - 1].role !== "cta") throw new Error("último card precisa ser role=cta");
}

/** Mock determinístico: gancho + N cards de valor + CTA (8 cards). */
function mockCarousel(input: CarouselInput): CarouselPackage {
  const t = input.title.slice(0, 60);
  const cards: CarouselCard[] = [
    { idx: 0, role: "hook", headline: `🚨 ${t}`, body: "Deslize para entender por que isso muda tudo." },
    { idx: 1, role: "value", headline: "O que aconteceu", body: `[MOCK] ${t}` },
    { idx: 2, role: "value", headline: "Por que importa", body: "O jogo virou para quem trabalha com isso." },
    { idx: 3, role: "value", headline: "O detalhe que ninguém viu", body: "Um ponto que muda a leitura da notícia." },
    { idx: 4, role: "value", headline: "O que fazer agora", body: "3 passos práticos para sair na frente." },
    { idx: 5, role: "value", headline: "O erro comum", body: "O que a maioria vai fazer errado." },
    { idx: 6, role: "cta", headline: "Salve e siga 👇", body: "Me segue para não perder a próxima novidade." },
  ];
  return {
    caption: `[MOCK] ${t}\n\nO fio completo está nos cards. 🧵\n\n👉 Salva para ler depois e me segue!`,
    hashtags: "#inteligenciaartificial #ia #tecnologia #carrossel #inovacao #futuro",
    cards,
  };
}

function buildSystemPrompt(lang: string, niche?: string | null): string {
  return `Você cria CARROSSÉIS virais de Instagram para ${nichePersona(niche)}.

⚠️ IDIOMA: escreva tudo em ${lang}.

Regras do carrossel:
- Entre ${MIN_CARDS} e ${MAX_CARDS} cards.
- Card 0 = GANCHO forte (role "hook"): headline que faz parar o dedo.
- Cards do meio = VALOR (role "value"): 1 ideia por card, texto curto.
- Último card = CTA (role "cta"): pedir para salvar/seguir/comentar.
- headline curto (até ~60 caracteres); body em 1–2 frases.
- Nunca copie conteúdo de terceiros; use o fato como matéria-prima.

Responda em JSON: { caption, hashtags, cards: [{ idx, role, headline, body }] }.
idx começa em 0 e é sequencial. hashtags: 6–10 separadas por espaço.`;
}

function userPrompt(input: CarouselInput): string {
  return `Crie o carrossel para esta notícia:\n\nTítulo: ${input.title}\nResumo: ${input.summary ?? "(sem resumo)"}\nFonte: ${input.url}`;
}

const CARD_SCHEMA = {
  type: "object",
  properties: {
    idx: { type: "integer" },
    role: { type: "string", enum: ["hook", "value", "cta"] },
    headline: { type: "string" },
    body: { type: "string" },
  },
  required: ["idx", "role", "headline", "body"],
} as const;

const CAROUSEL_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string" },
    hashtags: { type: "string" },
    cards: { type: "array", items: CARD_SCHEMA },
  },
  required: ["caption", "hashtags", "cards"],
} as const;

async function claudeCarousel(input: CarouselInput): Promise<CarouselPackage> {
  const anthropic = new Anthropic();
  const lang = languageName(input.language ?? "pt-BR");
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3072,
    system: buildSystemPrompt(lang, input.niche),
    messages: [{ role: "user", content: userPrompt(input) }],
    output_config: { format: { type: "json_schema", schema: CAROUSEL_SCHEMA } },
  });
  const block = res.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("carrossel sem bloco de texto");
  return JSON.parse(block.text) as CarouselPackage;
}

async function geminiCarousel(input: CarouselInput): Promise<CarouselPackage> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const lang = languageName(input.language ?? "pt-BR");
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: userPrompt(input),
    config: {
      systemInstruction: buildSystemPrompt(lang, input.niche),
      responseMimeType: "application/json",
      responseSchema: CAROUSEL_SCHEMA,
    },
  });
  if (!res.text) throw new Error("carrossel (Gemini) sem texto");
  return JSON.parse(res.text) as CarouselPackage;
}

async function pollinationsCarousel(input: CarouselInput): Promise<CarouselPackage> {
  const lang = languageName(input.language ?? "pt-BR");
  const apiKey = process.env.POLLINATIONS_API_KEY;
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey && { Authorization: `Bearer ${apiKey}` }) },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: buildSystemPrompt(lang, input.niche) },
        { role: "user", content: `${userPrompt(input)}\n\nResponda APENAS com o JSON do carrossel.` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Pollinations respondeu ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Pollinations não retornou conteúdo");
  const parsed = JSON.parse(content) as CarouselPackage & { hashtags: string | string[] };
  return { ...parsed, hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.join(" ") : parsed.hashtags };
}

function pickProvider(provider: "claude" | "gemini" | "pollinations") {
  if (provider === "pollinations") return pollinationsCarousel;
  if (provider === "gemini" && process.env.GEMINI_API_KEY) return geminiCarousel;
  if (!process.env.ANTHROPIC_API_KEY) return null; // sem key → mock
  return claudeCarousel;
}

/**
 * Ponto de entrada. Gera + valida; se o JSON vier fora do contrato,
 * tenta 1 vez de novo antes de propagar o erro. Sem key de IA → mock.
 */
export async function generateCarouselPackage(
  input: CarouselInput,
  provider: "claude" | "gemini" | "pollinations" = "gemini"
): Promise<CarouselPackage> {
  const gen = pickProvider(provider);
  if (!gen) {
    console.warn("[carousel] nenhuma API key de IA — usando MOCK");
    const pkg = mockCarousel(input);
    validateCarousel(pkg);
    return pkg;
  }
  try {
    const pkg = await gen(input);
    validateCarousel(pkg);
    return pkg;
  } catch (err) {
    console.warn("[carousel] 1ª geração inválida, tentando de novo:", (err as Error).message);
    const pkg = await gen(input);
    validateCarousel(pkg); // se falhar de novo, propaga
    return pkg;
  }
}
