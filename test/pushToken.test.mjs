// Switching notifications on, from three different screens.
//
// requestPermissionAndGetToken returns { token, reason }. Two of the
// three call sites took the whole OBJECT as the token. An object is
// always truthy, so the "did it work" guard never fired, and the
// object was saved where a token string belongs - on the karigar's
// staff record and on the customer's job.
//
// Every push to those two would then have been addressed to something
// that is not a token, and sendPush swallows its failures, so nothing
// would have appeared anywhere. It would have looked exactly like
// "notifications just don't work" - with the Web Push key, which is
// the thing everyone would have blamed, perfectly fine.
//
// The whole class of bug is invisible until push is actually turned
// on, which is why it is pinned here rather than left to be found.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushFailureMessage } from '../src/jobCore.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/firebaseStorage.js', import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('pushToken');

t('every screen destructures the result, none takes the object', () => {
  // Captures whatever is on the left of the assignment, so a plain
  // identifier - the bug - is caught rather than skipped by the match.
  const re = /(?:const|let)\s+([^=]+?)\s*=\s*await window\.pushMessaging\.requestPermissionAndGetToken\(\)/g;
  const targets = [...app.matchAll(re)].map((m) => m[1].trim());
  assert.ok(targets.length >= 3,
    'the permission call sites have moved - found ' + targets.length + ', expected at least 3');
  for (const lhs of targets) {
    assert.equal(lhs, '{ token, reason }',
      'a call site takes the whole { token, reason } object as the token again: "' + lhs + '"');
  }
});

t('nothing is saved from a call that failed', () => {
  // The guard that never fired. Each site must bail on a null token
  // before it writes anything.
  for (const marker of ['customerPushToken: token', 'pushToken: token']) {
    const i = app.indexOf(marker);
    assert.ok(i > 0, 'cannot find where the token is saved: ' + marker);
    const before = app.slice(Math.max(0, i - 700), i);
    assert.ok(/if \(!token\) \{/.test(before), 'no bail-out before saving: ' + marker);
  }
});

t('one wording for every reason, shared by all three screens', () => {
  assert.equal(pushFailureMessage('not_configured'),
    'Notifications abhi setup nahi hui - Firebase Console se Web Push key chahiye');
  assert.equal(pushFailureMessage('unsupported'), 'Ye browser notifications support nahi karta');
  assert.equal(pushFailureMessage('denied'),
    'Notification permission nahi mili - phone ki settings se allow karein');
  assert.equal(pushFailureMessage('no_token'), 'Notification token nahi mila - dobara koshish karein');
  // Anything unexpected still says something, rather than "undefined".
  for (const junk of [undefined, null, '', 'something new', 0]) {
    assert.equal(pushFailureMessage(junk), 'Notifications on nahi ho payi');
  }
  // And nobody has gone back to writing their own.
  assert.ok(!/showToast\('Notification permission nahi mili', true\)/.test(app),
    'a screen words this itself again - including for the case where nobody was ever asked');
});

t('every message it can produce is translated', () => {
  const dict = readFileSync(new URL('../src/translations.js', import.meta.url), 'utf8');
  for (const reason of ['not_configured', 'unsupported', 'denied', 'no_token', 'anything-else']) {
    const msg = pushFailureMessage(reason);
    assert.ok(dict.includes("'" + msg + "':"), 'no English for: ' + msg);
  }
});

t('the Web Push key can be set without a code change, and "unset" is one check', () => {
  assert.ok(/import\.meta\.env\.VITE_VAPID_KEY/.test(store),
    'the key can no longer be set from the environment');
  assert.ok(/function vapidConfigured\(\)/.test(store),
    'the "not set up yet" check is inlined again - it will drift');
  assert.ok(/!vapidConfigured\(\)/.test(store), 'the check is defined but not used');
  // A real key is far longer than this; the placeholder must never pass.
  assert.ok(/VAPID_KEY\.length > 20/.test(store) && /startsWith\('REPLACE_WITH'\)/.test(store),
    'the placeholder could now be treated as a real key');
});

t('the two service workers do not fight over the same scope', () => {
  // A registration is keyed by SCOPE, not by script. sw.js (the PWA
  // shell) and firebase-messaging-sw.js both sit at the root, so both
  // default to '/' - and the second registration replaces the first.
  // Switching notifications on would kill the app-shell worker, and
  // the next load would kill the push one straight back: push that
  // works one day and not the next.
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.ok(/register\('\/sw\.js'\)/.test(main), 'the PWA worker registration has moved');
  assert.ok(/scope: SW_SCOPE/.test(store) && /firebase-cloud-messaging-push-scope/.test(store),
    'the push worker is registered at the default scope again - it will replace the PWA worker');
  assert.ok(/getRegistration\(SW_SCOPE\)/.test(store),
    'every attempt re-registers instead of reusing the existing worker');
});

t('the Web Push key is a real one, not the placeholder', () => {
  const m = store.match(/\|\|\s*"([^"]+)"/);
  assert.ok(m, 'the fallback key is gone from firebaseStorage.js');
  const key = m[1];
  assert.ok(!key.startsWith('REPLACE_WITH'), 'the placeholder is back - nothing will ever send');
  assert.equal(key.length, 87, 'a VAPID public key is 87 characters, this one is ' + key.length);
  assert.ok(key.startsWith('B'), 'a VAPID public key starts with B');
  assert.ok(/^[A-Za-z0-9_-]+$/.test(key), 'the key is not base64url - it will be rejected');
});

console.log(n + ' assertions passed\n');
