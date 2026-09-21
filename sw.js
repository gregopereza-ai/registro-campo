const CACHE_NAME = "zogoibi-registro-v48";
const ARCHIVOS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./ficha.js",
  "./clima.js",
  "./papelera.js",
  "./feed.js",
  "./poscosecha.js",
  "./reporte.js",
  "./contratistas.js",
  "./auth.js",
  "./firebase-config.js",
  "./lotes.js",
  "./lotes.kml",
  "./manifest.json",
  "./icon.png",
  "./jspdf.umd.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARCHIVOS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

// Red primero (para que las actualizaciones lleguen enseguida con internet);
// si falla (sin señal en el campo), se usa la última copia guardada.
// "reload" fuerza a saltarse también la caché HTTP normal del navegador (no solo la
// nuestra) — sin esto, un archivo nuevo en el servidor a veces seguía sirviéndose
// viejo desde la caché del propio navegador aunque esta caché ya estuviera al día.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request, { cache: "reload" })
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});
