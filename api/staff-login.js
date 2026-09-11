// Server-side PIN check for admin / partner / staff sign-in.
//
// WHY THIS EXISTS
// Until now the PIN was compared in the browser (`pin === adminPin`),
// which meant every PIN had to be readable by the browser - and since
// nothing gates Firestore reads, that made the admin PIN, the partner
// PINs and every staff PIN readable by anyone who opened the site.
// Here the comparison happens on the server, so the PIN never has to
// leave it, and the browser gets back a Firebase custom token instead.
//
// That token is what makes Firestore security rules possible at all:
// it carries a `role` claim, so a rule can say "only an admin may write
// expenses" rather than trusting whatever the client says it is.
//
// SETUP (Vercel -> Settings -> Environment Variables)
//   ADMIN_PIN         the main admin PIN
//   PARTNER_PIN       optional
//   DH_PARTNER_PIN    optional
//   FIREBASE_SERVICE_ACCOUNT   already set for push notifications
//
// Until ADMIN_PIN is set this endpoint reports itself as unconfigured
// and the app quietly keeps using the old in-browser check, so
// deploying this changes nothing until you are ready.

import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set in Vercel');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

// Compares without leaking, through response time, how much of the PIN
// was correct.
function pinMatches(candidate, actual) {
  if (typeof actual !== 'string' || actual.length === 0) return false;
  if (candidate.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

// A 4-digit PIN is only 10,000 guesses, so an endpoint that answers
// instantly and forever is a gift to a script. Failures are counted per
// caller IP in Firestore and the caller is locked out for a while once
// there have been too many. This is deliberately coarse - it is meant to
// make bulk guessing impractical, not to be a full WAF.
const MAX_FAILURES = 8;
const LOCKOUT_MS = 15 * 60 * 1000;
const ATTEMPT_DOC_PREFIX = 'login_attempts_';

function callerKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() || 'unknown';
  // Firestore document ids cannot contain '/', and ':' from IPv6 is fine
  // but replaced anyway to keep ids simple to read.
  return ATTEMPT_DOC_PREFIX + ip.replace(/[^a-zA-Z0-9]/g, '_');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Only POST is supported' }); return; }

  // Not set up yet: tell the app so it can fall back to its old
  // behaviour rather than locking everyone out.
  if (!process.env.ADMIN_PIN) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : '';
  if (!pin) { res.status(400).json({ error: 'PIN is required' }); return; }

  let db;
  try {
    db = admin.firestore(getAdminApp());
  } catch (e) {
    console.error('staff-login: admin init failed', e);
    res.status(500).json({ error: 'Server auth is not configured correctly' });
    return;
  }

  const attemptRef = db.collection('app_data').doc(callerKey(req));
  const now = Date.now();
  try {
    const snap = await attemptRef.get();
    const rec = snap.exists ? snap.data() : null;
    if (rec && rec.failures >= MAX_FAILURES && now - rec.last < LOCKOUT_MS) {
      const waitMin = Math.ceil((LOCKOUT_MS - (now - rec.last)) / 60000);
      res.status(429).json({ error: 'Bahut baar galat PIN. ' + waitMin + ' minute baad try karein.' });
      return;
    }
    if (rec && now - rec.last >= LOCKOUT_MS) await attemptRef.set({ failures: 0, last: now });
  } catch (e) {
    // If the attempt counter is unavailable, still check the PIN rather
    // than locking out real staff over a bookkeeping failure.
    console.error('staff-login: attempt lookup failed', e);
  }

  // Fixed roles come from environment variables.
  let matched = null;
  if (pinMatches(pin, process.env.ADMIN_PIN)) {
    matched = { role: 'admin', staffName: 'Admin', staffId: null };
  } else if (pinMatches(pin, process.env.PARTNER_PIN)) {
    matched = { role: 'partner', staffName: 'Partner', staffId: null };
  } else if (pinMatches(pin, process.env.DH_PARTNER_PIN)) {
    matched = { role: 'dh_partner', staffName: 'DH Home Decor', staffId: null };
  }

  // Staff PINs are managed by the admin inside the app, so they stay in
  // Firestore - but they are read here, on the server, instead of being
  // shipped to every browser.
  if (!matched) {
    try {
      const staffSnap = await db.collection('app_data').doc('staff').get();
      const staffList = staffSnap.exists ? JSON.parse(staffSnap.data().value || '[]') : [];
      const hit = staffList.find((s) => pinMatches(pin, String(s.pin || '')));
      if (hit) {
        const role = hit.role === 'karigar' ? 'karigar'
          : (hit.role === 'regional_partner' ? 'regional_partner' : 'admin');
        matched = { role, staffName: hit.name, staffId: hit.id };
      }
    } catch (e) {
      console.error('staff-login: staff lookup failed', e);
    }
  }

  if (!matched) {
    try {
      const snap = await attemptRef.get();
      const failures = (snap.exists ? (snap.data().failures || 0) : 0) + 1;
      await attemptRef.set({ failures, last: now });
    } catch (e) { /* counting is best effort */ }
    res.status(401).json({ error: 'Galat PIN' });
    return;
  }

  try {
    // The uid is stable per role/staff member so rules and any future
    // per-user data can rely on it.
    const uid = matched.staffId ? ('staff_' + matched.staffId) : ('role_' + matched.role);
    const token = await admin.auth(getAdminApp()).createCustomToken(uid, {
      role: matched.role,
      staffName: matched.staffName,
      staffId: matched.staffId || null,
    });
    try { await attemptRef.set({ failures: 0, last: now }); } catch (e) { /* best effort */ }
    res.status(200).json({ token, ...matched });
  } catch (e) {
    console.error('staff-login: token mint failed', e);
    res.status(500).json({ error: 'Login token banane mein dikkat hui' });
  }
}
