// The login screen must prove the number before it looks anybody up.
//
// It did not. "Register" with a number already on file logged you
// straight into that account with no OTP at all - type a customer's
// number, tap the wrong button, and you were inside their account
// reading their address and what they had paid. The check meant to
// stop a duplicate account was a way past the front door.
//
// The same change is what lets the per-customer Firestore rules be
// published: reading customers/<phone> while signed out is denied
// under them, so a lookup before the OTP would fail for everyone and
// nobody could log in at all.
//
// Both depend on one ordering rule: OTP first, lookup second. These
// pin that ordering to the source, because nothing else can - the
// failure is a flow, not a value, and it looks perfectly fine in a
// screenshot.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('otpBeforeLookup');

const slice = (from, to) => {
  const i = app.indexOf(from);
  assert.ok(i > 0, 'cannot find ' + from + ' - the login screen has been restructured');
  const j = app.indexOf(to, i);
  assert.ok(j > i, 'cannot find ' + to + ' after ' + from);
  return app.slice(i, j);
};

const sendOtp = slice('const sendOtp = async (forMode) => {', 'const verifyOtp = async () => {');
const verifyOtp = slice('const verifyOtp = async () => {', 'const resendOtp = async () => {');

t('nothing is read about the customer before the OTP is sent', () => {
  assert.ok(!/customersStore\.getOne/.test(sendOtp),
    'the customer lookup is back before the OTP - signed-out reads are denied '
    + 'under the per-customer rules, so this breaks login for everyone');
});

t('nobody is logged in before the OTP is verified', () => {
  // The actual hole. Any call at all into the app from this function
  // is one that happens on an unproven number.
  assert.ok(!/onCustomerLogin\(/.test(sendOtp),
    'sendOtp logs somebody in - that is an account takeover by typing a phone number');
  assert.ok(!/onRegister\(/.test(sendOtp), 'sendOtp registers somebody before the OTP');
});

t('the lookup happens after the OTP instead', () => {
  assert.ok(/customersStore\.getOne\(pendingPhone\)/.test(verifyOtp),
    'the lookup is gone from verifyOtp too - then nobody can ever log in');
  const i = verifyOtp.indexOf('verifyOtp(confirmation');
  const j = verifyOtp.indexOf('customersStore.getOne');
  assert.ok(i > 0 && j > i, 'the lookup runs before the OTP is confirmed');
});

t('a failed lookup is still not treated as "no such customer"', () => {
  // The old bug: one dropped signal and a registered customer was told
  // to register again, which is how a phone ended up with two accounts.
  assert.ok(/catch \(e\) \{[\s\S]{0,200}Could not reach the server/.test(verifyOtp),
    'a thrown lookup no longer reports a reachability problem');
  assert.ok(verifyOtp.indexOf('Could not reach the server')
    < verifyOtp.indexOf('Ye number register nahi hai'),
    'the unreachable case no longer comes before the genuinely-absent case');
});

t('an existing customer is let in whichever button they pressed', () => {
  assert.ok(/if \(found\) \{ onCustomerLogin\(found\); return; \}/.test(verifyOtp),
    'someone who taps Register with a number already on file is turned away or duplicated');
});

console.log(n + ' assertions passed\n');
