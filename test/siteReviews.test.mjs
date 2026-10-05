// The website's reviews are generated at build time from the app's own
// published list (see tools/assemble-site.mjs). These guard the pieces
// that make that work, because every way it can break is silent: the
// page still builds, it just ships with no reviews on it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('siteReviews');

const page = read('site/index.html');
const build = read('tools/assemble-site.mjs');
const snapshot = JSON.parse(read('site/reviews.json'));

t('the home page has the placeholder the build fills', () => {
  assert.ok(page.includes('<!--REVIEWS-->'), 'no <!--REVIEWS--> in site/index.html');
  // And nobody has pasted reviews back in by hand beside it. That is
  // what this replaces: four typed into the page while the app had
  // seventeen, drifting further apart with every new one.
  assert.ok(!/<figcaption>/.test(page), 'a review is hardcoded in site/index.html again');
});

t('the build fails loudly rather than shipping a page with no reviews', () => {
  assert.ok(/no <!--REVIEWS--> placeholder/.test(build), 'the missing-placeholder check is gone');
  assert.ok(/business JSON-LD on the home page has changed shape/.test(build),
    'the JSON-LD anchor check is gone - ratings would silently stop being added');
});

t('there is a committed snapshot to fall back on', () => {
  assert.ok(Array.isArray(snapshot) && snapshot.length > 0, 'site/reviews.json is empty');
  for (const r of snapshot) {
    assert.ok(r.customerName, 'a snapshot review has no name');
    assert.ok(r.text, 'a snapshot review has no text');
    assert.ok(Number(r.rating) >= 1 && Number(r.rating) <= 5, 'a snapshot rating is out of range');
  }
});

t('the fallback is wired to that file, not to an empty array', () => {
  assert.ok(/reviews\.json/.test(build), 'the build does not read the snapshot');
  assert.ok(/using the committed snapshot/.test(build), 'the fallback path is gone');
});

t('reviews are escaped before going into HTML', () => {
  // Customer text, straight onto a public page. One unescaped angle
  // bracket is all it takes.
  assert.ok(/replace\(\/&\/g, '&amp;'\)/.test(build), 'the HTML escape is gone');
  assert.ok(/esc\(r\.text\)/.test(build) && /esc\(r\.customerName\)/.test(build),
    'review text or name reaches the page unescaped');
});

t('only what is shown is marked up for Google', () => {
  // Structured data for reviews a visitor cannot see is what gets a
  // site penalised, so the markup is built from the same list.
  assert.ok(/aggregateRating/.test(build) && /'@type': 'Review'/.test(build));
  assert.ok(/reviews\.map\(\(r\) => \(\{/.test(build), 'the markup no longer follows the review list');
});

console.log(n + ' assertions passed\n');
