"use server";
// Acciones del servidor. Cada una autentica, autoriza sobre el recurso y valida su entrada antes de tocar datos.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Gender, Role } from "@prisma/client";
import { actor, createSession, homeFor, logout, requestOtp, verifiedPhone, verifyOtp } from "@/server/auth";
import { bool, file, num, run, str, type ActionResult } from "@/server/action";
import * as market from "@/server/services/marketplace";
import * as safety from "@/server/services/safety";
import * as verif from "@/server/services/verification";
import * as account from "@/server/services/account";
import * as central from "@/server/services/central";
import type { License } from "@/lib/core/categories";

type State = ActionResult<unknown> | null;

// ---------- Acceso ----------

export async function requestOtpAction(_: State, f: FormData) {
  return run(() => requestOtp(str(f, "phone")));
}

export async function verifyOtpAction(_: State, f: FormData) {
  const r = await run(() => verifyOtp(str(f, "phone"), str(f, "code")));
  if (!r.ok) return r;
  redirect(r.data === "SIGNUP" ? "/registro" : "/inicio");
}

export async function signupAction(_: State, f: FormData) {
  const r = await run(async () => {
    const phone = await verifiedPhone();
    if (!phone) throw new market.MarketError("Verifica tu celular de nuevo.");
    const role = str(f, "role") as Role;
    const user = await account.signup(phone, { name: str(f, "name"), role, acceptTerms: bool(f, "terms") });
    await createSession(user.id);
    return user.role;
  });
  if (!r.ok) return r;
  redirect("/verificacion");
}

export async function logoutAction() {
  await logout();
  redirect("/");
}

// ---------- Verificación ----------

export async function submitIdentityAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("CLIENT", "WORKER");
    const gender = str(f, "gender") as Gender;
    if (!["FEMALE", "MALE", "OTHER", "UNDISCLOSED"].includes(gender)) throw new market.MarketError("Elige una opción de género.");
    await verif.submitIdentity(u, {
      rut: str(f, "rut"),
      gender,
      idFront: file(f, "idFront"),
      idBack: file(f, "idBack"),
      selfie: file(f, "selfie"),
      photo: file(f, "photo"),
    });
    revalidatePath("/verificacion");
  }, "Recibimos tus documentos. La central los revisa en horario hábil.");
}

export async function submitCriminalRecordAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("WORKER");
    await verif.submitCriminalRecord(u, str(f, "folio"), file(f, "certificate"));
    revalidatePath("/verificacion");
  }, "Certificado recibido.");
}

export async function consentMinorsAction() {
  return run(async () => {
    const u = await actor("WORKER");
    await verif.consentMinorsRegistry(u);
    revalidatePath("/verificacion");
  }, "Autorización registrada.");
}

export async function submitLicenseAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("WORKER");
    await verif.submitLicense(u, str(f, "license") as License, str(f, "number"), file(f, "licenseFile"));
    revalidatePath("/verificacion");
  }, "Licencia recibida.");
}

export async function submitReferencesAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("WORKER");
    await verif.submitReferences(u, [0, 1].map((i) => ({ name: str(f, `name${i}`), phone: str(f, `phone${i}`), relation: str(f, `relation${i}`) })));
    revalidatePath("/verificacion");
  }, "Referencias recibidas.");
}

// ---------- Perfil ----------

export async function addAddressAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("CLIENT");
    const input = account.addressSchema.parse({
      label: str(f, "label"),
      line: str(f, "line"),
      comuna: str(f, "comuna"),
      notes: str(f, "notes"),
      lat: num(f, "lat"),
      lng: num(f, "lng"),
    });
    await account.addAddress(u, input);
    revalidatePath("/c/perfil");
  }, "Dirección guardada.");
}

export async function removeAddressAction(id: string) {
  return run(async () => {
    const u = await actor("CLIENT");
    await account.removeAddress(u, id);
    revalidatePath("/c/perfil");
  });
}

export async function clientPrefsAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("CLIENT");
    await account.setClientPrefs(u, str(f, "workerGenderPref") === "FEMALE_ONLY" ? "FEMALE_ONLY" : "ANY");
    revalidatePath("/c/perfil");
  }, "Preferencia guardada.");
}

