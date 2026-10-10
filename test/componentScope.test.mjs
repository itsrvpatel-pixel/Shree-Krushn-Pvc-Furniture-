// A setter used in a component that does not have it.
//
// Twice now. First "Cannot access 'ge' before initialization", where a
// ref was read fifteen lines above its own declaration. Then this: the
// Home screen's "Website enquiry" and "Send to a new number" tiles
// called setShowLeads and setShowQuickSend, both of which live in
// AdminApp, from inside AdminHome - a different component entirely.
// Tapping either one threw "Can't find variable: setShowQuickSend".
//
// Both built cleanly. Both passed their own tests, because those tests
// searched the whole file for the string - and the string was there,
// in the other component. Neither bug is visible to anything that does
// not know where one function ends and the next begins.
//
// So this walks each top-level function, collects what that function
// can actually see - its own declarations, its destructured props, and
// anything at module scope - and reports a setter it calls but cannot
// reach. It is deliberately narrow: setX(...) only, because that is
// the shape the mistake takes and a general scope checker on a nine
// thousand line JSX file would be a parser, not a test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('componentScope');

// The top-level functions, each with its body, in source order.
function topLevelFunctions(src) {
  const starts = [];
  const re = /^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  for (let m; (m = re.exec(src));) starts.push({ name: m[1], at: m.index });
  return starts.map((s, i) => ({
    name: s.name,
    at: s.at,
    body: src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length),
  }));
}

// What a function destructures out of its props, including defaults
// and renames: ({ a, b = 1, c: d }) gives a, b and d.
function destructuredParams(body) {
  const open = body.indexOf('(');
  if (open < 0) return [];
  let depth = 0, close = -1;
  for (let i = open; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
  }
  if (close < 0) return [];
  const params = body.slice(open + 1, close);
  const names = [];
  // Strip default values so `backLabel = 'Customers'` yields backLabel,
  // and an arrow default does not contribute its own identifiers.
  for (const part of params.replace(/[{}]/g, ',').split(',')) {
    const m = /^\s*(?:[A-Za-z_$][\w$]*\s*:\s*)?([A-Za-z_$][\w$]*)/.exec(part);
    if (m) names.push(m[1]);
  }
  return names;
}

