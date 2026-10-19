// Prueba de integración: recorre el servicio completo contra una base SQLite temporal.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, User } from "@prisma/client";

const dir = mkdtempSync(path.join(tmpdir(), "llave-test-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.DATA_KEY = "a".repeat(64);

let db: PrismaClient;
let m: typeof import("./services/marketplace");
let client: User;
let worker: User;
let rival: User;
let addressId: string;

const HOME = { lat: -33.4263, lng: -70.611 };
const JPEG = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])], "x.jpg", { type: "image/jpeg" });
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
// Mediodía en Santiago: evita que el filtro nocturno descarte a todos según la hora en que corra la prueba.
const noon = (n: number) => {
  const d = days(n);
  d.setUTCHours(15, 0, 0, 0);
  return d;
};

async function makeWorker(phone: string, name: string) {
  return db.user.create({
    data: {
      phone,
      name,
      role: "WORKER",
      status: "ACTIVE",
      gender: "FEMALE",
      completedCount: 20,
      worker: { create: { categories: JSON.stringify(["LIMPIEZA"]), hourlyRate: 6000, baseLat: -33.43, baseLng: -70.61, radiusKm: 10 } },
      verifications: {
        create: ["IDENTITY", "CRIMINAL_RECORD", "MINORS_REGISTRY"].map((kind) => ({
          kind: kind as "IDENTITY",
          status: "APPROVED" as const,
          expiresAt: days(180),
        })),
      },
    },
  });
}

const request = () => ({
  category: "LIMPIEZA" as const,
  urgent: false,
  addressId,
  scheduledAt: noon(1),
  minutes: 180,
  description: "",
  household: { adultsHome: true, minorsHome: false, pets: false },
  genderPref: "ANY" as const,
});

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
  ({ db } = await import("./db"));
  m = await import("./services/marketplace");
  client = await db.user.create({
    data: { phone: "+56911111111", name: "Camila Rojas", role: "CLIENT", status: "ACTIVE", gender: "FEMALE", completedCount: 2, client: { create: {} } },
  });
  addressId = (await db.address.create({ data: { userId: client.id, label: "Casa", line: "Av. Providencia 1234", comuna: "Providencia", ...HOME } })).id;
  worker = await makeWorker("+56944444444", "María Soto");
  rival = await makeWorker("+56955555555", "Rosa Lagos");
}, 60_000);

