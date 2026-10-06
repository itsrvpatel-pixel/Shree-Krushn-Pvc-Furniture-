// The guard that watches the whole app.
//
// Its one hard rule: it must never be the thing that breaks. Every
// test here is really about that - it swallows anything thrown at it,
// it caps what it sends, and it never lets a reporting failure reach
// the app.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeError, errorFingerprint, shouldReport, installErrorReporting, groupErrors, isNoise,
  DEDUPE_MS, MAX_PER_SESSION, MAX_MESSAGE, MAX_STACK,
} from '../src/errorLog.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = 1790000000000;

console.log('errorLog');

t('anything at all can be thrown at it and comes back usable', () => {
  // A rejected promise carries whatever the code rejected with.
  assert.equal(normalizeError(new Error('boom')).message, 'boom');
  assert.equal(normalizeError('just a string').message, 'just a string');
  assert.equal(normalizeError(null).message, 'Unknown error');
  assert.equal(normalizeError(undefined).message, 'Unknown error');
  assert.equal(normalizeError('   ').message, 'Unknown error');
  assert.equal(normalizeError({ message: 'from an object' }).message, 'from an object');
  // The case that used to record "[object Object]", which names nothing.
  assert.equal(normalizeError({ code: 'permission-denied' }).message, '{"code":"permission-denied"}');
  for (const junk of [0, false, [], Symbol('x') && 'sym']) {
    assert.ok(normalizeError(junk).message.length > 0);
  }
});

t('a huge error cannot become a huge document', () => {
  const e = new Error('x'.repeat(5000));
  e.stack = 'y'.repeat(50000);
  const r = normalizeError(e);
  assert.equal(r.message.length, MAX_MESSAGE);
  assert.equal(r.stack.length, MAX_STACK);
});

t('the same bug from different records is one bug', () => {
  // Otherwise one broken job id produces two hundred separate lines.
  const a = errorFingerprint({ message: 'job_1837 not found', scope: 'home' });
  const b = errorFingerprint({ message: 'job_2291 not found', scope: 'home' });
  assert.equal(a, b);
  const other = errorFingerprint({ message: 'job_1837 not found', scope: 'gallery' });
  assert.notEqual(a, other, 'the same message on a different screen is a different bug');
});

t('the same bug is not sent twice in ten minutes', () => {
  const seen = { 'fp': NOW };
  assert.equal(shouldReport('fp', seen, NOW + 1000, 0), false);
  assert.equal(shouldReport('fp', seen, NOW + DEDUPE_MS, 0), true);
  assert.equal(shouldReport('other', seen, NOW + 1000, 0), true);
});

t('a render loop cannot write hundreds of documents', () => {
  // The expensive failure. 500 failures in a row must cost at most
  // MAX_PER_SESSION writes.
  assert.equal(shouldReport('fp', {}, NOW, MAX_PER_SESSION - 1), true);
  assert.equal(shouldReport('fp', {}, NOW, MAX_PER_SESSION), false);
  assert.equal(shouldReport('fp', {}, NOW, 9999), false);
});

t('it listens for the errors React never sees', () => {
  // Async failures and handlers that threw do not trip a React
  // boundary. They are most real-world errors and they show nothing on
  // screen at all.
  const handlers = {};
  const win = {
    addEventListener: (k, f) => { handlers[k] = f; },
    removeEventListener: (k) => { delete handlers[k]; },
  };
  const sent = [];
  const off = installErrorReporting(win, (r) => sent.push(r), () => ({ role: 'customer', scope: 'home' }));
  assert.deepEqual(Object.keys(handlers).sort(), ['error', 'unhandledrejection']);

  handlers.error({ error: new Error('handler blew up'), filename: '/assets/index-abc.js', lineno: 42 });
  handlers.unhandledrejection({ reason: new Error('promise died') });

  assert.equal(sent.length, 2);
  assert.equal(sent[0].message, 'handler blew up');
  assert.equal(sent[0].kind, 'error');
  assert.equal(sent[0].where, 'index-abc.js:42');
  assert.equal(sent[0].role, 'customer', 'the context is not attached to the report');
  assert.equal(sent[1].kind, 'unhandled-promise');

  off();
  assert.deepEqual(Object.keys(handlers), [], 'the listeners cannot be removed again');
});

