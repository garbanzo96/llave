export const MAX_PIN_ATTEMPTS = 5;
export const MAX_TRUSTED_CONTACTS = 5;
export const WELLBEING_GRACE_MS = 30 * 60_000;
export const WELLBEING_ACK_MS = 10 * 60_000;
export const LATE_ARRIVAL_MS = 45 * 60_000;
export const DELETION_WAIT_MS = 15 * 24 * 3_600_000;
export const RATING_REVEAL_MS = 72 * 3_600_000;

export type PinResult = { ok: boolean; attempts: number; locked: boolean };

// Comparación en tiempo constante para no filtrar dígitos por tiempo de respuesta.
export function checkPin(expected: string, input: string, attempts: number): PinResult {
  if (attempts >= MAX_PIN_ATTEMPTS) return { ok: false, attempts, locked: true };
  const a = expected.padEnd(8, "x");
  const b = input.trim().padEnd(8, "x").slice(0, 8);
  let diff = expected.length ^ input.trim().length;
  for (let i = 0; i < 8; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  const ok = diff === 0;
  const next = ok ? attempts : attempts + 1;
  return { ok, attempts: next, locked: !ok && next >= MAX_PIN_ATTEMPTS };
}

// Teléfonos, correos y enlaces se ocultan en el chat: protege a ambas partes de acoso fuera de la app
// y mantiene la conversación dentro del registro que respalda una denuncia.
const PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g,
  /(?:\+?56[\s.-]?)?(?:\d[\s.-]?){8,}\d/g,
  /\bhttps?:\/\/\S+|\bwww\.\S+/gi,
  /\b(?:wsp|whatsapp|wasap|telegram|instagram|insta)\b/gi,
];

export function redactContactInfo(text: string): { text: string; redacted: boolean } {
  let out = text;
  for (const p of PATTERNS) out = out.replace(p, "[oculto]");
  return { text: out, redacted: out !== text };
}

export type WellbeingInput = {
  id: string;
  status: string;
  scheduledAt: Date;
  startedAt: Date | null;
  arrivedAt: Date | null;
  estimatedMinutes: number;
  wellbeingPromptAt: Date | null;
  wellbeingAckAt: Date | null;
};

export type WellbeingAction = { id: string; kind: "PROMPT" | "ESCALATE" | "LATE_ARRIVAL" };

// Versión doméstica de RideCheck: si el servicio se alarga más allá de lo estimado, se pregunta a ambos;
// sin respuesta, la central recibe un incidente.
export function wellbeingSweep(items: WellbeingInput[], now: Date): WellbeingAction[] {
  const out: WellbeingAction[] = [];
  const t = now.getTime();
  for (const b of items) {
    if (b.status === "IN_PROGRESS" && b.startedAt) {
      const due = b.startedAt.getTime() + b.estimatedMinutes * 60_000 + WELLBEING_GRACE_MS;
      if (!b.wellbeingPromptAt && t > due) out.push({ id: b.id, kind: "PROMPT" });
      else if (b.wellbeingPromptAt && !b.wellbeingAckAt && t > b.wellbeingPromptAt.getTime() + WELLBEING_ACK_MS)
        out.push({ id: b.id, kind: "ESCALATE" });
    }
    if ((b.status === "ACCEPTED" || b.status === "EN_ROUTE") && !b.arrivedAt && t > b.scheduledAt.getTime() + LATE_ARRIVAL_MS)
      out.push({ id: b.id, kind: "LATE_ARRIVAL" });
  }
  return out;
}

export type DeletionCheck = { lastServiceAt: Date | null; openBookings: number; openIncidents: number; suspended: boolean };

export function deletionBlockers(c: DeletionCheck, now: Date): string[] {
  const out: string[] = [];
  if (c.suspended) out.push("La cuenta está suspendida por una investigación.");
  if (c.openBookings > 0) out.push("Tienes servicios activos o en revisión.");
  if (c.openIncidents > 0) out.push("Hay un caso de seguridad abierto.");
  if (c.lastServiceAt && now.getTime() - c.lastServiceAt.getTime() < DELETION_WAIT_MS)
    out.push("Deben pasar 15 días desde tu último servicio, por si se abre un reclamo.");
  return out;
}

// Calificación ciega: nadie ve la nota del otro hasta que ambos califican o pasan 72 horas.
export function ratingsVisible(ratingsCount: number, completedAt: Date | null, now: Date): boolean {
  if (ratingsCount >= 2) return true;
  return !!completedAt && now.getTime() - completedAt.getTime() > RATING_REVEAL_MS;
}

// Chile: RUT con dígito verificador módulo 11.
export function validRut(rut: string): boolean {
  const clean = rut.replace(/[.\-\s]/g, "").toUpperCase();
  if (!/^\d{7,8}[\dK]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  const dv = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return dv === clean.slice(-1);
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local = digits.startsWith("56") ? digits.slice(2) : digits;
  return /^9\d{8}$/.test(local) ? `+56${local}` : null;
}

export const EMERGENCY_NUMBERS = [
  { label: "Carabineros", number: "133" },
  { label: "SAMU", number: "131" },
  { label: "Bomberos", number: "132" },
  { label: "PDI", number: "134" },
  { label: "Fono Mujer (SernamEG)", number: "1455" },
];
