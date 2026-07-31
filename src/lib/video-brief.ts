// ============================================================
// Da lista de segmentos do roteiro para as buscas de b-roll no Pexels
// (Sprint D — liga D1 a D2).
//
// Por que NÃO buscar com o texto do beat: o roteiro sai no idioma da
// marca (pt-BR por padrão) e a busca do Pexels é indexada em inglês —
// "o mercado reagiu rápido" devolve zero resultado. Traduzir cada beat
// exigiria outra chamada de IA por vídeo, o que contraria a política de
// custo zero por um ganho duvidoso: b-roll é PANO DE FUNDO, não
// ilustração literal do que a legenda diz.
//
// Então o tema visual vem do NICHO (estável, já escolhido pela pessoa) e
// cada segmento recebe uma consulta diferente da lista, em rodízio. Isso
// resolve o problema real do b-roll: ninguém repara se o clipe do beat 2
// "casa" com a frase, mas todo mundo repara se os 5 clipes são o mesmo.
// ============================================================

/** Temas visuais por nicho, em inglês (a busca do Pexels é em inglês).
 *  Cinco por nicho: a timeline tem no máximo 6 segmentos (hook + 4 beats
 *  + cta), e o rodízio cobre o resto. */
const NICHE_QUERIES: Record<string, string[]> = {
  tecnologia: [
    "server room",
    "programmer typing code",
    "circuit board macro",
    "modern office technology",
    "data visualization screen",
  ],
  marketing: [
    "creative team meeting",
    "social media phone",
    "city billboard",
    "office whiteboard strategy",
    "handshake business",
  ],
  financas: [
    "stock market chart",
    "financial district skyline",
    "counting money",
    "business analytics laptop",
    "bank building exterior",
  ],
  saude: [
    "running outdoors",
    "healthy food preparation",
    "yoga stretching",
    "medical laboratory",
    "drinking water fitness",
  ],
  games: [
    "gaming setup rgb",
    "esports arena crowd",
    "controller closeup",
    "streaming microphone",
    "neon arcade lights",
  ],
};

/** Usado quando o nicho é 'outro', nulo ou desconhecido. Genérico de
 *  propósito: movimento e textura, nada que prometa um assunto. */
const FALLBACK_QUERIES = [
  "abstract motion background",
  "city timelapse",
  "people walking street",
  "light bokeh background",
  "nature aerial view",
];

/**
 * Uma consulta de b-roll por segmento da timeline, sem repetir enquanto
 * houver tema novo disponível.
 *
 * @param segmentCount quantos clipes a montagem precisa (1 por segmento)
 * @param niche chave do nicho do Brand Kit (`NICHES` em niches.ts)
 */
export function brollQueries(segmentCount: number, niche: string | null | undefined): string[] {
  const temas = (niche && NICHE_QUERIES[niche]) || FALLBACK_QUERIES;
  const out: string[] = [];
  for (let i = 0; i < Math.max(0, segmentCount); i++) {
    out.push(temas[i % temas.length]);
  }
  return out;
}
