// "Estimate dene ke baad change bheja, par app mein kuch show nahi
// ho raha."
//
// The customer could tap "Request a change", type what they wanted and
// send it. Three separate things then went wrong, and all three ended
// in the same place - nothing happened.
//
//  1. The text landed in estimateResponseNote and was rendered in
//     exactly ONE place: the customer's own screen. The admin app
//     never showed it anywhere. The owner got a notification saying a
//     change had been asked for and had no way to read what it was.
//  2. The notification only fired when estimateStatus CHANGED. By the
//     second request the status was already 'change_requested', so it
//     fired for the first request and silently for every one after.
//  3. One field held one request. A second overwrote the first, and an
//     empty box saved happily and told the customer it had been sent.
//
// And once the owner had changed the estimate, nothing on the
// customer's side said so - the orange "your request was sent" banner
// stayed exactly as it was.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  changeRequests, openChangeRequests, addChangeRequest,
  answerChangeRequests, newChangeRequests,
} from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('changeRequest');

const T0 = Date.parse('2026-10-08T10:00:00.000Z');

t('an empty request is refused, not saved as a blank one', () => {
  assert.equal(addChangeRequest({ id: 'j' }, '', T0), null);
  assert.equal(addChangeRequest({ id: 'j' }, '   \n ', T0), null);
  assert.equal(addChangeRequest({ id: 'j' }, null, T0), null);
});

t('a request is kept with its words and its date', () => {
  const job = addChangeRequest({ id: 'j' }, '  Wardrobe mein ek drawer aur  ', T0);
  const [r] = changeRequests(job);
  assert.equal(r.text, 'Wardrobe mein ek drawer aur');
  assert.equal(r.at, new Date(T0).toISOString());
  assert.equal(r.answeredAt, null);
  assert.equal(job.estimateStatus, 'change_requested');
});

t('a second request does not wipe out the first', () => {
  let job = addChangeRequest({ id: 'j' }, 'Pehla change', T0);
  job = addChangeRequest(job, 'Dusra change', T0 + 60000);
  assert.deepEqual(changeRequests(job).map((r) => r.text), ['Pehla change', 'Dusra change']);
  assert.equal(openChangeRequests(job).length, 2);
});

t('the owner is told about the second request too', () => {
  const first = addChangeRequest({ id: 'j' }, 'Pehla change', T0);
  // This is the exact case that was silent: status unchanged between
  // the two, because it is already 'change_requested'.
  const second = addChangeRequest(first, 'Dusra change', T0 + 60000);
  assert.equal(first.estimateStatus, second.estimateStatus);
  assert.deepEqual(newChangeRequests(second, first).map((r) => r.text), ['Dusra change']);
  assert.deepEqual(newChangeRequests(first, {}).map((r) => r.text), ['Pehla change']);
  // Nothing new means nothing sent - editing other fields must not
  // re-notify.
  assert.deepEqual(newChangeRequests(second, second), []);
});

t('answering closes the requests and gives the customer their buttons back', () => {
  let job = addChangeRequest({ id: 'j' }, 'Rate kam karein', T0);
  job = addChangeRequest(job, 'Aur ek shelf', T0 + 60000);
  const after = answerChangeRequests(job, 'Ravi', T0 + 120000);
  assert.equal(openChangeRequests(after).length, 0);
  assert.equal(changeRequests(after).length, 2, 'the requests themselves must be kept, not deleted');
  for (const r of changeRequests(after)) {
    assert.equal(r.answeredAt, new Date(T0 + 120000).toISOString());
    assert.equal(r.answeredBy, 'Ravi');
  }
  // Cleared, so the customer's Approve / Change / Cancel row comes back.
  assert.equal(after.estimateStatus, null);
});

t('answering a job with nothing open changes nothing', () => {
  const job = { id: 'j', items: [{ id: 'i' }] };
  assert.equal(answerChangeRequests(job, 'Ravi', T0), job);
});

t('a request sent after an answer is open again', () => {
  let job = addChangeRequest({ id: 'j' }, 'Pehla', T0);
  job = answerChangeRequests(job, 'Ravi', T0 + 1000);
  const prev = job;
  job = addChangeRequest(job, 'Phir se', T0 + 2000);
  assert.equal(openChangeRequests(job).length, 1);
  assert.equal(job.estimateStatus, 'change_requested');
  assert.deepEqual(newChangeRequests(job, prev).map((r) => r.text), ['Phir se']);
});

