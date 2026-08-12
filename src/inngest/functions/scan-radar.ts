// ============================================================
// Job: Viral Radar (Sprint E, fatia 1) — coleta referências com
// engajamento REAL e grava ranqueadas em `viral_references`.
//
// Diferente do scan-news: aquele busca PAUTA (o que merece virar post,
// julgado pela IA lendo a manchete) e custa IA por notícia. Este busca
// REFERÊNCIA (o que já performou, com número medido) e **não gasta IA
// nenhuma** — o score é aritmética sobre o engajamento que a plataforma
// devolveu. Por isso pode rodar mais solto que a varredura de notícias.
//
// Roda a cada 12h ou sob demanda (radar/scan.requested).
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { hackerNewsCollector } from "@/lib/radar/hackernews";
import { redditCollector } from "@/lib/radar/reddit";
import { ranquear } from "@/lib/radar/score";
import { topicsForClient } from "@/lib/radar/topics";
import type { RadarCollector, RadarItem } from "@/lib/radar/types";

/** Coletores ativos. O Reddit fica registrado sempre — sem
 *  REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET ele devolve `[]` sozinho (ver
 *  reddit.ts), então não precisa condicional aqui. EM STANDBY desde
 *  2026-08-12: a Reddit passou a exigir "moderation use case" pra
 *  liberar a credencial — ver PROGRESSO-2.0.md §0-O.2. */
const COLETORES: RadarCollector[] = [hackerNewsCollector, redditCollector];

/** Janela de coleta. Sete dias porque o score já penaliza o que é velho
 *  (fatorRecencia) — cortar antes disso deixaria a lista vazia em nicho
 *  de baixo volume. */
const JANELA_DIAS = 7;
/** Teto por consulta, pra uma varredura não inflar a tabela. */
const LIMITE_POR_CONSULTA = 25;

export const scanRadar = inngest.createFunction(
  { id: "scan-radar", retries: 2 },
  [{ cron: "0 */12 * * *" }, { event: "radar/scan.requested" }],
  async ({ event, step }) => {
    const supabase = createAdminClient();
    const clienteManual = (event as { data?: { clientId?: string } })?.data?.clientId;

    // Quais clientes varrer. No disparo manual, só o pedido; no cron, o
    // cliente ATIVO de cada dono — mesma regra de fan-out do scan-news,
    // pelo mesmo motivo: não multiplicar trabalho por cliente parado.
    const alvos = await step.run("alvos", async () => {
      if (clienteManual) {
        // owner_user_id, não user_id: é o nome da coluna em `clients`
        // desde a migration 020. `viral_references.user_id` guarda esse
        // mesmo dono, pra RLS conseguir filtrar sem join.
        const { data, error } = await supabase
          .from("brand_kits")
          .select("client_id, niche, keywords, clients!inner(owner_user_id)")
          .eq("client_id", clienteManual)
          .maybeSingle();
        // Lançar, e não devolver lista vazia: na primeira versão um nome
        // de coluna errado virou "0 clientes" e o job terminou com
        // sucesso aparente — o defeito só apareceu porque a tabela ficou
        // vazia. Erro de query tem que falhar alto.
        if (error) throw new Error(`alvos (manual): ${error.message}`);
        if (!data) return [];
        return [
          {
            clientId: data.client_id as string,
            userId: (data.clients as unknown as { owner_user_id: string }).owner_user_id,
            niche: data.niche as string | null,
            keywords: (data.keywords as string[] | null) ?? [],
          },
        ];
      }

      const { data: configs, error: erroConfigs } = await supabase
        .from("notification_configs")
        .select("user_id, active_client_id")
        .not("active_client_id", "is", null);
      if (erroConfigs) throw new Error(`alvos (cron): ${erroConfigs.message}`);

      const ativos = (configs ?? []).map((c) => ({
        userId: c.user_id as string,
        clientId: c.active_client_id as string,
      }));
      if (ativos.length === 0) return [];

      const { data: kits, error: erroKits } = await supabase
        .from("brand_kits")
        .select("client_id, niche, keywords")
        .in(
          "client_id",
          ativos.map((a) => a.clientId)
        );
      if (erroKits) throw new Error(`alvos (kits): ${erroKits.message}`);

      const porCliente = new Map(
        (kits ?? []).map((k) => [
          k.client_id as string,
          { niche: k.niche as string | null, keywords: (k.keywords as string[] | null) ?? [] },
        ])
      );

      return ativos.map((a) => ({
        ...a,
        niche: porCliente.get(a.clientId)?.niche ?? null,
        keywords: porCliente.get(a.clientId)?.keywords ?? [],
      }));
    });

    if (alvos.length === 0) return { clientes: 0, coletados: 0, gravados: 0 };

    const desde = new Date(Date.now() - JANELA_DIAS * 24 * 3_600_000);
    let coletados = 0;
    let gravados = 0;

    for (const alvo of alvos) {
      const consultas = topicsForClient(alvo.niche, alvo.keywords);

      const itens = await step.run(`coletar-${alvo.clientId}`, async () => {
        const achados: RadarItem[] = [];
        for (const coletor of COLETORES) {
          for (const consulta of consultas) {
            const lote = await coletor.collect(consulta, {
              desde,
              limite: LIMITE_POR_CONSULTA,
            });
            achados.push(...lote);
          }
        }
        return achados;
      });
      coletados += itens.length;
      if (itens.length === 0) continue;

      const gravou = await step.run(`gravar-${alvo.clientId}`, async () => {
        // O mesmo item pode vir por duas consultas ("LLM" e "open source
        // AI" devolvem coisa em comum). Deduplica ANTES do upsert: o
        // Postgres recusa um ON CONFLICT com a chave repetida no mesmo
        // comando ("cannot affect row a second time").
        const porChave = new Map<string, ReturnType<typeof ranquear>[number]>();
        for (const item of ranquear(itens)) {
          porChave.set(`${item.platform}:${item.externalId}`, item);
        }

        const linhas = [...porChave.values()].map((item) => ({
          client_id: alvo.clientId,
          user_id: alvo.userId,
          platform: item.platform,
          external_id: item.externalId,
          url: item.url,
          title: item.title.slice(0, 500),
          author: item.author,
          topic: item.topic,
          points: item.points,
          comments: item.comments,
          published_at: item.publishedAt,
          score: item.score,
          collected_at: new Date().toISOString(),
        }));

        // upsert e não insert: o engajamento MUDA entre varreduras — o
        // mesmo item volta com mais pontos, e o que interessa é o número
        // de agora, não o da primeira vez que ele apareceu.
        const { data, error } = await supabase
          .from("viral_references")
          .upsert(linhas, { onConflict: "client_id,platform,external_id" })
          .select("id");
        if (error) throw new Error(`viral_references: ${error.message}`);
        return data?.length ?? 0;
      });
      gravados += gravou;
    }

    return { clientes: alvos.length, coletados, gravados };
  }
);
