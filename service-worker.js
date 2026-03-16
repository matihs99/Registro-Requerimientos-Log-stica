const CACHE = 'req-logisticos-v1';

// Archivos del shell de la app que se cachean al instalar
const SHELL = [
  './index.html',
  './manifest.json',
  './icon.svg'
];

// Al instalar: cachear el shell inmediatamente
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
});

// Al activar: eliminar caches viejos
self.addEventListener('activate', e => {
  self.clients.claim();
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

// Estrategia de fetch:
// - Firestore API: dejar pasar sin interceptar (Firebase maneja offline)
// - Todo lo demás: cache-first con actualización en background
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // No interceptar llamadas a Firestore/Firebase (las maneja el SDK)
  if (e.request.url.includes('firestore.googleapis.com') ||
      e.request.url.includes('firebase.googleapis.com') ||
      e.request.url.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      // Intentar actualizar en background
      const networkFetch = fetch(e.request).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(e.request, res.clone());
        }
        return res;
      }).catch(() => null);

      // Si hay cache, devolver inmediatamente y actualizar en background
      if (cached) {
        networkFetch; // fire & forget
        return cached;
      }

      // Si no hay cache, esperar la red
      const networkRes = await networkFetch;
      if (networkRes) return networkRes;

      // Sin cache ni red: devolver el index.html (para navegación)
      if (e.request.mode === 'navigate') {
        return cache.match('./index.html');
      }
    })
  );
});