afterAll(async () => {
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("servicio agendado de punta a punta", () => {
  let bookingId: string;

  it("el cliente ve a ambas trabajadoras y no puede forzar a alguien fuera del match", async () => {
    const found = await m.searchWorkers(client, request());
    expect(found.map((f) => f.id).sort()).toEqual([worker.id, rival.id].sort());
    expect(found[0].price.total).toBe(18000);
    await expect(m.requestBooking(client, request(), client.id)).rejects.toThrow(/ya no está disponible/);
  });

  it("reserva, autoriza el pago y ofrece a la elegida", async () => {
    const b = await m.requestBooking(client, request(), worker.id);
    bookingId = b.id;
    const pay = await db.payment.findUniqueOrThrow({ where: { bookingId } });
    expect(pay).toMatchObject({ status: "AUTHORIZED", authorizedAmount: 18000 });
    expect(await db.offer.count({ where: { bookingId, workerId: worker.id, status: "PENDING" } })).toBe(1);
  });

  it("otra trabajadora no puede tocar el servicio", async () => {
    await expect(m.startRoute(rival, bookingId)).rejects.toThrow();
  });

  it("acepta, va en camino y no puede marcar llegada lejos del domicilio", async () => {
    const offer = await db.offer.findFirstOrThrow({ where: { bookingId } });
    await m.respondOffer(worker, offer.id, true);
    await m.startRoute(worker, bookingId);
    await expect(m.arrive(worker, bookingId, -33.45, -70.6)).rejects.toThrow(/200 m/);
    await m.arrive(worker, bookingId, HOME.lat + 0.0005, HOME.lng);
  });

  it("no inicia sin selfie ni confirmación de identidad, aunque el PIN sea correcto", async () => {
    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await expect(m.startWithPin(worker, bookingId, b.arrivalPin)).rejects.toThrow(/selfie/);
    await m.uploadStartSelfie(worker, bookingId, JPEG());
    await expect(m.startWithPin(worker, bookingId, b.arrivalPin)).rejects.toThrow(/confirma/);
    await m.confirmIdentity(client, bookingId, true);
    await expect(m.startWithPin(worker, bookingId, "0000" === b.arrivalPin ? "1111" : "0000")).rejects.toThrow(/PIN incorrecto/);
    await m.startWithPin(worker, bookingId, b.arrivalPin);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("IN_PROGRESS");
  });

  it("el chat oculta el teléfono", async () => {
    await m.sendMessage(worker, bookingId, "escríbeme al +56 9 8765 4321");
    const msg = await db.message.findFirstOrThrow({ where: { bookingId } });
    expect(msg).toMatchObject({ body: "escríbeme al [oculto]", redacted: true });
  });

  it("termina con foto, captura, y libera el pago al confirmar", async () => {
    await expect(m.complete(worker, bookingId)).rejects.toThrow(/foto/);
    await m.uploadWorkPhoto(worker, bookingId, JPEG(), "AFTER");
    await m.complete(worker, bookingId);
    expect(await db.payment.findUniqueOrThrow({ where: { bookingId } })).toMatchObject({ status: "CAPTURED", capturedAmount: 18000, platformFee: 2700, workerPayout: 15300 });
    await m.confirmService(client, bookingId);
    expect((await db.payment.findUniqueOrThrow({ where: { bookingId } })).status).toBe("RELEASED");
  });

  it("calificación ciega: la nota se suma recién cuando ambos califican", async () => {
    await m.rate(client, bookingId, 5, "", true);
    expect((await db.user.findUniqueOrThrow({ where: { id: worker.id } })).ratingCount).toBe(0);
    await m.rate(worker, bookingId, 4, "", false);
    expect((await db.user.findUniqueOrThrow({ where: { id: worker.id } })).ratingCount).toBe(1);
    expect(await db.safetyIncident.count({ where: { bookingId, kind: "FELT_UNSAFE" } })).toBe(1);
  });

  it("después de desvincular, la trabajadora ya no aparece", async () => {
    await m.block(client, worker.id, "");
    const found = await m.searchWorkers(client, request());
    expect(found.map((f) => f.id)).toEqual([rival.id]);
  });
});

describe("abusos", () => {
  it("5 PIN fallidos bloquean y abren incidente", async () => {
    const b = await m.requestBooking(client, { ...request(), scheduledAt: noon(2) }, rival.id);
    const offer = await db.offer.findFirstOrThrow({ where: { bookingId: b.id } });
    await m.respondOffer(rival, offer.id, true);
    await m.startRoute(rival, b.id);
    await m.arrive(rival, b.id, HOME.lat, HOME.lng);
    await m.uploadStartSelfie(rival, b.id, JPEG());
    await m.confirmIdentity(client, b.id, true);
    const wrong = b.arrivalPin === "9999" ? "8888" : "9999";
    for (let i = 0; i < 4; i++) await expect(m.startWithPin(rival, b.id, wrong)).rejects.toThrow(/incorrecto/);
    await expect(m.startWithPin(rival, b.id, wrong)).rejects.toThrow(/bloqueado/);
    await expect(m.startWithPin(rival, b.id, b.arrivalPin)).rejects.toThrow(/bloqueado/);
    expect(await db.safetyIncident.count({ where: { bookingId: b.id, kind: "PIN_LOCKOUT" } })).toBe(1);
  });

  it("un cliente sin verificar no puede reservar", async () => {
    const unverified = await db.user.create({ data: { phone: "+56933333333", name: "Luis Pérez", role: "CLIENT", client: { create: {} } } });
    await expect(m.requestBooking(unverified, request(), rival.id)).rejects.toThrow(/Verifica/);
  });

  it("un antecedente vencido saca a la trabajadora del match", async () => {
    await db.verification.updateMany({ where: { userId: rival.id, kind: "CRIMINAL_RECORD" }, data: { expiresAt: days(-1) } });
    expect(await m.searchWorkers(client, { ...request(), scheduledAt: noon(3) })).toEqual([]);
  });
});
