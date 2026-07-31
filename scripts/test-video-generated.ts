// ============================================================
// Gera UM vídeo do Sprint D ponta a ponta, sem tocar no banco nem no
// Storage: roteiro → b-roll real do Pexels → montagem com legenda
// queimada → mp4 em scripts/out/.
//
// Por que existe: o job `generate-video-post` só roda contra o Supabase
// de produção, e testar a qualidade da saída não pode exigir sujar um
// post real. Aqui é o mesmo caminho de código (mesmas funções), sem
// efeito colateral nenhum.
//
// 💸 Custo: b-roll é Pexels (grátis) e o texto usa o provider passado —
// o padrão é `gemini` (free tier). Sem GEMINI_API_KEY o roteiro cai no
// MOCK automaticamente, e aí o custo é zero absoluto.
//
// Rodar: npx tsx scripts/test-video-generated.ts [nicho] [provider]
//   npx tsx scripts/test-video-generated.ts tecnologia gemini
//   npx tsx scripts/test-video-generated.ts financas mock
// ============================================================
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const niche = process.argv[2] ?? "tecnologia";
const provider = process.argv[3] ?? "gemini";

// "mock" não é um provider de verdade: é a instrução de esconder as keys
// de IA deste processo, que é como video-script.ts decide cair no mock.
if (provider === "mock") {
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.POLLINATIONS_API_KEY;
}

async function main() {
  const { generateVideoScript } = await import("../src/lib/ai/video-script");
  const { buildScriptTimeline, assembleScriptVideo } = await import("../src/lib/video-assembly");
  const { searchStockVideo, fetchStockVideoBuffer } = await import("../src/lib/stock-videos");
  const { brollQueries } = await import("../src/lib/video-brief");

  if (!process.env.PEXELS_API_KEY) {
    console.error("PEXELS_API_KEY ausente no .env.local — o b-roll vem do Pexels.");
    process.exit(1);
  }

  // Notícia de exemplo: o mesmo formato que o job lê de `news_items`.
  const noticia = {
    title: "Anthropic lança modelo que roda tarefas de horas sem supervisão",
    summary:
      "O novo modelo mantém contexto por sessões longas e executa cadeias de ferramentas sem intervenção humana, segundo a empresa.",
    url: "https://exemplo.com/noticia",
    language: "pt-BR",
    niche,
    network: "reels" as const,
  };

  console.log(`\n[1/4] Roteiro (provider=${provider}, nicho=${niche})…`);
  const script = await generateVideoScript(
    noticia,
    provider === "mock" ? "gemini" : (provider as "claude" | "gemini" | "pollinations")
  );
  console.log(`      hook: ${script.hook}`);
  script.beats.forEach((b) => console.log(`      beat ${b.idx} (${b.seconds}s): ${b.text}`));
  console.log(`      cta:  ${script.cta}`);
  console.log(`      total: ${script.totalSeconds}s`);

  const segments = buildScriptTimeline(script);
  const queries = brollQueries(segments.length, niche);
  console.log(`\n[2/4] B-roll: ${segments.length} clipes do Pexels…`);

  const usados = new Set<string>();
  const buffers: Buffer[] = [];
  for (let i = 0; i < segments.length; i++) {
    let clip = await searchStockVideo(queries[i], usados);
    if (!clip) clip = await searchStockVideo(queries[(i + 1) % queries.length], usados);
    if (!clip) throw new Error(`Sem b-roll para "${queries[i]}"`);
    usados.add(clip.id);
    const buf = await fetchStockVideoBuffer(clip);
    buffers.push(buf);
    console.log(
      `      ${i + 1}/${segments.length} "${queries[i]}" → ${clip.id} (${clip.width}x${clip.height}, ${(buf.length / 1e6).toFixed(1)} MB) · ${clip.credit}`
    );
  }

  console.log(`\n[3/4] Montagem (ffmpeg)…`);
  const inicio = Date.now();
  const mp4 = await assembleScriptVideo(script, buffers);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  const outDir = path.resolve(process.cwd(), "scripts/out");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `video-gerado-${niche}-${Date.now()}.mp4`);
  fs.writeFileSync(out, mp4);

  console.log(`\n[4/4] Pronto em ${segundos}s`);
  console.log(`      ${out}`);
  console.log(`      ${(mp4.length / 1e6).toFixed(1)} MB · 1080x1920 · ~${script.totalSeconds}s`);
  console.log(`\n⚠️  Sem marca: a montagem sai sem wordmark/chip de propósito —`);
  console.log(`    no app a marca é aplicada na aprovação (renderVideoPost).\n`);
}

main().catch((err) => {
  console.error("\nFalhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
