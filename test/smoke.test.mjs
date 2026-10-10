// Open every screen and see whether it actually opens.
//
// WHY THIS EXISTS, WHICH IS THE WHOLE POINT
//
// He noticed the pattern before I did: "dusre panel kholte he tab hi
// kyu kuch na kuch error aate rehte he". He is right, and the reason
// is not bad luck.
//
// Three bugs in three days, all on screens rather than in logic:
//
//   Cannot access 'ge' before initialization  - a ref read above its
//                                               own declaration
//   Can't find variable: setShowQuickSend     - a setter called from a
//                                               component that does not
//                                               have it
//   useCallback is not defined                - a hook never imported
//
// Every one of them built cleanly. esbuild does not resolve free
// names, so the build cannot see any of this. And every one of them
// passed its own test, because those tests read the source as text and
// the text was there - in another function, in another file, or in a
// comment.
//
// The common factor is embarrassing and simple: NOTHING EVER OPENED
// THE SCREEN. Not once, in any test. A single render would have caught
// all three in the second it took to throw.
//
// So this opens all of them. It is not checking what they say - the
// other forty files do that. It is checking that they come up at all,
// and that nothing was thrown while they did.
//
// Needs a built site being served:
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/smoke.test.mjs
// `npm test` builds and starts one itself.

import { createRequire } from 'module';
import { spawn } from 'node:child_process';
import net from 'node:net';

const require = createRequire('/home/user/Shree-Krushn-Pvc-Furniture-/package.json');
const { chromium } = require('playwright');
const PORT = 4178;
const BASE = 'http://127.0.0.1:' + PORT;

const listening = () => new Promise((resolve) => {
  const s = net.connect(PORT, '127.0.0.1');
  s.on('connect', () => { s.end(); resolve(true); });
  s.on('error', () => resolve(false));
});

async function waitForServer(tries) {
  for (let i = 0; i < tries; i += 1) {
    if (await listening()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let preview = null;
if (!(await listening())) {
  preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: '/home/user/Shree-Krushn-Pvc-Furniture-', stdio: 'ignore', detached: true });
  if (!(await waitForServer(40))) {
    console.error('smoke: could not start a preview server on ' + PORT + ' - run `npm run build` first');
    try { process.kill(-preview.pid); } catch (e) { /* already gone */ }
    process.exit(1);
  }
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });

/* Everything the app talks to, stubbed in memory.
 *
 * Firebase never loads. That is deliberate: this is about whether a
 * screen renders, and a test that needed the network would be a test
 * nobody ran. Every window.* the app expects has to be here, because a
 * MISSING stub throws exactly like a real bug - so anything new the
 * app starts depending on must be added here too, which is its own
 * small guard against reaching for one more global.
 */
