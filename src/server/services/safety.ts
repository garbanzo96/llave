import type { User } from "@prisma/client";
import { audit, db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { sendSms } from "../notify";
import { MarketError, participant, publicName } from "./marketplace";
import { MAX_TRUSTED_CONTACTS, normalizePhone } from "@/lib/core/safety";
import { STATUS_LABEL, type Status } from "@/lib/core/booking-machine";

const SHARE_TTL_MS = 12 * 3_600_000;
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export async function addTrustedContact(user: User, name: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new MarketError("Celular inválido.");
  const n = name.trim().slice(0, 60);
  if (!n) throw new MarketError("Falta el nombre.");
  const count = await db.trustedContact.count({ where: { userId: user.id } });
  if (count >= MAX_TRUSTED_CONTACTS) throw new MarketError(`Máximo ${MAX_TRUSTED_CONTACTS} contactos de confianza.`);
  await db.trustedContact.create({ data: { userId: user.id, name: n, phone } });
}

export async function removeTrustedContact(user: User, id: string) {
  await db.trustedContact.deleteMany({ where: { id, userId: user.id } });
}

export async function createShareLink(user: User, bookingId: string, notifyContacts: boolean): Promise<string> {
  await participant(user, bookingId);
  const token = randomToken();
  await db.booking.update({
    where: { id: bookingId },
    data: { shareTokenHash: sha256(token), shareExpiresAt: new Date(Date.now() + SHARE_TTL_MS) },
  });
  const url = `${appUrl()}/s/${token}`;
  if (notifyContacts) {
    const contacts = await db.trustedContact.findMany({ where: { userId: user.id } });
    for (const c of contacts) await sendSms(c.phone, `${publicName(user.name)} compartió contigo un servicio en Llave: ${url}`);
  }
  return url;
}

export async function sharedView(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const b = await db.booking.findUnique({
    where: { shareTokenHash: sha256(token) },
    include: { client: true, worker: true, address: true, pings: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!b || !b.shareExpiresAt || b.shareExpiresAt < new Date()) return null;
  const closed = ["SETTLED", "CANCELLED", "EXPIRED"].includes(b.status);
  return {
    status: STATUS_LABEL[b.status as Status],
    closed,
    category: b.category,
    scheduledAt: b.scheduledAt,
    client: publicName(b.client.name),
    worker: b.worker ? publicName(b.worker.name) : null,
    workerPhotoDocId: b.worker?.photoDocId ?? null,
    address: closed ? null : `${b.address.line}, ${b.address.comuna}`,
    lastPing: closed ? null : b.pings[0] ?? null,
  };
}

// Botón de emergencia. Silencioso por defecto: quien está dentro de una casa ajena no siempre puede llamar.
export async function sos(user: User, input: { bookingId?: string; lat?: number; lng?: number; silent: boolean }) {
  if (input.bookingId) await participant(user, input.bookingId);
  const incident = await db.safetyIncident.create({
    data: {
      bookingId: input.bookingId,
      reporterId: user.id,
      kind: "SOS",
      silent: input.silent,
      lat: input.lat,
      lng: input.lng,
      details: input.silent ? "Alerta silenciosa" : "Alerta",
    },
  });
  await audit(user.id, "sos", "SafetyIncident", incident.id);
  const contacts = await db.trustedContact.findMany({ where: { userId: user.id } });
  if (contacts.length) {
    const link = input.bookingId ? await createShareLink(user, input.bookingId, false) : null;
    const where = input.lat != null && input.lng != null ? ` Ubicación: https://maps.google.com/?q=${input.lat},${input.lng}` : "";
    for (const c of contacts)
      await sendSms(c.phone, `ALERTA de ${publicName(user.name)} en Llave.${where}${link ? ` Seguimiento: ${link}` : ""} La central ya fue avisada.`);
  }
  return incident.id;
}

export async function markSafe(user: User, incidentId: string) {
  const inc = await db.safetyIncident.findFirst({ where: { id: incidentId, reporterId: user.id } });
  if (!inc) throw new MarketError("Alerta no encontrada.");
  // La alerta no se cierra sola: la central confirma con una llamada (alguien pudo ser forzado a marcar).
  await db.safetyIncident.update({
    where: { id: inc.id },
    data: { details: `${inc.details}\nLa persona marcó "Estoy a salvo" a las ${new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" })}.` },
  });
}

export async function ackWellbeing(user: User, bookingId: string) {
  await participant(user, bookingId);
  await db.booking.update({ where: { id: bookingId }, data: { wellbeingAckAt: new Date() } });
}

export async function openIncidentFor(user: User) {
  return db.safetyIncident.findFirst({
    where: { reporterId: user.id, kind: "SOS", status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  });
}
