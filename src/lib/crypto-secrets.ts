// ============================================================
// Cifragem em repouso de segredos por tenant (Sprint C: token de
// acesso do Graph API guardado em social_connections). Primeiro
// segredo por cliente persistido no banco — até aqui todo segredo
// do projeto era env var global (Stripe, Telegram, providers de IA).
// AES-256-GCM com a lib `crypto` nativa do Node — sem dependência nova.
// ============================================================
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function keyFromEnv(): Buffer {
  const raw = process.env.SECRETS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SECRETS_ENCRYPTION_KEY ausente — gere com `openssl rand -base64 32` e adicione no .env.local"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY precisa decodificar para 32 bytes (base64 de 32 bytes aleatórios)");
  }
  return key;
}

/** Cifra `plain`; retorna um payload base64 único (iv + tag + ciphertext). */
export function encryptSecret(plain: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decifra um payload gerado por `encryptSecret`. Lança se a chave/tag não baterem. */
export function decryptSecret(payload: string): string {
  const key = keyFromEnv();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ciphertext = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10min — tempo de sobra pro dono completar o diálogo OAuth

/**
 * Assina um `clientId` pro parâmetro `state` do OAuth (CSRF sem precisar
 * de tabela de sessão nova): payload = clientId + timestamp, HMAC-SHA256
 * com a mesma chave mestra de SECRETS_ENCRYPTION_KEY.
 */
export function signOAuthState(clientId: string): string {
  const key = keyFromEnv();
  const payload = `${clientId}.${Date.now()}`;
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

/** Valida um `state` gerado por `signOAuthState`; retorna o clientId ou `null` se inválido/expirado. */
export function verifyOAuthState(state: string): string | null {
  const key = keyFromEnv();
  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;
  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const expectedSig = createHmac("sha256", key).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [clientId, tsRaw] = payload.split(".");
  const ts = Number(tsRaw);
  if (!clientId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) return null;
  return clientId;
}
