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
import { pushFailureMessage, isIosInBrowser, pruneDeadPushTokens } from '../src/jobCore.js';

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

t('an iPhone in a Safari tab gets the instruction, not a dead end', () => {
  // The one "unsupported" that is not really unsupported. Apple allows
  // web push only from the Home Screen icon. Telling the owner his
  // browser cannot do it, when his phone can, costs him the feature.
  const msg = pushFailureMessage('unsupported', { iosInBrowser: true });
  assert.ok(/Home Screen/.test(msg), 'an iPhone is still told its browser cannot do this');
  assert.ok(/Share/.test(msg), 'the message does not say how');
  // Every other case is untouched.
  assert.equal(pushFailureMessage('unsupported', { iosInBrowser: false }),
    'Ye browser notifications support nahi karta');
  assert.equal(pushFailureMessage('unsupported'), 'Ye browser notifications support nahi karta');
  assert.equal(pushFailureMessage('denied', { iosInBrowser: true }),
    'Notification permission nahi mili - phone ki settings se allow karein');
});

t('the iPhone check knows a Home Screen app from a Safari tab', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36';

  assert.equal(isIosInBrowser(IPHONE, false, 5), true);
  // Already added to the Home Screen - nothing to tell them.
  assert.equal(isIosInBrowser(IPHONE, true, 5), false);
  assert.equal(isIosInBrowser(ANDROID, false, 5), false, 'Android does not need the Home Screen');
  // iPadOS 13+ reports itself as a Mac; touch points are what tell a
  // real Mac from an iPad.
  assert.equal(isIosInBrowser(MAC, false, 5), true, 'an iPad pretending to be a Mac is missed');
  assert.equal(isIosInBrowser(MAC, false, 0), false, 'a real desktop Mac is told about the Home Screen');
  // Junk in, no crash.
  for (const junk of [undefined, null, '', 0]) {
    assert.doesNotThrow(() => isIosInBrowser(junk, junk, junk));
  }
});

t('reading the browser cannot break the screen explaining itself', () => {
  const env = app.slice(app.indexOf('function pushEnv()'), app.indexOf('const SESSION_STORAGE_KEY'));
  assert.ok(/try \{/.test(env) && /catch \(e\) \{ return \{\}; \}/.test(env),
    'pushEnv can now throw - a browser without matchMedia would take down the settings screen');
  assert.equal((app.match(/pushFailureMessage\(reason, pushEnv\(\)\)/g) || []).length, 3,
    'not every screen passes the browser context - one of them will still say "unsupported" on an iPhone');
});

t('the service worker always installs the push listener when it can', () => {
  // Calling firebase.messaging() is what installs the SDK's own
  // 'push' event listener, and that listener is what displays an
  // incoming notification. Gating the call on isSupported() meant one
  // disagreement about this scope silenced every notification:
  // permission granted, token issued, message accepted by FCM, and
  // nothing on the phone. try/catch does the job the gate was brought
  // in for without a second way to end up with no listener.
  const swRaw = readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8');
  // Comments stripped: the one above the call explains the gate by
  // name, and matching that would be the test reading the warning
  // instead of the code. (Caught exactly this way once already.)
  const sw = swRaw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(/try \{\s*\n\s*messaging = firebase\.messaging\(\);/.test(sw),
    'firebase.messaging() is no longer called unconditionally inside the try');
  assert.ok(!/isSupported\(\)/.test(sw),
    'the isSupported gate is back - it can leave the worker with no push listener at all');
  // And the exception must still not kill the file: the tap handler
  // below it has nothing to do with messaging support.
  assert.ok(/catch \(e\) \{/.test(sw), 'the throw is unguarded again - it would kill the whole worker');
  assert.ok(swRaw.indexOf('notificationclick') > swRaw.indexOf('catch (e) {'),
    'the tap handler no longer sits after the guard');
});

t('a dead token is taken out of the list', () => {
  // The real result he saw: "1 device par gaya, 1 fail
  // (messaging/registration-token-not-registered)". That second token
  // will never work again, and left in the list it fails on every
  // send from then on.
  const list = [{ token: 'alive' }, { token: 'dead' }, { token: 'also-alive' }];
  assert.deepEqual(pruneDeadPushTokens(list, ['dead']),
    [{ token: 'alive' }, { token: 'also-alive' }]);
  assert.deepEqual(pruneDeadPushTokens(list, ['dead', 'also-alive']), [{ token: 'alive' }]);
});

t('nothing dead means nothing written', () => {
  // Returns the SAME array, so the caller can skip the Firestore
  // write rather than rewriting the list after every notification.
  const list = [{ token: 'a' }];
  assert.equal(pruneDeadPushTokens(list, []), list);
  assert.equal(pruneDeadPushTokens(list, null), list);
  assert.equal(pruneDeadPushTokens(list, undefined), list);
  assert.equal(pruneDeadPushTokens(list, ['not-in-the-list']), list);
  assert.deepEqual(pruneDeadPushTokens(null, ['x']), []);
  assert.deepEqual(pruneDeadPushTokens(undefined, undefined), []);
  assert.doesNotThrow(() => pruneDeadPushTokens([null, undefined, { token: 'a' }], ['a']));
});

t('only permanently dead codes drop a token', () => {
  // FCM being busy is not a reason to make the owner switch
  // notifications on again.
  const api = readFileSync(new URL('../api/send-push.js', import.meta.url), 'utf8');
  const i = api.indexOf('const PERMANENTLY_DEAD');
  assert.ok(i > 0, 'the dead-code list is gone from the server');
  const block = api.slice(i, api.indexOf('];', i));
  assert.ok(/registration-token-not-registered/.test(block), 'the code he actually hit is not listed');
  for (const transient of ['unavailable', 'internal-error', 'quota-exceeded', 'server-unavailable']) {
    assert.ok(!block.includes(transient), 'a transient failure would delete a working token: ' + transient);
  }
  // Reported by token, not by index - two arrays that must line up is
  // a bug waiting for a reordering.
  assert.ok(/\? targetTokens\[i\] : null/.test(api), 'dead tokens are no longer returned as tokens');
});

t('every send prunes, not just the test button', () => {
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  assert.ok(/\.then\(\(r\) => dropDeadTokens\(r && r\.dead\)\)/.test(app),
    'real notifications no longer clean up after themselves - only the test button would');
  assert.ok(/onDeadPushTokens\(r\.dead\)/.test(admin), 'the test button no longer prunes');
  // Read through the ref: this runs after an await, and the captured
  // list may be several notifications old by then.
  assert.ok(/adminPushTokensRef\.current/.test(app),
    'the pruner reads a captured list instead of the current one');
});

console.log(n + ' assertions passed\n');
