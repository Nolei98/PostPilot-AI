// ============================================================
// Fundos GERADOS dos cards de carrossel — abstratos, nas cores da marca.
//
// Por que existir: até 31/07 todo card buscava foto de banco com a MESMA
// consulta (`nicheQuery`, "technology abstract dark" no nicho de tech).
// O headline do card nem entrava na busca. Saíam nove fotos aleatórias de
// gente digitando e placa de circuito, sem relação com o texto nem entre
// si — e cada uma com luminância imprevisível, brigando com o véu de
// contraste.
//
// Aqui não há busca, não há rede e não há custo: gradiente e forma em SVG,
// nas cores do próprio kit. A semente vem do post + índice do card, então
// o mesmo card sai igual em todo re-render (a arte não pode mudar sozinha
// entre uma aprovação e outra), cards diferentes saem diferentes, e a
// série inteira fica da mesma família visual.
//
// Regra de composição que vale pra todas as variantes: **o terço inferior
// fica limpo**. É onde o texto e o chip sentam. Toda a energia visual vive
// na metade de cima.
// ============================================================
import { CARD_W, CARD_H } from "@/lib/render-shared";
import { rasterizeSvg } from "@/lib/svg-render";
import { svgLocalId } from "@/lib/render-shared";

/** Cores que o fundo usa — subconjunto do CardBrand, pra manter puro. */
export interface BgBrandColors {
  colorBackground: string;
  colorAccent: string;
  /** Segunda cor de realce (caixa de palavra-chave do kit). Opcional. */
  colorKeyword?: string | null;
}

/** Hash estável de string → inteiro 32 bits (FNV-1a). */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG determinístico (mulberry32) — mesma semente, mesma sequência. */
function prng(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quantas famílias visuais existem. Card `idx` usa `idx % VARIANTES`. */
export const VARIANTES = 5;

/** Onde o conteúdo pode aparecer: nada de energia abaixo disto. */
const LIMITE_INFERIOR = 0.62;

function corComAlpha(cor: string, alpha: number): string {
  // O SVG aceita fill-opacity separado; manter a cor pura evita depender
  // de parsing de hex com canal alfa (nem todo renderer aceita #RRGGBBAA).
  return `${cor}" fill-opacity="${alpha.toFixed(3)}`;
}

/**
 * SVG do fundo gerado. Puro: sem rede, sem sharp, sem banco — dá pra
 * testar o markup sem rasterizar.
 */
export function buildGeneratedCardBgSvg(seed: string, brand: BgBrandColors): string {
  const rnd = prng(hashSeed(seed));
  const variante = hashSeed(seed) % VARIANTES;

  const bg = brand.colorBackground || "#0B0B12";
  const accent = brand.colorAccent || "#7C5CFF";
  const segunda = brand.colorKeyword || accent;

  const id = (nome: string) => svgLocalId(nome, seed);
  const idBrilho = id("glow");
  const idVeu = id("veil");
  const idDesfoque = id("soft");

  // Brilho principal: sempre na metade de cima, posição variando com a
  // semente pra dois cards seguidos não ficarem iguais.
  const gx = Math.round(CARD_W * (0.18 + rnd() * 0.64));
  const gy = Math.round(CARD_H * (0.08 + rnd() * 0.26));
  const gr = Math.round(CARD_W * (0.55 + rnd() * 0.35));

  let camadas = "";
  // Quanto desfocar a camada de forma. Sem isso o círculo e a faixa saem
  // com borda dura e parecem adesivo colado em vez de luz — visto no
  // primeiro render de prova. A grade é a exceção: ela SÓ existe enquanto
  // as linhas são nítidas.
  let desfoque = 70;

  if (variante === 0) {
    // Feixe diagonal — o mais "editorial" da família.
    const x1 = Math.round(CARD_W * (0.1 + rnd() * 0.2));
    camadas = `<polygon points="${x1},0 ${x1 + 420},0 ${x1 - 180},${Math.round(CARD_H * LIMITE_INFERIOR)} ${x1 - 520},${Math.round(CARD_H * LIMITE_INFERIOR)}" fill="${corComAlpha(accent, 0.1)}"/>`;
  } else if (variante === 1) {
    // Anéis concêntricos muito discretos.
    desfoque = 4; // só tira o serrilhado; o anel precisa continuar anel
    const cx = Math.round(CARD_W * (0.35 + rnd() * 0.3));
    const cy = Math.round(CARD_H * (0.2 + rnd() * 0.16));
    camadas = [0, 1, 2]
      .map(
        (i) =>
          `<circle cx="${cx}" cy="${cy}" r="${180 + i * 150}" fill="none" stroke="${accent}" stroke-opacity="${(0.16 - i * 0.045).toFixed(3)}" stroke-width="2"/>`
      )
      .join("\n  ");
  } else if (variante === 2) {
    // Faixa horizontal no terço superior.
    const y = Math.round(CARD_H * (0.16 + rnd() * 0.18));
    camadas = `<rect x="0" y="${y}" width="${CARD_W}" height="${Math.round(CARD_H * 0.12)}" fill="${corComAlpha(segunda, 0.09)}"/>`;
  } else if (variante === 3) {
    // Grade técnica esmaecida, só na metade de cima.
    desfoque = 0;
    const passo = 90;
    const linhas: string[] = [];
    for (let x = passo; x < CARD_W; x += passo) {
      linhas.push(
        `<line x1="${x}" y1="0" x2="${x}" y2="${Math.round(CARD_H * 0.5)}" stroke="${accent}" stroke-opacity="0.05" stroke-width="1"/>`
      );
    }
    camadas = linhas.join("\n  ");
  } else {
    // Segundo brilho, deslocado — o mais limpo da família.
    desfoque = 110;
    const bx = Math.round(CARD_W * (0.15 + rnd() * 0.7));
    camadas = `<circle cx="${bx}" cy="${Math.round(CARD_H * 0.12)}" r="${Math.round(CARD_W * 0.4)}" fill="${corComAlpha(segunda, 0.1)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <radialGradient id="${idBrilho}" cx="${(gx / CARD_W).toFixed(3)}" cy="${(gy / CARD_H).toFixed(3)}" r="${(gr / CARD_W).toFixed(3)}">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.30"/>
      <stop offset="55%" stop-color="${accent}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="${idDesfoque}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${desfoque}"/>
    </filter>
    <linearGradient id="${idVeu}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg}" stop-opacity="0"/>
      <stop offset="${Math.round(LIMITE_INFERIOR * 100)}%" stop-color="${bg}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${bg}" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="${bg}"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#${idBrilho})"/>
  <g${desfoque > 0 ? ` filter="url(#${idDesfoque})"` : ""}>
  ${camadas}
  </g>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#${idVeu})"/>
</svg>`;
}

/** PNG do fundo gerado, pronto pra virar `bg_url` depois do upload. */
export function buildGeneratedCardBgPng(seed: string, brand: BgBrandColors): Buffer {
  return rasterizeSvg(buildGeneratedCardBgSvg(seed, brand));
}
