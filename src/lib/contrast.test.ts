import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  pickTheme,
  textColorForTheme,
  contrastRatio,
  needsOverlay,
  overlayAlphaFor,
  measureImageLuminance,
  relativeLuminanceOfHex,
  boostAccent,
  MIN_ACCENT_CONTRAST,
  buildLuminanceGrid,
  gridAverage,
  luminanceOfRegion,
} from "@/lib/contrast";

describe("relativeLuminanceOfHex", () => {
  it("preto ~0, branco ~1", () => {
    expect(relativeLuminanceOfHex("#000000")).toBeLessThan(0.01);
    expect(relativeLuminanceOfHex("#FFFFFF")).toBeGreaterThan(0.99);
  });
  it("cor de marca escura tem luminância baixa (tema escuro)", () => {
    expect(pickTheme(relativeLuminanceOfHex("#0B0B12"))).toBe("dark");
  });
});

describe("pickTheme", () => {
  it("L >= 0.55 → claro; abaixo → escuro", () => {
    expect(pickTheme(0.55)).toBe("light");
    expect(pickTheme(0.8)).toBe("light");
    expect(pickTheme(0.54)).toBe("dark");
    expect(pickTheme(0.2)).toBe("dark");
  });
  it("casos de borda: 0, 0.54, 0.55, 1", () => {
    expect(pickTheme(0)).toBe("dark");
    expect(pickTheme(0.54)).toBe("dark");
    expect(pickTheme(0.55)).toBe("light");
    expect(pickTheme(1)).toBe("light");
  });
});

describe("textColorForTheme", () => {
  it("escuro → texto branco; claro → texto escuro", () => {
    expect(textColorForTheme("dark")).toBe("#FFFFFF");
    expect(textColorForTheme("light")).toBe("#0A0A0A");
  });
});

describe("contrastRatio / needsOverlay (WCAG)", () => {
  it("branco sobre fundo bem escuro: contraste alto, sem overlay", () => {
    const ratio = contrastRatio("#FFFFFF", 0.02);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(needsOverlay("#FFFFFF", 0.02)).toBe(false);
  });
  it("branco sobre fundo médio-claro: contraste baixo, precisa de overlay", () => {
    const ratio = contrastRatio("#FFFFFF", 0.5);
    expect(ratio).toBeLessThan(4.5);
    expect(needsOverlay("#FFFFFF", 0.5)).toBe(true);
  });
  it("preto sobre fundo bem claro: contraste alto, sem overlay", () => {
    expect(needsOverlay("#0A0A0A", 0.9)).toBe(false);
  });
});

