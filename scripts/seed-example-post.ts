// ============================================================
// Insere um post de EXEMPLO na fila de aprovação, usando o
// compositor real (chip de perfil + identidade visual) — só
// para visualização, não gasta com IA/Flux.
// Rodar: npx tsx scripts/seed-example-post.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generatePostImage, renderAndUploadTemplateArt } from "../src/lib/image";
import type { IgProfile, VisualIdentity } from "../src/lib/types";

// Carrega .env.local manualmente (sem depender do pacote dotenv)
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
  // 1. Usuário + fonte já existentes (reaproveita do seed.sql)
  const { data: source, error: sourceError } = await db
    .from("source_configs")
    .select("id, user_id")
    .limit(1)
    .single();
  if (sourceError || !source) {
    console.error(
      "Nenhuma fonte encontrada. Rode supabase/seed.sql primeiro."
    );
    process.exit(1);
  }
  const { id: sourceId, user_id: userId } = source;

  // 2. Perfil e identidade visual: usa o que está salvo em Ajustes
  //    (se houver), senão cai nos defaults do próprio template.
  const { data: config } = await db
    .from("notification_configs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const profile: IgProfile = {
    handle: config?.ig_handle ?? "seuperfil.ia",
    displayName: config?.ig_display_name ?? "Seu Perfil de IA",
    avatarUrl: config?.ig_avatar_url ?? null,
    verified: config?.ig_verified ?? true, // true no exemplo p/ mostrar o selo
    showProfileChip: config?.show_profile_chip ?? true,
  };
  const identity: VisualIdentity = {
    colorBackground: config?.color_background ?? "#0B0B12",
    colorAccent: config?.color_accent ?? "#7C5CFF",
    colorText: config?.color_text ?? "#FFFFFF",
    colorKeywordBox: config?.color_keyword_box ?? "#7C5CFF",
    keyword: "GPT-6",
    topText: "A OPENAI ACABOU DE\nLANÇAR O",
    bottomText: "E NINGUÉM TAVA PREPARADO",
    ctaEnabled: true,
  };

  // 3. Notícia fake (candidata) — só para o post ter origem
  const { data: news, error: newsError } = await db
    .from("news_items")
    .insert({
      source_id: sourceId,
      url: `https://example.com/exemplo-${Date.now()}`,
      title: "OpenAI anuncia GPT-6 com capacidades multimodais avançadas",
      summary:
        "Novo modelo promete raciocínio em tempo real e integração nativa com ferramentas.",
      viral_score: 92,
      score_reason: "[EXEMPLO] notícia fictícia para visualização.",
      status: "candidate",
    })
    .select("id")
    .single();
  if (newsError) throw new Error(`Erro ao criar notícia: ${newsError.message}`);

  // 4. Renderiza as DUAS páginas do carrossel (chip em ambas):
  //    página 1 = conteúdo (mock, já que não há FAL_KEY neste teste),
  //    página 2 = fechamento (identidade visual). Nenhuma substitui a outra.
  const postId = crypto.randomUUID();
  console.log("Renderizando página 1 (conteúdo)...");
  const imageUrl = await generatePostImage(
    "(exemplo — não gerado por Flux)",
    "🚨 OpenAI lança o GPT-6 e muda o jogo da IA",
    postId,
    profile
  );
  console.log("Renderizando página 2 (fechamento)...");
  const closingImageUrl = await renderAndUploadTemplateArt(
    postId,
    identity,
    profile
  );

  // 5. Cria o post já pronto na fila (pending_approval)
  const { error: postError } = await db.from("posts").insert({
    id: postId,
    news_item_id: news.id,
    user_id: userId,
    hook: "🚨 OpenAI lança o GPT-6 e muda o jogo da IA",
    caption:
      "A OpenAI acabou de anunciar o GPT-6, e as primeiras demos já estão viralizando. 🤯\n\nRaciocínio em tempo real, memória de longo prazo e integração nativa com qualquer ferramenta — tudo num único modelo.\n\nQuem trabalha com IA precisa ficar de olho nisso HOJE.\n\n👉 Me segue para não perder nenhuma novidade!\n\n[Este é um post de EXEMPLO gerado para visualização do design.]",
    hashtags:
      "#inteligenciaartificial #ia #gpt6 #openai #tecnologia #chatgpt #inovacao #ai",
    image_prompt: "(exemplo — não gerado por Flux)",
    image_url: imageUrl,
    closing_image_url: closingImageUrl,
    status: "pending_approval",
    template_applied: true,
    tpl_keyword: identity.keyword,
    tpl_top_text: identity.topText,
    tpl_bottom_text: identity.bottomText,
    tpl_cta_enabled: identity.ctaEnabled,
    tpl_color_background: identity.colorBackground,
    tpl_color_accent: identity.colorAccent,
    tpl_color_text: identity.colorText,
    tpl_color_keyword_box: identity.colorKeywordBox,
  });
  if (postError) throw new Error(`Erro ao criar post: ${postError.message}`);

  console.log("✅ Post de exemplo criado na fila de aprovação!");
  console.log("Abra http://localhost:3000 para ver.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
