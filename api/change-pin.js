// Changes a role PIN from inside the app, without ever letting a PIN
// reach a browser.
//
// WHY THIS EXISTS
//
// Once the PIN check moved to the server, the app could no longer change
// the admin PIN: it used to write app_data/admin_pin, and the server
// stopped reading that. Telling the owner "edit an environment variable
// in Vercel" is not a real answer for something they change from their
// phone, so the change happens here instead.
//
// WHERE THE PINS LIVE NOW
//
// In the 'secrets' collection, which the security rules deny to every
// client - read AND write - so no browser can fetch a PIN even while
// signed in. Only this endpoint and api/staff-login.js touch it, both
// through the Admin SDK, which bypasses rules entirely.
//
// That is the whole point: app_data is readable by any signed-in user,
// and anonymous sign-in is open to anyone, so a PIN kept there is a PIN
// anybody can read.
//
// WHO IS ALLOWED TO DO THIS
//
// Two independent things, both required:
//
//   1. A Firebase ID token whose 'role' claim is 'admin'. That claim can
//      only come from a custom token minted by api/staff-login.js after
//      a correct admin PIN, so it cannot be forged by a client.
//   2. The current PIN, again. A borrowed or left-open session is then
//      still not enough to lock the real owner out.
//
// RECOVERY
//
// If the new PIN is ever forgotten: delete secrets/admin_pin in the
// Firestore console and ADMIN_PIN from Vercel takes over again.

import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set in Vercel');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

