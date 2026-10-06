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

t('the live read needs no sign-in', () => {
  // It used to mint an anonymous token first. Anonymous sign-in is off
  // now - it was how anyone on the internet could read every customer
  // record - so that call returns 400 and the build falls back to the
  // snapshot on EVERY run: seventeen reviews on the site forever, with
  // nothing anywhere saying so. The fallback working is what made it
  // invisible, which is why this is pinned.
  assert.ok(!/accounts:signUp/.test(build),
    'the build signs in again - anonymous sign-in is disabled, so every build '
    + 'will silently ship the committed snapshot instead of the real reviews');
  assert.ok(!/Authorization/.test(build), 'the reviews read still sends a token');
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

t('six out front, and not one review dropped on the way', () => {
  // Six on his instruction: "5 to 6 bahar dikhao fir jyada dekhna ho
  // to option do to bada bada jyada na lage."
  assert.ok(/const SHOWN = 6;/.test(build), 'the number shown out front has changed');
  // The six are the newest SHORT ones, because one 849-character
  // review was taller on a phone than the other five together.
  assert.ok(/const LONG = \d+;/.test(build) && /r\.text\.length <= LONG/.test(build),
    'the long-review split is gone - one three-paragraph review will dominate the block again');
  // Whatever that picking does, the leftovers are everything not
  // picked. Computed this way it cannot silently lose a review, which
  // slicing by index twice can.
  assert.ok(/const rest = reviews\.filter\(\(r\) => !first\.includes\(r\)\);/.test(build),
    'the rest are no longer derived from what was shown - reviews can go missing');
  // And if there are not six short ones, the row fills up rather than
  // coming up short.
  assert.ok(/if \(first\.length < SHOWN\)/.test(build), 'the fill-up for too few short reviews is gone');
});

t('the page says where the reviews came from, and that stays true', () => {
  // Same line as the app shows. It is a strong claim to a stranger,
  // so these pin it to the thing that makes it true rather than to
  // anybody's good intentions.
  assert.ok(/written after their work was finished/.test(build),
    'the note about where the reviews come from is gone from the page');
  assert.ok(/class="revnote"/.test(build) && /\.revnote\{/.test(page),
    'the note has no styles - it will render as a bare line');
  // It is emitted with the cards, so it can never be left on a page
  // that has no reviews under it.
  assert.ok(/const figures = note \+/.test(build),
    'the note is no longer tied to the reviews it describes');
  // And the app still refuses a review from anyone else, or before
  // the job is done, which is the only reason the sentence is honest.
  const app = read('src/App.jsx');
  assert.ok(/canReview = job\.status === 'delivered' \|\| job\.status === 'paid'/.test(app),
    'the app no longer waits for delivery - the website claim is now false');
  assert.ok(/\.filter\(\(j\) => j\.review && j\.review\.featured\)/.test(app),
    'the published list is no longer derived from customers\' own reviews');
});

t('only what is shown is marked up for Google', () => {
  // Structured data for reviews a visitor cannot see is what gets a
  // site penalised, so the markup is built from the same list.
  assert.ok(/aggregateRating/.test(build) && /'@type': 'Review'/.test(build));
  assert.ok(/reviews\.map\(\(r\) => \(\{/.test(build), 'the markup no longer follows the review list');
});

console.log(n + ' assertions passed\n');
