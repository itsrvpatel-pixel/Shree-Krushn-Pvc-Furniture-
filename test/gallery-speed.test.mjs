// The gallery must not download photos it never shows.
//
// The grid renders a 400px, ~40KB thumbnail per photo. A cache warm-up
// meant to make category switching feel instant asked for `url` instead
// of `thumbUrl` - the full-quality ~650KB file that only the lightbox
// ever uses - for fifteen photos in every one of twelve categories. That
// is 180 requests, about 117MB, fired the instant the gallery mounts,
// with the thumbnails the screen was actually painting queued behind
// them. The warm-up was starving the screen it existed to speed up.
//
// The same code existed in two components and had drifted into the same
// bug twice, so these checks cover both the customer's gallery and the
// admin's.
//
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/gallery-speed.test.mjs

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const T = [];
const ok = (n, c, d) => T.push([n, !!c, d || '']);

const CATS = ['Kitchen', 'Wardrobe', 'TV Unit', 'Study Table', 'Bed', 'Sofa',
  'Temple', 'Shoe Rack', 'Crockery', 'Dressing', 'Office', 'Partition'];
const PHOTOS = 1628; // what the live Data Check reports

const seed = ([cats, total]) => {
  const now = new Date().toISOString();
  const mem = { jobs: '[]', customers: '[]', expenses: '[]', staff: '[]', notifications: '[]',
    admin_pin: '7777', categories: JSON.stringify(cats), gallery_categories: JSON.stringify(cats) };
  let left = total;
  cats.forEach((c, ci) => {
    const n = ci === cats.length - 1 ? left : Math.round(total / cats.length);
    left -= n;
    mem['gallery_cat_' + c] = JSON.stringify(Array.from({ length: n }, (_, i) => ({
      id: 'g' + ci + '-' + i,
      url: 'https://img.test/full/' + ci + '-' + i + '.jpg',
      thumbUrl: 'https://img.test/thumb/' + ci + '-' + i + '.jpg',
      caption: 'Photo ' + i, createdAt: now,
    })));
  });
  const storage = {
    get: async (k) => (k in mem ? { key: k, value: mem[k] } : null),
    getStatus: async (k) => (k in mem ? { ok: true, missing: false, value: mem[k] } : { ok: true, missing: true, value: null }),
    set: async (k, v) => { mem[k] = v; return { key: k, value: v }; },
    delete: async (k) => ({ key: k, deleted: true }),
    listAllKeys: async () => Object.keys(mem),
  };
  Object.defineProperty(storage, 'subscribe', { get: () => ((k, cb) => { Promise.resolve().then(() => cb(mem[k] ?? null)); return () => {}; }), set: () => {}, configurable: false });
  const mk = (lk, idOf) => {
    const col = new Map();
    const loadLegacy = async () => { const r = mem[lk]; return r ? JSON.parse(r) : []; };
    return { loadLegacy, loadAll: async () => { const a = [...col.values()]; return a.length ? a : await loadLegacy(); },
      getOne: async () => null, migrateLegacyIfNeeded: async () => ({ migrated: 0, skipped: 0, reason: 'nothing-to-migrate' }),
      subscribe: (cb) => { Promise.resolve().then(async () => { const a = [...col.values()]; cb(a.length ? a : await loadLegacy()); }); return () => {}; },
      saveDiff: async (n) => { (n || []).forEach((r) => col.set(String(idOf(r)), r)); return { writes: 1, deletes: 0 }; } };
  };
  const v = { storage, jobsStore: mk('jobs', (j) => j.id), customersStore: mk('customers', (c) => c.phone),
    appAuth: { ensureSignedIn: async () => ({ ok: true, uid: 'a', anonymous: true }) },
    staffAuth: { login: async () => ({ unconfigured: true }), signOut: async () => {}, changePin: async () => ({ unconfigured: true }) },
    phoneAuth: { sendOtp: async () => ({}), verifyOtp: async () => ({ uid: 'p' }) },
    fileStorage: { upload: async (k, d) => ({ url: d }), delete: async () => ({ deleted: true }) },
    pushMessaging: { requestPermissionAndGetToken: async () => null, onForegroundMessage: () => () => {}, sendPush: async () => null },
    dataCheck: { probe: async () => ({ projectId: 'x', online: true, auth: { ok: true } }) } };
  for (const [k, val] of Object.entries(v)) Object.defineProperty(window, k, { get: () => val, set: () => {}, configurable: false });
};

