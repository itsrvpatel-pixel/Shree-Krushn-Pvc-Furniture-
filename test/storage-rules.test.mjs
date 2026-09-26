// Tests storage.rules against the real Storage rules engine.
//
// The bucket is open today, and the hole that matters is WRITE: anyone
// can upload into it, on a plan that bills. These rules close that. The
// risk in closing it is the gallery - 4,300 photos - so both halves are
// checked here: nobody unauthenticated can put anything in, and every
// upload the app itself performs still goes through.
//
//   npm install --no-save --legacy-peer-deps firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only storage --project rules-test \
//     "node test/storage-rules.test.mjs"

import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'rules-test',
  storage: { rules: fs.readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const s = ctx.storage();
  await uploadBytes(ref(s, 'files/gallery_g1'), new Uint8Array([1, 2, 3]), { contentType: 'image/jpeg' });
});

const anon = env.authenticatedContext('anon-uid').storage();   // the app, signed in anonymously
const out = env.unauthenticatedContext().storage();            // the open internet

const png = new Uint8Array([1, 2, 3, 4]);
const T = [];
const t = async (name, fn) => { try { await fn(); T.push([name, 'PASS']); } catch (e) { T.push([name, 'FAIL: ' + String(e).split('\n')[0].slice(0, 90)]); } };

// The hole with a bill attached.
await t('logged out CANNOT upload', () => assertFails(uploadBytes(ref(out, 'files/evil'), png, { contentType: 'image/png' })));
await t('logged out CANNOT upload outside files/', () => assertFails(uploadBytes(ref(out, 'anywhere/evil'), png, { contentType: 'image/png' })));
await t('logged out CANNOT delete', () => assertFails(deleteObject(ref(out, 'files/gallery_g1'))));
await t('logged out CANNOT read through the SDK', () => assertFails(getBytes(ref(out, 'files/gallery_g1'))));

// Everything the app actually uploads.
await t('app uploads a gallery photo', () => assertSucceeds(uploadBytes(ref(anon, 'files/gallery_g9'), png, { contentType: 'image/jpeg' })));
await t('app uploads a thumbnail', () => assertSucceeds(uploadBytes(ref(anon, 'files/gallery_thumb_g9'), png, { contentType: 'image/png' })));
await t('app uploads a progress photo', () => assertSucceeds(uploadBytes(ref(anon, 'files/note_n1'), png, { contentType: 'image/webp' })));
await t('app uploads a brochure PDF', () => assertSucceeds(uploadBytes(ref(anon, 'files/brochure_b1'), png, { contentType: 'application/pdf' })));
await t('app overwrites an existing file', () => assertSucceeds(uploadBytes(ref(anon, 'files/gallery_g1'), png, { contentType: 'image/jpeg' })));
await t('app reads through the SDK', () => assertSucceeds(getBytes(ref(anon, 'files/gallery_g1'))));
await t('app deletes a file', () => assertSucceeds(deleteObject(ref(anon, 'files/gallery_g9'))));

// Abuse that a signed-in session should still not be able to do.
await t('signed in CANNOT upload a script', () => assertFails(uploadBytes(ref(anon, 'files/x.js'), png, { contentType: 'application/javascript' })));
await t('signed in CANNOT upload an executable', () => assertFails(uploadBytes(ref(anon, 'files/x.bin'), png, { contentType: 'application/octet-stream' })));
await t('signed in CANNOT write outside files/', () => assertFails(uploadBytes(ref(anon, 'other/x'), png, { contentType: 'image/png' })));

console.log('\n===== STORAGE RULES =====');
T.forEach(([n, s]) => console.log((s.startsWith('PASS') ? 'PASS  ' : 'FAIL  ') + n + (s.startsWith('PASS') ? '' : '\n        ' + s)));
const bad = T.filter((r) => !r[1].startsWith('PASS')).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
await env.cleanup();
process.exit(bad ? 1 : 0);
