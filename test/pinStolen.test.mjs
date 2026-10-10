// What to do when somebody has the PIN.
//
// Asked plainly: "kabhi koi PIN se admin account chori karle to kya
// kare". Three questions hide in that, and before this only the first
// had an answer.
//
//   Can they get in?   Partly covered already - the PIN is checked on
//                      the server, its hash is unreadable by every
//                      client, and eight wrong tries locks that
//                      address out for fifteen minutes.
//   Would he know?     No. Nothing recorded that a login had happened
//                      at all, so a thief could work for weeks.
//   Can he throw them  No - and worse, it LOOKED as if he could.
//   out?               Changing the PIN blocked new logins and did
//                      nothing to a session already open. He would
//                      change it, believe it dealt with, and the
//                      thief would still be inside.
//
// That last one is the bug this file mostly exists for.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  uidFor, shouldAnnounceLogin, loginNotice, shouldWarnGuessing,
  ANNOUNCED_ROLES, GUESS_ALERT_AT,
} from '../api/_security.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const login = readFileSync(new URL('../api/staff-login.js', import.meta.url), 'utf8');
const changePin = readFileSync(new URL('../api/change-pin.js', import.meta.url), 'utf8');
const sec = readFileSync(new URL('../api/_security.js', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
// Code only. The comment in staff-login explains why there is NO
// global lockout, and a check that reads its own documentation as the
// thing it forbids is worse than no check.
const codeOnly = (src) => src.split('\n')
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');
const store = readFileSync(new URL('../src/firebaseStorage.js', import.meta.url), 'utf8');

console.log('pinStolen');

t('the uid used to revoke is the one the token was minted for', () => {
  // These live in two files. If they ever drift, revoking would
  // silently sign out a user that does not exist and report success,
  // which is the worst possible outcome: he would believe the thief
  // was out.
  assert.equal(uidFor('admin', null), 'role_admin');
  assert.equal(uidFor('partner', null), 'role_partner');
  assert.equal(uidFor('karigar', 'k7'), 'staff_k7');
  // staff-login builds it inline; the shapes must match exactly.
  assert.ok(/'staff_' \+ matched\.staffId/.test(login), 'the staff uid shape changed in staff-login');
  assert.ok(/'role_' \+ matched\.role/.test(login), 'the role uid shape changed in staff-login');
});

t('changing a PIN now ends the sessions already open', () => {
  // The whole point. Without this, changing the PIN is theatre.
  assert.ok(/revokeSessions\(app, who, staffId\)/.test(changePin),
    'a PIN change no longer signs out the sessions that used the old one');
  // After the write, so a revoke that fails cannot leave the PIN unchanged.
  const writeAt = changePin.indexOf("console.error('change-pin: write failed'");
  const revokeAt = changePin.indexOf('revokeSessions(app, who, staffId)');
  assert.ok(writeAt > 0 && revokeAt > writeAt, 'sessions are revoked before the new PIN is saved');
  // And never fatal - being unable to sign people out is not a reason
  // to refuse a new PIN.
  assert.ok(/revoke threw \(ignored\)/.test(changePin),
    'a failed revoke can now reject the PIN change itself');
});

t('a revoke for a login that never happened is not a failure', () => {
  // A partner who has never signed in has no uid yet. Treating that
  // as an error would make "log out all devices" report failure on a
  // perfectly healthy system.
  assert.ok(/user-not-found/.test(sec), 'a never-used login would report a revoke failure');
  assert.ok(/nothingToRevoke/.test(sec), 'there is no way to tell the two apart');
});

t('log out everywhere covers every login, including his own', () => {
  const block = changePin.slice(changePin.indexOf("action === 'signOutEverywhere'"));
  const body = block.slice(0, 1600);
  for (const role of ['admin', 'partner', 'dh_partner']) {
    assert.ok(body.includes("'" + role + "'"), role + ' is left signed in');
  }
  assert.ok(/readStaffPins\(db\)/.test(body), 'karigars are left signed in');
  // Half a sign-out is worse than none - he could not tell which
  // device was still in.
  assert.ok(/failed\.length > 0/.test(body), 'a partial failure is reported as success');
});

t('only an admin can end everyone sessions', () => {
  // The gate is shared with the PIN change, above this block.
  const gateAt = changePin.indexOf("claims.role !== 'admin'");
  const actionAt = changePin.indexOf("action === 'signOutEverywhere'");
  assert.ok(gateAt > 0 && actionAt > gateAt,
    'sign-out-everywhere sits above the admin check, so anyone signed in could call it');
});

t('a privileged login is announced; an ordinary one is not', () => {
  // A karigar signs in daily. A notification each time is noise, and
  // noise is how the one that matters gets swiped away unread.
  for (const role of ANNOUNCED_ROLES) assert.equal(shouldAnnounceLogin(role), true, role);
  for (const role of ['karigar', 'customer', '', null, undefined]) {
    assert.equal(shouldAnnounceLogin(role), false, String(role));
  }
  assert.ok(ANNOUNCED_ROLES.includes('admin'), 'the admin login is no longer announced');
});

t('the notice says what to do, not just what happened', () => {
  const notice = loginNotice('admin', null);
  assert.match(notice.title, /logged in/i);
  assert.match(notice.body, /not you/i, 'it does not tell him how to judge it');
  assert.match(notice.body, /change the PIN/i, 'it does not say what to do');
  assert.match(notice.body, /Log out all devices/i, 'it does not name the button that fixes it');
  // The name is included when there is one, so he can tell two
  // partners apart.
  assert.match(loginNotice('partner', 'Rishi').body, /Rishi/);
});

t('the login notice cannot cost anyone a login', () => {
  const block = login.slice(login.indexOf('if (shouldAnnounceLogin(matched.role))'));
  const near = block.slice(0, 400);
  assert.ok(/\.catch\(\(\) => \{\}\)/.test(near), 'a failed push would reject the login request');
  assert.ok(!/await tellAdmin/.test(near), 'the login now waits on a push before returning');
  // And it happens after the token exists, not before.
  assert.ok(login.indexOf('createCustomToken') < login.indexOf('shouldAnnounceLogin(matched.role)'),
    'the announcement runs before the login has actually succeeded');
});

t('guessing is reported once, not once per try', () => {
  assert.equal(GUESS_ALERT_AT, 5);
  for (const n2 of [0, 1, 4, 6, 7, 20]) assert.equal(shouldWarnGuessing(n2), false, String(n2));
  assert.equal(shouldWarnGuessing(5), true);
  for (const junk of [null, undefined, 'five', NaN, {}]) {
    assert.equal(shouldWarnGuessing(junk), false, String(junk));
  }
});

t('nobody can lock the owner out by guessing', () => {
  // A global lockout would stop a thief switching networks AND hand
  // anyone a way to shut the business out of its own app by typing
  // rubbish. A warning cannot be turned against him, so that is what
  // this does instead - and the per-address lockout stays.
  assert.ok(/callerKey\(req\)/.test(login), 'the per-address lockout is gone');
  assert.ok(!/global.*lock|lockAll|lockEveryone/i.test(codeOnly(login)),
    'a global lockout appeared - anyone can now lock the owner out');
  assert.ok(/Someone is trying PINs/.test(login), 'repeated guessing is no longer reported');
});

t('the button is on the Settings screen and ends with a real logout', () => {
  const card = admin.slice(admin.indexOf('If a PIN gets out'), admin.indexOf('<BackupPanel'));
  assert.ok(/window\.staffAuth\.signOutEverywhere\(\)/.test(card), 'the button does nothing');
  assert.ok(/window\.confirm\(/.test(card), 'it signs everyone out on a mis-tap');
  assert.ok(/onLogout\(\)/.test(card),
    'his own screen stays open after the session behind it was revoked');
  assert.ok(/does not change any PIN/.test(card),
    'the card no longer explains that this is not a PIN change');
  assert.ok(/signOutEverywhere: \(\) => signOutEverywhere\(\)/.test(store), 'the app cannot reach it');
});

console.log(n + ' assertions passed\n');
