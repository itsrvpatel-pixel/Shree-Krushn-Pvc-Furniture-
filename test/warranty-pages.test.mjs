// The warranty certificate: one A4 page, with the work read across it.
//
// A4 portrait is the size it started at and the size that was asked
// for back. The strip and phone-screen shapes tried in between are
// gone.
//
// What was actually wrong with the original was the single column: it
// turned a short job into a thin ribbon down an empty page and a long
// one into a second sheet. The list now reads left to right across
// two or three columns, the column count and type size stepping down
// together as the job grows, so the certificate is exactly one page
// whether the job has one item or a hundred and twenty.
//
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/warranty-pages.test.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skpf-pdf-'));
const harness = new URL('./_pdf-harness.mjs', import.meta.url).pathname;
const T = [];
const ok = (n, c, d) => T.push([n, !!c, d || '']);

const build = (count) => {
  execFileSync(process.execPath, [harness, dir], { env: { ...process.env, NITEMS: String(count) }, stdio: 'ignore' });
  return {
    warranty: fs.readFileSync(path.join(dir, 'warranty.pdf'), 'latin1'),
    receipt: fs.readFileSync(path.join(dir, 'receipt.pdf'), 'latin1'),
  };
};
const pageCount = (raw) => (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
const listed = (raw) => {
  let n = 0;
  while (raw.includes('(' + (n + 1) + '.)')) n += 1;
  return n;
};

// Short and medium jobs: every item on the card, no note. Fifty is in
// this group on purpose - it is the size the customer asked about, and
// across three columns an A4 page holds all fifty.
for (const count of [1, 6, 20, 30, 50]) {
  const { warranty } = build(count);
  ok(count + ' items: one card', pageCount(warranty) === 1, pageCount(warranty) + ' pages');
  ok(count + ' items: all of them are listed', listed(warranty) === count, 'listed ' + listed(warranty));
  ok(count + ' items: no overflow note needed', !/and \d+ more item/.test(warranty), 'note shown anyway');
}

// Long jobs: still one card, as many as fit, and the rest accounted for.
for (const count of [120]) {
  const { warranty } = build(count);
  const shown = listed(warranty);
  const note = warranty.match(/and (\d+) more item/);
  ok(count + ' items: still one card', pageCount(warranty) === 1, pageCount(warranty) + ' pages');
  ok(count + ' items: a useful number is shown', shown >= 20 && shown < count, 'showed ' + shown);
  ok(count + ' items: the remainder is accounted for',
    note && Number(note[1]) + shown === count, note ? note[0] + ' vs ' + shown + ' shown' : 'no note');
  ok(count + ' items: the note points at the quotation',
    /full list in Quotation/.test(warranty), 'no quotation reference');
}

// The size is the request, so it is pinned.
const { warranty, receipt } = build(6);
const box = warranty.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
const w = box ? Number(box[1]) : 0;
const h = box ? Number(box[2]) : 0;
ok('the page is A4', Math.abs(w - 595.28) < 1 && Math.abs(h - 841.89) < 1, w + ' x ' + h);
ok('A4 portrait, not landscape', h > w, 'landscape');
ok('the warranty itself is on it', warranty.includes('2 Years'), 'no warranty block');

// The one thing that was wrong with the original: the work covered ran
// straight down in a single column. Item 2 must sit BESIDE item 1 - same
// line, further right - not under it.
const at = (raw, n) => {
  const m = raw.match(new RegExp('([\\d.]+) ([\\d.]+) Td\\n\\(' + n + '\\.\\) Tj'));
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
};
const p1 = at(warranty, 1);
const p2 = at(warranty, 2);
const p3 = at(warranty, 3);
ok('the work covered reads across, not down',
  p1 && p2 && Math.abs(p1.y - p2.y) < 0.5 && p2.x > p1.x + 40,
  p1 && p2 ? JSON.stringify([p1, p2]) : 'items not found');
ok('the next row starts back at the left margin',
  p1 && p3 && p3.y < p1.y - 1 && Math.abs(p3.x - p1.x) < 0.5,
  p3 ? JSON.stringify(p3) : 'item 3 not found');

// Thirty items is a real job, and it must not force a second sheet or
// spill into a note - that is the whole point of the columns.
const thirty = build(30).warranty;
ok('thirty items fit on the one page', pageCount(thirty) === 1 && listed(thirty) === 30,
  pageCount(thirty) + ' pages, ' + listed(thirty) + ' listed');

// Regressions from the redesign that must stay fixed.
ok('no fractional rupees on the receipt', !receipt.includes('.333'), 'decimals are back');
ok('the receipt spells the amount out', /Rupees Only/.test(receipt), 'no amount in words');
ok('Vadodara is gone from both documents',
  !warranty.includes('Vadodara') && !receipt.includes('Vadodara'), 'still there');

fs.rmSync(dir, { recursive: true, force: true });
console.log('\n===== WARRANTY CARD / RECEIPT =====');
T.forEach(([n, p, d]) => console.log((p ? 'PASS  ' : 'FAIL  ') + n + (p ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
