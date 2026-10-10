// The security rules, with the comments taken out, ready to paste.
//
//   node tools/paste-rules.mjs
//
// The rules cannot be deployed from here. They live in the Firebase
// console, and only the owner can publish them - so every time a new
// collection is added, somebody has to paste the file in by hand.
//
// Twice now that paste has gone wrong, and both times for the same
// reason: it was given as a fragment, and a fragment pasted over a
// file that is still there produces "Line 1: mismatched input
// 'match'". So this writes the WHOLE file, every time.
//
// Two different kinds of incomplete, and it checks both:
//
//   the copy lost something the file has - every match block, every
//   allow line and the brace count are compared against the source
//   the file itself is missing a collection the app uses - every
//   collection name found in the code must have a block here
//
// The second is the one that actually bit. The console was running a
// version from before the leads collection existed, so the enquiry
// screen just said "could not load" with nothing to act on.
//
// The output is generated rather than kept in the repository, because
// a second copy of the rules is a copy that will quietly disagree
// with the first one.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SRC = path.join(root, 'firestore.rules');
const OUT = path.join(root, 'PASTE-THESE-RULES.txt');

// Comments out, code untouched - so the paste can never say something
// different from what the repository says.
function stripComments(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('//', i)) {
      const j = src.indexOf('\n', i);
      i = j < 0 ? src.length : j;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i);
      i = j < 0 ? src.length : j + 2;
      continue;
    }
    out.push(src[i]);
    i += 1;
  }
  return out.join('');
}

const real = fs.readFileSync(SRC, 'utf8');
const body = stripComments(real)
  .split('\n').map((l) => l.replace(/\s+$/, '')).join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim() + '\n';

/* 1. Did the copy keep everything the file has? */
const need = [
  ...new Set([...stripComments(real).matchAll(/match \/[^\s{]+/g)].map((m) => m[0])),
  ...[...stripComments(real).matchAll(/allow [^;]+;/g)].map((m) => m[0]),
];
const missing = need.filter((bit) => !body.includes(bit));
const balanced = (body.match(/\{/g) || []).length === (body.match(/\}/g) || []).length;

if (missing.length > 0) {
  console.error('paste-rules: REFUSING to write - these are missing:\n  ' + missing.join('\n  '));
  process.exit(1);
}
if (!balanced) {
  console.error('paste-rules: REFUSING to write - the braces do not balance');
  process.exit(1);
}
if (!body.startsWith("rules_version = '2';")) {
  console.error('paste-rules: REFUSING to write - it must begin with rules_version');
  process.exit(1);
}

/* 2. Does the file cover every collection the app actually touches?
 *
 * This is the failure that costs a screen. A rules file missing one
 * block publishes perfectly cleanly and then silently locks that
 * screen out - no error anywhere, just an empty list. So the
 * collection names are read back out of the code rather than
 * remembered here.
 */
const codeFiles = [
  'src/firebaseStorage.js', 'api/lead.js', 'api/backup.js',
  'api/staff-login.js', 'api/change-pin.js',
];
const used = new Set();
for (const f of codeFiles) {
  const full = path.join(root, f);
  if (!fs.existsSync(full)) continue;
  const code = stripComments(fs.readFileSync(full, 'utf8'));
  // const X_COLLECTION = 'name'  /  collection(db, 'name')  /  .collection('name')
  for (const m of code.matchAll(/(?:COLLECTION\s*=\s*|\.collection\(|collection\(db,\s*)["']([a-z_]+)["']/g)) {
    used.add(m[1]);
  }
}
const uncovered = [...used].filter((name) => !body.includes('match /' + name + '/'));
if (uncovered.length > 0) {
  console.error('paste-rules: REFUSING to write - the app uses these collections and'
    + ' firestore.rules has no block for them:\n  ' + uncovered.join('\n  ')
    + '\n  (without a block the catch-all denies them, and the screen just goes empty)');
  process.exit(1);
}

fs.writeFileSync(OUT, body);
const blocks = new Set(need.filter((b) => b.startsWith('match'))).size;
console.log('paste-rules: ' + OUT.replace(root + '/', ''));
console.log('  covers ' + used.size + ' collection(s) the app uses');
console.log('  ' + blocks + ' blocks, '
  + need.filter((b) => b.startsWith('allow')).length + ' rules, '
  + body.split('\n').length + ' lines - complete');
console.log('  Firebase console -> Firestore Database -> Rules -> delete everything, paste this, Publish');