const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

// Opens the gallery and reports what it asked the network for.
async function openGallery({ saveData }) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(seed, [CATS, PHOTOS]);
  if (saveData) {
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ saveData: true, effectiveType: '3g' }), configurable: true,
      });
    });
  }
  const hits = { full: 0, thumb: 0 };
  await ctx.route('https://img.test/**', async (route) => {
    if (route.request().url().includes('/full/')) hits.full += 1; else hits.thumb += 1;
    await route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG });
  });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const r = document.querySelector('#root'); return r && r.innerText.trim().length > 50; }, { timeout: 60000 });
  await page.getByText('Admin', { exact: false }).first().click({ timeout: 20000 });
  await page.locator('input').first().fill('7777');
  await page.getByRole('button', { name: /enter admin|check kar/i }).first().click();
  await page.waitForTimeout(3000);
  const before = { ...hits };
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button,div,span,a')].reverse()
      .find((x) => x.innerText && x.innerText.trim() === 'Gallery');
    if (b) b.click();
  });
  await page.waitForFunction(() => document.querySelectorAll('img').length > 3, { timeout: 40000 });
  // Long enough for an idle-scheduled warm-up to have run.
  await page.waitForTimeout(6000);
  await ctx.close();
  return { full: hits.full - before.full, thumb: hits.thumb - before.thumb };
}

const normal = await openGallery({ saveData: false });
ok('the gallery asks for no full-size photos at all',
  normal.full === 0, normal.full + ' full-size requests');
ok('it does ask for thumbnails - the grid is not simply empty',
  normal.thumb > 10, normal.thumb + ' thumbnails');
// 1628 photos exist. A page of the grid is 60; warming six per category
// across twelve is another 72. Anything far past that is speculation
// nobody asked for.
ok('thumbnail requests stay near what the screen needs',
  normal.thumb <= 200, normal.thumb + ' thumbnails for ' + PHOTOS + ' photos');

const saver = await openGallery({ saveData: true });
ok('Data Saver: still no full-size photos', saver.full === 0, saver.full + ' full-size requests');
ok('Data Saver: the warm-up is skipped, so fewer requests than normal',
  saver.thumb < normal.thumb, saver.thumb + ' vs ' + normal.thumb + ' normally');
ok('Data Saver: the grid itself still loads', saver.thumb > 10, saver.thumb + ' thumbnails');

// Code nobody has asked for yet should not be in the first download.
// Uploading a photo and turning push on are both things a person has to
// ask for, and neither runs on the way to the first screen.
//
// The needles are strings only the SDK's own implementation contains -
// not the names the app calls it by, which survive minification in the
// entry chunk as property accesses and would pass a test that never
// actually checked anything.
const dist = new URL('../dist/assets/', import.meta.url).pathname;
const files = fs.readdirSync(dist).filter((f) => f.endsWith('.js'));
const entry = files.filter((f) => /^index-.*\.js$/.test(f))
  .map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('');
const others = files.filter((f) => !/^index-.*\.js$/.test(f))
  .map((f) => fs.readFileSync(path.join(dist, f), 'utf8')).join('');
for (const [name, needle] of [
  ['push messaging', 'fcmOptions'],
  ['the Storage SDK', 'firebasestorage.googleapis.com'],
]) {
  ok(name + ' is not in the first bundle', !entry.includes(needle), 'found ' + needle);
  ok(name + ' is still shipped, in a chunk of its own', others.includes(needle), 'missing entirely');
}

// A split that produces a chunk the browser cannot actually load would
// pass every check above and still break uploading a photo, so the
// chunk is fetched and evaluated for real.
{
  const names = files.filter((f) => {
    const t = fs.readFileSync(path.join(dist, f), 'utf8');
    return t.includes('firebasestorage.googleapis.com') || t.includes('fcmOptions');
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  for (const n of names) {
    const err = await page.evaluate(
      (u) => import(u).then(() => null, (e) => String(e.message || e)),
      '/assets/' + n,
    );
    ok('the ' + n.replace(/-[^-.]+\.js$/, '') + ' chunk loads and evaluates', err === null, err || '');
  }
  await page.close();
}

await browser.close();
console.log('\n===== GALLERY SPEED =====');
T.forEach(([n, p, d]) => console.log((p ? 'PASS  ' : 'FAIL  ') + n + (p ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
