// Firebase setup + a storage adapter that mimics the same get/set/delete
// shape the app code already uses (window.storage.get/set/delete), so
// App.jsx did not need to be rewritten line-by-line.

// NOTE: Avoid importing firebase SDK at module top-level because
// those imports can run during SSR/build and cause "window is not defined"
// or other environment issues. Instead, dynamically import when running
// in the browser.

// Firebase config + the shared app instance live in firebaseApp.js so
// storage and phone auth never initialize the project twice.
import { getFirebaseApp } from './firebaseApp.js';

const COLLECTION = "app_data";

// Lazily initialize Firebase in the browser only.
let initPromise = null;
async function initFirebase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { getFirestore, doc, getDoc, setDoc, deleteDoc } = await import('firebase/firestore');
    const app = await getFirebaseApp();
    const db = getFirestore(app);
    return { db, doc, getDoc, setDoc, deleteDoc };
  })();
  return initPromise;
}

async function get(key) {
  try {
    const { db, doc, getDoc } = await initFirebase();
    const snap = await getDoc(doc(db, COLLECTION, key));
    if (!snap.exists()) return null;
    return { key, value: snap.data().value };
  } catch (e) {
    console.error("storage.get failed:", key, e);
    return null;
  }
}

async function set(key, value) {
  try {
    const { db, doc, setDoc } = await initFirebase();
    await setDoc(doc(db, COLLECTION, key), { value });
    return { key, value };
  } catch (e) {
    console.error("storage.set failed:", key, e);
    return null;
  }
}

async function del(key) {
  try {
    const { db, doc, deleteDoc } = await initFirebase();
    await deleteDoc(doc(db, COLLECTION, key));
    return { key, deleted: true };
  } catch (e) {
    console.error("storage.delete failed:", key, e);
    return null;
  }
}

// Installs the adapter as window.storage so the existing App.jsx code
// (written for the Claude artifact environment) works unmodified.
export function installWindowStorage() {
  if (typeof window === 'undefined') return; // server/build: do nothing

  // Provide async methods that will initialize Firebase lazily when first used.
  window.storage = {
    get: (key) => get(key),
    set: (key, value) => set(key, value),
    delete: (key) => del(key),
  };
}
