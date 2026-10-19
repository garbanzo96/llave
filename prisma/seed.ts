import { PrismaClient, type Prisma } from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("El seed de demostración no se puede ejecutar en producción.");
}

const db = new PrismaClient();
const now = new Date();
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
const approved = (kind: "IDENTITY" | "CRIMINAL_RECORD" | "MINORS_REGISTRY"): Prisma.VerificationCreateWithoutUserInput => ({
  kind, status: "APPROVED", reviewedAt: now, expiresAt: inDays(180),
});

const workers: Prisma.UserCreateInput[] = [
  {
    name: "María José Soto Pinto", phone: "+56944444444", role: "WORKER", gender: "FEMALE", status: "ACTIVE",
    completedCount: 42, ratingSum: 202, ratingCount: 42,
    worker: { create: { categories: JSON.stringify(["LIMPIEZA"]), hourlyRate: 6500, baseLat: -33.4569, baseLng: -70.5979, radiusKm: 10, offersSeen: 50, offersAccepted: 44, bio: "Limpieza profunda y de mantención. 8 años de experiencia en casas y departamentos." } },
  },
  {
    name: "Rosa Huenchumilla Lagos", phone: "+56955555555", role: "WORKER", gender: "FEMALE", status: "ACTIVE",
    completedCount: 2, ratingSum: 10, ratingCount: 2,
    worker: { create: { categories: JSON.stringify(["LIMPIEZA", "JARDINERIA"]), hourlyRate: 6000, baseLat: -33.4300, baseLng: -70.6200, radiusKm: 8 } },
  },
  {
    name: "Jorge Muñoz Díaz", phone: "+56966666666", role: "WORKER", gender: "MALE", status: "ACTIVE",
    completedCount: 75, ratingSum: 360, ratingCount: 75,
    worker: { create: { categories: JSON.stringify(["GASFITERIA", "GAS"]), visitFee: 18000, hourlyRate: 15000, baseLat: -33.4400, baseLng: -70.6150, radiusKm: 12, online: true, lastLat: -33.4290, lastLng: -70.6130, lastSeenAt: now, offersSeen: 90, offersAccepted: 80 } },
    verifications: { create: [{ kind: "SEC_LICENSE", status: "APPROVED", reviewedAt: now, data: JSON.stringify({ license: "SEC_GAS", number: "G-123456" }), expiresAt: inDays(365) }] },
  },
  {
    name: "Pedro Araya Contreras", phone: "+56977777777", role: "WORKER", gender: "MALE", status: "ACTIVE",
    completedCount: 30, ratingSum: 141, ratingCount: 30,
    worker: { create: { categories: JSON.stringify(["ELECTRICIDAD"]), visitFee: 20000, baseLat: -33.4500, baseLng: -70.6000, radiusKm: 15, nightOk: true } },
    verifications: { create: [{ kind: "SEC_LICENSE", status: "APPROVED", reviewedAt: now, data: JSON.stringify({ license: "SEC_ELECTRICA", number: "E-654321" }), expiresAt: inDays(365) }] },
  },
];

async function main() {
  await db.$transaction(async tx => {
    await tx.locationPing.deleteMany();
    await tx.safetyIncident.deleteMany();
    await tx.document.deleteMany();
    await tx.rating.deleteMany();
    await tx.message.deleteMany();
    await tx.payment.deleteMany();
    await tx.quote.deleteMany();
    await tx.offer.deleteMany();
    await tx.booking.deleteMany();
    await tx.block.deleteMany();
    await tx.trustedContact.deleteMany();
    await tx.address.deleteMany();
    await tx.verification.deleteMany();
    await tx.session.deleteMany();
    await tx.workerProfile.deleteMany();
    await tx.clientProfile.deleteMany();
    await tx.otpChallenge.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.user.deleteMany();

    await tx.user.create({ data: { phone: "+56900000001", name: "Central Llave", role: "ADMIN", status: "ACTIVE" } });
    await tx.user.create({ data: {
      name: "Camila Rojas Vega", phone: "+56911111111", gender: "FEMALE", role: "CLIENT", status: "ACTIVE", rut: "11111111-1", completedCount: 3,
      client: { create: {} },
      verifications: { create: [approved("IDENTITY")] },
      addresses: { create: { label: "Casa", line: "Av. Providencia 1234, depto 501", comuna: "Providencia", lat: -33.4263, lng: -70.6110 } },
      trustedContacts: { create: { name: "Andrea Rojas", phone: "+56922222222" } },
    } });
    await tx.user.create({ data: {
      name: "Luis Pérez Soto", phone: "+56933333333", gender: "MALE", role: "CLIENT", status: "PENDING_VERIFICATION",
      client: { create: {} }, verifications: { create: { kind: "IDENTITY", status: "PENDING", challengeCode: "4821" } },
    } });
    for (const data of workers) {
      const worker = await tx.user.create({ data });
      await tx.verification.createMany({ data: (["IDENTITY", "CRIMINAL_RECORD", "MINORS_REGISTRY"] as const).map(kind => ({
        userId: worker.id, kind, status: "APPROVED", reviewedAt: now, expiresAt: inDays(180),
      })) });
    }
    await tx.user.create({ data: {
      name: "Carolina Fuentes Mella", phone: "+56988888888", gender: "FEMALE", role: "WORKER", status: "PENDING_VERIFICATION",
      worker: { create: { categories: JSON.stringify(["LIMPIEZA"]), hourlyRate: 7000 } },
      verifications: { create: [approved("IDENTITY"), { kind: "CRIMINAL_RECORD", status: "PENDING", data: JSON.stringify({ folio: "ABCD-1234-EFGH" }) }] },
    } });

    const users = await tx.user.findMany({ include: { worker: true, client: true, verifications: true } });
    if (users.length !== 8 || users.filter(u => u.worker).length !== 5 || users.filter(u => u.client).length !== 2) {
      throw new Error("El seed no creó todas las cuentas y perfiles esperados.");
    }
    for (const worker of users.filter(u => u.role === "WORKER" && u.status === "ACTIVE")) {
      if (!worker.worker || !JSON.parse(worker.worker.categories).length || !["IDENTITY", "CRIMINAL_RECORD", "MINORS_REGISTRY"].every(kind => worker.verifications.some(v => v.kind === kind && v.status === "APPROVED" && v.expiresAt && v.expiresAt > now))) {
        throw new Error(`Verificaciones o perfil incompletos: ${worker.name}`);
      }
    }
  });
  const users = await db.user.findMany({ orderBy: { phone: "asc" }, select: { role: true, name: true, phone: true } });
  console.table(users.map(u => ({ Rol: u.role === "ADMIN" ? "Central" : u.role === "CLIENT" ? "Cliente" : "Trabajador/a", Nombre: u.name, Teléfono: u.phone })));
  console.log("En desarrollo, el código OTP aparece en pantalla al iniciar sesión.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
