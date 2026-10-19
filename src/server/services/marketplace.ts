import { z } from "zod";
import type { Booking, Prisma, User } from "@prisma/client";
import { audit, db, parseJson } from "../db";
import { randomDigits } from "../crypto";
import { sendSms } from "../notify";
import { purgeExpiredDocuments, saveUpload } from "../storage";
import * as pay from "../payments";
import { CATEGORIES, isCategory, type Category, type License } from "@/lib/core/categories";
import { withinArrivalRadius } from "@/lib/core/geo";
import { cancellationFee, commissionRate, quote } from "@/lib/core/pricing";
import {
  bayesianRating,
  match,
  nextUrgentTarget,
  URGENT_OFFER_MS,
  type Candidate,
  type Household,
  type MatchRequest,
} from "@/lib/core/matching";
import { ACTIVE_STATUSES, DISPUTE_WINDOW_MS, transition, type Status } from "@/lib/core/booking-machine";
import { checkPin, ratingsVisible, redactContactInfo, wellbeingSweep } from "@/lib/core/safety";

export class MarketError extends Error {}

export const requestSchema = z.object({
  category: z.string().refine(isCategory, "Servicio inválido"),
  urgent: z.boolean(),
  addressId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  minutes: z.number().int().min(30).max(600),
  description: z.string().trim().max(1000).default(""),
  household: z.object({ adultsHome: z.boolean(), minorsHome: z.boolean(), pets: z.boolean() }),
  genderPref: z.enum(["ANY", "FEMALE_ONLY"]),
});
export type RequestInput = z.infer<typeof requestSchema>;

const HOUR = 3_600_000;

// shortcut: carga a todos los trabajadores activos y filtra en memoria; con miles de trabajadores, prefiltrar por celda geográfica (PostGIS o H3).
async function loadCandidates(clientId: string, at: Date, minutes: number, urgent: boolean): Promise<Candidate[]> {
  const users = await db.user.findMany({
    where: { role: "WORKER", status: "ACTIVE", worker: { isNot: null } },
    include: { worker: true, verifications: { where: { status: "APPROVED" } } },
  });
  const ids = users.map((u) => u.id);
  const [blocks, active, history] = await Promise.all([
    db.block.findMany({ where: { OR: [{ blockerId: clientId }, { blockedId: clientId }] } }),
    db.booking.findMany({
      where: { workerId: { in: ids }, status: { in: ACTIVE_STATUSES } },
      select: { workerId: true, status: true, scheduledAt: true, estimatedMinutes: true },
    }),
    db.booking.groupBy({ by: ["workerId"], where: { clientId, workerId: { in: ids }, status: "SETTLED" }, _count: true }),
  ]);
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  const together = new Map(history.map((h) => [h.workerId, h._count]));
  const start = at.getTime() - HOUR;
  const end = at.getTime() + minutes * 60_000 + HOUR;

  return users.map((u) => {
    const w = u.worker!;
    const valid = (kind: string) => u.verifications.some((v) => v.kind === kind && (!v.expiresAt || v.expiresAt > at));
    const licenses = u.verifications
      .filter((v) => v.kind === "SEC_LICENSE" && (!v.expiresAt || v.expiresAt > at))
      .map((v) => parseJson<{ license?: License }>(v.data, {}).license)
      .filter((l): l is License => !!l);
    const busy = active.some((b) => {
      if (b.workerId !== u.id) return false;
      if (urgent) return b.status !== "ACCEPTED" || b.scheduledAt.getTime() < at.getTime() + 3 * HOUR;
      const bs = b.scheduledAt.getTime();
      return bs < end && bs + b.estimatedMinutes * 60_000 > start;
    });
    return {
      id: u.id,
      active: u.status === "ACTIVE",
      gender: u.gender,
      categories: parseJson<Category[]>(w.categories, []),
      identityOk: valid("IDENTITY"),
      criminalRecordOk: valid("CRIMINAL_RECORD"),
      minorsRegistryOk: valid("MINORS_REGISTRY"),
      licenses,
      base: w.baseLat != null && w.baseLng != null ? { lat: w.baseLat, lng: w.baseLng } : null,
      radiusKm: w.radiusKm,
      online: w.online,
      last: w.lastLat != null && w.lastLng != null ? { lat: w.lastLat, lng: w.lastLng } : null,
      lastSeenAt: w.lastSeenAt,
      nightOk: w.nightOk,
      clientGenderPref: w.clientGenderPref,
      requireAdultHome: w.requireAdultHome,
      busy,
      blocked: blocked.has(u.id),
      completedCount: u.completedCount,
      ratingSum: u.ratingSum,
      ratingCount: u.ratingCount,
      cancelCount: w.cancelCount,
      lateCount: w.lateCount,
      offersSeen: w.offersSeen,
      offersAccepted: w.offersAccepted,
      completedWithClient: together.get(u.id) ?? 0,
    };
  });
}

