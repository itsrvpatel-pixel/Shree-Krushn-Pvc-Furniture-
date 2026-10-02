import assert from 'node:assert/strict';
import { planPdfPages } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const covers = (pages, total) => {
  assert.equal(pages[0].start, 0, 'first page starts at 0');
  assert.equal(pages[pages.length - 1].end, total, 'last page ends at the content bottom');
  for (let i = 1; i < pages.length; i++) {
    assert.equal(pages[i].start, pages[i - 1].end, 'page ' + i + ' starts where the previous ended');
  }
  for (const p of pages) assert.ok(p.end > p.start, 'every page has height');
};

console.log('planPdfPages');

t('content shorter than a page is one page', () => {
  const pages = planPdfPages(500, 1000, [100, 200]);
  assert.equal(pages.length, 1);
  covers(pages, 500);
});

t('every page boundary lands on a row edge', () => {
  // 40 rows of 60px -> 2400px of content, 1000px pages.
  const rows = Array.from({ length: 40 }, (_, i) => (i + 1) * 60);
  const pages = planPdfPages(2400, 1000, rows);
  covers(pages, 2400);
  for (const p of pages.slice(0, -1)) {
    assert.ok(rows.includes(p.end), 'page ends at ' + p.end + ', which is not a row edge');
  }
});

t('the reported bug: no page ends inside a row', () => {
  const rowHeight = 60;
  const rows = Array.from({ length: 40 }, (_, i) => (i + 1) * rowHeight);
  const pages = planPdfPages(2400, 1000, rows);
  for (const p of pages.slice(0, -1)) {
    // A cut inside row k would leave end strictly between two edges.
    assert.equal(p.end % rowHeight, 0, 'cut at ' + p.end + ' falls mid-row');
  }
});

t('pages still fit on the sheet', () => {
  const rows = Array.from({ length: 40 }, (_, i) => (i + 1) * 60);
  const pages = planPdfPages(2400, 1000, rows);
  for (const p of pages) assert.ok(p.end - p.start <= 1000, 'page taller than the sheet');
});

t('with no break points it falls back to hard cuts and still terminates', () => {
  const pages = planPdfPages(2500, 1000, []);
  assert.deepEqual(pages, [
    { start: 0, end: 1000 }, { start: 1000, end: 2000 }, { start: 2000, end: 2500 },
  ]);
});

t('a block taller than a page does not strand a near-empty page', () => {
  // One legal break very early, then nothing until well past a page.
  const pages = planPdfPages(2400, 1000, [50, 2000]);
  covers(pages, 2400);
  // 50 is below the 35% floor, so it must not be chosen as page 1's end.
  assert.notEqual(pages[0].end, 50);
  assert.ok(pages[0].end >= 350);
});

t('never loops forever when breaks are useless', () => {
  for (const breaks of [[1], [1, 2, 3], [9999], [-5, 0]]) {
    const pages = planPdfPages(5000, 1000, breaks);
    assert.ok(pages.length <= 10, 'too many pages for ' + JSON.stringify(breaks));
    covers(pages, 5000);
  }
});

t('ignores break points outside the content', () => {
  const pages = planPdfPages(1500, 1000, [-10, 0, 900, 1500, 9000]);
  covers(pages, 1500);
  assert.equal(pages[0].end, 900);
});

t('unsorted break points are handled', () => {
  const a = planPdfPages(2400, 1000, [1800, 600, 2400, 1200]);
  const b = planPdfPages(2400, 1000, [600, 1200, 1800, 2400]);
  assert.deepEqual(a, b);
});

t('zero or negative sizes produce no pages rather than hanging', () => {
  assert.deepEqual(planPdfPages(0, 1000, []), []);
  assert.deepEqual(planPdfPages(1000, 0, []), []);
  assert.deepEqual(planPdfPages(-5, 1000, []), []);
});

console.log(n + ' assertions passed\n');
