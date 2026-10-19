import { describe, expect, it } from "vitest";
import { distanceKm, isNight, withinArrivalRadius } from "./geo";
import { billableHours, cancellationFee, commissionRate, quote, split } from "./pricing";
import { hardFilter, match, nextUrgentTarget, bayesianRating, type Candidate, type MatchRequest } from "./matching";
import { transition, TransitionError } from "./booking-machine";
import {
  checkPin,
  deletionBlockers,
  normalizePhone,
  ratingsVisible,
  redactContactInfo,
  validRut,
  wellbeingSweep,
} from "./safety";

const NOW = new Date("2026-10-20T15:00:00Z"); // 12:00 en Santiago
const HOME = { lat: -33.4372, lng: -70.6506 };

const req = (over: Partial<MatchRequest> = {}): MatchRequest => ({
  category: "LIMPIEZA",
  urgent: false,
  location: HOME,
  scheduledAt: NOW,
  genderPref: "ANY",
  household: { adultsHome: true, minorsHome: false, pets: false },
  client: { id: "client", gender: "FEMALE", completedCount: 3 },
  ...over,
});

const worker = (over: Partial<Candidate> = {}): Candidate => ({
  id: "w1",
  active: true,
  gender: "FEMALE",
  categories: ["LIMPIEZA", "ELECTRICIDAD"],
  identityOk: true,
  criminalRecordOk: true,
  minorsRegistryOk: true,
  licenses: [],
  base: { lat: -33.44, lng: -70.65 },
  radiusKm: 8,
  online: true,
  last: { lat: -33.44, lng: -70.65 },
  lastSeenAt: NOW,
  nightOk: false,
  clientGenderPref: "ANY",
  requireAdultHome: false,
  busy: false,
  blocked: false,
  completedCount: 20,
  ratingSum: 95,
  ratingCount: 20,
  cancelCount: 0,
  lateCount: 0,
  offersSeen: 10,
  offersAccepted: 8,
  completedWithClient: 0,
  ...over,
});

describe("geo", () => {
  it("mide distancias y radio de llegada", () => {
    expect(distanceKm(HOME, { lat: -33.4472, lng: -70.6506 })).toBeCloseTo(1.11, 1);
    expect(withinArrivalRadius({ lat: -33.4380, lng: -70.6506 }, HOME)).toBe(true);
    expect(withinArrivalRadius({ lat: -33.4472, lng: -70.6506 }, HOME)).toBe(false);
  });
  it("detecta la noche en hora de Chile", () => {
    expect(isNight(NOW)).toBe(false);
    expect(isNight(new Date("2026-10-21T02:00:00Z"))).toBe(true); // 23:00 Santiago
  });
});

describe("precios", () => {
  it("cobra mínimo de horas y redondea a media hora", () => {
    expect(billableHours("LIMPIEZA", 60)).toBe(2);
    expect(billableHours("LIMPIEZA", 170)).toBe(3);
    expect(quote("LIMPIEZA", false, 180, { hourlyRate: 6000, visitFee: 0 }).total).toBe(18000);
  });
  it("visita con recargo de urgencia visible", () => {
    const q = quote("GASFITERIA", true, 60, { hourlyRate: 0, visitFee: 20000 });
    expect(q).toMatchObject({ base: 20000, surcharge: 6000, total: 26000 });
  });
  it("comisión menor para relaciones recurrentes y reparto exacto", () => {
    expect(commissionRate(0)).toBe(0.15);
    expect(commissionRate(2)).toBe(0.1);
    const s = split(18001, 0.15);
    expect(s.platformFee + s.workerPayout).toBe(18001);
  });
  it("cobra cancelación tardía solo al cliente", () => {
    const at = new Date(NOW.getTime() + 3_600_000);
    expect(cancellationFee(20000, at, NOW, "CLIENT")).toBe(4000);
    expect(cancellationFee(20000, at, NOW, "WORKER")).toBe(0);
    expect(cancellationFee(20000, new Date(NOW.getTime() + 5 * 3_600_000), NOW, "CLIENT")).toBe(0);
  });
});

