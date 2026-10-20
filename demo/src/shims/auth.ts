// Sesión de la demo: vive en este navegador. Mismas firmas que src/server/auth.ts.
import type { Role, User } from "@prisma/client";
import { db } from "@/server/db";
import { sendSms } from "@/server/notify";
import { normalizePhone } from "@/lib/core/safety";
import { RedirectSignal } from "./navigation";

const SESSION = "llave-demo:session";
const codes = new Map<string, string>();
let pendingPhone: string | null = null;

export class AuthError extends Error {}

const read = () => {
  try {
    return localStorage.getItem(SESSION);
  } catch {
    return null;
  }
};

export async function requestOtp(rawPhone: string): Promise<{ phone: string; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AuthError("Ingresa un celular chileno válido (9 dígitos).");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  codes.set(phone, code);
  await sendSms(phone, `Tu código Llave es ${code}.`);
  return { phone, devCode: code };
}

export async function verifyOtp(rawPhone: string, code: string): Promise<Role | "SIGNUP"> {
  const phone = normalizePhone(rawPhone);
  if (!phone || codes.get(phone) !== code) throw new AuthError("Código incorrecto.");
  codes.delete(phone);
  const user = await db.user.findUnique({ where: { phone } });
  if (user && user.status !== "DELETED") {
    await createSession(user.id);
    return user.role;
  }
  pendingPhone = phone;
  return "SIGNUP";
}

export async function verifiedPhone() {
  return pendingPhone;
}

export async function createSession(userId: string) {
  localStorage.setItem(SESSION, userId);
  pendingPhone = null;
}

export async function currentUser(): Promise<User | null> {
  const id = read();
  if (!id) return null;
  const u = await db.user.findUnique({ where: { id } });
  return u && u.status !== "DELETED" ? u : null;
}

export async function requireUser(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) throw new RedirectSignal("/entrar");
  if (roles.length && !roles.includes(u.role)) throw new RedirectSignal(homeFor(u.role));
  return u;
}

export async function actor(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError("Sesión expirada.");
  if (roles.length && !roles.includes(u.role)) throw new AuthError("No autorizado.");
  if (u.status === "SUSPENDED") throw new AuthError("Tu cuenta está suspendida. Escribe a soporte.");
  return u;
}

export async function logout() {
  localStorage.removeItem(SESSION);
}

export function homeFor(role: Role): string {
  return role === "ADMIN" ? "/central" : role === "WORKER" ? "/t" : "/c";
}
