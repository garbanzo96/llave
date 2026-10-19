import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweep } from "@/server/services/marketplace";

// Llamar cada minuto desde un cron externo con el encabezado Authorization: Bearer $CRON_SECRET.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const ok = secret.length >= 32 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new NextResponse("No autorizado", { status: 401 });
  await sweep(true);
  return NextResponse.json({ ok: true });
}
