// Single shared Firebase app instance.
//
// Both the storage adapter (firebaseStorage.js) and phone auth
// (phoneAuth.js) need the same Firebase app. Calling initializeApp()
// twice for the same project throws/duplicates, so both go through
// getFirebaseApp() here instead of initializing on their own.
//
// The SDK is imported dynamically (not at module top level) so nothing
// touches `window` during the Vite build.

// Firebase project config (Shree Krushn PVC Furniture)
export const firebaseConfig = {
  apiKey: "AIzaSyBOlInlieBdYitFR9VYpkqyO7OkzPCLtGY",
  authDomain: "shree-krushn-pvc-furniture.firebaseapp.com",
  projectId: "shree-krushn-pvc-furniture",
  storageBucket: "shree-krushn-pvc-furniture.firebasestorage.app",
  messagingSenderId: "129070549337",
  appId: "1:129070549337:web:2fe7ab7ebcfba2aefc2448",
};

let appPromise = null;

export function getFirebaseApp() {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    const { initializeApp, getApp, getApps } = await import('firebase/app');
    // Reuse the existing default app if something already created it.
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
  })();
  return appPromise;
}
