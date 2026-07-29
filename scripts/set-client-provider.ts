// ============================================================
// Troca o provider de IA de um cliente (ou de todos que estejam num
// provider específico). Existe por causa do bloqueio da Pollinations:
// ela passou a exigir pollen PAGO pra requests multi-mensagem, que é o
// que o app sempre manda (system+user), então quem ficou lá parou de
// gerar — 402, em silêncio, sem nada quebrado no código.
//
// Ajustes só edita o cliente ATIVO; trocar vários exigiria alternar de
// cliente na interface um por um. Daí este script.
//
// Rodar:
//   npx tsx scripts/set-client-provider.ts --from pollinations --to gemini
//   npx tsx scripts/set-client-provider.ts --client <uuid> --to claude
//   (acrescente --dry pra só listar o que mudaria)
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Carrega .env.local manualmente (mesmo padrão dos outros scripts)
for (const line of fs.readFileSync(
  path.join(__dirname, "..", ".env.local"),
  "utf8"
).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  // Tira aspas ao redor do valor: neste .env.local algumas linhas estão
  // com aspas, e o supabase-js rejeita a URL com elas ("Invalid supabaseUrl").
  if (m && m[2] && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const from = arg("from");
const clientId = arg("client");
const to = arg("to");
const dry = process.argv.includes("--dry");

// Os dois campos andam juntos aqui de propósito: o 402 da Pollinations
// atinge texto E imagem, e deixar um dos dois pra trás recria o bloqueio
// pela metade. Pra trocar só um, use Ajustes.
const TEXT_PROVIDERS = ["claude", "gemini", "pollinations"];
const IMAGE_PROVIDERS = ["fal", "gemini", "pollinations", "stock"];

async function main() {
  if (!to || !TEXT_PROVIDERS.includes(to)) {
    console.error(`--to obrigatório, um de: ${TEXT_PROVIDERS.join(", ")}`);
    process.exit(1);
  }
  if (!from && !clientId) {
    console.error("informe --from <provider> ou --client <uuid>");
    process.exit(1);
  }

  let query = db.from("brand_kits").select("client_id, brand_name, text_provider, image_provider");
  if (clientId) query = query.eq("client_id", clientId);
  else query = query.eq("text_provider", from!);

  const { data: alvos, error } = await query;
  if (error) throw new Error(error.message);
  if (!alvos?.length) {
    console.log("Nenhum cliente bate com o filtro. Nada a fazer.");
    return;
  }

  console.log(`${alvos.length} cliente(s):`);
  for (const c of alvos) {
    console.log(`  ${c.brand_name ?? "(sem nome)"} — ${c.client_id}`);
    console.log(`    texto:  ${c.text_provider} → ${to}`);
    console.log(`    imagem: ${c.image_provider} → ${IMAGE_PROVIDERS.includes(to) ? to : c.image_provider}`);
  }
  if (dry) {
    console.log("\n--dry: nada foi gravado.");
    return;
  }

  const patch: Record<string, string> = { text_provider: to };
  if (IMAGE_PROVIDERS.includes(to)) patch.image_provider = to;

  const { data, error: upErr } = await db
    .from("brand_kits")
    .update(patch)
    .in("client_id", alvos.map((c) => c.client_id))
    .select("client_id, text_provider, image_provider");
  if (upErr) throw new Error(upErr.message);

  console.log(`\n✓ ${data?.length ?? 0} cliente(s) atualizado(s).`);
  for (const c of data ?? []) {
    console.log(`  ${c.client_id}: texto=${c.text_provider} imagem=${c.image_provider}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
