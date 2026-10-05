// The review row is offered in two places now - Home and the More tab.
// These pin the wording to one function so the two cannot drift, and
// pin the row itself to being ALWAYS present: it used to appear only
// after delivery, which is why customers went looking for it and found
// nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewPrompt } from '../src/jobCore.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('reviewPrompt');

t('before the work is done, it says when it opens rather than inviting one', () => {
  for (const status of ['appointment', 'estimate', 'in_progress']) {
    const p = reviewPrompt({ status });
    assert.equal(p.title, 'Review Dein');
    assert.equal(p.sub, 'Kaam poora hone ke baad yahan se');
  }
});

t('once delivered, it asks for one', () => {
  for (const status of ['delivered', 'paid']) {
    const p = reviewPrompt({ status });
    assert.equal(p.title, 'Review Dein');
    assert.equal(p.sub, 'Aapka anubhav kaisa raha?');
  }
});

t('a review already left wins over the status', () => {
  // Including the odd case of a review on file for a job that is not
  // delivered - older records exist in exactly that state.
  for (const status of ['in_progress', 'delivered', 'paid']) {
    const p = reviewPrompt({ status, review: { rating: 5 } });
    assert.equal(p.title, 'Aapka Review');
    assert.equal(p.sub, 'Badalna ho to yahan se');
  }
});

t('a missing job never throws', () => {
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
  // Title and sub, on each of the two screens. The definition itself
  // lives in jobCore, so every occurrence here is a use.
  const more = app.slice(app.indexOf('export function MoreScreen('), app.indexOf('function MoreRow('));
  const home = app.slice(app.indexOf('export function CustomerHome('), app.indexOf('export function ProgressRing('));
  assert.ok(/reviewPrompt\(job\)/.test(more), 'the More tab does not use the helper');
  assert.ok(/reviewPrompt\(job\)/.test(home), 'Home does not use the helper');
  assert.ok(!/job\.review \? t\('Aapka Review'\)/.test(app), 'the wording is inlined again somewhere');
});

t('the row is not hidden behind the job being delivered', () => {
  // The old gate. If this comes back, customers stop finding it again.
  assert.ok(!/\(job\.status === 'delivered' \|\| job\.status === 'paid'\) && \(\s*<HomeAction icon=\{<Star/.test(app),
    'the review row is conditional on delivery again');
});

console.log(n + ' assertions passed\n');
