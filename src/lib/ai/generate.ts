// ============================================================
// Geração do pacote de conteúdo — Claude Sonnet 4.6 por padrão.
// Entrada: notícia candidata. Saída: hook + legenda + hashtags
// + prompt de imagem, no tom dos perfis de referência.
//
// 💰 Custo: Sonnet 4.6 = $3/M entrada, $15/M saída.
//    ~90 posts/mês ≈ $2-4/mês.
// 🆓 MOCK: sem ANTHROPIC_API_KEY nem GEMINI_API_KEY, gera pacote
//    fixo baseado no título — $0, testa o pipeline inteiro.
//
// Gemini (alternativa): defina AI_PROVIDER=gemini e GEMINI_API_KEY
// (console do Google AI Studio) para usar Gemini 2.5 Flash em vez
// de Claude — tier gratuito bem maior, qualidade de texto um pouco
// abaixo do Sonnet para esse estilo de copy.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

export interface GenerateInput {
  title: string;
  summary: string | null;
  url: string;
  /** Idioma do post gerado (ex: "pt-BR", "en", "es"). Default: pt-BR */
  language?: string;
}

/** Nome legível do idioma para instruir o modelo com clareza */
const LANGUAGE_NAMES: Record<string, string> = {
  "pt-BR": "português do Brasil",
  en: "inglês",
  es: "espanhol",
};

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export interface PostPackage {
  hook: string; // frase de impacto que vai NA IMAGEM
  caption: string; // legenda completa do post
  hashtags: string; // hashtags separadas por espaço
  image_prompt: string; // prompt em inglês para o Flux
}

/**
 * Mock local: pacote gerado a partir do título, sem IA.
 */
function mockGenerate(input: GenerateInput): PostPackage {
  const shortTitle = input.title.slice(0, 80);
  return {
    hook: `🚨 ${shortTitle}`,
    caption: `[MOCK] ${shortTitle}\n\nIsso muda TUDO no mundo da IA. 🤯\n\nA notícia completa está na fonte — mas o resumo é: o jogo virou, e quem não acompanhar vai ficar para trás.\n\n👉 Me segue para não perder nenhuma novidade de IA!\n\nFonte: ${input.url}`,
    hashtags:
      "#inteligenciaartificial #ia #ai #tecnologia #chatgpt #inovacao #futuro #tech",
    image_prompt:
      "person interacting with technology in a modern office, natural window light, photorealistic, shot on camera, realistic textures, editorial photography, vertical 4:5 framing, no CGI look, no AI-art look, no text",
  };
}

/**
 * Geração real com Sonnet 4.6 + few-shot no tom dos perfis de
 * referência (@gurudoprompt, @guilhermemorais.ia, @hollyfield.ia).
 */
