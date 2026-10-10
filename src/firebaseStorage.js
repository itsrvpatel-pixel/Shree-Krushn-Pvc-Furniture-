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
  writeBatch,
} from "firebase/firestore";
// firebase/storage and firebase/messaging are NOT imported here.
//
// Both are needed only for things a person has to ask for - uploading a
// photo or a brochure, turning push notifications on - and neither is
// touched on the path that gets the app onto the screen. Imported at the
// top they still shipped in the first bundle every visitor downloads
// before seeing anything, which on a slow phone connection is time spent
// waiting for code that visit will probably never run. They are loaded
// at the moment they are first used instead; see loadStorageSdk and the
// messaging functions below.
let storageSdkPromise = null;
function loadStorageSdk() {
  if (!storageSdkPromise) {
    storageSdkPromise = import("firebase/storage").then((m) => ({
      ref: m.ref,
      uploadString: m.uploadString,
      getDownloadURL: m.getDownloadURL,
      deleteObject: m.deleteObject,
      storage: m.getStorage(app),
    }));
  }
  return storageSdkPromise;
}
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
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
const auth = getAuth(app);

// All data lives in a single Firestore collection called "app_data".
// Every key the app uses (e.g. "customers", "jobs", "gallery") becomes
// one document in that collection, matching the key/value shape the
// original window.storage API used inside the Claude artifact. This tier
// is for small structured data — every document here is hard-capped at
// 1MiB by Firestore itself, so large binary files never belong here.
const COLLECTION = "app_data";

// A Firestore document id may not contain a slash - a slash is the path
// separator, so doc(db, "app_data", "gallery_cat_Color/POP Work") is
// read as a four-segment path, which is a collection, and the call
// throws "Invalid document reference". The app ships 'Color/POP Work'
// in DEFAULT_CATEGORIES, so that category threw on every start-up, and
// any category the owner named with a slash - "Kitchen/Modular" - would
// have accepted photos into a document that could never be written.
//
// Slashes become %2F, which is what encodeURIComponent would give them,
// and nothing else is touched. A key that is legal today therefore maps
// to itself, so every document already in Firestore keeps its name and
// none of them are orphaned by this.
function docKey(key) {
  return String(key).replace(/\//g, '%2F');
}
function unDocKey(id) {
  return String(id).replace(/%2F/g, '/');
}

async function get(key) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, docKey(key)));
    if (!snap.exists()) return null;
    return { key, value: snap.data().value };
  } catch (e) {
    console.error("storage.get failed:", key, e);
    return null;
  }
}

// Same read as get(), but it says WHY it came back empty.
//
// get() returns null both for "no such document" and for "you are not
// allowed to read it", which is fine everywhere the app just wants a
// value or a default. It is not fine for the admin PIN: falling back to
// the built-in default because the real PIN could not be READ would let
// anyone in with the default, which is the opposite of what a denied
// read should cause. So that one caller needs the reason, not just the
// value.
async function getStatus(key) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, docKey(key)));
    if (!snap.exists()) return { ok: true, missing: true, value: null };
    return { ok: true, missing: false, value: snap.data().value };
  } catch (e) {
    console.error("storage.getStatus failed:", key, e);
    return { ok: false, error: String((e && e.code) || e), value: null };
  }
}

async function set(key, value) {
  try {
    await setDoc(doc(db, COLLECTION, docKey(key)), { value });
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
    return snap.docs.map((d) => unDocKey(d.id));
  } catch (e) {
    console.error("storage.listAllKeys failed:", e);
    return [];
  }
}