async function buildRequest(client: User, input: RequestInput): Promise<{ req: MatchRequest; at: Date }> {
  const category = input.category as Category;
  if (input.urgent && !CATEGORIES[category].urgentAllowed) throw new MarketError("Este servicio no se ofrece como urgencia.");
  const address = await db.address.findFirst({ where: { id: input.addressId, userId: client.id } });
  if (!address) throw new MarketError("Dirección no encontrada.");
  const now = Date.now();
  const at = input.urgent ? new Date(now) : input.scheduledAt;
  if (!input.urgent && (at.getTime() < now + HOUR || at.getTime() > now + 60 * 24 * HOUR))
    throw new MarketError("Agenda con al menos 1 hora de anticipación y hasta 60 días.");
  return {
    at,
    req: {
      category,
      urgent: input.urgent,
      location: { lat: address.lat, lng: address.lng },
      scheduledAt: at,
      genderPref: input.genderPref,
      household: input.household,
      client: { id: client.id, gender: client.gender, completedCount: client.completedCount },
    },
  };
}

function rates(c: { id: string }, profiles: Map<string, { hourlyRate: number; visitFee: number }>) {
  return profiles.get(c.id) ?? { hourlyRate: 0, visitFee: 0 };
}

export async function searchWorkers(client: User, input: RequestInput) {
  const { req, at } = await buildRequest(client, input);
  const ranked = match(req, await loadCandidates(client.id, at, input.minutes, input.urgent), new Date()).ranked.slice(0, 5);
  const users = await db.user.findMany({ where: { id: { in: ranked.map((r) => r.candidate.id) } }, include: { worker: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return ranked.map(({ candidate: c, score }) => {
    const u = byId.get(c.id)!;
    return {
      id: c.id,
      name: publicName(u.name),
      photoDocId: u.photoDocId,
      bio: u.worker?.bio ?? "",
      rating: Math.round(bayesianRating(c.ratingSum, c.ratingCount) * 10) / 10,
      ratingCount: c.ratingCount,
      completedCount: c.completedCount,
      licenses: c.licenses,
      favorite: c.completedWithClient > 0,
      distanceKm: Math.round(score.distanceKm * 10) / 10,
      price: quote(req.category, req.urgent, input.minutes, u.worker!),
    };
  });
}

export function publicName(full: string): string {
  const [first, last] = full.trim().split(/\s+/);
  return last ? `${first} ${last[0]}.` : first;
}

export async function requestBooking(client: User, input: RequestInput, workerId?: string) {
  if (client.status !== "ACTIVE") throw new MarketError("Verifica tu identidad antes de pedir un servicio.");
  const { req, at } = await buildRequest(client, input);
  const ranked = match(req, await loadCandidates(client.id, at, input.minutes, input.urgent), new Date()).ranked;
  const profiles = new Map(
    (await db.workerProfile.findMany({ where: { userId: { in: ranked.map((r) => r.candidate.id) } } })).map((p) => [p.userId, p]),
  );
  const base = {
    clientId: client.id,
    category: req.category,
    mode: input.urgent ? ("URGENT" as const) : ("SCHEDULED" as const),
    addressId: input.addressId,
    scheduledAt: at,
    estimatedMinutes: input.minutes,
    description: input.description,
    household: JSON.stringify(input.household),
    genderPref: input.genderPref,
    arrivalPin: randomDigits(4),
  };

  if (!input.urgent) {
    // Se recalcula el match en el servidor: el cliente no puede forzar a alguien que no pasa los filtros.
    const chosen = ranked.find((r) => r.candidate.id === workerId);
    if (!chosen) throw new MarketError("Esa persona ya no está disponible. Busca de nuevo.");
    const price = quote(req.category, false, input.minutes, rates(chosen.candidate, profiles));
    const booking = await db.$transaction(async (tx) => {
      const b = await tx.booking.create({ data: { ...base, quotedAmount: price.total } });
      await pay.authorize(tx, b.id, price.total);
      const expiresAt = new Date(Math.min(at.getTime() - HOUR, Date.now() + 12 * HOUR));
      await tx.offer.create({ data: { bookingId: b.id, workerId: chosen.candidate.id, rank: 0, score: chosen.score.total, expiresAt } });
      await tx.workerProfile.update({ where: { userId: chosen.candidate.id }, data: { offersSeen: { increment: 1 } } });
      return b;
    });
    await notifyUser(chosen.candidate.id, "Tienes una nueva solicitud de servicio en Llave.");
    return booking;
  }

  if (!ranked.length) throw new MarketError("No hay personas verificadas disponibles cerca en este momento.");
  // Se autoriza el máximo posible entre los candidatos; al aceptar se ajusta al precio real.
  const max = Math.max(...ranked.slice(0, 5).map((r) => quote(req.category, true, input.minutes, rates(r.candidate, profiles)).total));
  const booking = await db.$transaction(async (tx) => {
    const b = await tx.booking.create({ data: { ...base, quotedAmount: max } });
    await pay.authorize(tx, b.id, max);
    return b;
  });
  await dispatchUrgent(booking.id);
  return booking;
}

async function rebuildRequest(b: Booking & { client: User }): Promise<MatchRequest> {
  const address = await db.address.findUniqueOrThrow({ where: { id: b.addressId } });
  return {
    category: b.category as Category,
    urgent: b.mode === "URGENT",
    location: { lat: address.lat, lng: address.lng },
    scheduledAt: b.mode === "URGENT" ? new Date() : b.scheduledAt,
    genderPref: b.genderPref,
    household: parseJson<Household>(b.household, { adultsHome: true, minorsHome: false, pets: false }),
    client: { id: b.clientId, gender: b.client.gender, completedCount: b.client.completedCount },
  };
}

export async function dispatchUrgent(bookingId: string) {
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { client: true, offers: true } });
  if (b.status !== "REQUESTED" || b.mode !== "URGENT") return;
  if (b.offers.some((o) => o.status === "PENDING" && o.expiresAt > new Date())) return;
  const req = await rebuildRequest(b);
  const ranked = match(req, await loadCandidates(b.clientId, req.scheduledAt, b.estimatedMinutes, true), new Date()).ranked;
  const next = nextUrgentTarget(ranked, new Set(b.offers.map((o) => o.workerId)));
  if (!next) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { status: transition(b.status, "EXPIRE", "SYSTEM") } });
      await pay.voidOrCharge(tx, b.id, 0);
    });
    await notifyUser(b.clientId, "No encontramos a nadie disponible para tu urgencia. No se te cobró nada.");
    return;
  }
  await db.$transaction([
    db.offer.create({
      data: { bookingId: b.id, workerId: next.candidate.id, rank: b.offers.length, score: next.score.total, expiresAt: new Date(Date.now() + URGENT_OFFER_MS) },
    }),
    db.workerProfile.update({ where: { userId: next.candidate.id }, data: { offersSeen: { increment: 1 } } }),
  ]);
}

