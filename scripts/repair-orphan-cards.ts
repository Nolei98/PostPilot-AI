// ============================================================
// Conserta o estado que quebrava a conversão pra carrossel:
//
//   card 0: duplicate key value violates unique constraint
//   "carousel_cards_post_id_idx_key"
//
// Causa: post que NÃO é carrossel (single/video/video_feed) com linhas
// sobrando em carousel_cards — resto de uma conversão anterior, de uma
// geração que virou post único, ou de um job que morreu no meio. O
// convert-post-format inseria os cards novos sem limpar e batia na
// unique (post_id, idx).
//
// O job já foi corrigido (passo "clear-old-cards", 29/07), então isso
// não nasce mais. Este script é pra limpar o que JÁ está no banco, e
// serve de diagnóstico: lista quantos posts estão nesse estado.
//
// Rodar:
//   npx tsx scripts/repair-orphan-cards.ts            (só lista)
//   npx tsx scripts/repair-orphan-cards.ts --clean    (apaga os órfãos)
//   npx tsx scripts/repair-orphan-cards.ts --discard 28
//     (manda o post #0028 pra 'discarded' — o "excluir" do app, que
//      preserva histórico em vez de apagar a linha)
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const clean = process.argv.includes("--clean");
const discardIdx = process.argv.indexOf("--discard");
const discardRef = discardIdx >= 0 ? Number(process.argv[discardIdx + 1]) : null;

async function main() {
  // 1. Descarte pontual, quando pedido.
  if (discardRef != null && Number.isFinite(discardRef)) {
    const { data: post } = await db
      .from("posts")
      .select("id, ref, hook, status, format")
      .eq("ref", discardRef)
      .maybeSingle();
    if (!post) {
      console.log(`Post #${String(discardRef).padStart(4, "0")} não encontrado.`);
    } else {
      console.log(`#${String(post.ref).padStart(4, "0")} — ${post.hook}`);
      console.log(`  status ${post.status} · formato ${post.format}`);
      // Os cards vão junto: post descartado com cards órfãos é justamente
      // a semente do bug da unique se ele voltar pra fila algum dia.
      const { error: cardsErr } = await db
        .from("carousel_cards")
        .delete()
        .eq("post_id", post.id);
      if (cardsErr) throw new Error(cardsErr.message);
      const { error } = await db
        .from("posts")
        .update({ status: "discarded" })
        .eq("id", post.id);
      if (error) throw new Error(error.message);
      console.log("  → descartado, e os cards dele apagados.");
    }
  }

  // 2. Varredura: post que não é carrossel mas tem cards.
  const { data: cards, error } = await db
    .from("carousel_cards")
    .select("id, post_id, idx, posts!inner(ref, format, status)")
    .neq("posts.format", "carousel");
  if (error) throw new Error(error.message);

  if (!cards?.length) {
    console.log("\nNenhum card órfão. Nada a consertar.");
    return;
  }

  const porPost = new Map<string, { ref: number; format: string; status: string; ids: string[] }>();
  for (const c of cards) {
    const p = c.posts as unknown as { ref: number; format: string; status: string };
    const atual = porPost.get(c.post_id as string) ?? {
      ref: p.ref,
      format: p.format,
      status: p.status,
      ids: [],
    };
    atual.ids.push(c.id as string);
    porPost.set(c.post_id as string, atual);
  }

  console.log(`\n${porPost.size} post(s) fora do formato carrossel com cards sobrando:`);
  for (const [postId, info] of porPost) {
    console.log(
      `  #${String(info.ref).padStart(4, "0")} — ${info.format} / ${info.status} — ${info.ids.length} card(s)  [${postId}]`
    );
  }

  if (!clean) {
    console.log("\nSem --clean: nada foi apagado. Estes são os que quebrariam a conversão.");
    return;
  }

  const ids = [...porPost.values()].flatMap((i) => i.ids);
  const { error: delErr } = await db.from("carousel_cards").delete().in("id", ids);
  if (delErr) throw new Error(delErr.message);
  console.log(`\n✓ ${ids.length} card(s) órfão(s) apagado(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
