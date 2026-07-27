// ============================================================
// Job: varredura de fontes RSS + triagem viral.
//
// Roda a cada 3h (cron) ou sob demanda (evento news/scan.requested).
// Fluxo: busca fontes ativas → baixa feeds → deduplica → triagem
// com Haiku em lote → grava scores → candidatas disparam geração.
// ============================================================
import Parser from "rss-parser";
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { triageNews, type TriageInput } from "@/lib/ai/triage";
import { checkImageLicenseHint } from "@/lib/image-license";
import type { SourceConfig } from "@/lib/types";

// media:content não é um campo padrão do rss-parser — precisa
// registrar explicitamente. enclosure já vem por padrão.
type FeedItemWithMedia = Parser.Item & {
  "media:content"?: { $?: { url?: string; medium?: string } } | Array<{ $?: { url?: string; medium?: string } }>;
};

/** Extrai a URL da imagem original da matéria, se o feed trouxer uma. */
function extractImageUrl(item: FeedItemWithMedia): string | null {
  if (item.enclosure?.url && item.enclosure.type?.startsWith("image/")) {
    return item.enclosure.url;
  }
  const media = item["media:content"];
  const mediaItem = Array.isArray(media) ? media[0] : media;
  if (mediaItem?.$?.url) return mediaItem.$.url;
  return null;
}

// Quantas notícias por chamada de triagem (controla tamanho do prompt)
const TRIAGE_BATCH_SIZE = 20;
// Ignora notícias mais antigas que isso (feed pode ter histórico longo)
const MAX_AGE_HOURS = 48;

