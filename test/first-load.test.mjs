// What a customer has to download before they see anything.
//
// The app is one screen of React over a bundle, so until that bundle
// arrives there is nothing on the page but whatever the HTML itself
// carries - a few seconds on a phone on mobile data. Two things decide
// how that feels: how big the bundle is, and what is on screen while it
// comes down.
//
// THE BUNDLE
//
// The admin panel - Settings, the estimate editor, the reports, the job
// detail screen - is about 40% of the app's own code and is unreachable
// without a staff login. It used to ship to every customer. It is a
// separate chunk now, fetched when an admin actually logs in, and these
// checks are what stop it drifting back into the entry.
//
// The budget below is a ratchet, not a target. It has caught a real
// mistake already: a "group everything in node_modules" chunking rule
// swept jsPDF and html2canvas - 221KB gzipped, dynamically imported
// precisely so nobody downloads it until they ask for a PDF - into a
// chunk the entry pulled in eagerly.
//
// THE PAGE BEFORE THE BUNDLE
//
// index.html carries real indexable copy. Unstyled, that copy WAS the
// first thing a customer saw: a wall of raw Times New Roman that reads
// as a broken page. It is laid out as the app's loading screen now, and
// the copy is still there, still visible - hiding it is what search
// engines penalise.
//
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/first-load.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const T = [];
const ok = (n, c, d) => T.push([n, !!c, d || '']);

const root = new URL('..', import.meta.url).pathname;
const dist = path.join(root, 'dist', 'assets');
const files = fs.readdirSync(dist).filter((f) => f.endsWith('.js'));
const entryName = files.find((f) => /^index-[^.]+\.js$/.test(f));
const adminName = files.find((f) => /^AdminApp-/.test(f));
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dist, f))).length;

ok('there is an AdminApp chunk of its own', !!adminName, 'none built');

// Strings that exist only in the admin panel's source.
const entryText = entryName ? fs.readFileSync(path.join(dist, entryName), 'utf8') : '';
const adminText = adminName ? fs.readFileSync(path.join(dist, adminName), 'utf8') : '';
for (const needle of ['Karigar Performance', 'Profit']) {
  ok('"' + needle + '" is not in the entry bundle', !entryText.includes(needle), 'found it');
  ok('"' + needle + '" is in the AdminApp chunk', adminText.includes(needle), 'missing');
}

// A ratchet on what a first-time visitor downloads before anything runs.
// Raise it deliberately, with a reason - never to make a build pass.
const BUDGET_KB = 250;
const entryKb = Math.round(gz(entryName) / 1024);
ok('the first-load bundle is within budget', entryKb <= BUDGET_KB,
  entryKb + ' KB gzipped, budget ' + BUDGET_KB + ' KB');

// The PDF libraries are dynamically imported. They must stay out.
//
// The needles are strings from inside each library, not its name: the
// entry legitimately mentions "jsPDF" (the variable the loader assigns)
// and "html2canvas" (the chunk's filename in the import), so naming the
// library would fail on a build that is perfectly correct.
for (const [name, needle] of [
  ['jsPDF', 'Invalid arguments passed to jsPDF'],
  ['html2canvas', 'data-html2canvas-ignore'],
]) {
  ok(name + ' is still out of the entry bundle', !entryText.includes(needle), 'found it');
  const inChunk = files.some((f) => f !== entryName
    && fs.readFileSync(path.join(dist, f), 'utf8').includes(needle));
  ok(name + ' is still shipped, in a chunk of its own', inChunk, 'missing entirely');
}

// The holding page.
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
ok('the holding page is the branded one', /id="boot"/.test(html), 'no boot shell');
const mark = (html.match(/id="boot"[\s\S]{0,600}?<img[^>]*src="\/([^"]+)"/) || [])[1];
ok('it shows the logo', !!mark, 'no logo');
// The check that matters. The app's own icon-512.png is 288KB; putting
// it on the holding screen was measured costing four seconds on slow
// 3G, because it shares the connection with the bundle the page is
// waiting for. A holding screen must not be why the wait is long.
const markKb = mark && fs.existsSync(path.join(root, 'dist', mark))
  ? Math.round(fs.statSync(path.join(root, 'dist', mark)).size / 1024) : 9999;
