// Minimal service worker: just enough for the app to qualify as a real,
// installable PWA (required for good Play Store packaging via
// PWABuilder, and generally good practice).
//
// CACHE_NAME bumped to v2 here specifically to force every existing
// install to drop its old cached copy of '/' - the previous version
// cached the HTML shell cache-first, which meant every deploy after
// the service worker first installed kept getting silently ignored:
// visitors kept being served the ORIGINAL index.html (referencing that
// day's JS bundle) indefinitely, since a cache hit was always returned
// before ever checking the network. That's exactly what looked like
// "data/fixes disappearing" - it wasn't gone, it was never being
// loaded, because the browser was still running whatever version was
// live the moment this service worker first installed.
const CACHE_NAME = 'skpvc-shell-v2';
const APP_SHELL = ['/manifest.json', '/icon-192.png', '/icon-512.png'];

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
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never come between the page and an API call. There is nothing here
  // worth caching, and standing in the path turns any hiccup into
  // "FetchEvent.respondWith received an error: Load failed" - which is
  // what killed 31 photos of a 1506-photo thumbnail run that was
  // pulling roughly a gigabyte through /api/img over mobile. Left to
  // itself the browser would simply have retried.
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests (the page itself - '/', any route) and the
  // JS/CSS bundle Vite builds are ALWAYS fetched from the network
  // first, falling back to a cached copy only when genuinely offline -
  // never cache-first here, since Vite gives each deploy's bundle a
  // new hashed filename and the page needs today's filenames, not
  // whatever was live when this service worker first installed. This
  // is the fix for the stale-deploy bug above.
  if (event.request.mode === 'navigate' || url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Everything else same-origin (icons, manifest.json) - small, rarely
  // -changing files, safe to serve cache-first for a faster repeat load.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      // A rejected promise handed to respondWith becomes a failed
      // request the page cannot tell apart from a 500. Hand back a
      // real response instead, so the caller sees a status it can act on.
      return fetch(event.request).catch(
        () => new Response('', { status: 504, statusText: 'offline' })
      );
    })
  );
});
