// Tests the not_configured contract of api/staff-login.js.
//
// The client falls back to its old in-browser PIN check on 503, and NOT
// on 500. So every "the server was never set up" case has to answer 503
// or a half-configured deploy takes admin login down completely - which
// is exactly what a deploy with ADMIN_PIN set and FIREBASE_SERVICE_ACCOUNT
// missing would otherwise have done.
//
//   node test/staff-login.test.mjs

const handler = (await import('../api/staff-login.js')).default;

function fakeRes() {
  const r = { code: null, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}

const T = [];
const check = (name, pass, detail) => T.push([name, pass, detail]);

async function call(env, body) {
  const saved = { ...process.env };
  for (const k of ['ADMIN_PIN', 'FIREBASE_SERVICE_ACCOUNT']) delete process.env[k];
  Object.assign(process.env, env);
  const res = fakeRes();
  await handler({ method: 'POST', headers: {}, body }, res);
  process.env = saved;
  return res;
}

let r = await call({}, { pin: '1234' });
check('nothing configured -> 503 not_configured', r.code === 503 && r.body.error === 'not_configured', 'got ' + r.code);

r = await call({ ADMIN_PIN: '1234' }, { pin: '1234' });
check('ADMIN_PIN only (no service account) -> 503, NOT 500',
  r.code === 503 && r.body.error === 'not_configured',
  'got ' + r.code + ' ' + JSON.stringify(r.body));

r = await call({ FIREBASE_SERVICE_ACCOUNT: '{}' }, { pin: '1234' });
check('service account only (no ADMIN_PIN) -> 503', r.code === 503, 'got ' + r.code);

const res2 = fakeRes();
await handler({ method: 'GET', headers: {}, body: {} }, res2);
check('GET is rejected', res2.code === 405, 'got ' + res2.code);

// --- which PINs the server is able to match at all ---
//
// Every PIN the app accepts has to be reachable from the server, because
// the server is now the only thing that compares one. The partner PINs
// are managed inside the app and live in Firestore, so a source check
// stands in for a live Firestore run here: this is a static assertion
// that the lookup exists, which is what was missing when partner login
// broke.
const src = await (await import('node:fs/promises')).readFile(new URL('../api/staff-login.js', import.meta.url), 'utf8');
check('admin PIN comes from ADMIN_PIN', src.includes('process.env.ADMIN_PIN'), 'missing');
check('partner PIN is looked up in Firestore', src.includes("'partner_pin'"), 'no partner_pin lookup');
check('dh partner PIN is looked up in Firestore', src.includes("'dh_partner_pin'"), 'no dh_partner_pin lookup');
check('staff PINs are looked up in Firestore', src.includes("doc('staff')"), 'no staff lookup');
check('attempt counters are NOT in app_data', !src.includes("collection('app_data').doc(callerKey"), 'still in app_data');

console.log('\n===== api/staff-login =====');
T.forEach(([n, ok, d]) => console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (ok ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
