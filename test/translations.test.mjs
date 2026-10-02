// The app ships in English only; src/translations.js is the whole of
// its copy. Two of these checks exist because the mistake was actually
// made: a typographic apostrophe in a value broke the Rollup parse and
// took the build down, twice.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EN } from '../src/translations.js';
import { t, tf } from '../src/i18n.js';

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('translations');

check('the dictionary is a non-trivial map of strings to strings', () => {
  const keys = Object.keys(EN);
  assert.ok(keys.length > 300, 'only ' + keys.length + ' entries');
  for (const k of keys) {
    assert.equal(typeof EN[k], 'string', k + ' maps to a non-string');
    assert.ok(EN[k].trim().length > 0, k + ' maps to an empty string');
  }
});

check('every character is ASCII', () => {
  // A typographic apostrophe here is not a style nit: it broke the
  // production build. Plain ASCII only, on both sides.
  const bad = [];
  for (const [k, v] of Object.entries(EN)) {
    if (/[^\x20-\x7E]/.test(k)) bad.push('key: ' + k);
    if (/[^\x20-\x7E]/.test(v)) bad.push('value: ' + v);
  }
  assert.deepEqual(bad, []);
});

check('no entry still reads as Hinglish on the English side', () => {
  const HI = /\b(karein|karo|nahi|hai|hain|kiya|gaya|gayi|aapka|aapke|koi|kaam|dekhein|likhein|bhejein)\b/i;
  const bad = Object.entries(EN).filter(([, v]) => HI.test(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

check('placeholders survive translation', () => {
  for (const [k, v] of Object.entries(EN)) {
    const inKey = (k.match(/\{\w+\}/g) || []).sort();
    const inVal = (v.match(/\{\w+\}/g) || []).sort();
    assert.deepEqual(inVal, inKey, 'placeholders differ for: ' + k);
  }
});

check('t() returns English for a known string and the input for an unknown one', () => {
  const [someKey] = Object.keys(EN);
  assert.equal(t(someKey), EN[someKey]);
  assert.equal(t('a sentence nobody translated'), 'a sentence nobody translated');
  assert.equal(t(undefined), undefined);
  assert.equal(t(42), 42);
});

check('tf() fills placeholders', () => {
  assert.equal(
    tf('{name} ne ek sawaal poocha hai', { name: 'Rajesh' }),
    'Rajesh asked a question'
  );
  // An unknown key still interpolates rather than printing braces.
  assert.equal(tf('hello {x}', { x: 'world' }), 'hello world');
});

check('no language switch is left anywhere in the source', () => {
  const i18n = fs.readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  for (const gone of ['LANGUAGES', 'setLanguageValue', 'readStoredLanguage', 'getLanguage']) {
    assert.ok(!i18n.includes(gone), 'i18n.js still exports ' + gone);
  }
  for (const f of ['../src/App.jsx', '../src/AdminApp.jsx']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!src.includes('LanguageToggle'), f + ' still renders a language toggle');
  }
});

console.log(n + ' assertions passed\n');
