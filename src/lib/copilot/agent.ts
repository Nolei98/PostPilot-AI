// ============================================================
// Loop do agente do Copiloto (Sprint F, v1) — ReAct simples, mesmo
// padrão de "contrato JSON + validação + 1 retry" já usado em
// src/lib/ai/generate.ts e src/lib/ai/carousel.ts. Não introduz lib de
// agente nova (o projeto não usa nenhuma) nem tool-calling nativo de SDK
// — os providers plugados hoje não têm um transporte multi-turno comum
// (nvidiaChatJson é system+user únicos, sem histórico estruturado), e
// inventar isso pra 4 ferramentas não compensa.
//
// Cérebro do agente: SEMPRE NVIDIA (nvidiaChatJson), não o
// resolveTextProvider do Brand Kit. Motivo: o provider do Brand Kit
// decide quem escreve a LEGENDA do post (dentro do job de geração, que
// roda depois) — é um problema diferente de "qual modelo decide a
// próxima ferramenta a chamar". Manter o roteador do agente num só
// provider evita escrever 4 transportes quase iguais (Claude/Gemini/
// Pollinations/NVIDIA) pra uma etapa que não é conteúdo entregue ao
// cliente final, e NVIDIA é o default grátis da política de custo zero
// (ver ESTADO-DO-PROJETO.md §6).
//
// Cada turno do usuário roda até MAX_PASSOS idas-e-vindas de ferramenta
// (barra custo de IA descontrolado por mensagem) e devolve uma resposta
// final em português. O chamador (route handler) consome via
// async generator — cada `yield` é um evento pra empurrar no SSE.
// ============================================================
import { nvidiaChatJson } from "@/lib/ai/nvidia";
import {
  buscarReferencias,
  gerarBrief,
  gerarPostUnico,
  gerarCarrossel,
  type CopilotContext,
} from "@/lib/copilot/tools";

export type CopilotEvento =
  | { tipo: "passo"; ferramenta: string; status: "inicio" | "fim" | "erro"; rotulo: string }
  | { tipo: "mensagem"; texto: string };

const MAX_PASSOS = 4;

const FERRAMENTAS_DESCRICAO = `
Ferramentas disponíveis (responda SEMPRE em JSON, um objeto só, sem texto fora dele):

1. buscar_referencias — lê o que já foi coletado no Viral Radar do cliente.
   input: { "topico"?: string }
   Use quando o usuário pedir ideia, inspiração, ou "o que bombou".

2. gerar_brief — a partir de referências JÁ BUSCADAS (passo anterior), extrai
   o padrão e sugere ângulos originais.
   input: { "referencias": [...] }  ← use EXATAMENTE o array devolvido por
   buscar_referencias, não invente.
   Só chame depois de buscar_referencias na mesma conversa.

3. gerar_post_unico — cria um post único (imagem 4:5) e manda pra fila de
   aprovação. NÃO publica sozinho.
   input: { "tema": string, "angulo"?: string }

4. gerar_carrossel — cria um carrossel (7–10 cards) e manda pra fila de
   aprovação. NÃO publica sozinho.
   input: { "tema": string, "angulo"?: string }

5. responder — quando não precisa de mais nenhuma ferramenta, encerre com
   uma resposta final em português pro usuário.
   input: { "texto": string }

Formato OBRIGATÓRIO da resposta: {"acao": "<nome da ferramenta>", "input": {...}}
`;

const SYSTEM_PROMPT = `Você é o copiloto do PostPilot, um app que gera posts de Instagram a
partir de notícias e referências virais. Você conversa em português do
Brasil com o dono da conta, e pode acionar ferramentas internas pra
buscar referências, montar um brief e gerar posts/carrosséis.

REGRAS QUE NÃO PODEM SER QUEBRADAS:
- Você NUNCA publica nem agenda nada — todo conteúdo gerado cai numa fila
  de aprovação humana. Se o usuário pedir pra "publicar" ou "postar
  direto", explique que isso ainda depende de aprovação manual na Fila.
- Só chame gerar_post_unico/gerar_carrossel quando o usuário pedir
  conteúdo de verdade (não em resposta a "oi" ou perguntas genéricas).
- Prefira buscar_referencias → gerar_brief → gerar_post_unico/carrossel
  quando o pedido for vago ("faz um post sobre o que bombou"). Se o
  usuário já disser o tema exato, pode ir direto pra geração.
- Sempre responda com "acao": "responder" ao final, resumindo o que foi
  feito em português, de forma curta e direta.
${FERRAMENTAS_DESCRICAO}`;

