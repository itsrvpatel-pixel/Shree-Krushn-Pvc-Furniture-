/* --- English copy ---------------------------------------------------
   The app ships in English only. The Hinglish sentences in the JSX are
   the SOURCE text: t('...') looks each one up here and returns its
   English wording. Keying on the sentence rather than on an invented
   id means a string with no entry yet still renders as readable
   Hinglish instead of a bare key like 'favorites.empty', and a typo in
   a call site degrades to the original text rather than to nothing -
   which is what makes it safe to convert a file this size in passes.

   t() is a plain function, not a hook, because a lot of this app's
   text is produced outside any component: toasts, activity-log lines,
   WhatsApp share text, PDF labels.
------------------------------------------------------------------- */

import { EN } from './translations.js';

// The app is English only. There is no switch and no stored
// preference: the Hinglish strings in the JSX are the SOURCE text that
// t() translates, not a language anyone can choose.
export function t(text) {
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