export async function workerProfileAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("WORKER");
    const input = account.workerProfileSchema.parse({
      categories: f.getAll("categories").map(String),
      bio: str(f, "bio"),
      hourlyRate: num(f, "hourlyRate"),
      visitFee: num(f, "visitFee"),
      radiusKm: num(f, "radiusKm"),
      baseLat: num(f, "baseLat"),
      baseLng: num(f, "baseLng"),
      nightOk: bool(f, "nightOk"),
      clientGenderPref: str(f, "clientGenderPref") === "FEMALE_ONLY" ? "FEMALE_ONLY" : "ANY",
      requireAdultHome: bool(f, "requireAdultHome"),
    });
    await account.updateWorkerProfile(u, input);
    revalidatePath("/t/perfil");
  }, "Perfil guardado.");
}

export async function setOnlineAction(online: boolean, lat?: number, lng?: number) {
  return run(async () => {
    const u = await actor("WORKER");
    await account.setOnline(u, online, lat, lng);
    revalidatePath("/t");
  });
}

export async function addContactAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("CLIENT", "WORKER");
    await safety.addTrustedContact(u, str(f, "name"), str(f, "phone"));
    revalidatePath("/seguridad");
  }, "Contacto agregado.");
}

export async function removeContactAction(id: string) {
  return run(async () => {
    const u = await actor("CLIENT", "WORKER");
    await safety.removeTrustedContact(u, id);
    revalidatePath("/seguridad");
  });
}

export async function deleteAccountAction() {
  const r = await run(async () => {
    const u = await actor("CLIENT", "WORKER");
    return account.deleteAccount(u);
  });
  if (r.ok && r.data?.ok) {
    await logout();
    redirect("/?eliminada=1");
  }
  return r;
}

// ---------- Pedir servicio (cliente) ----------

function requestFromForm(f: FormData) {
  return market.requestSchema.parse({
    category: str(f, "category"),
    urgent: bool(f, "urgent"),
    addressId: str(f, "addressId"),
    scheduledAt: str(f, "scheduledAt") || new Date().toISOString(),
    minutes: num(f, "minutes"),
    description: str(f, "description"),
    household: { adultsHome: bool(f, "adultsHome"), minorsHome: bool(f, "minorsHome"), pets: bool(f, "pets") },
    genderPref: str(f, "genderPref") === "FEMALE_ONLY" ? "FEMALE_ONLY" : "ANY",
  });
}

export async function searchAction(_: State, f: FormData) {
  return run(async () => {
    const u = await actor("CLIENT");
    return market.searchWorkers(u, requestFromForm(f));
  });
}

export async function requestBookingAction(_: State, f: FormData) {
  const r = await run(async () => {
    const u = await actor("CLIENT");
    const b = await market.requestBooking(u, requestFromForm(f), str(f, "workerId") || undefined);
    return b.id;
  });
  if (!r.ok) return r;
  redirect(`/c/servicio/${r.data}`);
}

// ---------- Servicio (ambas partes) ----------

const revalidateBooking = (id: string) => {
  revalidatePath(`/c/servicio/${id}`);
  revalidatePath(`/t/servicio/${id}`);
};

export async function respondOfferAction(offerId: string, accept: boolean) {
  return run(async () => {
    const u = await actor("WORKER");
    await market.respondOffer(u, offerId, accept);
    revalidatePath("/t");
  });
}

export async function startRouteAction(bookingId: string) {
  return run(async () => {
    await market.startRoute(await actor("WORKER"), bookingId);
    revalidateBooking(bookingId);
  });
}

export async function pingAction(lat: number, lng: number, bookingId?: string) {
  return run(async () => market.pingLocation(await actor("WORKER", "CLIENT"), lat, lng, bookingId));
}

export async function arriveAction(bookingId: string, lat: number, lng: number) {
  return run(async () => {
    await market.arrive(await actor("WORKER"), bookingId, lat, lng);
    revalidateBooking(bookingId);
  });
}

export async function startSelfieAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.uploadStartSelfie(await actor("WORKER"), id, file(f, "selfie"));
    revalidateBooking(id);
  }, "Selfie enviada. El cliente la está revisando.");
}

export async function confirmIdentityAction(bookingId: string, matches: boolean) {
  return run(async () => {
    await market.confirmIdentity(await actor("CLIENT"), bookingId, matches);
    revalidateBooking(bookingId);
  });
}

export async function startWithPinAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.startWithPin(await actor("WORKER"), id, str(f, "pin"));
    revalidateBooking(id);
  });
}

export async function workPhotoAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.uploadWorkPhoto(await actor("WORKER"), id, file(f, "photo"), str(f, "when") === "AFTER" ? "AFTER" : "BEFORE");
    revalidateBooking(id);
  }, "Foto guardada.");
}