export async function respondOffer(worker: User, offerId: string, accept: boolean) {
  const offer = await db.offer.findFirst({ where: { id: offerId, workerId: worker.id }, include: { booking: { include: { client: true } } } });
  if (!offer || offer.status !== "PENDING") throw new MarketError("Esta solicitud ya no está disponible.");
  if (offer.expiresAt < new Date()) throw new MarketError("La solicitud expiró.");
  const b = offer.booking;

  if (!accept) {
    await db.offer.update({ where: { id: offer.id }, data: { status: "DECLINED" } });
    if (b.mode === "URGENT") await dispatchUrgent(b.id);
    else await notifyUser(b.clientId, "La persona que elegiste no puede ir. Elige a otra en la app.");
    return;
  }

  // Las credenciales pueden haber vencido desde la oferta: se vuelve a filtrar al aceptar.
  const req = await rebuildRequest(b);
  const mine = (await loadCandidates(b.clientId, req.scheduledAt, b.estimatedMinutes, req.urgent)).filter((c) => c.id === worker.id);
  if (!match(req, mine, new Date()).ranked.length) throw new MarketError("Tus verificaciones o disponibilidad no cumplen para este servicio.");
  const profile = await db.workerProfile.findUniqueOrThrow({ where: { userId: worker.id } });
  const price = quote(req.category, req.urgent, b.estimatedMinutes, profile);
  const together = await db.booking.count({ where: { clientId: b.clientId, workerId: worker.id, status: "SETTLED" } });

  await db.$transaction(async (tx) => {
    // updateMany con condición de estado: si dos personas aceptan a la vez, solo una gana.
    const won = await tx.booking.updateMany({
      where: { id: b.id, status: "REQUESTED" },
      data: {
        status: transition(b.status, "ACCEPT", "WORKER"),
        workerId: worker.id,
        acceptedAt: new Date(),
        quotedAmount: price.total,
        commissionRate: commissionRate(together),
      },
    });
    if (won.count !== 1) throw new MarketError("Otra persona ya tomó este servicio.");
    await tx.offer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
    await tx.offer.updateMany({ where: { bookingId: b.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    await tx.workerProfile.update({ where: { userId: worker.id }, data: { offersAccepted: { increment: 1 } } });
    await pay.adjustAuthorization(tx, b.id, price.total);
  });
  await notifyUser(b.clientId, `${publicName(worker.name)} aceptó tu servicio. Revisa su perfil en la app.`);
}

type Participant = { booking: Booking; role: "CLIENT" | "WORKER" };

export async function participant(user: User, bookingId: string): Promise<Participant> {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (booking?.clientId === user.id) return { booking, role: "CLIENT" };
  if (booking?.workerId === user.id) return { booking, role: "WORKER" };
  throw new MarketError("Servicio no encontrado.");
}

async function asWorker(user: User, bookingId: string) {
  const p = await participant(user, bookingId);
  if (p.role !== "WORKER") throw new MarketError("Solo la persona asignada puede hacer esto.");
  return p.booking;
}

async function asClient(user: User, bookingId: string) {
  const p = await participant(user, bookingId);
  if (p.role !== "CLIENT") throw new MarketError("Solo el cliente puede hacer esto.");
  return p.booking;
}

async function setStatus(b: Booking, status: Status, extra: Prisma.BookingUpdateInput = {}) {
  // Condición sobre el estado previo para no pisar una transición concurrente.
  const r = await db.booking.updateMany({ where: { id: b.id, status: b.status }, data: { ...(extra as object), status } });
  if (r.count !== 1) throw new MarketError("El servicio cambió de estado. Recarga la página.");
}

export async function startRoute(worker: User, bookingId: string) {
  const b = await asWorker(worker, bookingId);
  await setStatus(b, transition(b.status, "START_ROUTE", "WORKER"));
  await notifyUser(b.clientId, "Tu servicio va en camino.");
}

export async function pingLocation(user: User, lat: number, lng: number, bookingId?: string) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new MarketError("Ubicación inválida.");
  if (user.role === "WORKER") {
    await db.workerProfile.update({ where: { userId: user.id }, data: { lastLat: lat, lastLng: lng, lastSeenAt: new Date() } });
  }
  if (bookingId) {
    const { booking } = await participant(user, bookingId);
    if (["EN_ROUTE", "ARRIVED", "IN_PROGRESS"].includes(booking.status)) {
      await db.locationPing.create({ data: { bookingId, userId: user.id, lat, lng } });
    }
  }
}

export async function arrive(worker: User, bookingId: string, lat: number, lng: number) {
  const b = await asWorker(worker, bookingId);
  const home = await db.address.findUniqueOrThrow({ where: { id: b.addressId } });
  const inRadius = withinArrivalRadius({ lat, lng }, home);
  const next = transition(b.status, "ARRIVE", "WORKER", { arrivedInRadius: inRadius });
  await setStatus(b, next, { arrivedAt: new Date() });
  await db.locationPing.create({ data: { bookingId, userId: worker.id, lat, lng } });
  if (b.mode === "SCHEDULED" && Date.now() > b.scheduledAt.getTime() + 15 * 60_000) {
    await db.workerProfile.update({ where: { userId: worker.id }, data: { lateCount: { increment: 1 } } });
  }
  await notifyUser(b.clientId, "Llegó a tu puerta. Antes de abrir, compara su selfie con su perfil en la app.");
}

export async function uploadStartSelfie(worker: User, bookingId: string, file: File | null) {
  const b = await asWorker(worker, bookingId);
  if (b.status !== "ARRIVED") throw new MarketError("La selfie se toma al llegar.");
  await saveUpload(file, { ownerId: worker.id, kind: "START_SELFIE", bookingId, purgeAfter: new Date(Date.now() + 30 * 24 * HOUR) });
}

export async function confirmIdentity(client: User, bookingId: string, matches: boolean) {
  const b = await asClient(client, bookingId);
  if (b.status !== "ARRIVED") throw new MarketError("Aún no ha llegado.");
  const selfie = await db.document.findFirst({ where: { bookingId, kind: "START_SELFIE" } });
  if (!selfie) throw new MarketError("Espera a que tome su selfie de llegada.");
  if (matches) {
    await db.booking.update({ where: { id: b.id }, data: { identityConfirmed: true } });
    return;
  }
  await db.safetyIncident.create({
    data: { bookingId, reporterId: client.id, kind: "IDENTITY_MISMATCH", details: "El cliente indica que la persona en la puerta no coincide con el perfil." },
  });
  await audit(client.id, "identity_mismatch", "Booking", bookingId);
}

export async function startWithPin(worker: User, bookingId: string, pin: string) {
  const b = await asWorker(worker, bookingId);
  const selfie = await db.document.count({ where: { bookingId, kind: "START_SELFIE" } });
  const r = checkPin(b.arrivalPin, pin, b.pinAttempts);
  if (!r.ok) {
    await db.booking.update({ where: { id: b.id }, data: { pinAttempts: r.attempts } });
    if (r.locked) {
      const exists = await db.safetyIncident.count({ where: { bookingId, kind: "PIN_LOCKOUT" } });
      if (!exists) await db.safetyIncident.create({ data: { bookingId, reporterId: null, kind: "PIN_LOCKOUT", details: "5 intentos fallidos de PIN de llegada." } });
      throw new MarketError("PIN bloqueado. La central se comunicará contigo.");
    }
    throw new MarketError(`PIN incorrecto. Te quedan ${5 - r.attempts} intentos.`);
  }
  const next = transition(b.status, "START", "WORKER", { startSelfie: selfie > 0, identityConfirmed: b.identityConfirmed, pinOk: true });
  await setStatus(b, next, { startedAt: new Date() });
}

export async function uploadWorkPhoto(worker: User, bookingId: string, file: File | null, when: "BEFORE" | "AFTER") {
  const b = await asWorker(worker, bookingId);
  if (b.status !== "IN_PROGRESS") throw new MarketError("Las fotos se suben durante el servicio.");
  await saveUpload(file, {
    ownerId: worker.id,
    kind: when === "BEFORE" ? "PHOTO_BEFORE" : "PHOTO_AFTER",
    bookingId,
    purgeAfter: new Date(Date.now() + 90 * 24 * HOUR),
  });
}

export async function proposeQuote(worker: User, bookingId: string, amount: number, description: string) {
  const b = await asWorker(worker, bookingId);
  if (b.status !== "IN_PROGRESS") throw new MarketError("Los presupuestos se proponen durante el servicio.");
  if (!Number.isInteger(amount) || amount < 1000 || amount > 2_000_000) throw new MarketError("Monto entre $1.000 y $2.000.000.");
  const text = description.trim().slice(0, 500);
  if (!text) throw new MarketError("Describe el trabajo adicional.");
  await db.quote.create({ data: { bookingId, amount, description: text } });
  await notifyUser(b.clientId, "Tienes un presupuesto adicional por aprobar en la app.");
}

export async function answerQuote(client: User, quoteId: string, approve: boolean) {
  const q = await db.quote.findUnique({ where: { id: quoteId } });
  if (!q || q.status !== "PENDING") throw new MarketError("Presupuesto no disponible.");
  const b = await asClient(client, q.bookingId);
  if (b.status !== "IN_PROGRESS") throw new MarketError("El servicio ya no está en curso.");
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: q.id }, data: { status: approve ? "APPROVED" : "REJECTED" } });
    if (approve) {
      const updated = await tx.booking.update({ where: { id: b.id }, data: { extrasAmount: { increment: q.amount } } });
      await pay.adjustAuthorization(tx, b.id, updated.quotedAmount + updated.extrasAmount);
    }
  });
}

