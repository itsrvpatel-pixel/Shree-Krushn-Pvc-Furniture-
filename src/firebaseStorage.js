// Firebase setup + a storage adapter that mimics the same get/set/delete
// shape the app code already uses (window.storage.get/set/delete), so
// App.jsx did not need to be rewritten line-by-line.

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

// Your actual Firebase project config (Shree Krushn PVC Furniture)
const firebaseConfig = {
  apiKey: "AIzaSyBOlInlieBdYitFR9VYpkqyO7OkzPCLtGY",
  authDomain: "shree-krushn-pvc-furniture.firebaseapp.com",
  projectId: "shree-krushn-pvc-furniture",
  storageBucket: "shree-krushn-pvc-furniture.firebasestorage.app",
  messagingSenderId: "129070549337",
  appId: "1:129070549337:web:2fe7ab7ebcfba2aefc2448",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// All data lives in a single Firestore collection called "app_data".
// Every key the app uses (e.g. "customers", "jobs", "gallery") becomes
// one document in that collection, matching the key/value shape the
// original window.storage API used inside the Claude artifact.
const COLLECTION = "app_data";

async function get(key) {
  try {
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
    await setDoc(doc(db, COLLECTION, key), { value });
    return { key, value };
  } catch (e) {
    console.error("storage.set failed:", key, e);
    return null;
  }
}

async function del(key) {
  try {
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
  window.storage = {
    get: (key) => get(key),
    set: (key, value) => set(key, value),
    delete: (key) => del(key),
  };
}
