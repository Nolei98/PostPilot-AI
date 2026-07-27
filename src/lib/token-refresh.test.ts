// ============================================================
// Decisão de renovação do token do Instagram (src/lib/token-refresh.ts).
// Puro: sem rede, sem banco — `now` é injetado.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  decideTokenRefresh,
  REFRESH_WINDOW_DAYS,
  MIN_TOKEN_AGE_HOURS,
} from "@/lib/token-refresh";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Data ISO deslocada de `now` em milissegundos. */
function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

describe("decideTokenRefresh", () => {
  it("não renova token novo em folga (60 dias pra vencer)", () => {
    const d = decideTokenRefresh(
      { tokenExpiresAt: at(60 * DAY), tokenIssuedAt: at(-2 * DAY) },
      NOW
    );
    expect(d).toEqual({ action: "skip", reason: "not-due" });
  });

  it("renova dentro da janela de 14 dias", () => {
    const d = decideTokenRefresh(
      { tokenExpiresAt: at(10 * DAY), tokenIssuedAt: at(-50 * DAY) },
      NOW
    );
    expect(d).toEqual({ action: "refresh" });
  });

  it("borda: exatamente 14 dias pra vencer já renova; 1ms além não", () => {
    const issued = at(-50 * DAY);
    expect(
      decideTokenRefresh({ tokenExpiresAt: at(REFRESH_WINDOW_DAYS * DAY), tokenIssuedAt: issued }, NOW)
    ).toEqual({ action: "refresh" });
    expect(
      decideTokenRefresh(
        { tokenExpiresAt: at(REFRESH_WINDOW_DAYS * DAY + 1), tokenIssuedAt: issued },
        NOW
      )
    ).toEqual({ action: "skip", reason: "not-due" });
  });

  it("respeita a regra das 24h da Meta (token novo demais não renova)", () => {
    const d = decideTokenRefresh(
      { tokenExpiresAt: at(5 * DAY), tokenIssuedAt: at(-(MIN_TOKEN_AGE_HOURS - 1) * HOUR) },
      NOW
    );
    expect(d).toEqual({ action: "skip", reason: "too-young" });
  });

  it("com exatamente 24h de vida já pode renovar", () => {
    const d = decideTokenRefresh(
      { tokenExpiresAt: at(5 * DAY), tokenIssuedAt: at(-MIN_TOKEN_AGE_HOURS * HOUR) },
      NOW
    );
    expect(d).toEqual({ action: "refresh" });
  });

  it("token vencido pede reconexão (a Meta não renova mais)", () => {
    expect(
      decideTokenRefresh({ tokenExpiresAt: at(-1), tokenIssuedAt: at(-61 * DAY) }, NOW)
    ).toEqual({ action: "reconnect" });
    expect(
      decideTokenRefresh({ tokenExpiresAt: at(-30 * DAY), tokenIssuedAt: at(-90 * DAY) }, NOW)
    ).toEqual({ action: "reconnect" });
  });

  it("vencendo exatamente agora conta como vencido", () => {
    expect(
      decideTokenRefresh({ tokenExpiresAt: NOW.toISOString(), tokenIssuedAt: at(-60 * DAY) }, NOW)
    ).toEqual({ action: "reconnect" });
  });

  it("sem data de expiração não renova às cegas", () => {
    expect(decideTokenRefresh({ tokenExpiresAt: null, tokenIssuedAt: at(-30 * DAY) }, NOW)).toEqual({
      action: "skip",
      reason: "no-expiry",
    });
  });

  it("sem data de emissão, a regra das 24h não bloqueia (só a janela decide)", () => {
    const d = decideTokenRefresh({ tokenExpiresAt: at(3 * DAY), tokenIssuedAt: null }, NOW);
    expect(d).toEqual({ action: "refresh" });
  });
});
