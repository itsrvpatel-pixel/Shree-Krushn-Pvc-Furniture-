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

console.log('\n===== api/staff-login =====');
T.forEach(([n, ok, d]) => console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (ok ? '' : '   [' + d + ']')));
const bad = T.filter((t) => !t[1]).length;
console.log('\n' + (T.length - bad) + ' passed, ' + bad + ' failed');
process.exit(bad ? 1 : 0);
