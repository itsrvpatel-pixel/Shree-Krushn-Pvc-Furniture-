// Seeing what broke on somebody else's phone.
//
// The app already caught React crashes and wrote the last one to that
// device's localStorage - useful when the person holding the phone is
// the person asking, and useless otherwise. "App kaam nahi kar raha"
// from a customer in Naroda has cost whole days.
//
// Two gaps this closes. The report leaves the device, so the owner can
// read it in the admin app. And an error that never reaches a React
// boundary - a failed promise, a handler that threw, anything async -
// is caught too. Those are most real-world errors; none of them show
// an error screen, they just quietly do nothing, which is the hardest
// kind to be told about.
//
// Everything here is built so the reporter can never make things
// worse. It never throws, it never blocks, and it caps itself hard:
// a render loop that fails 500 times must not write 500 documents.

export const DEDUPE_MS = 10 * 60 * 1000;
export const MAX_PER_SESSION = 10;
export const MAX_MESSAGE = 300;
export const MAX_STACK = 1200;

// What an error actually is varies wildly: an Error, a string, a
// DOM ErrorEvent, a rejected promise carrying anything at all, or
// null. All of it has to end up as the same small shape.
export function normalizeError(err, extra) {
  const e = extra || {};
  let message = '';
  let stack = '';
  if (err instanceof Error || (err && typeof err === 'object' && (err.message || err.stack))) {
    message = String(err.message || err.name || 'Error');
    stack = String(err.stack || '');
  } else if (typeof err === 'string') {
    message = err;
  } else if (err == null) {
    message = 'Unknown error';
  } else {
    // A rejected promise can carry literally anything, including an
    // object with no message. Printing it beats recording "[object
    // Object]", which names nothing.
    try { message = JSON.stringify(err).slice(0, MAX_MESSAGE); } catch (x) { message = String(err); }
  }
  message = message.trim().slice(0, MAX_MESSAGE) || 'Unknown error';
  return {
    message,
    stack: stack.slice(0, MAX_STACK),
    kind: e.kind || 'error',
    scope: e.scope || '',
    where: e.where || '',
    role: e.role || '',
    at: typeof e.at === 'number' ? e.at : Date.now(),
    device: String(e.device || '').slice(0, 180),
    version: String(e.version || '').slice(0, 40),
  };
}

// Two reports are "the same bug" when the message and the screen
// match. Deliberately not the stack: the same failure from two builds
// has two stacks, and the owner does not want that listed twice.
//
// Numbers inside the message are blanked, so "job_1837 not found" and
// "job_2291 not found" are one bug rather than two hundred.
export function errorFingerprint(report) {
  const r = report || {};
  const msg = String(r.message || '').replace(/\d+/g, '#').slice(0, 160);
  return (r.scope || '-') + '|' + (r.kind || '-') + '|' + msg;
}

// Worth sending? The caps are the whole point of this module.
//
// `seen` is a plain object of fingerprint -> last sent time, owned by
// the caller so this stays testable. `count` is how many have already
// gone from this session.
export function shouldReport(fingerprint, seen, now, count, opts) {
  const o = opts || {};
  const gap = typeof o.dedupeMs === 'number' ? o.dedupeMs : DEDUPE_MS;
  const cap = typeof o.maxPerSession === 'number' ? o.maxPerSession : MAX_PER_SESSION;
  if (!fingerprint) return false;
  if (count >= cap) return false;
  const last = seen && seen[fingerprint];
  if (typeof last === 'number' && now - last < gap) return false;
  return true;
}

// The listening part. Returns a function that removes the listeners
// again, which the tests use and nothing else does.
//
// `send` is called with a normalized report. It is never awaited and
// its failures are swallowed: a reporter that can break the app it is
// reporting on is worse than no reporter.
export function installErrorReporting(win, send, context) {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const seen = Object.create(null);
  let count = 0;
  const ctx = typeof context === 'function' ? context : () => ({});

  const hand = (err, extra) => {
    try {
      const report = normalizeError(err, { ...ctx(), ...extra });
      const fp = errorFingerprint(report);
      if (!shouldReport(fp, seen, report.at, count)) return;
      seen[fp] = report.at;
      count += 1;
      Promise.resolve(send(report)).catch(() => {});
    } catch (e) { /* the reporter must never be the thing that breaks */ }
  };

  const onError = (ev) => hand(
    (ev && ev.error) || (ev && ev.message) || ev,
    { kind: 'error', where: ev && ev.filename ? String(ev.filename).split('/').pop() + ':' + ev.lineno : '' },
  );
  const onRejection = (ev) => hand((ev && ev.reason) || ev, { kind: 'unhandled-promise' });

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}

// Newest first, and one line per bug rather than one per occurrence -
// a list of the same message ninety times is a list nobody reads.
export function groupErrors(reports) {
  const byFp = new Map();
  for (const r of reports || []) {
    if (!r || !r.message) continue;
    const fp = errorFingerprint(r);
    const prev = byFp.get(fp);
    if (prev) {
      prev.count += 1;
      if (r.at > prev.last) { prev.last = r.at; prev.sample = r; }
      if (r.at < prev.first) prev.first = r.at;
    } else {
      byFp.set(fp, { fingerprint: fp, count: 1, first: r.at, last: r.at, sample: r });
    }
  }
  return [...byFp.values()].sort((a, b) => b.last - a.last);
}
