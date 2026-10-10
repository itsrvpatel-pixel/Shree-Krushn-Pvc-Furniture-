// "Apps mein notification kyu nahi aa raha he koi bhi."
//
// Nothing was broken in the parts anyone could see. The service worker
// was live and correct, the send endpoint answered, FCM accepted a
// request and replied about the token - the whole chain was healthy
// and completely silent.
//
// The token was the problem. One was only ever fetched when somebody
// tapped "Notifications On Karein". FCM tokens rotate - on cleared
// site data, on reinstall, on the browser's own schedule, and most
// sharply when the service worker is replaced. This project replaced
// its push worker twice in one week, so every device's token died at
// once. The server then correctly dropped each dead token, nothing
// registered the new one, and nobody tapped a button that already
// said it was on.
//
// Both sides saw something reassuring and wrong: the owner saw
// permission still granted, the app saw no tokens to send to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pushPermissionGranted, tokenNeedsSaving, customerTokenChanged } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('pushTokenRefresh');

t('only a device that already said yes is refreshed', () => {
  assert.equal(pushPermissionGranted({ Notification: { permission: 'granted' } }), true);
  assert.equal(pushPermissionGranted({ Notification: { permission: 'default' } }), false);
  assert.equal(pushPermissionGranted({ Notification: { permission: 'denied' } }), false);
  // Never prompt from a background refresh, and never throw on a
  // browser that has no Notification at all.
  assert.equal(pushPermissionGranted({}), false);
  assert.equal(pushPermissionGranted(undefined), false);
  assert.equal(pushPermissionGranted({ get Notification() { throw new Error('blocked'); } }), false);
});

t('a rotated token is saved, an unchanged one is not', () => {
  assert.equal(tokenNeedsSaving('new-token', []), true);
  assert.equal(tokenNeedsSaving('new-token', [{ token: 'old' }]), true);
  assert.equal(tokenNeedsSaving('same', [{ token: 'same' }]), false);
  // A list from an older build held bare strings.
  assert.equal(tokenNeedsSaving('same', ['same']), false);
  assert.equal(tokenNeedsSaving('new', ['old']), true);
});

t('nothing is written when there is no token to write', () => {
  assert.equal(tokenNeedsSaving('', [{ token: 'a' }]), false);
  assert.equal(tokenNeedsSaving(null, []), false);
  assert.equal(tokenNeedsSaving(undefined, []), false);
  // requestPermissionAndGetToken returns {token, reason}; handing the
  // whole object over is the exact bug that silenced three call sites
  // once already.
  assert.equal(tokenNeedsSaving({ token: 'a' }, []), false);
  assert.equal(customerTokenChanged({ token: 'a' }, {}), false);
});

t('a customer job is only rewritten when the token really changed', () => {
  assert.equal(customerTokenChanged('abc', { customerPushToken: 'old' }), true);
  assert.equal(customerTokenChanged('abc', {}), true);
  // Otherwise every single app open would write the whole job back.
  assert.equal(customerTokenChanged('abc', { customerPushToken: 'abc' }), false);
  assert.equal(customerTokenChanged('', { customerPushToken: 'abc' }), false);
});

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const code = app.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

t('both sides refresh on start, not only on a button', () => {
  assert.ok(/pushPermissionGranted\(window\)/.test(code), 'nothing checks for an existing grant at start');
  assert.ok(/tokenNeedsSaving\(token, adminPushTokensRef\.current\)/.test(code),
    'the admin token is never refreshed on start');
  assert.ok(/customerTokenChanged\(token, jobForPushRef\.current\)/.test(code),
    'the customer token is never refreshed on start');
});

t('the refresh reads through a ref, not a mount-time copy', () => {
  // It writes back a whole job after an await. Saving a copy captured
  // at mount would quietly undo anything the customer did meanwhile -
  // the same class of bug the estimate screens already carry refs for.
  assert.ok(/const jobForPushRef = useLatestRef\(job\)/.test(code),
    'the customer refresh saves a stale job');
  assert.ok(!/customerTokenChanged\(token, job\)/.test(code), 'the closure value is used directly');
});

t('a browser that cannot do push is left alone', () => {
  // No prompt, no toast, no error - this runs unasked on every start.
  assert.ok(/if \(!window\.pushMessaging \|\| !pushPermissionGranted\(window\)\) return;/.test(code),
    'the silent refresh runs even where push is unavailable');
});


// "Load failed bata raha he."
//
// That is Safari's words for a fetch that never completed, shown raw.
// The endpoint was up and answering the whole time - checked from
// outside, twice, on both hosts - so this was a phone on mobile data
// dropping one request, reported in language that told him nothing
// and pointed him at the wrong thing entirely.
const store = readFileSync(new URL('../src/firebaseStorage.js', import.meta.url), 'utf8');
const storeCode = store.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

t('a dropped request is tried again before giving up', () => {
  const fn = storeCode.slice(storeCode.indexOf('async function sendPushViaApi('));
  assert.ok(/for \(let attempt = 0; attempt < 2; attempt\+\+\)/.test(fn),
    'one attempt is still the whole test');
  // A reply that arrived and would not parse will not parse twice -
  // only a failure to reach the server is worth repeating.
  assert.ok(/AbortError|TypeError/.test(fn), 'it retries failures that cannot be helped by retrying');
});

t('it cannot hang for ever on a stalled connection', () => {
  assert.ok(/PUSH_TIMEOUT_MS/.test(storeCode), 'no timeout, so a stalled request never returns');
  assert.ok(/AbortController/.test(storeCode), 'the timeout cannot actually cancel the request');
  assert.ok(/clearTimeout\(timer\)/.test(storeCode), 'the timer is left running after the request finishes');
});

t('the owner is told in words he can act on', () => {
  assert.ok(/Internet nahi mila - dobara try karein/.test(storeCode),
    'a network failure still surfaces as the browser’s own wording');
});

console.log(n + ' assertions passed');
