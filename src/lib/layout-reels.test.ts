// Fase 4, fatia 1 — quadro Reels 9:16 (imagem estática, sem vídeo real
// ainda). Regra crítica do kit v2: nunca derivar 9:16 cortando as
// laterais; margem lateral segura ≥5px (~3% da largura, 1080px) em
// TODOS os layouts, inclusive os alinhados à esquerda.
import { describe, it, expect, beforeAll } from "vitest";
import { __testReelsFrame, buildReelsVideoOverlayPng } from "@/lib/image";
import sharp from "sharp";
import type { CardBrand } from "@/lib/render-shared";

// Foto mock gerada em runtime (evita depender de rede no teste) — só
// precisa ser grande o bastante pro resize/extract fazerem sentido.
let MOCK_PHOTO: Buffer;
beforeAll(async () => {
  MOCK_PHOTO = await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: { r: 20, g: 40, b: 90 } },
  })
    .jpeg()
    .toBuffer();
});

const PRESETS = ["editorial-noir", "brutalism", "serif-luxe", "swiss-mono", "pop-creator"] as const;
const HEADLINE = "A nova geração de modelos de IA já entende contexto visual";

describe.each(PRESETS)("Reels 9:16 — %s", (preset) => {
  it("gera um quadro EXATAMENTE 1080×1920 (nunca deriva cortando)", async () => {
    const jpeg = await __testReelsFrame(HEADLINE, preset, MOCK_PHOTO);
    const meta = await sharp(jpeg).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
  });

  it("produz um JPEG válido", async () => {
    const jpeg = await __testReelsFrame(HEADLINE, preset, MOCK_PHOTO);
    expect(jpeg.length).toBeGreaterThan(1000);
    // assinatura JPEG: FF D8 FF
    expect([jpeg[0], jpeg[1], jpeg[2]]).toEqual([0xff, 0xd8, 0xff]);
  });
});

describe("buildReelsVideoOverlayPng (vídeo real — Fase 4, fatia 2)", () => {
  const brand: CardBrand = {
    colorBackground: "#0B0B12",
    colorAccent: "#7C5CFF",
    colorText: "#FFFFFF",
    fontFamily: "Inter",
    brandName: "Marca Teste",
    wordmark: "MARCA®",
    handle: "marca.ia",
    layoutPreset: "editorial-noir",
  };

  it("gera um PNG transparente 1080×1350 (mesmo tamanho da capa 4:5)", async () => {
    const png = await buildReelsVideoOverlayPng(HEADLINE, brand, MOCK_PHOTO);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1350);
    expect(meta.channels).toBe(4); // com canal alfa (transparência)
  });

  it("escolhe o tema a partir da luminância do PÔSTER, não de um valor fixo", async () => {
    const lightPoster = await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 245, g: 245, b: 245 } },
    })
      .jpeg()
      .toBuffer();
    const darkPoster = await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .jpeg()
      .toBuffer();
    const lightResult = await buildReelsVideoOverlayPng(HEADLINE, brand, lightPoster);
    const darkResult = await buildReelsVideoOverlayPng(HEADLINE, brand, darkPoster);
    // Anti-regressão: pôster claro vs escuro precisa produzir overlays
    // DIFERENTES (tema/cor do texto muda) — prova que a luminância vem
    // do pôster de verdade, não de uma constante ignorando o parâmetro.
    expect(Buffer.compare(lightResult, darkResult)).not.toBe(0);
  });
});
