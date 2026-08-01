// ============================================================
// Âncora do chip de perfil na CONTRA-CAPA.
//
// O chip é posicionado a partir de `lowestTextBottomFrac` — a mesma
// medição que o motor de template usa pra quebrar o texto. Estes testes
// existem porque a alternativa (uma fração fixa da altura) só quebrava em
// produção, num título longo do cliente: o chip encostava no texto.
// ============================================================
import { describe, it, expect } from "vitest";
import { lowestTextBottomFrac } from "@/lib/template-render";
import { closingChipPlacement, buildProfileChipSvg } from "@/lib/profile-chip";
import { lastFechamentoPreset } from "@/lib/template-presets";
import { CARD_W, CARD_H } from "@/lib/render-shared";
import type { CardBrand } from "@/lib/carousel-render";

const brand: CardBrand = {
  colorBackground: "#0B0B12",
  colorAccent: "#7B2FF7",
  colorText: "#FFFFFF",
  fontFamily: "Sora",
  brandName: "João Rodrigues",
  wordmark: "JOAORODRIGUES®",
  handle: "joaorodrigues.ia",
  keywords: ["IA"],
  brandMark: "wordmark",
};

const profile = {
  handle: "joaorodrigues.ia",
  displayName: "João Rodrigues",
  avatarUrl: null,
  verified: false,
  showProfileChip: true,
};

const CURTO = "Obrigado!";
const MEDIO = "Obrigado por ler até aqui, agora me conta o que achou disso";
const LONGO =
  "Obrigado por ler até aqui, agora me conta nos comentários o que você achou " +
  "de tudo isso e se pretende testar alguma dessas ferramentas ainda esta semana";

function medir(headline: string) {
  return lowestTextBottomFrac(lastFechamentoPreset, brand, { headline }, CARD_W, CARD_H);
}

describe("chip da contra-capa", () => {
  it("desce conforme o título ocupa mais linhas", () => {
    const curto = medir(CURTO)!;
    const medio = medir(MEDIO)!;
    expect(medio).toBeGreaterThan(curto);
  });

  it("ancora ABAIXO do texto, nunca em cima dele", () => {
    for (const headline of [CURTO, MEDIO]) {
      const bottom = medir(headline)!;
      const { topFrac } = closingChipPlacement(bottom);
      expect(topFrac).toBeDefined();
      expect(topFrac!).toBeGreaterThan(bottom);
    }
  });

  it("cai no rodapé quando o texto termina baixo demais pra caber um chip", () => {
    // Testado direto na função, e não pelo título longo do preset: desde
    // que a âncora vertical passou a funcionar (31/07), o título do
    // Fechamento é CENTRALIZADO — texto longo cresce pros dois lados e
    // continua sobrando espaço embaixo. A regra do rodapé segue valendo,
    // só não é mais o texto longo que a dispara neste preset.
    const placement = closingChipPlacement(0.82);
    expect(placement.topFrac).toBeUndefined();
    expect(placement.position).toBe("bottom-center");
  });

  it("título longo continua deixando o chip abaixo do texto, sem colidir", () => {
    const bottom = medir(LONGO)!;
    const { topFrac } = closingChipPlacement(bottom);
    if (topFrac !== undefined) expect(topFrac).toBeGreaterThan(bottom);
  });

  it("cai no rodapé quando não há texto medível", () => {
    expect(closingChipPlacement(null).topFrac).toBeUndefined();
  });

  it("o chip inteiro cabe no quadro em qualquer um dos casos", () => {
    for (const headline of [CURTO, MEDIO, LONGO]) {
      const placement = closingChipPlacement(medir(headline)!);
      const { svg } = buildProfileChipSvg(profile, CARD_W, brand.fontFamily, {
        canvasHeight: CARD_H,
        ...placement,
      });
      // y do retângulo do chip + sua altura precisa caber em CARD_H.
      const rect = svg.match(/<rect[^>]*y="(\d+(?:\.\d+)?)"[^>]*height="(\d+(?:\.\d+)?)"/);
      expect(rect).not.toBeNull();
      const base = Number(rect![1]) + Number(rect![2]);
      expect(base).toBeLessThanOrEqual(CARD_H);
    }
  });

  it("é maior que o chip padrão de rodapé", () => {
    const grande = closingChipPlacement(medir(CURTO)!);
    expect(grande.scale!).toBeGreaterThan(1);
    expect(grande.widthPercent!).toBeGreaterThan(0.3);
  });
});
