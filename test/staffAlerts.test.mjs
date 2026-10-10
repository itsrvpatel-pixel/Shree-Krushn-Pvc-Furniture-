// "Bell icon mein koi notification nahi milte - app mein customer ki
//  kya activity hui, vo kuch bhi."
//
// He was right, and it was a hole in rules I wrote. Every bell entry
// was appended to one shared app_data document. The phase-2 rules let
// a customer write their own record, their own job and their own
// notification document, and nothing else - so app_data/notifications
// was refused to them.
//
// And almost every entry worth having is raised BY a customer, in the
// customer's own browser: booking a visit, approving an estimate,
// asking for a change, requesting extra work. Each one wrote the
// entry, was denied, and the denial landed in a catch that swallowed
// it as "best effort". The bell was empty for every customer action
// since the day those rules went live, and nothing anywhere said so.
//
// Fixed the way error_reports already works: a create-only collection
// a customer may add to and not read.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/firebaseStorage.js', import.meta.url), 'utf8');
const strip = (s) => s.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('staffAlerts');

// The block of rules governing the new collection, comments removed so
// an explanation can never satisfy an assertion - that has happened
// twice on this project already.
const block = (() => {
  const r = strip(rules);
  const i = r.indexOf('match /staff_alerts/');
  assert.ok(i > 0, 'the rules have no staff_alerts collection');
  return r.slice(i, r.indexOf('}', r.indexOf('allow update', i)) + 1);
})();

t('a signed-in customer may raise one', () => {
  assert.ok(/allow create: if request\.auth != null;/.test(block),
    'a customer still cannot report their own activity');
});

t('only staff may read them', () => {
  assert.ok(/allow get, list, delete: if isStaff\(\);/.test(block),
    'someone other than staff can read or clear the alerts');
});

t('nothing can be rewritten after the fact', () => {
  assert.ok(/allow update: if false;/.test(block),
    'an alert can be edited, so it records nothing reliable');
});

t('the shared bell document is still staff-only', () => {
  // The fix must not have been to loosen app_data instead. A customer
  // who could write that document could rewrite or wipe the whole
  // staff bell, since it is one document holding an array.
  const r = strip(rules);
  const appData = r.slice(r.indexOf('match /app_data/'), r.indexOf('match /jobs/'));
  assert.ok(/allow write: if isStaff\(\) \|\| myNotifDoc\(\);/.test(appData),
    'app_data write was widened - a customer must not be able to rewrite the shared bell');
});

t('a customer raises an alert instead of writing the shared list', () => {
  const c = strip(app);
  const fn = c.slice(c.indexOf('const pushNotification = useCallback('), c.indexOf('const pushNotification = useCallback(') + 1400);
  assert.ok(/role === 'customer'/.test(fn), 'a customer still takes the staff write path');
  assert.ok(/window\.staffAlerts\.add\(entry\)/.test(fn), 'the entry goes nowhere for a customer');
  // And must not then fall through into the write that gets refused.
  const afterGuard = fn.slice(fn.indexOf("role === 'customer'"));
  assert.ok(/return;/.test(afterGuard.slice(0, 220)), 'the customer path falls through to the denied write');
});

t('staff fold them in and clear them', () => {
  const c = strip(app);
  assert.ok(/window\.staffAlerts\.loadAll\(\)/.test(c), 'staff never pick the alerts up');
  assert.ok(/window\.staffAlerts\.clear\(/.test(c), 'alerts are never cleared, so they pile up forever');
  assert.ok(/role !== 'customer' && window\.staffAlerts/.test(c),
    'a customer session would try to read a collection it is denied');
});

t('an entry already in the bell is not added twice', () => {
  const c = strip(app);
  const i = c.indexOf('window.staffAlerts.loadAll()');
  const nearby = c.slice(i, i + 900);
  assert.ok(/known\.has\(r\.id\)/.test(nearby), 'the same alert can be folded in twice');
});

t('the store is create-only from the customer side', () => {
  const s = strip(store);
  assert.ok(/window\.staffAlerts = \{/.test(s), 'the store is not exposed');
  assert.ok(/const ALERTS_COLLECTION = 'staff_alerts';/.test(s), 'the collection name does not match the rules');
  // A failed add must never surface: it runs inside the action that
  // triggered it, and a toast about the bell would be worse than the
  // missing bell entry.
  const add = s.slice(s.indexOf('async function addStaffAlert('), s.indexOf('async function loadStaffAlerts('));
  assert.ok(/catch \(e\)/.test(add) && !/showToast/.test(add), 'a failed alert interrupts the customer');
});

t('the staff push-token refresh does not run for a customer', () => {
  // Same class of bug: it appends to the shared admin token list,
  // which a customer is rightly refused.
  const c = strip(app);
  const i = c.indexOf('tokenNeedsSaving(token, adminPushTokensRef.current)');
  assert.ok(i > 0, 'the token refresh has moved');
  const before = c.slice(Math.max(0, i - 700), i);
  assert.ok(/role === 'customer'\) return;/.test(before),
    'a customer session runs the staff token refresh and is denied');
});

console.log(n + ' assertions passed');
