import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

function dataKey(): Buffer {
  const k = process.env.DATA_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(k)) throw new Error("DATA_KEY debe ser 32 bytes en hex (openssl rand -hex 32)");
  return Buffer.from(k, "hex");
}

export const sha256 = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");

// HMAC con la llave del servidor: un código de 6 dígitos con hash simple se revierte por fuerza bruta si se filtra la base.
export const hmac = (v: string) => createHmac("sha256", dataKey()).update(v).digest("hex");

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export const randomToken = () => randomBytes(32).toString("base64url");
export const randomDigits = (n: number) => Array.from({ length: n }, () => randomInt(10)).join("");

// AES-256-GCM: iv(12) | tag(16) | datos. GCM además detecta manipulación.
export function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", dataKey(), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

export function decrypt(blob: Buffer): Buffer {
  const d = createDecipheriv("aes-256-gcm", dataKey(), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export function sealJson(value: unknown): string {
  return encrypt(Buffer.from(JSON.stringify(value))).toString("base64url");
}

export function openJson<T>(sealed: string): T | null {
  try {
    return JSON.parse(decrypt(Buffer.from(sealed, "base64url")).toString()) as T;
  } catch {
    return null;
  }
}
