// ============================================================
// Score normalizado 0-100 de uma referência do Radar.
//
// Por que normalizar em vez de ordenar por upvote cru: 800 pontos no
// Hacker News e 800 no r/artificial não significam a mesma coisa, e um
// campeão de 3 dias atrás não deve ganhar de um de hoje só por ter tido
// mais tempo acumulando. Ordenar pelo número cru entregaria sempre a
// mesma lista velha da comunidade maior.
//
// Puro de propósito: é a parte que mais vai mudar de fórmula, e mudar
// fórmula não pode exigir rede nem banco pra testar.
// ============================================================
import type { RadarItem, RadarPlatform } from "@/lib/radar/types";

/**
 * Referência de "post que foi muito bem" em cada plataforma. Não é teto:
 * é o ponto onde a escala logarítmica satura perto de 1. Calibrado pelo
 * HN em 2026-07 (front page forte fica na casa dos 500 pontos / 200
 * comentários); Reddit entra quando o coletor existir.
 */
const REFERENCIA: Record<RadarPlatform, { pontos: number; comentarios: number }> = {
  hackernews: { pontos: 500, comentarios: 200 },
  reddit: { pontos: 3000, comentarios: 400 },
  youtube: { pontos: 50_000, comentarios: 1_000 },
};

/** Peso do engajamento passivo (upvote) contra o ativo (comentário). */
const PESO_PONTOS = 0.7;
const PESO_COMENTARIOS = 0.3;

/** Abaixo disto a idade não penaliza; acima, decai até o piso. */
const FRESCOR_HORAS = 24;
const JANELA_HORAS = 7 * 24;
const PISO_RECENCIA = 0.6;

/** Escala log: engajamento é cauda longa — dobrar upvotes não dobra o
 *  mérito, e sem log um outlier achataria todo o resto da lista. */
function normalizarLog(valor: number, referencia: number): number {
  if (valor <= 0) return 0;
  return Math.min(1, Math.log10(1 + valor) / Math.log10(1 + referencia));
}

/** 1.0 no primeiro dia, caindo linearmente até PISO_RECENCIA em 7 dias. */
export function fatorRecencia(publishedAt: string | null, agora = new Date()): number {
  if (!publishedAt) return 1;
  const idadeMs = agora.getTime() - new Date(publishedAt).getTime();
  if (Number.isNaN(idadeMs)) return 1;
  const horas = idadeMs / 3_600_000;
  if (horas <= FRESCOR_HORAS) return 1;
  if (horas >= JANELA_HORAS) return PISO_RECENCIA;
  const proporcao = (horas - FRESCOR_HORAS) / (JANELA_HORAS - FRESCOR_HORAS);
  return 1 - proporcao * (1 - PISO_RECENCIA);
}

/** Score 0-100 da referência. */
export function scoreDaReferencia(item: RadarItem, agora = new Date()): number {
  const ref = REFERENCIA[item.platform];
  const pontos = normalizarLog(item.points, ref.pontos);
  const comentarios = normalizarLog(item.comments, ref.comentarios);
  const mistura = PESO_PONTOS * pontos + PESO_COMENTARIOS * comentarios;
  const bruto = 100 * mistura * fatorRecencia(item.publishedAt, agora);
  return Math.max(0, Math.min(100, Math.round(bruto)));
}

/** Ordena do mais forte pro mais fraco, com o score já calculado. */
export function ranquear(
  itens: RadarItem[],
  agora = new Date()
): (RadarItem & { score: number })[] {
  return itens
    .map((item) => ({ ...item, score: scoreDaReferencia(item, agora) }))
    .sort((a, b) => b.score - a.score);
}
