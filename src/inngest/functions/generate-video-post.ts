// ============================================================
// Job: transforma um post que já está na fila num post de VÍDEO gerado
// (Sprint D — liga D1 e D2, que até aqui eram módulos soltos).
//
// Fluxo: roteiro (video-script.ts) → b-roll do Pexels (stock-videos.ts) →
// montagem com legenda queimada (video-assembly.ts) → o mp4 é gravado
// EXATAMENTE onde o upload manual grava (`{postId}-video-source.mp4`) e o
// job dispara `post/attach-video.requested`.
//
// Por que entregar como FONTE em vez de vídeo final: a montagem do D2 sai
// sem marca nenhuma (sem wordmark, sem chip, sem título) — era escopo
// declarado da v1. O caminho do upload já resolve isso na aprovação
// (render-approved-post → renderVideoPost), e duplicar a marcação aqui
// seria manter dois códigos de marca em paralelo, que é como a arte do
// post e a do carrossel divergiram antes.
//
// Custo: b-roll é Pexels (grátis, mesma PEXELS_API_KEY das fotos) e o
// roteiro roda no provider de texto do cliente — em mock, $0. Nada aqui
// chama provider pago.
//
// DISPARO MANUAL de propósito (botão na fila). Não entra no cron: a
// montagem baixa um clipe por segmento (4-6 por vídeo) e o Pexels limita
// 200 requisições/hora no free — automatizar isso antes de ver a
// qualidade do resultado torraria a cota sem ninguém olhando.
//
// O step pesado NUNCA deixa exceção escapar (mesmo desenho do
// attach-video): retorna {ok:false,error} pra o step final sempre gravar
// o estado no post — senão o vídeo fica "processando" pra sempre, que foi
// o modo de falha que custou dias em julho.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVideoScript, type VideoScript } from "@/lib/ai/video-script";
import type { NewsItem } from "@/lib/types";

