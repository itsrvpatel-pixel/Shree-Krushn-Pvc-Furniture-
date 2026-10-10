// A deploy while someone has the app open.
//
// From his error log, seven times in one afternoon: "Importing a
// module script failed." The admin panel is loaded with React.lazy,
// so its filename is decided at build time and carries a hash. When a
// new build lands, that file stops existing - and a page that was
// already open is still holding the old name. Tapping into the admin
// panel then 404s and the screen never opens.
//
// The service worker is not the problem and cannot be the fix: it
// already fetches /assets/ network-first. The running page simply has
// yesterday's filenames in its head.
//
// A reload cures it outright. Doing that exactly once is the whole
// difficulty, because a chunk that is genuinely broken would otherwise
// reload forever, on his phone, with no button left to press.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chunkReloadDecision, clearChunkReloadFlag } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const KEY = 'chunk-reloaded';

// A sessionStorage that behaves, and ones that do not.
const working = (init) => {
  const m = { ...(init || {}) };
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    _seen: () => Object.keys(m),
  };
};
const throwsOnRead = { getItem() { throw new Error('private window'); }, setItem() {}, removeItem() {} };
const throwsOnWrite = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} };

console.log('chunkReload');

t('the first failure reloads', () => {
  assert.equal(chunkReloadDecision(working(), KEY), 'reload');
});

t('the second failure does not - that is the loop guard', () => {
  const s = working();
  assert.equal(chunkReloadDecision(s, KEY), 'reload');
  assert.equal(chunkReloadDecision(s, KEY), 'rethrow');
  assert.equal(chunkReloadDecision(s, KEY), 'rethrow');
});

t('deciding to reload is recorded before the reload happens', () => {
  // If the flag were written after window.location.reload(), it never
  // would be: the page is gone. Then every load would reload again.
  const s = working();
  chunkReloadDecision(s, KEY);
  assert.deepEqual(s._seen(), [KEY], 'nothing was written, so the guard cannot hold');
});

t('a successful load clears it, so the next deploy gets its own reload', () => {
  const s = working();
  assert.equal(chunkReloadDecision(s, KEY), 'reload');
  assert.equal(clearChunkReloadFlag(s, KEY), true);
  assert.equal(chunkReloadDecision(s, KEY), 'reload', 'the tab is stuck after one deploy');
});

t('storage that throws never causes a reload', () => {
  // Safari in a private window throws on access rather than returning
  // null. Not knowing whether we have already reloaded is exactly the
  // state in which reloading starts a loop, so the error is shown
  // instead. Worse to look at, impossible to get stuck in.
  assert.equal(chunkReloadDecision(throwsOnRead, KEY), 'rethrow');
  assert.equal(chunkReloadDecision(throwsOnWrite, KEY), 'rethrow');
  assert.equal(chunkReloadDecision(null, KEY), 'rethrow');
  assert.equal(chunkReloadDecision(undefined, KEY), 'rethrow');
});

t('clearing never throws, whatever the storage does', () => {
  // This runs on the success path. A chunk that loaded perfectly must
  // not be turned into a failure by tidying up after it.
  assert.equal(clearChunkReloadFlag(throwsOnRead, KEY), true);
  assert.equal(clearChunkReloadFlag({ removeItem() { throw new Error('no'); } }, KEY), false);
  assert.equal(clearChunkReloadFlag(null, KEY), false);
});

t('the key is shared, so one name is not guarded under another', () => {
  const s = working();
  assert.equal(chunkReloadDecision(s, undefined), 'reload');
  assert.equal(chunkReloadDecision(s, undefined), 'rethrow');
  assert.deepEqual(s._seen(), [KEY], 'the default key drifted from the one App.jsx passes');
});

t('the app is wired to it, and still never settles after a reload', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(/const AdminApp = lazyWithReload\(\(\) => import\('\.\/AdminApp\.jsx'\)\)/.test(app),
    'the admin panel no longer goes through the reload wrapper');
  const fn = app.slice(app.indexOf('export function lazyWithReload('), app.indexOf('function safeSessionStorage('));
  assert.ok(/chunkReloadDecision\(safeSessionStorage\(\), RELOADED_KEY\) === 'rethrow'\) throw err/.test(fn),
    'the decision is no longer consulted');
  assert.ok(/window\.location\.reload\(\)/.test(fn), 'nothing reloads');
  assert.ok(/return new Promise\(\(\) => \{\}\)/.test(fn),
    'the promise settles after calling reload - an error screen will flash over the reloading page');
  assert.ok(/clearChunkReloadFlag\(safeSessionStorage\(\), RELOADED_KEY\)/.test(fn),
    'a successful load no longer clears the flag, so a later deploy cannot reload');
  assert.ok(/const RELOADED_KEY = 'chunk-reloaded'/.test(app), 'the key changed without the test knowing');
});

t('reading sessionStorage is itself guarded', () => {
  // window.sessionStorage can throw on property access, before any
  // method is called. That has to be caught outside the decision.
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const fn = app.slice(app.indexOf('function safeSessionStorage('));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  assert.ok(/try \{ return window\.sessionStorage; \} catch/.test(body),
    'reading sessionStorage is unguarded - a private window would crash the error path itself');
});

console.log(n + ' assertions passed\n');
