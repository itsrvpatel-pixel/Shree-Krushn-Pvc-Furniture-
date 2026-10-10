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
      questions: [], assignedStaffId: 's1', assignedStaffName: 'Rishi',
      estimateGivenAt: ago(2), createdAt: ago(3) },
    { id: 'j2', customerId: 'c2', customerName: 'Suresh Shah', phone: '9998887777', status: 'delivered',
      items: [{ id: 'i2', desc: 'Wardrobe', length: '100', height: '90', qty: '1', rate: '1100' }],
      payments: [{ id: 'p2', amount: '68750', note: 'Full', date: now }],
      extraWork: [], progressPhotos: [], requirements: [], activity: [], questions: [],
      review: { rating: 5, text: 'Very good work' },
      deliveredAt: ago(8), estimateGivenAt: ago(11), createdAt: ago(12) },
    // DH Home Decor's own job. Their panel must show this one and
    // must never show the two above.
    { id: 'j3', customerId: 'c3', customerName: 'Meena Trivedi', phone: '9123456780', status: 'in_progress',
      businessUnit: 'dh_home_decor',
      items: [{ id: 'i3', desc: 'POP ceiling', length: '120', height: '100', qty: '1', rate: '90' }],
      payments: [], extraWork: [], progressPhotos: [], requirements: [], activity: [],
      questions: [], createdAt: ago(1) },
  ];
  const mem = {
    jobs: JSON.stringify(jobs),
    customers: JSON.stringify([
      { id: 'c1', name: 'Ramesh Patel', phone: '9876543210', createdAt: now },
      { id: 'c2', name: 'Suresh Shah', phone: '9998887777', createdAt: now },
      { id: 'c3', name: 'Meena Trivedi', phone: '9123456780', businessUnit: 'dh_home_decor', createdAt: now },
    ]),
    expenses: JSON.stringify([
      { id: 'e1', type: 'Karigar Payment', payee: 'Rishi', amount: '4000', date: now, jobId: 'j1' },
      { id: 'e2', type: 'Material', payee: 'Kaka', amount: '12000', date: now },
    ]),
    staff: JSON.stringify([
      { id: 's1', name: 'Rishi', pin: '5555', role: 'karigar' },
      // A regional partner - a whole screen of its own, and one
      // nobody had ever rendered.
      { id: 's2', name: 'Jayesh', pin: '6666', role: 'regional_partner', commissionPercent: 15 },
    ]),
    notifications: '[]',
    // One PIN per role, so every panel can be opened in turn. The
    // partner panels are the ones he actually asked about - they are
    // opened least, so they are where an unimported name survives
    // longest.
    admin_pin: '7777', partner_pin: '8888', dh_partner_pin: '9999',
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
    // Counted, and made to fail. An effect that re-runs on every
    // render is invisible when the call succeeds - it just loads
    // twice and looks fine. It shows up only when the call FAILS,
    // because then the failure re-renders and the loop never stops,
    // which is what "error blinking kar raha he" was.
    leads: {
      loadAll: async () => {
        window.__leadLoads = (window.__leadLoads || 0) + 1;
        return { ok: false, reason: 'denied', rows: [] };
      },
      update: async () => ({}),
      remove: async () => ({}),
    },
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


console.log('smoke');

// Starting fresh means clearing the remembered session, not just
// reloading: the app keeps it in localStorage precisely so a refresh
// does NOT send you back to the login screen.
const loginAs = async (pin) => {
  await page.goto(BASE + '/app/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { window.localStorage.clear(); } catch (e) { /* private window */ } });
  await page.goto(BASE + '/app/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Admin', { exact: false }).first().click({ timeout: 25000 });
  await page.locator('input').first().fill(pin);
  await page.getByRole('button', { name: /enter admin|check/i }).first().click();
  await page.waitForTimeout(3000);
};

// Back to the panel's home by reloading, rather than hunting for a
// back button - that control is an icon on several screens and
// finding it reliably is a different problem from this one. Reloading
// earns its keep anyway: the session is kept in localStorage, so every
// one of these is also a refresh, and a refresh is exactly what used
// to put a red banner on screen.
const home = async () => {
  await page.goto(BASE + '/app/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
};

/* Each role, and what that role can actually reach.
 *
 * This is the part he asked for: "dh home decor panal, partners
 * panal, usko khole to kuch kuch error aate the". Those panels differ
 * from the admin one by a scattering of isPartner / isDhPartner
 * conditions, they are opened perhaps once a month, and nothing had
 * ever rendered them - which is the longest an unimported name can
 * possibly survive.
 *
 * The lists are different on purpose rather than shared: a tile a
 * role is not supposed to see would otherwise be reported as a
 * missing screen, and that confusion is how a real failure gets
 * waved away.
 */
const PANELS = [
  { role: 'Admin', pin: '7777',
    tabs: ['Home', 'Customers', 'Gallery', 'Expenses', 'Settings'],
    tiles: ['Website enquiry', 'Send to a new number', 'Service Due', 'All Customers'] },
  { role: 'Partner', pin: '8888',
    // No Expenses: money is the admin's alone.
    tabs: ['Home', 'Customers', 'Gallery', 'Settings'],
    tiles: ['All Customers', 'Reviews'] },
  { role: 'DH Home Decor', pin: '9999',
    // No Reviews either - their trade is colour, POP and electrical.
    tabs: ['Home', 'Customers', 'Gallery', 'Settings'],
    tiles: ['All Customers'],
    // Their own customer, and the one they must never be shown.
    opens: 'Meena Trivedi', neverSees: 'Ramesh Patel' },
  { role: 'Karigar', pin: '5555', tabs: [], tiles: [] },
  { role: 'Regional Partner', pin: '6666', tabs: [], tiles: [] },
];

for (const panel of PANELS) {
  await step(panel.role + ' can log in', async () => {
    await loginAs(panel.pin);
    // Logging in is not the same as arriving somewhere. A role that
    // falls through every branch lands on a screen with nothing on
    // it, which reads from the outside as "login nahi ho raha".
    const text = await page.locator('#root').innerText();
    if (/Enter admin|PIN/i.test(text) && text.length < 400) {
      throw new Error('still on the login screen - the PIN was refused');
    }
  });

  for (const tabName of panel.tabs) {
    await step(panel.role + ': the ' + tabName + ' tab opens', async () => {
      await page.getByText(tabName, { exact: true }).last().click({ timeout: 8000 });
      await page.waitForTimeout(900);
    });
  }

  for (const tile of panel.tiles) {
    await step(panel.role + ': "' + tile + '" opens', async () => {
      await home();
      if (panel.tabs.includes('Home')) {
        await page.getByText('Home', { exact: true }).last().click({ timeout: 8000 });
        await page.waitForTimeout(700);
      }
      await tap(tile);
      await page.waitForTimeout(1000);
    });
  }

  // Everyone who has a Settings tab gets it scrolled to the bottom.
  // The partners see a different screen there - PartnerSettings, not
  // AdminSettings - and it had never been rendered by anything.
  if (panel.tabs.includes('Settings')) {
    await step(panel.role + ': Settings scrolls to the end', async () => {
      await home();
      await page.getByText('Settings', { exact: true }).last().click({ timeout: 8000 });
      await page.waitForTimeout(900);
      await page.mouse.wheel(0, 20000);
      await page.waitForTimeout(900);
    });
  }

  // The job screen, which only the roles that list customers can reach.
  if (panel.tabs.includes('Customers')) {
    await step(panel.role + ': a job opens', async () => {
      await home();
      await page.getByText('Customers', { exact: true }).last().click({ timeout: 8000 });
      await page.waitForTimeout(900);
      await tap(panel.opens || 'Ramesh Patel');
      await page.waitForTimeout(1400);
    });

    // Not a rendering check - a boundary one. DH Home Decor is a
    // separate trade sharing the app, and the whole arrangement rests
    // on them never seeing a Shree Krushn customer. That is worth
    // asserting from the screen rather than from the filter, because
    // the filter is one line and the screens are many.
    if (panel.neverSees) {
      await step(panel.role + ' never sees a customer that is not theirs', async () => {
        await home();
        await page.getByText('Customers', { exact: true }).last().click({ timeout: 8000 });
        await page.waitForTimeout(1000);
        const text = await page.locator('#root').innerText();
        if (text.includes(panel.neverSees)) {
          throw new Error(panel.neverSees + ' is visible to ' + panel.role);
        }
        if (!text.includes(panel.opens)) {
          throw new Error('their own customer ' + panel.opens + ' is missing, so the check proves nothing');
        }
      });
    }
  }
}

// ---- The enquiry screen, with its load failing on purpose. A screen
//      that cannot load something must say so once, not forever.
await step('a failing enquiry list settles instead of looping', async () => {
  await loginAs('7777');
  await page.getByText('Home', { exact: true }).last().click({ timeout: 8000 });
  await page.waitForTimeout(700);
  await tap('Website enquiry');
  await page.waitForTimeout(3000);
  const calls = await page.evaluate(() => window.__leadLoads || 0);
  if (calls > 3) throw new Error('the list reloaded ' + calls + ' times - the effect is looping');
  const text = await page.locator('#root').innerText();
  if (!/log out and log in/i.test(text)) throw new Error('it does not offer the likely fix');
  if (!/Try again/i.test(text)) throw new Error('there is no way to retry');
});

// ---- Back to admin for the deepest screen in the app: every tab of a
//      job, which is where the most imports are used in one place.
await step('admin reopens a job', async () => {
  await loginAs('7777');
  await page.getByText('Customers', { exact: true }).last().click({ timeout: 8000 });
  await page.waitForTimeout(900);
  await tap('Ramesh Patel');
  await page.waitForTimeout(1400);
});

for (const tab of ['Appointment', 'Status', 'Estimate', 'Extra Work', 'Payment',
  'Requirements', 'Progress', 'Activity', 'Notes', 'Karigar', 'Material']) {
  await step('the job\'s ' + tab + ' tab opens', async () => {
    await tap(tab);
    await page.waitForTimeout(700);
  });
}

await step('the admin Settings cards are all there', async () => {
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