export async function proposeQuoteAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.proposeQuote(await actor("WORKER"), id, num(f, "amount"), str(f, "description"));
    revalidateBooking(id);
  }, "Presupuesto enviado al cliente.");
}

export async function answerQuoteAction(quoteId: string, bookingId: string, approve: boolean) {
  return run(async () => {
    await market.answerQuote(await actor("CLIENT"), quoteId, approve);
    revalidateBooking(bookingId);
  });
}

export async function completeAction(bookingId: string) {
  return run(async () => {
    await market.complete(await actor("WORKER"), bookingId);
    revalidateBooking(bookingId);
  });
}

export async function confirmServiceAction(bookingId: string) {
  return run(async () => {
    await market.confirmService(await actor("CLIENT"), bookingId);
    revalidateBooking(bookingId);
  });
}

export async function disputeAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.dispute(await actor("CLIENT"), id, str(f, "reason"));
    revalidateBooking(id);
  }, "Reclamo enviado. El pago queda retenido hasta resolverlo.");
}

export async function cancelAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    const r = await market.cancel(await actor("CLIENT", "WORKER"), id, str(f, "reason"));
    revalidateBooking(id);
    return r;
  });
}

export async function sendMessageAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.sendMessage(await actor("CLIENT", "WORKER"), id, str(f, "body"));
    revalidateBooking(id);
  });
}

export async function rateAction(_: State, f: FormData) {
  const id = str(f, "bookingId");
  return run(async () => {
    await market.rate(await actor("CLIENT", "WORKER"), id, num(f, "stars"), str(f, "comment"), str(f, "feltSafe") !== "no");
    revalidateBooking(id);
  }, "Gracias. Tu calificación se mostrará cuando la otra parte califique.");
}

export async function blockAction(otherId: string, reason: string) {
  return run(async () => market.block(await actor("CLIENT", "WORKER"), otherId, reason), "Listo. No volverán a coincidir.");
}

export async function shareAction(bookingId: string, notifyContacts: boolean) {
  return run(async () => safety.createShareLink(await actor("CLIENT", "WORKER"), bookingId, notifyContacts));
}

export async function wellbeingAckAction(bookingId: string) {
  return run(async () => {
    await safety.ackWellbeing(await actor("CLIENT", "WORKER"), bookingId);
    revalidateBooking(bookingId);
  });
}

// ---------- Emergencia ----------

export async function sosAction(input: { bookingId?: string; lat?: number; lng?: number; silent: boolean }) {
  return run(async () => {
    const u = await actor("CLIENT", "WORKER");
    const id = await safety.sos(u, input);
    revalidatePath("/central");
    return id;
  });
}

export async function markSafeAction(incidentId: string) {
  return run(async () => safety.markSafe(await actor("CLIENT", "WORKER"), incidentId));
}

// ---------- Central ----------

export async function reviewAction(_: State, f: FormData) {
  return run(async () => {
    const a = await actor("ADMIN");
    const exp = str(f, "expiresAt");
    await verif.review(a, str(f, "verificationId"), str(f, "decision") === "approve", {
      reason: str(f, "reason"),
      expiresAt: exp ? new Date(exp) : undefined,
    });
    revalidatePath("/central");
  });
}

export async function ackIncidentAction(id: string) {
  return run(async () => {
    await central.acknowledgeIncident(await actor("ADMIN"), id);
    revalidatePath("/central");
  });
}

export async function resolveIncidentAction(_: State, f: FormData) {
  return run(async () => {
    await central.resolveIncident(await actor("ADMIN"), str(f, "incidentId"), str(f, "resolution"));
    revalidatePath("/central");
  });
}

export async function suspendAction(_: State, f: FormData) {
  return run(async () => {
    await central.suspendUser(await actor("ADMIN"), str(f, "userId"), str(f, "reason"));
    revalidatePath("/central");
  });
}

export async function reinstateAction(userId: string) {
  return run(async () => {
    await central.reinstateUser(await actor("ADMIN"), userId);
    revalidatePath("/central");
  });
}

export async function resolveDisputeAction(_: State, f: FormData) {
  return run(async () => {
    await central.resolveDispute(await actor("ADMIN"), str(f, "bookingId"), num(f, "refund"), str(f, "note"));
    revalidatePath("/central");
  });
}

export async function goHome() {
  const u = await actor();
  redirect(homeFor(u.role));
}
