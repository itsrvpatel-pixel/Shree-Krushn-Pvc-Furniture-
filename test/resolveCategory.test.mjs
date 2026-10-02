import assert from 'node:assert/strict';
import { resolveCategory } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('resolveCategory');

t('keeps a selection that exists in the live list', () => {
  assert.equal(resolveCategory('Wardrobe', ['Kitchen', 'Wardrobe']), 'Wardrobe');
});

t('falls back to the first live category when the selection is stale', () => {
  // The exact bug: seeded from a SHIPPED default, live list has other names.
  assert.equal(resolveCategory('Color/POP Work', ['Color pop', 'electric']), 'Color pop');
});

t('falls back when nothing has been selected yet', () => {
  assert.equal(resolveCategory('', ['Kitchen', 'Wardrobe']), 'Kitchen');
  assert.equal(resolveCategory(undefined, ['Kitchen']), 'Kitchen');
});

t('returns empty string rather than undefined when there are no categories', () => {
  // undefined here is what put category:undefined on a saved requirement.
  assert.equal(resolveCategory('Kitchen', []), '');
  assert.equal(resolveCategory('Kitchen', null), '');
  assert.equal(resolveCategory(undefined, undefined), '');
});

t('never invents a category that is not in the live list', () => {
  const live = ['Kitchen', 'Wardrobe'];
  for (const sel of ['', undefined, null, 'Nope', 'Kitchen', 'Wardrobe']) {
    const out = resolveCategory(sel, live);
    assert.ok(live.includes(out), 'got ' + JSON.stringify(out));
  }
});

t('is stable once the live list has arrived', () => {
  const live = ['Color pop', 'electric'];
  const first = resolveCategory('', live);
  assert.equal(resolveCategory(first, live), first);
});

console.log(n + ' assertions passed\n');