// Same constant-time comparison as staff-login.
function pinMatches(candidate, actual) {
  if (typeof actual !== 'string' || actual.length === 0) return false;
  if (candidate.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) diff |= candidate.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

// Which PINs may be changed from the app, and where each one lives.
// 'envKey' is the bootstrap value, used until the PIN has been changed
// here even once; 'legacyDoc' is the pre-move location in app_data,
// still read so an existing partner PIN keeps working, and deleted the
// moment a new value is written so the readable copy does not linger.
const PINS = {
  admin:      { secretDoc: 'admin_pin',      legacyDoc: 'admin_pin',      envKey: 'ADMIN_PIN' },
  partner:    { secretDoc: 'partner_pin',    legacyDoc: 'partner_pin',    envKey: 'PARTNER_PIN' },
  dh_partner: { secretDoc: 'dh_partner_pin', legacyDoc: 'dh_partner_pin', envKey: 'DH_PARTNER_PIN' },
};

// Staff PINs live together in one document rather than one each: the
// login endpoint has to check a typed PIN against all of them, and that
// should cost a single read however many karigars there are.
export const STAFF_PINS_DOC = 'staff_pins';

export function staffIdFromWhich(which) {
  return typeof which === 'string' && which.startsWith('staff:') ? which.slice(6) : null;
}

export async function readStaffPins(db) {
  try {
    const snap = await db.collection('secrets').doc(STAFF_PINS_DOC).get();
    const data = snap.exists ? snap.data() : null;
    return (data && data.pins && typeof data.pins === 'object') ? data.pins : {};
  } catch (e) {
    console.error('change-pin: staff pin lookup failed', e);
    return {};
  }
}

export async function readCurrentPin(db, which) {
  const staffId = staffIdFromWhich(which);
  if (staffId) {
    const pins = await readStaffPins(db);
    if (pins[staffId]) return String(pins[staffId]);
    // Not moved across yet - the pin is still sitting inside the staff
    // list. Read it so an existing karigar keeps working until the
    // migration in staff-login.js lifts it out.
    try {
      const snap = await db.collection('app_data').doc('staff').get();
      const list = snap.exists ? JSON.parse(snap.data().value || '[]') : [];
      const hit = (Array.isArray(list) ? list : []).find((m) => String(m.id) === String(staffId));
      return hit && hit.pin ? String(hit.pin) : '';
    } catch (e) {
      console.error('change-pin: legacy staff lookup failed', e);
      return '';
    }
  }
  const spec = PINS[which];
  if (!spec) return '';
  try {
    const snap = await db.collection('secrets').doc(spec.secretDoc).get();
    if (snap.exists && snap.data().value) return String(snap.data().value);
  } catch (e) {
    console.error('change-pin: secrets lookup failed', which, e);
  }
  if (process.env[spec.envKey]) return String(process.env[spec.envKey]);
  try {
    const snap = await db.collection('app_data').doc(spec.legacyDoc).get();
    if (snap.exists && snap.data().value) return String(snap.data().value);
  } catch (e) {
    console.error('change-pin: legacy lookup failed', which, e);
  }
  return '';
}

// Every PIN currently in use, so a new one can be refused before it
// creates two ways in under different names. The app used to do this in
// the browser by comparing against the PINs it held; now that it holds
// none, the check has to live here.
async function pinAlreadyUsed(db, candidate, exceptWhich) {
  for (const which of Object.keys(PINS)) {
    if (which === exceptWhich) continue;
    const existing = await readCurrentPin(db, which);
    if (existing && existing === candidate) return true;
  }
  const pins = await readStaffPins(db);
  const exceptStaff = staffIdFromWhich(exceptWhich);
  for (const [id, pin] of Object.entries(pins)) {
    if (String(id) === String(exceptStaff)) continue;
    if (String(pin) === candidate) return true;
  }
  try {
    const snap = await db.collection('app_data').doc('staff').get();
    const list = snap.exists ? JSON.parse(snap.data().value || '[]') : [];
    for (const m of (Array.isArray(list) ? list : [])) {
      if (String(m.id) === String(exceptStaff)) continue;
      if (m.pin && String(m.pin) === candidate) return true;
    }
  } catch (e) { /* best effort */ }
  return false;
}

// Removes one member's pin field from app_data/staff, leaving the rest
// of the record - name, role, commission - where the app can read it.
export async function stripStaffPin(db, staffId) {
  const ref = db.collection('app_data').doc('staff');
  const snap = await ref.get();
  if (!snap.exists) return;
  let list;
  try { list = JSON.parse(snap.data().value || '[]'); } catch (e) { return; }
  if (!Array.isArray(list)) return;
  let touched = false;
  const next = list.map((m) => {
    if (String(m.id) !== String(staffId) || m.pin === undefined) return m;
    touched = true;
    const { pin, ...rest } = m;
    return { ...rest, hasPin: true };
  });
  if (touched) await ref.set({ value: JSON.stringify(next) });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Only POST is supported' }); return; }

  // Same contract as staff-login: if the server side was never set up,
  // say so rather than failing, and the app keeps its old behaviour.
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  const which = typeof req.body?.which === 'string' ? req.body.which : '';
  const currentPin = typeof req.body?.currentPin === 'string' ? req.body.currentPin.trim() : '';
  const newPin = typeof req.body?.newPin === 'string' ? req.body.newPin.trim() : '';

  const staffId = staffIdFromWhich(which);
  if (!PINS[which] && !staffId) { res.status(400).json({ error: 'Kaunsa PIN badalna hai, ye saaf nahi hai' }); return; }

  // An empty new PIN means "remove this access", which is what the
  // Settings screen's "Partner access hata dein" does. The admin PIN is
  // the one that cannot be removed - there would be no way back in.
  const removing = newPin === '';
  if (removing && which === 'admin') {
    res.status(400).json({ error: 'Admin PIN hataya nahi ja sakta' });
    return;
  }
  if (!removing && !/^[0-9]{4,10}$/.test(newPin)) {
    res.status(400).json({ error: 'Naya PIN 4 se 10 digit ka hona chahiye (sirf number)' });
    return;
  }

  let app;
  try { app = getAdminApp(); }
  catch (e) {
    console.error('change-pin: admin init failed', e);
    res.status(500).json({ error: 'Server auth is not configured correctly' });
    return;
  }
  const db = admin.firestore(app);

  // 1. The caller must hold an admin session minted by staff-login.
  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!idToken) { res.status(401).json({ error: 'Pehle admin ke roop mein login karein' }); return; }
  let claims;
  try {
    claims = await admin.auth(app).verifyIdToken(idToken);
  } catch (e) {
    console.error('change-pin: token verify failed', e);
    res.status(401).json({ error: 'Session expire ho gaya - dobara login karein' });
    return;
  }
  if (claims.role !== 'admin') {
    res.status(403).json({ error: 'Sirf admin PIN badal sakta hai' });
    return;
  }

  // 2. For the admin's own PIN, they must also still know the old one,
  //    so a session left open on an unlocked phone cannot be used to
  //    lock the owner out. The partner PINs are the admin granting and
  //    revoking someone else's access, not changing their own - the
  //    admin role claim is the authority there, and Settings does not
  //    ask for the old partner PIN because the admin is not expected to
  //    know it.
  if (which === 'admin') {
    const existing = await readCurrentPin(db, which);
    if (existing && !pinMatches(currentPin, existing)) {
      res.status(401).json({ error: 'Current PIN galat hai' });
      return;
    }
  }

  // 3. And the PIN must not already belong to someone else, or there
  //    would be two ways in under different names - with the app no
  //    longer holding any PIN, this check has nowhere else to live.
  if (!removing && await pinAlreadyUsed(db, newPin, which)) {
    res.status(409).json({ error: 'Ye PIN pehle se use ho raha hai - alag PIN chunein' });
    return;
  }

  try {
    if (staffId) {
      const pins = await readStaffPins(db);
      if (removing) delete pins[staffId]; else pins[staffId] = newPin;
      await db.collection('secrets').doc(STAFF_PINS_DOC).set({
        pins, updatedAt: Date.now(), updatedBy: claims.uid || null,
      });
      // And take the readable copy out of the staff list, which every
      // signed-in client can read.
      await stripStaffPin(db, staffId);
    } else if (removing) {
      await db.collection('secrets').doc(PINS[which].secretDoc).delete();
    } else {
      await db.collection('secrets').doc(PINS[which].secretDoc).set({
        value: newPin,
        updatedAt: Date.now(),
        updatedBy: claims.uid || null,
      });
    }
  } catch (e) {
    console.error('change-pin: write failed', which, e);
    res.status(500).json({ error: 'PIN save nahi ho paya' });
    return;
  }

  // The old copy in app_data was readable by any signed-in user. Now
  // that the real value lives somewhere unreadable, leaving it behind
  // would mean the PIN is still exposed - and worse, still accepted,
  // since staff-login falls back to it.
  if (!staffId) {
    try { await db.collection('app_data').doc(PINS[which].legacyDoc).delete(); }
    catch (e) { console.error('change-pin: could not remove legacy doc', which, e); }
  }

  res.status(200).json({ ok: true });
}
