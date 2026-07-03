// Testa o chip com avatar REAL (foto) + verified=true, pra reproduzir
// o bug do selo sumindo. Rodar: npx tsx scripts/test-verified-with-avatar.ts
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
  const { renderTemplateSlide } = await import("../src/lib/image");
  const buf = await renderTemplateSlide(
    {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      colorKeywordBox: "#7C5CFF",
      keyword: "QUERO",
      topText: "Aqui eu simplifico a ia pra você! \r\nSeguir pode ser a sua melhor decisão do dia.",
      bottomText: "Para receber o material completo.",
      ctaEnabled: false,
    },
    {
      handle: "joaorodrigues.ia",
      displayName: "João Rodrigues",
      avatarUrl:
        "https://tyzzdbjisupcwnehioub.supabase.co/storage/v1/object/public/avatars/67e99084-7ecd-4acf-aa7d-03b87fbe34bd.png",
      verified: true,
      showProfileChip: true,
    }
  );
  fs.writeFileSync(path.join(__dirname, "out", "verified-avatar-repro.jpg"), buf);
  console.log("gerado");
}

main();
