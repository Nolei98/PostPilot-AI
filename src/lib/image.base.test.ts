import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

// A cascata de providers era intestável: gravava stock_photo_id direto no
// banco pelo postId, então exercitá-la exigia um post real. Agora ela só
// devolve os bytes + o metadata, e quem chama grava — dá pra fixar a
// ORDEM de fallback, que é a regra de negócio (foto da matéria antes de
// qualquer coisa paga) que ninguém verificava.
const calls: string[] = [];

function pixel(color: { r: number; g: number; b: number }) {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: color } })
    .png()
    .toBuffer();
}

const SOURCE = { r: 255, g: 0, b: 0 };
const STOCK = { r: 0, g: 255, b: 0 };
const POLLI = { r: 0, g: 0, b: 255 };

let stockPhoto: { id: string; credit: string } | null = { id: "px-1", credit: "Fulano/Pexels" };
let sourceFails = false;

vi.mock("@/lib/stock-photos", () => ({
  searchStockPhoto: async (_p: string, exclude: Set<string>) => {
    calls.push("stock");
    if (stockPhoto && exclude.has(stockPhoto.id)) return null;
    return stockPhoto;
  },
  fetchStockPhotoBuffer: async () => pixel(STOCK),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const mod = await import("@/lib/image");

// fetchSourceImage e os providers de IA são internos do módulo — o teste
// controla pelas entradas (sourceImageUrl / imageProvider) e por fetch.
const realFetch = globalThis.fetch;
beforeEach(() => {
  calls.length = 0;
  stockPhoto = { id: "px-1", credit: "Fulano/Pexels" };
  sourceFails = false;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("materia")) {
      calls.push("source");
      if (sourceFails) return new Response(null, { status: 404 });
      return new Response(await pixel(SOURCE), { status: 200 });
    }
    if (href.includes("pollinations")) {
      calls.push("pollinations");
      return new Response(await pixel(POLLI), { status: 200 });
    }
    return realFetch(url as never);
  }) as typeof fetch;
});

/** Cor média de um buffer — identifica qual provider devolveu a imagem. */
async function dominantChannel(buf: Buffer): Promise<"r" | "g" | "b"> {
  const { channels } = await sharp(buf).stats();
  const [r, g, b] = channels.map((c) => c.mean);
  if (r >= g && r >= b) return "r";
  if (g >= b) return "g";
  return "b";
}

describe("resolveBaseImage — ordem de fallback", () => {
  it("foto da matéria vence tudo (é grátis e é a foto real da notícia)", async () => {
    const { buffer, stock } = await mod.resolveBaseImage({
      imagePrompt: "ia generativa",
      sourceImageUrl: "https://exemplo.test/materia.jpg",
      imageProvider: "stock",
    });
    expect(await dominantChannel(buffer)).toBe("r");
    expect(stock).toBeNull();
    // nem chegou a consultar o banco de fotos
    expect(calls).not.toContain("stock");
  });

  it("matéria sem foto → banco de fotos, e devolve o crédito pra quem chamou gravar", async () => {
    const { buffer, stock } = await mod.resolveBaseImage({
      imagePrompt: "ia generativa",
      imageProvider: "stock",
    });
    expect(await dominantChannel(buffer)).toBe("g");
    expect(stock).toEqual({ id: "px-1", credit: "Fulano/Pexels" });
  });

  it("download da matéria falhando cai pro próximo — não derruba a geração", async () => {
    sourceFails = true;
    const { buffer } = await mod.resolveBaseImage({
      imagePrompt: "ia generativa",
      sourceImageUrl: "https://exemplo.test/materia.jpg",
      imageProvider: "stock",
    });
    expect(calls).toContain("source");
    expect(await dominantChannel(buffer)).toBe("g");
  });

  it("foto já usada pelo usuário é excluída — não repete a mesma imagem em dois posts", async () => {
    const { buffer, stock } = await mod.resolveBaseImage({
      imagePrompt: "ia generativa",
      imageProvider: "stock",
      excludeStockIds: new Set(["px-1"]),
    });
    expect(stock).toBeNull();
    // sem match no banco de fotos, cai na ilustração sem pessoas
    expect(await dominantChannel(buffer)).toBe("b");
  });

  it("sem match no banco de fotos, cai em ilustração SEM pessoas (nunca gera rosto por IA)", async () => {
    stockPhoto = null;
    const { buffer } = await mod.resolveBaseImage({
      imagePrompt: "ia generativa",
      imageProvider: "stock",
    });
    expect(await dominantChannel(buffer)).toBe("b");
    const prompt = calls.join(" ");
    expect(prompt).toContain("pollinations");
  });

  it("sempre devolve bytes — nenhum caminho retorna null", async () => {
    stockPhoto = null;
    for (const provider of ["stock", "pollinations"] as const) {
      const { buffer } = await mod.resolveBaseImage({ imagePrompt: "x", imageProvider: provider });
      expect(buffer.length).toBeGreaterThan(0);
    }
  });
});
