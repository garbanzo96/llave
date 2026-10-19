import { ZodError } from "zod";
import { AuthError } from "./auth";
import { UploadError } from "./storage";
import { MarketError } from "./services/marketplace";
import { TransitionError } from "@/lib/core/booking-machine";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

// Solo los errores pensados para el usuario muestran su mensaje; el resto se registra y se responde genérico.
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof MarketError || e instanceof AuthError || e instanceof UploadError || e instanceof TransitionError)
      return { ok: false, error: e.message };
    if (e instanceof ZodError) return { ok: false, error: `Revisa el campo «${e.issues[0]?.path.join(".") || "formulario"}».` };
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return { ok: false, error: "Algo falló. Intenta de nuevo en un momento." };
  }
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "");
export const num = (f: FormData, k: string) => Number(f.get(k));
export const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
export const file = (f: FormData, k: string) => {
  const v = f.get(k);
  return v instanceof File && v.size > 0 ? v : null;
};
