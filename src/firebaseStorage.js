// Firebase setup + a storage adapter that mimics the same get/set/delete
// shape the app code already uses (window.storage.get/set/delete), so
// App.jsx did not need to be rewritten line-by-line.
//
// SETUP STEPS (see DEPLOY_INSTRUCTIONS.md for full walkthrough):
// 1. Go to https://console.firebase.google.com and create a free project.
// 2. In the project, click "Add app" -> Web app (</> icon).
// 3. Copy the firebaseConfig object it gives you and paste it below,
//    replacing the placeholder values.
// 4. In the Firebase console, go to "Firestore Database" -> Create database
//    -> Start in "test mode" (you can tighten security rules later).
// 5. In the Firebase console, go to "Storage" (in the left sidebar, under
//    Build) -> "Get started" -> Start in "test mode" -> pick the same
//    region as your Firestore database. This is required for large-file
//    uploads (PDF brochures, etc.) - Firestore alone caps every document
//    at 1MiB, which a multi-page PDF or high-res photo blows past easily.
// 6. In the Firebase console, go to "Authentication" -> "Get started" ->
//    under "Sign-in method", enable "Phone". This is required for real
//    OTP SMS - without it, phone sign-in will fail with an
//    auth/operation-not-allowed error. Phone Auth SMS also requires the
//    Blaze (pay-as-you-go) plan - on the free Spark plan, OTP requests
//    will fail with a clear error rather than silently breaking the rest
//    of the app (see sendPhoneOtp below).

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";

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
const storage = getStorage(app);
const auth = getAuth(app);

// All data lives in a single Firestore collection called "app_data".
// Every key the app uses (e.g. "customers", "jobs", "gallery") becomes
// one document in that collection, matching the key/value shape the
// original window.storage API used inside the Claude artifact. This tier
// is for small structured data — every document here is hard-capped at
// 1MiB by Firestore itself, so large binary files never belong here.
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

// Large-file tier, backed by Firebase Storage (Cloud Storage) instead of
// Firestore — this is where PDFs, high-res photos, and anything else too
// big for a 1MiB Firestore document belongs. Files are stored under
// "files/<key>" in the storage bucket. uploadDataUri accepts a data: URI
// (the shape our upload code already produces via FileReader) and returns
// a public download URL to save alongside the file's small Firestore
// metadata (name, category, etc).
async function uploadDataUri(key, dataUri) {
  try {
    const storageRef = ref(storage, "files/" + key);
    await uploadString(storageRef, dataUri, "data_url");
    const url = await getDownloadURL(storageRef);
    return { key, url };
  } catch (e) {
    console.error("fileStorage.upload failed:", key, e);
    // Surfaces the real Firebase error (e.g. "storage/unauthorized" if
    // Storage security rules haven't been published, or a network error
    // code) back to the caller instead of just null - App.jsx can then
    // show this in a toast so a failed upload is diagnosable from what
    // the user sees on screen, rather than only visible in a browser
    // console the user has no reason to open.
    return { error: e.code || e.message || 'Unknown error' };
  }
}

async function deleteFile(key) {
  try {
    const storageRef = ref(storage, "files/" + key);
    await deleteObject(storageRef);
    return { key, deleted: true };
  } catch (e) {
    // A missing file (already deleted, or never uploaded) shouldn't block
    // the caller — best effort, matching the Firestore delete's own
    // error-swallowing behavior above.
    console.error("fileStorage.delete failed:", key, e);
    return null;
  }
}

// Installs both adapters: window.storage for small structured data
// (unchanged from before), and window.fileStorage for large binary files
// (PDFs, big photos) that need Firebase Storage instead of Firestore.
// Real OTP SMS via Firebase Phone Auth. sendPhoneOtp needs a visible DOM
// element id to attach an invisible reCAPTCHA widget to (required by
// Firebase to prevent SMS abuse) - the caller creates this element,
// this function only wires the verifier to it. Returns a
// confirmationResult on success, which verifyPhoneOtp later needs to
// check the code the user types; returns null on failure (invalid
// number, reCAPTCHA failure, or - on the free Spark plan - Phone Auth
// simply being unavailable) so the caller can show a clear error instead
// of the app breaking silently.
let recaptchaVerifierInstance = null;
async function sendPhoneOtp(phoneE164, recaptchaContainerId) {
  try {
    if (!recaptchaVerifierInstance) {
      recaptchaVerifierInstance = new RecaptchaVerifier(auth, recaptchaContainerId, { size: "invisible" });
    }
    const confirmationResult = await signInWithPhoneNumber(auth, phoneE164, recaptchaVerifierInstance);
    return confirmationResult;
  } catch (e) {
    console.error("sendPhoneOtp failed:", e);
    // A failed attempt can leave the reCAPTCHA widget in a used state -
    // clearing it so the next attempt gets a fresh one, matching
    // Firebase's own documented error-recovery pattern.
    if (recaptchaVerifierInstance) {
      try { recaptchaVerifierInstance.clear(); } catch (clearError) { /* best effort */ }
      recaptchaVerifierInstance = null;
    }
    return null;
  }
}
async function verifyPhoneOtp(confirmationResult, code) {
  try {
    const result = await confirmationResult.confirm(code);
    return result.user;
  } catch (e) {
    console.error("verifyPhoneOtp failed:", e);
    return null;
  }
}

export function installWindowStorage() {
  window.storage = {
    get: (key) => get(key),
    set: (key, value) => set(key, value),
    delete: (key) => del(key),
  };
  window.fileStorage = {
    upload: (key, dataUri) => uploadDataUri(key, dataUri),
    delete: (key) => deleteFile(key),
  };
  window.phoneAuth = {
    sendOtp: (phoneE164, recaptchaContainerId) => sendPhoneOtp(phoneE164, recaptchaContainerId),
    verifyOtp: (confirmationResult, code) => verifyPhoneOtp(confirmationResult, code),
  };
}