export async function complete(worker: User, bookingId: string) {
  const b = await asWorker(worker, bookingId);
  const after = await db.document.count({ where: { bookingId, kind: "PHOTO_AFTER" } });
  if (!after) throw new MarketError("Sube al menos una foto del trabajo terminado.");
  const pendingQuotes = await db.quote.count({ where: { bookingId, status: "PENDING" } });
  if (pendingQuotes) throw new MarketError("Hay un presupuesto sin responder.");
  const next = transition(b.status, "COMPLETE", "WORKER");
  const total = b.quotedAmount + b.extrasAmount;
  await db.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({
      where: { id: b.id, status: b.status },
      data: { status: next, completedAt: new Date(), disputeUntil: new Date(Date.now() + DISPUTE_WINDOW_MS) },
    });
    if (r.count !== 1) throw new MarketError("El servicio cambió de estado.");
    await pay.capture(tx, b.id, total, b.commissionRate);
    await tx.user.update({ where: { id: worker.id }, data: { completedCount: { increment: 1 } } });
    await tx.user.update({ where: { id: b.clientId }, data: { completedCount: { increment: 1 } } });
  });
  await notifyUser(b.clientId, "Servicio terminado. Revisa las fotos y confirma, o reclama dentro de 48 horas.");
}

async function openIncidents(bookingId: string) {
  return db.safetyIncident.count({ where: { bookingId, status: { not: "RESOLVED" }, kind: { not: "REPORT" } } });
}

