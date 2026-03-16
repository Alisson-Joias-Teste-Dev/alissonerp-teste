const CACHE = "alisson-motoboy-v1";
const OFFLINE_URLS = ["/protocolo", "/login"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(OFFLINE_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Cache-first para assets estáticos, network-first para API
  if (e.request.url.includes("/api/") || e.request.url.includes("supabase")) {
    return; // deixa passar para a rede
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
