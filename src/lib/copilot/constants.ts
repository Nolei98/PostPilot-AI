// ============================================================
// Constantes compartilhadas do Copiloto. Arquivo separado (em vez de
// viver em tools.ts) pra quem só precisa do marcador — settings/page.tsx
// e actions.ts — não puxar toda a cadeia de imports de tools.ts
// (supabase/server, enqueue, ai/remix) só pra comparar uma string.
// ============================================================

/** feed_url sintético da fonte usada pelas notícias que o Copiloto cria.
 *  Ver src/lib/copilot/tools.ts (garantirFonteSintetica) — exclui essa
 *  linha da lista "Fontes RSS" de Ajustes e do teto de fontes do plano. */
export const COPILOT_SOURCE_FEED_URL = "internal://copilot";