export async function confirmService(client: User, bookingId: string) {
  const b = await asClient(client, bookingId);
  const next = transition(b.status, "CONFIRM", "CLIENT", { openSafetyIncident: (await openIncidents(b.id)) > 0 });
  await db.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: next, settledAt: new Date() } });
    if (r.count !== 1) throw new MarketError("El servicio cambió de estado.");
    await pay.release(tx, b.id);
  });
}

export async function dispute(client: User, bookingId: string, reason: string) {
  const b = await asClient(client, bookingId);
  const text = reason.trim().slice(0, 1000);
  if (!text) throw new MarketError("Cuéntanos qué pasó.");
  const next = transition(b.status, "DISPUTE", "CLIENT", { withinDisputeWindow: !!b.disputeUntil && b.disputeUntil > new Date() });
  await setStatus(b, next);
  await db.safetyIncident.create({ data: { bookingId, reporterId: client.id, kind: "REPORT", details: `Reclamo: ${text}` } });
}

export async function cancel(user: User, bookingId: string, reason: string) {
  const { booking: b, role } = await participant(user, bookingId);
  const next = transition(b.status, "CANCEL", role);
  const fee = role === "CLIENT" && b.status !== "REQUESTED" ? cancellationFee(b.quotedAmount, b.scheduledAt, new Date(), "CLIENT") : 0;
  await db.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({
      where: { id: b.id, status: b.status },
      data: { status: next, cancelledAt: new Date(), cancelledBy: role, cancelReason: reason.trim().slice(0, 300) },
    });
    if (r.count !== 1) throw new MarketError("El servicio cambió de estado.");
    await tx.offer.updateMany({ where: { bookingId: b.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    await pay.voidOrCharge(tx, b.id, fee);
    if (role === "WORKER") await tx.workerProfile.update({ where: { userId: user.id }, data: { cancelCount: { increment: 1 } } });
  });
  const other = role === "CLIENT" ? b.workerId : b.clientId;
  if (other) await notifyUser(other, "Un servicio fue cancelado. Revisa la app.");
  return { fee };
}

export async function sendMessage(user: User, bookingId: string, body: string) {
  const { booking } = await participant(user, bookingId);
  if (["CANCELLED", "EXPIRED"].includes(booking.status) || !booking.workerId) throw new MarketError("El chat no está disponible.");
  const text = body.trim().slice(0, 1000);
  if (!text) return;
  const { text: clean, redacted } = redactContactInfo(text);
  await db.message.create({ data: { bookingId, senderId: user.id, body: clean, redacted } });
}

export async function rate(user: User, bookingId: string, stars: number, comment: string, feltSafe: boolean) {
  const { booking, role } = await participant(user, bookingId);
  if (!["COMPLETED", "SETTLED", "DISPUTED"].includes(booking.status)) throw new MarketError("Califica cuando el servicio termine.");
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new MarketError("Elige de 1 a 5 estrellas.");
  const rateeId = role === "CLIENT" ? booking.workerId! : booking.clientId;
  const exists = await db.rating.count({ where: { bookingId, raterId: user.id } });
  if (exists) throw new MarketError("Ya calificaste este servicio.");
  await db.rating.create({ data: { bookingId, raterId: user.id, rateeId, stars, comment: comment.trim().slice(0, 500), feltSafe } });
  if (!feltSafe) {
    // Señal privada: no toca la nota pública, abre revisión en la central.
    await db.safetyIncident.create({ data: { bookingId, reporterId: user.id, kind: "FELT_UNSAFE", details: comment.trim().slice(0, 500) } });
  }
  await applyRatings(bookingId);
}

async function applyRatings(bookingId: string) {
  const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { ratings: true } });
  if (!ratingsVisible(b.ratings.length, b.completedAt, new Date())) return;
  for (const r of b.ratings.filter((x) => !x.applied)) {
    await db.$transaction([
      db.rating.update({ where: { id: r.id }, data: { applied: true } }),
      db.user.update({ where: { id: r.rateeId }, data: { ratingSum: { increment: r.stars }, ratingCount: { increment: 1 } } }),
    ]);
  }
}

