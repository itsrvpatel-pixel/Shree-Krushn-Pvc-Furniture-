// Choosing between two material options is the one place in this app
// where a wrong copy changes what a customer is billed. Both the
// customer and the owner can now make that choice, so the same function
// runs on both paths and is tested here directly.
import assert from 'node:assert/strict';
import { finalizeEstimateDraft } from '../src/jobCore.js';

const job = {
  id: 'job_1', customerName: 'Test', items: [], discount: 0,
  materialCompany: '', sheetWeightKg: '',
  payments: [{ id: 'p1', amount: 5000 }],
  activity: [{ id: 'a0', text: 'Job created', date: '2026-01-01T00:00:00Z' }],
  estimateDrafts: [
    { id: 'd1', label: 'Kaka 7kg laminate', materialCompany: 'Kaka', sheetWeightKg: '7',
      items: [{ id: 'i1', desc: 'Wardrobe', length: '6', height: '7', rate: '1000' }] },
    { id: 'd2', label: 'Without laminate', materialCompany: 'Kaka', sheetWeightKg: '5',
      items: [{ id: 'i2', desc: 'Wardrobe', length: '6', height: '7', rate: '600' }] },
  ],
};

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); }
};

check('the chosen option becomes the estimate', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[1], 'customer');
  assert.deepEqual(out.items, job.estimateDrafts[1].items);
  assert.equal(out.materialCompany, 'Kaka');
  assert.equal(out.sheetWeightKg, '5');
});

check('the options are cleared once one is chosen', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.deepEqual(out.estimateDrafts, []);
});

check('the other option does not leak in', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].rate, '1000', 'took the rate from the wrong option');
});

check('nothing else on the job is touched', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.deepEqual(out.payments, job.payments, 'payments changed');
  assert.equal(out.id, job.id);
  assert.equal(out.customerName, job.customerName);
});

check('the original job object is not mutated', () => {
  finalizeEstimateDraft(job, job.estimateDrafts[0], 'admin', 'Ravi');
  assert.deepEqual(job.items, [], 'the job passed in was modified');
  assert.equal(job.estimateDrafts.length, 2);
});

check('who chose is recorded, for each of the two paths', () => {
  const c = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.equal(c.estimateChoice.by, 'customer');
  assert.equal(c.estimateChoice.label, 'Kaka 7kg laminate');
  assert.ok(!isNaN(new Date(c.estimateChoice.at)), 'no usable timestamp');

  const a = finalizeEstimateDraft(job, job.estimateDrafts[1], 'admin', 'Ravi');
  assert.equal(a.estimateChoice.by, 'admin');
  assert.equal(a.estimateChoice.byName, 'Ravi');
  assert.equal(a.estimateChoice.label, 'Without laminate');
});

check('the activity log names the right person', () => {
  const c = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.match(c.activity[0].text, /^Customer ne "Kaka 7kg laminate"/);
  const a = finalizeEstimateDraft(job, job.estimateDrafts[0], 'admin', 'Ravi');
  assert.match(a.activity[0].text, /^Ravi ne "Kaka 7kg laminate"/);
  const n = finalizeEstimateDraft(job, job.estimateDrafts[0], 'admin');
  assert.match(n.activity[0].text, /^Admin ne /, 'no name should fall back to Admin');
});

check('the earlier history is kept, newest first', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.equal(out.activity.length, 2);
  assert.equal(out.activity[1].text, 'Job created');
});

check('an estimate that already exists is replaced, with payments intact', () => {
  // The options panel used to be hidden once an estimate existed, so
  // this path never ran. It runs now - the customer rings back to ask
  // what a cheaper sheet would cost - and it must not disturb money
  // already taken.
  const priced = {
    ...job,
    items: [{ id: 'old', desc: 'Wardrobe', length: '6', height: '7', rate: '1200' }],
    estimateStatus: 'approved',
    payments: [{ id: 'p1', amount: 5000 }, { id: 'p2', amount: 7000 }],
  };
  const out = finalizeEstimateDraft(priced, priced.estimateDrafts[1], 'admin', 'Ravi');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].rate, '600', 'the old estimate was not replaced');
  assert.equal(out.items[0].id, 'i2');
  assert.deepEqual(out.payments, priced.payments, 'payments were disturbed');
  assert.equal(out.estimateChoice.by, 'admin');
});

console.log(failed === 0 ? '\nall passed' : '\n' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