t('a reporter that fails never reaches the app', () => {
  // This is the whole point. If sending can throw into the error
  // handler, one broken network call becomes an error loop.
  const handlers = {};
  const win = { addEventListener: (k, f) => { handlers[k] = f; }, removeEventListener: () => {} };
  installErrorReporting(win, () => { throw new Error('sending failed'); }, () => ({}));
  assert.doesNotThrow(() => handlers.error({ error: new Error('x') }));

  const handlers2 = {};
  const win2 = { addEventListener: (k, f) => { handlers2[k] = f; }, removeEventListener: () => {} };
  installErrorReporting(win2, () => Promise.reject(new Error('network')), () => ({}));
  assert.doesNotThrow(() => handlers2.unhandledrejection({ reason: 'x' }));

  // And a context function that itself throws.
  const handlers3 = {};
  const win3 = { addEventListener: (k, f) => { handlers3[k] = f; }, removeEventListener: () => {} };
  const got = [];
  installErrorReporting(win3, (r) => got.push(r), () => { throw new Error('context broke'); });
  assert.doesNotThrow(() => handlers3.error({ error: new Error('y') }));
  assert.equal(got.length, 0, 'a broken context must drop the report, not crash');
});

t('no window, no crash', () => {
  // Server-side render, a test, an old browser.
  assert.doesNotThrow(() => installErrorReporting(null, () => {}, () => ({})));
  assert.doesNotThrow(() => installErrorReporting({}, () => {}, () => ({}))());
});

t('the admin sees one line per bug, newest first', () => {
  const reports = [
    { message: 'job_1 not found', scope: 'home', at: 100 },
    { message: 'job_2 not found', scope: 'home', at: 300 },
    { message: 'something else', scope: 'gallery', at: 200 },
    { message: 'job_3 not found', scope: 'home', at: 150 },
  ];
  const g = groupErrors(reports);
  assert.equal(g.length, 2, 'the repeated bug is not grouped');
  assert.equal(g[0].count, 3);
  assert.equal(g[0].last, 300);
  assert.equal(g[0].first, 100);
  assert.equal(g[0].sample.message, 'job_2 not found', 'the sample is not the most recent one');
  assert.equal(g[1].sample.message, 'something else');
  assert.deepEqual(groupErrors(null), []);
  assert.deepEqual(groupErrors([null, {}, { at: 1 }]), [], 'junk rows become lines in the list');
});

t('things that are not faults never reach the list', () => {
  // A list full of noise is a list nobody reads, and this one is read
  // rarely by definition. The real one he hit: a phone that cannot do
  // web push is a fact about the phone, not a bug to fix.
  assert.equal(isNoise("Messaging: This browser doesn't support the API's required to use the Firebase SDK. (messaging/unsupported-browser)."), true);
  assert.equal(isNoise('Script error.'), true);
  assert.equal(isNoise('ResizeObserver loop completed with undelivered notifications.'), true);
  // And nothing real is swallowed by it.
  for (const real of ['Cannot read properties of undefined', 'permission-denied',
                      'job_1837 not found', 'Network request failed', '']) {
    assert.equal(isNoise(real), false, real);
  }
  // Wired into the decision, not just exported.
  assert.equal(shouldReport('fp', {}, NOW, 0, { message: 'messaging/unsupported-browser' }), false);
  assert.equal(shouldReport('fp', {}, NOW, 0, { message: 'a real bug' }), true);

  const handlers = {};
  const win = { addEventListener: (k, f) => { handlers[k] = f; }, removeEventListener: () => {} };
  const sent = [];
  installErrorReporting(win, (r) => sent.push(r), () => ({}));
  handlers.error({ error: new Error('x (messaging/unsupported-browser).') });
  assert.equal(sent.length, 0, 'the guard still files noise');
  handlers.error({ error: new Error('a real one') });
  assert.equal(sent.length, 1);
});

t('the app is actually wired to it, and the rules allow it', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

  assert.ok(/installErrorReporting\(/.test(app),
    'the window-level guard is not installed - async errors go unseen again');
  assert.ok(/kind: 'react'/.test(app),
    'React crashes no longer leave the device, which was the original gap');

  // The report must never carry who it happened to. It is read to find
  // out what broke.
  // Comments stripped first: the one above errorContext says the words
  // "name" and "phone number" precisely to explain why they are not
  // there, and matching those would be the test reading the promise
  // instead of the code.
  const ctxRaw = app.slice(app.indexOf('function errorContext()'), app.indexOf('const APP_BUILD'));
  const ctx = ctxRaw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/phone|customerName|\.name\b/.test(ctx),
    'the error context carries customer data - a bug list is not the place for it');
  assert.ok(/role/.test(ctx) && /version: APP_BUILD/.test(ctx),
    'the report no longer says which role or which build it came from');

  assert.ok(/match \/error_reports\/\{reportId\}/.test(rules), 'the rules have no error_reports block');
  assert.ok(/allow create: if request\.auth != null;/.test(rules),
    'a customer can no longer file a report - the device that broke is the one that must speak');
  assert.ok(/allow get, list, delete: if isStaff\(\);/.test(rules), 'reports are readable by non-staff');
  assert.ok(/allow update: if false;/.test(rules), 'a filed report can be rewritten');
});

console.log(n + ' assertions passed\n');
