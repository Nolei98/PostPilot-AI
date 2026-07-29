import { describe, it, expect } from "vitest";
import {
  buildCardSvg,
  buildCoverSvg,
  brandLabelText,
  wrapText,
  CARD_W,
  CARD_H,
  type CardBrand,
} from "@/lib/carousel-render";
import type { CarouselCard } from "@/lib/ai/carousel";

const brand: CardBrand = {
  colorBackground: "#101018",
  colorAccent: "#FF3399",
  colorText: "#FFFFFF",
  fontFamily: "Inter",
  brandName: "Marca Teste",
};

describe("wrapText", () => {
  it("quebra por número de caracteres sem cortar palavra", () => {
    const lines = wrapText("um dois tres quatro", 8);
    expect(lines.every((l) => l.length <= 8)).toBe(true);
    expect(lines.join(" ")).toBe("um dois tres quatro");
  });

  it("mantém palavra única maior que o limite numa linha só", () => {
    expect(wrapText("supercalifragilistico", 5)).toEqual(["supercalifragilistico"]);
  });
});

describe("buildCardSvg", () => {
  const card: CarouselCard = { idx: 0, role: "hook", headline: "Gancho <forte> & real", body: "corpo" };

  it("tem as dimensões do card do Instagram (1080x1350)", () => {
    const svg = buildCardSvg(card, brand);
    expect(svg).toContain(`width="${CARD_W}"`);
    expect(svg).toContain(`height="${CARD_H}"`);
  });

  it("aplica cores e fonte do Brand Kit", () => {
    const svg = buildCardSvg(card, brand);
    expect(svg).toContain(brand.colorBackground);
    expect(svg).toContain('font-family="Inter"');
  });

  it("card 'cta' usa a cor de destaque na faixa", () => {
    const svg = buildCardSvg({ ...card, role: "cta" }, brand);
    expect(svg).toContain(brand.colorAccent);
  });

  it("escapa XML no texto do card", () => {
    const svg = buildCardSvg(card, brand);
    // Checa por fragmento, não a frase inteira — headline grande pode
    // quebrar em mais de uma linha (tspan) dependendo do tamanho da fonte.
    expect(svg).toContain("&lt;forte&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain("<forte>");
  });

  it("mostra o número do card, sem nome de marca no rodapé", () => {
    const svg = buildCardSvg({ ...card, idx: 4 }, brand);
    expect(svg).not.toContain("Marca Teste");
    expect(svg).toContain(">5<"); // idx 4 → card 5
  });

  it("rótulo alterna topo/rodapé pela paridade do índice (determinístico)", () => {
    const withHandle = { ...brand, handle: "0verlens", brandMark: "handle" as const };
    const even = buildCardSvg({ ...card, idx: 0 }, withHandle);
    const odd = buildCardSvg({ ...card, idx: 1 }, withHandle);
    expect(even).toContain('y="130"');
    expect(odd).toContain(`y="${CARD_H - 70}"`);
    // mesmo idx → sempre o mesmo resultado (reprodutível)
    expect(buildCardSvg({ ...card, idx: 0 }, withHandle)).toBe(even);
  });

  it("rótulo muito longo corta com reticências (nunca quebra linha)", () => {
    const withLongLabel = {
      ...brand,
      handle: "0verlens",
      brandMark: "auto" as const,
      keywords: ["PALAVRA-CHAVE-BEM-LONGA-UM", "PALAVRA-CHAVE-BEM-LONGA-DOIS", "MAIS-UMA-TERCEIRA-PALAVRA"],
    };
    const svg = buildCardSvg(card, withLongLabel);
    const labelMatch = svg.match(/y="130"[^>]*>([^<]*)</);
    expect(labelMatch?.[1]).toMatch(/…$/);
    expect((labelMatch?.[1]?.length ?? 0)).toBeLessThanOrEqual(50);
  });

  it("com foto: sem overlay (alpha=0) não desenha nenhum retângulo escurecido", () => {
    const svg = buildCardSvg(card, brand, true, { theme: "dark", alpha: 0 });
    expect(svg).not.toContain('fill-opacity="0.42"');
    expect(svg).not.toMatch(/fill="#000" fill-opacity="0\.[1-9]/);
  });

  it("com foto: overlay claro usa branco translúcido, overlay escuro usa preto translúcido", () => {
    const light = buildCardSvg(card, brand, true, { theme: "light", alpha: 0.3 });
    expect(light).toContain('fill="#fff" fill-opacity="0.3"');
    const dark = buildCardSvg(card, brand, true, { theme: "dark", alpha: 0.4 });
    expect(dark).toContain('fill="#000" fill-opacity="0.4"');
  });
});

describe("brandLabelText", () => {
  // Rótulo dos cards INTERIORES é sempre o @handle do Instagram (+
  // palavras-chave) — o wordmark é exclusivo do divisor da capa/fechamento.
  const b = (over: Partial<CardBrand>): CardBrand => ({ ...brand, ...over });

  it("mostra @handle independente do brandMark escolhido", () => {
    expect(brandLabelText(b({ brandMark: "handle", handle: "0verlens" }))).toBe("@0verlens");
    expect(brandLabelText(b({ brandMark: "wordmark", handle: "0verlens" }))).toBe("@0verlens");
    expect(brandLabelText(b({ brandMark: "wordmark+handle", handle: "0verlens" }))).toBe(
      "@0verlens"
    );
  });
  it("wordmark sozinho (sem handle) não aparece no rótulo interior", () => {
    expect(brandLabelText(b({ brandMark: "wordmark", wordmark: "Overlens" }))).toBeNull();
  });
  it("brandMark 'auto' mostra @handle + keywords", () => {
    const r = brandLabelText(b({ brandMark: "auto", handle: "h", keywords: ["ARTE", "TECH"] }));
    expect(r).toContain("@h");
    expect(r).toContain("ARTE, TECH");
  });
  it("brandMark 'none' e 'icon' → null", () => {
    expect(brandLabelText(b({ brandMark: "none", handle: "h" }))).toBeNull();
    expect(brandLabelText(b({ brandMark: "icon", handle: "h" }))).toBeNull();
  });
  it("palavras-chave aparecem mesmo com brandMark 'wordmark' (independente da marca)", () => {
    const r = brandLabelText(
      b({ brandMark: "wordmark", handle: "h", keywords: ["TECH", "DESIGN"] })
    );
    expect(r).toContain("@h");
    expect(r).toContain("TECH, DESIGN");
  });
});

describe("buildCoverSvg", () => {
  const cover: CarouselCard = { idx: 0, role: "hook", headline: "Diga adeus às fake news", body: "" };

  it("tem dimensões e mostra o wordmark no divisor", () => {
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" });
    expect(svg).toContain(`width="${CARD_W}"`);
    expect(svg).toContain(`height="${CARD_H}"`);
    expect(svg).toContain("OVERLENS"); // wordmark em caixa alta
    expect(svg).toContain("<line"); // réguas do divisor
  });

  it("sem wordmark, não desenha as réguas do divisor", () => {
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: null, brandName: null });
    expect(svg).not.toContain("<line");
  });

  it("o divisor/headline ficam grudados no rodapé (nunca no topo)", () => {
    const { svg, blurBandTop } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" });
    // topo da banda de identidade fica na metade de baixo do card
    expect(blurBandTop).toBeGreaterThan(CARD_H / 2);
    expect(svg).not.toContain('height="14"'); // sem a barra de destaque no topo
  });

  it("com foto e overlay: gradiente tematizado cobre a banda de identidade (nunca um retângulo de opacidade fixa)", () => {
    const { svg, blurBandTop } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" }, true, {
      overlay: { theme: "dark", alpha: 0.35 },
    });
    expect(svg).toContain(`y="${blurBandTop}"`);
    expect(svg).toContain("linearGradient");
    expect(svg).toContain('stop-opacity="0"'); // nasce transparente — conecta com a foto
    expect(svg).toContain('stop-opacity="0.35"'); // pico calibrado, só perto da base
    expect(svg).not.toMatch(/fill="#000" fill-opacity="0\.35"/); // não é mais um rect de opacidade fixa
  });

  it("com foto e alpha=0 (contraste já ok): sem gradiente de overlay", () => {
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" }, true, {
      overlay: { theme: "dark", alpha: 0 },
    });
    expect(svg).not.toContain("linearGradient");
  });

  it("fechamento (showSwipeHint:false) não mostra 'DESLIZE PARA VER'", () => {
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" }, false, {
      showSwipeHint: false,
      body: "Corpo de apoio",
    });
    expect(svg).not.toContain("DESLIZE PARA VER");
    expect(svg).toContain("Corpo de apoio");
  });

  it("remove emoji sem glifo da headline (evita o quadrado com '?')", () => {
    const { svg } = buildCoverSvg(
      { ...cover, headline: "❓ Quer saber mais?" },
      { ...brand, wordmark: "Overlens" }
    );
    expect(svg).not.toContain("❓");
    expect(svg).toContain("Quer saber");
    expect(svg).toContain("mais?");
  });

  it("normaliza travessão sem glifo (U+2011) pra hífen normal", () => {
    const { svg } = buildCoverSvg(
      { ...cover, headline: "Fact‑check em tempo real" },
      { ...brand, wordmark: "Overlens" }
    );
    expect(svg).not.toContain("‑");
    expect(svg).toContain("Fact-check");
  });

  it("fechamento com align:center + showActionIcons desenha os 4 ícones da trilha", () => {
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens" }, false, {
      showSwipeHint: false,
      align: "center",
      showActionIcons: true,
    });
    // 4 ícones = 4 <path> (curtir/repostar/compartilhar/salvar)
    const pathCount = (svg.match(/<path/g) ?? []).length;
    expect(pathCount).toBe(4);
  });

  it("wordmark com ® desenha o símbolo como vetor (círculo), não como texto", () => {
    const { svg } = buildCoverSvg(cover, { ...brand, wordmark: "Overlens®" });
    expect(svg).toContain("OVERLENS"); // texto sem o ®
    expect(svg).not.toContain("OVERLENS®"); // ® não fica colado no texto
    expect(svg).toContain("<circle"); // vetor do ®
    expect(svg).toContain(">R<"); // "R" dentro do círculo
  });
});

// O editorial-noir (preset PADRÃO, e o de todos os clientes hoje) não
// tinha meta-linha no topo — escolher rótulo (046) não mudava nada.
describe("rótulo do topo no editorial-noir (046)", () => {
  it("desenha o rótulo do post na capa", () => {
    const { svg } = buildCoverSvg(
      { idx: 0, role: "hook", headline: "Título", body: "" },
      { ...brand, eyebrow: "Edição 12" },
      false,
      {}
    );
    expect(svg).toContain("EDIÇÃO 12");
  });

  it("sem rótulo, a capa sai exatamente como antes", () => {
    const card = { idx: 0, role: "hook" as const, headline: "Título", body: "" };
    const semRotulo = buildCoverSvg(card, brand, false, {}).svg;
    expect(semRotulo).not.toContain("EDIÇÃO");
  });
});
