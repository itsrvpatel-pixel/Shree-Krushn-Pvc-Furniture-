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
import { createJobsStore, createCustomersStore } from "./jobsStore.js";
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
  onSnapshot,
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
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
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

// Makes sure this browser has SOME Firebase identity before any data is
// read.
//
// This exists because of a gap that would otherwise bite the moment
// firestore.rules is deployed. Those rules require request.auth != null,
// and staff get an identity from the custom-token sign-in below - but
// customers do not. The customer OTP screen currently runs in demo mode
// (the code is generated and checked in the browser, see LoginScreen)
// because real Firebase phone auth needs the Blaze plan, so a customer
// never signs in to Firebase at all. Deploying the rules in that state
// would lock every customer out of the app completely.
//
// An anonymous sign-in closes that gap and is free on the Spark plan. It
// gives no per-person identity - an anonymous uid says nothing about who
// the customer is - so it is enough for "signed in or not" rules and NOT
// enough for per-customer rules. Those still need real phone auth.
//
// Anonymous sign-in has to be switched on in the Firebase console
// (Authentication -> Sign-in method -> Anonymous). If it is off this
// fails, and the app carries on exactly as it does today.
const AUTH_INIT_TIMEOUT_MS = 10000;

function currentUserOnce() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { try { unsub(); } catch (e) { /* already gone */ } resolve(null); }, AUTH_INIT_TIMEOUT_MS);
    // Firebase restores a stored session asynchronously, so auth.currentUser
    // is not reliable until the first state callback has fired.
    const unsub = onAuthStateChanged(auth, (user) => {
      clearTimeout(timer);
      try { unsub(); } catch (e) { /* already gone */ }
      resolve(user);
    });
  });
}

let ensureSignedInPromise = null;
async function ensureSignedIn() {
  if (ensureSignedInPromise) return ensureSignedInPromise;
  ensureSignedInPromise = (async () => {
    // The whole thing is bounded, not just the state callback. The app
    // awaits this before its first read, so anything that can hang here
    // is something that can leave the app stuck on "Loading..." forever -
    // and signInAnonymously retries internally rather than rejecting when
    // it cannot reach Firebase. Giving up and carrying on unauthenticated
    // is always better than never rendering: without the rules deployed
    // the app works anyway, and with them deployed the user gets the
    // app's own error rather than a blank screen.
    const attempt = (async () => {
      const existing = await currentUserOnce();
      if (existing) return { ok: true, uid: existing.uid, anonymous: existing.isAnonymous };
      const cred = await signInAnonymously(auth);
      return { ok: true, uid: cred.user.uid, anonymous: true };
    })();
    let timer;
    const bail = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'auth/timeout' }), AUTH_INIT_TIMEOUT_MS);
    });
    try {
      return await Promise.race([attempt, bail]);
    } catch (e) {
      // Most likely anonymous sign-in is not enabled in the console.
      console.error("ensureSignedIn failed:", e);
      return { ok: false, error: String(e && e.code ? e.code : e) };
    } finally {
      clearTimeout(timer);
    }
  })();
  return ensureSignedInPromise;
}

