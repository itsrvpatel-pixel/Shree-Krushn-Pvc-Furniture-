// Every page that sells something has to answer the questions people
// actually type.
//
// Search Console reported twelve of seventeen known pages not indexed.
// The eleven pages built in October carried an FAQ; the thirteen older
// ones - kitchen, wardrobe, TV unit, mandir, rates, the full-home
// pages, the ones that earn the enquiries - carried none at all.
//
// Two things are easy to get wrong here and both have bitten this
// project before. The first is writing the questions once and swapping
// the room name in, which is how a site ends up looking like one page
// printed thirteen times. The second is adding structured data that
// claims a question the page does not actually show - so each question
// is checked against the visible HTML too, not just the JSON.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const site = new URL('../site/', import.meta.url);
const read = (f) => readFileSync(new URL(f, site), 'utf8');
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&rsquo;/g, '’').replace(/’/g, "'");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('pageFaqs');

const pages = readdirSync(new URL(site)).filter((f) => f.endsWith('.html') && f !== '404.html');

// Which FAQ each page carries, read out of its own structured data.
const faqs = new Map();
for (const file of pages) {
  const html = read(file);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const graph = JSON.parse(m[1]);
    for (const node of graph['@graph'] || []) {
      if (node['@type'] === 'FAQPage') {
        faqs.set(path.basename(file, '.html'), node.mainEntity.map((q) => [q.name, q.acceptedAnswer.text]));
      }
    }
  }
}

// The pages that have to have one. POP and electrical are left out on
// purpose: that work belongs to DH Home Decor and the site carries it
// as a convenience, never as something to go looking for.
const MUST_ANSWER = [
  'pvc-modular-kitchen-ahmedabad', 'pvc-wardrobe-ahmedabad', 'pvc-tv-unit-ahmedabad',
  'pvc-pooja-mandir-ahmedabad', 'pvc-dressing-table-ahmedabad', 'pvc-study-table-ahmedabad',
  'pvc-partition-elevation-ahmedabad', 'pvc-shoe-rack-ahmedabad', 'pvc-washbasin-cabinet-ahmedabad',
  '2bhk-pvc-furniture-ahmedabad', '3bhk-pvc-furniture-ahmedabad',
  'pvc-furniture-price-ahmedabad', 'pvc-furniture-vs-plywood-ahmedabad',
];

t('every page that sells something answers questions', () => {
  const missing = MUST_ANSWER.filter((slug) => !faqs.has(slug));
  assert.deepEqual(missing, [], 'no FAQ on: ' + missing.join(', '));
});

t('the questions are really on the page, not only in the markup', () => {
  for (const [slug, qas] of faqs) {
    const text = unescape(read(slug + '.html'));
    for (const [q] of qas) {
      assert.ok(text.includes(unescape(q)),
        slug + ' claims a question it does not show: ' + q);
    }
  }
});

t('no question is asked twice across the site', () => {
  const seen = new Map();
  for (const [slug, qas] of faqs) {
    for (const [q] of qas) {
      const key = q.toLowerCase();
      assert.ok(!seen.has(key), 'same question on ' + seen.get(key) + ' and ' + slug + ': ' + q);
      seen.set(key, slug);
    }
  }
});

t('the answers say something, and say it differently each time', () => {
  const bodies = [];
  for (const [slug, qas] of faqs) {
    for (const [q, a] of qas) {
      assert.ok(a.length >= 60, slug + ' answers "' + q + '" in ' + a.length + ' characters');
      bodies.push([slug, a]);
    }
  }
  // An answer repeated word for word on two pages is the template
  // problem showing up, whatever the questions above it say.
  const byText = new Map();
  for (const [slug, a] of bodies) {
    const key = a.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    assert.ok(!byText.has(key), 'same answer on ' + byText.get(key) + ' and ' + slug);
    byText.set(key, slug);
  }
});

t('a rate quoted in an answer is a rate the price page really charges', () => {
  const price = unescape(read('pvc-furniture-price-ahmedabad.html'));
  const framing = /600/.test(price);
  const box = /1,?000/.test(price);
  assert.ok(framing && box, 'the price page no longer shows the two rates this test checks against');
  for (const [slug, qas] of faqs) {
    for (const [, a] of qas) {
      for (const m of a.matchAll(/Rs ([\d,]+) per square foot/g)) {
        assert.ok(['600', '1,000'].includes(m[1]),
          slug + ' quotes Rs ' + m[1] + ' per sq ft, which is not a rate the price page lists');
      }
    }
  }
});

console.log(n + ' assertions passed');
