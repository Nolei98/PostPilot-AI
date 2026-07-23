// Fase 4, fatia 2 — vídeo real (Reels 9:16). Redesenhado 2026-07-23 pro
// estilo "zona segura" (exemplo-modelos-com-video.png, caso 3): o vídeo
// cobre o quadro 1080×1920 inteiro, texto alinhado à esquerda numa
// zona que não invade onde o Instagram desenha sua própria UI.
import { describe, it, expect } from "vitest";
import { buildReelsVideoOverlayPng } from "@/lib/image";
import { REELS_W, REELS_H } from "@/lib/video";
import sharp from "sharp";
import type { CardBrand } from "@/lib/render-shared";

const HEADLINE = "A nova geração de modelos de IA já entende contexto visual";

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

  it("gera um PNG transparente 1080×1920 (quadro Reels nativo)", async () => {
    const posterFrame = await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 20, g: 40, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    const png = await buildReelsVideoOverlayPng(HEADLINE, brand, posterFrame);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(REELS_W);
    expect(meta.height).toBe(REELS_H);
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

  it("título fica alinhado à ESQUERDA, dentro da zona segura (nunca centralizado)", async () => {
    const posterFrame = await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: { r: 20, g: 40, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    const png = await buildReelsVideoOverlayPng(HEADLINE, brand, posterFrame);
    // Rasteriza e confirma que existe conteúdo opaco perto da margem
    // esquerda (64px) — texto alinhado à esquerda, não centralizado.
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let foundNearLeftEdge = false;
    for (let y = 0; y < info.height; y += 4) {
      for (let x = 60; x < 120; x += 2) {
        const idx = (y * info.width + x) * channels;
        if (data[idx + 3] > 10) {
          foundNearLeftEdge = true;
          break;
        }
      }
      if (foundNearLeftEdge) break;
    }
    expect(foundNearLeftEdge).toBe(true);
  });
});
