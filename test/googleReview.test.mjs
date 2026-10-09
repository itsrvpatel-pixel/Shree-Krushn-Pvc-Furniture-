// Asking a finished customer for a Google review.
//
// The app holds 37 reviews and Google counts none of them - they live
// in our own Firestore and are read back by our own website. The three
// shops sitting above this one in the local pack have twelve,
// twenty-six and thirty Google reviews between them, and nothing else
// much. Asking the same already-happy customers is the cheapest way
// past them.
//
// The link is a setting rather than a constant, because the Google
// profile behind it was rebuilt from three duplicates to one this
// week, and a link in the bundle would mean a deploy every time it
// moved. A setting pasted by hand from a phone is a setting that can
// be pasted wrong, so it is checked: a dead link in front of a happy
// customer is worse than no button at all.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeReviewLink, canAskForGoogleReview } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('googleReview');

t('the shapes Google actually hands out are all accepted', () => {
  for (const url of [
    'https://g.page/r/CXabc123DEF/review',
    'https://search.google.com/local/writereview?placeid=ChIJabc',
    'https://maps.app.goo.gl/abcDEF123',
    'https://www.google.com/maps/place/?q=place_id:ChIJabc',
    'https://g.co/kgs/abc123',
  ]) {
    assert.ok(normalizeReviewLink(url), 'rejected a real Google link: ' + url);
  }
});

t('a paste gone wrong gives no button rather than a dead one', () => {
  for (const bad of ['', '   ', null, undefined, 'g.page/r/x/review', 'not a url',
    'https://example.com/review', 'https://g-page.com/r/x', 'javascript:alert(1)',
    'http://evil.com/?x=google.com']) {
    assert.equal(normalizeReviewLink(bad), '', 'accepted something that is not a Google link: ' + String(bad));
  }
});

t('surrounding spaces from a phone paste are forgiven', () => {
  assert.equal(normalizeReviewLink('  https://g.page/r/x/review  '), 'https://g.page/r/x/review');
});

t('only a customer whose work is done is asked', () => {
  const link = 'https://g.page/r/x/review';
  assert.equal(canAskForGoogleReview({ status: 'delivered' }, link), true);
  assert.equal(canAskForGoogleReview({ status: 'paid' }, link), true);
  assert.equal(canAskForGoogleReview({ status: 'estimate' }, link), false);
  assert.equal(canAskForGoogleReview({ status: 'in_progress' }, link), false);
  // No link set means no button, however finished the job is.
  assert.equal(canAskForGoogleReview({ status: 'delivered' }, ''), false);
  assert.equal(canAskForGoogleReview({ status: 'delivered' }, 'https://example.com'), false);
});

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const code = (s) => s.split('\n').filter((l) => {
  const x = l.trim();
  return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*');
}).join('\n');

t('the link survives a restart instead of living in one browser', () => {
  const c = code(app);
  assert.ok(/safeGet\('google_review_link'\)/.test(c), 'the link is never loaded at startup');
  assert.ok(/storage\.set\('google_review_link'/.test(c), 'the link is never saved');
});

t('the owner can set it without a deploy', () => {
  const a = code(admin);
  assert.ok(/setGoogleReviewLink\(/.test(a), 'Settings cannot save the link');
  assert.ok(/Google review link/.test(a), 'there is no field to paste it into');
  assert.ok(/g\.page\/r\//.test(a), 'the field does not show what a link looks like');
});

t('the customer gets the row, gated the same way', () => {
  const c = code(app);
  assert.ok(/canAskForGoogleReview\(job, googleReviewLink\)/.test(c),
    'the row is not gated on both the link and the job being finished');
  assert.ok(/Google par bhi review dein/.test(c), 'there is no row');
  // Opened from the normalized value, never the raw setting.
  assert.ok(/normalizeReviewLink\(googleReviewLink\)/.test(c),
    'the row opens whatever string is stored, unchecked');
});

console.log(n + ' assertions passed');
