// The app would not open at all: "Cannot access 'ge' before
// initialization", on every load, for everyone.
//
// I had put `const sessionRef = useLatestRef(session)` fifteen lines
// ABOVE `const [session] = useState(...)`. A `const` read before its
// own declaration is a temporal dead zone error - it throws, it is not
// a warning, and it took the whole app down the moment it shipped.
// Minification turned the name into 'ge', so the message named nothing
// anyone could search for.
//
// Nothing caught it. The build succeeds - this is legal JavaScript
// that only throws when it runs - and no test rendered the component.
// So this is the cheap check that would have: every ref must be
// declared after the value it watches.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('declarationOrder');

let seen = 0;

for (const file of ['src/App.jsx', 'src/AdminApp.jsx']) {
  const lines = readFileSync(new URL('../' + file, import.meta.url), 'utf8').split('\n');

  // First declaration of each name, in source order.
  const declaredAt = new Map();
  lines.forEach((l, i) => {
    const m = /^\s*(?:const|let)\s+\[?\s*(\w+)/.exec(l);
    if (m && !declaredAt.has(m[1])) declaredAt.set(m[1], i);
  });

  t(file + ': every ref is declared after the value it watches', () => {
    const bad = [];
    lines.forEach((l, i) => {
      const m = /const\s+(\w+)\s*=\s*useLatestRef\((\w+)\)/.exec(l);
      if (!m) return;
      const src = declaredAt.get(m[2]);
      if (src !== undefined && src > i) {
        bad.push(m[1] + ' (line ' + (i + 1) + ') reads ' + m[2] + ', declared on line ' + (src + 1));
      }
    });
    assert.deepEqual(bad, [], 'a ref is read before its value exists:\n  ' + bad.join('\n  '));
  });

  seen += lines.filter((l) => /useLatestRef\(/.test(l)).length;
}

t('the check can actually see the refs', () => {
  // A guard on the guard. AdminApp has none of its own, so this counts
  // across both files: if useLatestRef were renamed, the checks above
  // would pass by finding nothing at all.
  assert.ok(seen > 5, 'found only ' + seen + ' useLatestRef calls - has it been renamed?');
});

t('every test file is actually run', () => {
  // componentScope.test.mjs was written, passed, and then did not run
  // for anyone but its author, because `npm test` is a hand-written
  // chain and it was never added to it. A test nobody runs is worse
  // than no test: it reads as cover that is not there.
  //
  // The files below need something this machine does not always have -
  // the Firebase emulator, or a browser - so they are run by hand.
  // Everything else must be in the chain.
  const BY_HAND = new Set([
    'firestore-rules', 'storage-rules',   // need the Firebase emulator
    'warranty-pages', 'new-features', 'error-boundary', 'first-load',
    'gallery-speed', 'pdf-lazy', 'quote-number', 'estimate-math',
    'service-warranty',                   // need a built site or a browser
    'typing-debounce',                    // needs `npm run preview` on :4173
  ]);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const chain = pkg.scripts.test;
  const missing = [];
  for (const f of readdirSync(new URL('../test', import.meta.url))) {
    if (!f.endsWith('.test.mjs')) continue;
    const name = f.replace('.test.mjs', '');
    if (BY_HAND.has(name)) continue;
    if (!chain.includes('test/' + f)) missing.push(f);
  }
  assert.deepEqual(missing, [],
    missing.length + ' test file(s) never run: ' + missing.join(', '));

  // And the exclusion list must not be a dumping ground: every name on
  // it has to be a file that exists.
  const present = new Set(readdirSync(new URL('../test', import.meta.url))
    .filter((f) => f.endsWith('.test.mjs')).map((f) => f.replace('.test.mjs', '')));
  const stale = [...BY_HAND].filter((n) => !present.has(n));
  assert.deepEqual(stale, [], 'the run-by-hand list names files that are gone: ' + stale.join(', '));
});

console.log(n + ' assertions passed');
