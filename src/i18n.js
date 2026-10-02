/* --- Two-language support (Hinglish + English) ---------------------
   Hinglish stays the source text in the JSX. t('...') looks that exact
   Hinglish string up in the English dictionary and returns the
   translation when English is selected; with no entry it returns what
   it was given. That fallback is the whole point of keying on the
   sentence rather than on an invented id: a string nobody has
   translated yet still renders as readable Hinglish instead of a bare
   key like 'favorites.empty', and a typo in a call site degrades to
   the original text rather than to nothing. It also means the app
   keeps working while the dictionary is only partly filled.

   The current language lives in a module variable, not in React state,
   because a large share of this app's text is produced OUTSIDE any
   component - toast messages, activity-log lines, WhatsApp share text,
   PDF labels - and those are plain functions that cannot call a hook.
   React still repaints correctly: App holds one piece of `language`
   state, and nothing below it is memoised (there is no React.memo in
   this codebase), so changing it re-renders every screen. setLanguage
   keeps the module variable and that state in step.
------------------------------------------------------------------- */

import { EN } from './translations.js';

export const LANGUAGES = [
  { code: 'hi', label: 'हिं', name: 'Hinglish' },
  { code: 'en', label: 'EN', name: 'English' },
];

const STORE_KEY = 'app_language';

// Hinglish is the default: it is what every existing user already sees,
// so an upgrade must not silently switch their app to another language.
let current = 'hi';

export function readStoredLanguage() {
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (v === 'en' || v === 'hi') return v;
  } catch (e) {
    // Private windows and blocked site data throw on access rather than
    // returning null. The default is correct in that case.
  }
  return 'hi';
}

export function getLanguage() {
  return current;
}

// Called by App's language state setter, and once at startup from the
// stored value, so the module variable and the React state never drift.
export function setLanguageValue(lang) {
  current = lang === 'en' ? 'en' : 'hi';
  try { localStorage.setItem(STORE_KEY, current); } catch (e) { /* see above */ }
  return current;
}

export function t(text) {
  if (current !== 'en') return text;
  if (typeof text !== 'string') return text;
  const hit = EN[text];
  return hit === undefined ? text : hit;
}

// For the handful of places that build a sentence around a value -
// tf('{n} photo add hui', { n: 3 }). The Hinglish key keeps its
// placeholders, so the English entry can move them around freely,
// which matters because the word order often has to change.
export function tf(text, vars) {
  let out = t(text);
  for (const k of Object.keys(vars || {})) {
    out = out.split('{' + k + '}').join(String(vars[k]));
  }
  return out;
}