export const scanNews = inngest.createFunction(
  { id: "scan-news", retries: 2 },
  [
    { cron: "0 */3 * * *" }, // a cada 3 horas
    { event: "news/scan.requested" }, // ou disparo manual
  ],
  async ({ event, step }) => {
    const supabase = createAdminClient();
    // Só presente no disparo manual (botão "Varrer agora") — usado pra
    // reportar o resultado de volta na tabela scan_runs (o cron não usa;
    // o trigger de cron nem tem campo "data" tipado do jeito do evento).
    const scanRunId = (event as { data?: { scanRunId?: string } })?.data
      ?.scanRunId;
    // Scan manual ("Varrer agora") manda o cliente ativo — varre só as
    // fontes dele. No cron (sem clientId) varre o cliente ATIVO de cada
    // usuário (fan-out 1x: active_client_id em notification_configs).
    const manualClientId = (event as { data?: { clientId?: string } })?.data
      ?.clientId;

    // Motivo da primeira degradação da triagem nesta rodada (provider
    // falhou e caiu no mock). A varredura segue e termina como 'done',
    // mas o motivo fica gravado — senão a rodada pareceria perfeita e
    // ninguém saberia que os scores vieram do mock.
    let triageDegradedReason: string | null = null;

    async function finishScanRun(result: {
      sources: number;
      inserted: number;
      triaged: number;
      candidates: number;
    }) {
      if (scanRunId) {
        await step.run("update-scan-run", async () => {
          await supabase
            .from("scan_runs")
            .update({
              status: "done",
              sources: result.sources,
              inserted: result.inserted,
              triaged: result.triaged,
              candidates: result.candidates,
              error_message: triageDegradedReason
                ? `Triagem degradada (scores do MOCK): ${triageDegradedReason}`
                : null,
              finished_at: new Date().toISOString(),
            })
            .eq("id", scanRunId);
        });
      }
      return result;
    }

    try {
      // 1. Busca todas as fontes ativas (de todos os usuários)
      const allSources = await step.run("fetch-sources", async () => {
        const { data, error } = await supabase
          .from("source_configs")
          .select("*")
          .eq("enabled", true);
        if (error) throw new Error(`Erro ao buscar fontes: ${error.message}`);
        return (data ?? []) as SourceConfig[];
      });

      // Cliente ativo de cada dono (só usado no cron). No scan manual o
      // cliente vem no evento e o filtro abaixo usa manualClientId direto.
      const activeByOwnerRows = await step.run("fetch-active-clients", async () => {
        if (manualClientId) return [] as { user_id: string; active_client_id: string | null }[];
        const ownerIds = [...new Set(allSources.map((s) => s.user_id))];
        if (ownerIds.length === 0) return [];
        const { data } = await supabase
          .from("notification_configs")
          .select("user_id, active_client_id")
          .in("user_id", ownerIds);
        return (data ?? []) as { user_id: string; active_client_id: string | null }[];
      });
      const activeByOwner = new Map(
        activeByOwnerRows.map((r) => [r.user_id, r.active_client_id])
      );

      // Fan-out "só cliente ativo": mantém apenas as fontes do cliente
      // pedido (manual) ou do cliente ativo de cada dono (cron).
      const sources = allSources.filter((s) => {
        if (manualClientId) return s.client_id === manualClientId;
        const active = activeByOwner.get(s.user_id);
        // Sem active definido (não deveria após 021) → mantém, não trava geração.
        return active ? s.client_id === active : true;
      });

      if (sources.length === 0) {
        return await finishScanRun({
          sources: 0,
          inserted: 0,
          triaged: 0,
          candidates: 0,
        });
      }

    // 2. Para cada fonte: baixa o feed e insere notícias novas
    let totalInserted = 0;
    for (const source of sources) {
      const inserted = await step.run(`scan-${source.id}`, async () => {
        const parser = new Parser({
          timeout: 15000,
          customFields: { item: ["media:content"] },
        });
        let feed;
        try {
          feed = await parser.parseURL(source.feed_url);
        } catch (err) {
          // Feed fora do ar não derruba a varredura inteira
          console.error(`[scan] feed falhou: ${source.feed_url}`, err);
          return 0;
        }

        const cutoff = Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000;

        const rows = (feed.items ?? [])
          .filter((item) => item.link && item.title)
          .filter((item) => {
            // Sem data de publicação → aceita; com data → só recentes
            if (!item.isoDate && !item.pubDate) return true;
            const d = new Date(item.isoDate ?? item.pubDate!).getTime();
            return d >= cutoff;
          })
          .map((item) => {
            const imageUrl = extractImageUrl(item);
            return {
              source_id: source.id,
              client_id: source.client_id, // herda o tenant da fonte
              url: item.link!,
              title: item.title!.slice(0, 500),
              summary: (item.contentSnippet ?? item.content ?? "")
                .slice(0, 1000)
                .trim() || null,
              published_at: item.isoDate ?? null,
              status: "new" as const,
              image_url: imageUrl,
              image_license_hint: checkImageLicenseHint(imageUrl),
            };
          });

        if (rows.length === 0) return 0;

        // upsert com ignoreDuplicates → deduplicação pela unique
        // constraint (source_id, url). Notícia repetida é ignorada.
        const { data, error } = await supabase
          .from("news_items")
          .upsert(rows, {
            onConflict: "source_id,url",
            ignoreDuplicates: true,
          })
          .select("id");

        if (error) throw new Error(`Erro ao inserir notícias: ${error.message}`);
        return data?.length ?? 0;
      });
      totalInserted += inserted;
    }

    // 3. Triagem: pega o 'new' das fontes DESTE scan (cliente ativo) e
    //    classifica em lotes — escopar evita que backlog de outros
    //    clientes ocupe o limite e afome as notícias novas do ativo.
    const scanSourceIds = sources.map((s) => s.id);
    const pending = await step.run("fetch-pending", async () => {
      const { data, error } = await supabase
        .from("news_items")
        .select("id, title, summary, source_id")
        .eq("status", "new")
        .in("source_id", scanSourceIds)
        .limit(100);
      if (error) throw new Error(`Erro ao buscar pendentes: ${error.message}`);
      return data ?? [];
    });

    // Nicho é por CLIENTE (tenant), agora no brand_kit — a triagem usa
    // um critério diferente por nicho (ver triage.ts), então agrupamos as
    // pendentes por nicho ANTES de fatiar em lotes, para não misturar
    // notícias de nichos diferentes num mesmo prompt de triagem.
    const sourceOwner = new Map(sources.map((s) => [s.id, s.user_id]));
    const sourceClient = new Map(sources.map((s) => [s.id, s.client_id]));
    // step.run resultados passam por (de)serialização JSON no replay do
    // Inngest — retorna array (não Map) e monta o Map fora do step.
    const clientNicheRows = await step.run("fetch-client-niches", async () => {
      const clientIds = [...new Set(sources.map((s) => s.client_id))];
      const { data } = await supabase
        .from("brand_kits")
        .select("client_id, niche")
        .in("client_id", clientIds);
      return (data ?? []) as { client_id: string; niche: string | null }[];
    });
    const clientNiche = new Map(clientNicheRows.map((c) => [c.client_id, c.niche]));

    // Formato de geração por cliente (best-effort: se a migration 026 não
    // rodou, a coluna não existe → erro capturado → todos 'single' = hoje).
    const clientFormatRows = await step.run("fetch-client-formats", async () => {
      const clientIds = [...new Set(sources.map((s) => s.client_id))];
      const { data, error } = await supabase
        .from("brand_kits")
        .select("client_id, default_format")
        .in("client_id", clientIds);
      if (error) {
        console.warn("[scan] default_format indisponível (migration 026?):", error.message);
        return [] as { client_id: string; default_format: string | null }[];
      }
      return (data ?? []) as { client_id: string; default_format: string | null }[];
    });
    const clientFormat = new Map(
      clientFormatRows.map((c) => [c.client_id, c.default_format === "carousel" ? "carousel" : "single"])
    );
    const nicheOf = (sourceId: string) =>
      clientNiche.get(sourceClient.get(sourceId) ?? "") ?? null;

    // Só tria as pendentes cujas fontes este scan processa (cliente ativo) —
    // ignora 'new' de outros clientes que ficaram de scans anteriores.
    const pendingForScan = pending.filter((n) => sourceClient.has(n.source_id));

    const byNiche = new Map<string, typeof pending>();
    for (const news of pendingForScan) {
      const key = nicheOf(news.source_id) ?? "tecnologia";
      byNiche.set(key, [...(byNiche.get(key) ?? []), news]);
    }

    let candidates = 0;
    let batchIndex = 0;
    for (const [niche, newsForNiche] of byNiche) {
    for (let i = 0; i < newsForNiche.length; i += TRIAGE_BATCH_SIZE) {
      const batch = newsForNiche.slice(i, i + TRIAGE_BATCH_SIZE);
      const idx = batchIndex++;

      const { scored, degraded } = await step.run(`triage-batch-${idx}`, async () => {
        const inputs: TriageInput[] = batch.map((n) => ({
          id: n.id,
          title: n.title,
          summary: n.summary,
        }));
        let degradedReason: string | null = null;
        const results = await triageNews(inputs, niche, (reason) => {
          degradedReason = reason;
        });
        // Retornado pelo step (e não gravado numa variável de fora) porque
        // o Inngest memoiza o resultado do step: em retry/replay o efeito
        // colateral não roda de novo, mas o valor retornado volta igual.
        return { scored: results, degraded: degradedReason as string | null };
      });
      if (degraded && !triageDegradedReason) triageDegradedReason = degraded;

      // 4. Grava scores e decide candidato vs descarte por fonte
      const newCandidates = await step.run(`save-scores-${idx}`, async () => {
        // threshold de cada fonte (evita 1 query por notícia)
        const thresholdBySource = new Map(
          sources.map((s) => [s.id, s.threshold])
        );
        const candidateIds: { newsItemId: string; sourceId: string }[] = [];

        for (const result of scored) {
          const news = batch.find((n) => n.id === result.id);
          if (!news) continue;

          const threshold = thresholdBySource.get(news.source_id) ?? 70;
          const isCandidate = result.score >= threshold;

          const { error } = await supabase
            .from("news_items")
            .update({
              viral_score: result.score,
              score_reason: result.reason,
              status: isCandidate ? "candidate" : "discarded",
            })
            .eq("id", result.id);

          if (error) {
            console.error(`[scan] erro ao gravar score ${result.id}`, error);
            continue;
          }
          if (isCandidate) {
            candidateIds.push({ newsItemId: news.id, sourceId: news.source_id });
          }
        }
        return candidateIds;
      });

      // 5. Cada candidata dispara a geração — single ou carrossel conforme
      //    o default_format do cliente dono da fonte.
      if (newCandidates.length > 0) {
        await step.sendEvent(
          `dispatch-generate-${idx}`,
          newCandidates.map((c) => {
            const fmt = clientFormat.get(sourceClient.get(c.sourceId) ?? "");
            const name =
              fmt === "carousel"
                ? ("post/generate-carousel.requested" as const)
                : ("post/generate.requested" as const);
            return {
              name,
              data: {
                newsItemId: c.newsItemId,
                userId: sourceOwner.get(c.sourceId)!,
              },
            };
          })
        );
        candidates += newCandidates.length;
      }
    }
    }

      return await finishScanRun({
        sources: sources.length,
        inserted: totalInserted,
        triaged: pendingForScan.length,
        candidates,
      });
    } catch (err) {
      if (scanRunId) {
        await step.run("mark-scan-run-error", async () => {
          await supabase
            .from("scan_runs")
            .update({
              status: "error",
              error_message: err instanceof Error ? err.message : String(err),
              finished_at: new Date().toISOString(),
            })
            .eq("id", scanRunId);
        });
      }
      throw err;
    }
  }
);
