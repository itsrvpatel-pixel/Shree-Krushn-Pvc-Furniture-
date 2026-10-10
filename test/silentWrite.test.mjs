// A save that did not save, and said nothing.
//
// "Staff login me regional partner kyu login nahi ho raha."
//
// The partner was added, appeared in the list, and could not log in -
// because the staff list never reached Firestore. storage.set() caught
// every error and returned null, and not one of its twenty-four
// callers looked at that null. So a refused write was indistinguishable
// from a successful one: the screen had already updated from local
// state, so it looked saved.
//
// This is the worst failure shape in the app. A refused READ shows up
// at once as an empty screen. A refused WRITE leaves everything
// looking right until the page is reloaded and the change is gone -
// and by then nobody connects the two.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  writeFailureMessage, shouldReportWriteFailure, WRITE_FAILURE_GAP_MS,
} from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const store = readFileSync(new URL('../src/firebaseStorage.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-10T12:00:00Z');

console.log('silentWrite');

t('a failed write reaches a listener, whatever the caller does', () => {
  // The fix had to work for callers that ignore the return value,
  // because all twenty-four of them do.
  assert.ok(/let writeFailureListener = null;/.test(store), 'there is nobody to tell');
  const fn = store.slice(store.indexOf('async function set(key, value) {'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.ok(/if \(writeFailureListener\) writeFailureListener\(key, code\)/.test(body),
    'a refused write is silent again');
  assert.ok(/catch \(inner\)/.test(body),
    'a throwing listener would turn a failed write into a crash');
  assert.ok(/onWriteFailure: \(fn\) =>/.test(store), 'the app cannot register for it');
});

t('set() still does not throw, so the nine unguarded callers are safe', () => {
  // Making it throw would have fixed the callers inside a try and
  // turned the ones without into unhandled rejections.
  const fn = store.slice(store.indexOf('async function set(key, value) {'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.ok(/return null;/.test(body), 'set() now throws - unguarded callers will break');
  assert.ok(!/throw /.test(body), 'set() throws');
});

t('the app listens, once, and says what to do about it', () => {
  assert.ok(/window\.storage\.onWriteFailure\(\(key, code\) => \{/.test(app), 'nothing listens');
  assert.ok(/showToast\(writeFailureMessage\(key, code\), true\)/.test(app), 'it does not reach the screen');
  assert.ok(/shouldReportWriteFailure\(lastWriteComplaint\.current, now\)/.test(app),
    'one action writing six documents would raise six red toasts');
  assert.ok(/return \(\) => \{ window\.storage\.onWriteFailure\(null\); \};/.test(app),
    'the listener is never removed');
});

t('the message carries the fix, not just the fact', () => {
  const denied = writeFailureMessage('staff', 'permission-denied');
  assert.match(denied, /NOT saved/, 'it does not make clear nothing was saved');
  assert.match(denied, /staff/, 'it does not say what was lost');
  assert.match(denied, /log out and log in/i, 'it does not say what to do');

  const offline = writeFailureMessage('expenses', 'unavailable');
  assert.match(offline, /no internet/i);
  assert.ok(!/log out/i.test(offline), 'it sends someone to log in again over a weak signal');

  // Underscores are not shown to a person.
  assert.match(writeFailureMessage('admin_push_tokens', 'permission-denied'), /admin push tokens/);

  // Anything unrecognised still names the code, so it can be reported.
  const odd = writeFailureMessage('jobs', 'something-new');
  assert.match(odd, /something-new/);
  assert.match(odd, /Nothing else has been changed/);
});

t('it complains once per burst, not once per document', () => {
  assert.equal(shouldReportWriteFailure(null, NOW), true, 'the first one must get through');
  assert.equal(shouldReportWriteFailure(NOW - 500, NOW), false);
  assert.equal(shouldReportWriteFailure(NOW - WRITE_FAILURE_GAP_MS, NOW), true);
  // A clock set forward must not silence it for ever.
  assert.equal(shouldReportWriteFailure(NOW + 99999, NOW), true);
  for (const junk of ['', 'rubbish', 0, -1, NaN]) {
    assert.equal(shouldReportWriteFailure(junk, NOW), true, String(junk));
  }
});

t('adding a staff member still reports its own failure too', () => {
  // persistStaff had a try/catch and a toast all along. It never ran,
  // because set() swallowed the error - the catch was unreachable.
  // Keeping it is right; it is just no longer the only line of defence.
  assert.ok(/showToast\('Staff save failed', true\)/.test(app),
    'the staff save no longer reports its own failure');
});

console.log(n + ' assertions passed\n');
