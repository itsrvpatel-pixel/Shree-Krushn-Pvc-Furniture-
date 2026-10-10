// Sending the app to somebody who is not a customer yet.
//
// Asked directly: a customer comes to WhatsApp off an Instagram ad -
// how do you send them the app?
//
// Every share link in this project hangs off a job. That is right for
// a customer and useless for a stranger: there is no job to open, so
// the owner was retyping a link by hand or not sending one. And the
// messages all assume a job exists - "aapka estimate taiyaar hai"
// reads as a wrong number to someone who has never heard of us.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const banners = readFileSync(new URL('../tools/make-og-banners.mjs', import.meta.url), 'utf8');
const build = readFileSync(new URL('../tools/assemble-site.mjs', import.meta.url), 'utf8');
const strip = (s) => s.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('quickSend');

t('shared links carry the name people already know', () => {
  // A stranger off an ad has no reason to trust a domain they have
  // never seen. .com is what is on Google, Justdial and the van; the
  // /go/ pages are served identically on both, so old .site links
  // keep working.
  const m = /website: '([^']+)'/.exec(app);
  assert.ok(m, 'the business has no website set');
  assert.equal(m[1], 'www.shreekrushnpvcfurniture.com');
  assert.ok(/shreekrushnpvcfurniture\.com/.test(banners),
    'the WhatsApp banners still print the old domain');
  assert.ok(!/shreekrushnpvcfurniture\.site/.test(strip(banners)),
    'a banner still shows .site');
});

t('a stranger is greeted, not addressed as a customer', () => {
  const code = strip(app);
  assert.ok(/const WA_COLD = \{/.test(code), 'there is no opener for someone with no job');
  const block = code.slice(code.indexOf('const WA_COLD = {'), code.indexOf('export function waInviteText'));
  // Who we are and where, every time - this may be the first message
  // they have ever had from the business.
  for (const intent of ['designs:', 'book:', 'estimate:', 'app:']) {
    assert.ok(block.includes(intent), 'no opener for ' + intent);
  }
  assert.ok((block.match(/Shree Krushn PVC Furniture/g) || []).length >= 4,
    'an opener does not say who is messaging');
  assert.ok(/Nikol, Ahmedabad/.test(block), 'an opener does not say where we are');
});

t('the cold messages quote the rates the price page charges', () => {
  const code = strip(app);
  const block = code.slice(code.indexOf('const WA_COLD = {'), code.indexOf('export function waInviteText'));
  for (const m of block.matchAll(/Rs ([\d,]+)\/sq ft/g)) {
    assert.ok(['600', '1,000'].includes(m[1]),
      'quotes Rs ' + m[1] + '/sq ft, which is not a rate the price page lists');
  }
  // Plain Rs, not the glyph: it renders as a box in plenty of chat apps.
  assert.ok(!/₹/.test(block), 'the rupee glyph will not render reliably in WhatsApp');
});

t('every message still ends with a real share link', () => {
  const code = strip(app);
  assert.ok(/return \(WA_COLD\[intent\] \|\| WA_COLD\.app\) \+ waSignOff\(intent\)/.test(code),
    'the invite does not reuse the existing sign-off, so the link and banner could drift');
  // And the intents it offers must all be ones a /go/ page exists for.
  const offered = [...admin.matchAll(/\{ intent: '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(offered.length >= 3, 'the quick-send offers almost nothing');
  const built = [...build.matchAll(/\{ slug: '([a-z]+)'/g)].map((m) => m[1]);
  for (const i of offered) {
    assert.ok(built.includes(i) || i === 'app', 'offers "' + i + '" but no /go/ page is built for it');
  }
});

t('a number typed any way still reaches WhatsApp', () => {
  const screen = strip(admin).slice(strip(admin).indexOf('function AdminQuickSend('));
  assert.ok(/replace\(\/\\D\/g, ''\)/.test(screen), 'spaces and dashes break the number');
  assert.ok(/replace\(\/\^91\/, ''\)/.test(screen), 'a +91 prefix is not stripped');
  assert.ok(/digits\.length === 10/.test(screen), 'a half-typed number can be sent');
});

t('the send is blocked until the number is real', () => {
  const screen = strip(admin).slice(strip(admin).indexOf('function AdminQuickSend('));
  assert.ok(/pointerEvents: ready \? 'auto' : 'none'/.test(screen),
    'WhatsApp opens on an incomplete number');
  assert.ok(/10 digit number likhein/.test(screen), 'a bad number gives no reason');
});

t('the message is shown before it is sent, and can be copied', () => {
  const screen = strip(admin).slice(strip(admin).indexOf('function AdminQuickSend('));
  assert.ok(/waInviteText\(intent\)/.test(screen), 'the screen writes its own message');
  assert.ok(/whiteSpace: 'pre-wrap'/.test(screen), 'the preview collapses the line breaks it will send');
  // The owner is often already in the chat and only wants the text.
  assert.ok(/clipboard\.writeText/.test(screen), 'the message cannot be copied without a number');
});

t('it is reachable from Home', () => {
  assert.ok(/Naye number ko bhejein/.test(admin), 'there is no way in');
  assert.ok(/setShowQuickSend\(true\)/.test(admin), 'the tile does not open it');
  assert.ok(/useBackToClose\(showQuickSend/.test(admin), 'Android Back will close the whole app');
});

console.log(n + ' assertions passed');
