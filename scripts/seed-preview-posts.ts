// ============================================================
// Semeia posts de TESTE na fila, já no modelo render-on-approval
// (migration 040): grava só a imagem BASE e a luminância dela — nenhuma
// arte. Quem desenha é o preview ao vivo da Fila, que é justamente o que
// este seed existe pra exercitar.
//
// Cobre os quatro formatos com fundo BRANCO (pior caso de contraste: o
// preview tem que escolher tema escuro e véu claro sozinho) e um post
// único de uma página só (sem contra-capa).
//
// Rodar: npx tsx scripts/seed-preview-posts.ts [clientId]
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { buildLuminanceGrid } from "../src/lib/contrast";

for (const line of fs
  .readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
  .split(/\r?\n/)) {
  // O .env.local vem do `vercel env pull`, que grava os valores ENTRE
  // ASPAS — sem tirá-las, a URL do Supabase chega inválida no client.
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && m[2] && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET = "post-images";
const CLIENT_ID = process.argv[2] ?? "9618ce4a-0b07-4ad5-b1e4-218238ead7aa";

/** Fundo branco no quadro do post (4:5). Levemente texturizado pra dar
 * pra ver a borda do card no preview. */
async function whiteFrame(w = 1080, h = 1350): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: "#FFFFFF" },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function upload(p: string, body: Buffer, contentType: string): Promise<string> {
  const { error } = await db.storage.from(BUCKET).upload(p, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${p}: ${error.message}`);
  return `${db.storage.from(BUCKET).getPublicUrl(p).data.publicUrl}?v=${Date.now()}`;
}

/**
 * Vídeo de teste de 6s que COMEÇA ESCURO e TERMINA BRANCO.
 *
 * De propósito: a medição de contraste só enxerga o frame de pôster
 * (0,5s). Um vídeo que clareia no meio é exatamente o caso que fazia o
 * texto branco sumir — com o piso de véu (VIDEO_SCRIM_FLOOR) o título
 * tem que continuar legível do começo ao fim.
 */
function fadeToWhiteVideo(w: number, h: number): Buffer {
  const ffmpeg = require("ffmpeg-static") as string;
  const out = path.join(os.tmpdir(), `seed-${w}x${h}-${Date.now()}.mp4`);
  execFileSync(ffmpeg, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x101014:s=${w}x${h}:d=6:r=24`,
    "-vf", "fade=t=out:st=2:d=3:c=white",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    out,
  ]);
  const buf = fs.readFileSync(out);
  fs.unlinkSync(out);
  return buf;
}

/** Frame representativo do vídeo acima (o trecho ESCURO, como o pôster
 * de 0,5s que o attach-video extrai de verdade). */
