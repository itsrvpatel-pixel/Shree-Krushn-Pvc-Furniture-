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

/* 2b. the reviews, from the app's own published list.

   The website used to carry four reviews typed into site/index.html by
   hand. The app had seventeen. Nobody had done anything wrong - the
   copy was made once and customers kept leaving reviews - and that gap
   only ever grows. The app is where a review is written and where
   admin marks it as one worth showing, so the app is the source and
   the website reads from it.

   Fetched at build time, not in the visitor's browser. Three reasons:
   the website ships no Firebase and should not start; the Firestore
   rules want a signed-in caller, which a public page is not; and a
   review baked into the HTML is a review Google can read, which is the
   entire point of putting them on a marketing site.

   A build that cannot reach Firestore falls back to site/reviews.json,
   the last snapshot committed to the repo. A deploy must never quietly
   ship a site with no reviews on it because a network call blinked.
*/
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const REVIEWS_DOC = 'https://firestore.googleapis.com/v1/projects/shree-krushn-pvc-furniture'
  + '/databases/(default)/documents/app_data/featured_reviews';
const ARCHIVED_DOC = 'https://firestore.googleapis.com/v1/projects/shree-krushn-pvc-furniture'
  + '/databases/(default)/documents/app_data/archived_reviews';

function parseReviewsDoc(body) {
  const raw = body && body.fields && body.fields.value && body.fields.value.stringValue;
  const list = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(list) || list.length === 0) throw new Error('empty list');
  return list;
}

// The archive is legitimately empty most of the time, so "empty" must
// not read as "broken" there the way it does for the live list.
function parseReviewsDocAllowEmpty(body) {
  try { return parseReviewsDoc(body); } catch (e) { return []; }
}

// No sign-in. featured_reviews is on the public list in the per-customer
// Firestore rules - the same list the app reads before anybody logs in -
// so the build can just ask for it.
//
// It used to mint an anonymous token first. Anonymous sign-in is now
// turned off (it was the way anyone on the internet could read every
// customer record), so that call returns 400 and every build quietly
// fell back to the committed snapshot: the site still had seventeen
// reviews and would have had seventeen forever, with no error anywhere
// that said so. The fallback working is exactly what made it invisible.
// Reviews whose customer record has since been deleted. They are kept
// in their own document precisely so the testimonial outlives the job,
// and the app has always shown them alongside the live ones - the
// website never did, which is why the site said 17 while the app said
// more. Missing it was the gap in "apps vala badha review website ma
// pan dekhava joi".
//
// Soft: a site with the live reviews and not the archived ones is worth
// shipping. A build that dies because this one document moved is not.
async function archivedReviews() {
  try {
    const res = await fetch(ARCHIVED_DOC);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error('read ' + res.status);
    return parseReviewsDocAllowEmpty(await res.json());
  } catch (e) {
    console.log('assemble-site: archived reviews unavailable (' + e.message + '), live ones only');
    return [];
  }
}

async function liveReviews() {
  const res = await fetch(REVIEWS_DOC);
  if (!res.ok) throw new Error('read ' + res.status);
  const live = parseReviewsDoc(await res.json());
  const archived = await archivedReviews();
  // Deduplicated the same way the app does it, by name + text + date.
  // The two lists are meant to be mutually exclusive - a review only
  // moves to the archive once its job is gone - but a delete that was
  // interrupted partway could leave one in both, and a testimonial
  // repeating itself on the home page looks like a fake review.
  const all = live.concat(archived);
  return all.filter((r, i) => all.findIndex((o) =>
    o.customerName === r.customerName && o.text === r.text && o.date === r.date) === i);
}

let reviews;
try {
  reviews = await liveReviews();
  console.log('assemble-site: ' + reviews.length + ' reviews read from the app');
} catch (e) {
  reviews = JSON.parse(fs.readFileSync(path.join(site, 'reviews.json'), 'utf8'));
  console.log('assemble-site: live reviews unavailable (' + e.message + '), using the committed snapshot of ' + reviews.length);
}

reviews = reviews
  .filter((r) => r && r.customerName && r.text && Number(r.rating) > 0)
  .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

