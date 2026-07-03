// ============================================================
// Teste visual do slide com IDENTIDADE VISUAL — gera variações
// localmente (sem Storage/DB) em scripts/out/.
// Rodar: npx tsx scripts/test-template.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import { renderTemplateSlide } from "../src/lib/image";
import type { IgProfile, VisualIdentity } from "../src/lib/types";

const profile: IgProfile = {
  handle: "gurudoprompt",
  displayName: "Guru do Prompt",
  avatarUrl: null,
  verified: true,
  showProfileChip: true,
};

const cases: { name: string; identity: VisualIdentity; w: number; h: number }[] = [
  {
    name: "template-default-1080x1350",
    w: 1080,
    h: 1350,
    identity: {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      colorKeywordBox: "#7C5CFF",
      keyword: "CHATGPT",
      topText: "O NOVO",
      bottomText: "MUDOU TUDO",
      ctaEnabled: false,
    },
  },
  {
    name: "template-claro-1080x1080",
    w: 1080,
    h: 1080,
    identity: {
      colorBackground: "#F4F1EA",
      colorAccent: "#D97706",
      colorText: "#1C1917",
      colorKeywordBox: "#FDE68A",
      keyword: "IA NO BRASIL",
      topText: "A REVOLUÇÃO DA",
      bottomText: "JÁ COMEÇOU",
      ctaEnabled: false,
    },
  },
  {
    name: "template-multilinha-cta-1080x1350",
    w: 1080,
    h: 1350,
    identity: {
      colorBackground: "#0B0B12",
      colorAccent: "#22D3EE",
      colorText: "#FFFFFF",
      colorKeywordBox: "#22D3EE",
      keyword: "AGI",
      topText: "TODO MUNDO\nESTÁ FALANDO SOBRE",
      bottomText: "E ISSO É SÓ\nO COMEÇO",
      ctaEnabled: true,
    },
  },
];

async function main() {
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  for (const c of cases) {
    const buf = await renderTemplateSlide(c.identity, profile, c.w, c.h);
    const file = path.join(outDir, `${c.name}.jpg`);
    fs.writeFileSync(file, buf);
    console.log("gerado:", file);
  }
}

main();
