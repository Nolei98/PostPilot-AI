import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto-secrets";

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