t('a request sent before this fix is still read, not lost', () => {
  const old = {
    id: 'j',
    estimateResponseNote: 'Purana change jo pehle bheja tha',
    estimateStatus: 'change_requested',
    estimateRespondedAt: '2026-09-01T06:00:00.000Z',
  };
  const [r] = openChangeRequests(old);
  assert.equal(r.text, 'Purana change jo pehle bheja tha');
  assert.equal(r.at, '2026-09-01T06:00:00.000Z');
  // And it can be answered like any other.
  assert.equal(openChangeRequests(answerChangeRequests(old, 'Ravi', T0)).length, 0);
  // One whose estimate already moved on is not still shouting for an
  // answer.
  assert.equal(openChangeRequests({ ...old, estimateStatus: 'approved' }).length, 0);
  assert.equal(changeRequests({ id: 'j' }).length, 0);
});

/* ---- and that the screens actually use all of this ---- */

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
// Comments explain the bug all over these files; a test that greps
// them would pass on the explanation alone. It has happened twice.
const code = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');

t('the owner can read what the customer asked for', () => {
  const a = code(admin);
  assert.ok(/openChangeRequests\(job\)/.test(a), 'the admin app never looks at the open requests');
  assert.ok(/Customer ne change maanga hai/.test(a), 'the admin estimate tab does not show them');
  assert.ok(/answerChangeRequests\(/.test(a), 'the owner has no way to mark one answered');
});

t('the customer sees each request, and sees when it is answered', () => {
  const c = code(app);
  assert.ok(/changeRequests\(job\)\.map/.test(c), 'the customer screen still shows one overwritten note');
  assert.ok(/naya estimate upar hai/.test(c), 'nothing tells the customer their change was done');
  assert.ok(!/job\.estimateResponseNote &&/.test(c), 'the old single-note banner is still there');
});

t('every change request reaches the owner', () => {
  const c = code(app);
  assert.ok(/newChangeRequests\(j, prevJob\)/.test(c), 'notifications are not keyed off the requests themselves');
  // The old test - status changed - must no longer be what decides it.
  const block = c.slice(c.indexOf('estimate_change_request') - 600, c.indexOf('estimate_change_request') + 200);
  assert.ok(!/estimateStatus !== prevJob\?\.estimateStatus[\s\S]{0,400}estimate_change_request/.test(block),
    'the change-request notification still hangs off estimateStatus changing');
});


// The owner opened the job and still saw nothing. Two reasons, both
// of them ours.
t('a request sent with the box left empty is still shown', () => {
  // The old screen let this through: status set, no words saved. Those
  // jobs exist, and showing nothing is how the owner ends up knowing
  // only that something was asked.
  const empty = { id: 'j', estimateStatus: 'change_requested', estimateResponseNote: null };
  const open = openChangeRequests(empty);
  assert.equal(open.length, 1, 'an empty request disappears instead of asking him to call');
  assert.equal(open[0].text, '');
  // Still nothing to show once it is settled, or where none was sent.
  assert.equal(openChangeRequests({ id: 'j', estimateStatus: 'approved' }).length, 0);
  assert.equal(openChangeRequests({ id: 'j' }).length, 0);
});

t('a waiting request is on the tab a job opens on', () => {
  const a = code(admin);
  // AdminJobDetail opens on 'status'. The alert used to be on
  // 'estimate' only, one tab away from ever being seen.
  const status = a.slice(a.indexOf("{tab === 'status' &&"), a.indexOf("{tab === 'estimate' &&"));
  assert.ok(/openChangeRequests\(job\)/.test(status), 'nothing on the Status tab says a customer is waiting');
  assert.ok(/setTab\('estimate'\)/.test(status), 'the alert does not lead anywhere');
});

t('both screens say something when the request has no words', () => {
  assert.ok(/Likha kuch nahi/.test(code(admin)), 'the admin shows an empty quote mark and nothing else');
  assert.ok(/\{r\.text && /.test(code(app)), 'the customer screen shows empty quote marks');
});

console.log(n + ' assertions passed');