describe("overlayAlphaFor", () => {
  it("0 quando o contraste já está bom (sem overlay)", () => {
    expect(overlayAlphaFor("dark", "#FFFFFF", 0.02)).toBe(0);
  });
  it("> 0 quando o contraste está ruim, e reduz a luminância efetiva o suficiente", () => {
    const alpha = overlayAlphaFor("dark", "#FFFFFF", 0.5);
    expect(alpha).toBeGreaterThan(0);
    const effectiveLum = 0.5 * (1 - alpha);
    expect(contrastRatio("#FFFFFF", effectiveLum)).toBeGreaterThanOrEqual(4.5);
  });
  it("tema claro clareia (aumenta a luminância efetiva) em vez de escurecer", () => {
    const alpha = overlayAlphaFor("light", "#0A0A0A", 0.15);
    expect(alpha).toBeGreaterThan(0);
    const effectiveLum = 0.15 + (1 - 0.15) * alpha;
    expect(contrastRatio("#0A0A0A", effectiveLum)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("measureImageLuminance", () => {
  it("imagem preta → luminância ~0", async () => {
    const buf = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const L = await measureImageLuminance(buf);
    expect(L).toBeLessThan(0.02);
  });
  it("imagem branca → luminância ~1", async () => {
    const buf = await sharp({
      create: { width: 20, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const L = await measureImageLuminance(buf);
    expect(L).toBeGreaterThan(0.98);
  });
});

/** Gradiente vertical preto→branco no tamanho da arte — luminância varia
 * só com Y, então cada banda tem um valor bem diferente e um bug de
 * mapeamento de região aparece na hora. */
async function gradientCanvas(width = 1080, height = 1350): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/>
    </linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("LumGrid (amostra de luminância persistível)", () => {
  const CANVAS = { width: 1080, height: 1350 };

  it("a média da grade é a mesma medida da imagem inteira", async () => {
    const buf = await gradientCanvas();
    const grid = await buildLuminanceGrid(buf);
    expect(grid.w).toBe(48);
    expect(grid.h).toBe(60);
    expect(gridAverage(grid)).toBeCloseTo(await measureImageLuminance(buf), 3);
  });

  it("a região do canvas inteiro reproduz a medida da imagem inteira", async () => {
    const buf = await gradientCanvas();
    const grid = await buildLuminanceGrid(buf);
    const full = luminanceOfRegion(grid, { left: 0, top: 0, ...CANVAS }, CANVAS);
    expect(full).toBeCloseTo(await measureImageLuminance(buf), 3);
  });

  it.each([
    ["banda de identidade (rodapé)", { left: 0, top: 900, width: 1080, height: 450 }],
    ["meta-linha do topo", { left: 0, top: 0, width: 1080, height: 140 }],
    ["zona segura do Reels", { left: 0, top: 400, width: 1080, height: 700 }],
  ])(
    "região %s bate com o sharp.extract + measure que ela substitui",
    async (_nome, rect) => {
      const buf = await gradientCanvas();
      const grid = await buildLuminanceGrid(buf);

      // Caminho ANTIGO, o que os builders de layout faziam antes.
      const band = await sharp(buf).extract(rect).toBuffer();
      const antes = await measureImageLuminance(band);

      const agora = luminanceOfRegion(grid, rect, CANVAS);
      // 1 casa decimal: a grade é uma amostra 48x60 do canvas inteiro, então
      // uma banda estreita cai em poucas linhas. O passo do overlayAlphaFor
      // é 0,1 — essa margem não muda a arte, e o mesmo número é usado no
      // preview e no render final, que é o que precisa bater.
      expect(agora).toBeCloseTo(antes, 1);
    }
  );

  it("distingue regiões escuras de claras (não devolve a média global)", async () => {
    const grid = await buildLuminanceGrid(await gradientCanvas());
    const topo = luminanceOfRegion(grid, { left: 0, top: 0, width: 1080, height: 300 }, CANVAS);
    const base = luminanceOfRegion(grid, { left: 0, top: 1050, width: 1080, height: 300 }, CANVAS);
    // limiares folgados de propósito: luminância relativa é não-linear
    // (gamma sRGB), o gradiente não mapeia linear em 0–1
    expect(topo).toBeLessThan(0.15);
    expect(base).toBeGreaterThan(0.7);
    expect(base - topo).toBeGreaterThan(0.6);
    expect(pickTheme(topo)).toBe("dark");
    expect(pickTheme(base)).toBe("light");
  });

  it("sobrevive a serialização JSON (é o que vai pro jsonb)", async () => {
    const grid = await buildLuminanceGrid(await gradientCanvas());
    const roundTrip = JSON.parse(JSON.stringify(grid));
    expect(gridAverage(roundTrip)).toBe(gridAverage(grid));
    // ~3,8 KB — cabe numa coluna por post sem pesar
    expect(JSON.stringify(grid).length).toBeLessThan(5000);
  });
});

describe("boostAccent — o realce tem que realçar", () => {
  const branco = relativeLuminanceOfHex("#FFFFFF");
  const escuro = relativeLuminanceOfHex("#0B0B12");

  it("cor que já salta do fundo volta INTACTA", () => {
    // magenta da marca sobre fundo escuro: 6.6:1, não precisa de ajuda
    expect(boostAccent("#FF5C7A", escuro)).toBe("#FF5C7A");
  });

  it("a MESMA cor sobre fundo branco é escurecida até realçar", () => {
    // 2.97:1 antes — passava despercebida (relatado em 2026-07-28)
    expect(contrastRatio("#FF5C7A", branco)).toBeLessThan(3);
    const ajustada = boostAccent("#FF5C7A", branco);
    expect(ajustada).not.toBe("#FF5C7A");
    expect(contrastRatio(ajustada, branco)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
  });

  it("clareia em fundo escuro em vez de escurecer", () => {
    const quaseInvisivel = "#101014";
    const ajustada = boostAccent(quaseInvisivel, escuro);
    expect(relativeLuminanceOfHex(ajustada)).toBeGreaterThan(
      relativeLuminanceOfHex(quaseInvisivel)
    );
    expect(contrastRatio(ajustada, escuro)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST);
  });

  it("mantém o matiz — não vira cinza nem preto puro", () => {
    const ajustada = boostAccent("#46E5B7", branco);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ajustada.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r); // continua verde
    expect(b).toBeGreaterThan(r);
  });
});
