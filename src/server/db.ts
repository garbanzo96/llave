import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export async function audit(actorId: string | null, action: string, targetType: string, targetId: string, meta: object = {}) {
  await db.auditLog.create({ data: { actorId, action, targetType, targetId, meta: JSON.stringify(meta) } });
}

export function parseJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
