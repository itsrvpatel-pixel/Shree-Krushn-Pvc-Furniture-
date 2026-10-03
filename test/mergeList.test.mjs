import assert from 'node:assert/strict';
import { mergeListWithServer, listKeyOf } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const ids = (l) => l.map((x) => (x && x.id) || x);

console.log('mergeListWithServer');

t('with nothing to merge against, the local list wins', () => {
  const next = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(mergeListWithServer(next, [{ id: 'a' }], []), next);
});

t('another device\'s addition survives this save', () => {
  // THE bug: a partner submits a photo while an admin edits the list.
  const prev = [{ id: 'a' }];
  const next = [{ id: 'a' }, { id: 'mine' }];
  const fresh = [{ id: 'a' }, { id: 'theirs' }];
  assert.deepEqual(ids(mergeListWithServer(next, prev, fresh)), ['a', 'mine', 'theirs']);
});

t('a deletion made here is not undone by the server copy', () => {
  const prev = [{ id: 'a' }, { id: 'b' }];
  const next = [{ id: 'a' }];
  const fresh = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(ids(mergeListWithServer(next, prev, fresh)), ['a']);
});

t('a deletion here plus an addition there: both hold', () => {
  const prev = [{ id: 'a' }, { id: 'b' }];
  const next = [{ id: 'a' }];
  const fresh = [{ id: 'a' }, { id: 'b' }, { id: 'theirs' }];
  assert.deepEqual(ids(mergeListWithServer(next, prev, fresh)), ['a', 'theirs']);
});

t('an edit here beats the server copy of the same entry', () => {
  const prev = [{ id: 'a', text: 'old' }];
  const next = [{ id: 'a', text: 'mine' }];
  const fresh = [{ id: 'a', text: 'theirs' }];
  assert.deepEqual(mergeListWithServer(next, prev, fresh), [{ id: 'a', text: 'mine' }]);
});

t('local order is kept, server-only entries append', () => {
  const next = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
  const fresh = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'z' }];
  assert.deepEqual(ids(mergeListWithServer(next, next, fresh)), ['c', 'a', 'b', 'z']);
});

t('plain string lists work the same way', () => {
  // categories, appointment item options and gallery_categories are
  // arrays of strings, not objects.
  const prev = ['Wardrobe', 'Kitchen'];
  const next = ['Wardrobe', 'Kitchen', 'Mandir'];
  const fresh = ['Wardrobe', 'Kitchen', 'TV Unit'];
  assert.deepEqual(mergeListWithServer(next, prev, fresh), ['Wardrobe', 'Kitchen', 'Mandir', 'TV Unit']);
});

t('removing a string category is not undone', () => {
  const prev = ['Wardrobe', 'Kitchen'];
  const next = ['Wardrobe'];
  const fresh = ['Wardrobe', 'Kitchen'];
  assert.deepEqual(mergeListWithServer(next, prev, fresh), ['Wardrobe']);
});

t('no duplicates come out, even if an input has them', () => {
  const out = mergeListWithServer([{ id: 'a' }, { id: 'a' }], [], [{ id: 'a' }]);
  assert.deepEqual(ids(out), ['a']);
});

t('a missing or non-array input never throws', () => {
  for (const bad of [undefined, null, 'x', 42, {}]) {
    assert.deepEqual(mergeListWithServer(bad, bad, bad), []);
  }
  assert.deepEqual(ids(mergeListWithServer([{ id: 'a' }], null, undefined)), ['a']);
});

t('entries with no id fall back to their content, not to undefined', () => {
  // Everything keying to undefined would collapse the list to one row.
  const fresh = [{ name: 'x' }, { name: 'y' }];
  assert.equal(mergeListWithServer([], [], fresh).length, 2);
  assert.notEqual(listKeyOf({ name: 'x' }), listKeyOf({ name: 'y' }));
});

t('the inputs are not mutated', () => {
  const next = [{ id: 'a' }]; const prev = [{ id: 'b' }]; const fresh = [{ id: 'c' }];
  const snap = JSON.stringify([next, prev, fresh]);
  mergeListWithServer(next, prev, fresh);
  assert.equal(JSON.stringify([next, prev, fresh]), snap);
});

console.log(n + ' assertions passed\n');