interface AcaoAgente {
  acao: "buscar_referencias" | "gerar_brief" | "gerar_post_unico" | "gerar_carrossel" | "responder";
  input?: Record<string, unknown>;
}

function parseAcao(bruto: string): AcaoAgente | null {
  try {
    const obj = JSON.parse(bruto);
    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.acao === "string" &&
      ["buscar_referencias", "gerar_brief", "gerar_post_unico", "gerar_carrossel", "responder"].includes(
        obj.acao
      )
    ) {
      return obj as AcaoAgente;
    }
    return null;
  } catch {
    return null;
  }
}

/** Última linha "Usuário: ..." da transcrição — o pedido mais recente. */
function ultimaMensagemUsuario(transcricao: string): string {
  const linhas = transcricao.split("\n").filter((l) => l.startsWith("Usuário: "));
  return linhas.at(-1)?.slice("Usuário: ".length) ?? "";
}

/** Lê de volta o `resultado=` de uma chamada de ferramenta já registrada
 *  na transcrição (ver rodarTurno) — usado só pelo mock, pra encadear
 *  buscar_referencias → gerar_brief → gerar_post sem repetir a mesma
 *  ferramenta em loop. */
function ultimoResultado(transcricao: string, ferramenta: string): Record<string, unknown> | null {
  const marcador = `[ferramenta: ${ferramenta}]`;
  const idx = transcricao.lastIndexOf(marcador);
  if (idx === -1) return null;
  const m = transcricao.slice(idx).match(/resultado=(\{.*\})/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Mock determinístico, sem rede — mesmo espírito de mockBrief
 *  (src/lib/ai/remix.ts) e mockGenerate (src/lib/ai/generate.ts):
 *  sem NVIDIA_API_KEY, o Copiloto continua funcionando a $0, encadeando
 *  as mesmas 4 ferramentas por uma regra fixa em vez de um modelo. */
function mockProximaAcao(transcricao: string): AcaoAgente {
  const pedido = ultimaMensagemUsuario(transcricao);
  const pediuConteudo = /post|carross/i.test(pedido);
  if (!pediuConteudo) {
    return {
      acao: "responder",
      input: {
        texto:
          "[MOCK] Oi! Posso buscar referências do Radar, montar um brief ou gerar um post/carrossel — é só pedir.",
      },
    };
  }

  const pediuCarrossel = /carross/i.test(pedido);
  const geracao = ultimoResultado(transcricao, pediuCarrossel ? "gerar_carrossel" : "gerar_post_unico");
  if (geracao) {
    // Já gerou nesta rodada — encerra em vez de gerar de novo em loop.
    return { acao: "responder", input: { texto: (geracao.mensagem as string) ?? "[MOCK] Pronto." } };
  }

  const referencias = ultimoResultado(transcricao, "buscar_referencias");
  if (!referencias) return { acao: "buscar_referencias", input: {} };

  const brief = ultimoResultado(transcricao, "gerar_brief");
  if (!brief && Array.isArray(referencias.referencias) && referencias.referencias.length > 0) {
    return { acao: "gerar_brief", input: { referencias: referencias.referencias } };
  }

  const tema = (brief?.angulo as string | undefined) ?? pedido;
  return {
    acao: pediuCarrossel ? "gerar_carrossel" : "gerar_post_unico",
    input: { tema, angulo: brief?.padrao as string | undefined },
  };
}

/** Pergunta ao modelo qual a próxima ação, com 1 retry se a resposta não
 *  bater o contrato — mesmo padrão de generate.ts/carousel.ts. Sem
 *  NVIDIA_API_KEY, cai no mock — zero requisição, mesma regra do resto
 *  do projeto. */
async function proximaAcao(transcricao: string): Promise<AcaoAgente> {
  if (!process.env.NVIDIA_API_KEY) return mockProximaAcao(transcricao);

  const bruto = await nvidiaChatJson(SYSTEM_PROMPT, transcricao, { preferirRapido: false });
  const acao = parseAcao(bruto);
  if (acao) return acao;

  const retry = await nvidiaChatJson(
    SYSTEM_PROMPT,
    `${transcricao}\n\n⚠️ Sua última resposta não veio no formato JSON pedido. Responda de novo, SÓ o JSON: {"acao": "...", "input": {...}}.`,
    { preferirRapido: true }
  );
  const acaoRetry = parseAcao(retry);
  if (acaoRetry) return acaoRetry;

  // Degrada pra uma resposta segura em vez de lançar — o usuário vê uma
  // mensagem, não um erro 500 no meio do chat.
  return {
    acao: "responder",
    input: { texto: "Não consegui entender o pedido agora. Pode reformular?" },
  };
}

const ROTULOS: Record<string, string> = {
  buscar_referencias: "Buscando referências no Radar…",
  gerar_brief: "Gerando o brief…",
  gerar_post_unico: "Gerando o post…",
  gerar_carrossel: "Gerando o carrossel…",
};

/**
 * Roda um turno completo (1 mensagem do usuário → N ferramentas →
 * resposta final), emitindo eventos de progresso conforme acontece.
 *
 * `historico` é o texto das mensagens anteriores da MESMA conversa
 * (já persistidas em copilot_messages), concatenado pelo chamador —
 * ver route.ts. Não é um array estruturado porque nvidiaChatJson não
 * aceita histórico multi-turno (ver comentário do topo do arquivo).
 */
export async function* rodarTurno(
  mensagemUsuario: string,
  historico: string,
  ctx: CopilotContext
): AsyncGenerator<CopilotEvento> {
  let transcricao = historico
    ? `${historico}\n\nUsuário: ${mensagemUsuario}`
    : `Usuário: ${mensagemUsuario}`;

  for (let passo = 0; passo < MAX_PASSOS; passo++) {
    const acao = await proximaAcao(transcricao);

    if (acao.acao === "responder") {
      const texto =
        typeof acao.input?.texto === "string"
          ? acao.input.texto
          : "Pronto.";
      yield { tipo: "mensagem", texto };
      return;
    }

    const rotulo = ROTULOS[acao.acao] ?? acao.acao;
    yield { tipo: "passo", ferramenta: acao.acao, status: "inicio", rotulo };

    try {
      const resultado = await executarFerramenta(acao, ctx);
      yield { tipo: "passo", ferramenta: acao.acao, status: "fim", rotulo };
      transcricao += `\n\n[ferramenta: ${acao.acao}] input=${JSON.stringify(
        acao.input ?? {}
      )} resultado=${JSON.stringify(resultado)}`;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      yield { tipo: "passo", ferramenta: acao.acao, status: "erro", rotulo };
      transcricao += `\n\n[ferramenta: ${acao.acao}] FALHOU: ${motivo}`;
    }
  }

  // Estourou o teto de passos sem chegar em "responder" — encerra com
  // uma mensagem final em vez de deixar o usuário sem resposta.
  yield {
    tipo: "mensagem",
    texto: "Fiz algumas buscas e gerações, mas não consegui fechar a resposta. Confira a Fila de aprovação — pode ser que o post já tenha entrado lá.",
  };
}

async function executarFerramenta(acao: AcaoAgente, ctx: CopilotContext): Promise<unknown> {
  const input = acao.input ?? {};
  switch (acao.acao) {
    case "buscar_referencias":
      return buscarReferencias({ topico: input.topico as string | undefined }, ctx);
    case "gerar_brief":
      return gerarBrief({ referencias: (input.referencias as never[]) ?? [] }, ctx);
    case "gerar_post_unico":
      return gerarPostUnico(
        { tema: String(input.tema ?? ""), angulo: input.angulo as string | undefined },
        ctx
      );
    case "gerar_carrossel":
      return gerarCarrossel(
        { tema: String(input.tema ?? ""), angulo: input.angulo as string | undefined },
        ctx
      );
    default:
      throw new Error(`Ferramenta desconhecida: ${acao.acao}`);
  }
}
