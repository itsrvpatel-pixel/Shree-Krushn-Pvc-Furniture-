import assert from 'node:assert/strict';
import { buildWorkDiary } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = new Date('2026-10-02T15:00:00+05:30');
const at = (s) => new Date(s + '+05:30').toISOString();

console.log('buildWorkDiary');

t('an empty job has no diary rather than a broken one', () => {
  assert.deepEqual(buildWorkDiary({}, NOW), []);
  assert.deepEqual(buildWorkDiary(null, NOW), []);
  assert.deepEqual(buildWorkDiary({ progressPhotos: [], activity: [] }, NOW), []);
});

t('photos and activity on the same day land in one entry', () => {
  const job = {
    progressPhotos: [{ id: 'p1', date: at('2026-10-02T09:00:00'), caption: 'frame' }],
    activity: [{ id: 'a1', date: at('2026-10-02T18:00:00'), text: 'Material aaya' }],
  };
  const d = buildWorkDiary(job, NOW);
  assert.equal(d.length, 1);
  assert.equal(d[0].photos.length, 1);
  assert.equal(d[0].events.length, 1);
});

t('newest day comes first', () => {
  const job = { activity: [
    { id: 'a', date: at('2026-09-20T10:00:00'), text: 'start' },
    { id: 'b', date: at('2026-10-02T10:00:00'), text: 'today' },
    { id: 'c', date: at('2026-09-28T10:00:00'), text: 'middle' },
  ] };
  const d = buildWorkDiary(job, NOW);
  assert.deepEqual(d.map((x) => x.key), ['2026-10-02', '2026-09-28', '2026-09-20']);
});

t('day numbers count from the first day of the job, not from today', () => {
  const job = { activity: [
    { id: 'a', date: at('2026-09-21T10:00:00'), text: 'start' },
    { id: 'b', date: at('2026-10-02T10:00:00'), text: 'now' },
  ] };
  const d = buildWorkDiary(job, NOW);
  assert.equal(d[d.length - 1].dayNumber, 1, 'oldest day is Day 1');
  assert.equal(d[0].dayNumber, 12, '21 Sep -> 2 Oct is Day 12');
});

t('today and yesterday are marked', () => {
  const job = { activity: [
    { id: 'a', date: at('2026-10-02T10:00:00'), text: 'today' },
    { id: 'b', date: at('2026-10-01T10:00:00'), text: 'yesterday' },
    { id: 'c', date: at('2026-09-30T10:00:00'), text: 'older' },
  ] };
  const d = buildWorkDiary(job, NOW);
  assert.equal(d[0].isToday, true);
  assert.equal(d[0].isYesterday, false);
  assert.equal(d[1].isYesterday, true);
  assert.equal(d[2].isToday, false);
  assert.equal(d[2].isYesterday, false);
});

t('a late evening photo stays on its own day, not the next', () => {
  const job = { progressPhotos: [{ id: 'p', date: at('2026-10-01T21:30:00') }] };
  const d = buildWorkDiary(job, NOW);
  assert.equal(d[0].key, '2026-10-01');
  assert.equal(d[0].isYesterday, true);
});

t('events within a day are newest first', () => {
  const job = { activity: [
    { id: 'morning', date: at('2026-10-02T09:00:00'), text: 'a' },
    { id: 'evening', date: at('2026-10-02T19:00:00'), text: 'b' },
  ] };
  const d = buildWorkDiary(job, NOW);
  assert.deepEqual(d[0].events.map((e) => e.id), ['evening', 'morning']);
});

t('a bad date is skipped instead of creating an Invalid Date entry', () => {
  const job = {
    progressPhotos: [{ id: 'p', date: 'not-a-date' }, { id: 'q', date: at('2026-10-02T10:00:00') }],
    activity: [{ id: 'a', date: undefined, text: 'x' }],
  };
  const d = buildWorkDiary(job, NOW);
  assert.equal(d.length, 1);
  assert.equal(d[0].photos.length, 1);
  assert.equal(d[0].events.length, 0);
  for (const day of d) assert.ok(!Number.isNaN(new Date(day.date).getTime()));
});

t('every day has a sane day number', () => {
  const job = { activity: Array.from({ length: 30 }, (_, i) => ({
    id: 'e' + i, date: at('2026-09-0' + ((i % 9) + 1) + 'T10:00:00'), text: 'x',
  })) };
  const d = buildWorkDiary(job, NOW);
  for (const day of d) {
    assert.ok(Number.isInteger(day.dayNumber) && day.dayNumber >= 1, 'bad day number ' + day.dayNumber);
  }
});

t('reading the diary does not modify the job', () => {
  const job = {
    progressPhotos: [{ id: 'p', date: at('2026-10-02T10:00:00') }],
    activity: [{ id: 'a', date: at('2026-10-02T11:00:00'), text: 'x' }],
  };
  const snapshot = JSON.stringify(job);
  buildWorkDiary(job, NOW);
  assert.equal(JSON.stringify(job), snapshot);
});

console.log(n + ' assertions passed\n');
