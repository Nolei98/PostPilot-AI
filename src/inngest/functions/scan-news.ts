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
  async ({ step }) => {
    const supabase = createAdminClient();

    // 1. Busca todas as fontes ativas (de todos os usuários)
    const sources = await step.run("fetch-sources", async () => {
      const { data, error } = await supabase
        .from("source_configs")
        .select("*")
        .eq("enabled", true);
      if (error) throw new Error(`Erro ao buscar fontes: ${error.message}`);
      return (data ?? []) as SourceConfig[];
    });

    if (sources.length === 0) {
      return { message: "Nenhuma fonte ativa configurada." };
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

    // 3. Triagem: pega tudo que está 'new' e classifica em lotes
    const pending = await step.run("fetch-pending", async () => {
      const { data, error } = await supabase
        .from("news_items")
        .select("id, title, summary, source_id")
        .eq("status", "new")
        .limit(100);
      if (error) throw new Error(`Erro ao buscar pendentes: ${error.message}`);
      return data ?? [];
    });

    let candidates = 0;
    for (let i = 0; i < pending.length; i += TRIAGE_BATCH_SIZE) {
      const batch = pending.slice(i, i + TRIAGE_BATCH_SIZE);

      const scored = await step.run(`triage-batch-${i}`, async () => {
        const inputs: TriageInput[] = batch.map((n) => ({
          id: n.id,
          title: n.title,
          summary: n.summary,
        }));
        return triageNews(inputs);
      });

      // 4. Grava scores e decide candidato vs descarte por fonte
      const newCandidates = await step.run(`save-scores-${i}`, async () => {
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

      // 5. Cada candidata dispara a geração de post (job separado)
      if (newCandidates.length > 0) {
        // Descobre o dono da fonte para associar o post ao usuário
        const sourceOwner = new Map(sources.map((s) => [s.id, s.user_id]));
        await step.sendEvent(
          `dispatch-generate-${i}`,
          newCandidates.map((c) => ({
            name: "post/generate.requested" as const,
            data: {
              newsItemId: c.newsItemId,
              userId: sourceOwner.get(c.sourceId)!,
            },
          }))
        );
        candidates += newCandidates.length;
      }
    }

    return {
      sources: sources.length,
      inserted: totalInserted,
      triaged: pending.length,
      candidates,
    };
  }
);