const stars = (n) => '&#9733;'.repeat(Math.max(1, Math.min(5, Math.round(Number(n) || 5))));
const figure = (r) =>
  '<figure><div class="st">' + stars(r.rating) + '</div><blockquote>'
  + esc(r.text).replace(/\r?\n/g, '<br>')
  + '</blockquote><figcaption>' + esc(r.customerName) + '</figcaption></figure>';

// Seventeen reviews in one phone column ran to four screens, which
// buried the "book a free visit" button underneath them. Six are
// open; the rest sit in a <details>, so they are still in the HTML
// for Google to read and one tap away for a person, without pushing
// the thing the page is actually for off the bottom. Six, not eight,
// on the owner's instruction: "5 to 6 bahar dikhao fir jyada dekhna
// ho to option do to bada bada jyada na lage."
//
// Count alone did not do it. One customer wrote three paragraphs -
// 849 characters, 628px on a phone, taller than the other five put
// together, and on a desktop it filled a whole masonry column and
// left the third one empty. So the six out front are the six newest
// SHORT ones, and the long ones go in with the rest. Nothing is
// clipped and nobody's words are cut - every review is still on the
// page in full, this only decides which six sit outside the fold.
// If there are not six short ones, long ones fill the gap rather
// than the row coming up short.
const SHOWN = 6;
const LONG = 400;
const short = reviews.filter((r) => r.text.length <= LONG);
const first = short.slice(0, SHOWN);
if (first.length < SHOWN) {
  for (const r of reviews) {
    if (first.length >= SHOWN) break;
    if (!first.includes(r)) first.push(r);
  }
}
const rest = reviews.filter((r) => !first.includes(r));
// Where these came from, said out loud. A stranger landing here has
// no reason to believe seventeen five-star rows, and the honest
// answer is a strong one: the app will not accept a review from
// anyone but the customer whose job it is, and not until that job is
// delivered or paid (ReviewPanel), and this list is derived from
// those reviews alone - nobody, the owner included, can type one in.
// Emitted here rather than sitting in the page, so the claim cannot
// end up on a page with no reviews under it.
const note = '<div class="revnote">'
  + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#17803F" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1'
  + 'c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'
  + '<path d="m9 12 2 2 4-4"/></svg>'
  + '<span>Every review here is from one of our own customers, written after their work was finished.</span>'
  + '</div>';

const figures = note + '<div class="revs">' + first.map(figure).join('') + '</div>'
  + (rest.length
    ? '<details class="more-revs"><summary>' + rest.length + ' more reviews</summary>'
      + '<div class="revs">' + rest.map(figure).join('') + '</div></details>'
    : '');

// Structured data to match what is on the page, so Google can show the
// stars. Only ever what a visitor can actually see - marking up reviews
// that are not on the page is what gets a site penalised.
const avg = reviews.reduce((a, r) => a + Number(r.rating), 0) / (reviews.length || 1);
const ld = {
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: avg.toFixed(1),
    reviewCount: reviews.length,
    bestRating: 5,
  },
  review: reviews.map((r) => ({
    '@type': 'Review',
    author: { '@type': 'Person', name: r.customerName },
    reviewRating: { '@type': 'Rating', ratingValue: Number(r.rating), bestRating: 5 },
    reviewBody: r.text,
    ...(r.date ? { datePublished: String(r.date).slice(0, 10) } : {}),
  })),
};

{
  const file = path.join(dist, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('<!--REVIEWS-->')) fail('site/index.html has no <!--REVIEWS--> placeholder');
  html = html.replace('<!--REVIEWS-->', figures);

  // Fold the ratings into the business record already on the page
  // rather than adding a second, competing one.
  const marker = ', "priceRange"';
  if (!html.includes(marker)) fail('the business JSON-LD on the home page has changed shape');
  html = html.replace(marker, ', "aggregateRating": ' + JSON.stringify(ld.aggregateRating)
    + ', "review": ' + JSON.stringify(ld.review) + marker);

  fs.writeFileSync(file, html);
  console.log('assemble-site: ' + reviews.length + ' reviews on the home page, average ' + avg.toFixed(1));
}

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
