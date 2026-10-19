// Pago en custodia: se autoriza al reservar, se captura al terminar y se libera al trabajador
// cuando el cliente confirma o vence el plazo de reclamo.
// shortcut: proveedor simulado; para lanzar, implementar estas cinco funciones con Mercado Pago o Flow
// (pagos divididos) usando sus webhooks firmados. La interfaz no cambia.
import type { Prisma } from "@prisma/client";
import { randomToken } from "./crypto";
import { split } from "@/lib/core/pricing";

type Tx = Prisma.TransactionClient;

export async function authorize(tx: Tx, bookingId: string, amount: number) {
  return tx.payment.create({
    data: { bookingId, provider: "simulado", providerRef: `sim_${randomToken().slice(0, 16)}`, status: "AUTHORIZED", authorizedAmount: amount },
  });
}

export async function adjustAuthorization(tx: Tx, bookingId: string, amount: number) {
  return tx.payment.update({ where: { bookingId }, data: { authorizedAmount: amount } });
}

export async function capture(tx: Tx, bookingId: string, amount: number, commissionRate: number) {
  const { platformFee, workerPayout } = split(amount, commissionRate);
  return tx.payment.update({ where: { bookingId }, data: { status: "CAPTURED", capturedAmount: amount, platformFee, workerPayout } });
}

export async function release(tx: Tx, bookingId: string) {
  return tx.payment.update({ where: { bookingId }, data: { status: "RELEASED" } });
}

export async function refund(tx: Tx, bookingId: string, refundAmount: number, commissionRate: number) {
  const p = await tx.payment.findUniqueOrThrow({ where: { bookingId } });
  const kept = Math.max(0, p.capturedAmount - refundAmount);
  const { platformFee, workerPayout } = split(kept, commissionRate);
  return tx.payment.update({
    where: { bookingId },
    data: { status: kept === 0 ? "REFUNDED" : "RELEASED", capturedAmount: kept, platformFee, workerPayout },
  });
}

export async function voidOrCharge(tx: Tx, bookingId: string, fee: number) {
  if (fee > 0) {
    // La multa por cancelación tardía va íntegra al trabajador.
    return tx.payment.update({ where: { bookingId }, data: { status: "RELEASED", capturedAmount: fee, platformFee: 0, workerPayout: fee } });
  }
  return tx.payment.update({ where: { bookingId }, data: { status: "VOIDED" } });
}