ok('and the logo it shows is small', markKb <= 30, mark + ' is ' + markKb + ' KB');
ok('the indexable copy is still on it, not hidden',
  html.includes('PVC furniture near me') && !/#boot[^}]*display:\s*none/.test(html), 'copy gone or hidden');

// And the split has to actually behave: a customer never fetches it, a
// staff login does.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  const mem = { jobs: '[]', customers: '[]', expenses: '[]', staff: '[]', notifications: '[]',
    admin_pin: '7777', categories: '["Kitchen"]', gallery_categories: '["Kitchen"]', gallery_cat_Kitchen: '[]' };
  const storage = { get: async (k) => (k in mem ? { key: k, value: mem[k] } : null),
    getStatus: async (k) => (k in mem ? { ok: true, missing: false, value: mem[k] } : { ok: true, missing: true, value: null }),
    set: async (k, v) => { mem[k] = v; return { key: k, value: v }; },
    delete: async () => ({ deleted: true }), listAllKeys: async () => Object.keys(mem) };
  Object.defineProperty(storage, 'subscribe', { get: () => ((k, cb) => { Promise.resolve().then(() => cb(mem[k] ?? null)); return () => {}; }), set: () => {}, configurable: false });
  const mk = (lk, idOf) => { const col = new Map(); const loadLegacy = async () => { const r = mem[lk]; return r ? JSON.parse(r) : []; };
    return { loadLegacy, loadAll: async () => [...col.values()], getOne: async () => null,
      migrateLegacyIfNeeded: async () => ({ migrated: 0, skipped: 0, reason: 'nothing-to-migrate' }),
      subscribe: (cb) => { Promise.resolve().then(async () => cb(await loadLegacy())); return () => {}; },
      saveDiff: async (n) => { (n || []).forEach((r) => col.set(String(idOf(r)), r)); return { writes: 1, deletes: 0 }; } }; };
  const v = { storage, jobsStore: mk('jobs', (j) => j.id), customersStore: mk('customers', (c) => c.phone),
    appAuth: { ensureSignedIn: async () => ({ ok: true, uid: 'a', anonymous: true }) },
    staffAuth: { login: async () => ({ unconfigured: true }), signOut: async () => {}, changePin: async () => ({ unconfigured: true }) },
    phoneAuth: { sendOtp: async () => ({}), verifyOtp: async () => ({ uid: 'p' }) },
    fileStorage: { upload: async (k, d) => ({ url: d }), delete: async () => ({ deleted: true }) },
    pushMessaging: { requestPermissionAndGetToken: async () => null, onForegroundMessage: () => () => {}, sendPush: async () => null },
    dataCheck: { probe: async () => ({ projectId: 'x', online: true, auth: { ok: true } }) } };
  for (const [k, val] of Object.entries(v)) Object.defineProperty(window, k, { get: () => val, set: () => {}, configurable: false });
});

let adminFetched = false;
const page = await ctx.newPage();
page.on('request', (r) => { if (/\/assets\/AdminApp-/.test(r.url())) adminFetched = true; });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const r = document.querySelector('#root'); return r && /Admin Login|Register/i.test(r.innerText); }, { timeout: 60000 });
await page.waitForTimeout(2500);
ok('a visitor who has not logged in never fetches the admin panel', !adminFetched, 'it was fetched anyway');

await page.getByText('Admin', { exact: false }).first().click({ timeout: 20000 });
await page.locator('input').first().fill('7777');
await page.getByRole('button', { name: /enter admin|check kar/i }).first().click();
await page.waitForFunction(() => /Settings/i.test(document.body.innerText), { timeout: 40000 });
ok('logging in as admin fetches it', adminFetched, 'never requested');
const text = await page.evaluate(() => document.body.innerText);
ok('and the admin screen actually renders', /Settings/.test(text) && text.length > 200, text.slice(0, 80));

await browser.close();
console.log('\n===== FIRST LOAD =====');
T.forEach(([n, p, d]) => console.log((p ? 'PASS  ' : 'FAIL  ') + n + (p ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