async function claudeGenerate(input: GenerateInput): Promise<PostPackage> {
  const anthropic = new Anthropic();
  const lang = languageName(input.language ?? "pt-BR");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `Você escreve posts virais de Instagram para um perfil de notícias de IA, no estilo de @gurudoprompt, @guilhermemorais.ia e @hollyfield.ia.

⚠️ IDIOMA DO POST: escreva hook, caption e hashtags em ${lang}. Os exemplos abaixo estão em português apenas para mostrar o ESTILO — reproduza o estilo, não o idioma. O image_prompt continua sempre em inglês.

CARACTERÍSTICAS DO TOM:
- Sensacionalista mas verídico: urgência, choque, FOMO — sem inventar fatos
- Frases curtas. Parágrafos de 1-2 linhas. Emojis estratégicos (🚨🤯👇💥)
- Fala direto com o leitor ("você", "me segue")
- Sempre termina com CTA (seguir, comentar, compartilhar)

EXEMPLOS DO ESTILO (few-shot):

Exemplo 1 —
hook: "🚨 A OpenAI acabou de MATAR os apps de fotos"
caption: "O novo modelo de imagem da OpenAI faz em 10 segundos o que designers levam horas.\\n\\nEdição por texto. Qualquer estilo. De graça.\\n\\n🤯 E o pior (ou melhor): isso é só o começo.\\n\\nQuem trabalha com design precisa ver isso AGORA.\\n\\n👉 Me segue para não ficar para trás na revolução da IA."

Exemplo 2 —
hook: "🤖 Robôs da China já trabalham 24h sem parar"
caption: "Enquanto você dormia, uma fábrica na China rodou a noite inteira SEM UM ÚNICO humano.\\n\\nRobôs com IA:\\n✅ Não cansam\\n✅ Não erram\\n✅ Não pedem aumento\\n\\n💥 A pergunta não é SE isso chega no Brasil. É QUANDO.\\n\\n👇 Comenta aí: seu trabalho está seguro?"

REGRAS DO PACOTE:
- hook: máx 70 caracteres, vai escrito NA IMAGEM (precisa bater o olho e entender)
- caption: 400-900 caracteres, estilo dos exemplos, SEM hashtags no meio
- hashtags: 6-10, misturando o idioma do post e EN, separadas por espaço
- image_prompt: em INGLÊS, descreve uma cena SEM TEXTO (o hook é sobreposto depois), enquadrada para vertical 4:5 (feed do Instagram) — assunto principal centralizado, sem detalhes importantes perto das bordas de cima/baixo. Estilo FOTOGRÁFICO REALISTA (parece foto tirada por câmera de verdade, iluminação natural, textura real de pele/materiais) — NUNCA render 3D genérico, ilustração digital brilhante demais, simetria perfeita ou o "estilo IA" óbvio (cores neon saturadas, glow artificial, pele plástica). Termine SEMPRE com, nesta ordem exata: "vertical 4:5 portrait aspect ratio (1080x1350), photorealistic, shot on camera, natural lighting, realistic textures, editorial photography, no CGI look, no AI-art look". O aspect ratio precisa vir escrito no prompt final porque ele também é colado manualmente em apps de geração (Gemini/nano banana) que não recebem parâmetro de tamanho separado — só o texto.`,
    messages: [
      {
        role: "user",
        content: `Crie o pacote de post para esta notícia:\n\nTítulo: ${input.title}\nResumo: ${input.summary ?? "(sem resumo)"}\nFonte: ${input.url}`,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            hook: { type: "string" },
            caption: { type: "string" },
            hashtags: { type: "string" },
            image_prompt: { type: "string" },
          },
          required: ["hook", "caption", "hashtags", "image_prompt"],
          additionalProperties: false,
        },
      },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Resposta da geração sem bloco de texto");
  }

  return JSON.parse(textBlock.text) as PostPackage;
}

// Mesmo prompt (system + few-shot) do Claude, só o transporte muda —
// mantém geração equivalente entre os dois providers.
function buildSystemPrompt(lang: string): string {
  return `Você escreve posts virais de Instagram para um perfil de notícias de IA, no estilo de @gurudoprompt, @guilhermemorais.ia e @hollyfield.ia.

⚠️ IDIOMA DO POST: escreva hook, caption e hashtags em ${lang}. Os exemplos abaixo estão em português apenas para mostrar o ESTILO — reproduza o estilo, não o idioma. O image_prompt continua sempre em inglês.

CARACTERÍSTICAS DO TOM:
- Sensacionalista mas verídico: urgência, choque, FOMO — sem inventar fatos
- Frases curtas. Parágrafos de 1-2 linhas. Emojis estratégicos (🚨🤯👇💥)
- Fala direto com o leitor ("você", "me segue")
- Sempre termina com CTA (seguir, comentar, compartilhar)

EXEMPLOS DO ESTILO (few-shot):

Exemplo 1 —
hook: "🚨 A OpenAI acabou de MATAR os apps de fotos"
caption: "O novo modelo de imagem da OpenAI faz em 10 segundos o que designers levam horas.\\n\\nEdição por texto. Qualquer estilo. De graça.\\n\\n🤯 E o pior (ou melhor): isso é só o começo.\\n\\nQuem trabalha com design precisa ver isso AGORA.\\n\\n👉 Me segue para não ficar para trás na revolução da IA."

Exemplo 2 —
hook: "🤖 Robôs da China já trabalham 24h sem parar"
caption: "Enquanto você dormia, uma fábrica na China rodou a noite inteira SEM UM ÚNICO humano.\\n\\nRobôs com IA:\\n✅ Não cansam\\n✅ Não erram\\n✅ Não pedem aumento\\n\\n💥 A pergunta não é SE isso chega no Brasil. É QUANDO.\\n\\n👇 Comenta aí: seu trabalho está seguro?"

REGRAS DO PACOTE:
- hook: máx 70 caracteres, vai escrito NA IMAGEM (precisa bater o olho e entender)
- caption: 400-900 caracteres, estilo dos exemplos, SEM hashtags no meio
- hashtags: 6-10, misturando o idioma do post e EN, separadas por espaço
- image_prompt: em INGLÊS, descreve uma arte impactante SEM TEXTO (o hook é sobreposto depois), enquadrada para vertical 4:5 (feed do Instagram). Estilo: cinematic, dramatic lighting, tech/AI aesthetic. Termine SEMPRE com: "vertical 4:5 portrait aspect ratio (1080x1350)" — precisa vir escrito no prompt porque ele também é colado manualmente em apps de geração (Gemini/nano banana) sem parâmetro de tamanho.`;
}

