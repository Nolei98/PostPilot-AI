// ============================================================
// Geração do pacote de conteúdo com Claude Sonnet 4.6.
// Entrada: notícia candidata. Saída: hook + legenda + hashtags
// + prompt de imagem, no tom dos perfis de referência.
//
// 💰 Custo: Sonnet 4.6 = $3/M entrada, $15/M saída.
//    ~90 posts/mês ≈ $2-4/mês.
// 🆓 MOCK: sem ANTHROPIC_API_KEY, gera pacote fixo baseado
//    no título — $0, testa o pipeline inteiro.
// ============================================================
import Anthropic from "@anthropic-ai/sdk";

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
      "futuristic AI technology concept, glowing neural network, dramatic blue and violet lighting, cinematic, high detail, no text",
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
- image_prompt: em INGLÊS, descreve uma arte impactante SEM TEXTO (o hook é sobreposto depois). Estilo: cinematic, dramatic lighting, tech/AI aesthetic.`,
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

/**
 * Ponto de entrada: Claude se houver key, senão mock.
 */
export async function generatePostPackage(
  input: GenerateInput
): Promise<PostPackage> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[generate] ANTHROPIC_API_KEY ausente — usando MOCK");
    return mockGenerate(input);
  }
  return claudeGenerate(input);
}
