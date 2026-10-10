// Shared pieces for "somebody has the PIN".
//
// Asked directly: kabhi koi PIN se admin account chori karle to kya
// kare. Three separate questions hide inside that, and only the first
// one was answered before this file existed.
//
//   Can they get in?    Partly answered: the PIN is checked on the
//                       server, the hash is unreadable by any client,
//                       and eight wrong tries locks that address out
//                       for fifteen minutes.
//   Would he know?      No. Nothing anywhere said a login had
//                       happened, so a thief could work for weeks.
//   Can he throw them   No - and this is the dangerous one, because
//   out?                it looks like he can. Changing the PIN stopped
//                       new logins and did nothing at all to a session
//                       already open. He would change it, believe the
//                       matter closed, and the thief would still be
//                       inside.
//
// The last one is what this file is mostly for.

import admin from 'firebase-admin';

// The uid staff-login mints for each kind of login. Kept here because
// revoking a session means naming the same uid the token was made
// for, and those two must not drift apart in separate files.
export function uidFor(role, staffId) {
  return staffId ? ('staff_' + staffId) : ('role_' + role);
}

/* Throws out every session for one login, everywhere, at once.
 *
 * revokeRefreshTokens stops the refresh, which is what makes a
 * Firebase session last forever. An ID token already issued keeps
 * working until it expires, up to an hour, so this is not instant -
 * but it is the difference between a thief being out within the hour
 * and a thief who is never out at all. Our own endpoints check
 * revocation directly and refuse immediately.
 */
export async function revokeSessions(app, role, staffId) {
  const uid = uidFor(role, staffId);
  try {
    await admin.auth(app).revokeRefreshTokens(uid);
    return { ok: true, uid };
  } catch (e) {
    // A uid that has never signed in does not exist yet, which is not
    // a failure - there is simply nothing to revoke.
    const code = (e && e.code) || '';
    if (String(code).includes('user-not-found')) return { ok: true, uid, nothingToRevoke: true };
    console.error('revokeSessions failed for', uid, e);
    return { ok: false, uid, error: (e && e.message) || String(e) };
  }
}

// Admin devices, read the same way everywhere so one of these can
// never quietly stop matching the others.
export async function adminTokens(db) {
  try {
    const snap = await db.collection('app_data').doc('admin_push_tokens').get();
    if (!snap.exists) return [];
    const raw = JSON.parse(snap.data().value || '[]');
    if (!Array.isArray(raw)) return [];
    // Written as bare strings in some places and as { token } in
    // others. Accept both rather than silently sending to nobody.
    return raw
      .map((t) => (typeof t === 'string' ? t : (t && t.token)))
      .filter((t) => typeof t === 'string' && t.length > 0);
  } catch (e) {
    console.error('adminTokens read failed', e);
    return [];
  }
}

// Best effort, always. Every caller is doing something more important
// than this, and a push that fails must never take that with it.
export async function tellAdmin(app, db, title, body) {
  try {
    const tokens = await adminTokens(db);
    if (tokens.length === 0) return { ok: true, sent: 0 };
    await admin.messaging(app).sendEachForMulticast({ tokens, notification: { title, body } });
    return { ok: true, sent: tokens.length };
  } catch (e) {
    console.error('tellAdmin failed', e);
    return { ok: false };
  }
}

/* Which logins are worth telling him about.
 *
 * A karigar signing in is ordinary and happens daily; a notification
 * for each one would be noise, and noise is how the one that matters
 * gets swiped away unread. Admin and the two partner logins are the
 * ones that can see money, customers and settings, so those are the
 * ones that get announced.
 */
export const ANNOUNCED_ROLES = ['admin', 'partner', 'dh_partner'];

export function shouldAnnounceLogin(role) {
  return ANNOUNCED_ROLES.includes(String(role || ''));
}

export function loginNotice(role, staffName) {
  const who = role === 'admin' ? 'Admin'
    : (role === 'partner' ? 'Partner' : (role === 'dh_partner' ? 'DH Home Decor' : String(role || 'Someone')));
  const name = staffName ? (' (' + staffName + ')') : '';
  return {
    title: who + ' just logged in',
    body: who + name + ' signed in just now. If this was not you, change the PIN in Settings straight away'
      + ' and use "Log out all devices".',
  };
}

/* When wrong PINs stop looking like somebody forgetting.
 *
 * The lockout counts per address, so a thief changing networks can
 * keep trying. Rather than add a global lock - which would let anyone
 * lock the owner out of his own business by typing rubbish - the
 * answer is to say something. A warning cannot be weaponised.
 */
export const GUESS_ALERT_AT = 5;

export function shouldWarnGuessing(failures) {
  const n = Number(failures);
  if (!Number.isFinite(n)) return false;
  // Exactly at the threshold, so one burst of guessing sends one
  // warning rather than one per attempt from there on.
  return n === GUESS_ALERT_AT;
}
