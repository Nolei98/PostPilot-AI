// Restaura o post de teste com o nome real do perfil (desfaz o
// test-resync.ts). Rodar: npx tsx scripts/restore-test-post.ts
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
  const { data: post } = await db
    .from("posts")
    .select("*")
    .eq("status", "pending_approval")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const { data: config } = await db
    .from("notification_configs")
    .select("*")
    .eq("user_id", post.user_id)
    .single();

  const profile: IgProfile = {
    handle: config.ig_handle,
    displayName: config.ig_display_name,
    avatarUrl: config.ig_avatar_url,
    verified: config.ig_verified,
    showProfileChip: config.show_profile_chip,
  };

  const contentUrl = await regenerateContentImage(post.id, post.hook, profile);
  let closingUrl: string | null = null;
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
    closingUrl = await renderAndUploadTemplateArt(post.id, identity, profile);
  }

  await db
    .from("posts")
    .update({ image_url: contentUrl, closing_image_url: closingUrl })
    .eq("id", post.id);

  console.log("restaurado com nome real:", config.ig_display_name);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
