// Quotation numbering.
//
// A number on the printed estimate is only useful if it never moves:
// reprinting last month's quotation has to produce the number the
// customer already has. So what is pinned here is stability and
// uniqueness, not the format.
//
//   node test/quote-number.test.mjs

import fs from 'node:fs/promises';
const src = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

// The implementations, lifted from App.jsx.
function financialYearLabel(iso) {
  const d = new Date(iso || Date.now());
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1;
  return startYear + '-' + String((startYear + 1) % 100).padStart(2, '0');
}
function nextQuoteNo(iso, used) {
  const prefix = 'SK/' + financialYearLabel(iso) + '/';
  let n = 1;
  for (const q of used) {
    if (typeof q === 'string' && q.startsWith(prefix)) {
      const v = Number(q.slice(prefix.length));
      if (Number.isFinite(v) && v >= n) n = v + 1;
    }
  }
  while (used.has(prefix + String(n).padStart(3, '0'))) n += 1;
  return prefix + String(n).padStart(3, '0');
}
function assignQuoteNumbers(list) {
  const jobs = Array.isArray(list) ? list : [];
  const used = new Set(jobs.map((j) => j && j.quoteNo).filter(Boolean));
  let changed = false;
  const next = jobs.map((j) => {
    if (!j || j.quoteNo || !(j.items || []).length) return j;
    const no = nextQuoteNo(j.estimateGivenAt || j.createdAt, used);
    used.add(no);
    changed = true;
    return { ...j, quoteNo: no };
  });
  return changed ? next : jobs;
}

const T = []; const eq = (n, got, want) => T.push([n, got === want, JSON.stringify(got) + ' vs ' + JSON.stringify(want)]);
const ok = (n, c, d) => T.push([n, !!c, d || '']);

// Indian financial year, April to March.
eq('April 2026 is 2026-27', financialYearLabel('2026-04-01T00:00:00Z'), '2026-27');
eq('March 2027 is still 2026-27', financialYearLabel('2027-03-31T00:00:00Z'), '2026-27');
eq('April 2027 rolls to 2027-28', financialYearLabel('2027-04-01T00:00:00Z'), '2027-28');

eq('first of the year is 001', nextQuoteNo('2026-06-01', new Set()), 'SK/2026-27/001');
eq('continues after the highest used', nextQuoteNo('2026-06-01', new Set(['SK/2026-27/001','SK/2026-27/013'])), 'SK/2026-27/014');
eq('a different year numbers separately', nextQuoteNo('2027-06-01', new Set(['SK/2026-27/013'])), 'SK/2027-28/001');
eq('ignores unrelated values', nextQuoteNo('2026-06-01', new Set(['junk', null, 'SK/2026-27/abc'])), 'SK/2026-27/001');

const jobs = [
  { id: 'a', items: [{}], estimateGivenAt: '2026-06-01' },
  { id: 'b', items: [],   estimateGivenAt: '2026-06-02' },
  { id: 'c', items: [{}], estimateGivenAt: '2026-06-03' },
];
const first = assignQuoteNumbers(jobs);
eq('a job with an estimate gets a number', first[0].quoteNo, 'SK/2026-27/001');
ok('a job with no items gets none', first[1].quoteNo === undefined, String(first[1].quoteNo));
eq('the next one continues', first[2].quoteNo, 'SK/2026-27/002');
ok('two jobs never share a number', first[0].quoteNo !== first[2].quoteNo, 'collision');

// The property that actually matters.
const second = assignQuoteNumbers(first);
ok('running again changes nothing', second === first, 'the array was rebuilt, so numbers could drift');
const later = assignQuoteNumbers([...first, { id: 'd', items: [{}], estimateGivenAt: '2026-09-01' }]);
eq('existing numbers survive a new job', later[0].quoteNo, 'SK/2026-27/001');
eq('the new job takes the next free one', later[3].quoteNo, 'SK/2026-27/003');

ok('the quotation shows the number', /No\. \{job\.quoteNo\}/.test(src), 'not on the PDF');
ok('the quotation is dated when it was given, not today',
  /formatDate\(job\.estimateGivenAt \|\| job\.createdAt/.test(src), 'still stamping today');
ok('the WhatsApp estimate carries it', /Quotation No\. ' \+ job\.quoteNo/.test(src), 'not in the message');

console.log('\n===== QUOTATION NUMBER =====');
T.forEach(([n, p, d]) => console.log((p ? 'PASS  ' : 'FAIL  ') + n + (p ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
