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


// "Karigar-wise mahine ka hisaab, aur material supplier-wise."
//
// Both are the same question - who did this kind of money go to -
// so they are the same filter rather than two screens.
t('one kind on its own, by person', () => {
  const karigar = expenseBreakdown(rows, { type: 'Karigar Payment' });
  assert.equal(karigar.total, 7000);
  assert.deepEqual(karigar.byPayee.map((p) => p.name), ['Suresh']);
  assert.equal(karigar.byPayee[0].count, 2, '"Suresh" and " suresh " were split again');

  const material = expenseBreakdown(rows, { type: 'Material' });
  assert.equal(material.total, 15000);
  assert.deepEqual(material.byPayee.map((p) => [p.name, p.total]), [['Hexa', 12000], ['Crystal', 3000]]);
});

t('a kind and a month together', () => {
  // The karigar bill for one month, which is the thing actually asked
  // for - September's material must not appear in October's.
  const oct = expenseBreakdown(rows, { type: 'Material', monthKey: '2026-10' });
  assert.equal(oct.total, 12000);
  assert.deepEqual(oct.byPayee.map((p) => p.name), ['Hexa']);
  assert.equal(expenseBreakdown(rows, { type: 'Material', monthKey: '2026-09' }).byPayee[0].name, 'Crystal');
  assert.equal(expenseBreakdown(rows, { type: 'Karigar Payment', monthKey: '2026-09' }).total, 0);
});

t('an old type is in the Other list, not just the Other total', () => {
  // It counts toward Other above, so it has to be findable under
  // Other too - a total you cannot break down explains nothing.
  const odd = [...rows, { type: 'Purana type', payee: 'Ramu', amount: 100, date: '2026-10-01' }];
  const other = expenseBreakdown(odd, { type: 'Other' });
  assert.equal(other.total, 100);
  assert.deepEqual(other.byPayee.map((p) => p.name), ['Ramu']);
});

t('the type filter and the totals agree', () => {
  // Adding up each kind separately must give the same number as the
  // whole; otherwise the breakdown is lying about something.
  const whole = expenseBreakdown(rows, {});
  const summed = EXPENSE_TYPES
    .map((type) => expenseBreakdown(rows, { type }).total)
    .reduce((a, b) => a + b, 0);
  assert.equal(summed, whole.total);
});

