// What to say to someone who was just in the app.
//
// The whole value of following up a VISIT is that they were looking
// at something a moment ago. A generic nudge throws that away, and
// the wrong stage is worse than nothing - it tells the customer
// nobody here knows where their job is.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visitFollowUp } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('visitFollowUp');

t('each stage gets its own sentence', () => {
  const seen = new Map();
  for (const status of ['appointment', 'estimate', 'in_progress', 'delivered', 'paid']) {
    const r = visitFollowUp({ status }, 'Simi');
    assert.ok(r.text.startsWith('Hello Simi,'), status + ' does not greet them');
    assert.ok(r.text.length > 40, status + ' says almost nothing');
    seen.set(status, r.text);
  }
  // Delivered and paid are the same conversation; the other three are not.
  assert.equal(seen.get('delivered'), seen.get('paid'));
  const distinct = new Set(seen.values());
  assert.equal(distinct.size, 4, 'two different stages are being sent the same message');
});

t('the link matches what the message is about', () => {
  // A message about photos that links to the estimate screen is the
  // kind of small wrongness that makes an app feel untended.
  assert.equal(visitFollowUp({ status: 'in_progress' }).intent, 'work');
  assert.equal(visitFollowUp({ status: 'delivered' }).intent, 'work');
  assert.equal(visitFollowUp({ status: 'estimate' }).intent, 'estimate');
  assert.equal(visitFollowUp({ status: 'appointment' }).intent, 'book',
    'an invitation to book shows the "visit confirmed" card');
});

t('an estimate already sent changes the ask', () => {
  // Still "appointment" on paper, but they have seen numbers - asking
  // them to book a visit they have already had reads as nobody
  // looking at the file.
  const withItems = visitFollowUp({ status: 'appointment', items: [{ name: 'Wardrobe' }] }, 'A');
  assert.equal(withItems.intent, 'estimate');
  assert.ok(/about the rate explained/.test(withItems.text));
  // The same, whichever shape the estimate is stored in.
  const nested = visitFollowUp({ status: 'appointment', estimate: { items: [{ name: 'X' }] } }, 'A');
  assert.equal(nested.intent, 'estimate');
  assert.deepEqual(nested, withItems);
});

t('no job, no name, no crash', () => {
  for (const job of [null, undefined, {}, { status: 'something-new' }]) {
    const r = visitFollowUp(job, undefined);
    assert.ok(r.text && r.intent, String(job));
    assert.ok(!/undefined/.test(r.text), 'the message says "undefined" to the customer');
  }
});

t('the button is wired into the visits screen', () => {
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  const i = admin.indexOf("showList === 'appVisits'");
  const screen = admin.slice(i, admin.indexOf("showList === 'staleJobs'", i));
  assert.ok(/visitFollowUp\(/.test(screen), 'the visits screen has no follow-up message');
  assert.ok(/waSignOff\(fu\.intent\)/.test(screen),
    'the sign-off link no longer follows the message - a photos message would link to the estimate');
});

console.log(n + ' assertions passed\n');
