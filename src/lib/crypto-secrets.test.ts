import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { encryptSecret, decryptSecret, signOAuthState, verifyOAuthState } from "@/lib/crypto-secrets";

describe("crypto-secrets", () => {
  const originalKey = process.env.SECRETS_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(() => {
    process.env.SECRETS_ENCRYPTION_KEY = originalKey;
  });

  it("cifra e decifra de volta pro texto original", () => {
    const plain = "EAABsbCS1234567890abcdefghijklmnop";
    const payload = encryptSecret(plain);
    expect(payload).not.toContain(plain);
    expect(decryptSecret(payload)).toBe(plain);
  });

  it("gera payloads diferentes a cada chamada (iv aleatório)", () => {
    const a = encryptSecret("mesmo-segredo");
    const b = encryptSecret("mesmo-segredo");
    expect(a).not.toBe(b);
  });

  it("falha ao decifrar com a chave errada", () => {
    const payload = encryptSecret("segredo");
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptSecret(payload)).toThrow();
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("exige SECRETS_ENCRYPTION_KEY definida", () => {
    delete process.env.SECRETS_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/SECRETS_ENCRYPTION_KEY/);
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });
});

describe("OAuth state (signOAuthState/verifyOAuthState)", () => {
  const originalKeyForState = process.env.SECRETS_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  afterAll(() => {
    process.env.SECRETS_ENCRYPTION_KEY = originalKeyForState;
    vi.useRealTimers();
  });

  it("assina e valida de volta o mesmo clientId", () => {
    const clientId = "9618ce4a-0b07-4ad5-b1e4-218238ead7aa";
    const state = signOAuthState(clientId);
    expect(verifyOAuthState(state)).toBe(clientId);
  });

  it("rejeita state adulterado", () => {
    const state = signOAuthState("client-x");
    const tampered = state.slice(0, -2) + "zz";
    expect(verifyOAuthState(tampered)).toBeNull();
  });

  it("rejeita state expirado (>10min)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00Z"));
    const state = signOAuthState("client-y");
    vi.setSystemTime(new Date("2026-07-21T00:11:00Z"));
    expect(verifyOAuthState(state)).toBeNull();
    vi.useRealTimers();
  });

  it("rejeita lixo/formato inválido sem lançar", () => {
    expect(verifyOAuthState("nao-e-um-state-valido")).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
  });
});
