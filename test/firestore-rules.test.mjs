// Tests firestore.rules against the real Firestore rules engine.
//
// These rules took the live app down once, because they were written
// and published without ever being run. This exists so that cannot
// happen again: it checks both halves of what the rules have to do -
// the open internet gets nothing, and every read and write the app
// actually performs still works.
//
// HOW TO RUN (the tooling is deliberately not in package.json - it
// conflicts on peer deps and would slow every Vercel build):
//
//   npm install --no-save --legacy-peer-deps firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project rules-test \
//     "node test/firestore-rules.test.mjs"
//
// Needs Java (the Firestore emulator is a jar). Exits non-zero on any
// failure, so it can gate a rules change.

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Seed with rules disabled, the way real data already exists.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'app_data', 'categories'), { value: '["Kitchen"]' });
  await setDoc(doc(db, 'app_data', 'jobs'), { value: '[]' });
  await setDoc(doc(db, 'app_data', 'customers'), { value: '[]' });
  await setDoc(doc(db, 'app_data', 'gallery_cat_Kitchen'), { value: '[]' });
  await setDoc(doc(db, 'app_data', 'customer_notifications_9876543210'), { value: '[]' });
  await setDoc(doc(db, 'jobs', 'j1'), { job: { id: 'j1', phone: '9876543210' } });
  await setDoc(doc(db, 'customers', '9876543210'), { customer: { phone: '9876543210' } });
  await setDoc(doc(db, 'login_attempts', '1_2_3_4'), { failures: 3, last: 1 });
  await setDoc(doc(db, 'secrets', 'admin_pin'), { value: '7777' });
});

const anon = env.authenticatedContext('anon-uid').firestore();       // customer: anonymous
const staff = env.authenticatedContext('role_admin', { role: 'admin' }).firestore();
const out = env.unauthenticatedContext().firestore();                // the open internet

const T = [];
const t = async (name, fn) => { try { await fn(); T.push([name,'PASS']); } catch (e) { T.push([name,'FAIL: '+String(e).split('\n')[0].slice(0,90)]); } };

// --- the open internet must get nothing ---
await t('logged out CANNOT read app_data/customers', () => assertFails(getDoc(doc(out,'app_data','customers'))));
await t('logged out CANNOT read a job',               () => assertFails(getDoc(doc(out,'jobs','j1'))));
await t('logged out CANNOT read a customer',          () => assertFails(getDoc(doc(out,'customers','9876543210'))));
await t('logged out CANNOT list app_data',            () => assertFails(getDocs(collection(out,'app_data'))));
await t('logged out CANNOT write',                    () => assertFails(setDoc(doc(out,'app_data','categories'),{value:'x'})));

// --- everything the app actually does must keep working ---
await t('app (anon) reads categories',        () => assertSucceeds(getDoc(doc(anon,'app_data','categories'))));
await t('app (anon) reads gallery category',  () => assertSucceeds(getDoc(doc(anon,'app_data','gallery_cat_Kitchen'))));
await t('app (anon) reads own notifications', () => assertSucceeds(getDoc(doc(anon,'app_data','customer_notifications_9876543210'))));
await t('app (anon) LISTS app_data (gallery recovery)', () => assertSucceeds(getDocs(collection(anon,'app_data'))));
await t('app (anon) LISTS jobs collection',   () => assertSucceeds(getDocs(collection(anon,'jobs'))));
await t('app (anon) LISTS customers',         () => assertSucceeds(getDocs(collection(anon,'customers'))));
await t('app (anon) reads one job',           () => assertSucceeds(getDoc(doc(anon,'jobs','j1'))));
await t('app (anon) reads one customer',      () => assertSucceeds(getDoc(doc(anon,'customers','9876543210'))));
await t('app (anon) writes a job',            () => assertSucceeds(setDoc(doc(anon,'jobs','j2'),{job:{id:'j2'}})));
await t('app (anon) writes app_data',         () => assertSucceeds(setDoc(doc(anon,'app_data','categories'),{value:'["Kitchen","Bed"]'})));
await t('staff reads everything',             () => assertSucceeds(getDocs(collection(staff,'app_data'))));

// --- login attempt counters are off limits to every client ---
await t('anon CANNOT read login_attempts',  () => assertFails(getDoc(doc(anon,'login_attempts','1_2_3_4'))));
await t('anon CANNOT write login_attempts', () => assertFails(setDoc(doc(anon,'login_attempts','1_2_3_4'),{failures:0,last:0})));
await t('staff CANNOT read login_attempts', () => assertFails(getDoc(doc(staff,'login_attempts','1_2_3_4'))));
await t('logged out CANNOT read login_attempts', () => assertFails(getDoc(doc(out,'login_attempts','1_2_3_4'))));

// --- the role PINs must be unreadable by everyone, admins included ---
await t('logged out CANNOT read a PIN', () => assertFails(getDoc(doc(out,'secrets','admin_pin'))));
await t('anon CANNOT read a PIN',       () => assertFails(getDoc(doc(anon,'secrets','admin_pin'))));
await t('anon CANNOT list secrets',     () => assertFails(getDocs(collection(anon,'secrets'))));
await t('anon CANNOT overwrite a PIN',  () => assertFails(setDoc(doc(anon,'secrets','admin_pin'),{value:'0000'})));
await t('even staff CANNOT read a PIN', () => assertFails(getDoc(doc(staff,'secrets','admin_pin'))));
await t('even staff CANNOT write a PIN',() => assertFails(setDoc(doc(staff,'secrets','admin_pin'),{value:'0000'})));

// --- nothing else is reachable ---
await t('anon CANNOT touch an unknown collection', () => assertFails(setDoc(doc(anon,'random_stuff','x'),{a:1})));

console.log('\n===== FIRESTORE RULES =====');
T.forEach(([n,s])=>console.log((s.startsWith('PASS')?'PASS  ':'FAIL  ')+n+(s.startsWith('PASS')?'':'\n        '+s)));
const bad=T.filter(r=>!r[1].startsWith('PASS')).length;
console.log('\n'+(T.length-bad)+' passed, '+bad+' failed');
await env.cleanup();
process.exit(bad?1:0);
