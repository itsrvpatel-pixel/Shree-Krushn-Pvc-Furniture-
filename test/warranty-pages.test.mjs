// The warranty card: one card, phone-shaped, with the work on it.
//
// 1080 x 1920 - a phone screen, portrait. It is mostly read on a phone,
// sent over WhatsApp, so the page is the shape of the screen it is
// opened on.
//
// The item list lives on the card. That was not always possible: an
// earlier 210x74mm strip could not hold fifty lines, and trying made
// the list run off the page with the footer and warranty box printed
// over it. A tall page holds a real list - about thirty - and a job
// longer than that gets what fits plus a note against the quotation,
// so the card is still exactly one page.
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

// Short and medium jobs: every item on the card, no note.
for (const count of [1, 6, 20, 30]) {
  const { warranty } = build(count);
  ok(count + ' items: one card', pageCount(warranty) === 1, pageCount(warranty) + ' pages');
  ok(count + ' items: all of them are listed', listed(warranty) === count, 'listed ' + listed(warranty));
  ok(count + ' items: no overflow note needed', !/and \d+ more item/.test(warranty), 'note shown anyway');
}

// Long jobs: still one card, as many as fit, and the rest accounted for.
for (const count of [50, 120]) {
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

// The shape is the request, so it is pinned.
const { warranty, receipt } = build(6);
const box = warranty.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
const ratio = box ? Number(box[1]) / Number(box[2]) : 0;
ok('the card is a portrait phone screen (9:16)', Math.abs(ratio - 0.5625) < 0.005, ratio.toFixed(4));
ok('it is taller than it is wide', box && Number(box[2]) > Number(box[1]), 'landscape');
ok('the warranty itself is on it', warranty.includes('2 Years'), 'no warranty block');

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
