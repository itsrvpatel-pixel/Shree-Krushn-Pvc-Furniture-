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
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
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
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as isMessagingSupported,
} from "firebase/messaging";

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
// Firestore's own persistent local cache (IndexedDB-backed) - without
// this, EVERY single read (gallery categories, jobs, customers,
// everything) went to the network fresh on every single app open, even
// for data that hadn't changed since last time. This is what actually
// fixes "gallery reloads every time" at its root, complementing the
// image cache-control fix (public, max-age, immutable) in
// uploadDataUri above: that fix makes the PHOTO FILES load instantly
// from the browser's cache, this fix makes the LIST of which photos
// exist load instantly too, from Firestore's own local cache, syncing
// with the server quietly in the background rather than blocking the
// UI on a network round-trip.
// persistentMultipleTabManager specifically (not the single-tab
// default) is required here since more than one admin device/browser
// tab legitimately uses this same app at once - the default
// single-tab manager would throw a "failed to obtain exclusive access"
// error the moment a second tab tried to open. Falls back to plain
// getFirestore if persistence can't be set up for any reason (private/
// incognito browsing blocks IndexedDB in some browsers, storage quota
// issues, etc.) - the app still works fully without it, just without
// the instant-load benefit on a repeat visit.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  db = getFirestore(app);
}
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

// Lists every document key that actually exists in the app_data
// collection - a genuine recovery mechanism for a specific failure
// mode: 'gallery_categories' is only a POINTER document listing which
// per-category documents to fetch, so if that pointer ever loses track
// of a category (the exact bug this recovers from - a routine photo
// write once truncated it to only the categories the current device
// happened to have loaded locally), the app has no way to know
// 'gallery_cat_Study Table' still exists and holds real photos, since
// it never even asks Firestore for a key it doesn't know to look for.
// This bypasses that blind spot entirely by listing what's REALLY
// there, rather than trusting any pointer document's memory of it.
async function listAllKeys() {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map((d) => d.id);
  } catch (e) {
    console.error("storage.listAllKeys failed:", e);
    return [];
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
    // Cache-Control set explicitly to a full year, public - without this,
    // Firebase Storage's default caching behavior isn't tuned for "this
    // exact file, at this exact URL, is permanent and never changes" (a
    // photo/PDF here is uploaded once under a unique key and never
    // overwritten in place - editing a caption or moving categories
    // never touches the file itself, only its metadata elsewhere), so
    // browsers were re-downloading the full image over the network on
    // every fresh page load instead of serving it instantly from their
    // own disk cache. This is what actually fixes "leaving the app and
    // coming back reloads every photo from scratch" - a real app
    // restart can't preserve JS memory, but the browser's own HTTP
    // cache survives across restarts once files are properly marked
    // cacheable, so a second visit (even after fully closing the app)
    // still loads previously-seen photos instantly.
    await uploadString(storageRef, dataUri, "data_url", { cacheControl: "public, max-age=31536000, immutable" });
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
    listAllKeys: () => listAllKeys(),
  };
  window.fileStorage = {
    upload: (key, dataUri) => uploadDataUri(key, dataUri),
    delete: (key) => deleteFile(key),
  };
  window.phoneAuth = {
    sendOtp: (phoneE164, recaptchaContainerId) => sendPhoneOtp(phoneE164, recaptchaContainerId),
    verifyOtp: (confirmationResult, code) => verifyPhoneOtp(confirmationResult, code),
  };
  window.pushMessaging = {
    requestPermissionAndGetToken: () => requestPermissionAndGetToken(),
    onForegroundMessage: (callback) => onForegroundMessage(callback),
    sendPush: (targetTokens, title, body) => sendPushViaApi(targetTokens, title, body),
  };
}

// The VAPID key (a "Web Push certificate") from Firebase Console ->
// Project Settings (gear icon) -> Cloud Messaging tab -> Web Push
// certificates -> Generate key pair. This is a PUBLIC key (safe to
// ship in client code, unlike the service account key api/send-push.js
// uses) that identifies THIS specific web app to FCM when requesting a
// device token - notification permission requests will fail without
// it. Replace the placeholder below once generated.
const VAPID_KEY = "REPLACE_WITH_YOUR_VAPID_KEY_FROM_FIREBASE_CONSOLE";

// Asks the browser for notification permission, and if granted,
// registers this specific device/browser with FCM and returns its
// unique token - the address api/send-push.js uses to actually deliver
// a notification to THIS device later. Returns null (not an error) if
// permission is denied, the browser doesn't support push (older
// Safari, etc.), or the VAPID key hasn't been configured yet - callers
// should treat a null return as "push just isn't available right now"
// rather than a failure.
async function requestPermissionAndGetToken() {
  try {
    if (VAPID_KEY.startsWith('REPLACE_WITH')) {
      console.warn('Push notifications: VAPID_KEY not configured yet in firebaseStorage.js');
      return null;
    }
    const supported = await isMessagingSupported();
    if (!supported) return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    return token || null;
  } catch (e) {
    console.error('requestPermissionAndGetToken failed:', e);
    return null;
  }
}

// Foreground messages (the app IS open/focused right now) don't
// trigger the service worker's onBackgroundMessage - FCM requires this
// separate handler for that case, since a message arriving while
// someone is actively looking at the app is usually better shown as an
// in-app toast/banner than a system notification popping over what
// they're already doing.
function onForegroundMessage(callback) {
  try {
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => callback(payload));
  } catch (e) {
    return () => {};
  }
}

// Calls the Vercel serverless function (api/send-push.js) that
// actually delivers the push via the Firebase Admin SDK - see that
// file's own comments for the full "why can't this just happen
// directly from the browser" explanation. targetTokens can be a
// single token string or an array of tokens (e.g. notifying every
// admin device at once).
async function sendPushViaApi(targetTokens, title, body) {
  try {
    const tokens = Array.isArray(targetTokens) ? targetTokens : [targetTokens];
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens, title, body }),
    });
    return await res.json();
  } catch (e) {
    console.error('sendPushViaApi failed:', e);
    return { error: e.message };
  }
}
