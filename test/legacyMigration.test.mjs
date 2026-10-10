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
  const i = code.indexOf('const migrations');
  assert.ok(i > 0, 'the startup migration has moved');
  return code.slice(i, code.indexOf('migrations.forEach', i));
})();

t('a customer never runs the owner-wide migration', () => {
  assert.ok(/role === 'customer'/.test(guard),
    'a customer still runs a migration that reads every job and every customer');
});

t('it does not run signed out either', () => {
  assert.ok(/!signedIn/.test(guard),
    'a slow sign-in still produces a data-loss message about a permissions failure');
  assert.ok(/signedIn = await Promise\.race/.test(code),
    'nothing records whether sign-in actually completed');
  // The race must stay - the app has to start on a bad connection.
  assert.ok(/setTimeout\(\(\) => resolve\(false\), 12000\)/.test(code),
    'the startup timeout was removed; the app will hang on a dead network');
});

t('the message still fires for a real failure', () => {
  // The guard must not have been "fixed" by deleting the warning. A
  // migration that genuinely fails for staff leaves the app looking
  // empty, which is indistinguishable from the data being gone.
  assert.ok(/purane data se load nahi ho paye - admin ko batayein/.test(code),
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