export async function block(user: User, otherId: string, reason: string) {
  if (otherId === user.id) return;
  const shared = await db.booking.count({
    where: { OR: [{ clientId: user.id, workerId: otherId }, { clientId: otherId, workerId: user.id }] },
  });
  if (!shared) throw new MarketError("Solo puedes desvincular a alguien con quien tuviste un servicio.");
  await db.block.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: otherId } },
    create: { blockerId: user.id, blockedId: otherId, reason: reason.slice(0, 300) },
    update: {},
  });
}

export async function notifyUser(userId: string, text: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (u) await sendSms(u.phone, text);
}

// Tareas periódicas. Se llaman desde /api/cron y, con freno, desde las consultas de estado.
let lastSweep = 0;
export async function sweep(force = false) {
  if (!force && Date.now() - lastSweep < 20_000) return;
  lastSweep = Date.now();
  const now = new Date();

  const expired = await db.offer.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, include: { booking: true } });
  for (const o of expired) {
    await db.offer.update({ where: { id: o.id }, data: { status: "EXPIRED" } });
    if (o.booking.mode === "URGENT") await dispatchUrgent(o.bookingId);
  }
  const stale = await db.booking.findMany({ where: { status: "REQUESTED", mode: "SCHEDULED", scheduledAt: { lt: now } } });
  for (const b of stale) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { status: transition(b.status, "EXPIRE", "SYSTEM") } });
      await pay.voidOrCharge(tx, b.id, 0);
    });
  }

  const live = await db.booking.findMany({ where: { status: { in: ["ACCEPTED", "EN_ROUTE", "IN_PROGRESS"] } } });
  for (const a of wellbeingSweep(live, now)) {
    const b = live.find((x) => x.id === a.id)!;
    if (a.kind === "PROMPT") {
      await db.booking.update({ where: { id: b.id }, data: { wellbeingPromptAt: now } });
      for (const id of [b.clientId, b.workerId]) if (id) await notifyUser(id, "El servicio se extendió. Abre Llave y confirma que todo está bien.");
    } else {
      const kind = a.kind === "ESCALATE" ? "WELLBEING_TIMEOUT" : "REPORT";
      const details = a.kind === "ESCALATE" ? "Nadie respondió el chequeo de bienestar." : "Atraso de más de 45 minutos sin llegada.";
      const exists = await db.safetyIncident.count({ where: { bookingId: b.id, kind, details } });
      if (!exists) await db.safetyIncident.create({ data: { bookingId: b.id, kind, details } });
    }
  }

  const due = await db.booking.findMany({ where: { status: "COMPLETED", disputeUntil: { lt: now } } });
  for (const b of due) {
    if (await openIncidents(b.id)) continue;
    await db.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: b.id }, data: { status: transition(b.status, "AUTO_SETTLE", "SYSTEM"), settledAt: now } });
      await pay.release(tx, b.id);
    });
  }

  const unrevealed = await db.rating.findMany({ where: { applied: false }, select: { bookingId: true }, distinct: ["bookingId"] });
  for (const r of unrevealed) await applyRatings(r.bookingId);

  await db.verification.updateMany({ where: { status: "APPROVED", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  await db.locationPing.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * HOUR) } } });
  await db.otpChallenge.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 24 * HOUR) } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await purgeExpiredDocuments(now);
}
