const CACHE_NAME = 'alisson-erp-v2.4.0';

const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/logo.leaoverde.webp',
];

// ── Install — pré-cachear assets estáticos ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// ── Activate — limpar caches antigos ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch — network-first (ERP: dados frescos têm prioridade) ──────────────
self.addEventListener('fetch', (event) => {
  // Ignorar requisições não-GET
  if (event.request.method !== 'GET') return;

  // Ignorar chamadas de API, Supabase, e schemes não-http
  const url = event.request.url;
  if (
    !url.startsWith('http') ||
    url.includes('/api/') ||
    url.includes('supabase') ||
    url.includes('_next/webpack-hmr') ||
    url.includes('chrome-extension')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guard: só cachear responses válidas (basic = mesma origem, status 200)
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => {
        // Offline: tentar servir do cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Navegação sem cache → página offline
          if (event.request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          // Outros recursos sem cache → response vazia válida (evita "Failed to convert value to Response")
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
