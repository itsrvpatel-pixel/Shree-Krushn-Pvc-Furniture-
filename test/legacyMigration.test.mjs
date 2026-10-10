// A red "Customers purane data se load nahi ho paye - admin ko
// batayein" on every single app open.
//
// It was not about data. Startup runs a one-time migration that copies
// the pre-split app_data/jobs and app_data/customers documents into
// per-record documents. It reads both of those documents and then
// LISTS both collections - and under the per-customer rules a customer
// may do none of those four things. The first read throws, the catch
// returns reason 'error', and the caller shouts about it.
//
// So every customer, on every open, was told the owner's data had
// failed to load, for a migration that is not theirs to run and that
// finished long ago. The read of the shared notifications document
// immediately above it already had exactly this guard; the migration
// was missed.
//
// The same message had a second source: the app gives sign-in 12
// seconds and then starts anyway, so on a slow phone it reached the
// migration signed out, where every read is denied for a completely
// different reason. Reporting that as a data problem sends the owner
// hunting for the wrong thing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const code = app.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('legacyMigration');

// The block that decides whether the migration runs at all.
const guard = (() => {
  // From where the gate is decided, not from where it is used - the
  // claim is read on the line above `const migrations`.
  const i = code.indexOf('const claim = await window.appAuth.roleClaim()');
  assert.ok(i > 0, 'the startup migration has moved');
  return code.slice(i, code.indexOf('migrations.forEach', i));
})();

t('the migration runs only for a token that really carries a role', () => {
  // The first version of this gate asked the stored session and
  // whether sign-in had completed. Both were the wrong question.
  // localStorage goes on saying "admin" across a refresh whether or
  // not the Firebase session behind it came back, and ensureSignedIn()
  // is satisfied by an ANONYMOUS user - so on a refresh where the
  // staff session had not been restored, the migration ran, every
  // read in it was correctly denied, and a red "could not load the
  // old data" banner appeared about a migration finished long ago.
  assert.ok(/await window\.appAuth\.roleClaim\(\)/.test(guard),
    'the gate no longer asks the live token what role it carries');
  assert.ok(/const migrations = !claim/.test(guard),
    'the migration runs without a role claim');
  // Specifically NOT the remembered session, which is what was wrong.
  assert.ok(!/storedSession/.test(guard),
    'the gate trusts localStorage again, which survives a lost Firebase session');
});

t('the app still waits for sign-in, and still gives up on a dead network', () => {
  assert.ok(/await Promise\.race\(\[/.test(code), 'nothing waits for a session before reading');
  assert.ok(/setTimeout\(\(\) => resolve\(false\), 12000\)/.test(code),
    'the startup timeout was removed; the app will hang on a dead network');
});

t('being refused is not reported as a fault', () => {
  // Belt and braces for the same banner. Even if something slips
  // past the gate, a permission-denied read means the rules worked -
  // there is nothing for anyone who sees the message to do about it.
  const stores = readFileSync(new URL('../src/jobsStore.js', import.meta.url), 'utf8');
  assert.ok(/permission-denied/.test(stores), 'a denied read is indistinguishable from a real failure');
  assert.ok(/reason: 'not-allowed'/.test(stores), 'there is no reason code for being refused');
  const reported = /m\.reason === 'error' \|\| m\.reason === 'legacy-unreadable'/.test(code);
  assert.ok(reported, 'the real failure cases are no longer reported at all');
  assert.ok(!/not-allowed'\)/.test(code.slice(code.indexOf('migrations.forEach'), code.indexOf('migrations.forEach') + 600)),
    'being refused now raises the red banner again');
});

t('the message still fires for a real failure', () => {
  // The guard must not have been "fixed" by deleting the warning. A
  // migration that genuinely fails for staff leaves the app looking
  // empty, which is indistinguishable from the data being gone.
  assert.ok(/could not be loaded from the old data - tell the admin/.test(code),
    'the warning was removed instead of being made accurate');
  assert.ok(/m\.reason === 'error' \|\| m\.reason === 'legacy-unreadable'/.test(code),
    'the failure reasons are no longer checked');
});

t('the rules really do deny a customer those reads', () => {
  // The reason for all of the above. If this ever changes, the guard
  // becomes unnecessary rather than wrong - but it should be a
  // decision, not a surprise.
  const r = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const appData = r.slice(r.indexOf('match /app_data/'), r.indexOf('match /jobs/'));
  assert.ok(/allow list:  if isStaff\(\);/.test(appData), 'app_data list is no longer staff-only');
  const customers = r.slice(r.indexOf('match /customers/'), r.indexOf('match /error_reports/'));
  assert.ok(/allow list:  if isStaff\(\);/.test(customers), 'the customers collection is no longer staff-only to list');
});

console.log(n + ' assertions passed');