async function del(key) {
  try {
    await deleteDoc(doc(db, COLLECTION, docKey(key)));
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
    const { ref, uploadString, getDownloadURL, storage } = await loadStorageSdk();
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
    const { ref, deleteObject, storage } = await loadStorageSdk();
    const storageRef = ref(storage, "files/" + key);
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
// Returns { ok, confirmation } or { ok: false, code }. It used to
// return the confirmation or a bare null, with the real reason going
// only to console.error - which is unreadable on the phone every one
// of these customers is using, and left "Could not send the OTP" as
// the only thing anyone could report. The Firebase error code IS the
// diagnosis here (auth/invalid-app-credential, auth/too-many-requests,
// auth/billing-not-enabled all mean completely different fixes), so it
// comes back to the caller to put on screen.
let recaptchaVerifierInstance = null;

function clearRecaptcha() {
  if (recaptchaVerifierInstance) {
    try { recaptchaVerifierInstance.clear(); } catch (clearError) { /* best effort */ }
    recaptchaVerifierInstance = null;
  }
}

// One attempt. The retry around it is below, and it is the reason this
// is split out: recovery means a NEW verifier, so the whole thing has
// to run again, not just the signInWithPhoneNumber call.
async function sendPhoneOtpOnce(phoneE164, recaptchaContainerId) {
  if (!recaptchaVerifierInstance) {
    recaptchaVerifierInstance = new RecaptchaVerifier(auth, recaptchaContainerId, { size: "invisible" });
  }
  return signInWithPhoneNumber(auth, phoneE164, recaptchaVerifierInstance);
}

async function sendPhoneOtp(phoneE164, recaptchaContainerId) {
  try {
    let confirmationResult;
    try {
      confirmationResult = await sendPhoneOtpOnce(phoneE164, recaptchaContainerId);
    } catch (first) {
      // The invisible reCAPTCHA fails its first run surprisingly often -
      // the owner's own words after switching real SMS on were "ek do
      // bar error aaya but otp aa gaya", which is this: it failed, he
      // tapped again, and the second one worked. The app can do that
      // tap itself. The widget is single-use once it has failed, so the
      // retry only means anything after clearing it.
      console.error("sendPhoneOtp first attempt failed, retrying:", first);
      clearRecaptcha();
      confirmationResult = await sendPhoneOtpOnce(phoneE164, recaptchaContainerId);
    }
    return { ok: true, confirmation: confirmationResult };
  } catch (e) {
    console.error("sendPhoneOtp failed:", e);
    // A failed attempt can leave the reCAPTCHA widget in a used state -
    // clearing it so the next attempt gets a fresh one, matching
    // Firebase's own documented error-recovery pattern.
    clearRecaptcha();
    // auth/internal-error means the SDK could not classify what the
    // server said - so the server's own words are the whole diagnosis,
    // and they are NOT in e.code. @firebase/auth stashes the raw
    // response on customData.serverResponse; without reading it the
    // error on screen names a category and nothing inside it.
    let detail = '';
    try {
      const sr = e && e.customData && e.customData.serverResponse;
      if (sr) detail = typeof sr === 'string' ? sr : JSON.stringify(sr);
    } catch (readError) { /* best effort - never let logging throw */ }
    if (!detail) detail = String((e && e.message) || e);
    return { ok: false, code: (e && e.code) || 'unknown', detail: detail.slice(0, 220) };
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

// Changes a role PIN through api/change-pin.js.
//
// The PIN never travels back to the browser - only forward, to be
// checked and stored server-side. The caller proves it is an admin with
// its Firebase ID token, which carries the 'role' claim minted by
// api/staff-login.js; a client cannot invent that claim.
//
// Returns the same shape as staffLogin so callers can treat an
// unconfigured server the same way they already do:
//   { ok: true }                signed and stored
//   { unconfigured: true }      server side not set up - caller falls
//                               back to its old Firestore write
//   { ok: false, error }        refused, with a reason to show
async function changeRolePin(which, currentPin, newPin) {
  let idToken = null;
  try {
    const user = auth.currentUser;
    if (user) idToken = await withTimeout(user.getIdToken(), LOGIN_TIMEOUT_MS, 'id token');
  } catch (e) {
    console.error('changeRolePin: could not get id token', e);
  }
  // No Firebase session with a role claim means the server path was
  // never in play for this login, so there is nothing for it to verify.
  if (!idToken) return { unconfigured: true };

  let res;
  try {
    res = await withTimeout(fetch('/api/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ which, currentPin, newPin }),
    }), LOGIN_TIMEOUT_MS, 'change pin request');
  } catch (e) {
    console.error('changeRolePin: request failed', e);
    return { ok: false, error: 'Server tak nahi pahunch paye - internet check karein' };
  }
  if (res.status === 503 || res.status === 404) return { unconfigured: true };
  let data = {};
  try { data = await res.json(); } catch (e) { /* handled below */ }
  if (!res.ok) return { ok: false, error: data.error || 'PIN change nahi ho paya' };
  return { ok: true };
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
    doc(db, COLLECTION, docKey(key)),
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
      if (!snap.exists()) return { ok: true, exists: false, fromCache: snap.metadata.fromCache, bytes: 0 };
      const data = snap.data();
      // How many records the pre-split document holds, where it holds a
      // JSON array. This is the number the per-record collection has to
      // match: the app prefers the collection whenever it is non-empty,
      // so an interrupted migration shows fewer jobs than exist and says
      // nothing about it. Counting both sides is what makes that visible.
      let records = null;
      if (typeof data.value === 'string') {
        try {
          const parsed = JSON.parse(data.value);
          if (Array.isArray(parsed)) records = parsed.length;
        } catch (e) { /* not an array document - leave records null */ }
      }
      return {
        ok: true,
        exists: true,
        fromCache: snap.metadata.fromCache,
        bytes: JSON.stringify(data).length,
        records,
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


// ---- Error reports -------------------------------------------------
//
// One document per report in its own collection. Its own, not inside
// app_data, for the same reason the login counters are: app_data is
// read by everything, so anything kept there has to be carved out of
// the rules by name. A separate collection keeps the rule one line -
// anyone signed in may ADD a report, only staff may read them.
//
// Writing is deliberately fire-and-forget. Nothing waits on it and
// nothing surfaces when it fails: the caller is an error handler, and
// an error handler that can fail is an error loop.
const ERRORS_COLLECTION = 'error_reports';
const MAX_ERROR_ROWS = 300;
const ERROR_DELETE_BATCH = 400;

async function reportError(report) {
  try {
    await setDoc(doc(collection(db, ERRORS_COLLECTION)), {
      ...report,
      createdAt: Date.now(),
    });
    return true;
  } catch (e) {
    // Not console.error: this runs inside the error handler, and a
    // noisy failure here is indistinguishable from the bug being
    // reported.
    console.warn('error report not sent (ignored)', e && e.code);
    return false;
  }
}

async function loadErrorReports() {
  const snap = await getDocs(collection(db, ERRORS_COLLECTION));
  const rows = [];
  snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.at || b.createdAt || 0) - (a.at || a.createdAt || 0));
  return rows.slice(0, MAX_ERROR_ROWS);
}

async function clearErrorReports() {
  const snap = await getDocs(collection(db, ERRORS_COLLECTION));
  const ids = [];
  snap.forEach((d) => ids.push(d.id));
  for (let i = 0; i < ids.length; i += ERROR_DELETE_BATCH) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + ERROR_DELETE_BATCH)) batch.delete(doc(db, ERRORS_COLLECTION, id));
    await batch.commit();
  }
  return ids.length;
}


