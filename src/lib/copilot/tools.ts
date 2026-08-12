// ============================================================
// Ferramentas do Copiloto de chat (Sprint F, v1).
//
// Wrappers finos em cima do que já existe — nenhuma lógica de
// negócio nova aqui, só a "cola" entre o agente e os módulos:
//
// - buscar_referencias: lê `viral_references` (já coletado pelo job
//   scan-radar) — mesmo padrão de leitura que `gerarBriefDeRemix`
//   (actions.ts) já usa. NÃO chama os coletores direto: se o usuário
//   quer dado fresco, o botão "Varrer agora" do /radar já existe pra
//   isso, e reimplementar a coleta aqui duplicaria timeout/retry que
//   já vive em src/lib/radar/*.
// - gerar_brief: chama generateRemixBrief (src/lib/ai/remix.ts) direto,
//   síncrono — mesma chamada que gerarBriefDeRemix faz.
// - gerar_post_unico / gerar_carrossel: NÃO chamam generatePostPackage/
//   generateCarouselPackage direto. Em vez disso, criam uma notícia
//   SINTÉTICA (mesmo contrato que o scan-news preenche pra uma notícia
//   real) e disparam o MESMO evento que o scan-news dispara
//   (post/generate.requested | post/generate-carousel.requested) — os
//   jobs generate-post.ts/generate-carousel.ts então cuidam de cota,
//   geração de texto, dedupe por embedding, imagem base e
//   pending_approval exatamente como fazem hoje pro cron. Duplicar essa
//   lógica aqui seria o mesmo bug em dois lugares esperando pra
//   acontecer.
// ============================================================
import { createClient } from "@/lib/supabase/server";
import { getActiveClientId } from "@/lib/client-context";
import { enqueue } from "@/lib/enqueue";
import type { RemixBrief, RemixReference } from "@/lib/ai/remix";
import { COPILOT_SOURCE_FEED_URL } from "@/lib/copilot/constants";

const COPILOT_SOURCE_NAME = "Copiloto (interno)";

export interface CopilotContext {
  userId: string;
  clientId: string;
}

async function resolverContexto(): Promise<CopilotContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  const clientId = await getActiveClientId();
  if (!clientId) throw new Error("Nenhum cliente ativo");
  return { userId: user.id, clientId };
}

// --- buscar_referencias -------------------------------------

export interface BuscarReferenciasInput {
  /** Filtra pelo texto da consulta que trouxe o item (topic). Opcional —
   *  sem filtro, devolve o topo geral do cliente. */
  topico?: string;
  limite?: number;
}

export interface BuscarReferenciasResultado {
  referencias: RemixReference[];
  vazio: boolean;
}

export async function buscarReferencias(
  input: BuscarReferenciasInput,
  ctx: CopilotContext
): Promise<BuscarReferenciasResultado> {
  const supabase = createClient();
  let query = supabase
    .from("viral_references")
    .select("title, platform, points, comments, score, topic")
    .eq("client_id", ctx.clientId)
    .order("score", { ascending: false })
    .limit(Math.min(25, Math.max(1, input.limite ?? 8)));

  if (input.topico) {
    query = query.ilike("topic", `%${input.topico}%`);
  }

  const { data } = await query;
  const referencias = (data ?? []) as RemixReference[];
  return { referencias, vazio: referencias.length === 0 };
}

// --- gerar_brief ----------------------------------------------

export interface GerarBriefInput {
  referencias: RemixReference[];
}

export async function gerarBrief(
  input: GerarBriefInput,
  ctx: CopilotContext
): Promise<RemixBrief> {
  if (input.referencias.length === 0) {
    throw new Error("Nenhuma referência pra gerar brief — busque referências primeiro.");
  }
  const supabase = createClient();
  const { data: kit } = await supabase
    .from("brand_kits")
    .select("niche, post_language, text_provider")
    .eq("client_id", ctx.clientId)
    .maybeSingle();

  const { generateRemixBrief } = await import("@/lib/ai/remix");
  const { resolveTextProvider } = await import("@/lib/ai/provider");
  return generateRemixBrief(
    {
      referencias: input.referencias,
      niche: kit?.niche ?? null,
      language: kit?.post_language ?? "pt-BR",
    },
    resolveTextProvider(kit?.text_provider)
  );
}

// --- gerar_post_unico / gerar_carrossel ------------------------

export interface GerarConteudoInput {
  /** Tema/título do post — vira o `title` da notícia sintética. */
  tema: string;
  /** Ângulo ou contexto extra (ex: o `angulo` de um RemixBrief) — vira
   *  o `summary`, mesmo campo que generate-post/generate-carousel leem
   *  pra montar o prompt de geração. */
  angulo?: string;
}

export interface GerarConteudoResultado {
  newsItemId: string;
  mensagem: string;
}

/** Garante a fonte sintética do cliente (get-or-create, idempotente —
 *  a unique (client_id, feed_url) já cobre concorrência). */
async function garantirFonteSintetica(ctx: CopilotContext): Promise<string> {
  const supabase = createClient();
  const { data: existente } = await supabase
    .from("source_configs")
    .select("id")
    .eq("client_id", ctx.clientId)
    .eq("feed_url", COPILOT_SOURCE_FEED_URL)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: criada, error } = await supabase
    .from("source_configs")
    .insert({
      user_id: ctx.userId,
      client_id: ctx.clientId,
      name: COPILOT_SOURCE_NAME,
      feed_url: COPILOT_SOURCE_FEED_URL,
      threshold: 0,
      // Nunca varrida pelo scan-news (que filtra enabled=true) — só
      // existe pra satisfazer a FK not null de news_items.source_id.
      enabled: false,
    })
    .select("id")
    .single();
  if (error || !criada) {
    throw new Error(`Não foi possível preparar a fonte interna: ${error?.message}`);
  }
  return criada.id;
}

async function criarNoticiaSintetica(
  input: GerarConteudoInput,
  ctx: CopilotContext
): Promise<string> {
  const sourceId = await garantirFonteSintetica(ctx);
  const supabase = createClient();
  const { data, error } = await supabase
    .from("news_items")
    .insert({
      source_id: sourceId,
      client_id: ctx.clientId,
      url: `${COPILOT_SOURCE_FEED_URL}/${crypto.randomUUID()}`,
      title: input.tema,
      summary: input.angulo ?? null,
      status: "candidate",
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Não foi possível criar a notícia: ${error?.message}`);
  }
  return data.id;
}

export async function gerarPostUnico(
  input: GerarConteudoInput,
  ctx: CopilotContext
): Promise<GerarConteudoResultado> {
  const newsItemId = await criarNoticiaSintetica(input, ctx);
  await enqueue("copiloto/gerar_post_unico", {
    name: "post/generate.requested",
    data: { newsItemId, userId: ctx.userId },
  });
  return {
    newsItemId,
    mensagem: "Post entrou na fila de geração — aparece em Fila de aprovação em instantes.",
  };
}

export async function gerarCarrossel(
  input: GerarConteudoInput,
  ctx: CopilotContext
): Promise<GerarConteudoResultado> {
  const newsItemId = await criarNoticiaSintetica(input, ctx);
  await enqueue("copiloto/gerar_carrossel", {
    name: "post/generate-carousel.requested",
    data: { newsItemId, userId: ctx.userId },
  });
  return {
    newsItemId,
    mensagem: "Carrossel entrou na fila de geração — aparece em Fila de aprovação em instantes.",
  };
}

export { resolverContexto };
