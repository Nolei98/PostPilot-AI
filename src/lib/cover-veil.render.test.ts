// Render REAL da página 1 (sharp + resvg) com foto de fundo, só pra
// provar que o véu escolhido (bg_overlay, migration 048) chega até a arte
// final — e não só até a prévia da fila.
//
// Até 29/07 `composeFromSpec` compunha sempre em 'auto': quem escolhia
// 'on' ou 'off' via a fila obedecer e a arte aprovada sair diferente.
// A conferência é por PIXEL, medindo a faixa onde o texto senta.
import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import type { RenderSpec } from "@/lib/types";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { composeFromSpec } = await import("@/lib/image");

const WIDTH = 1080;
const HEIGHT = 1350;

/** Foto de fundo cinza-média: escura o bastante pra 'auto' medir pouco
 * véu, clara o bastante pra 'on' ter o que escurecer. */
function fotoCinza(): Promise<Buffer> {
  return sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#8A8A8A" } })
    .jpeg()
    .toBuffer();
}

/** Luminância média da metade de baixo — onde o véu de leitura senta. */
async function brilhoDaFaixa(png: Buffer): Promise<number> {
  const faixa = await sharp(png)
    .extract({ left: 0, top: Math.round(HEIGHT * 0.62), width: WIDTH, height: Math.round(HEIGHT * 0.3) })
    .greyscale()
    .stats();
  return faixa.channels[0].mean;
}

function spec(bgOverlay: "auto" | "on" | "off"): RenderSpec {
  return {
    v: 1,
    frozenAt: "2026-07-29T00:00:00.000Z",
    format: "single",
    layoutPreset: "editorial-noir",
    singlePostStyle: "cover",
    cardBrand: {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      fontFamily: "Inter",
      brandName: "Marca",
      wordmark: "MARCA",
      handle: "marca",
      keywords: null,
      brandMark: "wordmark",
      layoutPreset: "editorial-noir",
      singlePostStyle: "cover",
    },
    brandTemplate: { fontFamily: "Inter", logoUrl: null, showLogo: false },
    profile: {
      handle: "marca",
      displayName: "Marca",
      avatarUrl: null,
      verified: false,
      showProfileChip: false,
    },
    identity: {
      colorBackground: "#0B0B12",
      colorAccent: "#7C5CFF",
      colorText: "#FFFFFF",
      colorKeywordBox: "#7C5CFF",
      keyword: "IA",
      topText: "A NOVIDADE DE",
      bottomText: "QUE MUDA TUDO",
      ctaEnabled: false,
    },
    closingPage: false,
    templates: {},
    watermark: false,
    bgOverlay,
  };
}

describe("bg_overlay chega na arte final da página 1", () => {
  const hook = "Um titulo forte que prende a atencao do leitor";

  it("'off' deixa a foto mais clara que 'auto', e 'on' mais escura", async () => {
    const foto = await fotoCinza();
    const [off, auto, on] = await Promise.all([
      composeFromSpec(foto, hook, spec("off")),
      composeFromSpec(foto, hook, spec("auto")),
      composeFromSpec(foto, hook, spec("on")),
    ]);
    const [bOff, bAuto, bOn] = await Promise.all([
      brilhoDaFaixa(off),
      brilhoDaFaixa(auto),
      brilhoDaFaixa(on),
    ]);
    expect(bOn).toBeLessThan(bAuto);
    expect(bAuto).toBeLessThanOrEqual(bOff);
  }, 30000);
});
