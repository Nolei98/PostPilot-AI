// ============================================================
// Liga/pausa a criação automática de posts (migration 047) em VÁRIOS
// clientes de uma vez.
//
// Ajustes tem o controle, mas edita só o cliente ATIVO: pausar a conta
// inteira exigiria alternar de cliente na interface um por um, e é fácil
// esquecer um no meio — foi o que aconteceu em 29/07, quando só o
// cliente ativo ficou pausado e os outros seguiram gerando no cron.
//
// Rodar:
//   npx tsx scripts/set-auto-generate.ts --off --all
//   npx tsx scripts/set-auto-generate.ts --on --client <uuid>
//   (acrescente --dry pra só listar o que mudaria)
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// Carrega .env.local manualmente (mesmo padrão dos outros scripts).
// Tira aspas ao redor do valor: algumas linhas deste .env.local estão
// com aspas, e o supabase-js rejeita a URL com elas.
for (const line of fs.readFileSync(
  path.join(__dirname, "..", ".env.local"),
  "utf8"
).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
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

const ligar = process.argv.includes("--on");
const pausar = process.argv.includes("--off");
const todos = process.argv.includes("--all");
const clientId = arg("client");
const dry = process.argv.includes("--dry");

async function main() {
  if (ligar === pausar) {
    console.error("informe --on OU --off (um dos dois).");
    process.exit(1);
  }
  if (!todos && !clientId) {
    console.error("informe --all ou --client <uuid>.");
    process.exit(1);
  }

  const alvo = ligar; // true = gerando, false = pausado

  let query = db.from("brand_kits").select("client_id, brand_name, auto_generate");
  if (clientId) query = query.eq("client_id", clientId);

  const { data: kits, error } = await query;
  if (error) throw new Error(error.message);
  if (!kits?.length) {
    console.log("Nenhum cliente bate com o filtro. Nada a fazer.");
    return;
  }

  const mudam = kits.filter((k) => k.auto_generate !== alvo);
  console.log(`${kits.length} cliente(s); ${mudam.length} mudam:`);
  for (const k of kits) {
    const marca = k.auto_generate !== alvo ? "→" : " ";
    console.log(
      `  ${marca} ${k.brand_name ?? "(sem nome)"} — ${k.auto_generate ? "gerando" : "pausado"}` +
        (k.auto_generate !== alvo ? ` → ${alvo ? "gerando" : "pausado"}` : " (já está assim)")
    );
  }
  if (dry) {
    console.log("\n--dry: nada foi gravado.");
    return;
  }
  if (mudam.length === 0) {
    console.log("\nNada a fazer.");
    return;
  }

  const { data, error: upErr } = await db
    .from("brand_kits")
    .update({ auto_generate: alvo })
    .in("client_id", mudam.map((k) => k.client_id))
    .select("client_id, brand_name, auto_generate");
  if (upErr) throw new Error(upErr.message);

  console.log(`\n✓ ${data?.length ?? 0} cliente(s) atualizado(s).`);
  for (const k of data ?? []) {
    console.log(`  ${k.brand_name ?? k.client_id}: ${k.auto_generate ? "gerando" : "pausado"}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
