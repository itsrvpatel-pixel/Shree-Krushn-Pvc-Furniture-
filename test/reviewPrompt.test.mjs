// Two different things live on the review rows, and they are offered
// on two different schedules.
//
//   Reading other customers' reviews  - from day one, always.
//   Writing your own                  - only once the work is delivered.
//
// The owner's rule, in his words: "Leave reviews kam complete hone ke
// bad dikhe aisa karo pehle nahi, pehle sirf customer review dikhe."
// Asking somebody to rate furniture they have not received yet gets
// you a rating of the waiting. These pin both halves of that, and pin
// the wording to one function so Home and More cannot drift apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewPrompt, canLeaveReview } from '../src/jobCore.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('reviewPrompt');

t('before the work is delivered, writing one is not offered at all', () => {
  for (const status of ['appointment', 'estimate', 'in_progress']) {
    assert.equal(canLeaveReview({ status }), false, status + ' should not offer it');
  }
});

t('once delivered or paid, it is offered', () => {
  for (const status of ['delivered', 'paid']) {
    assert.equal(canLeaveReview({ status }), true, status + ' should offer it');
  }
});

t('a review already left keeps the row, whatever the status', () => {
  // Older records exist with a review on file against a job that was
  // never marked delivered. Those customers must still be able to go
  // back and change what they wrote.
  for (const status of ['in_progress', 'delivered', 'paid']) {
    assert.equal(canLeaveReview({ status, review: { rating: 5 } }), true);
  }
});

t('a missing job never throws and never offers', () => {
  for (const job of [null, undefined, {}]) {
    assert.equal(canLeaveReview(job), false);
  }
});

t('the wording asks for the review, never promises a later one', () => {
  // It is only ever rendered where canLeaveReview is already true, so
  // there is no "come back after delivery" case left to say.
  const fresh = reviewPrompt({ status: 'delivered' });
  assert.equal(fresh.title, 'Review Dein');
  assert.equal(fresh.sub, 'Aapka anubhav kaisa raha?');

  const again = reviewPrompt({ status: 'delivered', review: { rating: 5 } });
  assert.equal(again.title, 'Aapka Review');
  assert.equal(again.sub, 'Badalna ho to yahan se');

  for (const job of [null, undefined, {}]) {
    const p = reviewPrompt(job);
    assert.ok(p.title && p.sub);
  }
});

t('every string it returns is translated', () => {
  const dict = readFileSync(new URL('../src/translations.js', import.meta.url), 'utf8');
  const all = [reviewPrompt({ status: 'delivered' }), reviewPrompt({ review: { rating: 5 } })];
  for (const p of all) {
    for (const str of [p.title, p.sub]) {
      assert.ok(dict.includes("'" + str + "':"), 'no English for: ' + str);
    }
  }
});

t('both places call the helper - neither writes the wording itself', () => {
  const more = app.slice(app.indexOf('export function MoreScreen('), app.indexOf('function MoreRow('));
  const home = app.slice(app.indexOf('export function CustomerHome('), app.indexOf('export function ProgressRing('));
  assert.ok(/reviewPrompt\(job\)/.test(more), 'the More tab does not use the helper');
  assert.ok(/reviewPrompt\(job\)/.test(home), 'Home does not use the helper');
  assert.ok(!/job\.review \? t\('Aapka Review'\)/.test(app), 'the wording is inlined again somewhere');
});

t('both places gate writing a review on the same helper', () => {
  // Gating one screen and not the other is how a customer gets told
  // two different things about the same job.
  const more = app.slice(app.indexOf('export function MoreScreen('), app.indexOf('function MoreRow('));
  const home = app.slice(app.indexOf('export function CustomerHome('), app.indexOf('export function ProgressRing('));
  assert.ok(/canLeaveReview\(job\)/.test(more), 'the More tab does not gate the row');
  assert.ok(/canLeaveReview\(job\)/.test(home), 'Home does not gate the row');
});

t('reading other reviews is NOT gated on the job being finished', () => {
  // The whole point of the split. If this ever becomes conditional on
  // delivery, the people it is for - the ones still deciding - are
  // exactly the ones who stop seeing it.
  const home = app.slice(app.indexOf('export function CustomerHome('), app.indexOf('export function ProgressRing('));
  const i = home.indexOf("title={t('Customer Reviews')}");
  assert.ok(i > 0, 'the Customer Reviews row is gone from Home');
  const guard = home.slice(home.lastIndexOf('{', i - 200), i);
  assert.ok(/rv\.count > 0/.test(guard), 'the reviews row is no longer shown by review count');
  assert.ok(!/canLeaveReview/.test(guard), 'reading reviews has been gated on delivery');
});

console.log(n + ' assertions passed\n');
