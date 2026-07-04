// ============================================================
// Teste rápido: só chama a geração de texto (Claude) pra conferir
// o novo image_prompt (formato 4:5 + estilo realista) sem gastar
// com geração de imagem.
// Rodar: npx tsx scripts/test-image-prompt.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(
  path.join(__dirname, "..", ".env.local"),
  "utf8"
).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

import { generatePostPackage } from "../src/lib/ai/generate";

async function main() {
  const pkg = await generatePostPackage(
    {
      title: "OpenAI anuncia GPT-6 com capacidades multimodais avançadas",
      summary:
        "Novo modelo promete raciocínio em tempo real e integração nativa com ferramentas.",
      url: "https://example.com/gpt-6",
      language: "pt-BR",
    },
    "gemini" // sem GEMINI_API_KEY, cai pro Claude automaticamente
  );

  console.log("hook:", pkg.hook);
  console.log("\ncaption:\n", pkg.caption);
  console.log("\nhashtags:", pkg.hashtags);
  console.log("\nimage_prompt:\n", pkg.image_prompt);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
