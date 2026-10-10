// A copy of the business, taken every night without anyone remembering to.
//
// WHY THIS EXISTS
//
// There was a "Download backup" button in Settings, and that was the
// whole of it. A backup you have to remember is a backup nobody has:
// asked directly how many times it had been pressed, the honest answer
// was none. Meanwhile the thing it guards against is the one failure
// this business could not absorb - every customer, estimate, payment
// and expense, gone, with no way back.
//
// So it runs on a schedule now, server-side, whether or not anyone has
// the app open - the same Vercel cron that already sends tomorrow's
// visit reminders.
//
// WHAT IT DOES NOT PROTECT AGAINST, SAID PLAINLY
//
// The copy lands in Firebase Storage, which is the same Google account
// the data itself lives in. That covers what actually goes wrong in
// practice: a record deleted by mistake, a bad migration, a rules
// change that empties a screen. It does NOT cover losing the account
// itself. For that the copy has to leave the building, which is why
// the admin screen shows the latest backup with a download button and
// says how old it is - one tap, onto a phone or Drive, and the copy is
// somewhere Google cannot reach. A monthly reminder nags for exactly
// that.
//
// WHAT IS IN IT
//
// app_data (the main store - jobs, gallery, staff, expenses, settings),
// and the customers, jobs and leads collections. Deliberately NOT the
// secrets collection: those are PIN hashes, and a file that gets
// downloaded onto a phone and forwarded over WhatsApp is the last
// place they should be. A forgotten PIN is recoverable; a leaked one
// is not. Also skipped: login_attempts, staff_alerts and error_reports,
// which are working notes rather than the business.
//
// A BACKUP THAT FAILS QUIETLY IS WORSE THAN NONE
//
// It would read as cover that is not there. So every run - success or
// failure - writes app_data/backup_status, the admin screen reads it,
// and a run that fails pushes a notification to admin devices. If the
// cron itself stops firing, nothing writes the status at all, which is
// why the screen reports the AGE of the last backup rather than just
// its result: silence shows up as a number going red.

import admin from 'firebase-admin';

const BUCKET = 'shree-krushn-pvc-furniture.firebasestorage.app';
const PREFIX = 'backups/';
export const STATUS_DOC = 'backup_status';

// Collections worth keeping. See the note above on what is left out
// and why - this list is the decision, not an accident of discovery.
export const BACKED_UP = ['app_data', 'customers', 'jobs', 'leads'];

// How long copies are kept. Daily for a month covers "someone deleted
// something last week and nobody noticed"; one a month after that
// covers the slower kind of mistake, at almost no storage cost.
export const KEEP_DAILY_DAYS = 30;
export const KEEP_MONTHLY_COUNT = 12;

function getAdminApp() {
  if (admin.apps.length > 0) return admin.apps[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set in Vercel');
  return admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw)),
    storageBucket: BUCKET,
  });
}

// backups/backup-2026-10-10.json - sortable, and the date is readable
// without opening anything.
export function backupName(date) {
  const d = date instanceof Date ? date : new Date(date);
  const iso = [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return PREFIX + 'backup-' + iso + '.json';
}

export function dateFromName(name) {
  const m = /backup-(\d{4})-(\d{2})-(\d{2})\.json$/.exec(String(name || ''));
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3];
}

/* Which copies to delete.
 *
 * Pure, and separated from the storage call, because deleting the
 * wrong thing here is unrecoverable - that is the one operation in
 * this file with no undo, so it is the one a test must be able to
 * drive directly.
 *
 * Keeps every copy from the last KEEP_DAILY_DAYS days, plus the
 * earliest copy in each of the last KEEP_MONTHLY_COUNT months. Anything
 * it cannot parse a date out of is kept, never deleted: an unreadable
 * name is a reason to leave a file alone, not to remove it.
 */
export function prunable(names, now) {
  const today = new Date(now);
  const dated = [];
  for (const name of names) {
    const d = dateFromName(name);
    if (d) dated.push({ name, date: d });
  }
  const keep = new Set();
  const cutoff = new Date(today.getTime() - KEEP_DAILY_DAYS * 86400000);
  const cutoffStr = backupName(cutoff).slice(PREFIX.length + 7, PREFIX.length + 17);

  for (const row of dated) if (row.date >= cutoffStr) keep.add(row.name);

  // The earliest surviving copy of each month, newest months first.
  const byMonth = new Map();
  for (const row of [...dated].sort((a, b) => a.date.localeCompare(b.date))) {
    const month = row.date.slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, row.name);
  }
  const months = [...byMonth.keys()].sort().reverse().slice(0, KEEP_MONTHLY_COUNT);
  for (const m of months) keep.add(byMonth.get(m));

  return dated.filter((row) => !keep.has(row.name)).map((row) => row.name);
}

// How a run is summarised for the admin screen. Kept here so the
// shape cannot drift from what the screen expects.
export function statusFrom(result, at) {
  return {
    at,
    ok: !!result.ok,
    error: result.ok ? null : String(result.error || 'unknown'),
    name: result.name || null,
    sizeBytes: result.sizeBytes || 0,
    counts: result.counts || {},
  };
}

async function readEverything(db) {
  const data = {};
  const counts = {};
  for (const name of BACKED_UP) {
    const snap = await db.collection(name).get();
    const docs = {};
    snap.forEach((doc) => { docs[doc.id] = doc.data(); });
    data[name] = docs;
    counts[name] = snap.size;
  }
  return { data, counts };
}