/* ---- Alerts a customer raises for staff ----

   Every bell entry used to be appended to one shared app_data document.
   That works for staff and cannot work for a customer: the phase-2
   rules let a customer write their own record, their own job and their
   own notification document, and nothing else - so a customer booking
   a visit, approving an estimate or asking for a change wrote the entry
   and had it refused, inside a catch that swallowed it. The bell stayed
   empty for every single customer action and nothing anywhere said why.

   Same shape as error_reports, for the same reason: one document per
   alert, create-only. A customer can add but cannot read, list, edit or
   delete, so nobody can rewrite or clear what their own app reported.
   Staff fold them into the shared list and delete them as they go. */
const ALERTS_COLLECTION = 'staff_alerts';
const MAX_ALERT_ROWS = 200;

async function addStaffAlert(entry) {
  try {
    await setDoc(doc(collection(db, ALERTS_COLLECTION)), { ...entry, createdAtMs: Date.now() });
    return true;
  } catch (e) {
    console.warn('staff alert not sent (ignored)', e && e.code);
    return false;
  }
}

async function loadStaffAlerts() {
  const snap = await getDocs(collection(db, ALERTS_COLLECTION));
  const rows = [];
  snap.forEach((d) => rows.push({ docId: d.id, ...d.data() }));
  rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return rows.slice(0, MAX_ALERT_ROWS);
}

// Taken out once staff have folded them into the shared list, so the
// collection stays a hand-off point and not a second store.
async function clearStaffAlerts(docIds) {
  const ids = Array.isArray(docIds) ? docIds.filter(Boolean) : [];
  if (!ids.length) return 0;
  for (let i = 0; i < ids.length; i += ERROR_DELETE_BATCH) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + ERROR_DELETE_BATCH)) batch.delete(doc(db, ALERTS_COLLECTION, id));
    await batch.commit();
  }
  return ids.length;
}