await ctx.addInitScript(() => {
  const now = new Date().toISOString();
  const ago = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d.toISOString(); };
  const jobs = [
    { id: 'j1', customerId: 'c1', customerName: 'Ramesh Patel', phone: '9876543210', status: 'in_progress',
      items: [{ id: 'i1', desc: 'Kitchen', length: '145', height: '112', qty: '1', rate: '1200' }],
      payments: [{ id: 'p1', amount: '25000', note: 'Advance', date: now }],
      extraWork: [], progressPhotos: [], requirements: [], activity: [],
      questions: [], estimateGivenAt: ago(2), createdAt: ago(3) },
    { id: 'j2', customerId: 'c2', customerName: 'Suresh Shah', phone: '9998887777', status: 'delivered',
      items: [{ id: 'i2', desc: 'Wardrobe', length: '100', height: '90', qty: '1', rate: '1100' }],
      payments: [{ id: 'p2', amount: '68750', note: 'Full', date: now }],
      extraWork: [], progressPhotos: [], requirements: [], activity: [], questions: [],
      review: { rating: 5, text: 'Very good work' },
      deliveredAt: ago(8), estimateGivenAt: ago(11), createdAt: ago(12) },
  ];
  const mem = {
    jobs: JSON.stringify(jobs),
    customers: JSON.stringify([
      { id: 'c1', name: 'Ramesh Patel', phone: '9876543210', createdAt: now },
      { id: 'c2', name: 'Suresh Shah', phone: '9998887777', createdAt: now },
    ]),
    expenses: JSON.stringify([
      { id: 'e1', type: 'Karigar Payment', payee: 'Rishi', amount: '4000', date: now, jobId: 'j1' },
      { id: 'e2', type: 'Material', payee: 'Kaka', amount: '12000', date: now },
    ]),
    staff: '[]', notifications: '[]', admin_pin: '7777',
    categories: '["Kitchen"]', gallery_categories: '["Kitchen"]', gallery_cat_Kitchen: '[]',
    estimate_rates: '[]', faqs: '[]', material_specs: '[]', company_benefits: '[]',
    archived_reviews: '[]', pending_gallery_photos: '[]', brochures: '[]',
    item_templates: '[]', attendance: '[]', appointment_item_options: '[]',
    book_closings: '[]', admin_push_tokens: '[]',
    backup_status: JSON.stringify({ at: now, ok: true, sizeBytes: 1234567, counts: { jobs: 2 } }),
  };
  const storage = {
    get: async (k) => (k in mem ? { key: k, value: mem[k] } : null),
    getStatus: async (k) => (k in mem ? { ok: true, missing: false, value: mem[k] } : { ok: true, missing: true, value: null }),
    set: async (k, v) => { mem[k] = v; return { key: k, value: v }; },
    delete: async (k) => ({ key: k, deleted: true }),
    listAllKeys: async () => Object.keys(mem),
  };
  Object.defineProperty(storage, 'subscribe', {
    get: () => ((k, cb) => { Promise.resolve().then(() => cb(mem[k] ?? null)); return () => {}; }),
    set: () => {}, configurable: false,
  });
  const mk = (lk, idOf) => {
    const col = new Map();
    const loadLegacy = async () => { const r = mem[lk]; return r ? JSON.parse(r) : []; };
    return {
      loadLegacy,
      loadAll: async () => { const a = [...col.values()]; return a.length ? a : await loadLegacy(); },
      getOne: async () => null,
      migrateLegacyIfNeeded: async () => ({ migrated: 0, skipped: 0, reason: 'nothing-to-migrate' }),
      subscribe: (cb) => { Promise.resolve().then(async () => { const a = [...col.values()]; cb(a.length ? a : await loadLegacy()); }); return () => {}; },
      saveDiff: async (nx) => { (nx || []).forEach((r) => col.set(String(idOf(r)), r)); return { writes: 1, deletes: 0 }; },
    };
  };
  const v = {
    storage,
    jobsStore: mk('jobs', (j) => j.id),
    customersStore: mk('customers', (c) => c.phone),
    appAuth: { ensureSignedIn: async () => ({ ok: true, uid: 'a', anonymous: true }), roleClaim: async () => null },
    staffAuth: {
      login: async () => ({ unconfigured: true }), signOut: async () => {},
      changePin: async () => ({ unconfigured: true }), signOutEverywhere: async () => ({ unconfigured: true }),
    },
    phoneAuth: { sendOtp: async () => ({}), verifyOtp: async () => ({ uid: 'p' }) },
    fileStorage: { upload: async (k, d) => ({ url: d }), delete: async () => ({ deleted: true }) },
    pushMessaging: { requestPermissionAndGetToken: async () => null, onForegroundMessage: () => {}, sendPush: async () => null },
    dataCheck: { probe: async () => ({ projectId: 'x', online: true, auth: { ok: true } }) },
    leads: { loadAll: async () => [], update: async () => ({}), remove: async () => ({}) },
    staffAlerts: { add: async () => ({}), loadAll: async () => [], clear: async () => ({}) },
    errorLog: { report: async () => ({}), loadAll: async () => [], clearAll: async () => ({}) },
    backups: { list: async () => ({ ok: true, backups: [] }), linkFor: async () => ({ ok: true, url: '#' }), runNow: async () => ({ ok: true, sizeBytes: 1 }) },
    adminAlert: { outage: async () => ({ ok: true }) },
  };
  for (const [k, val] of Object.entries(v)) {
    Object.defineProperty(window, k, { get: () => val, set: () => {}, configurable: false });
  }
});

const page = await ctx.newPage();

// Uncaught exceptions. This is the whole instrument: all three bugs
// this file was written for land here, by name.
const crashes = [];
page.on('pageerror', (e) => crashes.push(String(e.message).split('\n')[0]));
// React logs a component crash to console.error before the boundary
// catches it, so a screen replaced by the error card is caught too.
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  if (/is not defined|Cannot access|is not a function|undefined is not an object|Minified React error/.test(text)) {
    crashes.push(text.split('\n')[0]);
  }
});

