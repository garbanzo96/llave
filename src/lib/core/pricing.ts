import { CATEGORIES, type Category } from "./categories";

export const URGENT_SURCHARGE = 0.3;
export const BASE_COMMISSION = 0.15;
// Comisión menor cuando cliente y trabajador ya se conocen: incentivo para no salir de la app.
export const RECURRENT_COMMISSION = 0.1;
export const RECURRENT_THRESHOLD = 2;
export const LATE_CANCEL_FEE = 0.2;

export type Rates = { hourlyRate: number; visitFee: number };

export type Quote = {
  base: number;
  surcharge: number;
  total: number;
  billableHours: number;
};

export function billableHours(category: Category, minutes: number): number {
  const hours = Math.ceil((minutes / 60) * 2) / 2;
  return Math.max(CATEGORIES[category].minHours, hours);
}

export function quote(category: Category, urgent: boolean, minutes: number, rates: Rates): Quote {
  const info = CATEGORIES[category];
  const hours = billableHours(category, minutes);
  const base = info.pricing === "HOURLY" ? Math.round(rates.hourlyRate * hours) : rates.visitFee;
  const surcharge = urgent ? Math.round(base * URGENT_SURCHARGE) : 0;
  return { base, surcharge, total: base + surcharge, billableHours: hours };
}

export function commissionRate(previousCompletedTogether: number): number {
  return previousCompletedTogether >= RECURRENT_THRESHOLD ? RECURRENT_COMMISSION : BASE_COMMISSION;
}

export function split(total: number, rate: number): { platformFee: number; workerPayout: number } {
  const platformFee = Math.round(total * rate);
  return { platformFee, workerPayout: total - platformFee };
}

// Cancelar con menos de 2 horas de aviso paga una parte al trabajador, que ya reservó ese tiempo.
export function cancellationFee(total: number, scheduledAt: Date, now: Date, cancelledBy: "CLIENT" | "WORKER"): number {
  if (cancelledBy === "WORKER") return 0;
  const hoursLeft = (scheduledAt.getTime() - now.getTime()) / 3_600_000;
  return hoursLeft < 2 ? Math.round(total * LATE_CANCEL_FEE) : 0;
}

export function clp(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}