export function installWindowStorage() {
  window.storage = {
    get: (key) => get(key),
    getStatus: (key) => getStatus(key),
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
  window.staffAlerts = {
    add: (e) => addStaffAlert(e),
    loadAll: () => loadStaffAlerts(),
    clear: (ids) => clearStaffAlerts(ids),
  };
  window.errorLog = {
    report: (r) => reportError(r),
    loadAll: () => loadErrorReports(),
    clearAll: () => clearErrorReports(),
  };
  window.storage.subscribe = (key, onValue) => subscribeKey(key, onValue);
  window.jobsStore = jobsStore;
  window.customersStore = customersStore;
  window.appAuth = { ensureSignedIn: () => ensureSignedIn() };
  window.dataCheck = { probe: () => rawProbe() };
  window.staffAuth = {
    login: (pin) => staffLogin(pin),
    signOut: () => signOutStaff(),
    changePin: (which, currentPin, newPin) => changeRolePin(which, currentPin, newPin),
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
// The Web Push certificate from Firebase Console -> Project Settings
// -> Cloud Messaging -> Web Push certificates -> Generate key pair.
//
// PUBLIC, unlike the service account key api/send-push.js uses. It
// identifies this web app to FCM when asking for a device token, and
// is meant to ship in client code - so it can live here in plain
// sight, and does not need to be a secret in Vercel.
//
// VITE_VAPID_KEY overrides it anyway, for setting it without a code
// change. Either route works; whichever is set wins, the env one
// first.
const VAPID_KEY = import.meta.env.VITE_VAPID_KEY
  || "BPi0tuamcz79EtaO9Am7fYe4AekrKMDMnEh8mLpQDiSknUpSJyfkmLAk-KBfJ0wne5vD3NiX-qa-TxXsi09acZg";

// "Not set up yet" has to be one check, not a string comparison
// repeated wherever someone remembers to make it.
function vapidConfigured() {
  return typeof VAPID_KEY === 'string'
    && VAPID_KEY.length > 20
    && !VAPID_KEY.startsWith('REPLACE_WITH');
}

// Asks the browser for notification permission, and if granted,
// registers this specific device/browser with FCM and returns its
// unique token - the address api/send-push.js uses to actually deliver
// a notification to THIS device later. Returns null (not an error) if
// permission is denied, the browser doesn't support push (older
// Safari, etc.), or the VAPID key hasn't been configured yet.
//
// Returns { token, reason }. It used to return a bare null for all of
// these, and the one caller reported every one of them as "Notification
// permission nahi mili" - so with the VAPID key still unset, pressing
// the button told the owner he had refused a permission he was never
// asked for. He would deny it, check his settings, and press it again.
// The reason now comes back with the result so the message can be true.
async function requestPermissionAndGetToken() {
  try {
    if (!vapidConfigured()) {
      console.warn('Push notifications: no Web Push key yet (VITE_VAPID_KEY or VAPID_KEY in firebaseStorage.js)');
      return { token: null, reason: 'not_configured' };
    }
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    const supported = await isSupported();
    if (!supported) return { token: null, reason: 'unsupported' };
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { token: null, reason: 'denied' };
    const messaging = getMessaging(app);
    // An explicit scope, and it matters more than it looks.
    //
    // A service worker registration is keyed by SCOPE, not by script.
    // This file and the PWA's own sw.js both sit at the root, so both
    // default to scope '/' - and registering the second one there
    // REPLACES the first. Turning notifications on would have killed
    // the app-shell worker, and main.jsx re-registering sw.js on the
    // next load would have killed this one straight back. The two
    // would have taken turns, which from the outside is push that
    // works one day and not the next.
    //
    // This is the scope Firebase's own SDK uses when it registers the
    // worker itself, so nothing else is expecting a different one. A
    // push event reaches its registration whatever pages that
    // registration controls, and getToken is handed this registration
    // directly below - so it does not need to control the page at all.
    const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
    let registration = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    if (registration) {
      // Reusing is right, but reusing BLINDLY is how a broken worker
      // stays in charge forever. A registration does not re-check its
      // script on its own here, so the version installed on the day
      // something was wrong keeps running - and the one shipped
      // before this had no push listener, which is exactly how
      // "accepted by FCM, nothing on the phone" happens. Asking for
      // an update, paired with skipWaiting in the worker, replaces it
      // on the spot.
      try { await registration.update(); } catch (e) { /* offline, or nothing to update */ }
    } else {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: SW_SCOPE });
    }
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    return { token: token || null, reason: token ? 'ok' : 'no_token' };
  } catch (e) {
    console.error('requestPermissionAndGetToken failed:', e);
    return { token: null, reason: 'error' };
  }
}

// Foreground messages (the app IS open/focused right now) don't
// trigger the service worker's onBackgroundMessage - FCM requires this
// separate handler for that case, since a message arriving while
// someone is actively looking at the app is usually better shown as an
// in-app toast/banner than a system notification popping over what
// they're already doing.
// Stays synchronous and still returns an unsubscribe function, because
// that is the contract callers already rely on - the SDK is fetched in
// the background and the real subscription is swapped in when it lands.
// Unsubscribing before then cancels it rather than leaking a listener.
function onForegroundMessage(callback) {
  let stopped = false;
  let inner = null;
  import("firebase/messaging").then(async ({ getMessaging, onMessage, isSupported }) => {
    if (stopped) return;
    // Asked first. getMessaging THROWS on a browser without the APIs,
    // and while that throw was already caught, it still puts
    // "messaging/unsupported-browser" in the console of every phone
    // that cannot do push - which is a lot of them, and reads like a
    // fault when it is not one.
    if (!(await isSupported())) return;
    if (stopped) return;
    try {
      const messaging = getMessaging(app);
      inner = onMessage(messaging, (payload) => callback(payload));
    } catch (e) {
      // Messaging unavailable - nothing to listen to.
    }
  }).catch(() => {});
  return () => {
    stopped = true;
    if (inner) inner();
  };
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