// ============================================================
// Decisão pura: um token do Instagram precisa ser renovado agora?
//
// Separado do job (src/inngest/functions/refresh-social-tokens.ts) pra
// ser testável sem Inngest/Supabase — mesmo padrão de legibility.ts e
// contrast.ts.
//
// Regras da Meta para `ig_refresh_token`:
//  - o token precisa ter no MÍNIMO 24h de vida;
//  - o token NÃO pode estar expirado (vencido só reconectando o OAuth).
// Por isso renovamos com folga (janela de 14 dias antes do vencimento):
// mesmo que o job falhe alguns dias seguidos, ainda sobra tempo.
// ============================================================

/** Renova quando faltar isto (ou menos) pro token vencer. */
export const REFRESH_WINDOW_DAYS = 14;
/** A Meta recusa renovar token com menos de 24h de vida. */
export const MIN_TOKEN_AGE_HOURS = 24;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export type RefreshDecision =
  /** Dentro da janela e elegível — chamar refresh_access_token. */
  | { action: "refresh" }
  /** Ainda longe do vencimento, ou novo demais pra Meta aceitar renovar. */
  | { action: "skip"; reason: "not-due" | "too-young" | "no-expiry" }
  /** Já venceu: renovar não resolve, só reconectar pelo OAuth. */
  | { action: "reconnect" };

export interface TokenState {
  /** `social_connections.token_expires_at` (ISO) — null se nunca foi gravado. */
  tokenExpiresAt: string | null;
  /**
   * Quando o token atual passou a existir: `last_refreshed_at` se já
   * houve renovação, senão `connected_at`. Base da regra das 24h.
   */
  tokenIssuedAt: string | null;
}

/**
 * Decide o que fazer com um token, sem tocar em rede nem banco.
 * `now` é injetado pra manter o teste determinístico.
 */
export function decideTokenRefresh(state: TokenState, now: Date): RefreshDecision {
  if (!state.tokenExpiresAt) {
    // Sem data de expiração não dá pra saber se está na janela. Não
    // renova às cegas (gastaria uma chamada e poderia bater na regra
    // das 24h); a conexão continua válida até falhar de verdade.
    return { action: "skip", reason: "no-expiry" };
  }

  const expiresAt = new Date(state.tokenExpiresAt).getTime();
  const nowMs = now.getTime();

  if (expiresAt <= nowMs) return { action: "reconnect" };
  if (expiresAt - nowMs > REFRESH_WINDOW_DAYS * DAY_MS) {
    return { action: "skip", reason: "not-due" };
  }

  if (state.tokenIssuedAt) {
    const ageMs = nowMs - new Date(state.tokenIssuedAt).getTime();
    if (ageMs < MIN_TOKEN_AGE_HOURS * HOUR_MS) {
      return { action: "skip", reason: "too-young" };
    }
  }

  return { action: "refresh" };
}