const results = [];
let n = 0;
const step = async (name, fn) => {
  const before = crashes.length;
  try {
    await fn();
  } catch (e) {
    results.push([name, false, 'could not get there: ' + String(e.message).split('\n')[0]]);
    return;
  }
  await page.waitForTimeout(500);
  const fresh = crashes.slice(before);
  // A screen that rendered nothing is a failure too - a blank panel
  // is what a caught crash looks like from the outside.
  let text = '';
  try { text = await page.locator('#root').innerText(); } catch (e) { /* reported below */ }
  const blank = text.trim().length < 20;
  const ok = fresh.length === 0 && !blank;
  results.push([name, ok, fresh[0] || (blank ? 'the screen came up blank' : '')]);
  n += 1;
};

const tap = (label) => page.getByText(label, { exact: false }).first().click({ timeout: 8000 });

// Back to Admin Home by reloading rather than by hunting for a back
// button. The back control is an icon on several screens and finding
// it reliably is its own problem, which is not what this test is
// about. Reloading is also worth something in itself: the session is
// kept in localStorage, so every one of these is a refresh, and a
// refresh is exactly what used to put a red banner on screen.
const home = async () => {
  await page.goto(BASE + '/app/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Customers', { exact: true }).last().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
};

console.log('smoke');

// /app, not / - the build puts the marketing website at the root and
// the app one level down (see tools/assemble-site.mjs).
await page.goto(BASE + '/app/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

await step('the app starts at all', async () => {
  await page.getByText('Admin', { exact: false }).first().waitFor({ timeout: 25000 });
});

await step('admin logs in', async () => {
  await tap('Admin');
  await page.locator('input').first().fill('7777');
  await page.getByRole('button', { name: /enter admin|check/i }).first().click();
  await page.waitForTimeout(3000);
});

// ---- The five tabs along the bottom.
for (const tabName of ['Home', 'Customers', 'Gallery', 'Expenses', 'Settings']) {
  await step('the ' + tabName + ' tab opens', async () => {
    await page.getByText(tabName, { exact: true }).last().click({ timeout: 8000 });
    await page.waitForTimeout(900);
  });
}

// ---- The screens reached from Home. These are the ones that broke:
//      every bug of the last three days was on a panel like this,
//      opened by a tile nobody had pressed since it was written.
for (const tile of ['Website enquiry', 'Send to a new number', 'Service Due', 'All Customers']) {
  await step('"' + tile + '" opens', async () => {
    await home();
    await page.getByText('Home', { exact: true }).last().click({ timeout: 8000 });
    await page.waitForTimeout(700);
    await tap(tile);
    await page.waitForTimeout(1000);
  });
}

// ---- A job, which is the busiest screen in the app, and each of its tabs.
await step('a job opens', async () => {
  await home();
  await page.getByText('Customers', { exact: true }).last().click({ timeout: 8000 });
  await page.waitForTimeout(900);
  await tap('Ramesh Patel');
  await page.waitForTimeout(1400);
});

// Every tab on the job screen, by the names AdminApp actually gives
// them - this is the busiest screen in the app and the one with the
// most places for a missing import to hide.
for (const tab of ['Appointment', 'Status', 'Estimate', 'Extra Work', 'Payment',
  'Requirements', 'Progress', 'Activity', 'Notes', 'Karigar', 'Material']) {
  await step('the job\'s ' + tab + ' tab opens', async () => {
    await tap(tab);
    await page.waitForTimeout(700);
  });
}

// ---- Settings, scrolled to the bottom, because several cards only
//      exist down there - including the two added this week.
await step('Settings scrolls to the end', async () => {
  await home();
  await page.getByText('Settings', { exact: true }).last().click({ timeout: 8000 });
  await page.waitForTimeout(900);
  await page.mouse.wheel(0, 20000);
  await page.waitForTimeout(900);
  const text = await page.locator('#root').innerText();
  if (!/Automatic backup/i.test(text)) throw new Error('the backup card never rendered');
  if (!/If a PIN gets out/i.test(text)) throw new Error('the PIN card never rendered');
});

await step('the error list opens', async () => {
  await tap('Show errors');
  await page.waitForTimeout(900);
});

await browser.close();
if (preview) { try { process.kill(-preview.pid); } catch (e) { /* already gone */ } }

let failed = 0;
for (const [name, ok, detail] of results) {
  console.log('  ' + (ok ? 'ok -' : 'FAIL -') + ' ' + name + (detail ? '  <- ' + detail : ''));
  if (!ok) failed += 1;
}
if (crashes.length > 0) {
  console.log('\n  ' + crashes.length + ' error(s) thrown:');
  for (const c of [...new Set(crashes)]) console.log('    ' + c);
}
if (failed > 0) {
  console.error('\n' + failed + ' screen(s) did not open cleanly');
  process.exit(1);
}
console.log(results.length + ' screens opened, no errors thrown\n');
