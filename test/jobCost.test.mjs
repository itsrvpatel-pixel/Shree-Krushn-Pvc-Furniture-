import assert from 'node:assert/strict';
import { jobCostBreakdown } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('jobCost');

const expenses = [
  { id: '1', jobId: 'job_a', type: 'Karigar Payment', payee: 'Suresh', amount: 12000 },
  { id: '2', jobId: 'job_a', type: 'Karigar Payment', payee: 'suresh ', amount: 8000 },
  { id: '3', jobId: 'job_a', type: 'Karigar Payment', payee: 'Ramesh', amount: 25000 },
  { id: '4', jobId: 'job_a', type: 'Material', payee: 'Shakti Traders', amount: 45000 },
  { id: '5', jobId: 'job_b', type: 'Karigar Payment', payee: 'Suresh', amount: 9999 },
  { id: '6', jobId: null, type: 'Transport', payee: 'Tempo', amount: 1500 },
];

t('only this job\'s money is counted', () => {
  const b = jobCostBreakdown(expenses, 'job_a');
  assert.equal(b.entries, 4);
  assert.equal(b.total, 90000);
  // job_b's 9,999 and the unlinked 1,500 are somebody else's problem.
  assert.ok(!b.byPayee.some((p) => p.total === 9999));
});

t('a karigar typed three ways is still one karigar', () => {
  const b = jobCostBreakdown(expenses, 'job_a');
  const suresh = b.byPayee.find((p) => p.name.toLowerCase().trim() === 'suresh');
  assert.equal(suresh.total, 20000, 'Suresh and "suresh " are the same man');
  assert.equal(suresh.count, 2);
  assert.equal(b.byPayee.length, 3, 'Suresh, Ramesh, Shakti Traders');
});

t('the biggest payee is first, because that is what gets read', () => {
  const b = jobCostBreakdown(expenses, 'job_a');
  assert.deepEqual(b.byPayee.map((p) => p.total), [45000, 25000, 20000]);
  assert.deepEqual(b.byType.map((x) => x.amount), [45000, 45000]);
});

t('karigar money is separable from everything else', () => {
  const b = jobCostBreakdown(expenses, 'job_a');
  assert.equal(b.karigar, 45000, '12000 + 8000 + 25000');
  assert.equal(b.total - b.karigar, 45000, 'the rest is material');
});

t('material and transport count too - a cost that ignored them would mislead', () => {
  const b = jobCostBreakdown(expenses, 'job_a');
  assert.ok(b.byType.some((x) => x.type === 'Material'));
});

t('a job with nothing spent on it reads as zero, not as broken', () => {
  const b = jobCostBreakdown(expenses, 'job_zzz');
  assert.deepEqual(b, { total: 0, entries: 0, byPayee: [], byType: [], karigar: 0 });
  assert.deepEqual(jobCostBreakdown(null, 'job_a').byPayee, []);
  assert.deepEqual(jobCostBreakdown(undefined, undefined).byPayee, []);
});

t('junk entries never throw and never invent money', () => {
  const messy = [
    { jobId: 'job_a', amount: 'abc', payee: 'X' },
    { jobId: 'job_a', amount: null, payee: null },
    null,
    { jobId: 'job_a', amount: 500 },
  ];
  const b = jobCostBreakdown(messy, 'job_a');
  assert.equal(b.total, 500);
  assert.ok(b.byPayee.some((p) => p.name === '(naam nahi)'));
});

console.log(n + ' assertions passed\n');
