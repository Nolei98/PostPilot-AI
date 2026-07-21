// ============================================================
// Rasteriza SVG (com texto) para PNG usando resvg, com a fonte
// gravada em /tmp — NÃO depende de fontconfig nem de nenhuma fonte
// instalada no sistema. É a única forma confiável de desenhar texto
// em ambiente serverless (Vercel/Linux não vem com nenhuma fonte por
// padrão: sharp/librsvg sozinho desenha caixas no lugar do texto
// nesse ambiente, mesmo com @font-face embutido no SVG).
//
// resvg só aceita fonte via caminho de arquivo (fontFiles), não via
// buffer em memória — por isso gravamos em /tmp uma única vez (fica
// em cache entre invocações na mesma instância "quente" da função).
// ============================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { POST_FONTS, LAYOUT_FONTS } from "@/lib/font-data";

let fontFilesCache: string[] | null = null;

/**
 * Grava em disco TODOS os pesos de TODAS as famílias selecionáveis em
 * Ajustes (Inter/Sora/Space Grotesk) + as fontes de uso interno dos
 * layouts alternativos (Anton, IBM Plex Mono — Fase 3) — o resvg casa por
 * família+peso lidos do próprio arquivo, então basta ter tudo registrado;
 * o SVG escolhe a família certa via font-family no texto.
 */
function ensureFontFiles(): string[] {
  if (fontFilesCache) return fontFilesCache;

  const dir = path.join(os.tmpdir(), "postpilot-fonts");
  fs.mkdirSync(dir, { recursive: true });

  const files: string[] = [];
  for (const font of [...POST_FONTS, ...LAYOUT_FONTS]) {
    for (const f of font.buffers) {
      const file = path.join(dir, `${font.key}-${f.weight}.ttf`);
      if (!fs.existsSync(file)) {
        // Escreve num arquivo temporário exclusivo e só então renomeia —
        // evita corromper o .ttf se duas requisições concorrentes (cold
        // start) tentarem escrever o mesmo arquivo ao mesmo tempo.
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmp, Buffer.from(f.data, "base64"));
        try {
          fs.renameSync(tmp, file);
        } catch {
          // Outro processo já terminou de escrever o arquivo final —
          // descarta o temporário e segue usando o que já existe.
          fs.rmSync(tmp, { force: true });
        }
      }
      files.push(file);
    }
  }
  fontFilesCache = files;
  return fontFilesCache;
}

/** Rasteriza um SVG (string) para um Buffer PNG. */
export function rasterizeSvg(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    font: {
      fontFiles: ensureFontFiles(),
      loadSystemFonts: false,
    },
  });
  return Buffer.from(resvg.render().asPng());
}
