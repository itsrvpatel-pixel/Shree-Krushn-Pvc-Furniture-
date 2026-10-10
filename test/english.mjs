/* One place that decides whether a phrase is English.
 *
 * The app used to be written in Hinglish and translated at render time
 * through src/translations.js, so the checks that mattered were "does
 * this string have an entry in the dictionary". It is written in
 * English at source now, and a string that is already English needs no
 * entry - so those checks would pass for the wrong reason, or fail for
 * one. What matters instead is the words themselves.
 *
 * The list is of Hinglish words that actually appeared in this project,
 * not of Hindi in general. It is deliberately short and deliberately
 * whole-word: "se" inside "send" and "ki" inside "kitchen" are English,
 * and a detector that cannot tell is worse than none.
 */
export const HINGLISH = new RegExp('\\b(' + [
  // verbs and their endings
  'karein', 'karo', 'kare', 'karna', 'karte', 'kiya', 'kiye', 'kijiye',
  'hua', 'hui', 'huva', 'hoga', 'hogi', 'jaye', 'jayega', 'gaya', 'gayi',
  'dekhein', 'dekho', 'dekhe', 'likhein', 'likho', 'bhejein', 'bhejo',
  'milein', 'mila', 'mili', 'lagta', 'lagti', 'bolo', 'bataye', 'batao',
  'poocha', 'poochein', 'khola', 'kholein', 'daalein', 'bharein',
  // being and having
  'hai', 'hain', 'tha', 'thi', 'the', 'nahi', 'nahin', 'haan',
  // pronouns and possessives
  'aap', 'aapka', 'aapke', 'aapki', 'mera', 'mere', 'meri', 'hum',
  'hamara', 'hamare', 'unka', 'unke', 'iska', 'uska', 'yeh', 'woh',
  // time
  'abhi', 'aaj', 'kal', 'pehle', 'baad', 'din', 'mahine', 'saal',
  'ghante', 'kabhi', 'dobara', 'phir', 'fir', 'roz',
  // the nouns this project actually used
  'kaam', 'paisa', 'paise', 'kharch', 'hisaab', 'naap', 'rate',
  'koi', 'kuch', 'kitna', 'kitne', 'konsa', 'konsi', 'sab', 'saara',
  'bahut', 'thoda', 'zyada', 'kam', 'accha', 'achha', 'theek',
  'wala', 'wali', 'vala', 'vali', 'liye', 'saath', 'bina', 'sirf',
  'lekin', 'par', 'aur', 'ya', 'toh', 'bhi', 'hi', 'na',
  // a second pass, from the strings the first pass let through
  'baaki', 'bacha', 'gadbad', 'gayab', 'jaayein', 'jaakar', 'jaari',
  'aayegi', 'aayega', 'aayi', 'maanga', 'maange', 'upar', 'neeche',
  'sasta', 'mehnga', 'dheere', 'juda', 'jude', 'jodna', 'shamil',
  'shaamil', 'chalayein', 'chala', 'chalu', 'roop', 'dusre', 'doosra',
  'bhara', 'chaha', 'thanda', 'ginti', 'daam', 'isliye', 'kahan',
  'kaun', 'kyun', 'kya', 'jo', 'wahi', 'yahi', 'inhe', 'unhe', 'uspar',
  'sach', 'asar', 'bharosa', 'dhanyavaad', 'namaste', 'khali',
  'poora', 'poore', 'poori', 'adhoora', 'galat', 'zaroori', 'taiyaar',
  'turant', 'jaldi', 'waqt', 'tareekh', 'sheher', 'ghar', 'dost',
  'doston', 'bhai', 'bhejne', 'bhejna', 'lena', 'dete', 'karni',
  'hone', 'hona', 'raha', 'rahega', 'rakha', 'rakhe', 'waise', 'aise',
  'aisa', 'itna', 'jitne', 'jitna', 'teenon', 'dono', 'ek', 'do',
  // a third pass, from words that reached a screen anyway
  'pichhla', 'pichhle', 'pichla', 'natija', 'nateeja', 'jaankari',
  'suchna', 'vivran', 'kripya', 'dhyan', 'yaad', 'shuruat', 'ant',

].join('|') + ')\\b', 'i');

// Words that are Hinglish and English both. "What do you need?" is
// English; so is "the", "par" in a golf sense, "rate" everywhere in
// this app. On their own they prove nothing, so they are dropped -
// a detector that cries wolf gets switched off, which is worse than
// one that misses "do option".
const AMBIGUOUS = /^(rate|par|kam|the|na|hi|din|cell|do|ek|jo|kya)$/i;

export function hinglishIn(text) {
  const found = new Set();
  for (const m of String(text == null ? '' : text).matchAll(new RegExp(HINGLISH.source, 'gi'))) {
    if (!AMBIGUOUS.test(m[1])) found.add(m[1].toLowerCase());
  }
  return [...found];
}

export function isEnglish(text) {
  return hinglishIn(text).length === 0;
}