// Staff / admin sign-in.
//
// The PIN is checked by api/staff-login.js on the server, which returns
// a Firebase custom token carrying the caller's role. Signing in with
// that token gives staff a real Firebase identity, which is what lets
// Firestore rules distinguish an admin from a karigar from a stranger.
//
// Returns:
//   { ok: true, role, staffName, staffId }  signed in
//   { unconfigured: true }                  ADMIN_PIN not set in Vercel yet,
//                                           so the caller should fall back to
//                                           the old in-browser PIN check
//   { ok: false, error }                    wrong PIN, locked out, or offline
// Both halves of this can hang rather than fail: a request on a dead
// mobile connection, and signInWithCustomToken when Firebase Auth is
// unreachable (the SDK retries internally instead of rejecting). Either
// one would leave the PIN button stuck on "Check kar rahe hain..."
// forever with no error, so both get a deadline.
const LOGIN_TIMEOUT_MS = 15000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function staffLogin(pin) {
  let res;
  try {
    res = await withTimeout(fetch('/api/staff-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    }), LOGIN_TIMEOUT_MS, 'staff login request');
  } catch (e) {
    // No network, or the endpoint isn't deployed. Falling back keeps a
    // site that is otherwise working from becoming unusable.
    console.error('staffLogin: request failed', e);
    return { unconfigured: true };
  }
  if (res.status === 503 || res.status === 404) return { unconfigured: true };
  let data = {};
  try { data = await res.json(); } catch (e) { /* handled below */ }
  if (!res.ok) return { ok: false, error: data.error || 'Login fail ho gaya' };
  try {
    await withTimeout(signInWithCustomToken(auth, data.token), LOGIN_TIMEOUT_MS, 'custom-token sign-in');
  } catch (e) {
    console.error('staffLogin: signInWithCustomToken failed', e);
    return { ok: false, error: 'Login pura nahi ho paya - internet check karein' };
  }
  return { ok: true, role: data.role, staffName: data.staffName, staffId: data.staffId };
}

async function signOutStaff() {
  try {
    await auth.signOut();
    // Drop straight back to an anonymous identity. Without this the app
    // would be left with no Firebase session at all after a logout, and
    // once the rules are deployed the login screen itself could not read
    // anything.
    ensureSignedInPromise = null;
    await ensureSignedIn();
  } catch (e) { console.error('signOutStaff failed', e); }
}

// Live subscription to a single app_data document.
//
// The app used to re-read a fixed list of documents on a 20-second timer,
// which cost ~2,970 reads per hour for every device with the app open -
// enough that two staff working a full day exhausted the 50,000/day free
// tier before a single customer logged in. A listener is billed for the
// first read and then only when the document actually changes, so an idle
// app costs nothing and updates arrive at once instead of up to 20
// seconds later.
//
// Returns an unsubscribe function.
function subscribeKey(key, onValue) {
  return onSnapshot(
    doc(db, COLLECTION, key),
    (snap) => onValue(snap.exists() ? snap.data().value : null),
    (err) => console.error("storage.subscribe failed:", key, err),
  );
}

// Raw diagnostic reads, used by the Data Check panel in Admin -> Settings.
//
// WHY THIS DOES NOT REUSE get()/listAllKeys()
//
// Every normal helper above catches its own errors and returns null or []
// so that one bad read can never take the app down. That is right for the
// app and wrong for a diagnostic: it makes "you are denied" and "there is
// nothing there" produce the identical answer, which is exactly the
// question a data check has to settle. The first version of the panel used
// those helpers and so could not tell the two apart at all.
//
// So these deliberately let the error through, and report its code.
// Nothing here writes.
async function rawProbe() {
  const out = { projectId: firebaseConfig.projectId, online: navigator.onLine };

  // Who, if anyone, are we to Firestore? If anonymous sign-in is not
  // enabled in the console this fails, and with rules published that one
  // fact denies every read in the app.
  try {
    const auth9 = await ensureSignedIn();
    out.auth = auth9 && auth9.ok
      ? { ok: true, uid: auth9.uid, anonymous: !!auth9.anonymous }
      : { ok: false, error: (auth9 && auth9.error) || 'unknown' };
  } catch (e) {
    out.auth = { ok: false, error: String((e && e.code) || e) };
  }

  const errCode = (e) => String((e && e.code) || (e && e.message) || e);

  // A single document read. fromCache matters: with offline persistence a
  // read can be answered by an empty local cache, which looks like missing
  // data but is really "could not reach the server".
  const readDoc = async (path, id) => {
    try {
      const snap = await getDoc(doc(db, path, id));
      return {
        ok: true,
        exists: snap.exists(),
        fromCache: snap.metadata.fromCache,
        bytes: snap.exists() ? JSON.stringify(snap.data()).length : 0,
      };
    } catch (e) {
      return { ok: false, error: errCode(e) };
    }
  };

  // A collection listing. Rules treat this differently from a document
  // read - a list is denied outright unless every document it could return
  // is readable - so a listing that fails while a document read succeeds is
  // itself a finding, not a contradiction.
  const readList = async (name) => {
    try {
      const snap = await getDocs(collection(db, name));
      return { ok: true, count: snap.size, fromCache: snap.metadata.fromCache };
    } catch (e) {
      return { ok: false, error: errCode(e) };
    }
  };

  out.appDataCategories = await readDoc(COLLECTION, 'categories');
  out.appDataJobs = await readDoc(COLLECTION, 'jobs');
  out.appDataCustomers = await readDoc(COLLECTION, 'customers');
  out.appDataList = await readList(COLLECTION);
  out.jobsList = await readList('jobs');
  out.customersList = await readList('customers');
  return out;
}

const jobsStore = createJobsStore(db);
const customersStore = createCustomersStore(db);

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
  window.storage.subscribe = (key, onValue) => subscribeKey(key, onValue);
  window.jobsStore = jobsStore;
  window.customersStore = customersStore;
  window.appAuth = { ensureSignedIn: () => ensureSignedIn() };
  window.dataCheck = { probe: () => rawProbe() };
  window.staffAuth = {
    login: (pin) => staffLogin(pin),
    signOut: () => signOutStaff(),
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