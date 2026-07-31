// ============================================================
// Fontes disponíveis para um elemento de template, e o encaixe de peso.
//
// Arquivo PRÓPRIO, e não dentro de template-render.ts, porque o editor é
// componente `"use client"`: template-render importa `sharp`, e importar
// dele no cliente arrastaria o sharp pro bundle do navegador. Aqui não há
// dependência de servidor — só dados e aritmética.
// ============================================================

/**
 * Famílias que o elemento pode pedir em `style.font`, além da fonte da
 * marca. São exatamente as que o rasterizador tem gravadas
 * (`font-data.ts`): pedir qualquer outra deixaria o resvg escolher o que
 * tivesse à mão, que é como texto sai com aparência errada.
 *
 * `pesos` lista o que cada família REALMENTE tem em disco — Anton, DM
 * Serif e Varela só vieram no 400.
 */
export const FONTES_DO_TEMPLATE = [
  { valor: "marca", rotulo: "Da marca (Ajustes)", pesos: [400, 500, 600, 800, 900] },
  { valor: "Inter", rotulo: "Inter (neutra)", pesos: [400, 500, 600, 800, 900] },
  { valor: "Sora", rotulo: "Sora (geométrica)", pesos: [400, 500, 600, 800, 900] },
  { valor: "Space Grotesk", rotulo: "Space Grotesk (tech)", pesos: [400, 500, 600, 800, 900] },
  { valor: "Anton", rotulo: "Anton (display pesada)", pesos: [400] },
  { valor: "IBM Plex Mono", rotulo: "IBM Plex Mono", pesos: [400, 700] },
  { valor: "DM Serif Display", rotulo: "DM Serif Display", pesos: [400] },
  { valor: "Varela Round", rotulo: "Varela Round", pesos: [400] },
] as const;

/**
 * Família do elemento. Existe porque a linha original do renderizador era
 * `el.style?.font === "heading" ? brand.fontFamily : brand.fontFamily` —
 * os dois ramos idênticos, então a escolha de fonte do modelo **nunca fez
 * efeito nenhum** (achado em 31/07, na auditoria do editor).
 *
 * "marca", "heading" e "body" seguem a fonte escolhida em Ajustes — os
 * dois últimos por compatibilidade com specs já gravadas.
 */
export function fontFamilyFor(font: string | undefined, fonteDaMarca: string): string {
  if (!font || font === "marca" || font === "heading" || font === "body") {
    return fonteDaMarca;
  }
  const conhecida = FONTES_DO_TEMPLATE.find((f) => f.valor === font);
  return conhecida ? conhecida.valor : fonteDaMarca;
}

/** Pesos que a família tem gravados. */
export function pesosDaFonte(font: string | undefined): number[] {
  const f = FONTES_DO_TEMPLATE.find((x) => x.valor === (font ?? "marca"));
  return [...(f?.pesos ?? FONTES_DO_TEMPLATE[0].pesos)];
}

/**
 * O peso pedido, encaixado no mais próximo que existe na família.
 *
 * O editor deixava digitar qualquer número entre 100 e 900; pedir 437 (ou
 * 800 numa família que só tem 400) fazia o rasterizador cair noutro
 * arquivo de fonte, e o texto saía deformado.
 */
export function pesoMaisProximo(peso: number, font: string | undefined): number {
  const disponiveis = pesosDaFonte(font);
  return disponiveis.reduce((melhor, p) =>
    Math.abs(p - peso) < Math.abs(melhor - peso) ? p : melhor
  );
}
