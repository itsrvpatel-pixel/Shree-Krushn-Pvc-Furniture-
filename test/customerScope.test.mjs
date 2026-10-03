// A customer must not be handed every other customer's job.
//
// The app listened to the whole jobs collection for every session,
// customers included. That pulled 220KB onto each customer's device
// carrying 32 phone numbers, 16 addresses and 5 payment histories, and
// the read count per app open grew with the business - 64 today, over
// 230 at 200 customers, past what the free tier allows.
//
// Source assertions, because these paths talk to Firestore and cannot
// be exercised here. Each names one way the leak comes back.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const store = fs.readFileSync(new URL('../src/jobsStore.js', import.meta.url), 'utf8');

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('customer job scope');

check('the store can watch a single job document', () => {
  assert.ok(/function subscribeOne\(/.test(store), 'subscribeOne is gone');
  assert.ok(/subscribeOne/.test(store.slice(store.indexOf('return { loadAll'))), 'subscribeOne is not exported');
});

check('the store can find a job by its owner, not just by convention', () => {
  // One live customer's job predates the job_<customerId> convention.
  assert.ok(/function findIdForOwner\(/.test(store));
  assert.ok(/where\(/.test(store), 'no query fallback for the odd ids');
});

check('a customer session subscribes to one document, not the collection', () => {
  const eff = app.slice(app.indexOf('// Jobs are one document each'), app.indexOf('// Payment-due alerts'));
  assert.ok(/role === 'customer'/.test(eff), 'the jobs listener does not branch on the role');
  assert.ok(/subscribeOne\(/.test(eff), 'the customer branch does not use subscribeOne');
  const customerBranch = eff.slice(eff.indexOf("role === 'customer'"), eff.indexOf('jobScopeIdsRef.current = null;\n    const unsub'));
  assert.ok(!/jobsStore\.subscribe\(/.test(customerBranch), 'the customer branch still opens the collection listener');
});

check('a scoped session never merges against every job', () => {
  const merge = app.slice(app.indexOf('async function mergeJobsWithFreshServer'), app.indexOf('export function currency'));
  assert.ok(/scopeIds/.test(merge), 'the merge ignores the scope');
  const loadAllAt = merge.indexOf('jobsStore.loadAll()');
  const guardAt = merge.indexOf('scopeIds && scopeIds.length');
  assert.ok(guardAt !== -1 && guardAt < loadAllAt,
    'loadAll must sit behind the scope check - a customer merging against all 32 jobs would make saveDiff rewrite every one');
});

check('a customer session cannot republish the shared testimonial list', () => {
  // It is derived from EVERY job; a customer holds one. Writing that
  // would delete every other customer's featured review.
  const persist = app.slice(app.indexOf('const persistJobs = useCallback'), app.indexOf('const persistPin'));
  const guardAt = persist.indexOf('if (jobScopeIdsRef.current) return true;');
  const deriveAt = persist.indexOf('const nextFeatured = deriveFeaturedReviews(merged)');
  assert.ok(guardAt !== -1, 'nothing stops a scoped session rewriting featured_reviews');
  assert.ok(guardAt < deriveAt, 'the guard must come before the list is derived');
});

console.log(n + ' assertions passed\n');
