import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentKind } from "@prisma/client";
import { db } from "./db";
import { decrypt, encrypt, randomToken, sha256 } from "./crypto";

// shortcut: archivos cifrados en disco local; en producción usar un bucket privado (S3/R2) con el mismo cifrado.
const ROOT = path.join(process.cwd(), "storage");
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

// El tipo se decide por los bytes, no por la extensión ni por lo que declare el navegador.
export function sniffMime(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (b.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

export class UploadError extends Error {}

export async function saveUpload(
  file: File | null,
  meta: { ownerId: string; kind: DocumentKind; verificationId?: string; bookingId?: string; allowPdf?: boolean; purgeAfter?: Date },
) {
  if (!file || file.size === 0) throw new UploadError("Falta el archivo.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("El archivo supera 8 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || (mime === "application/pdf" && !meta.allowPdf)) throw new UploadError("Formato no permitido. Usa JPG, PNG o WEBP.");
  const storageKey = `${randomToken()}.bin`;
  await mkdir(ROOT, { recursive: true });
  await writeFile(path.join(ROOT, storageKey), encrypt(buf), { mode: 0o600 });
  return db.document.create({
    data: {
      ownerId: meta.ownerId,
      kind: meta.kind,
      verificationId: meta.verificationId,
      bookingId: meta.bookingId,
      storageKey,
      mime,
      sha256: sha256(buf),
      purgeAfter: meta.purgeAfter,
    },
  });
}

function safePath(key: string): string {
  if (!/^[A-Za-z0-9_-]{43}\.bin$/.test(key)) throw new Error("Clave de archivo inválida");
  return path.join(ROOT, key);
}

export async function readDocument(storageKey: string): Promise<Buffer> {
  return decrypt(await readFile(safePath(storageKey)));
}

export async function deleteDocument(id: string) {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return;
  await unlink(safePath(doc.storageKey)).catch(() => {});
  await db.document.delete({ where: { id } });
}

// Minimización (Ley 21.719): las imágenes de verificación se borran pasado su plazo; queda el resultado.
export async function purgeExpiredDocuments(now = new Date()) {
  const docs = await db.document.findMany({ where: { purgeAfter: { lt: now } }, select: { id: true } });
  for (const d of docs) await deleteDocument(d.id);
  return docs.length;
}
