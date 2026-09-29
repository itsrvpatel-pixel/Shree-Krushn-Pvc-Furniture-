// The website's buttons name a screen - "Book a free visit", "Instant
// estimate" - and carry ?do=visit / ?do=estimate so the app opens there.
// The mapping is only as good as the tab keys it points at, and those
// live in App.jsx's BottomNav. Rename a tab and the button would quietly
// go back to doing nothing; this test is the tripwire for that.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ARRIVAL_TABS } from '../src/arrivalIntent.js';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

// The customer's BottomNav - the one holding a 'review' tab; the admin's
// does not.
const navs = [...app.matchAll(/items=\{\[([\s\S]*?)\]\}/g)].map((m) => m[1]);
const customerNav = navs.find((n) => /key: 'review'/.test(n));

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); }
};

check('the customer tab bar was found in App.jsx', () => {
  assert.ok(customerNav, 'no BottomNav with a review tab - has the nav moved?');
});

check('every screen a website button points at is a real tab', () => {
  const keys = [...customerNav.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['home', 'appointment', 'gallery', 'estimate', 'progress', 'review']);
  for (const [param, tab] of Object.entries(ARRIVAL_TABS)) {
    assert.ok(keys.includes(tab), '?do=' + param + ' points at "' + tab + '", which is not a tab');
  }
});

check('the buttons the website actually uses are covered', () => {
  for (const p of ['visit', 'estimate']) assert.ok(ARRIVAL_TABS[p], '?do=' + p + ' is not handled');
});

check('the site has no ?do= link the app would ignore', () => {
  const site = fs.readdirSync(new URL('../site', import.meta.url));
  const used = new Set();
  for (const f of site.filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(new URL('../site/' + f, import.meta.url), 'utf8');
    for (const m of html.matchAll(/href="\/app\?do=([a-z]+)"/g)) used.add(m[1]);
  }
  for (const p of used) assert.ok(ARRIVAL_TABS[p], 'the site links ?do=' + p + ', which the app does not know');
  console.log('       site uses: ' + [...used].sort().join(', '));
});

console.log(failed === 0 ? '\nall passed' : '\n' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
