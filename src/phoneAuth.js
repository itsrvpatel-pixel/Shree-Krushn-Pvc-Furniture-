// Firebase Phone Authentication, exposed as window.phoneAuth so the
// existing App.jsx login/register code works unmodified - the same
// approach firebaseStorage.js takes for window.storage.
//
// App.jsx contract (see LoginScreen):
//   sendOtp(phoneNumber, containerId) -> confirmationResult, or null on failure
//   verifyOtp(confirmationResult, code) -> user, or null on a wrong/expired code
// Both swallow errors and return null, because the UI treats a falsy
// result as "show the friendly Hinglish error message" rather than
// crashing the screen.

import { getFirebaseApp } from './firebaseApp.js';

let authPromise = null;
async function getAuthBits() {
  if (authPromise) return authPromise;
  authPromise = (async () => {
    const app = await getFirebaseApp();
    const { getAuth, RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth');
    const auth = getAuth(app);
    // Send the SMS in the user's own language where Firebase supports it.
    auth.useDeviceLanguage();
    return { auth, RecaptchaVerifier, signInWithPhoneNumber };
  })();
  return authPromise;
}

// The reCAPTCHA verifier must be created once and reused; constructing a
// second one over the same container throws. It is cleared on failure so
// a retry (the "resend OTP" path) can build a fresh one.
let verifier = null;

// reCAPTCHA and the SMS call both reach out to Google. If that request
// hangs (flaky mobile network, a content blocker, or an offline device)
// the promise can stay pending indefinitely, which would leave the login
// button stuck on "Sending..." with no error and no way out. Cap the
// wait so the UI always gets a definite answer.
const OTP_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getVerifier(containerId) {
  const { auth, RecaptchaVerifier } = await getAuthBits();
  if (verifier) return verifier;
  if (!document.getElementById(containerId)) {
    throw new Error(`reCAPTCHA container #${containerId} is not in the DOM`);
  }
  verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  await verifier.render();
  return verifier;
}

function resetVerifier() {
  try { verifier?.clear(); } catch { /* already torn down */ }
  verifier = null;
}

async function sendOtp(phoneNumber, containerId = 'recaptcha-container') {
  try {
    const { auth, signInWithPhoneNumber } = await getAuthBits();
    const appVerifier = await withTimeout(getVerifier(containerId), OTP_TIMEOUT_MS, 'reCAPTCHA');
    return await withTimeout(
      signInWithPhoneNumber(auth, phoneNumber, appVerifier),
      OTP_TIMEOUT_MS,
      'OTP request',
    );
  } catch (e) {
    console.error('phoneAuth.sendOtp failed:', e);
    // A burned/expired reCAPTCHA cannot be reused - drop it so the next
    // attempt starts clean instead of failing forever.
    resetVerifier();
    return null;
  }
}

async function verifyOtp(confirmationResult, code) {
  try {
    if (!confirmationResult) return null;
    const cred = await withTimeout(confirmationResult.confirm(code), OTP_TIMEOUT_MS, 'OTP verify');
    // A successful confirm consumes the reCAPTCHA too.
    resetVerifier();
    return cred?.user || null;
  } catch (e) {
    console.error('phoneAuth.verifyOtp failed:', e);
    return null;
  }
}

export function installWindowPhoneAuth() {
  if (typeof window === 'undefined') return; // server/build: do nothing
  window.phoneAuth = { sendOtp, verifyOtp };
}
