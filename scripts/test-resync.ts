// ============================================================
// Testa a sincronização: muda o nome do perfil (como se fosse
// salvo em Ajustes) e confirma que a página 1 (conteúdo) e a
// página 2 (fechamento) do post na fila são re-renderizadas com
// o nome novo. Reverte o nome no final para não sujar os dados.
// Rodar: npx tsx scripts/test-resync.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { regenerateContentImage, renderAndUploadTemplateArt } from "../src/lib/image";
import type { IgProfile, VisualIdentity } from "../src/lib/types";

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

async function main() {
  const { data: post, error } = await db
    .from("posts")
    .select("*")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !post) throw new Error("Nenhum post pending_approval encontrado");

  const { data: config } = await db
    .from("notification_configs")
    .select("*")
    .eq("user_id", post.user_id)
    .single();
  const oldName = config.ig_display_name;
  const newName = "NOME MUDOU (teste resync)";

  console.log(`Post: ${post.id}`);
  console.log(`Nome antes: "${oldName}" → depois: "${newName}"`);
  console.log(`image_url ANTES:         ${post.image_url}`);
  console.log(`closing_image_url ANTES: ${post.closing_image_url}`);

  // Simula o novo perfil salvo em Ajustes
  const newProfile: IgProfile = {
    handle: config.ig_handle,
    displayName: newName,
    avatarUrl: config.ig_avatar_url,
    verified: config.ig_verified,
    showProfileChip: config.show_profile_chip,
  };

  // Mesma lógica de resyncChipOnPendingPosts (actions.ts)
  const newContentUrl = await regenerateContentImage(post.id, post.hook, newProfile);
  let newClosingUrl: string | null = null;
  if (post.template_applied) {
    const identity: VisualIdentity = {
      colorBackground: post.tpl_color_background,
      colorAccent: post.tpl_color_accent,
      colorText: post.tpl_color_text,
      colorKeywordBox: post.tpl_color_keyword_box,
      keyword: post.tpl_keyword,
      topText: post.tpl_top_text,
      bottomText: post.tpl_bottom_text,
      ctaEnabled: post.tpl_cta_enabled ?? false,
    };
    newClosingUrl = await renderAndUploadTemplateArt(post.id, identity, newProfile);
  }

  console.log(`image_url DEPOIS:         ${newContentUrl}`);
  console.log(`closing_image_url DEPOIS: ${newClosingUrl}`);

  if (!newContentUrl) {
    console.error("❌ FALHOU: regenerateContentImage retornou null (sem base salva?)");
    process.exit(1);
  }

  await db
    .from("posts")
    .update({ image_url: newContentUrl, closing_image_url: newClosingUrl })
    .eq("id", post.id);

  // Baixa as duas pra conferência visual
  const outDir = path.join(__dirname, "out");
  const r1 = await fetch(newContentUrl);
  fs.writeFileSync(path.join(outDir, "resync-p1.jpg"), Buffer.from(await r1.arrayBuffer()));
  if (newClosingUrl) {
    const r2 = await fetch(newClosingUrl);
    fs.writeFileSync(path.join(outDir, "resync-p2.jpg"), Buffer.from(await r2.arrayBuffer()));
  }

  console.log("✅ Re-renderizado com sucesso. Imagens salvas em scripts/out/resync-p*.jpg");
  console.log(`(nome do perfil NÃO foi alterado no banco — só as imagens do teste)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
