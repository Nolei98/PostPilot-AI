// ============================================================
// Semeia os presets do sistema do Template Studio (Sprint B+, TAREFA B13)
// na tabela `templates` (is_system=true, client_id=null) — renderiza um
// thumbnail de cada um com conteúdo de exemplo e sobe pro Storage.
// Idempotente: apaga os presets do sistema anteriores antes de inserir.
// Rodar: npx tsx scripts/seed-templates.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { BASE_PRESETS } from "../src/lib/template-presets";
import { renderFromSpec } from "../src/lib/template-render";
import { rasterizeSvg } from "../src/lib/svg-render";
import type { CardBrand } from "../src/lib/carousel-render";

for (const line of fs.readFileSync(
  path.join(__dirname, "..", ".env.local"),
  "utf8"
).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Marca + conteúdo de exemplo só pra gerar um thumbnail representativo.
const exampleBrand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7C5CFF",
  colorText: "#FFFFFF",
  fontFamily: "Space Grotesk",
  brandName: "Sua Marca",
  wordmark: "MARCA®",
  handle: "suamarca",
  keywords: ["NOTÍCIAS", "IA"],
  brandMark: "auto",
};

const exampleContent = {
  headline: "Um título forte que prende a atenção",
  body: "Um resumo curto que dá contexto pro leitor em uma frase.",
  cta: "DESLIZE PARA VER →",
};

function slugify(name: string, surface: string): string {
  return `${surface}-${name}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  // Reseed idempotente: apaga os presets do sistema existentes.
  await db.from("templates").delete().eq("is_system", true);

  for (const { name, spec } of BASE_PRESETS) {
    const svg = renderFromSpec(spec, exampleBrand, exampleContent);
    const png = rasterizeSvg(svg);
    const slug = slugify(name, spec.surface);
    const storagePath = `templates/${slug}.png`;

    const { error: uploadError } = await db.storage
      .from("post-images")
      .upload(storagePath, png, { contentType: "image/png", upsert: true });
    if (uploadError) {
      console.error(`Falha ao subir thumbnail de "${name}" (${spec.surface}):`, uploadError);
      process.exit(1);
    }
    const { data: publicUrl } = db.storage.from("post-images").getPublicUrl(storagePath);

    const { error: insertError } = await db.from("templates").insert({
      client_id: null,
      surface: spec.surface,
      name,
      spec,
      thumbnail_url: publicUrl.publicUrl,
      is_system: true,
    });
    if (insertError) {
      console.error(`Falha ao inserir preset "${name}" (${spec.surface}):`, insertError);
      process.exit(1);
    }
    console.log(`✓ ${spec.surface} — ${name}`);
  }

  console.log(`\n${BASE_PRESETS.length} presets semeados.`);
}

main();
