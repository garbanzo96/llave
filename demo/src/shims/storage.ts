// Archivos de la demo: se guardan en IndexedDB y el service worker (public/sw.js) los sirve en /api/files/:id.
import type { DocumentKind } from "@prisma/client";
import { db } from "@/server/db";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export class UploadError extends Error {}

const STORE = "files";
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("llave-demo", 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void) {
  const d = await idb();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    fn(t.objectStore(STORE));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export function sniffMime(b: Uint8Array): string | null {
  const s = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && s(1, 4) === "PNG") return "image/png";
  if (s(0, 4) === "RIFF" && s(8, 12) === "WEBP") return "image/webp";
  if (s(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export async function saveUpload(
  file: File | null,
  meta: { ownerId: string; kind: DocumentKind; verificationId?: string; bookingId?: string; allowPdf?: boolean; purgeAfter?: Date },
) {
  if (!file || file.size === 0) throw new UploadError("Falta el archivo.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("El archivo supera 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || (mime === "application/pdf" && !meta.allowPdf)) throw new UploadError("Formato no permitido. Usa JPG, PNG o WEBP.");
  const doc = await db.document.create({
    data: { ownerId: meta.ownerId, kind: meta.kind, verificationId: meta.verificationId, bookingId: meta.bookingId, storageKey: crypto.randomUUID(), mime, sha256: "", purgeAfter: meta.purgeAfter },
  });
  await tx("readwrite", (s) => s.put(new Blob([bytes], { type: mime }), doc.id));
  return doc;
}

export async function readDocument(): Promise<never> {
  throw new Error("En la demo los archivos se leen por /api/files/:id");
}

export async function deleteDocument(id: string) {
  await db.document.deleteMany({ where: { id } });
  await tx("readwrite", (s) => s.delete(id));
}

export async function purgeExpiredDocuments(now = new Date()) {
  const docs = await db.document.findMany({ where: { purgeAfter: { lt: now } }, select: { id: true } });
  for (const d of docs) await deleteDocument(d.id as string);
  return docs.length;
}
