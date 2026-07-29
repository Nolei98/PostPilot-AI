// ============================================================
// Job: converte um post da fila entre POST ÚNICO e CARROSSEL.
//
// A fila é onde o cliente decide o que fazer com o conteúdo que chegou —
// e a decisão de formato, hoje, é tomada antes dele ver qualquer coisa
// (default_format do Brand Kit, em scan-news). Aqui ele muda de ideia sem
// perder o post nem esperar uma nova varredura.
//
// Barato de propósito, porque roda no modelo render-on-approval
// (migration 040): nada foi renderizado ainda. Único→carrossel gasta UMA
// chamada de texto (a estrutura dos cards); carrossel→único não gasta
// nenhuma — reaproveita a capa como imagem base.
//
// Roda em background porque a chamada de IA e o download da imagem base
// passam do orçamento de um Server Action.
// ============================================================
import { inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "post-images";

export const convertPostFormat = inngest.createFunction(
  { id: "convert-post-format", retries: 1, concurrency: { limit: 3 } },
  { event: "post/convert-format.requested" },
  async ({ event, step }) => {
    const { postId, target, videoOn } = event.data as {
      postId: string;
      target: "single" | "carousel";
      videoOn?: "cover" | "interior";
    };
    const supabase = createAdminClient();

    const post = await step.run("fetch-post", async () => {
      const { data } = await supabase
        .from("posts")
        .select(
          "id, client_id, news_item_id, format, hook, caption, hashtags, base_image_url, status, video_status, video_poster_url"
        )
        .eq("id", postId)
        .maybeSingle();
      return data;
    });
    /** Devolve o post pro estado normal da fila, com ou sem sucesso. */
    async function finish(patch: Record<string, unknown>) {
      await supabase.from("posts").update({ ...patch, convert_status: "idle" }).eq("id", postId);
    }

    /**
     * Desiste, mas DESTRAVA o post. Os três casos abaixo saíam com um
     * `return` seco, deixando `convert_status='pending'` gravado pelo
     * Server Action — e a fila trava os controles enquanto está pending.
     * Resultado: post que "não converteu" ficava com os botões desligados
     * pra sempre, sem erro em lugar nenhum (visto em 29/07).
     */
    async function skip(motivo: string) {
      await finish({});
      return { skipped: motivo };
    }

    if (!post) {
      // Sem linha não há o que destravar — nem `finish` funcionaria.
      return { skipped: "post não encontrado" };
    }
    if (post.status !== "pending_approval") return await skip("post não está mais na fila");
    if (post.format === target) return await skip("já está nesse formato");

    try {
      if (target === "carousel") {
        const prefs = await step.run("fetch-brand", async () => {
          const { data } = await supabase
            .from("brand_kits")
            .select("text_provider, language, niche")
            .eq("client_id", post.client_id)
            .maybeSingle();
          return {
            textProvider: (data?.text_provider ?? "claude") as "claude" | "gemini" | "pollinations",
            language: (data?.language ?? "pt-BR") as string,
            niche: (data?.niche ?? null) as string | null,
          };
        });

        const news = await step.run("fetch-news", async () => {
          const { data } = await supabase
            .from("news_items")
            .select("title, summary, url, image_url")
            .eq("id", post.news_item_id)
            .maybeSingle();
          return data;
        });

        // Mesma função que o generate-carousel usa — o carrossel convertido
        // sai idêntico a um gerado do zero, não uma versão pobre dele.
        const pkg = await step.run("generate-structure", async () => {
          const { generateCarouselPackage } = await import("@/lib/ai/carousel");
          return generateCarouselPackage(
            {
              title: news?.title ?? post.hook ?? "",
              summary: news?.summary ?? post.caption ?? "",
              url: news?.url ?? "",
              language: prefs.language,
              niche: prefs.niche,
            },
            prefs.textProvider
          );
        });

        await step.run("insert-cards", async () => {
          const { buildLuminanceGrid } = await import("@/lib/contrast");
          const { getCardBg } = await import("@/lib/card-bg");
          const lastIdx = pkg.cards.length - 1;
          const exclude = new Set<string>();

          for (const card of pkg.cards) {
            const isCover = card.idx === 0;
            // A capa herda a imagem BASE que o post único já tinha — o
            // cliente aprovou aquela foto visualmente, trocá-la na
            // conversão seria uma surpresa.
            let bgUrl = isCover ? post.base_image_url ?? null : null;
            if (!bgUrl) {
              const bg = await getCardBg({
                newsImageUrl: isCover ? news?.image_url ?? null : null,
                niche: prefs.niche,
                headline: card.headline,
                excludeIds: exclude,
                allowGen: isCover || card.idx === lastIdx,
              });
              bgUrl = bg?.url ?? null;
            }

            let bgLuminance: unknown = null;
            if (bgUrl) {
              try {
                const r = await fetch(bgUrl);
                if (r.ok) bgLuminance = await buildLuminanceGrid(Buffer.from(await r.arrayBuffer()));
              } catch (err) {
                console.warn(`[convert-post-format] luminância do card ${card.idx}:`, err);
              }
            }

            const { error } = await supabase.from("carousel_cards").insert({
              post_id: postId,
              idx: card.idx,
              role: card.role,
              headline: card.headline,
              body: card.body,
              image_url: null,
              bg_url: bgUrl,
              bg_luminance: bgLuminance,
            });
            if (error) throw new Error(`card ${card.idx}: ${error.message}`);
          }
          return { cards: pkg.cards.length };
        });

        // Post de VÍDEO virando carrossel: o vídeo não se perde, vira o
        // vídeo de UM card. Capa ou miolo é escolha do cliente — na capa
        // ele puxa o dedo pra parar, no miolo ele explica um ponto.
        const videoMovido = await step.run("move-video-to-card", async () => {
          if (post.video_status !== "ready") return { moved: false as const };
          const alvoIdx = videoOn === "interior" && pkg.cards.length > 2 ? 1 : 0;

          const { data: file, error: dlErr } = await supabase.storage
            .from(BUCKET)
            .download(`${postId}-video-source.mp4`);
          if (dlErr || !file) {
            console.warn(`[convert-post-format] vídeo fonte do post ${postId} não encontrado`);
            return { moved: false as const };
          }
          const buf = Buffer.from(await file.arrayBuffer());
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(`${postId}-card-${alvoIdx}-video-source.mp4`, buf, {
              contentType: "video/mp4",
              upsert: true,
            });
          if (upErr) throw new Error(`vídeo do card: ${upErr.message}`);

          await supabase
            .from("carousel_cards")
            .update({
              video_poster_url: post.video_poster_url,
              video_status: "ready",
              video_error: null,
              // Card com vídeo tem fundo sólido da marca — a moldura 16:9
              // é que mostra o vídeo (ver post-render).
              bg_url: null,
              bg_luminance: null,
            })
            .eq("post_id", postId)
            .eq("idx", alvoIdx);
          return { moved: true as const, idx: alvoIdx };
        });

        await step.run("switch-format", () =>
          finish({
            format: "carousel",
            hook: pkg.cards[0].headline,
            // O vídeo agora pertence a um card, não ao post: deixar os
            // campos preenchidos faria a tela de Prontos tratar o
            // carrossel como post de vídeo.
            ...(videoMovido.moved
              ? {
                  video_url: null,
                  video_poster_url: null,
                  video_status: "none",
                  video_shape: null,
                }
              : {}),
            // A contra-capa é peça do post único; no carrossel o último
            // card já cumpre esse papel.
            template_applied: false,
            closing_image_url: null,
          })
        );
        return {
          converted: postId,
          to: "carousel",
          cards: pkg.cards.length,
          videoNoCard: videoMovido.moved ? videoMovido.idx : null,
        };
      }

      // ---- carrossel → post único ----
      // Sem IA: o texto que importa (hook/caption) já existe, e a capa vira
      // a imagem base. Só precisa mudar de casa no Storage, porque
      // renderSinglePost lê `{postId}-base.jpg`.
      const cover = await step.run("fetch-cover", async () => {
        const { data } = await supabase
          .from("carousel_cards")
          .select("headline, bg_url")
          .eq("post_id", postId)
          .order("idx")
          .limit(1)
          .maybeSingle();
        return data;
      });

      const base = await step.run("promote-cover-to-base", async () => {
        const url = post.base_image_url ?? cover?.bg_url ?? null;
        if (!url) return { baseUrl: null as string | null, grid: null as unknown };
        const r = await fetch(url);
        if (!r.ok) throw new Error(`imagem da capa não pôde ser baixada (HTTP ${r.status})`);
        const buf = Buffer.from(await r.arrayBuffer());

        const { buildLuminanceGrid } = await import("@/lib/contrast");
        const sharp = (await import("sharp")).default;
        // Normaliza pro quadro do post único (4:5) — o card já é 4:5, mas
        // uma capa herdada de outra origem pode não ser.
        const jpeg = await sharp(buf).resize(1080, 1350, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(`${postId}-base.jpg`, jpeg, { contentType: "image/jpeg", upsert: true });
        if (error) throw new Error(`upload da base: ${error.message}`);
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${postId}-base.jpg`);
        return {
          baseUrl: `${data.publicUrl}?v=${Date.now()}`,
          grid: await buildLuminanceGrid(jpeg),
        };
      });

      await step.run("drop-cards", async () => {
        // Os cards não sobrevivem à conversão: manter linhas órfãs faria o
        // preview e a publicação divergirem (uma lê format, a outra conta
        // cards).
        await supabase.from("carousel_cards").delete().eq("post_id", postId);
      });

      await step.run("switch-format", () =>
        finish({
          format: "single",
          hook: post.hook || cover?.headline || "",
          image_url: null,
          base_image_url: base.baseUrl,
          base_luminance: base.grid,
        })
      );
      return { converted: postId, to: "single" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[convert-post-format] falha no post ${postId}:`, err);
      await finish({ convert_error: message });
      return { failed: postId, error: message };
    }
  }
);
