// Testa a marca "feito com PostPilot" (plano free) nas duas páginas.
// Rodar: npx tsx scripts/test-watermark.ts
import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(
  path.join(__dirname, "..", ".env.local"),
  "utf8"
).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+[A-Z0-9_]*)=(.*)$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { renderTemplateSlide, __testComposeTemplate } = await import(
    "../src/lib/image"
  );

  const profile = {
    handle: "usuario.free",
    displayName: "Usuário Free",
    avatarUrl: null,
    verified: false,
    showProfileChip: true,
  };

  // Página 2 (contra-capa) com marca
  const closing = await renderTemplateSlide(
    {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      colorKeywordBox: "#7C5CFF",
      keyword: "QUERO",
      topText: "GOSTOU DO CONTEÚDO?",
      bottomText: "PARA RECEBER MAIS",
      ctaEnabled: true,
    },
    profile,
    1080,
    1350,
    true // watermark
  );
  fs.writeFileSync(path.join(__dirname, "out", "watermark-closing.jpg"), closing);

  // Página 1 (conteúdo, mock) com marca
  const content = await __testComposeTemplate(
    "🚨 OpenAI lança o GPT-6 e muda o jogo da IA",
    profile,
    true
  );
  fs.writeFileSync(path.join(__dirname, "out", "watermark-content.jpg"), content);

  console.log("gerado: watermark-closing.jpg + watermark-content.jpg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
