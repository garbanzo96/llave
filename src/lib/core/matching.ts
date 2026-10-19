// Match en dos pasos. Primero filtros duros: la seguridad y la competencia no se compensan con puntaje.
// Después un puntaje entre quienes pasan. Cada rechazo deja su motivo para auditoría y para
// la página de transparencia del trabajador (Ley 21.431).
import { CATEGORIES, type Category, type License } from "./categories";
import { distanceKm, isNight, type Point } from "./geo";

export type Gender = "FEMALE" | "MALE" | "OTHER" | "UNDISCLOSED";
export type GenderPref = "ANY" | "FEMALE_ONLY";

export type Household = { adultsHome: boolean; minorsHome: boolean; pets: boolean };

export type MatchRequest = {
  category: Category;
  urgent: boolean;
  location: Point;
  scheduledAt: Date;
  genderPref: GenderPref;
  household: Household;
  client: { id: string; gender: Gender; completedCount: number };
};

export type Candidate = {
  id: string;
  active: boolean;
  gender: Gender;
  categories: Category[];
  // Verificaciones aprobadas y vigentes al momento del servicio.
  identityOk: boolean;
  criminalRecordOk: boolean;
  minorsRegistryOk: boolean;
  licenses: License[];
  base: Point | null;
  radiusKm: number;
  online: boolean;
  last: Point | null;
  lastSeenAt: Date | null;
  nightOk: boolean;
  clientGenderPref: GenderPref;
  requireAdultHome: boolean;
  busy: boolean;
  blocked: boolean;
  completedCount: number;
  ratingSum: number;
  ratingCount: number;
  cancelCount: number;
  lateCount: number;
  offersSeen: number;
  offersAccepted: number;
  completedWithClient: number;
};

export type Rejection =
  | "INACTIVE"
  | "CATEGORY"
  | "IDENTITY"
  | "CRIMINAL_RECORD"
  | "MINORS_REGISTRY"
  | "LICENSE"
  | "BLOCKED"
  | "GENDER_PREF_CLIENT"
  | "GENDER_PREF_WORKER"
  | "ADULT_REQUIRED"
  | "NIGHT"
  | "PROBATION"
  | "OFFLINE"
  | "BUSY"
  | "DISTANCE";

export const PROBATION_SERVICES = 5;
export const LOCATION_FRESH_MS = 5 * 60_000;

export function hardFilter(req: MatchRequest, c: Candidate, now: Date): Rejection[] {
  const out: Rejection[] = [];
  const info = CATEGORIES[req.category];
  const night = isNight(req.scheduledAt);
  if (!c.active) out.push("INACTIVE");
  if (!c.categories.includes(req.category)) out.push("CATEGORY");
  if (!c.identityOk) out.push("IDENTITY");
  if (!c.criminalRecordOk) out.push("CRIMINAL_RECORD");
  if (!c.minorsRegistryOk) out.push("MINORS_REGISTRY");
  if (info.requiredLicense && !c.licenses.includes(info.requiredLicense)) out.push("LICENSE");
  if (c.blocked) out.push("BLOCKED");
  if (req.genderPref === "FEMALE_ONLY" && c.gender !== "FEMALE") out.push("GENDER_PREF_CLIENT");
  if (c.clientGenderPref === "FEMALE_ONLY" && req.client.gender !== "FEMALE") out.push("GENDER_PREF_WORKER");
  if (c.requireAdultHome && !req.household.adultsHome) out.push("ADULT_REQUIRED");
  if (night && !c.nightOk) out.push("NIGHT");
  // Período de prueba: ni clientes sin historial ni urgencias nocturnas.
  const probation = c.completedCount < PROBATION_SERVICES;
  if (probation && (req.client.completedCount < 1 || (req.urgent && night))) out.push("PROBATION");
  if (c.busy) out.push("BUSY");

  const from = req.urgent ? c.last : c.base;
  if (req.urgent) {
    const fresh = c.lastSeenAt && now.getTime() - c.lastSeenAt.getTime() <= LOCATION_FRESH_MS;
    if (!c.online || !fresh || !c.last) out.push("OFFLINE");
  }
  if (!from || distanceKm(from, req.location) > c.radiusKm) {
    if (!out.includes("OFFLINE")) out.push("DISTANCE");
  }
  return out;
}

// Promedio bayesiano: pocas reseñas perfectas no le ganan a cien buenas.
export const PRIOR_MEAN = 4.6;
export const PRIOR_WEIGHT = 5;

export function bayesianRating(sum: number, count: number): number {
  return (PRIOR_MEAN * PRIOR_WEIGHT + sum) / (PRIOR_WEIGHT + count);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export type ScoreBreakdown = {
  proximity: number;
  quality: number;
  reliability: number;
  acceptance: number;
  relationship: number;
  fairness: number;
  total: number;
  distanceKm: number;
};

export const WEIGHTS = {
  scheduled: { proximity: 0.25, quality: 0.3, reliability: 0.2, acceptance: 0, relationship: 0.15, fairness: 0.1 },
  urgent: { proximity: 0.45, quality: 0.2, reliability: 0.15, acceptance: 0.15, relationship: 0, fairness: 0.05 },
} as const;

export function score(req: MatchRequest, c: Candidate): ScoreBreakdown {
  const from = (req.urgent ? c.last : c.base) ?? req.location;
  const d = distanceKm(from, req.location);
  const parts = {
    proximity: clamp01(1 - d / Math.max(c.radiusKm, 0.1)),
    quality: clamp01((bayesianRating(c.ratingSum, c.ratingCount) - 3) / 2),
    reliability: clamp01(1 - (c.cancelCount + 0.5 * c.lateCount) / (c.completedCount + c.cancelCount + 1)),
    acceptance: (c.offersAccepted + 1) / (c.offersSeen + 2),
    relationship: c.completedWithClient > 0 ? 1 : 0,
    fairness: clamp01(1 - c.completedCount / 10),
  };
  const w = req.urgent ? WEIGHTS.urgent : WEIGHTS.scheduled;
  const total =
    parts.proximity * w.proximity +
    parts.quality * w.quality +
    parts.reliability * w.reliability +
    parts.acceptance * w.acceptance +
    parts.relationship * w.relationship +
    parts.fairness * w.fairness;
  return { ...parts, total, distanceKm: d };
}

export type Ranked = { candidate: Candidate; score: ScoreBreakdown };
export type MatchResult = { ranked: Ranked[]; rejected: { id: string; reasons: Rejection[] }[] };

export function match(req: MatchRequest, candidates: Candidate[], now: Date): MatchResult {
  const ranked: Ranked[] = [];
  const rejected: MatchResult["rejected"] = [];
  for (const c of candidates) {
    if (c.id === req.client.id) continue;
    const reasons = hardFilter(req, c, now);
    if (reasons.length) rejected.push({ id: c.id, reasons });
    else ranked.push({ candidate: c, score: score(req, c) });
  }
  ranked.sort((a, b) => b.score.total - a.score.total || a.candidate.id.localeCompare(b.candidate.id));
  return { ranked, rejected };
}

// Urgencias: se ofrece a una persona a la vez, 45 segundos cada una, hasta 5 intentos.
export const URGENT_OFFER_MS = 45_000;
export const URGENT_MAX_ATTEMPTS = 5;

export function nextUrgentTarget(ranked: Ranked[], alreadyOffered: Set<string>): Ranked | null {
  if (alreadyOffered.size >= URGENT_MAX_ATTEMPTS) return null;
  return ranked.find((r) => !alreadyOffered.has(r.candidate.id)) ?? null;
}
