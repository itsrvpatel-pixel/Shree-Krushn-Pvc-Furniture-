// The warranty card stays one card, whatever the job.
//
// It is 210mm x 99mm - a third of an A4 sheet cut the long way, three
// to a page, proportioned roughly like a phone screen held sideways.
// That size is the whole constraint: a full-home job can run
// to fifty items and there is no honest way to print fifty lines on a
// card this size. Earlier versions tried, and produced a list running
// off the page with the footer and warranty box printed over the top of
// it, then two further overlaps while fixing that.
//
// So the card states how many items are covered and points at the
// quotation, which carries every line and has a number to quote. What
// is pinned here is that contract: ONE page at any size, the count on
// it, and the quotation referenced.
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

for (const count of [1, 6, 20, 50, 120]) {
  const { warranty } = build(count);
  ok(count + ' items: still a single card', pageCount(warranty) === 1, pageCount(warranty) + ' pages');
  ok(count + ' items: the count is stated',
    warranty.includes('Covers ' + count + ' item'), 'count not on the card');
  ok(count + ' items: the warranty itself is there', warranty.includes('2 Years'), 'no warranty block');
}

// The card's shape is the point - a third of an A4, cut the long way.
const { warranty, receipt } = build(6);
const box = warranty.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
const mm = (pt) => Math.round((Number(pt) / 72) * 25.4);
ok('the card is 210mm x 99mm', box && mm(box[1]) === 210 && mm(box[2]) === 99,
  box ? mm(box[1]) + ' x ' + mm(box[2]) : 'no MediaBox');
ok('it keeps roughly a phone-screen proportion',
  box && Math.abs((Number(box[1]) / Number(box[2])) - 2.12) < 0.15,
  box ? (Number(box[1]) / Number(box[2])).toFixed(2) + ':1' : 'no MediaBox');
ok('it points at the quotation for the detail', warranty.includes('as per Quotation'), 'no quotation reference');
ok('one item reads as singular', build(1).warranty.includes('Covers 1 item as per'), 'plural for one item');

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
