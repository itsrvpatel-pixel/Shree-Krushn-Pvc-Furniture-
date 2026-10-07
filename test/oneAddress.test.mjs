// The business address, written once.
//
// Google decides two listings are the same business by name, address
// and phone matching. This project had grown three different street
// addresses - the full one, a half-written one on four pages, and the
// bare word "Nikol" in the app shell - while Justdial, Sulekha and
// IndiaMart each carried their own version again. That is the most
// likely reason those directories outrank this site on its own name.
//
// The owner settled the wording: the Mahavir Complex address is right,
// and the area line carries both Nikol and Nava Naroda, because the
// locality goes by both names and customers search for each.
//
// So this test does not check that the address is correct - it cannot
// know that. It checks that there is exactly one of it.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STREET, LOCALITY, PIN, AREA_LINE } from '../tools/fix-address.mjs';

const site = new URL('../site/', import.meta.url);
const pages = readdirSync(new URL(site)).filter((f) => f.endsWith('.html'));

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('oneAddress');

t('the area line names both Nikol and Nava Naroda', () => {
  assert.ok(STREET.includes('Nikol') && STREET.includes('Nava Naroda'),
    'the street address has lost one of the two area names');
  assert.ok(AREA_LINE.includes('Nikol') && AREA_LINE.includes('Nava Naroda'),
    'the visible area line has lost one of the two area names');
});

// Read every street address the site and the app shell publish.
const found = new Map();
const files = [...pages.map((f) => ['site/' + f, readFileSync(new URL(f, site), 'utf8')])];
files.push(['index.html', readFileSync(new URL('../index.html', import.meta.url), 'utf8')]);

for (const [name, html] of files) {
  for (const m of html.matchAll(/"streetAddress":\s*"([^"]*)"/g)) {
    if (!found.has(m[1])) found.set(m[1], []);
    found.get(m[1]).push(name);
  }
}

t('every page publishes the same street address', () => {
  const spellings = [...found.keys()];
  assert.equal(spellings.length, 1,
    'the site publishes ' + spellings.length + ' different street addresses:\n  ' + spellings.join('\n  '));
  assert.equal(spellings[0], STREET,
    'the published address no longer matches the one fix-address.mjs writes');
});

t('the address appears on every page, not just some', () => {
  const missing = pages.filter((f) => f !== '404.html'
    && !readFileSync(new URL(f, site), 'utf8').includes('streetAddress'));
  assert.deepEqual(missing, [], 'no postal address on: ' + missing.join(', '));
});

t('the visible contact block agrees with the structured data', () => {
  for (const f of pages) {
    const html = readFileSync(new URL(f, site), 'utf8');
    if (!html.includes('id="contact"')) continue;
    assert.ok(html.includes(AREA_LINE),
      f + ' shows an area line that is not "' + AREA_LINE + '"');
    assert.ok(html.includes('Gujarat ' + PIN), f + ' shows a different pincode');
    assert.ok(html.includes(LOCALITY), f + ' does not say ' + LOCALITY);
  }
});

t('no page still says the old area without Nikol beside it', () => {
  for (const [name, html] of files) {
    for (const m of html.matchAll(/.{0,60}Nava Naroda.{0,30}/gs)) {
      const line = m[0].replace(/\s+/g, ' ').trim();
      const allowed = line.includes('Nikol, Nava Naroda')          // the address itself
        || /"name": ?"Nava Naroda, Ahmedabad"/.test(line)           // areaServed, a separate field
        || line.includes('including Nikol and Nava Naroda');        // areas we serve
      assert.ok(allowed, name + ' still says it the old way: ' + line);
    }
  }
});

console.log(n + ' assertions passed');
