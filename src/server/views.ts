// Lecturas para las páginas. Cada vista entrega solo lo que ese rol puede ver.
import type { User } from "@prisma/client";
import { db, parseJson } from "./db";
import { MarketError, publicName, sweep } from "./services/marketplace";
import { bayesianRating, type Household } from "@/lib/core/matching";
import { ratingsVisible } from "@/lib/core/safety";
import { CATEGORIES, type Category } from "@/lib/core/categories";
import { verificationStatus } from "./services/verification";

export async function trustBadges(userId: string) {
  const latest = await verificationStatus({ id: userId } as User);
  return [...latest.values()]
    .filter((v) => v.status === "APPROVED")
    .map((v) => ({ kind: v.kind, expiresAt: v.expiresAt, license: parseJson<{ license?: string }>(v.data, {}).license ?? null }));
}

export async function publicProfile(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { worker: true } });
  return {
    id: u.id,
    name: publicName(u.name),
    photoDocId: u.photoDocId,
    rating: u.ratingCount ? Math.round(bayesianRating(u.ratingSum, u.ratingCount) * 10) / 10 : null,
    ratingCount: u.ratingCount,
    completedCount: u.completedCount,
    bio: u.worker?.bio ?? "",
    memberSince: u.createdAt,
    badges: await trustBadges(u.id),
  };
}

export async function bookingView(user: User, id: string) {
  await sweep();
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      address: true,
      payment: true,
      quotes: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      ratings: true,
      documents: { select: { id: true, kind: true, createdAt: true } },
      offers: { where: { status: "PENDING" }, select: { id: true, workerId: true, expiresAt: true } },
    },
  });
  if (!b || (b.clientId !== user.id && b.workerId !== user.id)) throw new MarketError("Servicio no encontrado.");
  const role = b.clientId === user.id ? "CLIENT" : "WORKER";
  const otherId = role === "CLIENT" ? b.workerId : b.clientId;
  const now = new Date();
  const visible = ratingsVisible(b.ratings.length, b.completedAt, now);
  const incident = await db.safetyIncident.findFirst({
    where: { reporterId: user.id, kind: "SOS", status: { not: "RESOLVED" } },
    orderBy: { createdAt: "desc" },
  });
  const docs = (kind: string) => b.documents.filter((d) => d.kind === kind).map((d) => d.id);
  // La dirección exacta se revela al trabajador solo después de aceptar.
  const showAddress = role === "CLIENT" || !["REQUESTED", "CANCELLED", "EXPIRED"].includes(b.status);

  return {
    id: b.id,
    role,
    status: b.status,
    mode: b.mode,
    category: b.category as Category,
    categoryLabel: CATEGORIES[b.category as Category].label,
    scheduledAt: b.scheduledAt,
    estimatedMinutes: b.estimatedMinutes,
    description: b.description,
    household: parseJson<Household>(b.household, { adultsHome: true, minorsHome: false, pets: false }),
    address: showAddress
      ? { line: b.address.line, comuna: b.address.comuna, notes: b.address.notes, lat: b.address.lat, lng: b.address.lng }
      : { line: null, comuna: b.address.comuna, notes: "", lat: null, lng: null },
    pin: role === "CLIENT" ? b.arrivalPin : null,
    pinAttempts: b.pinAttempts,
    identityConfirmed: b.identityConfirmed,
    startSelfieIds: docs("START_SELFIE"),
    beforePhotoIds: docs("PHOTO_BEFORE"),
    afterPhotoIds: docs("PHOTO_AFTER"),
    quotedAmount: b.quotedAmount,
    extrasAmount: b.extrasAmount,
    commissionRate: b.commissionRate,
    payment: b.payment && {
      status: b.payment.status,
      authorized: b.payment.authorizedAmount,
      captured: b.payment.capturedAmount,
      workerPayout: role === "WORKER" ? b.payment.workerPayout : null,
    },
    quotes: b.quotes.map((q) => ({ id: q.id, amount: q.amount, description: q.description, status: q.status })),
    messages: b.messages.map((m) => ({ id: m.id, mine: m.senderId === user.id, body: m.body, redacted: m.redacted, at: m.createdAt })),
    myRating: b.ratings.find((r) => r.raterId === user.id) ?? null,
    theirRating: visible ? (b.ratings.find((r) => r.raterId !== user.id) ?? null) : null,
    disputeUntil: b.disputeUntil,
    completedAt: b.completedAt,
    pendingOfferExpiresAt: b.offers[0]?.expiresAt ?? null,
    wellbeingPending: !!b.wellbeingPromptAt && !b.wellbeingAckAt,
    openSosId: incident?.id ?? null,
    other: otherId ? await publicProfile(otherId) : null,
  };
}

export type BookingView = Awaited<ReturnType<typeof bookingView>>;

export async function myBookings(user: User) {
  await sweep();
  const where = user.role === "WORKER" ? { workerId: user.id } : { clientId: user.id };
  const rows = await db.booking.findMany({
    where,
    include: { client: { select: { name: true } }, worker: { select: { name: true } }, address: { select: { comuna: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 50,
  });
  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    mode: b.mode,
    categoryLabel: CATEGORIES[b.category as Category].label,
    scheduledAt: b.scheduledAt,
    comuna: b.address.comuna,
    total: b.quotedAmount + b.extrasAmount,
    otherName: user.role === "WORKER" ? publicName(b.client.name) : b.worker ? publicName(b.worker.name) : null,
  }));
}

export async function workerOffers(user: User) {
  await sweep();
  const offers = await db.offer.findMany({
    where: { workerId: user.id, status: "PENDING", expiresAt: { gt: new Date() } },
    include: { booking: { include: { address: { select: { comuna: true, lat: true, lng: true } }, client: true } } },
    orderBy: { createdAt: "desc" },
  });
  const profile = await db.workerProfile.findUnique({ where: { userId: user.id } });
  const { quote, split, commissionRate } = await import("@/lib/core/pricing");
  return Promise.all(
    offers.map(async (o) => {
      const b = o.booking;
      const together = await db.booking.count({ where: { clientId: b.clientId, workerId: user.id, status: "SETTLED" } });
      const price = quote(b.category as Category, b.mode === "URGENT", b.estimatedMinutes, profile ?? { hourlyRate: 0, visitFee: 0 });
      return {
        offerId: o.id,
        bookingId: b.id,
        expiresAt: o.expiresAt,
        mode: b.mode,
        categoryLabel: CATEGORIES[b.category as Category].label,
        scheduledAt: b.scheduledAt,
        estimatedMinutes: b.estimatedMinutes,
        description: b.description,
        comuna: b.address.comuna,
        household: parseJson<Household>(b.household, { adultsHome: true, minorsHome: false, pets: false }),
        client: { name: publicName(b.client.name), rating: b.client.ratingCount ? Math.round(bayesianRating(b.client.ratingSum, b.client.ratingCount) * 10) / 10 : null, completedCount: b.client.completedCount },
        price,
        payout: split(price.total, commissionRate(together)).workerPayout,
      };
    }),
  );
}