export const generateVideoPost = inngest.createFunction(
  {
    id: "generate-video-post",
    retries: 1,
    // Montagem é ffmpeg puro: dois vídeos ao mesmo tempo já saturam a
    // função. Mesmo teto do attach-video, pelo mesmo motivo.
    concurrency: { limit: 2 },
    // Rede de segurança pra QUALQUER step que estoure depois das
    // tentativas — o `try/catch` do assemble cobre a montagem, mas não
    // cobria a geração do roteiro. E é justamente ela que falha por algo
    // fora do nosso controle: a cota diária do provider de texto (o free
    // tier do Gemini são 20 requisições por DIA, e um 429 chega sem
    // aviso). Sem isto, o post ficava 'processing' pra sempre — o modo de
    // falha que este arquivo inteiro foi escrito pra não repetir.
    onFailure: async ({ event }) => {
      const { postId } = (event.data.event.data ?? {}) as { postId?: string };
      if (!postId) return;
      const motivo = event.data.error?.message ?? "Falha desconhecida na geração do vídeo";
      console.error(`[generate-video-post] desistiu do post ${postId}:`, motivo);
      await createAdminClient()
        .from("posts")
        .update({ video_status: "error", video_error: motivo })
        .eq("id", postId);
    },
  },
  { event: "post/generate-video.requested" },
  async ({ event, step }) => {
    const { postId, userId, network } = event.data;
    const supabase = createAdminClient();

    const ctx = await step.run("fetch-context", async () => {
      const { data: post, error } = await supabase
        .from("posts")
        .select("id, user_id, client_id, news_item_id, status, format")
        .eq("id", postId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !post) throw new Error("Post não encontrado");
      // Só post ainda na fila: gerar vídeo pra post aprovado sobrescreveria
      // uma arte que a pessoa já validou.
      if (post.status !== "pending_approval") {
        return { skip: `Post não está na fila (status=${post.status})` as string };
      }

      const { data: news } = await supabase
        .from("news_items")
        .select("*")
        .eq("id", post.news_item_id)
        .single();

      const { data: brand } = await supabase
        .from("brand_kits")
        .select("post_language, niche, text_provider")
        .eq("client_id", post.client_id)
        .maybeSingle();

      const textProvider: "claude" | "gemini" | "pollinations" =
        brand?.text_provider === "claude" || brand?.text_provider === "pollinations"
          ? brand.text_provider
          : "gemini";

      return {
        news: news as NewsItem,
        language: (brand?.post_language as string | undefined) ?? "pt-BR",
        niche: (brand?.niche as string | null | undefined) ?? null,
        textProvider,
      };
    });

    if ("skip" in ctx) return { skipped: true, reason: ctx.skip };

    // Marca 'processing' ANTES do trabalho pesado: a fila mostra o estado
    // e o efeito de refresh do PostCard passa a acompanhar sozinho.
    await step.run("mark-processing", async () => {
      await supabase
        .from("posts")
        .update({ video_status: "processing", video_error: null, video_origin: "generated" })
        .eq("id", postId);
    });

    const script = await step.run("generate-script", async () => {
      const s = await generateVideoScript(
        {
          title: ctx.news.title,
          summary: ctx.news.summary,
          url: ctx.news.url,
          language: ctx.language,
          niche: ctx.niche,
          network: network ?? "reels",
        },
        ctx.textProvider
      );
      // Persistido JÁ AQUI, antes da montagem: se o ffmpeg falhar, o
      // roteiro (que custou IA) sobrevive e a nova tentativa não paga de
      // novo por ele.
      await supabase.from("posts").update({ video_script: s }).eq("id", postId);
      return s;
    });

    const montagem = await step.run("assemble-video", async () => {
      try {
        const { buildScriptTimeline, assembleScriptVideo } = await import("@/lib/video-assembly");
        const { searchStockVideo, fetchStockVideoBuffer } = await import("@/lib/stock-videos");
        const { brollQueries } = await import("@/lib/video-brief");

        const segments = buildScriptTimeline(script as VideoScript);
        const queries = brollQueries(segments.length, ctx.niche);

        // Um clipe por segmento, sem repetir: `excludeIds` acumula o que já
        // entrou. Se um tema não devolve nada, o próximo segmento tenta o
        // seguinte da lista — mas se FALTAR clipe pra algum segmento a
        // montagem não roda, porque assembleScriptVideo exige 1:1.
        const usados = new Set<string>();
        const creditos: string[] = [];
        const buffers: Buffer[] = [];
        for (let i = 0; i < segments.length; i++) {
          let clip = await searchStockVideo(queries[i], usados);
          // Segunda tentativa com outro tema da lista — clipe repetido é
          // pior que clipe fora de tema, e sem clipe não há vídeo nenhum.
          if (!clip) clip = await searchStockVideo(queries[(i + 1) % queries.length], usados);
          if (!clip) {
            throw new Error(
              process.env.PEXELS_API_KEY
                ? `Sem b-roll disponível para "${queries[i]}" — tente de novo em alguns minutos.`
                : "PEXELS_API_KEY não configurada: o b-roll do vídeo vem do Pexels."
            );
          }
          usados.add(clip.id);
          creditos.push(clip.credit);
          buffers.push(await fetchStockVideoBuffer(clip));
        }

        const mp4 = await assembleScriptVideo(script as VideoScript, buffers);

        // MESMO caminho do upload manual: daqui pra frente o post é
        // indistinguível de um vídeo enviado pela pessoa, e todo o
        // pipeline existente (pôster, prévia, aprovação, marca) vale.
        const { error: upErr } = await supabase.storage
          .from("post-images")
          .upload(`${postId}-video-source.mp4`, mp4, {
            contentType: "video/mp4",
            upsert: true,
          });
        if (upErr) throw new Error(`Erro ao subir o vídeo montado: ${upErr.message}`);

        return { ok: true as const, segments: segments.length, creditos };
      } catch (err) {
        console.error(`[generate-video-post] falha ao montar o post ${postId}:`, err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    });

    if (!montagem.ok) {
      await step.run("mark-error", async () => {
        await supabase
          .from("posts")
          .update({ video_status: "error", video_error: montagem.error })
          .eq("id", postId);
      });
      return { postId, ok: false, error: montagem.error };
    }

    // O attach-video assume: extrai o pôster, mede a luminância e deixa o
    // post pronto pra prévia. `video_status` continua 'processing' até lá —
    // é o mesmo job que o upload usa, e ele grava o estado final.
    await step.sendEvent("dispatch-attach", {
      name: "post/attach-video.requested",
      data: { postId, userId, shape: "reels" },
    });

    return { postId, ok: true, segments: montagem.segments };
  }
);