t('the screen opens a kind into its people', () => {
  assert.ok(/openType/.test(code), 'the type rows do not expand');
  assert.ok(/expenseBreakdown\(visibleExpenses, \{\s*type: row\.type/.test(code),
    'the expanded list is not filtered to that kind');
  // And must follow whichever scope the card is showing, or the names
  // would not add up to the figure right above them.
  const block = code.slice(code.indexOf('const people = open'), code.indexOf('const people = open') + 420);
  assert.ok(/costScope === 'month'/.test(block),
    'the people list ignores the month toggle and will not match the row total');
});


/* ---- This month against last, and sending it on ---- */
import { prevMonthKey, monthLabel, compareBreakdowns, expenseReportText } from '../src/jobCore.js';

const months = [
  { type: 'Karigar Payment', payee: 'Suresh', amount: 10000, date: '2026-10-02' },
  { type: 'Material', payee: 'Hexa', amount: 15000, date: '2026-10-05' },
  { type: 'Karigar Payment', payee: 'Ramu', amount: 9000, date: '2026-09-21' },
  { type: 'Material', payee: 'Crystal', amount: 12000, date: '2026-09-20' },
];
const oct = expenseBreakdown(months, { monthKey: '2026-10' });
const sep = expenseBreakdown(months, { monthKey: '2026-09' });

t('the month before is found by string, not by date maths', () => {
  assert.equal(prevMonthKey('2026-10'), '2026-09');
  assert.equal(prevMonthKey('2026-01'), '2025-12', 'January must roll back a year');
  assert.equal(prevMonthKey('2026-13'), '');
  assert.equal(prevMonthKey('rubbish'), '');
  assert.equal(monthLabel('2026-10'), 'October 2026');
  assert.equal(monthLabel('nope'), '');
});

t('each kind is compared with the same kind last month', () => {
  const c = compareBreakdowns(oct, sep);
  const byType = Object.fromEntries(c.byType.map((r) => [r.type, r]));
  assert.equal(byType.Material.was, 12000);
  assert.equal(byType.Material.diff, 3000);
  assert.equal(byType.Material.direction, 'up');
  assert.equal(byType['Karigar Payment'].diff, 1000);
  // A kind with nothing in either month is not "changed".
  assert.equal(byType.Transport.direction, 'same');
  assert.equal(c.total, 25000);
  assert.equal(c.wasTotal, 21000);
  assert.equal(c.direction, 'up');
});

t('spending less reads as less', () => {
  const c = compareBreakdowns(sep, oct);
  assert.equal(c.direction, 'down');
  assert.equal(c.diff, -4000);
});

t('a first month is not compared against nothing', () => {
  // "100% zyada" against a month that does not exist is worse than
  // saying nothing, so the screen has something to check.
  const c = compareBreakdowns(oct, expenseBreakdown([], { monthKey: '2026-09' }));
  assert.equal(c.hasPrevious, false);
  assert.equal(compareBreakdowns(oct, sep).hasPrevious, true);
  assert.equal(compareBreakdowns(oct, null).hasPrevious, false);
});

t('the WhatsApp message says the month, the kinds and the total', () => {
  const text = expenseReportText(oct, { monthKey: '2026-10', comparison: compareBreakdowns(oct, sep) });
  assert.ok(text.includes('October 2026'), 'the month is not named');
  assert.ok(text.includes('Karigar Payment: Rs. 10,000'), 'a kind is missing');
  assert.ok(text.includes('Kul: Rs. 25,000'), 'no total');
  assert.ok(text.includes('Rs. 4,000 zyada'), 'the comparison is missing');
  // A kind with nothing in it is noise in a chat bubble.
  assert.ok(!text.includes('Transport'), 'empty kinds are listed');
  // Plain Rs., not the glyph: it comes out as a box in plenty of chat
  // apps, and this is read on a phone.
  assert.ok(!text.includes('₹'), 'the rupee glyph will not render reliably');
});

t('the message holds up with nothing to report', () => {
  const empty = expenseBreakdown([], { monthKey: '2026-10' });
  const text = expenseReportText(empty, { monthKey: '2026-10', comparison: compareBreakdowns(empty, null) });
  assert.ok(text.includes('Koi kharch nahi likha gaya'), 'an empty month says nothing at all');
  assert.ok(text.includes('Kul: Rs. 0'));
  assert.ok(!text.includes('pichhle mahine'), 'it compares an empty month against nothing');
});

t('collected and left over are included when known', () => {
  const text = expenseReportText(oct, { monthKey: '2026-10', collected: 40000 });
  assert.ok(text.includes('Jama hua: Rs. 40,000'));
  assert.ok(text.includes('Bacha: Rs. 15,000'));
  // And left out entirely when not passed, rather than shown as zero.
  assert.ok(!expenseReportText(oct, { monthKey: '2026-10' }).includes('Jama hua'));
});

t('the screen shows the comparison and can send it', () => {
  assert.ok(/compareBreakdowns\(/.test(code), 'nothing compares the two months');
  assert.ok(/prevMonthKey\(thisMonth\)/.test(code), 'last month is never looked up');
  assert.ok(/costScope !== 'month' \? null/.test(code),
    'all-time is compared against a month, which means nothing');
  assert.ok(/costCompare\.hasPrevious/.test(code), 'a first month is compared against nothing');
  assert.ok(/expenseReportText\(costBreakdown/.test(code), 'there is no way to send the month on');
});

console.log(n + ' assertions passed');
