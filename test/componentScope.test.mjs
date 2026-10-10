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

function offenders(file) {
  const src = readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
  const fns = topLevelFunctions(src);
  // Anything at module scope is visible everywhere in the file.
  // Setter-shaped things that are simply always there.
  const moduleScope = new Set(['setTimeout', 'setInterval', 'setImmediate']);
  for (const f of fns) moduleScope.add(f.name);
  for (const m of src.matchAll(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) moduleScope.add(m[1]);
  for (const m of src.matchAll(/^import\s+\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const id = /^\s*(?:[A-Za-z_$][\w$]*\s+as\s+)?([A-Za-z_$][\w$]*)/.exec(part);
      if (id) moduleScope.add(id[1]);
    }
  }

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
