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
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best effort - the app works fine without it, just without the
      // offline-shell/faster-repeat-load benefit.
    });
  });
}
