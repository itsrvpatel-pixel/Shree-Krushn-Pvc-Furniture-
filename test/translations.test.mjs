// The app is in English, and the English is the source.
//
// There used to be a dictionary here - src/translations.js - holding
// an English wording for every Hinglish sentence in the JSX, looked up
// at render time. It is gone, and this file now guards what replaced
// it: that t() is an identity, that no second copy of the words has
// grown back, and that the strings the app produces are English.
//
// One of the old checks is kept almost as it was, because the mistake
// it catches was actually made: a typographic apostrophe in a string
// broke the Rollup parse and took the build down. Three times, in the
// end - the third was during this conversion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t, tf } from '../src/i18n.js';
import { hinglishIn } from './english.mjs';

let n = 0;
const check = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const read = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const SRC = ['../src/App.jsx', '../src/AdminApp.jsx', '../src/jobCore.js',
  '../src/leadForm.js', '../src/firebaseStorage.js', '../src/jobsStore.js',
  // The endpoints word things a customer reads too - a failed OTP or a
  // visit reminder is copy, wherever it is written.
  '../api/change-pin.js', '../api/staff-login.js', '../api/send-visit-reminders.js',
  '../api/lead.js', '../api/send-push.js', '../api/backup.js'];

// Code with its comments blanked out. A comment is prose for whoever
// reads the source, not copy: several of them quote the Hinglish they
// replaced, and some use an em-dash quite deliberately.
const stripComments = (src) => {
  let out = '', i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === q) { j++; break; }
        j++;
      }
      out += src.slice(i, j); i = j; continue;
    }
    if (src.startsWith('//', i)) {
      const j = src.indexOf('\n', i);
      i = j < 0 ? src.length : j; continue;
    }
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i);
      const end = j < 0 ? src.length : j + 2;
      // Blanked, not dropped, so line numbers still mean something.
      out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue;
    }
    out += c; i++;
  }
  return out;
};

console.log('translations');

check('the dictionary is gone, not merely emptied', () => {
  // An empty dictionary is an invitation to start refilling it. The
  // file itself has to be absent.
  assert.ok(!fs.existsSync(new URL('../src/translations.js', import.meta.url)),
    'src/translations.js is back - the words live in two places again');
  assert.ok(!/from '\.\/translations/.test(read('../src/i18n.js')),
    'i18n.js imports a dictionary again');
});

check('t() returns exactly what it was given', () => {
  for (const v of ['Add a photo', '', 'anything at all', undefined, 42, null]) {
    assert.equal(t(v), v);
  }
});

check('tf() fills named placeholders and leaves the rest alone', () => {
  assert.equal(tf('{name} asked a question', { name: 'Rajesh' }), 'Rajesh asked a question');
  assert.equal(tf('{n} photos added', { n: 3 }), '3 photos added');
  // The same placeholder twice, and a value of 0, which is falsy.
  assert.equal(tf('{n} of {n}', { n: 0 }), '0 of 0');
  // A placeholder with no value stays visible rather than printing
  // "undefined" - a gap is obviously a gap; "Hello undefined" is not.
  assert.equal(tf('Hello {name}', {}), 'Hello {name}');
  assert.equal(tf('no placeholders', { n: 1 }), 'no placeholders');
  assert.equal(tf(undefined, { n: 1 }), undefined);
});

check('every character of copy is ASCII', () => {
  // The rupee glyph, the blessing on the quote footer, the Gujarati
  // and Devanagari ranges the name validator accepts, and a few arrows
  // and emoji are all deliberate and predate this. Anything else is a
  // paste from a word processor, and a typographic apostrophe among it
  // will break the build.
  const ALLOWED = /[₹ऀ-૿⚠️▲▼✓\u{1F300}-\u{1FAFF}]/u;
  const bad = [];
  for (const f of SRC) {
    stripComments(read(f)).split('\n').forEach((line, i) => {
      const odd = [...line].filter((c) => c.charCodeAt(0) > 126 && !ALLOWED.test(c));
      if (odd.length) bad.push(f + ':' + (i + 1) + ' ' + JSON.stringify(odd.join('')));
    });
  }
  assert.deepEqual(bad, []);
});

check('no language switch has grown back', () => {
  const i18n = read('../src/i18n.js');
  for (const gone of ['LANGUAGES', 'setLanguageValue', 'readStoredLanguage', 'getLanguage']) {
    assert.ok(!i18n.includes(gone), 'i18n.js exports ' + gone + ' again');
  }
  for (const f of ['../src/App.jsx', '../src/AdminApp.jsx']) {
    assert.ok(!read(f).includes('LanguageToggle'), f + ' renders a language toggle again');
  }
});

check('no Hinglish is left in any string the app can show', () => {
  // The whole point of the exercise, checked the only way that
  // survives a refactor: on the words themselves, line by line.
  const bad = [];
  for (const f of SRC) {
    stripComments(read(f)).split('\n').forEach((line, i) => {
      const words = hinglishIn(line);
      if (words.length) bad.push(f + ':' + (i + 1) + ' ' + words.join(','));
    });
  }
  assert.deepEqual(bad, [], bad.length + ' places still read as Hinglish');
});

console.log(n + ' assertions passed\n');
