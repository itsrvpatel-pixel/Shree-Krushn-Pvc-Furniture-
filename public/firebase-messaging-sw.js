// Firebase Cloud Messaging's own service worker - separate from the
// app-shell caching one (sw.js), since FCM specifically requires a
// file at this exact path/name to handle push messages that arrive
// while the app itself isn't open in any tab. This is what makes a
// notification actually show up on the phone even when the app is
// fully closed - without this file, FCM has nothing running in the
// background to receive the push event and display it.
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Same config as firebaseStorage.js - duplicated here because service
// workers run in their own separate context and can't import from the
// app's regular module files.
firebase.initializeApp({
  apiKey: "AIzaSyBOlInlieBdYitFR9VYpkqyO7OkzPCLtGY",
  authDomain: "shree-krushn-pvc-furniture.firebaseapp.com",
  projectId: "shree-krushn-pvc-furniture",
  storageBucket: "shree-krushn-pvc-furniture.firebasestorage.app",
  messagingSenderId: "129070549337",
  appId: "1:129070549337:web:2fe7ab7ebcfba2aefc2448",
});

const messaging = firebase.messaging();

// Background handler - fires when a push arrives and no tab has the
// app open/focused. Shows a native OS notification using the title/
// body sent from api/send-push.js.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Shree Krushn PVC Furniture';
  const body = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
  });
});

// Tapping the notification focuses an already-open tab if one exists,
// or opens a new one - without this, tapping a notification on some
// browsers just dismisses it without bringing the app to the front.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
