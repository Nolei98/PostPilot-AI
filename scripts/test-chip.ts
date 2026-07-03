// ============================================================
// Teste visual do chip de perfil — gera 4 variações localmente
// (sem tocar Storage/DB) e salva em scripts/out/.
// Rodar: npx tsx scripts/test-chip.ts
// ============================================================
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// Importa os internos do compositor via require relativo ao src.
// Como buildProfileChipLayers não é exportado, replicamos o fluxo
// público: mock da base + composeTemplate via generatePostImage não
// serve (sobe pro Storage). Então testamos as camadas por dentro:
import type { IgProfile } from "../src/lib/types";

// -- cópia mínima do mock de base (mesmo SVG do src/lib/image.ts) --
async function mockBase(w: number, h: number): Promise<Buffer> {
  const svg = `
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1b4b"/>
          <stop offset="50%" stop-color="#4c1d95"/>
          <stop offset="100%" stop-color="#0f0f23"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  // Acessa a função interna exportando-a só para teste:
  // usamos require dinâmico do módulo compilado por tsx
  const imageModule = await import("../src/lib/image");
  const build = imageModule.__testBuildProfileChipLayers as (
    p: IgProfile,
    w: number
  ) => Promise<{ input: Buffer; top: number; left: number }[]>;

  if (!build) {
    console.error(
      "Exporte __testBuildProfileChipLayers em src/lib/image.ts para rodar este teste."
    );
    process.exit(1);
  }

  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });

  const cases: { name: string; profile: IgProfile; w: number; h: number }[] = [
    {
      name: "verificado-sem-avatar-1080x1350",
      w: 1080,
      h: 1350,
      profile: {
        handle: "gurudoprompt",
        displayName: "Guru do Prompt",
        avatarUrl: null,
        verified: true,
        showProfileChip: true,
      },
    },
    {
      name: "nao-verificado-1080x1080",
      w: 1080,
      h: 1080,
      profile: {
        handle: "joaodaia",
        displayName: "João da IA",
        avatarUrl: null,
        verified: false,
        showProfileChip: true,
      },
    },
    {
      name: "nome-longo-1080x1350",
      w: 1080,
      h: 1350,
      profile: {
        handle: "perfilcomnomegigante.ia",
        displayName: "Perfil Com Nome Muito Grande de IA",
        avatarUrl: null,
        verified: true,
        showProfileChip: true,
      },
    },
  ];

  for (const c of cases) {
    const base = await mockBase(c.w, c.h);
    const layers = await build(c.profile, c.w);
    const out = await sharp(base).composite(layers).jpeg().toBuffer();
    const file = path.join(outDir, `${c.name}.jpg`);
    fs.writeFileSync(file, out);
    console.log("gerado:", file);
  }
}

main();