describe("match: filtros duros", () => {
  it("acepta a una trabajadora verificada y cercana", () => {
    expect(hardFilter(req(), worker(), NOW)).toEqual([]);
  });
  it("la seguridad no se compensa con puntaje", () => {
    expect(hardFilter(req(), worker({ criminalRecordOk: false, ratingSum: 100 }), NOW)).toContain("CRIMINAL_RECORD");
    expect(hardFilter(req(), worker({ minorsRegistryOk: false }), NOW)).toContain("MINORS_REGISTRY");
    expect(hardFilter(req(), worker({ identityOk: false }), NOW)).toContain("IDENTITY");
    expect(hardFilter(req(), worker({ blocked: true }), NOW)).toContain("BLOCKED");
  });
  it("exige licencia SEC en electricidad", () => {
    expect(hardFilter(req({ category: "ELECTRICIDAD" }), worker(), NOW)).toContain("LICENSE");
    expect(hardFilter(req({ category: "ELECTRICIDAD" }), worker({ licenses: ["SEC_ELECTRICA"] }), NOW)).toEqual([]);
  });
  it("respeta la preferencia de género en ambos sentidos", () => {
    expect(hardFilter(req({ genderPref: "FEMALE_ONLY" }), worker({ gender: "MALE" }), NOW)).toContain("GENDER_PREF_CLIENT");
    const maleClient = req({ client: { id: "c", gender: "MALE", completedCount: 3 } });
    expect(hardFilter(maleClient, worker({ clientGenderPref: "FEMALE_ONLY" }), NOW)).toContain("GENDER_PREF_WORKER");
  });
  it("protege al período de prueba", () => {
    const newbie = worker({ completedCount: 1 });
    expect(hardFilter(req({ client: { id: "c", gender: "FEMALE", completedCount: 0 } }), newbie, NOW)).toContain("PROBATION");
    expect(hardFilter(req(), newbie, NOW)).toEqual([]);
  });
  it("urgencias exigen estar en línea con ubicación fresca", () => {
    const urgent = req({ category: "GASFITERIA", urgent: true });
    const w = worker({ categories: ["GASFITERIA"] });
    expect(hardFilter(urgent, w, NOW)).toEqual([]);
    expect(hardFilter(urgent, { ...w, lastSeenAt: new Date(NOW.getTime() - 10 * 60_000) }, NOW)).toContain("OFFLINE");
  });
  it("respeta noche, adulto en casa y distancia", () => {
    const night = new Date("2026-10-21T02:00:00Z");
    expect(hardFilter(req({ scheduledAt: night }), worker(), NOW)).toContain("NIGHT");
    const alone = req({ household: { adultsHome: false, minorsHome: false, pets: false } });
    expect(hardFilter(alone, worker({ requireAdultHome: true }), NOW)).toContain("ADULT_REQUIRED");
    expect(hardFilter(req(), worker({ base: { lat: -33.6, lng: -70.65 } }), NOW)).toContain("DISTANCE");
  });
});

describe("match: puntaje", () => {
  it("el promedio bayesiano castiga muestras chicas", () => {
    expect(bayesianRating(15, 3)).toBeLessThan(bayesianRating(490, 100));
  });
  it("prefiere a quien ya trabajó con el cliente, y nunca se elige a sí mismo", () => {
    const a = worker({ id: "a" });
    const b = worker({ id: "b", completedWithClient: 2 });
    const self = worker({ id: "client" });
    const r = match(req(), [a, b, self], NOW);
    expect(r.ranked.map((x) => x.candidate.id)).toEqual(["b", "a"]);
  });
  it("en urgencias pesa la cercanía", () => {
    const urgent = req({ category: "GASFITERIA", urgent: true });
    const near = worker({ id: "near", categories: ["GASFITERIA"], last: { lat: -33.438, lng: -70.6506 } });
    const far = worker({ id: "far", categories: ["GASFITERIA"], last: { lat: -33.48, lng: -70.65 }, ratingSum: 100 });
    expect(match(urgent, [far, near], NOW).ranked[0].candidate.id).toBe("near");
  });
  it("la cascada no repite personas y se detiene a los 5 intentos", () => {
    const r = match(req(), [worker({ id: "a" }), worker({ id: "b" })], NOW).ranked;
    expect(nextUrgentTarget(r, new Set(["a"]))?.candidate.id).toBe("b");
    expect(nextUrgentTarget(r, new Set(["a", "b"]))).toBeNull();
    expect(nextUrgentTarget(r, new Set(["1", "2", "3", "4", "5"]))).toBeNull();
  });
});

