// The website's enquiry form, server side.
//
// The site could only say "WhatsApp karein" or "App kholein". Both ask
// a stranger to start a conversation, and somebody looking at
// wardrobes at eleven at night does not. They leave, and the business
// never learns they were there.
//
// This is the quiet option: a name and a number, written straight into
// Firestore and pushed to the owner's phone.
//
// It runs here rather than in the browser for the same reason
// send-push.js does - the page is public, so it cannot be trusted with
// a credential, and it cannot be trusted about what it sends either.
// What the form accepts is defined in src/leadForm.js and checked
// again here: the page already validated, but the page is not where
// the decision is made.
//
// Needs the same FIREBASE_SERVICE_ACCOUNT environment variable
// send-push.js documents; no extra setup.
import admin from 'firebase-admin';
import { normalizeLead, leadFailureMessage, leadSummary } from '../src/leadForm.js';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set in Vercel');
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

// A public form is the one thing on this site any bot can post to.
// Per-instance and therefore leaky across cold starts, which is fine:
// it is here to stop a loop hammering the endpoint, not to be a
// security boundary. The honeypot and the validation do the real work.
const recent = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 5;

function tooMany(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 500) {
    for (const [k, v] of recent) if (!v.some((t) => now - t < WINDOW_MS)) recent.delete(k);
  }
  return hits.length > MAX_PER_WINDOW;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Only POST is supported' }); return; }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) { res.status(429).json({ ok: false, error: 'Please try again shortly' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  const { ok, reason, lead } = normalizeLead(body || {});
  if (!ok) {
    // A bot is answered 200 and told nothing: one that knows it was
    // spotted simply tries again differently.
    if (reason === 'bot') { res.status(200).json({ ok: true }); return; }
    res.status(400).json({ ok: false, error: leadFailureMessage(reason), field: reason });
    return;
  }

  try {
    const app = getAdminApp();
    const db = admin.firestore(app);
    await db.collection('leads').add({ ...lead, ip });

    // Straight to the owner's phone. An enquiry nobody sees for a day
    // is most of the value gone - this is someone who was on the site
    // a moment ago.
    try {
      const snap = await db.collection('app_data').doc('admin_push_tokens').get();
      const raw = snap.exists ? snap.data().value : null;
      const tokens = (raw ? JSON.parse(raw) : [])
        .map((t) => (typeof t === 'string' ? t : t && t.token))
        .filter(Boolean);
      if (tokens.length) {
        await admin.messaging(app).sendEachForMulticast({
          tokens,
          notification: {
            title: 'New enquiry from the website',
            body: leadSummary(lead) + ' - ' + lead.phone,
          },
        });
      }
    } catch (e) {
      // The enquiry is already saved. A push that failed must not turn
      // a captured lead into an error the visitor sees.
      console.warn('lead saved, push failed (ignored)', e && e.code);
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('lead save failed:', e);
    res.status(500).json({ ok: false, error: 'Could not send - please try again shortly' });
  }
}
