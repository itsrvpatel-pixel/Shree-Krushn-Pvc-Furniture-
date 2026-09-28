// The rule these two functions implement is decided by names the owner
// types into the admin panel, so the only test worth having runs them
// against the names the live gallery actually holds. This list is a
// snapshot of gallery_categories read from Firestore on 2026-09-28,
// with the photo count each category had at the time.
import assert from 'node:assert/strict';
import { isPartnerCategory, partnerCategories } from '../src/partnerCategories.js';

const LIVE_CATEGORIES = [
  ['Kitchen', 477], ['Wardrobe', 467], ['Dressing Table', 68], ['TV Unit', 188],
  ['Color pop', 81], ['Mandir', 99], ['Partition elevation', 69], ['Shoes box', 36],
  ['Study table', 60], ['Uncategorized', 0], ['Washbasin', 35], ['electric', 49],
];
const EXPECTED_PARTNER = ['Color pop', 'electric'];

let failed = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); }
}

check('the live gallery\'s partner categories are exactly Color pop and electric', () => {
  assert.deepEqual(partnerCategories(LIVE_CATEGORIES.map(([c]) => c)), EXPECTED_PARTNER);
});

check('no furniture category is mistaken for a partner one', () => {
  for (const [cat] of LIVE_CATEGORIES) {
    if (EXPECTED_PARTNER.includes(cat)) continue;
    assert.equal(isPartnerCategory(cat), false, cat + ' was excluded from All Photos');
  }
});

check('130 photos are the ones kept out', () => {
  const held = LIVE_CATEGORIES.filter(([c]) => isPartnerCategory(c)).reduce((n, [, k]) => n + k, 0);
  assert.equal(held, 130);
});

check('the names a fresh install seeds still match', () => {
  // DEFAULT_CATEGORIES in App.jsx ships these two. They are not what
  // this gallery uses, but a new install would have them.
  assert.equal(isPartnerCategory('Color/POP Work'), true);
  assert.equal(isPartnerCategory('Electrical Work'), true);
});

check('case and stray spacing do not matter', () => {
  for (const n of ['COLOR POP', '  electric ', 'Electric', 'color   pop', 'Colour Pop']) {
    assert.equal(isPartnerCategory(n), true, n);
  }
});

check('nothing odd is thrown by junk input', () => {
  for (const n of [null, undefined, '', 0, {}, []]) assert.equal(isPartnerCategory(n), false, String(n));
});

console.log(failed === 0 ? '\nall passed' : '\n' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
