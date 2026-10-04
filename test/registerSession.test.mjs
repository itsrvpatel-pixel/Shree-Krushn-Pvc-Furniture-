// Reads App.jsx as text. The race these guard against needs a browser
// and a real Firestore to reproduce end to end, but each guard is a
// specific line that must not quietly go away again - and losing one
// does not break anything visible until a real person registers and is
// thrown back to the login screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('registerSession');

// The effect that loads the one customer record a customer session is
// allowed to see.
const effect = app.slice(
  app.indexOf("if (session.role === 'customer') {"),
  app.indexOf('const all = await window.customersStore.loadAll();'),
);

t('a session load never runs while our own customer write is in flight', () => {
  assert.match(
    effect,
    /if \(customersWriteInFlightRef\.current\.active\) return;/,
    'without this, registering races its own create: the server says "no such customer", '
    + 'the list is emptied, and the guard signs the customer straight back out',
  );
  // The guard has to come BEFORE the read, or it guards nothing.
  assert.ok(
    effect.indexOf('customersWriteInFlightRef.current.active') < effect.indexOf('await window.customersStore.getOne'),
    'the in-flight check must be ahead of the fetch',
  );
});

t('a missing record falls back to the copy this device holds', () => {
  assert.match(effect, /customersRef\.current \|\| \[\]/);
  assert.match(effect, /setCustomers\(mine \? \[mine\] : \(held \? \[held\] : \[\]\)\);/);
});

t('persistCustomers updates the ref before awaiting, not after', () => {
  const fn = app.slice(app.indexOf('const persistCustomers = useCallback'), app.indexOf('const jobsWriteInFlightRef'));
  const refWrite = fn.indexOf('customersRef.current = next;');
  const firstAwait = fn.indexOf('await ');
  assert.ok(refWrite > -1, 'the ref must be set optimistically');
  assert.ok(refWrite < firstAwait, 'a ref set only after the await is no use as a fallback DURING the await');
});

t('the sign-out guard is still the thing being protected', () => {
  // If this moves or changes shape, the guards above may no longer be
  // guarding anything, so it is pinned here deliberately.
  assert.match(app, /if \(!customer && loaded && !customersLoading\) \{\s*setSession\(null\);/);
});

t('registration adopts an existing job rather than opening a second account', () => {
  const onRegister = app.slice(app.indexOf('onRegister={async (cust) => {'), app.indexOf('onAdminLogin={'));
  assert.match(onRegister, /findIdForOwner\('phone', cust\.phone, null\)/);
  assert.match(onRegister, /resolveRegistration\(cust, existingJob/);
  assert.match(onRegister, /if \(plan\.jobToCreate\) persistJobs/, 'an adopted job must not get a blank twin');
});

console.log(n + ' assertions passed\n');
