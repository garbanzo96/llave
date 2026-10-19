// Máquina de estados del servicio. Toda transición pasa por aquí; las acciones del servidor
// no cambian `status` a mano.
export type Status =
  | "REQUESTED"
  | "ACCEPTED"
  | "EN_ROUTE"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SETTLED"
  | "DISPUTED"
  | "CANCELLED"
  | "EXPIRED";

export type Actor = "CLIENT" | "WORKER" | "ADMIN" | "SYSTEM";

export type Action =
  | "ACCEPT"
  | "START_ROUTE"
  | "ARRIVE"
  | "START"
  | "COMPLETE"
  | "CONFIRM"
  | "DISPUTE"
  | "CANCEL"
  | "EXPIRE"
  | "AUTO_SETTLE"
  | "RESOLVE";

type Rule = { from: Status[]; to: Status; actors: Actor[] };

const RULES: Record<Action, Rule> = {
  ACCEPT: { from: ["REQUESTED"], to: "ACCEPTED", actors: ["WORKER"] },
  START_ROUTE: { from: ["ACCEPTED"], to: "EN_ROUTE", actors: ["WORKER"] },
  ARRIVE: { from: ["EN_ROUTE"], to: "ARRIVED", actors: ["WORKER"] },
  START: { from: ["ARRIVED"], to: "IN_PROGRESS", actors: ["WORKER"] },
  COMPLETE: { from: ["IN_PROGRESS"], to: "COMPLETED", actors: ["WORKER"] },
  CONFIRM: { from: ["COMPLETED"], to: "SETTLED", actors: ["CLIENT"] },
  DISPUTE: { from: ["COMPLETED"], to: "DISPUTED", actors: ["CLIENT"] },
  CANCEL: { from: ["REQUESTED", "ACCEPTED", "EN_ROUTE", "ARRIVED"], to: "CANCELLED", actors: ["CLIENT", "WORKER", "ADMIN"] },
  EXPIRE: { from: ["REQUESTED"], to: "EXPIRED", actors: ["SYSTEM"] },
  AUTO_SETTLE: { from: ["COMPLETED"], to: "SETTLED", actors: ["SYSTEM"] },
  RESOLVE: { from: ["DISPUTED"], to: "SETTLED", actors: ["ADMIN"] },
};

export type Guards = {
  arrivedInRadius?: boolean;
  startSelfie?: boolean;
  identityConfirmed?: boolean;
  pinOk?: boolean;
  withinDisputeWindow?: boolean;
  openSafetyIncident?: boolean;
};

export class TransitionError extends Error {}

export function transition(from: Status, action: Action, actor: Actor, g: Guards = {}): Status {
  const rule = RULES[action];
  if (!rule.from.includes(from)) throw new TransitionError(`No se puede ${action} desde ${from}`);
  if (!rule.actors.includes(actor)) throw new TransitionError(`${actor} no puede ${action}`);
  if (action === "ARRIVE" && !g.arrivedInRadius) throw new TransitionError("Debes estar a menos de 200 m del domicilio");
  if (action === "START") {
    if (!g.startSelfie) throw new TransitionError("Falta la selfie de inicio");
    if (!g.identityConfirmed) throw new TransitionError("El cliente aún no confirma tu identidad");
    if (!g.pinOk) throw new TransitionError("PIN de llegada inválido");
  }
  if (action === "DISPUTE" && !g.withinDisputeWindow) throw new TransitionError("El plazo para reclamar terminó");
  // Con una emergencia abierta el pago queda congelado hasta que la central la cierre.
  if ((action === "AUTO_SETTLE" || action === "CONFIRM") && g.openSafetyIncident)
    throw new TransitionError("Hay un incidente de seguridad abierto");
  return rule.to;
}

export const ACTIVE_STATUSES: Status[] = ["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"];
export const DISPUTE_WINDOW_MS = 48 * 3_600_000;

export const STATUS_LABEL: Record<Status, string> = {
  REQUESTED: "Buscando",
  ACCEPTED: "Confirmado",
  EN_ROUTE: "En camino",
  ARRIVED: "En la puerta",
  IN_PROGRESS: "En curso",
  COMPLETED: "Terminado",
  SETTLED: "Pagado",
  DISPUTED: "En revisión",
  CANCELLED: "Cancelado",
  EXPIRED: "Sin respuesta",
};
