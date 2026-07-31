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
import { ranquear } from "@/lib/radar/score";
import { topicsForClient } from "@/lib/radar/topics";
import type { RadarCollector, RadarItem } from "@/lib/radar/types";

/** Coletores ativos. O Reddit entra aqui quando existir app OAuth: o
 *  `.json` público passou a devolver 403 em 2025. Nada mais muda. */
const COLETORES: RadarCollector[] = [hackerNewsCollector];

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
        const { data } = await supabase
          .from("brand_kits")
          .select("client_id, niche, keywords, clients!inner(user_id)")
          .eq("client_id", clienteManual)
          .maybeSingle();
        if (!data) return [];
        return [
          {
            clientId: data.client_id as string,
            userId: (data.clients as unknown as { user_id: string }).user_id,
            niche: data.niche as string | null,
            keywords: (data.keywords as string[] | null) ?? [],
          },
        ];
      }

      const { data: configs } = await supabase
        .from("notification_configs")
        .select("user_id, active_client_id")
        .not("active_client_id", "is", null);

      const ativos = (configs ?? []).map((c) => ({
        userId: c.user_id as string,
        clientId: c.active_client_id as string,
      }));
      if (ativos.length === 0) return [];

      const { data: kits } = await supabase
        .from("brand_kits")
        .select("client_id, niche, keywords")
        .in(
          "client_id",
          ativos.map((a) => a.clientId)
        );

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
