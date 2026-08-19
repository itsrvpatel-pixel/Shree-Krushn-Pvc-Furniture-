import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { installWindowStorage } from './firebaseStorage.js';

// Wires window.storage to Firebase before the app's first render, so all
// existing storage.get/set/delete calls inside App.jsx work unchanged.
installWindowStorage();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <Analytics />
    <SpeedInsights />
  </React.StrictMode>
);

// Registers the app-shell service worker (public/sw.js) so the app
// qualifies as a real, installable PWA - required for a good PWABuilder
// score when packaging for the Play Store, and improves load speed on
// repeat visits. Guarded by a feature check since older browsers don't
// support service workers at all.
//
// Explicitly checking for updates (not just relying on the browser's
// own periodic check) and reloading once a new service worker takes
// over means a fixed sw.js reaches people as fast as possible - after
// the v1 caching bug (see sw.js), leaving people on a stale cached
// version any longer than necessary isn't acceptable. The reload only
// fires once per actual service worker update (skipWaiting + a fresh
// controller), never on a normal repeat visit with no update pending.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      registration.update().catch(() => {});
    }).catch(() => {
      // Best effort - the app works fine without it, just without the
      // offline-shell/faster-repeat-load benefit.
    });

    let hasReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloaded) return;
      hasReloaded = true;
      window.location.reload();
    });
  });
}
