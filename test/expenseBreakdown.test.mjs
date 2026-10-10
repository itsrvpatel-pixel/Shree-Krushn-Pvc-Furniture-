// "Expenses mein details ke saath bataye kya kya expense hua, aur
//  karigar aur material kitna kitna hua."
//
// The screen could say who had been paid and how much in total, and
// one stat card read "Karigar Paid". How much of a month went on
// material, or on transport, could not be read at all without adding
// the list up by hand. And a job screen said nothing about its own
// cost - that breakdown existed, but only on the customer profile,
// two screens from where the work is actually looked at.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPENSE_TYPES, expenseBreakdown, monthKeyOf } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('expenseBreakdown');

const rows = [
  { type: 'Karigar Payment', payee: 'Suresh', amount: 5000, date: '2026-10-02', jobId: 'j1' },
  { type: 'Karigar Payment', payee: ' suresh ', amount: 2000, date: '2026-10-04', jobId: 'j1' },
  { type: 'Material', payee: 'Hexa', amount: 12000, date: '2026-10-05', jobId: 'j1' },
  { type: 'Material', payee: 'Crystal', amount: 3000, date: '2026-09-28', jobId: 'j1' },
  { type: 'Transport', payee: 'Tempo', amount: 800, date: '2026-10-06', jobId: null },
];

t('every kind is listed, in the same order, every time', () => {
  const b = expenseBreakdown(rows, {});
  assert.deepEqual(b.byType.map((r) => r.type), EXPENSE_TYPES);
  // Including the ones at zero. A row that appears and disappears
  // makes two months impossible to compare, and "nothing on transport
  // this month" is an answer.
  const empty = expenseBreakdown([], {});
  assert.deepEqual(empty.byType.map((r) => r.type), EXPENSE_TYPES);
  assert.deepEqual(empty.byType.map((r) => r.amount), [0, 0, 0, 0]);
  assert.equal(empty.total, 0);
});

t('karigar and material are counted separately and correctly', () => {
  const b = expenseBreakdown(rows, {});
  assert.equal(b.karigar, 7000);
  assert.equal(b.material, 15000);
  assert.equal(b.total, 22800);
  assert.equal(b.entries, 5);
  const byType = Object.fromEntries(b.byType.map((r) => [r.type, r]));
  assert.equal(byType['Karigar Payment'].count, 2);
  assert.equal(byType.Transport.amount, 800);
  assert.equal(byType.Other.amount, 0);
});

t('the shares describe the total they are shown against', () => {
  const b = expenseBreakdown(rows, {});
  const byType = Object.fromEntries(b.byType.map((r) => [r.type, r]));
  assert.equal(byType.Material.share, Math.round((15000 / 22800) * 100));
  // Never a division by zero on an empty month.
  assert.deepEqual(expenseBreakdown([], {}).byType.map((r) => r.share), [0, 0, 0, 0]);
});

t('an unknown or missing type is still money out', () => {
  // A record saved before a type existed, or under one since renamed,
  // must not vanish from a total that is supposed to add up.
  const odd = [{ type: 'Purana type', amount: 200, date: '2026-10-06' }, { amount: 50, date: '2026-10-06' }];
  const b = expenseBreakdown(odd, {});
  assert.equal(b.total, 250);
  const other = b.byType.find((r) => r.type === 'Other');
  assert.equal(other.amount, 250);
  assert.equal(other.count, 2);
});

t('one job can be read on its own', () => {
  const b = expenseBreakdown(rows, { jobId: 'j1' });
  assert.equal(b.total, 22000, 'the unlinked transport expense leaked into a job');
  assert.equal(b.karigar, 7000);
  assert.equal(b.material, 15000);
  // And the general expenses, which belong to no job.
  assert.equal(expenseBreakdown(rows, { jobId: null }).total, 800);
});

t('a month is the local month, not a UTC one', () => {
  // toISOString would push anything logged before 5:30am in India into
  // the previous month.
  assert.equal(monthKeyOf(new Date(2026, 9, 1, 2, 0, 0)), '2026-10');
  assert.equal(monthKeyOf(new Date(2026, 0, 31, 23, 30, 0)), '2026-01');
  assert.equal(monthKeyOf('not a date'), '');
  const oct = expenseBreakdown(rows, { monthKey: '2026-10' });
  assert.equal(oct.total, 19800, 'September material was counted into October');
  assert.equal(expenseBreakdown(rows, { monthKey: '2026-09' }).material, 3000);
});

t('the same person typed three ways is one person', () => {
  const b = expenseBreakdown(rows, { jobId: 'j1' });
  const suresh = b.byPayee.filter((p) => p.name.toLowerCase().trim() === 'suresh');
  assert.equal(suresh.length, 1, '"Suresh" and " suresh " were counted as two people');
  assert.equal(suresh[0].total, 7000);
  // Biggest first: on a phone the top rows are what gets read.
  assert.deepEqual(b.byPayee.map((p) => p.total), [...b.byPayee.map((p) => p.total)].sort((a, c) => c - a));
});

t('nothing crashes on rubbish input', () => {
  for (const bad of [null, undefined, 'nope', [null, undefined]]) {
    const b = expenseBreakdown(bad, {});
    assert.equal(b.total, 0);
    assert.equal(b.byType.length, EXPENSE_TYPES.length);
  }
  assert.equal(expenseBreakdown([{ amount: 'abc', date: '2026-10-01' }], {}).total, 0);
});

const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const code = admin.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

t('there is one list of expense types, not two', () => {
  assert.ok(!/const EXPENSE_TYPES = \[/.test(code),
    'AdminApp keeps its own copy, which can drift from the one every breakdown is computed against');
  assert.ok(/EXPENSE_TYPES,/.test(code), 'it no longer imports the shared list');
});

t('the expenses screen shows the split, and can scope it to a month', () => {
  assert.ok(/Kis cheez par kitna/.test(code), 'there is still no type-wise breakdown');
  assert.ok(/costScope/.test(code), 'the month/all-time toggle is missing');
  assert.ok(/monthKeyOf\(new Date\(\)\)/.test(code), 'the month scope is not the current month');
});

t('a job shows its own cost where the work is', () => {
  const detail = code.slice(code.indexOf('function AdminJobDetail('));
  assert.ok(/expenseBreakdown\(expenses \|\| \[\], \{ jobId: job\.id \}\)/.test(detail),
    'the job screen still cannot say what the job cost');
  assert.ok(/expenses/.test(code.slice(code.indexOf('<AdminJobDetail'), code.indexOf('<AdminJobDetail') + 400)),
    'expenses are never passed to the job screen');
  // Against money in hand, not the estimate - an unpaid job is not a
  // profitable one.
  assert.ok(/jobPaid\(job\)/.test(detail), 'the job compares cost against the estimate rather than what was collected');
});

console.log(n + ' assertions passed');