describe("máquina de estados", () => {
  it("recorre el camino feliz", () => {
    let s = transition("REQUESTED", "ACCEPT", "WORKER");
    s = transition(s, "START_ROUTE", "WORKER");
    s = transition(s, "ARRIVE", "WORKER", { arrivedInRadius: true });
    s = transition(s, "START", "WORKER", { startSelfie: true, identityConfirmed: true, pinOk: true });
    s = transition(s, "COMPLETE", "WORKER");
    expect(transition(s, "CONFIRM", "CLIENT")).toBe("SETTLED");
  });
  it("no inicia sin selfie, confirmación de identidad y PIN", () => {
    expect(() => transition("ARRIVED", "START", "WORKER", { startSelfie: true, pinOk: true })).toThrow(TransitionError);
    expect(() => transition("ARRIVED", "START", "WORKER", { identityConfirmed: true, pinOk: true })).toThrow(TransitionError);
    expect(() => transition("ARRIVED", "START", "WORKER", { startSelfie: true, identityConfirmed: true })).toThrow(TransitionError);
  });
  it("bloquea actores y estados indebidos", () => {
    expect(() => transition("REQUESTED", "ACCEPT", "CLIENT")).toThrow();
    expect(() => transition("IN_PROGRESS", "CANCEL", "CLIENT")).toThrow();
    expect(() => transition("EN_ROUTE", "ARRIVE", "WORKER", { arrivedInRadius: false })).toThrow();
    expect(() => transition("COMPLETED", "DISPUTE", "CLIENT", { withinDisputeWindow: false })).toThrow();
  });
  it("congela el pago si hay incidente abierto", () => {
    expect(() => transition("COMPLETED", "AUTO_SETTLE", "SYSTEM", { openSafetyIncident: true })).toThrow();
  });
});

describe("seguridad", () => {
  it("PIN con límite de intentos", () => {
    expect(checkPin("4821", "4821", 0)).toEqual({ ok: true, attempts: 0, locked: false });
    expect(checkPin("4821", "48211", 0).ok).toBe(false);
    expect(checkPin("4821", "0000", 4)).toEqual({ ok: false, attempts: 5, locked: true });
    expect(checkPin("4821", "4821", 5).locked).toBe(true);
  });
  it("oculta datos de contacto en el chat", () => {
    expect(redactContactInfo("llámame al +56 9 8765 4321").text).toBe("llámame al [oculto]");
    expect(redactContactInfo("mi correo es ana@mail.cl").redacted).toBe(true);
    expect(redactContactInfo("hablemos por wsp").redacted).toBe(true);
    expect(redactContactInfo("llego a las 10:30, depto 1204").redacted).toBe(false);
  });
  it("chequeo de bienestar: pregunta y luego escala", () => {
    const base = {
      id: "b",
      status: "IN_PROGRESS",
      scheduledAt: NOW,
      startedAt: new Date(NOW.getTime() - 4 * 3_600_000),
      arrivedAt: NOW,
      estimatedMinutes: 180,
      wellbeingPromptAt: null,
      wellbeingAckAt: null,
    };
    expect(wellbeingSweep([base], NOW)).toEqual([{ id: "b", kind: "PROMPT" }]);
    const prompted = { ...base, wellbeingPromptAt: new Date(NOW.getTime() - 11 * 60_000) };
    expect(wellbeingSweep([prompted], NOW)).toEqual([{ id: "b", kind: "ESCALATE" }]);
    expect(wellbeingSweep([{ ...prompted, wellbeingAckAt: NOW }], NOW)).toEqual([]);
    const late = { ...base, status: "EN_ROUTE", startedAt: null, arrivedAt: null, scheduledAt: new Date(NOW.getTime() - 3_600_000) };
    expect(wellbeingSweep([late], NOW)).toEqual([{ id: "b", kind: "LATE_ARRIVAL" }]);
  });
  it("no deja borrar la cuenta con casos pendientes o antes de 15 días", () => {
    expect(deletionBlockers({ lastServiceAt: null, openBookings: 0, openIncidents: 0, suspended: false }, NOW)).toEqual([]);
    expect(deletionBlockers({ lastServiceAt: NOW, openBookings: 0, openIncidents: 1, suspended: false }, NOW)).toHaveLength(2);
  });
  it("calificación ciega", () => {
    expect(ratingsVisible(1, NOW, NOW)).toBe(false);
    expect(ratingsVisible(2, NOW, NOW)).toBe(true);
    expect(ratingsVisible(1, new Date(NOW.getTime() - 73 * 3_600_000), NOW)).toBe(true);
  });
  it("valida RUT y teléfono chileno", () => {
    expect(validRut("11.111.111-1")).toBe(true);
    expect(validRut("12.345.678-5")).toBe(true);
    expect(validRut("12.345.678-9")).toBe(false);
    expect(normalizePhone("9 8765 4321")).toBe("+56987654321");
    expect(normalizePhone("+56 2 2345 6789")).toBeNull();
  });
});
