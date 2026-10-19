import { NextResponse } from "next/server";
import { currentUser } from "@/server/auth";
import { audit, db } from "@/server/db";
import { readDocument } from "@/server/storage";

// Autorización por documento. Cédulas y certificados: solo su dueño y la central (con auditoría).
// Foto de perfil: cualquier sesión (se muestra al elegir a alguien). Fotos del servicio: solo sus participantes.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });
  const doc = await db.document.findUnique({ where: { id }, include: { booking: { select: { clientId: true, workerId: true } } } });
  if (!doc) return new NextResponse("No encontrado", { status: 404 });

  const isOwner = doc.ownerId === user.id;
  const isAdmin = user.role === "ADMIN";
  const inBooking = !!doc.booking && (doc.booking.clientId === user.id || doc.booking.workerId === user.id);
  const allowed =
    isOwner ||
    isAdmin ||
    doc.kind === "PROFILE_PHOTO" ||
    (inBooking && ["START_SELFIE", "PHOTO_BEFORE", "PHOTO_AFTER"].includes(doc.kind));
  if (!allowed) return new NextResponse("No encontrado", { status: 404 });
  if (isAdmin && !isOwner && doc.kind !== "PROFILE_PHOTO") await audit(user.id, "document_viewed", "Document", doc.id, { kind: doc.kind });

  const body = await readDocument(doc.storageKey);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
