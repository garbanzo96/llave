import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role, User } from "@prisma/client";
import { db } from "./db";
import { hmac, openJson, randomDigits, randomToken, safeEqualHex, sealJson, sha256 } from "./crypto";
import { sendSms } from "./notify";
import { normalizePhone } from "@/lib/core/safety";

const PROD = process.env.NODE_ENV === "production";
const SESSION_COOKIE = PROD ? "__Host-llave_s" : "llave_s";
const PHONE_COOKIE = PROD ? "__Host-llave_p" : "llave_p";
const SESSION_DAYS = 30;
const OTP_TTL_MS = 5 * 60_000;
const OTP_WINDOW_MS = 15 * 60_000;
const OTP_MAX_PER_WINDOW = 3;
const OTP_MAX_ATTEMPTS = 5;

const cookieBase = { httpOnly: true, secure: PROD, sameSite: "lax" as const, path: "/" };

export class AuthError extends Error {}

// Límite guardado en la base (no en memoria) para que funcione con varias instancias.
export async function requestOtp(rawPhone: string): Promise<{ phone: string; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError("Ingresa un celular chileno válido (9 dígitos).");
  const recent = await db.otpChallenge.count({ where: { phone, createdAt: { gt: new Date(Date.now() - OTP_WINDOW_MS) } } });
  if (recent >= OTP_MAX_PER_WINDOW) throw new AuthError("Demasiados códigos pedidos. Intenta en 15 minutos.");
  const code = randomDigits(6);
  await db.otpChallenge.create({ data: { phone, codeHash: hmac(`${phone}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
  await sendSms(phone, `Tu código Llave es ${code}. No lo compartas con nadie, ni siquiera con quien vaya a tu casa.`);
  return PROD ? { phone } : { phone, devCode: code };
}

export async function verifyOtp(rawPhone: string, code: string): Promise<"LOGGED_IN" | "SIGNUP"> {
  const phone = normalizePhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(code)) throw new AuthError("Código inválido.");
  const ch = await db.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!ch) throw new AuthError("El código expiró. Pide uno nuevo.");
  if (ch.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError("Demasiados intentos. Pide un código nuevo.");
  if (!safeEqualHex(ch.codeHash, hmac(`${phone}:${code}`))) {
    await db.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    throw new AuthError("Código incorrecto.");
  }
  await db.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });

  const user = await db.user.findUnique({ where: { phone } });
  if (user && user.status !== "DELETED") {
    await createSession(user.id);
    return "LOGGED_IN";
  }
  // Teléfono verificado pero sin cuenta: se guarda sellado (cifrado y autenticado) por 15 minutos.
  (await cookies()).set(PHONE_COOKIE, sealJson({ phone, exp: Date.now() + OTP_WINDOW_MS }), { ...cookieBase, maxAge: 900 });
  return "SIGNUP";
}

export async function verifiedPhone(): Promise<string | null> {
  const raw = (await cookies()).get(PHONE_COOKIE)?.value;
  const v = raw ? openJson<{ phone: string; exp: number }>(raw) : null;
  return v && v.exp > Date.now() ? v.phone : null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_DAYS * 86_400 });
  jar.delete(PHONE_COOKIE);
}

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || s.user.status === "DELETED") return null;
  return s.user;
});

export async function requireUser(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/entrar");
  if (roles.length && !roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}

// Para acciones del servidor: lanza en vez de redirigir.
export async function actor(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError("Sesión expirada.");
  if (roles.length && !roles.includes(u.role)) throw new AuthError("No autorizado.");
  if (u.status === "SUSPENDED") throw new AuthError("Tu cuenta está suspendida. Escribe a soporte.");
  return u;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export function homeFor(role: Role): string {
  return role === "ADMIN" ? "/central" : role === "WORKER" ? "/t" : "/c";
}
