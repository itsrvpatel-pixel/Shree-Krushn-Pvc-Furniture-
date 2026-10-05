import assert from 'node:assert/strict';
import { DEFAULT_PAYMENT_STAGES, paymentStagesOf, buildPaymentSchedule, nextDueStage, paymentProgress } from '../src/jobCore.js';

const sum = (s) => s.reduce((a, b) => a + b.amount, 0);

// The column must tie out to the bill, exactly, or a customer who adds
// up three numbers gets a different answer than the one on the screen.
// 1,21,875 is the figure from Ravi's own mockup; the others are real
// estimate totals from the business.
for (const total of [121875, 272500, 50750, 631655, 1, 3, 99999]) {
  const s = buildPaymentSchedule(total, 0);
  assert.equal(sum(s), total, 'stages must sum to ' + total + ', got ' + sum(s));
}

// Default split, and the last stage carrying the rounding remainder.
{
  const s = buildPaymentSchedule(121875, 0);
  assert.deepEqual(s.map((x) => x.amount), [60938, 48750, 12187]);
  assert.deepEqual(s.map((x) => x.status), ['due', 'due', 'due']);
}

// Money settles the stages in order, like a ledger.
{
  const s = buildPaymentSchedule(100000, 50000); // exactly the advance
  assert.deepEqual(s.map((x) => x.status), ['paid', 'due', 'due']);
  assert.equal(s[0].remaining, 0);
  assert.equal(s[1].remaining, 40000);
}

// A part payment is its own state - not "paid", and not "nothing yet".
{
  const s = buildPaymentSchedule(100000, 20000);
  assert.equal(s[0].status, 'part');
  assert.equal(s[0].paidAmount, 20000);
  assert.equal(s[0].remaining, 30000);
  assert.equal(s[1].status, 'due');
}

// Paying past a stage spills into the next one, and never past the end.
{
  const s = buildPaymentSchedule(100000, 95000);
  assert.deepEqual(s.map((x) => x.status), ['paid', 'paid', 'part']);
  assert.equal(s[2].paidAmount, 5000);
}
{
  const s = buildPaymentSchedule(100000, 250000); // overpaid, somehow
  assert.deepEqual(s.map((x) => x.status), ['paid', 'paid', 'paid']);
  assert.equal(sum(s), 100000, 'an overpayment never inflates the bill');
}

// Nothing quoted yet means no schedule at all - an empty table of
// zeroes would just be noise on the screen.
{
  assert.deepEqual(buildPaymentSchedule(0, 0), []);
  assert.deepEqual(buildPaymentSchedule(null, null), []);
}

// nextDueStage answers "what do I owe next", which is what the screen
// leads with.
{
  const s = buildPaymentSchedule(100000, 50000);
  assert.equal(nextDueStage(s).key, 'progress');
  assert.equal(nextDueStage(buildPaymentSchedule(100000, 100000)), null);
  assert.equal(nextDueStage([]), null);
}

// A job's own stages win; anything half-saved falls back rather than
// showing a customer a broken plan.
{
  const custom = [{ key: 'a', label: 'On order', percent: 30 }, { key: 'b', label: 'On delivery', percent: 70 }];
  assert.equal(paymentStagesOf({ paymentStages: custom }), custom);
  assert.equal(paymentStagesOf({}), DEFAULT_PAYMENT_STAGES);
  assert.equal(paymentStagesOf({ paymentStages: [] }), DEFAULT_PAYMENT_STAGES);
  assert.equal(paymentStagesOf({ paymentStages: 'half' }), DEFAULT_PAYMENT_STAGES);
  assert.equal(paymentStagesOf({ paymentStages: [{ label: 'x' }] }), DEFAULT_PAYMENT_STAGES, 'no percent is not a stage');
  assert.equal(paymentStagesOf(null), DEFAULT_PAYMENT_STAGES);
}

// Custom percentages still tie out to the total.
{
  const s = buildPaymentSchedule(121875, 0, [{ key: 'a', label: 'On order', percent: 30 }, { key: 'b', label: 'On delivery', percent: 70 }]);
  assert.equal(s.length, 2);
  assert.equal(sum(s), 121875);
  assert.equal(s[0].amount, 36563);
}

// The default adds up to a whole bill, not 90% or 110% of one.
{
  assert.equal(DEFAULT_PAYMENT_STAGES.reduce((a, b) => a + b.percent, 0), 100);
}


/* --- One model, not two ------------------------------------------- */
const ORDER = ['appointment', 'estimate', 'in_progress', 'delivered', 'paid'];
const readFile = (await import('node:fs')).readFileSync;
const admin = readFile(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');

// The second 50/40/10 model is gone and must not come back. It had its
// own percentages, its own allocation loop and its own wording, and it
// disagreed with the customer's schedule on every label.
assert.ok(!/PAYMENT_MILESTONES/.test(admin), 'the duplicate milestone list is back in AdminApp');
assert.ok(!/function jobMilestoneStatus/.test(admin), 'the duplicate allocation loop is back in AdminApp');
assert.ok(/paymentProgress\(jobTotal\(job\), jobPaid\(job\), paymentStagesOf\(job\)/.test(admin),
  'admin must read the shared stages, not its own');

// Nothing is owed before the work starts.
{
  const r = paymentProgress(272500, 0, null, 'estimate', ORDER);
  assert.deepEqual(r.map((x) => x.reached), [false, false, false]);
  assert.equal(r.reduce((a, b) => a + b.dueNow, 0), 0, 'nothing is due yet');
  assert.equal(r[0].upcoming, 136250, 'but it is coming');
}

// Work starts: the first stage becomes genuinely due.
{
  const r = paymentProgress(272500, 0, null, 'in_progress', ORDER);
  assert.deepEqual(r.map((x) => x.reached), [true, false, false]);
  assert.equal(r[0].dueNow, 136250);
  assert.equal(r[1].dueNow, 0, 'the later stages are not owed yet');
}

// Delivered, part paid: what is owed NOW is the rest of it.
{
  const r = paymentProgress(272500, 150000, null, 'delivered', ORDER);
  assert.deepEqual(r.map((x) => x.reached), [true, true, true]);
  assert.equal(r[0].dueNow, 0, 'the advance is settled');
  assert.equal(r[1].dueNow + r[2].dueNow, 122500, 'and the rest matches jobDue');
}

// The last stage hangs on 'delivered', never 'paid': a job turns 'paid'
// the moment nothing is outstanding, so a stage waiting for 'paid'
// could never show a nonzero amount.
{
  const final = DEFAULT_PAYMENT_STAGES[DEFAULT_PAYMENT_STAGES.length - 1];
  assert.equal(final.atStatus, 'delivered');
  assert.notEqual(final.atStatus, 'paid');
}

// A custom stage with no atStatus is due as soon as it is in the plan.
{
  const r = paymentProgress(100000, 0, [{ key: 'a', label: 'Half', percent: 50 }, { key: 'b', label: 'Rest', percent: 50 }], 'estimate', ORDER);
  assert.deepEqual(r.map((x) => x.reached), [true, true]);
}

console.log('paymentSchedule: 48 assertions passed');
