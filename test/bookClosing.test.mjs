// "Sab hisab complete ho jaye, fir new se hisab start karne ke liye
//  kya kare."
//
// In Gujarat that question usually means Diwali - new books, clean
// page. The answer is NOT to delete anything. The old expenses carry
// every karigar's record, what each customer actually paid, the
// warranty history, and the only thing next year can be compared
// against. Deleting them to get a clean screen trades all of that for
// a cosmetic zero.
//
// So a closing is a bookmark with a snapshot attached: everything
// before it stays exactly where it is, and the running totals start
// counting again from that date.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  sortedClosings, latestClosing, sinceLastClosing, closingSnapshot,
  canCloseAt, closingFailureMessage, expenseBreakdown,
} from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('bookClosing');

// Built relative to now, not from fixed dates: a closing may not sit
// in the future, so a hard-coded calendar would start failing on a
// date nobody chose.
const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
const rows = [
  { type: 'Material', amount: 12000, date: ago(200) },
  { type: 'Karigar Payment', amount: 8000, date: ago(190) },
  { type: 'Material', amount: 5000, date: ago(20) },
  { type: 'Karigar Payment', amount: 3000, date: ago(10) },
];
const diwali = { id: 'c1', upTo: ago(60), label: 'pichhla period' };

t('closings are read oldest first, whatever order they were saved in', () => {
  const a = { id: 'a', upTo: ago(400) };
  const b = { id: 'b', upTo: ago(60) };
  assert.deepEqual(sortedClosings([b, a]).map((c) => c.id), ['a', 'b']);
  assert.equal(latestClosing([b, a]).id, 'b');
  assert.equal(latestClosing([]), null);
  assert.equal(latestClosing(undefined), null);
  // A record with no date cannot be placed, so it is not a closing.
  assert.deepEqual(sortedClosings([{ id: 'x' }, a]).map((c) => c.id), ['a']);
});

t('the open book is only what came after the last closing', () => {
  const open = sinceLastClosing(rows, [diwali]);
  assert.deepEqual(open.map((e) => e.amount), [5000, 3000]);
  // With no closing yet, the open book is simply everything - the
  // behaviour before any of this existed.
  assert.equal(sinceLastClosing(rows, []).length, 4);
  assert.equal(sinceLastClosing(rows, undefined).length, 4);
});

t('an undated record stays in the open book', () => {
  // new Date(null) is 1970, not an invalid date, so an undated
  // expense silently filed itself into the oldest closed period and
  // disappeared from the live totals. It belongs in the open book:
  // it cannot be shown to belong to a closed one.
  const withBlank = [...rows, { type: 'Other', amount: 999, date: null }, { type: 'Other', amount: 1 }];
  const open = sinceLastClosing(withBlank, [diwali]);
  assert.ok(open.some((e) => e.amount === 999), 'a null-dated expense vanished into a closed period');
  assert.ok(open.some((e) => e.amount === 1), 'an expense with no date field vanished');
});

t('a closing records what the period actually held', () => {
  const snap = closingSnapshot(rows, 50000, diwali.upTo, null);
  assert.equal(snap.expense, 20000, 'November spending leaked into the closed period');
  assert.equal(snap.entries, 2);
  assert.equal(snap.karigar, 8000);
  assert.equal(snap.material, 12000);
  assert.equal(snap.collected, 50000);
  assert.equal(snap.profit, 30000);
});

t('a second closing covers only its own period', () => {
  const second = closingSnapshot(rows, 20000, ago(1), diwali.upTo);
  assert.equal(second.expense, 8000, 'the second period swallowed the first one again');
  assert.equal(second.entries, 2);
  // Undated records are never counted into a closed period.
  assert.equal(closingSnapshot([{ amount: 500 }], 0, ago(1), null).expense, 0);
});

t('the snapshot is stored, not recomputed', () => {
  // Taken at the moment of closing so that editing an old expense
  // afterwards cannot quietly change what last year is said to have
  // been. Proven by the shape: the function returns plain numbers.
  const snap = closingSnapshot(rows, 50000, diwali.upTo, null);
  for (const k of ['expense', 'karigar', 'material', 'collected', 'profit', 'entries']) {
    assert.equal(typeof snap[k], 'number', k + ' is not a stored number');
  }
});

t('periods cannot overlap or sit in the future', () => {
  assert.equal(canCloseAt(ago(1), [diwali]).ok, true);
  assert.equal(canCloseAt(ago(100), [diwali]).reason, 'before-last-closing');
  assert.equal(canCloseAt(diwali.upTo, [diwali]).reason, 'before-last-closing',
    'closing twice on the same instant makes an empty period and shifts every later total');
  assert.equal(canCloseAt('2099-01-01', []).reason, 'date-future');
  assert.equal(canCloseAt('rubbish', []).reason, 'date-invalid');
  assert.equal(canCloseAt(null, []).reason, 'date-invalid');
  assert.equal(canCloseAt(new Date(Date.now() - 1000).toISOString(), []).ok, true);
});

t('every refusal says why in words', () => {
  for (const r of ['date-invalid', 'date-future', 'before-last-closing']) {
    const msg = closingFailureMessage(r);
    assert.ok(msg && msg.length > 10 && msg !== r, 'no readable message for: ' + r);
  }
  assert.ok(closingFailureMessage('something-new'), 'an unknown reason has no fallback message');
});

t('closing does not change what the records say', () => {
  // The whole point. Totals over the full history are identical
  // before and after a closing exists.
  const before = expenseBreakdown(rows, {});
  const after = expenseBreakdown(rows, {});
  assert.deepEqual(before, after);
  assert.equal(before.total, 28000);
});

const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const code = admin.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

t('closing deletes nothing', () => {
  const fn = code.slice(code.indexOf('const closeBooks ='), code.indexOf('if (showClosings)'));
  assert.ok(/setBookClosings\(\[/.test(fn), 'closing does not record a closing');
  assert.ok(!/setExpenses\(/.test(fn), 'closing touches the expense records themselves');
  assert.ok(/window\.confirm/.test(fn), 'the books close with no confirmation at all');
  assert.ok(/Kuch delete nahi hoga/.test(fn), 'the confirmation does not say the records are kept');
});

t('the screen can show the open book, and the old ones', () => {
  assert.ok(/costScope === 'book'/.test(code), 'there is no "since the last closing" view');
  assert.ok(/sinceLastClosing\(visibleExpenses, bookClosings\)/.test(code), 'the open book is never computed');
  assert.ok(/Purane hisab/.test(code), 'closed periods cannot be looked at');
  // The per-kind drill-down has to follow the same scope or its names
  // will not add up to the figure above them.
  const people = code.slice(code.indexOf('const people = open'), code.indexOf('const people = open') + 400);
  assert.ok(/costScope === 'book' \? openBookExpenses/.test(people),
    'the people list ignores the closing and will not match the row total');
});

t('the closings survive a restart and reach the screen', () => {
  assert.ok(/safeGet\('book_closings'\)/.test(app), 'closings are never loaded');
  assert.ok(/'book_closings', list/.test(app), 'closings are never saved');
  assert.ok(/bookClosings=\{bookClosings\}/.test(app), 'closings never reach the admin app');
});

console.log(n + ' assertions passed');
