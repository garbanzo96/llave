// Central de seguridad y operaciones. Toda lectura de documentos sensibles y toda decisión queda en auditoría.
import type { User } from "@prisma/client";
import { audit, db } from "../db";
import * as pay from "../payments";
import { MarketError, notifyUser } from "./marketplace";
import { recomputeActivation } from "./verification";
import { transition } from "@/lib/core/booking-machine";

export async function dashboard() {
  const [incidents, queue, live, disputes] = await Promise.all([
    db.safetyIncident.findMany({
      where: { status: { not: "RESOLVED" } },
      include: { reporter: { select: { name: true, phone: true, role: true } }, booking: { include: { address: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.verification.findMany({
      where: { status: "PENDING", OR: [{ kind: { not: "IDENTITY" } }, { documents: { some: {} } }] },
      include: { user: { select: { id: true, name: true, rut: true, role: true, gender: true, photoDocId: true } }, documents: { select: { id: true, kind: true, mime: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.booking.findMany({
      where: { status: { in: ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"] } },
      include: { client: { select: { name: true } }, worker: { select: { name: true } }, address: { select: { comuna: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    db.booking.findMany({ where: { status: "DISPUTED" }, include: { payment: true, incidents: true } }),
  ]);
  return { incidents, queue, live, disputes };
}

export async function acknowledgeIncident(admin: User, id: string) {
  await db.safetyIncident.updateMany({ where: { id, status: "OPEN" }, data: { status: "ACKNOWLEDGED", ackAt: new Date(), assigneeId: admin.id } });
  await audit(admin.id, "incident_ack", "SafetyIncident", id);
}

export async function resolveIncident(admin: User, id: string, resolution: string) {
  const text = resolution.trim().slice(0, 1000);
  if (!text) throw new MarketError("Describe cómo se resolvió (queda en el registro).");
  await db.safetyIncident.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolution: text, assigneeId: admin.id } });
  await audit(admin.id, "incident_resolved", "SafetyIncident", id);
}

export async function suspendUser(admin: User, userId: string, reason: string) {
  if (!reason.trim()) throw new MarketError("Indica el motivo.");
  await db.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
  await db.workerProfile.updateMany({ where: { userId }, data: { online: false } });
  await audit(admin.id, "user_suspended", "User", userId, { reason: reason.slice(0, 300) });
}

export async function reinstateUser(admin: User, userId: string) {
  await db.user.update({ where: { id: userId }, data: { status: "PENDING_VERIFICATION" } });
  await recomputeActivation(userId);
  await audit(admin.id, "user_reinstated", "User", userId);
}

export async function resolveDispute(admin: User, bookingId: string, refundAmount: number, note: string) {
  const b = await db.booking.findUnique({ where: { id: bookingId }, include: { payment: true } });
  if (!b || !b.payment) throw new MarketError("Servicio no encontrado.");
  if (!Number.isInteger(refundAmount) || refundAmount < 0 || refundAmount > b.payment.capturedAmount)
    throw new MarketError("Monto de devolución inválido.");
  const next = transition(b.status, "RESOLVE", "ADMIN");
  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: b.id }, data: { status: next, settledAt: new Date() } });
    await pay.refund(tx, b.id, refundAmount, b.commissionRate);
    await tx.safetyIncident.updateMany({
      where: { bookingId: b.id, kind: "REPORT", status: { not: "RESOLVED" } },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolution: note.slice(0, 1000), assigneeId: admin.id },
    });
  });
  await audit(admin.id, "dispute_resolved", "Booking", b.id, { refundAmount });
  await notifyUser(b.clientId, "Resolvimos tu reclamo. Revisa el detalle en la app.");
  if (b.workerId) await notifyUser(b.workerId, "Se resolvió un reclamo sobre uno de tus servicios.");
}

export async function auditTrail(limit = 100) {
  return db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