const POST_PACKAGE_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    caption: { type: "string" },
    hashtags: { type: "string" },
    image_prompt: { type: "string" },
  },
  required: ["hook", "caption", "hashtags", "image_prompt"],
};

/**
 * Geração real com Gemini 2.5 Flash — mesmo prompt do Claude, JSON
 * garantido via responseSchema. Alternativa mais barata ao Sonnet.
 */
async function geminiGenerate(input: GenerateInput): Promise<PostPackage> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const lang = languageName(input.language ?? "pt-BR");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Crie o pacote de post para esta notícia:\n\nTítulo: ${input.title}\nResumo: ${input.summary ?? "(sem resumo)"}\nFonte: ${input.url}`,
    config: {
      systemInstruction: buildSystemPrompt(lang),
      responseMimeType: "application/json",
      responseSchema: POST_PACKAGE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Resposta da geração (Gemini) sem texto");
  return JSON.parse(text) as PostPackage;
}

/**
 * Geração via Pollinations.ai (text.pollinations.ai) — grátis, sem
 * key (modelo "openai" = GPT-OSS 20B, tier anonymous). Mesmo
 * system prompt do Claude/Gemini, só o transporte muda.
 * A resposta vem com um campo "reasoning" (chain-of-thought) que
 * é ignorado — só o "content" (JSON do pacote) importa. hashtags
 * às vezes volta como array em vez de string — normaliza aqui.
 */
async function pollinationsGenerate(input: GenerateInput): Promise<PostPackage> {
  const lang = languageName(input.language ?? "pt-BR");
  const apiKey = process.env.POLLINATIONS_API_KEY;

  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({
      model: "openai",
      messages: [
        { role: "system", content: buildSystemPrompt(lang) },
        {
          role: "user",
          content: `Crie o pacote de post para esta notícia:\n\nTítulo: ${input.title}\nResumo: ${input.summary ?? "(sem resumo)"}\nFonte: ${input.url}\n\nResponda APENAS com o JSON do pacote (hook, caption, hashtags, image_prompt), sem texto antes ou depois.`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Pollinations respondeu ${res.status}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Pollinations não retornou conteúdo");

  const parsed = JSON.parse(content) as {
    hook: string;
    caption: string;
    hashtags: string | string[];
    image_prompt: string;
  };
  return {
    ...parsed,
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.join(" ")
      : parsed.hashtags,
  };
}

/**
 * Ponto de entrada: usa o provider escolhido pelo usuário em Ajustes
 * (text_provider). Cai pro Claude se pedir Gemini sem GEMINI_API_KEY,
 * e pro MOCK se não tiver nenhuma key configurada.
 */
export async function generatePostPackage(
  input: GenerateInput,
  provider: "claude" | "gemini" | "pollinations" = "gemini"
): Promise<PostPackage> {
  if (provider === "pollinations") {
    return pollinationsGenerate(input);
  }
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return geminiGenerate(input);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[generate] nenhuma API key de IA — usando MOCK");
    return mockGenerate(input);
  }
  return claudeGenerate(input);
}
