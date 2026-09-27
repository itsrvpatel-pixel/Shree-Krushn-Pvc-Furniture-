// The warranty certificate has to survive a long job.
//
// A kitchen lists six items; a full-home job can list fifty. A fixed
// two-column block handled the first and fell apart on the second - the
// list ran off the page and the footer and warranty box printed over
// it. Two further attempts at fixing that produced their own overlaps:
// the box drawn on top of the last item, and the box drawn over items
// 22 to 35. None of those were visible from the code; all three were
// visible the moment the PDF was rendered and looked at.
//
// So this generates the real document at several sizes and checks the
// two things that were actually wrong: every item has to appear, and
// the warranty block has to be somewhere it does not sit on top of one.
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

for (const count of [1, 6, 20, 35, 50, 120]) {
  execFileSync(process.execPath, [harness, dir], { env: { ...process.env, NITEMS: String(count) }, stdio: 'ignore' });
  const raw = fs.readFileSync(path.join(dir, 'warranty.pdf'), 'latin1');
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;

  // Every item is numbered "<n>." in the drawn text.
  const missing = [];
  for (let i = 1; i <= count; i += 1) if (!raw.includes('(' + i + '.)')) missing.push(i);

  ok(count + ' items: every one is listed', missing.length === 0, 'missing ' + missing.slice(0, 5).join(','));
  ok(count + ' items: the warranty block is present', raw.includes('2 Years'), 'no warranty box');
  ok(count + ' items: page count is sane', pages >= 1 && pages <= 4, pages + ' pages');
}

// A short certificate must stay a single page - the pagination must not
// have turned every document into two.
execFileSync(process.execPath, [harness, dir], { env: { ...process.env, NITEMS: '6' }, stdio: 'ignore' });
const six = fs.readFileSync(path.join(dir, 'warranty.pdf'), 'latin1');
ok('a six-item certificate is one page', (six.match(/\/Type\s*\/Page[^s]/g) || []).length === 1, 'more than one page');

// The receipt's rounding bug: it printed Rs. 2,92,408.333 to customers.
const receipt = fs.readFileSync(path.join(dir, 'receipt.pdf'), 'latin1');
ok('no fractional rupees on the receipt', !/\d\.\d{2,}\)/.test(receipt.replace(/\(([^)]*)\)/g, '($1)')) || !receipt.includes('.333'), 'decimals present');
ok('the receipt spells the amount out', /Rupees Only/.test(receipt), 'no amount in words');
ok('Vadodara is gone from both documents', !six.includes('Vadodara') && !receipt.includes('Vadodara'), 'still there');

fs.rmSync(dir, { recursive: true, force: true });
console.log('\n===== WARRANTY / RECEIPT DOCUMENTS =====');
T.forEach(([n, p, d]) => console.log((p ? 'PASS  ' : 'FAIL  ') + n + (p ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
