// The preview card WhatsApp draws when one of our links is shared.
//
// Every message pointed at /app, so a visit reminder, an estimate and
// a photos update all previewed identically: the round app icon on
// white, under the website's SEO title, with an address that has
// since changed. The owner saw it and said it did not look
// professional. He was right, and the worse half is that the card
// never matched the message it was attached to.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const build = readFileSync(new URL('../tools/assemble-site.mjs', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('sharePages');

// Pulled from the build's own table so the test cannot disagree with
// it about which pages exist.
const slugs = [...build.matchAll(/\{ slug: '([a-z]+)', img: '([a-z-]+)'/g)].map((m) => ({ slug: m[1], img: m[2] }));

t('there is a share page for every kind of message', () => {
  assert.ok(slugs.length >= 5, 'the share table has shrunk - found ' + slugs.length);
  const names = slugs.map((s) => s.slug);
  for (const must of ['visit', 'estimate', 'work', 'designs', 'app']) {
    assert.ok(names.includes(must), 'no share page for: ' + must);
  }
});

t('every page has its own banner image on disk', () => {
  // A missing banner is not a build error - WhatsApp just shows a
  // blank card, which is the problem this was meant to fix.
  for (const s of slugs) {
    const f = new URL('../public/og/' + s.img + '.jpg', import.meta.url);
    assert.ok(existsSync(f), 'banner missing: public/og/' + s.img + '.jpg');
  }
});

t('no two pages share a title, a description or a banner', () => {
  // The entire point. Identical cards are what it looked like before.
  for (const key of ['title', 'desc', 'img']) {
    const re = new RegExp(key + ": '([^']+)'", 'g');
    const values = [...build.matchAll(re)].map((m) => m[1]);
    assert.ok(values.length >= 5, 'cannot find the ' + key + ' list');
    assert.equal(new Set(values).size, values.length, 'two share pages have the same ' + key);
  }
});

t('the card is a wide image, not a thumbnail', () => {
  assert.ok(/twitter:card" content="summary_large_image/.test(build),
    'the preview falls back to a small square thumbnail');
  assert.ok(/og:image:width" content="1200"/.test(build) && /og:image:height" content="630"/.test(build),
    'the image dimensions are gone - some clients then skip the image');
  assert.ok(/og:image" content="' \+ HOST \+/.test(build),
    'the image URL is relative - a preview fetcher cannot resolve it');
});

t('a reader always gets into the app, even without JavaScript', () => {
  assert.ok(/location\.replace\(/.test(build), 'the redirect is gone');
  assert.ok(/http-equiv="refresh"/.test(build), 'no fallback for JavaScript being off');
  assert.ok(/Yahan dabayein/.test(build), 'no visible link if both fail - the share link would dead-end');
});

t('these pages stay out of Google', () => {
  // They exist to be shared, not found. Indexed, they would put five
  // thin pages in front of the real ones.
  assert.ok(/name="robots" content="noindex/.test(build), 'the share pages are indexable');
});

t('the app links to them, and never to a page that was not generated', () => {
  assert.ok(/'\/go\/' \+ slug/.test(app), 'appLink no longer points at the share pages');
  const m = app.match(/export const SHARE_INTENTS = \[([^\]]+)\]/);
  assert.ok(m, 'the known-intent list is gone');
  const known = m[1].split(',').map((x) => x.trim().replace(/'/g, '')).filter(Boolean);
  for (const k of known) {
    assert.ok(slugs.some((s) => s.slug === k), 'appLink can build /go/' + k + ' but the build makes no such page');
  }
  assert.ok(/SHARE_INTENTS\.includes\(intent\) \? intent : 'app'/.test(app),
    'an unknown intent no longer falls back - it would build a link to a 404');
});

t('every message in the app has a card that was actually built', () => {
  // This is the check that matters, and the one that was missing.
  // The payment message went out carrying waSignOff('estimate'), so a
  // customer being asked for money saw a card that said "aapka
  // estimate taiyaar hai". Nothing was broken - the intent was simply
  // the wrong word, and nothing anywhere compared the two lists.
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  const used = new Set();
  for (const src of [app, admin]) {
    for (const m of src.matchAll(/waSignOff(?:Lines)?\('([a-z]+)'\)/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 4, 'cannot find the sign-off calls any more - found ' + used.size);
  const built = new Set(slugs.map((s) => s.slug));
  for (const intent of used) {
    assert.ok(built.has(intent),
      'a message uses waSignOff(\'' + intent + '\') but no /go/' + intent + ' page is built - '
      + 'that message will preview with the general card or none at all');
  }
});

t('no message is sent under an intent that means something else', () => {
  // The specific one he caught. Pinned by name because "it links to
  // the estimate page" is invisible in the code and only shows up in
  // WhatsApp, on the customer's phone, after it has been sent.
  const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
  const payment = admin.slice(admin.indexOf('Payment due hai'), admin.indexOf('Payment due hai') + 400);
  assert.ok(/waSignOff\('payment'\)/.test(payment),
    'the payment message is signed off with another intent again - the customer sees the wrong card');
});

console.log(n + ' assertions passed\n');
