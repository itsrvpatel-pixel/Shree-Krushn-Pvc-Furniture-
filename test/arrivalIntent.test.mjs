// The website's buttons name a screen - "Book a free visit", "Instant
// estimate" - and carry ?do=visit / ?do=estimate so the app opens there.
// The mapping is only as good as the screen keys it points at. It used
// to check those against the BottomNav's tabs, but the bar is down to
// four and 'appointment' is no longer one of them - it is reached from
// the home screen and by exactly this deep link. So the check is now
// against the screens CustomerApp actually RENDERS, which is what the
// link really depends on, plus the bar highlighting a tab for each.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ARRIVAL_TABS } from '../src/arrivalIntent.js';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

// The customer's BottomNav - the one holding a 'Designs' tab; the
// admin's and the partner's do not.
const navs = [...app.matchAll(/items=\{\[([\s\S]*?)\]\}/g)].map((m) => m[1]);
const customerNav = navs.find((n) => /key: 'gallery', label: 'Designs'/.test(n));

// Every screen CustomerApp renders, from its own `tab === '...'` guards.
const customerApp = app.slice(app.indexOf('function CustomerApp('), app.indexOf('function CustomerHome('));
const screens = new Set([...customerApp.matchAll(/tab === '([a-z_]+)'/g)].map((m) => m[1]));

// Sub-screens with no tab of their own must still light a tab up.
const parentBlock = app.slice(app.indexOf('const CUSTOMER_TAB_PARENT'), app.indexOf('function CustomerApp('));
const parents = Object.fromEntries([...parentBlock.matchAll(/(\w+): '([a-z_]+)'/g)].map((m) => [m[1], m[2]]));

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); }
};

check('the customer tab bar was found in App.jsx', () => {
  assert.ok(customerNav, 'no BottomNav with a review tab - has the nav moved?');
});

// Five fit at 390px; six did not, which is the overflow this guards.
// The count matters more than the names: a sixth tab added without
// measuring is how the bar started scrolling sideways and hiding
// whichever tab fell off the right edge.
check('the bar is five tabs, so it cannot scroll sideways', () => {
  const keys = [...customerNav.matchAll(/key: '([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['home', 'gallery', 'estimate', 'progress', 'more']);
});

check('every screen a website button points at is really rendered', () => {
  for (const [param, tab] of Object.entries(ARRIVAL_TABS)) {
    assert.ok(screens.has(tab), '?do=' + param + ' opens "' + tab + '", which CustomerApp does not render');
  }
});

check('arriving on a tabless screen still highlights a tab', () => {
  const keys = new Set([...customerNav.matchAll(/key: '([a-z_]+)'/g)].map((m) => m[1]));
  for (const [param, tab] of Object.entries(ARRIVAL_TABS)) {
    const lit = keys.has(tab) ? tab : parents[tab];
    assert.ok(lit && keys.has(lit), '?do=' + param + ' opens "' + tab + '" with no tab lit up');
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
