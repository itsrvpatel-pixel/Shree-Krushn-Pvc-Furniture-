// Vercel Serverless Function - the "trusted server" piece push
// notifications genuinely require. Browsers won't let client-side code
// send a push notification directly (that would mean shipping a
// secret admin credential to every visitor's browser, which anyone
// could then steal and use to spam arbitrary notifications) - some
// piece of code has to run in a place only the business controls. A
// Cloud Function would normally be that piece, but deploying one needs
// the Firebase CLI (a terminal). This file is the alternative: since
// the app is already hosted on Vercel, ANY file placed under /api/
// automatically becomes its own small server endpoint the moment it's
// committed - deployed the exact same way (git commit -> Vercel
// auto-deploys) as every other file in this project, no separate
// command-line tool needed.
//
// SETUP (one-time, no coding required):
// 1. Firebase Console -> Project Settings (gear icon) -> Service
//    Accounts tab -> "Generate new private key" -> a .json file
//    downloads.
// 2. Open that file in a text editor, select all, copy.
// 3. Vercel dashboard -> this project -> Settings -> Environment
//    Variables -> New:
//      Name: FIREBASE_SERVICE_ACCOUNT
//      Value: (paste the entire JSON file content)
//    Save, then redeploy (Vercel does this automatically on the next
//    commit, or you can trigger a redeploy manually from the
//    dashboard).
//
// This key is powerful (it can act as your app's admin) - it's kept
// ONLY in Vercel's environment variable storage, never committed to
// GitHub or visible in any file in this repo, which is exactly the
// point: this server-side function can read it, a visitor's browser
// never can.

import admin from 'firebase-admin';

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set in Vercel');
  }
  const serviceAccount = JSON.parse(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(req, res) {
  // CORS: allows the app's own frontend (any origin, since this is a
  // single-business app with no untrusted third-party callers) to call
  // this endpoint via fetch() from the browser.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST is supported' });
    return;
  }

  try {
    getAdminApp();
  } catch (e) {
    // Most common cause: FIREBASE_SERVICE_ACCOUNT hasn't been set up
    // in Vercel yet - surfaced clearly rather than as a generic 500,
    // since this is the #1 thing to check when this endpoint doesn't
    // work yet.
    res.status(500).json({ error: 'Server not configured: ' + e.message });
    return;
  }

  const { token, title, body, tokens } = req.body || {};
  const targetTokens = tokens && Array.isArray(tokens) ? tokens : (token ? [token] : []);
  if (targetTokens.length === 0 || !title) {
    res.status(400).json({ error: 'Missing required fields: token (or tokens) and title' });
    return;
  }

  try {
    const message = {
      notification: { title, body: body || '' },
      tokens: targetTokens,
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    // The per-token reasons come back and were being thrown away, which
    // left "failureCount: 1" as the entire diagnosis. They are the
    // difference between a stale token from a reinstalled app
    // (registration-token-not-registered), a key that does not match
    // the project (mismatched-credential) and a token that was never
    // valid - three completely different fixes. Capped and
    // de-duplicated so one bad batch cannot return a wall of text.
    const reasons = [...new Set((response.responses || [])
      .filter((r) => r && r.error)
      .map((r) => String((r.error && r.error.code) || r.error)))].slice(0, 3);
    // Which tokens are permanently dead, by token rather than by
    // index, so the caller can drop them without having to trust that
    // the two arrays line up. A token stays in the list forever
    // otherwise: an app that was reinstalled, a token that was
    // refreshed, a device that was replaced - each leaves a corpse
    // that fails on every send from then on.
    //
    // Only the codes that mean "this will never work again". A send
    // that failed because FCM was busy is not a reason to make the
    // owner turn notifications on again.
    const PERMANENTLY_DEAD = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/invalid-argument',
    ];
    const dead = (response.responses || [])
      .map((r, i) => ((r && r.error && PERMANENTLY_DEAD.includes(String(r.error.code)))
        ? targetTokens[i] : null))
      .filter(Boolean);
    res.status(200).json({
      successCount: response.successCount,
      failureCount: response.failureCount,
      ...(reasons.length ? { reasons } : {}),
      ...(dead.length ? { dead } : {}),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to send notification' });
  }
}
