import { z } from "zod";
import type { Role, User } from "@prisma/client";
import { audit, db } from "../db";
import { deleteDocument } from "../storage";
import { MarketError } from "./marketplace";
import { CATEGORY_KEYS } from "@/lib/core/categories";
import { deletionBlockers } from "@/lib/core/safety";

export const TERMS_VERSION = "2026-10";
export const HIDDEN_ADDRESS = "[eliminada]";

export async function signup(phone: string, input: { name: string; role: Role; acceptTerms: boolean }) {
  if (input.role === "ADMIN") throw new MarketError("Rol inválido.");
  if (!input.acceptTerms) throw new MarketError("Debes aceptar los términos y la política de privacidad.");
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.split(" ").length < 2) throw new MarketError("Escribe tu nombre y apellido, como en tu cédula.");
  const existing = await db.user.findUnique({ where: { phone } });
  if (existing) throw new MarketError("Ese celular ya tiene cuenta.");
  return db.user.create({
    data: {
      phone,
      name,
      role: input.role,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
      ...(input.role === "WORKER" ? { worker: { create: {} } } : { client: { create: {} } }),
    },
  });
}

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  line: z.string().trim().min(3).max(120),
  comuna: z.string().trim().min(2).max(60),
  notes: z.string().trim().max(200).default(""),
  lat: z.number().min(-56).max(-17),
  lng: z.number().min(-76).max(-66),
});

// shortcut: la ubicación sale del GPS del teléfono; agregar geocodificación de direcciones cuando haya proveedor.
export async function addAddress(user: User, input: z.infer<typeof addressSchema>) {
  const count = await db.address.count({ where: { userId: user.id } });
  if (count >= 10) throw new MarketError("Máximo 10 direcciones.");
  return db.address.create({ data: { ...input, userId: user.id } });
}

export async function removeAddress(user: User, id: string) {
  const used = await db.booking.count({ where: { addressId: id, status: { notIn: ["SETTLED", "CANCELLED", "EXPIRED"] } } });
  if (used) throw new MarketError("Esa dirección tiene servicios pendientes.");
  const inHistory = await db.booking.count({ where: { addressId: id } });
  // Con historial la fila se conserva para los registros y solo se oculta de la lista.
  if (inHistory) await db.address.updateMany({ where: { id, userId: user.id }, data: { label: HIDDEN_ADDRESS } });
  else await db.address.deleteMany({ where: { id, userId: user.id } });
}

export const workerProfileSchema = z.object({
  categories: z.array(z.enum(CATEGORY_KEYS as [string, ...string[]])).min(1).max(5),
  bio: z.string().trim().max(500),
  hourlyRate: z.number().int().min(3000).max(60000),
  visitFee: z.number().int().min(5000).max(200000),
  radiusKm: z.number().min(1).max(30),
  baseLat: z.number().min(-56).max(-17),
  baseLng: z.number().min(-76).max(-66),
  nightOk: z.boolean(),
  clientGenderPref: z.enum(["ANY", "FEMALE_ONLY"]),
  requireAdultHome: z.boolean(),
});

export async function updateWorkerProfile(user: User, input: z.infer<typeof workerProfileSchema>) {
  await db.workerProfile.update({
    where: { userId: user.id },
    data: { ...input, categories: JSON.stringify(input.categories) },
  });
}

export async function setOnline(user: User, online: boolean, lat?: number, lng?: number) {
  if (online && user.status !== "ACTIVE") throw new MarketError("Completa tus verificaciones para conectarte.");
  await db.workerProfile.update({
    where: { userId: user.id },
    data: online && lat != null && lng != null ? { online, lastLat: lat, lastLng: lng, lastSeenAt: new Date() } : { online },
  });
}

export async function setClientPrefs(user: User, workerGenderPref: "ANY" | "FEMALE_ONLY") {
  await db.clientProfile.update({ where: { userId: user.id }, data: { workerGenderPref } });
}

// Derecho de acceso (Ley 21.719): todo lo que la plataforma sabe de la persona, sin datos de terceros.
export async function exportData(user: User) {
  const [addresses, contacts, bookings, verifications, ratingsGiven, incidents] = await Promise.all([
    db.address.findMany({ where: { userId: user.id } }),
    db.trustedContact.findMany({ where: { userId: user.id } }),
    db.booking.findMany({
      where: { OR: [{ clientId: user.id }, { workerId: user.id }] },
      select: { id: true, category: true, status: true, scheduledAt: true, quotedAmount: true, extrasAmount: true, createdAt: true },
    }),
    db.verification.findMany({ where: { userId: user.id }, select: { kind: true, status: true, createdAt: true, expiresAt: true, rejectReason: true } }),
    db.rating.findMany({ where: { raterId: user.id }, select: { bookingId: true, stars: true, comment: true, createdAt: true } }),
    db.safetyIncident.findMany({ where: { reporterId: user.id }, select: { kind: true, status: true, createdAt: true } }),
  ]);
  const { id, phone, name, rut, gender, role, status, createdAt, termsVersion, termsAcceptedAt } = user;
  return { user: { id, phone, name, rut, gender, role, status, createdAt, termsVersion, termsAcceptedAt }, addresses, contacts, bookings, verifications, ratingsGiven, incidents };
}

export async function deleteAccount(user: User) {
  const [last, openBookings, openIncidents] = await Promise.all([
    db.booking.findFirst({
      where: { OR: [{ clientId: user.id }, { workerId: user.id }], completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
    }),
    db.booking.count({
      where: { OR: [{ clientId: user.id }, { workerId: user.id }], status: { in: ["REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS", "COMPLETED", "DISPUTED"] } },
    }),
    db.safetyIncident.count({ where: { booking: { OR: [{ clientId: user.id }, { workerId: user.id }] }, status: { not: "RESOLVED" } } }),
  ]);
  const blockers = deletionBlockers(
    { lastServiceAt: last?.completedAt ?? null, openBookings, openIncidents, suspended: user.status === "SUSPENDED" },
    new Date(),
  );
  if (blockers.length) return { ok: false as const, blockers };

  const docs = await db.document.findMany({ where: { ownerId: user.id }, select: { id: true } });
  for (const d of docs) await deleteDocument(d.id);
  await db.$transaction([
    db.trustedContact.deleteMany({ where: { userId: user.id } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.message.updateMany({ where: { senderId: user.id }, data: { body: "[mensaje eliminado]" } }),
    db.address.updateMany({ where: { userId: user.id }, data: { line: "[eliminada]", notes: "", label: "[eliminada]" } }),
    // Se anonimiza en vez de borrar la fila: los servicios e incidentes de la otra parte siguen existiendo.
    db.user.update({
      where: { id: user.id },
      data: { status: "DELETED", name: "Usuario eliminado", phone: `deleted:${user.id}`, rut: null, photoDocId: null, deletionRequestedAt: new Date() },
    }),
  ]);
  await audit(user.id, "account_deleted", "User", user.id);
  return { ok: true as const, blockers: [] };
}
