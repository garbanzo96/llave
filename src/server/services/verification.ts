// Verificación con revisión humana (patrón de respaldo de DiDi). Con volumen, la revisión de identidad
// se reemplaza por un proveedor con prueba de vida (Truora, MetaMap, Veriff) sin cambiar este flujo.
import type { Gender, User, VerificationKind } from "@prisma/client";
import { audit, db, parseJson } from "../db";
import { randomDigits } from "../crypto";
import { deleteDocument, saveUpload } from "../storage";
import { MarketError, notifyUser } from "./marketplace";
import { validRut, normalizePhone } from "@/lib/core/safety";
import type { License } from "@/lib/core/categories";

const DAY = 86_400_000;
// Las imágenes de verificación se guardan 90 días para revisión y apelación; luego se borran.
const purgeAfter = () => new Date(Date.now() + 90 * DAY);

export const REQUIRED: Record<"CLIENT" | "WORKER", VerificationKind[]> = {
  CLIENT: ["IDENTITY"],
  WORKER: ["IDENTITY", "CRIMINAL_RECORD", "MINORS_REGISTRY"],
};

// Vigencia que fija la central al aprobar.
export const VALIDITY_DAYS: Record<VerificationKind, number | null> = {
  IDENTITY: null,
  CRIMINAL_RECORD: 180,
  MINORS_REGISTRY: 180,
  SEC_LICENSE: 365,
  REFERENCES: null,
};

export async function identityChallenge(user: User): Promise<string> {
  const pending = await db.verification.findFirst({ where: { userId: user.id, kind: "IDENTITY", status: "PENDING" } });
  if (pending?.challengeCode) return pending.challengeCode;
  const v = await db.verification.create({ data: { userId: user.id, kind: "IDENTITY", challengeCode: randomDigits(4) } });
  return v.challengeCode!;
}

export async function submitIdentity(
  user: User,
  input: { rut: string; gender: Gender; idFront: File | null; idBack: File | null; selfie: File | null; photo: File | null },
) {
  if (!validRut(input.rut)) throw new MarketError("RUT inválido.");
  const rut = input.rut.replace(/[.\s]/g, "").toUpperCase();
  const taken = await db.user.findFirst({ where: { rut, id: { not: user.id } } });
  if (taken) throw new MarketError("Ese RUT ya está registrado. Escribe a soporte si es un error.");
  const v = await db.verification.findFirst({ where: { userId: user.id, kind: "IDENTITY", status: "PENDING" }, include: { documents: true } });
  if (!v) throw new MarketError("Recarga la página para obtener tu código de verificación.");
  for (const d of v.documents) await deleteDocument(d.id);
  const common = { ownerId: user.id, verificationId: v.id, purgeAfter: purgeAfter() };
  await saveUpload(input.idFront, { ...common, kind: "ID_FRONT" });
  await saveUpload(input.idBack, { ...common, kind: "ID_BACK" });
  await saveUpload(input.selfie, { ...common, kind: "SELFIE" });
  // La foto de perfil no se purga: es la que ve la otra parte antes de abrir la puerta.
  const photo = await saveUpload(input.photo, { ownerId: user.id, kind: "PROFILE_PHOTO" });
  await db.user.update({ where: { id: user.id }, data: { rut, gender: input.gender, photoDocId: photo.id } });
  await db.verification.update({ where: { id: v.id }, data: { data: JSON.stringify({ submittedAt: new Date() }) } });
}

async function newPending(user: User, kind: VerificationKind, data: object) {
  await db.verification.updateMany({ where: { userId: user.id, kind, status: "PENDING" }, data: { status: "REJECTED", rejectReason: "Reemplazada" } });
  return db.verification.create({ data: { userId: user.id, kind, data: JSON.stringify(data) } });
}

export async function submitCriminalRecord(user: User, folio: string, file: File | null) {
  const f = folio.trim().slice(0, 40);
  if (!f) throw new MarketError("Ingresa el código de verificación del certificado.");
  const v = await newPending(user, "CRIMINAL_RECORD", { folio: f });
  await saveUpload(file, { ownerId: user.id, kind: "CERTIFICATE", verificationId: v.id, allowPdf: true, purgeAfter: purgeAfter() });
}

// La central consulta el registro de inhabilidades (Ley 20.594) por RUT; se pide consentimiento explícito.
export async function consentMinorsRegistry(user: User) {
  if (!user.rut) throw new MarketError("Primero verifica tu identidad.");
  await newPending(user, "MINORS_REGISTRY", { consentAt: new Date() });
}

export async function submitLicense(user: User, license: License, number: string, file: File | null) {
  if (license !== "SEC_GAS" && license !== "SEC_ELECTRICA") throw new MarketError("Licencia inválida.");
  const n = number.trim().slice(0, 40);
  if (!n) throw new MarketError("Ingresa el número de licencia.");
  const v = await newPending(user, "SEC_LICENSE", { license, number: n });
  await saveUpload(file, { ownerId: user.id, kind: "LICENSE", verificationId: v.id, allowPdf: true, purgeAfter: purgeAfter() });
}

export async function submitReferences(user: User, refs: { name: string; phone: string; relation: string }[]) {
  const clean = refs
    .map((r) => ({ name: r.name.trim().slice(0, 60), phone: normalizePhone(r.phone), relation: r.relation.trim().slice(0, 60) }))
    .filter((r) => r.name && r.phone);
  if (clean.length < 2) throw new MarketError("Agrega dos referencias con celular válido.");
  await newPending(user, "REFERENCES", { refs: clean });
}

export async function verificationStatus(user: User) {
  const all = await db.verification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const latest = new Map<VerificationKind, (typeof all)[number]>();
  for (const v of all) if (!latest.has(v.kind)) latest.set(v.kind, v);
  return latest;
}

export async function review(admin: User, verificationId: string, approve: boolean, opts: { reason?: string; expiresAt?: Date }) {
  const v = await db.verification.findUnique({ where: { id: verificationId }, include: { user: true } });
  if (!v || v.status !== "PENDING") throw new MarketError("Verificación no disponible.");
  if (!approve && !opts.reason?.trim()) throw new MarketError("Indica el motivo del rechazo (la persona lo verá).");
  const days = VALIDITY_DAYS[v.kind];
  const expiresAt = opts.expiresAt ?? (days ? new Date(Date.now() + days * DAY) : null);
  await db.verification.update({
    where: { id: v.id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      reviewerId: admin.id,
      reviewedAt: new Date(),
      rejectReason: approve ? null : opts.reason!.trim().slice(0, 300),
      expiresAt: approve ? expiresAt : null,
    },
  });
  await audit(admin.id, approve ? "verification_approved" : "verification_rejected", "Verification", v.id, { kind: v.kind, userId: v.userId });
  await recomputeActivation(v.userId);
  await notifyUser(v.userId, approve ? "Una de tus verificaciones fue aprobada." : "Una verificación fue rechazada. Revisa el motivo en la app.");
}

export async function recomputeActivation(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role === "ADMIN" || user.status === "SUSPENDED" || user.status === "DELETED") return;
  const latest = await verificationStatus(user);
  const ok = REQUIRED[user.role].every((k) => latest.get(k)?.status === "APPROVED");
  const status = ok ? "ACTIVE" : "PENDING_VERIFICATION";
  if (status !== user.status) await db.user.update({ where: { id: userId }, data: { status } });
}

export function verificationData(json: string) {
  return parseJson<Record<string, unknown>>(json, {});
}
