// Puts the two halves of the deployment together after `vite build`.
//
//   dist/app/index.html   the React app  (served at /app, and at the
//                         root of the .site domain via a rewrite)
//   dist/index.html       the public website
//   dist/<room>.html      the eleven room pages
//   dist/img/**           the website's photographs
//
// Vite writes the app to dist/index.html, so it is moved aside first and
// the website is copied over the top. Shared files - /assets, the icons,
// manifest.json, sw.js - stay at the root and serve both.
//
// The app keeps working at the root of shreekrushnpvcfurniture.site.
// That matters more than it looks: every customer who added the app to
// their home screen has a PWA whose start_url is "/", and moving it
// would land them on a marketing page instead of their job.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const site = path.join(root, 'site');

const fail = (m) => { console.error('assemble-site: ' + m); process.exit(1); };

if (!fs.existsSync(path.join(dist, 'index.html'))) fail('dist/index.html is missing - did vite build run?');
if (!fs.existsSync(path.join(site, 'index.html'))) fail('site/index.html is missing');

// 1. the app moves to /app
fs.mkdirSync(path.join(dist, 'app'), { recursive: true });
fs.renameSync(path.join(dist, 'index.html'), path.join(dist, 'app', 'index.html'));

// 2. the website copies over the root
let files = 0;
const copy = (from, to) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const f = path.join(from, e.name);
    const t = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(t, { recursive: true }); copy(f, t); }
    else { fs.copyFileSync(f, t); files += 1; }
  }
};
copy(site, dist);

// 3. say plainly whether the result is what it should be
const must = ['index.html', 'app/index.html', 'robots.txt', 'sitemap.xml', '404.html',
  'pvc-modular-kitchen-ahmedabad.html', 'assets', 'icon-192.png', 'manifest.json', 'sw.js'];
const missing = must.filter((f) => !fs.existsSync(path.join(dist, f)));
if (missing.length) fail('missing from dist after assembly: ' + missing.join(', '));

const app = fs.readFileSync(path.join(dist, 'app', 'index.html'), 'utf8');
if (!/assets\/index-.*\.js/.test(app)) fail('dist/app/index.html does not reference the app bundle');
const home = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (/assets\/index-.*\.js/.test(home)) fail('dist/index.html is the app, not the website');

// Not every html here is a room: index is the home page, 404 is the
// not-found page, and privacy comes from the app's public folder. This
// said twelve when there were eleven rooms, which is the sort of number
// you stop reading.
const notRooms = new Set(['index.html', '404.html', 'privacy.html']);
const rooms = fs.readdirSync(dist).filter((f) => f.endsWith('.html') && !notRooms.has(f)).length;
console.log('assemble-site: app at /app, website at /, ' + rooms + ' room pages, ' + files + ' files copied');
