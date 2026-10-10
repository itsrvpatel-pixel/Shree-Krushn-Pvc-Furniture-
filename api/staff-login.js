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
import { tellAdmin, shouldAnnounceLogin, loginNotice, shouldWarnGuessing } from './_security.js';
import { readCurrentPin, readStaffPins, stripStaffPin } from './change-pin.js';

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

// These counters live in their own collection rather than in app_data.
//
// app_data is the collection the whole app reads, so anything kept there
// has to be carved out of the security rules by name - and a rule that
// excludes documents by name cannot allow a collection listing at all,
// because Firestore refuses a query it cannot prove is safe. Keeping
// counters here instead means app_data holds nothing a signed-in user
// may not see, so its rule stays simple and listing keeps working.
//
// Only this endpoint touches this collection, through the Admin SDK,
// which bypasses rules entirely - so the rules deny it to every client.
const ATTEMPT_COLLECTION = 'login_attempts';

function callerKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim() || 'unknown';
  // Firestore document ids cannot contain '/', and ':' from IPv6 is fine
  // but replaced anyway to keep ids simple to read.
  return ip.replace(/[^a-zA-Z0-9]/g, '_');
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
  //
  // BOTH variables are checked, not just ADMIN_PIN. Signing in needs a
  // Firebase custom token, and minting one needs the service account -
  // so with ADMIN_PIN set and FIREBASE_SERVICE_ACCOUNT missing this
  // endpoint cannot do its job at all. Reporting that as a 500 would be
  // worse than useless: the client falls back on 503 but not on 500, so
  // a half-configured deploy would take admin login down completely,
  // where an unconfigured one leaves it working. A missing service
  // account is not a failure, it is the same "not set up yet" - so it
  // gets the same answer.
  if (!process.env.ADMIN_PIN || !process.env.FIREBASE_SERVICE_ACCOUNT) {
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

  const attemptRef = db.collection(ATTEMPT_COLLECTION).doc(callerKey(req));
  const now = Date.now();
  try {
    const snap = await attemptRef.get();
    const rec = snap.exists ? snap.data() : null;
    if (rec && rec.failures >= MAX_FAILURES && now - rec.last < LOCKOUT_MS) {
      const waitMin = Math.ceil((LOCKOUT_MS - (now - rec.last)) / 60000);
      res.status(429).json({ error: 'Too many wrong PINs. Try again in ' + waitMin + ' minutes.' });
      return;
    }
    if (rec && now - rec.last >= LOCKOUT_MS) await attemptRef.set({ failures: 0, last: now });
  } catch (e) {
    // If the attempt counter is unavailable, still check the PIN rather
    // than locking out real staff over a bookkeeping failure.
    console.error('staff-login: attempt lookup failed', e);
  }

  // The three role PINs, each resolved by readCurrentPin: the value set
  // from inside the app (secrets/<name>, unreadable by any client) wins,
  // then the environment variable, then the pre-move app_data document.
  // One place decides where a PIN comes from, so this endpoint and
  // api/change-pin.js can never disagree about which value is current -
  // if they did, you could change a PIN and still be refused by it.
  let matched = null;
  const roles = [
    { which: 'admin', role: 'admin', staffName: 'Admin' },
    { which: 'partner', role: 'partner', staffName: 'Partner' },
    { which: 'dh_partner', role: 'dh_partner', staffName: 'DH Home Decor' },
  ];
  for (const r of roles) {
    const actual = await readCurrentPin(db, r.which);
    if (actual && pinMatches(pin, actual)) {
      matched = { role: r.role, staffName: r.staffName, staffId: null };
      break;
    }
  }

  // Staff PINs are managed by the admin inside the app, so they stay in
  // Firestore - but they are read here, on the server, instead of being
  // shipped to every browser.
  // Staff PINs. The real values live in secrets/staff_pins, which no
  // client can read; app_data/staff keeps only the parts the app needs
  // on screen - name, role, commission.
  //
  // Any pin still sitting inside app_data/staff is read too, so a
  // karigar who has not been migrated yet can still log in - and is
  // then lifted out, because a pin in app_data is a pin every signed-in
  // user can read, and anonymous sign-in is open to anyone. The move
  // happens here rather than waiting for an admin to do anything.
  if (!matched) {
    try {
      const staffSnap = await db.collection('app_data').doc('staff').get();
      const staffList = staffSnap.exists ? JSON.parse(staffSnap.data().value || '[]') : [];
      const list = Array.isArray(staffList) ? staffList : [];
      const storedPins = await readStaffPins(db);

      let hit = list.find((m) => storedPins[m.id] && pinMatches(pin, String(storedPins[m.id])));
      if (!hit) hit = list.find((m) => m.pin && pinMatches(pin, String(m.pin)));
      if (hit) {
        const role = hit.role === 'karigar' ? 'karigar'
          : (hit.role === 'regional_partner' ? 'regional_partner' : 'admin');
        matched = { role, staffName: hit.name, staffId: hit.id };
      }

      const stillInline = list.filter((m) => m.pin !== undefined && m.id !== undefined);
      if (stillInline.length > 0) {
        const merged = { ...storedPins };
        for (const m of stillInline) merged[m.id] = String(m.pin);
        await db.collection('secrets').doc('staff_pins').set({
          pins: merged, updatedAt: Date.now(), updatedBy: 'migration',
        });
        for (const m of stillInline) await stripStaffPin(db, m.id);
        console.log('staff-login: moved ' + stillInline.length + ' staff pin(s) out of app_data');
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
      // The lockout counts per address, so somebody switching between
      // wifi and mobile data can keep going. A global lock would fix
      // that and hand anyone a way to lock the owner out of his own
      // business by typing rubbish, so the answer is to tell him
      // instead - a warning cannot be turned against him. Once per
      // burst, at the threshold, not once per attempt after it.
      if (shouldWarnGuessing(failures)) {
        tellAdmin(getAdminApp(), db, 'Someone is trying PINs',
          failures + ' wrong PINs in a row just now. If this is not you, change your PIN in Settings.')
          .catch(() => {});
      }
    } catch (e) { /* counting is best effort */ }
    res.status(401).json({ error: 'Wrong PIN' });
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

    // Say so. Before this, a stolen PIN bought somebody weeks of quiet
    // work: nothing anywhere recorded that a login had happened, so
    // the only way to find out was to notice the damage. The owner's
    // own logins are rare - the session never expires - so this is a
    // handful of notifications a year, and the one that matters
    // arrives within seconds of the login it describes.
    //
    // Deliberately after the token is minted and never awaited into
    // the response: a push that fails must not cost him a login.
    if (shouldAnnounceLogin(matched.role)) {
      const notice = loginNotice(matched.role, matched.staffName);
      tellAdmin(getAdminApp(), db, notice.title, notice.body).catch(() => {});
    }
    res.status(200).json({ token, ...matched });
  } catch (e) {
    console.error('staff-login: token mint failed', e);
    res.status(500).json({ error: 'There was a problem creating the login token' });
  }
}
