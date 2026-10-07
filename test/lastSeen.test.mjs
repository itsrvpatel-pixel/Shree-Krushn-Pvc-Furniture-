// When a customer last opened the app, shown on their admin profile.
//
// The write is throttled because it costs a Firestore write on every
// single app open, and eight opens while a photo uploads are one visit.
// The label is not throttled, because reading costs nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldTouchLastSeen, lastSeenLabel, LAST_SEEN_GAP_MS } from '../src/jobCore.js';
import { computeJobDiff } from '../src/jobsStore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = 1790000000000;
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

console.log('lastSeen');

t('a customer never seen before is always worth a write', () => {
  for (const stored of [undefined, null, 0, '', 'rubbish', NaN, -5]) {
    assert.equal(shouldTouchLastSeen(stored, NOW), true, String(stored));
  }
});

t('a visit inside the gap is not written again', () => {
  assert.equal(shouldTouchLastSeen(NOW - 1 * MIN, NOW), false);
  assert.equal(shouldTouchLastSeen(NOW - 59 * MIN, NOW), false);
  assert.equal(shouldTouchLastSeen(NOW, NOW), false);
});

t('once the gap has passed it writes', () => {
  assert.equal(shouldTouchLastSeen(NOW - LAST_SEEN_GAP_MS, NOW), true);
  assert.equal(shouldTouchLastSeen(NOW - 3 * HOUR, NOW), true);
  assert.equal(shouldTouchLastSeen(NOW - 400 * DAY, NOW), true);
});

t('a stamp from the future is overwritten rather than frozen forever', () => {
  // A phone with a wrong clock writes one of these. Left alone the
  // field would never update again.
  assert.equal(shouldTouchLastSeen(NOW + 5 * DAY, NOW), true);
});

t('the gap can be overridden, and the default is an hour', () => {
  assert.equal(LAST_SEEN_GAP_MS, 60 * 60 * 1000);
  assert.equal(shouldTouchLastSeen(NOW - 5 * MIN, NOW, MIN), true);
  assert.equal(shouldTouchLastSeen(NOW - 5 * MIN, NOW, HOUR), false);
});

t('the label says something useful at every distance', () => {
  const L = (ms) => lastSeenLabel(NOW - ms, NOW);
  assert.deepEqual(lastSeenLabel(null, NOW), { key: 'Kabhi nahi khola' });
  assert.deepEqual(L(0), { key: 'Abhi abhi' });
  assert.deepEqual(L(30000), { key: 'Abhi abhi' });
  assert.deepEqual(L(20 * MIN), { key: '{n} minute pehle', n: 20 });
  assert.deepEqual(L(1 * HOUR), { key: '{n} ghante pehle', n: 1 });
  assert.deepEqual(L(5 * HOUR), { key: '{n} ghante pehle', n: 5 });
  assert.deepEqual(L(1 * DAY), { key: 'Kal' });
  assert.deepEqual(L(6 * DAY), { key: '{n} din pehle', n: 6 });
  assert.deepEqual(L(45 * DAY), { key: '{n} mahine pehle', n: 1 });
  assert.deepEqual(L(100 * DAY), { key: '{n} mahine pehle', n: 3 });
  assert.deepEqual(L(400 * DAY), { key: '{n} saal pehle', n: 1 });
});

t('a wrong clock never produces a negative reading', () => {
  assert.deepEqual(lastSeenLabel(NOW + 2 * HOUR, NOW), { key: 'Abhi abhi' });
});

t('every phrase it can produce is in the translation table', () => {
  // Every branch, walked rather than listed by hand - a new one added
  // later without its English is exactly what this is here to catch.
  const dict = readFileSync(new URL('../src/translations.js', import.meta.url), 'utf8');
  const spans = [0, 30000, 20 * MIN, HOUR, 5 * HOUR, DAY, 6 * DAY, 45 * DAY, 100 * DAY, 400 * DAY, 4000 * DAY];
  const keys = new Set(spans.map((ms) => lastSeenLabel(NOW - ms, NOW).key));
  keys.add(lastSeenLabel(null, NOW).key);
  for (const k of keys) {
    assert.ok(dict.includes("'" + k + "':"), 'no English for: ' + k);
  }
});

t('the stamp write can never delete another customer', () => {
  // This is the one that would be expensive. The stamp goes straight
  // to the store with a single record in and the same single record as
  // the previous state, bypassing persistCustomers - so the diff must
  // see one change and nothing removed, no matter how many customers
  // exist. Deletions come only from what is passed as `prev`.
  const mine = { phone: '9876543210', name: 'Test', lastSeenAt: NOW - 5 * HOUR };
  const stamped = { ...mine, lastSeenAt: NOW };
  const idOf = (c) => c && c.phone;
  const d = computeJobDiff([stamped], [mine], idOf);
  assert.equal(d.changed.length, 1);
  assert.equal(d.removedIds.length, 0, 'the stamp write would delete customer records');
  // And nothing at all when the stamp has not moved, so a redundant
  // call costs no write.
  assert.deepEqual(computeJobDiff([mine], [mine], idOf), { changed: [], removedIds: [] });
});

t('the app only stamps behind the throttle', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(/shouldTouchLastSeen\(mine\.lastSeenAt, Date\.now\(\)\)/.test(app),
    'the visit stamp is no longer throttled - every app open would cost a write');
  assert.ok(/saveDiff\(\[\{ \.\.\.mine, lastSeenAt: Date\.now\(\) \}\], \[mine\]\)/.test(app),
    'the stamp no longer writes the single record against itself');
  assert.ok(/lastSeen stamp failed \(ignored\)/.test(app),
    'the stamp can now fail loudly - a background write nobody asked for must never break the app');
});

t('the list shows it too, not just the profile', () => {
  // Scanning the list for who has gone quiet is the thing he actually
  // does. Opening fifty profiles to find out is not.
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

  const list = admin.slice(admin.indexOf('export function AdminCustomers('), admin.indexOf('function CustomerEditDialog('));
  assert.ok(/seenText\(customer\.lastSeenAt\)/.test(list),
    'the customer list no longer shows when they last opened the app');
  assert.ok(/const seenText = \(ts\) => \{/.test(list),
    'the list builds the phrase itself instead of using one helper');

  // Never-opened is the row worth spotting - it usually means the link
  // never reached them - so it must not look like every other grey
  // line on the card.
  assert.ok(/customer\.lastSeenAt \? styles\.metaItem : styles\.metaItemWarn/.test(list),
    'never-opened no longer stands out from the rest of the meta row');
  assert.ok(/metaItemWarn:/.test(app), 'the warn style is gone from the stylesheet');

  // And still on the profile.
  assert.ok(/label='App kab khola'/.test(admin), 'the profile row is gone');
});

console.log(n + ' assertions passed\n');
