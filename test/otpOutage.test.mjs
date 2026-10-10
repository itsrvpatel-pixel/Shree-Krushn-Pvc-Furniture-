// Finding out that nobody can log in.
//
// The Firebase bill here is paid from a prepaid balance, because an
// Indian card that cannot do international payments cannot hold an
// RBI auto-debit mandate. A prepaid balance runs out.
//
// What that looks like is the problem. Phone Auth stops first. The
// owner's own app keeps working perfectly, because he logged in months
// ago and the session never expires. Every NEW customer gets an error
// code they did not ask to debug, and leaves. Nothing on his side
// changes at all, and the first he hears of it is never.
//
// So the customer's phone reports it from inside the failure. The
// whole value of that depends on telling an outage apart from a
// mistyped number: a warning that fires for an ordinary typo is a
// warning that is ignored on the day it is real.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  otpFailureClass, otpOutageMessage, shouldRaiseOutage,
  OTP_OUTAGE_CODES, OUTAGE_ALERT_GAP_MS,
} from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/firebaseStorage.js', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-10T12:00:00Z');

console.log('otpOutage');

t('a lapsed balance is an outage', () => {
  assert.equal(otpFailureClass('auth/billing-not-enabled'), 'outage');
  assert.equal(otpFailureClass('auth/quota-exceeded'), 'outage');
});

t('a misconfigured project is an outage too - nobody can get in either way', () => {
  for (const code of ['auth/invalid-api-key', 'auth/app-not-authorized',
    'auth/invalid-app-credential', 'auth/operation-not-allowed']) {
    assert.equal(otpFailureClass(code), 'outage', code);
  }
});

t('one person getting it wrong is not an outage', () => {
  // These are the common ones, and every one of them would make the
  // alert worthless if it fired.
  for (const code of ['auth/invalid-phone-number', 'auth/too-many-requests',
    'auth/missing-phone-number', 'auth/code-expired', 'auth/invalid-verification-code']) {
    assert.equal(otpFailureClass(code), 'user', code);
  }
});

t('an unknown code is not treated as an outage', () => {
  // Erring towards silence: a code nobody has seen before is more
  // likely one person's odd phone than the whole project being down,
  // and a false alarm costs the alert its credibility.
  for (const junk of ['', null, undefined, 'something-new', 123]) {
    assert.notEqual(otpFailureClass(junk), 'outage', String(junk));
  }
  assert.equal(otpFailureClass(''), 'unknown');
  assert.equal(otpFailureClass('something-new'), 'user');
});

t('the outage list has not quietly emptied', () => {
  assert.ok(OTP_OUTAGE_CODES.length >= 5, 'only ' + OTP_OUTAGE_CODES.length + ' codes would ever alert');
  assert.ok(OTP_OUTAGE_CODES.includes('auth/billing-not-enabled'),
    'the one this was written for is gone from the list');
});

t('the message says what to do, not just what broke', () => {
  const billing = otpOutageMessage('auth/billing-not-enabled');
  assert.match(billing, /balance/i, 'it does not name the likely cause');
  assert.match(billing, /top it up/i, 'it does not say what to do about it');
  // And it never leaves him thinking data is gone.
  const other = otpOutageMessage('auth/invalid-api-key');
  assert.match(other, /Nothing is lost/i);
  assert.match(other, /auth\/invalid-api-key/, 'the code is hidden, so it cannot be reported');
});

t('one alert an hour from any one phone', () => {
  assert.equal(OUTAGE_ALERT_GAP_MS, 60 * 60 * 1000);
  assert.equal(shouldRaiseOutage(null, NOW), true, 'the first one must get through');
  assert.equal(shouldRaiseOutage(NOW - 60000, NOW), false);
  assert.equal(shouldRaiseOutage(NOW - OUTAGE_ALERT_GAP_MS, NOW), true);
  for (const junk of ['', 'rubbish', 0, -5, NaN]) {
    assert.equal(shouldRaiseOutage(junk, NOW), true, 'an unreadable stamp must not silence it: ' + junk);
  }
});

t('a clock set forward cannot silence it for ever', () => {
  // Without this, one phone with a wrong date would stop alerting
  // until that date passed - which could be years.
  assert.equal(shouldRaiseOutage(NOW + 5 * 86400000, NOW), true);
});

t('only an outage raises it, from the real failure path', () => {
  const block = app.slice(app.indexOf("const code = (result && result.code) || 'unknown';"));
  const near = block.slice(0, 900);
  assert.ok(/otpFailureClass\(code\) === 'outage'/.test(near),
    'every OTP failure now alerts the owner, including typos');
  assert.ok(/window\.adminAlert\.outage\(code\)/.test(near), 'nothing is raised at all');
  assert.ok(/try \{ window\.adminAlert\.outage\(code\); \} catch/.test(near),
    'the alert can throw and take the error screen down with it');
  // The customer must still be told, whatever happens to the alert.
  assert.ok(/setError\(t\('Could not send the OTP/.test(near),
    'the customer-facing message was lost');
});

t('the alert both pushes and keeps a copy', () => {
  const fn = store.slice(store.indexOf('async function raiseOutageAlert('), store.indexOf('async function signOutStaff('));
  assert.ok(/shouldRaiseOutage\(last, Date\.now\(\)\)/.test(fn), 'the throttle is gone');
  assert.ok(/addStaffAlert\(/.test(fn), 'nothing is written to the bell, so a swiped notification is lost');
  assert.ok(/sendPushViaApi\(list,/.test(fn), 'no push is sent, so he finds out whenever he next looks');
  // Both wrapped: this runs while something is already broken.
  assert.ok((fn.match(/catch \(e\)/g) || []).length >= 3,
    'a failure inside the alert can make the customer screen worse');
  assert.ok(/window\.adminAlert = \{/.test(store), 'the app cannot reach it');
});

console.log(n + ' assertions passed\n');
