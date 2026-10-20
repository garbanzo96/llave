// Cifrado de la demo. shortcut: hash no criptográfico y sin cifrado de archivos; la demo no guarda datos reales.
// La app real usa src/server/crypto.ts (SHA-256, HMAC y AES-256-GCM).
function fnv(input: string, seed: number) {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const sha256 = (v: string) => [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1].map((s) => fnv(String(v), s)).join("");
export const hmac = (v: string) => sha256("llave:" + v);
export const safeEqualHex = (a: string, b: string) => a === b;

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const randomDigits = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => String(b % 10)).join("");
export const encrypt = <T>(x: T) => x;
export const decrypt = <T>(x: T) => x;
export const sealJson = (value: unknown) => btoa(JSON.stringify(value));
export function openJson<T>(sealed: string): T | null {
  try {
    return JSON.parse(atob(sealed)) as T;
  } catch {
    return null;
  }
}
