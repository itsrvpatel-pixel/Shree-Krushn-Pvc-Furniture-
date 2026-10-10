// When a message names a button, that button has to exist.
//
// He could not find "Check the whole app". Neither could I: the
// enquiry screen's error told him to run it, the panel is actually
// called "System Health Check", and the button I was thinking of had
// been renamed during the English conversion months after the text
// that pointed at it was written. So the app sent him looking for
// something that did not exist, in a message whose whole job was to
// tell him what to do next.
//
// There were also two panels called "Data Check" and "System Health
// Check", similar enough that I sent him to the wrong one first.
//
// Every one of these is the same mistake: a string referring to
// another string, with nothing keeping them in step. So the few
// places that name a screen or a button are checked against what the
// screens actually render.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const admin = read('../src/AdminApp.jsx');
const app = read('../src/App.jsx');
const lead = read('../src/leadForm.js');
const core = read('../src/jobCore.js');
const ui = admin + app;

console.log('pointsAtRealThings');

// Comments blanked first. Several of them quote names this app used
// to have - that is what a comment explaining a rename is for, and it
// is not the app telling anybody to go and press something.
const withoutComments = (src) => {
  let out = '', i = 0;
  while (i < src.length) {
    if (src.startsWith('//', i)) { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i);
      const end = j < 0 ? src.length : j + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue;
    }
    out += src[i]; i += 1;
  }
  return out;
};

// Anything inside "double quotes" in a message is being presented to
// the person as a thing they can find and press.
const quotedIn = (src) => [...withoutComments(src).matchAll(/'[^']*"([A-Z][^"]{3,40})"[^']*'/g)]
  .map((m) => m[1]);

// Buttons that belong to the phone or the browser rather than to
// this app. Naming them is the right thing to do - telling somebody
// to press Share and then "Add to Home Screen" is exactly the
// instruction they need - and no screen here will ever contain them.
const NOT_OURS = new Set(['Add to Home Screen', 'Ask for reviews']);

t('every button a message names is really on a screen', () => {
  const named = new Set([...quotedIn(lead), ...quotedIn(core), ...quotedIn(admin)]
    .filter((label) => !NOT_OURS.has(label)));
  assert.ok(named.size > 0, 'nothing names a button any more - has the quoting style changed?');
  const missing = [...named].filter((label) => !ui.includes(label));
  assert.deepEqual(missing, [],
    'these are named in a message but appear on no screen: ' + missing.join(', '));
});

t('the diagnostic panel and the gallery scan are not called the same thing', () => {
  // "Data Check" and "System Health Check" were close enough that I
  // pointed at the wrong one while trying to diagnose a refused read.
  assert.ok(ui.includes('Something not working?'), 'the diagnostic panel lost its name');
  assert.ok(ui.includes('Find out why'), 'the diagnostic button lost its name');
  assert.ok(ui.includes('System Health Check'), 'the gallery scan lost its name');
  assert.ok(!ui.includes('>Data Check<'), 'the two panels are confusingly named again');
});

t('the refused-enquiry message sends him to the panel that answers it', () => {
  // Not the gallery scan, which knows nothing about logins or rules.
  assert.match(lead, /Find out why/, 'the message no longer names the right button');
  assert.match(lead, /Something not working\?/, 'it does not say which card to look under');
  // Comments stripped: the one above the message explains the rename
  // by quoting the old name, which is what it is for.
  assert.ok(!/Check the whole app/.test(withoutComments(lead)),
    'it points at the vanished button again');
});

t('that panel really does report what the message promises', () => {
  // It says the check will tell him whether it is the login or the
  // rules. It has to actually do that.
  assert.ok(/Staff role on the token/.test(admin), 'the check no longer reports the role');
  assert.ok(/leads \(website enquiry\)/.test(admin), 'the check no longer reads leads');
  assert.ok(/signed in WITHOUT a staff role/.test(admin),
    'the verdict no longer distinguishes a missing role from stale rules');
});

console.log(n + ' assertions passed\n');
