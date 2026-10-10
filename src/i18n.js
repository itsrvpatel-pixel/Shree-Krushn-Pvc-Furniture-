/* --- The app's copy -------------------------------------------------
   The app is in English, and the English is the source: the string in
   the JSX is the string on the screen.

   It was not always. The app was written in Hinglish and translated at
   render time through a dictionary in translations.js, keyed by the
   Hinglish sentence. That was a reasonable way to convert a file this
   size in passes - a sentence with no entry yet still rendered as
   readable Hinglish rather than a bare key like 'favorites.empty' -
   but it left two standing problems. The source and the screen
   disagreed, so searching the code for text a customer had read found
   nothing. And a string added without an entry shipped in Hinglish
   without a word of complaint, which is how several of them did.

   So the dictionary is gone and t() is the identity it now describes.
   It is kept rather than deleted from eight hundred call sites because
   tf() is still wanted - a sentence built around a value has to put
   the value somewhere, and a placeholder is how - and because t()
   marks a string as copy a person reads, which is worth keeping
   visible. What it must never become again is a second place where
   the words live.

   Both are plain functions, not hooks, because a lot of this app's
   text is produced outside any component: toasts, activity-log lines,
   WhatsApp share text, PDF labels.
------------------------------------------------------------------- */

// Identity. See above: the source string is the shipped string.
export function t(text) {
  return text;
}

// The one piece of real work: tf('{n} photos added', { n: 3 }).
// Placeholders are named, not positional, so a sentence can be
// reworded without the values following it around.
export function tf(text, vars) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const k of Object.keys(vars || {})) {
    out = out.split('{' + k + '}').join(String(vars[k]));
  }
  return out;
}
