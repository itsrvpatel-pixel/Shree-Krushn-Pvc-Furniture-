// Two different things live on the review rows, on two schedules.
//
//   Reading other customers' reviews  - from day one, always.
//   Writing your own                  - only once the work is delivered.
//
// His first rule: "Leave reviews kam complete hone ke bad dikhe aisa
// karo pehle nahi, pehle sirf customer review dikhe." Asking somebody
// to rate furniture they have not received yet gets you a rating of
// the waiting.
//
// His second rule, which is why the two screens differ: "More me to
// rakhna he to customer ko pata chale sab review original he ki kam
// khatam hone ke bad hi de sakte he." So More keeps the row visible
// and locked - the lock is the proof - while Home stays quiet.
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

t('the locked wording states the rule, which is the whole point of it', () => {
  // This line is doing the work his message asked for: it is what
  // tells a customer the reviews cannot have come from just anybody.
  for (const status of ['appointment', 'estimate', 'in_progress']) {
    const p = reviewPrompt({ status });
    assert.equal(p.title, 'Review Dein');
    assert.equal(p.sub, 'Kaam poora hone ke baad hi de sakte hain');
  }
});

t('once it is open, it asks for the review instead', () => {
  for (const status of ['delivered', 'paid']) {
    const p = reviewPrompt({ status });
    assert.equal(p.title, 'Review Dein');
    assert.equal(p.sub, 'Aapka anubhav kaisa raha?');
  }

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
  const all = [
    reviewPrompt({ status: 'in_progress' }),
    reviewPrompt({ status: 'delivered' }),
    reviewPrompt({ review: { rating: 5 } }),
  ];
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

t('Home hides the row until it works; More shows it locked', () => {
  const more = app.slice(app.indexOf('export function MoreScreen('), app.indexOf('function MoreRow('));
  const home = app.slice(app.indexOf('export function CustomerHome('), app.indexOf('export function ProgressRing('));
  assert.ok(/\{canLeaveReview\(job\) && \(/.test(home), 'Home no longer hides the row before delivery');
  assert.ok(!/\{canLeaveReview\(job\) && \(/.test(more),
    'the More tab hides the row again - the locked row is what proves the rule to a customer');
  assert.ok(/canLeaveReview\(job\)\s*\n?\s*\?/.test(more), 'the More row no longer shows a lock when it is closed');
  assert.ok(/<Lock /.test(more), 'the padlock is gone from the More row');
});

t('the reviews screen says where the reviews came from', () => {
  // The claim is true by construction - ReviewPanel refuses a review
  // on a job that is not delivered, and the published list is derived
  // from job.review only - so it is safe to state, and worth stating.
  const scr = app.slice(app.indexOf('export function ReviewsScreen('), app.indexOf('function MoreRow('));
  assert.ok(/Har review hamare apne customer ka hai/.test(scr),
    'the note about where the reviews come from is gone');
  assert.ok(/ReviewPanel/.test(app) && /canReview = job\.status === 'delivered' \|\| job\.status === 'paid'/.test(app),
    'ReviewPanel no longer enforces the rule the note claims');
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