// Parameters of the inner arrows and callbacks a body is full of.
// persistSharedList takes a setter called setLocal and calls it; that
// is a parameter, not a free variable. Collected permissively on
// purpose - this check exists to catch one specific mistake, and a
// false alarm would get the whole thing switched off.
function innerParams(body) {
  const names = new Set();
  const add = (list) => {
    for (const part of list.replace(/[{}[\]]/g, ',').split(',')) {
      const id = /^\s*(?:\.\.\.)?\s*(?:[A-Za-z_$][\w$]*\s*:\s*)?([A-Za-z_$][\w$]*)/.exec(part);
      if (id) names.add(id[1]);
    }
  };
  for (const m of body.matchAll(/\(([^()]*)\)\s*=>/g)) add(m[1]);
  for (const m of body.matchAll(/\bfunction\s*\*?\s*[A-Za-z_$\w]*\s*\(([^()]*)\)/g)) add(m[1]);
  // A single bare parameter with no brackets: value => ...
  for (const m of body.matchAll(/(?:^|[\s(,])([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1]);
  return names;
}

// Names the function itself introduces: useState pairs, plain consts,
// lets, function declarations, and catch/for bindings.
function localNames(body) {
  const names = new Set();
  for (const m of body.matchAll(/\b(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    for (const part of m[1].split(',')) {
      const id = /^\s*([A-Za-z_$][\w$]*)/.exec(part);
      if (id) names.add(id[1]);
    }
  }
  for (const m of body.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of body.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const id = /^\s*(?:[A-Za-z_$][\w$]*\s*:\s*)?([A-Za-z_$][\w$]*)/.exec(part);
      if (id) names.add(id[1]);
    }
  }
  for (const m of body.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  return names;
}

// Everything visible at the top of a file: its own functions, its
// consts, and every shape of import. The import handling is spelled
// out rather than approximated, because a hook used but never
// imported is exactly what this file now exists to catch, and a
// collector that quietly missed `import React, { useCallback }` would
// hide the bug instead of finding it.
function moduleNames(src, fns) {
  const names = new Set(fns.map((f) => f.name));
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/gm)) {
    const clause = m[1];
    const def = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause);
    if (def) names.add(def[1]);
    const ns = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (ns) names.add(ns[1]);
    const braced = /\{([\s\S]*)\}/.exec(clause);
    if (braced) {
      for (const part of braced[1].split(',')) {
        const id = /^\s*(?:[A-Za-z_$][\w$]*\s+as\s+)?([A-Za-z_$][\w$]*)/.exec(part);
        if (id) names.add(id[1]);
      }
    }
  }
  return names;
}

// For the JSX check only: every name the file defines ANYWHERE, not
// just at the top. Plenty of small components are declared inside the
// screen that uses them - `const Card = ({ r }) => ...` inside
// AdminLeads - and an icon arrives as a renamed prop, `{ icon: Icon }`.
// None of those is a bug; the bug is a name defined nowhere at all,
// which is all this needs to find.
// Comments blanked, so a name mentioned in prose - App.jsx explains a
// key format as 'gallery_cat_<CategoryName>' - is not mistaken for a
// component being rendered.
function withoutComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function allDefinedNames(src, fns) {
  const names = moduleNames(src, fns);
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  // Renamed destructuring, which is how icons are passed about.
  for (const m of src.matchAll(/[A-Za-z_$][\w$]*\s*:\s*([A-Z][\w$]*)/g)) names.add(m[1]);
  return names;
}

function offenders(file) {
  const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  const fns = topLevelFunctions(src);
  // Anything at module scope is visible everywhere in the file.
  // Setter-shaped things that are simply always there.
  const moduleScope = moduleNames(src, fns);
  for (const always of ['setTimeout', 'setInterval', 'setImmediate']) moduleScope.add(always);

  const bad = [];
  for (const fn of fns) {
    const visible = new Set([...localNames(fn.body), ...destructuredParams(fn.body),
      ...innerParams(fn.body), ...moduleScope]);
    const used = new Set();
    for (const m of fn.body.matchAll(/\b(set[A-Z][\w$]*)\s*\(/g)) used.add(m[1]);
    for (const name of used) {
      // A method call - obj.setThing() - is not a free variable.
      if (new RegExp('[.\\w$]\\s*\\.\\s*' + name + '\\s*\\(').test(fn.body)) continue;
      if (!visible.has(name)) {
        const line = fn.body.split('\n').findIndex((l) => new RegExp('\\b' + name + '\\s*\\(').test(l));
        bad.push(file + ' ' + fn.name + '() calls ' + name
          + ' (line ' + (src.slice(0, fn.at).split('\n').length + line) + ')');
      }
    }
  }
  return bad;
}

t('no component calls a setter it cannot see', () => {
  const bad = [...offenders('AdminApp.jsx'), ...offenders('App.jsx')];
  assert.deepEqual(bad, [], bad.length + ' setter(s) out of scope:\n  ' + bad.join('\n  '));
});

t('every hook a file calls is actually imported', () => {
  // The third bug of this family, and the one he saw on his screen:
  // AdminLeads called useCallback; AdminApp.jsx imported useState,
  // useEffect, useMemo and useRef, and not useCallback. The build was
  // perfectly happy. It is a plain ReferenceError the moment the
  // screen opens - invisible to anything that does not know which
  // names a file can actually see.
  const bad = [];
  for (const file of ['App.jsx', 'AdminApp.jsx', 'jobsStore.js', 'firebaseStorage.js', 'useBackToClose.js']) {
    const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    const visible = moduleNames(src, topLevelFunctions(src));
    for (const m of src.matchAll(/\b(use[A-Z][\w$]*)\s*\(/g)) {
      if (new RegExp('\\.\\s*' + m[1] + '\\s*\\(').test(src)) continue;
      if (!visible.has(m[1])) bad.push(file + ' calls ' + m[1] + ', which it never imports');
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

t('every component and icon used in JSX is in scope', () => {
  // The same failure in a different shape: an icon used on one screen
  // and left out of the import list throws the moment that screen
  // renders.
  const bad = [];
  for (const file of ['App.jsx', 'AdminApp.jsx']) {
    const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    const visible = allDefinedNames(src, topLevelFunctions(src));
    for (const m of withoutComments(src).matchAll(/<([A-Z][\w$]*)[\s/>.]/g)) {
      if (!visible.has(m[1])) bad.push(file + ' renders <' + m[1] + '>, which is not in scope');
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

t('the hook check would have caught the bug it was written for', () => {
  // Without this, removing useCallback from the import list would be
  // caught, but so would nothing else - a collector that returns every
  // name under the sun passes everything.
  const src = "import React, { useState } from 'react';\nfunction A() { const x = useCallback(() => {}, []); return x; }";
  const visible = moduleNames(src, topLevelFunctions(src));
  assert.ok(visible.has('useState'), 'a real import is being missed');
  assert.ok(visible.has('React'), 'the default import is being missed');
  assert.ok(!visible.has('useCallback'), 'the detector thinks an unimported hook is fine');
});

t('showToast is stable, so depending on it cannot loop', () => {
  // The Website enquiry screen flashed a red error on and off. Its
  // load was a useCallback depending on showToast, its effect
  // depended on that callback, and showToast was rebuilt on every
  // render - so the failure showed a toast, the toast re-rendered
  // App, the new showToast changed the callback, the effect re-ran,
  // and it failed again, for ever.
  //
  // Fixing the one screen was not enough: the next thing to list
  // showToast as a dependency would do the same. So the identity is
  // stable at the source, and this makes sure it stays that way.
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(/const showToast = useCallback\(\(msg, isError\) => \{/.test(app),
    'showToast is rebuilt on every render again - anything depending on it will loop');
  const at = app.indexOf('const showToast = useCallback(');
  const tail = app.slice(at, at + 400);
  assert.ok(/\}, \[\]\);/.test(tail),
    'showToast has dependencies, so its identity changes and the trap is back');
});

t('nothing waits on an effect that reloads on every render', () => {
  // The shape of the bug, rather than the one instance of it: an
  // effect whose dependency array names a prop that is rebuilt
  // upstream. showToast is the one that bit; it is also the only
  // function passed down to nearly every screen, so it is the one
  // worth naming.
  const bad = [];
  for (const file of ['App.jsx', 'AdminApp.jsx']) {
    const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/useEffect\(.*\[\s*showToast\s*\]/.test(line)) {
        bad.push(file + ':' + (i + 1) + ' an effect re-runs whenever showToast changes');
      }
    });
  }
  assert.deepEqual(bad, []);
});

t('every shared helper a screen calls is imported into it', () => {
  // The gap the other checks left. They cover setters, hooks and JSX
  // components - a plain function call to something never imported
  // slips straight through, and that is how partnerDashboard reached
  // a screen in this very change: used once, imported nowhere, a
  // ReferenceError the moment a regional partner opened their home.
  //
  // jobCore holds the shared logic and both screens pull from it -
  // App.jsx directly, AdminApp.jsx through App.jsx, which re-exports.
  // Either route counts; no route at all does not.
  const core = readFileSync(new URL('../src/jobCore.js', import.meta.url), 'utf8');
  const exported = [...core.matchAll(/^export (?:function|const) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.ok(exported.length > 40, 'only ' + exported.length + ' exports found - has jobCore moved?');

  const bad = [];
  for (const file of ['App.jsx', 'AdminApp.jsx']) {
    const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
    const visible = moduleNames(src, topLevelFunctions(src));
    for (const name of exported) {
      // Called as a bare function somewhere in this file?
      if (!new RegExp('(?:^|[^.\\w$])' + name + '\\s*\\(').test(withoutComments(src))) continue;
      if (!visible.has(name)) bad.push(file + ' calls ' + name + ', which it never imports');
    }
  }
  assert.deepEqual(bad, []);
});

t('the two tiles that broke are wired through props now', () => {
  // Pinned by behaviour rather than by the general check above, because
  // this is the specific thing a customer-facing screen lost.
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  const home = admin.slice(admin.indexOf('export function AdminHome('), admin.indexOf('function QuickTile('));
  assert.ok(/onClick=\{onOpenLeads\}/.test(home), 'the Website enquiry tile reaches into another component again');
  assert.ok(/onClick=\{onOpenQuickSend\}/.test(home), 'the quick-send tile reaches into another component again');
  assert.ok(/onOpenLeads, onOpenQuickSend/.test(home.slice(0, 400)), 'AdminHome does not take them as props');
  assert.ok(/onOpenLeads=\{\(\) => setShowLeads\(true\)\}/.test(admin), 'nothing opens the enquiry screen');
  assert.ok(/onOpenQuickSend=\{\(\) => setShowQuickSend\(true\)\}/.test(admin), 'nothing opens the quick-send screen');
});

t('the check actually catches the bug it was written for', () => {
  // A test that cannot fail is worse than no test. This re-runs the
  // detector against the broken code, inlined, and insists it complains.
  const broken = [
    "function Outer() {",
    "  const [showQuickSend, setShowQuickSend] = useState(false);",
    "  return <Inner />;",
    "}",
    "function Inner({ setTab }) {",
    "  return <button onClick={() => setShowQuickSend(true)} />;",
    "}",
  ].join('\n');
  const fns = topLevelFunctions(broken);
  assert.equal(fns.length, 2, 'the function splitter no longer finds both');
  const inner = fns[1];
  const visible = new Set([...localNames(inner.body), ...destructuredParams(inner.body),
    ...innerParams(inner.body), 'Outer', 'Inner', 'useState']);
  assert.ok(!visible.has('setShowQuickSend'), 'the detector would call the broken version fine');
  assert.ok(visible.has('setTab'), 'a real prop is being reported as missing');
});

console.log(n + ' assertions passed\n');
