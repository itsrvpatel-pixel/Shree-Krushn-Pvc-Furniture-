// Every visit, kept on the customer's own record.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordVisit, visitStamp, MAX_VISITS, LAST_SEEN_GAP_MS } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const H = 3600000, DAY = 24 * H;
const T0 = 1790000000000;

console.log('visitHistory');

t('the first visit starts the list', () => {
  const c = recordVisit({ id: 'a', name: 'Simi' }, T0);
  assert.deepEqual(c.visits, [T0]);
  assert.equal(c.lastSeenAt, T0);
  assert.equal(c.name, 'Simi', 'the rest of the record was dropped');
});

t('a later visit goes on top', () => {
  let c = recordVisit({ id: 'a' }, T0);
  c = recordVisit(c, T0 + 3 * H);
  c = recordVisit(c, T0 + 2 * DAY);
  assert.deepEqual(c.visits, [T0 + 2 * DAY, T0 + 3 * H, T0]);
  assert.equal(c.lastSeenAt, T0 + 2 * DAY, 'lastSeenAt is out of step with visits[0]');
});

t('a visit inside the throttle window changes nothing at all', () => {
  // Returned by identity, so the caller can skip the write entirely.
  const c = recordVisit({ id: 'a' }, T0);
  assert.equal(recordVisit(c, T0 + 60000), c);
  assert.equal(recordVisit(c, T0 + LAST_SEEN_GAP_MS - 1), c);
  assert.notEqual(recordVisit(c, T0 + LAST_SEEN_GAP_MS), c);
});

t('the list cannot grow without limit', () => {
  // Someone who opens the app every day for three years must not
  // become a document nobody can load.
  let c = { id: 'a' };
  for (let i = 0; i < 200; i++) c = recordVisit(c, T0 + i * DAY);
  assert.equal(c.visits.length, MAX_VISITS);
  assert.equal(c.visits[0], T0 + 199 * DAY, 'the newest visit was dropped instead of the oldest');
  assert.equal(c.lastSeenAt, T0 + 199 * DAY);
});

t('the same stamp twice is one visit', () => {
  // A clock that went backwards, or the same visit counted twice.
  let c = recordVisit({ id: 'a' }, T0);
  c = { ...c, lastSeenAt: T0 - 10 * H };   // force past the throttle
  const again = recordVisit(c, T0);
  assert.deepEqual(again.visits, [T0], 'the same moment was recorded as two visits');
});

t('rubbish in never corrupts the list', () => {
  assert.equal(recordVisit(null, T0), null);
  assert.equal(recordVisit(undefined, T0), undefined);
  for (const bad of [undefined, null, NaN, 0, -5, 'x']) {
    const c = recordVisit({ id: 'a' }, bad);
    assert.deepEqual(c, { id: 'a' }, 'a bad clock wrote a visit: ' + String(bad));
  }
  // An existing list full of junk is cleaned rather than carried.
  const messy = recordVisit({ id: 'a', visits: [null, 'x', -1, T0 - DAY, NaN] }, T0);
  assert.deepEqual(messy.visits, [T0, T0 - DAY]);
});

t('the stamp reads the same on every phone', () => {
  // Written out rather than left to toLocaleString, which differs by
  // device and cannot be tested.
  const d = (y, mo, da, h, mi) => new Date(y, mo, da, h, mi).getTime();
  assert.equal(visitStamp(d(2026, 9, 7, 9, 40)), '7 Oct, 9:40 am');
  assert.equal(visitStamp(d(2026, 9, 7, 18, 5)), '7 Oct, 6:05 pm');
  assert.equal(visitStamp(d(2026, 0, 1, 0, 0)), '1 Jan, 12:00 am', 'midnight read as 0:00');
  assert.equal(visitStamp(d(2026, 11, 31, 12, 0)), '31 Dec, 12:00 pm', 'noon read as 0:00 pm');
  for (const bad of [undefined, null, 0, -1, 'x', NaN]) assert.equal(visitStamp(bad), '');
});

t('the app records visits and the profile shows them', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  assert.ok(/recordVisit\(mine, Date\.now\(\)\)/.test(app), 'the app no longer records the visit');
  assert.ok(/if \(stamped !== mine\)/.test(app),
    'the write is no longer skipped when nothing changed - every app open would cost one');
  assert.ok(/visitStamp\(/.test(admin), 'the profile no longer shows the visit times');
});

console.log(n + ' assertions passed\n');
