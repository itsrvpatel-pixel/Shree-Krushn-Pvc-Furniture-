// The "kab kisne app visit kiya" screen.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appVisitGroups } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = 1790000000000;
const H = 3600000, DAY = 24 * H;

console.log('appVisits');

const mk = (name, lastSeenAt) => ({ id: name, name, lastSeenAt });

t('each visit lands in the right bucket', () => {
  const g = appVisitGroups([
    mk('now', NOW - 5 * 60000),
    mk('today', NOW - 20 * H),
    mk('justOverADay', NOW - 25 * H),
    mk('week', NOW - 6 * DAY),
    mk('justOverAWeek', NOW - 8 * DAY),
    mk('ancient', NOW - 300 * DAY),
    mk('nope', undefined),
  ], NOW);
  assert.deepEqual(g.today.map((c) => c.name), ['now', 'today']);
  assert.deepEqual(g.week.map((c) => c.name), ['justOverADay', 'week']);
  assert.deepEqual(g.older.map((c) => c.name), ['justOverAWeek', 'ancient']);
  assert.deepEqual(g.never.map((c) => c.name), ['nope']);
});

t('the most recent visit is first in every dated group', () => {
  const g = appVisitGroups([
    mk('b', NOW - 3 * H), mk('a', NOW - 1 * H), mk('c', NOW - 5 * H),
  ], NOW);
  assert.deepEqual(g.today.map((c) => c.name), ['a', 'b', 'c']);
});

t('never-visited is sorted by name, not left in storage order', () => {
  // No date to sort on, and a list that reorders itself every render
  // is one you cannot keep your place in.
  const g = appVisitGroups([mk('Zara'), mk('Amit'), mk('Meena')], NOW);
  assert.deepEqual(g.never.map((c) => c.name), ['Amit', 'Meena', 'Zara']);
});

t('a stamp that is not a date counts as never', () => {
  for (const bad of [undefined, null, 0, '', 'rubbish', NaN, -5]) {
    const g = appVisitGroups([mk('x', bad)], NOW);
    assert.equal(g.never.length, 1, String(bad));
    assert.equal(g.today.length + g.week.length + g.older.length, 0, String(bad));
  }
});

t('a phone with a wrong clock does not fall out of the list', () => {
  // A future stamp counted as today - they were plainly here, and
  // dropping them would silently shorten the list.
  const g = appVisitGroups([mk('futureClock', NOW + 5 * DAY)], NOW);
  assert.deepEqual(g.today.map((c) => c.name), ['futureClock']);
});

t('junk in the customer list never throws', () => {
  assert.doesNotThrow(() => appVisitGroups([null, undefined, {}, mk('ok', NOW)], NOW));
  assert.deepEqual(appVisitGroups(null, NOW), { today: [], week: [], older: [], never: [] });
  assert.doesNotThrow(() => appVisitGroups(undefined, undefined));
});

t('nobody is lost and nobody is counted twice', () => {
  // The property that matters for a list the owner works through.
  const people = Array.from({ length: 40 }, (_, i) =>
    mk('c' + i, i % 4 === 0 ? undefined : NOW - i * 7 * H));
  const g = appVisitGroups(people, NOW);
  const all = [...g.today, ...g.week, ...g.older, ...g.never];
  assert.equal(all.length, people.length);
  assert.equal(new Set(all.map((c) => c.id)).size, people.length);
});

t('the screen is wired in, with a way out of it', () => {
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  assert.ok(/showList === 'appVisits'/.test(admin), 'the app-visits screen is gone');
  assert.ok(/setShowList\('appVisits'\)/.test(admin), 'nothing opens the app-visits screen');
  assert.ok(/appVisitGroups\(/.test(admin), 'the screen no longer uses the grouping helper');
});

console.log(n + ' assertions passed\n');