async function darkFrame(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#101014" } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

interface NewPost {
  format: "single" | "carousel" | "video" | "video_feed";
  hook: string;
  caption: string;
  templateApplied?: boolean;
  videoShape?: "reels" | "feed";
}

/** Marca que identifica tudo que este seed criou (limpeza + idempotência). */
const SEED_MARK = "fundo branco liso (seed de teste)";

/**
 * `posts.news_item_id` é NOT NULL e existe um índice único por
 * (client_id, news_item_id) — um post por notícia. Logo cada post do
 * seed precisa da PRÓPRIA notícia sintética.
 */
async function seedNewsItem(label: string): Promise<string> {
  const { data: source, error: srcErr } = await db
    .from("source_configs")
    .select("id")
    .eq("client_id", CLIENT_ID)
    .limit(1)
    .maybeSingle();
  if (srcErr || !source) throw new Error("nenhuma fonte cadastrada pro cliente");

  const { data, error } = await db
    .from("news_items")
    .insert({
      source_id: source.id,
      client_id: CLIENT_ID,
      url: `https://exemplo.postpilot.local/seed-preview-${label}-${Date.now()}`,
      title: `Notícia sintética — seed de preview (${label})`,
      summary: "Item criado por scripts/seed-preview-posts.ts só pra dar origem aos posts de teste.",
      published_at: new Date().toISOString(),
      viral_score: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(`news_item: ${error.message}`);
  return data.id as string;
}

async function insertPost(userId: string, p: NewPost): Promise<string> {
  const { data, error } = await db
    .from("posts")
    .insert({
      user_id: userId,
      client_id: CLIENT_ID,
      news_item_id: await seedNewsItem(p.format),
      hook: p.hook,
      caption: p.caption,
      hashtags: "#teste #postpilot #preview",
      image_prompt: SEED_MARK,
      format: p.format,
      status: "pending_approval",
      render_status: "none",
      template_applied: p.templateApplied ?? false,
      ...(p.videoShape ? { video_shape: p.videoShape } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert ${p.format}: ${error.message}`);
  return data.id as string;
}

async function main() {
  const { data: client, error: clientErr } = await db
    .from("clients")
    .select("id, name, owner_user_id")
    .eq("id", CLIENT_ID)
    .single();
  if (clientErr || !client) throw new Error(`cliente ${CLIENT_ID} não encontrado`);
  const userId = client.owner_user_id as string;
  console.log(`Cliente: ${client.name} (${CLIENT_ID})`);

  // Rodar de novo não empilha: apaga o que o seed anterior criou.
  const { data: velhos } = await db
    .from("posts")
    .select("id")
    .eq("client_id", CLIENT_ID)
    .eq("image_prompt", SEED_MARK);
  if (velhos && velhos.length > 0) {
    await db.from("posts").delete().in("id", velhos.map((p) => p.id));
    console.log(`Removidos ${velhos.length} posts do seed anterior.`);
  }

  const white = await whiteFrame();
  const grid = await buildLuminanceGrid(white);
  const criados: string[] = [];

  // --- 1. Post único de UMA página (sem contra-capa) ---
  const singleId = await insertPost(userId, {
    format: "single",
    hook: "Uma página só: o teste do preview ao vivo",
    caption: "Post único de uma página, fundo branco. Sem contra-capa.",
    templateApplied: false,
  });
  const singleBase = await upload(`${singleId}-base.jpg`, white, "image/jpeg");
  await db
    .from("posts")
    .update({ base_image_url: singleBase, base_luminance: grid })
    .eq("id", singleId);
  criados.push(`single (1 página)  ${singleId}`);

  // --- 2. Carrossel (capa + 2 interiores + fechamento), todos brancos ---
  const carouselId = await insertPost(userId, {
    format: "carousel",
    hook: "Carrossel de teste em fundo branco",
    caption: "Quatro cards brancos pra conferir contraste e chip no preview.",
    templateApplied: false,
  });
  const carouselBase = await upload(`${carouselId}-base.jpg`, white, "image/jpeg");
  await db
    .from("posts")
    .update({ base_image_url: carouselBase, base_luminance: grid })
    .eq("id", carouselId);

  const cards = [
    { idx: 0, role: "hook", headline: "Carrossel de teste em fundo branco", body: "" },
    { idx: 1, role: "value", headline: "Página interior número um", body: "Corpo de apoio pra ver o auto-fit do título e o texto abaixo dele." },
    { idx: 2, role: "value", headline: "Página interior número dois", body: "Outro corpo, mais curto." },
    { idx: 3, role: "cta", headline: "Fechamento do carrossel", body: "Chip de perfil e ícones aparecem aqui." },
  ];
  for (const c of cards) {
    const bgUrl = await upload(`${carouselId}-card-${c.idx}-bg.jpg`, white, "image/jpeg");
    const { error } = await db.from("carousel_cards").insert({
      post_id: carouselId,
      idx: c.idx,
      role: c.role,
      headline: c.headline,
      body: c.body,
      bg_url: bgUrl,
      bg_luminance: grid,
    });
    if (error) throw new Error(`card ${c.idx}: ${error.message}`);
  }
  // Vídeo em UM card interior (idx 1): testa se a moldura 16:9 aparece só
  // nele e se os vizinhos continuam cards normais — era o bug de
  // "aplicou em todos os interiores".
  const cardVideo = fadeToWhiteVideo(1080, 1080);
  await upload(`${carouselId}-card-1-video-source.mp4`, cardVideo, "video/mp4");
  const cardPoster = await darkFrame(1080, 1080);
  const cardPosterUrl = await upload(
    `${carouselId}-card-1-video-poster-raw.jpg`,
    cardPoster,
    "image/jpeg"
  );
  await db
    .from("carousel_cards")
    // bg_url fica NULO de propósito: card com vídeo tem fundo sólido da
    // marca, o vídeo mora na moldura.
    .update({ video_poster_url: cardPosterUrl, video_status: "ready", video_error: null })
    .eq("post_id", carouselId)
    .eq("idx", 1);
  criados.push(`carousel (4 cards, vídeo no card 2) ${carouselId}`);

  // --- 3. Reels (9:16) e 4. vídeo feed (4:5), vídeo branco de 3s ---
  for (const [format, shape, w, h] of [
    ["video", "reels", 1080, 1920],
    // O vídeo do feed entra numa moldura 16:9 — o material bruto é
    // horizontal, como um clipe de celular deitado.
    ["video_feed", "feed", 1920, 1080],
  ] as const) {
    const id = await insertPost(userId, {
      format,
      hook:
        format === "video"
          ? "Reels: o vídeo clareia e o texto tem que continuar legível"
          : "Vídeo feed 4:5 na moldura, título abaixo",
      caption: "Clipe de 6s que começa escuro e termina branco — teste do véu de legibilidade.",
      videoShape: shape,
    });
    const video = fadeToWhiteVideo(w, h);
    await upload(`${id}-video-source.mp4`, video, "video/mp4");
    const poster = await darkFrame(w, h);
    const posterUrl = await upload(`${id}-video-poster-raw.jpg`, poster, "image/jpeg");
    const posterGrid = await buildLuminanceGrid(poster);
    await db
      .from("posts")
      .update({
        // base_* só no Reels: lá o vídeo É o fundo do quadro. No feed 4:5
        // o fundo é sólido e o vídeo fica na moldura — gravar a base aqui
        // faria a prévia cobrir o card inteiro com o pôster.
        ...(shape === "reels" ? { base_image_url: posterUrl, base_luminance: posterGrid } : {}),
        video_poster_url: posterUrl,
        video_status: "ready",
        video_error: null,
      })
      .eq("id", id);
    criados.push(`${format.padEnd(10)} (${shape})  ${id}`);
  }

  console.log("\nPosts criados na fila:");
  for (const l of criados) console.log(`  ${l}`);
  console.log("\nAbra /fila pra ver o preview ao vivo. Nenhuma arte foi gravada.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