async function runBackup(app, now) {
  const db = admin.firestore(app);
  const { data, counts } = await readEverything(db);
  const body = JSON.stringify({
    takenAt: new Date(now).toISOString(),
    business: 'Shree Krushn PVC Furniture',
    collections: BACKED_UP,
    counts,
    data,
  });
  const name = backupName(new Date(now));
  const bucket = admin.storage(app).bucket();
  await bucket.file(name).save(Buffer.from(body, 'utf8'), {
    contentType: 'application/json',
    resumable: false,
    // Private. The Storage rules deny clients the whole backups/
    // prefix; the only way to one is a signed link from this file,
    // handed out to an admin session and good for a few minutes.
    metadata: { cacheControl: 'no-store' },
  });

  // Prune only after the new copy is safely written, so a failure
  // here never leaves fewer copies than we started with.
  let pruned = [];
  try {
    const [files] = await bucket.getFiles({ prefix: PREFIX });
    pruned = prunable(files.map((f) => f.name), now);
    for (const old of pruned) await bucket.file(old).delete({ ignoreNotFound: true });
  } catch (e) {
    console.error('backup: prune failed (ignored)', e);
  }

  return { ok: true, name, sizeBytes: Buffer.byteLength(body, 'utf8'), counts, pruned };
}

async function writeStatus(app, status) {
  try {
    await admin.firestore(app).collection('app_data').doc(STATUS_DOC)
      .set({ value: JSON.stringify(status) });
  } catch (e) {
    console.error('backup: status write failed', e);
  }
}

async function alertAdmins(app, text) {
  try {
    const db = admin.firestore(app);
    const snap = await db.collection('app_data').doc('admin_push_tokens').get();
    const tokens = snap.exists ? JSON.parse(snap.data().value || '[]') : [];
    const list = (Array.isArray(tokens) ? tokens : []).filter((t) => typeof t === 'string' && t);
    if (list.length === 0) return;
    await admin.messaging(app).sendEachForMulticast({
      tokens: list,
      notification: { title: 'Backup problem', body: text },
    });
  } catch (e) {
    console.error('backup: alert failed (ignored)', e);
  }
}

export default async function handler(req, res) {
  let app;
  try { app = getAdminApp(); }
  catch (e) {
    console.error('backup: admin init failed', e);
    res.status(500).json({ error: 'Server is not configured correctly' });
    return;
  }

  // ---- The nightly run. Vercel sends CRON_SECRET on every real cron
  //      invocation, so the URL on its own is not enough to trigger it.
  if (req.method === 'GET') {
    const header = req.headers.authorization || '';
    if (!process.env.CRON_SECRET || header !== 'Bearer ' + process.env.CRON_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const now = Date.now();
    let result;
    try {
      result = await runBackup(app, now);
    } catch (e) {
      console.error('backup: run failed', e);
      result = { ok: false, error: (e && e.message) || String(e) };
    }
    const status = statusFrom(result, new Date(now).toISOString());
    await writeStatus(app, status);
    if (!status.ok) await alertAdmins(app, 'Tonight the backup did not run. Open Settings to see why.');
    res.status(status.ok ? 200 : 500).json(status);
    return;
  }

  // ---- Everything else is the admin screen asking: what is there, and
  //      give me a link to one. Both need a real admin session.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const header = req.headers.authorization || '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!idToken) { res.status(401).json({ error: 'Log in as admin first' }); return; }
  let claims;
  try {
    claims = await admin.auth(app).verifyIdToken(idToken);
  } catch (e) {
    res.status(401).json({ error: 'Session expired - please log in again' });
    return;
  }
  if (claims.role !== 'admin') {
    res.status(403).json({ error: 'Only the admin can download backups' });
    return;
  }

  const action = (req.body && req.body.action) || 'list';
  const bucket = admin.storage(app).bucket();

  try {
    if (action === 'list') {
      const [files] = await bucket.getFiles({ prefix: PREFIX });
      const rows = files
        .map((f) => ({
          name: f.name,
          date: dateFromName(f.name),
          sizeBytes: Number((f.metadata && f.metadata.size) || 0),
        }))
        .filter((r) => r.date)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 40);
      res.status(200).json({ ok: true, backups: rows });
      return;
    }

    if (action === 'download') {
      const name = String((req.body && req.body.name) || '');
      // Only ever a file this endpoint created. Without this check a
      // crafted name could sign a link to anything in the bucket.
      if (!name.startsWith(PREFIX) || !dateFromName(name) || name.includes('..')) {
        res.status(400).json({ error: 'Unknown backup' });
        return;
      }
      const file = bucket.file(name);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).json({ error: 'That backup is no longer there' }); return; }
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 10 * 60 * 1000,
      });
      res.status(200).json({ ok: true, url });
      return;
    }

    // Running it by hand, for the first one and for peace of mind.
    if (action === 'run') {
      const now = Date.now();
      let result;
      try { result = await runBackup(app, now); }
      catch (e) {
        console.error('backup: manual run failed', e);
        result = { ok: false, error: (e && e.message) || String(e) };
      }
      const status = statusFrom(result, new Date(now).toISOString());
      await writeStatus(app, status);
      res.status(status.ok ? 200 : 500).json(status);
      return;
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('backup: ' + action + ' failed', e);
    res.status(500).json({ error: 'Could not reach the backup store' });
  }
}
