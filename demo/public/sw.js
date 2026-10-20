// Sirve /api/files/:id desde IndexedDB, como hace la ruta de la app real con el almacenamiento cifrado.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

function readFile(id) {
  return new Promise((resolve) => {
    const req = indexedDB.open("llave-demo", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const get = req.result.transaction("files").objectStore("files").get(id);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => resolve(null);
    };
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const files = url.pathname.match(/\/api\/files\/([^/]+)$/);
  if (files) {
    event.respondWith(
      readFile(decodeURIComponent(files[1])).then((blob) =>
        blob ? new Response(blob, { headers: { "Content-Type": blob.type, "Cache-Control": "no-store" } }) : new Response("No encontrado", { status: 404 }),
      ),
    );
    return;
  }
  if (url.pathname.endsWith("/api/cuenta/exportar")) {
    event.respondWith(
      new Response(JSON.stringify({ aviso: "En la demo los datos viven en tu navegador. La exportación completa funciona en la app real." }, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
    );
  }
});
