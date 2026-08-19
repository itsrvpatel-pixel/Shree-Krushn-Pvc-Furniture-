// Minimal service worker: just enough for the app to qualify as a real,
// installable PWA (required for good Play Store packaging via
// PWABuilder, and generally good practice) - caches the app shell so
// a repeat visit loads instantly and the app opens even with no
// network for a moment, without trying to cache API/Firestore
// traffic (which must always be live, never served stale from cache).
const CACHE_NAME = 'skpvc-shell-v1';
const APP_SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle simple same-origin GET requests for the app shell -
  // everything else (Firestore, Storage, any API call) passes straight
  // through to the network untouched, so live data is never served
  // from a stale cache.
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match('/'));
    })
  );
});
