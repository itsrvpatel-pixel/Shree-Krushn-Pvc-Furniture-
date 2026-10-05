// A failed read is not an absent record.
//
// getOne used to catch every error and return null. Each caller read
// that null as "no such customer", so a weak signal was enough to log
// a customer out of the app, tell a registered person their number was
// not registered, and show an admin an empty customer list. The records
// were never gone - 21 of them sat in Firestore the whole time.
//
// These assertions are on the source, because getOne talks to Firestore
// directly and cannot be called here. They are narrow on purpose: each
// one names a specific way the bug came back.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const store = read('jobsStore.js');
const app = read('App.jsx');
const admin = read('AdminApp.jsx');

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('lookup failure handling');

const getOne = store.slice(store.indexOf('async function getOne('), store.indexOf('return { loadAll'));

check('getOne does not swallow a failed read', () => {
  assert.ok(!/catch\s*\([\s\S]*?return null/.test(getOne),
    'getOne catches an error and returns null again - that is the bug');
});

check('getOne still returns null for a record that is genuinely absent', () => {
  assert.ok(/\|\|\s*null/.test(getOne), 'the not-found path should still yield null');
});

check('the customer lookup at sign-in handles a thrown error', () => {
  // Both call sites - the pre-OTP check and the post-OTP one.
  const calls = [...app.matchAll(/customersStore\.getOne\(/g)];
  assert.ok(calls.length >= 2, 'expected the login and register lookups');
  for (const m of calls) {
    // Was a fixed 400-character window, which is not a test of being
    // inside a try - it is a test of how much comment sits above the
    // call. Adding an explanation above one of these made it "fail"
    // while the code was correct and unchanged.
    //
    // Instead: walk back and find whether the nearest thing before the
    // call is a try that has not been closed by its own catch yet.
    const before = app.slice(0, m.index);
    const lastTry = before.lastIndexOf('try {');
    const lastCatch = before.lastIndexOf('catch');
    assert.ok(lastTry > -1 && lastTry > lastCatch,
      'a getOne call is not inside a try: ' + app.slice(m.index, m.index + 70).trim());
    // And the try must actually handle it, not just open one.
    assert.ok(/catch/.test(app.slice(m.index, m.index + 900)),
      'a getOne call has no catch after it: ' + app.slice(m.index, m.index + 70).trim());
  }
});

check('a failed load never reports the number as unregistered', () => {
  // The "not registered" message must sit behind a successful lookup,
  // never inside a catch block.
  const idx = app.indexOf('Ye number register nahi hai');
  while (true) {
    const i = app.indexOf('Ye number register nahi hai', idx === -1 ? 0 : 0);
    if (i === -1) break;
    const before = app.slice(Math.max(0, i - 300), i);
    assert.ok(!/catch\s*\([^)]*\)\s*\{[^}]*$/.test(before),
      'the "not registered" message is reachable from a catch block');
    break;
  }
});

check('the customer is not logged out when the load failed', () => {
  assert.ok(app.includes('customersLoadFailed'),
    'nothing distinguishes a failed load from an empty one');
  const guard = app.slice(app.indexOf('if (!customer && loaded && !customersLoading'));
  const firstBranch = guard.slice(0, guard.indexOf('}'));
  assert.ok(firstBranch.includes('customersLoadFailed'),
    'the first branch on an empty customer list must be the failure case, not setSession(null)');
});

check('the admin list tells loading, failed and empty apart', () => {
  assert.ok(admin.includes('customersLoading'), 'admin list has no loading state');
  assert.ok(admin.includes('customersLoadFailed'), 'admin list has no failure state');
  assert.ok(/rows\.length === 0 && customersLoading/.test(admin),
    'the loading case must be checked before the empty one');
  assert.ok(/!customersLoading && !customersLoadFailed/.test(admin),
    '"no customers found" must require a load that actually succeeded');
});

console.log(n + ' assertions passed\n');
