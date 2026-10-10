// A crash in one screen must not blank the app.
//
// Every render bug in this app used to show as a white page with no
// message and no way back, because nothing caught it - React unmounts
// the whole tree when a render throws unhandled. This drives a REAL
// crash (a stored document that is valid JSON but the wrong shape, so
// .map throws mid-render) and checks what the person actually sees.
//
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/error-boundary.test.mjs

import { createRequire } from 'module';
const require=createRequire('/home/user/Shree-Krushn-Pvc-Furniture-/package.json');
const { chromium } = require('playwright');
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:420,height:900},serviceWorkers:'block'});
await ctx.addInitScript(()=>{
  const now=new Date().toISOString();
  const mem={ jobs:'[]', customers:'[]', expenses:'[]',
    // Valid JSON, wrong shape. staff.map(...) throws while Settings renders.
    staff:'{"not":"an array"}',
    notifications:'[]', admin_pin:'7777', categories:'["Kitchen"]',
    gallery_categories:'["Kitchen"]', gallery_cat_Kitchen:'[]' };
  const storage={get:async k=>(k in mem?{key:k,value:mem[k]}:null),
    getStatus:async k=>(k in mem?{ok:true,missing:false,value:mem[k]}:{ok:true,missing:true,value:null}),
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}},delete:async k=>({key:k,deleted:true}),
    listAllKeys:async()=>Object.keys(mem)};
  Object.defineProperty(storage,'subscribe',{get:()=>((k,cb)=>{Promise.resolve().then(()=>cb(mem[k]??null));return()=>{}}),set:()=>{},configurable:false});
  const mk=(lk,idOf)=>{const col=new Map();const loadLegacy=async()=>{const r=mem[lk];return r?JSON.parse(r):[]};
    return {loadLegacy,loadAll:async()=>{const a=[...col.values()];return a.length?a:await loadLegacy()},
      getOne:async()=>null,migrateLegacyIfNeeded:async()=>({migrated:0,skipped:0,reason:'nothing-to-migrate'}),
      subscribe:cb=>{Promise.resolve().then(async()=>cb(await loadLegacy()));return()=>{}},
      saveDiff:async n=>{(n||[]).forEach(r=>col.set(String(idOf(r)),r));return{writes:1,deletes:0}}};};
  const v={storage,jobsStore:mk('jobs',j=>j.id),customersStore:mk('customers',c=>c.phone),
    appAuth:{ensureSignedIn:async()=>({ok:true,uid:'a',anonymous:true})},
    staffAuth:{login:async()=>({unconfigured:true}),signOut:async()=>{},changePin:async()=>({unconfigured:true})},
    phoneAuth:{sendOtp:async()=>({}),verifyOtp:async()=>({uid:'p'})},
    fileStorage:{upload:async(k,d)=>({url:d}),delete:async()=>({deleted:true})},
    pushMessaging:{requestPermissionAndGetToken:async()=>null,onForegroundMessage:()=>{},sendPush:async()=>null},
    dataCheck:{probe:async()=>({projectId:'x',online:true,auth:{ok:true}})}};
  for(const [k,val] of Object.entries(v)) Object.defineProperty(window,k,{get:()=>val,set:()=>{},configurable:false});
});
const page=await ctx.newPage();
await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.getByText('Admin',{exact:false}).first().click({timeout:25000});
await page.locator('input').first().fill('7777');
await page.getByRole('button',{name:/enter admin|check kar/i}).first().click();
await page.waitForTimeout(3000);

const T=[]; const ok=(n,c,d)=>T.push([n,!!c,d||'']);
ok('app works before the crash', (await page.locator('#root').innerText()).includes('Admin Panel'), 'never logged in');

await page.getByText('Settings',{exact:true}).last().click({timeout:8000});
await page.waitForTimeout(1800);
const after=(await page.locator('#root').innerText()).trim();
ok('screen did NOT go blank', after.length > 40, 'len='+after.length);
ok('a human-readable message is shown', /Something went wrong/.test(after), after.slice(0,80));
ok('it says the data is safe', /data surakshit/.test(after), 'no reassurance');
// Whatever the crash was, its own message must be on screen - that is
// what turns "app kaam nahi kar raha" into something diagnosable. Checked
// by looking at what follows the invitation to send it, rather than by
// guessing which error it will be.
const reported = (after.split('bhej dijiye:')[1] || '').trim();
ok('the error text is shown for reporting', reported.length > 5, 'nothing after the prompt: '+JSON.stringify(reported));
ok('a way back is offered', /Go back/.test(after) && /Open the app again/.test(after), 'no recovery buttons');

const crash = await page.evaluate(()=>{ try { return JSON.parse(localStorage.getItem('skpf_last_crash')||'null'); } catch(e){ return null; } });
ok('the crash was recorded for Data Check', crash && crash.message && crash.scope, JSON.stringify(crash));

await page.getByText('Wapas jaayein',{exact:false}).first().click({timeout:5000});
await page.waitForTimeout(1800);
const recovered=(await page.locator('#root').innerText()).trim();
ok('"Go back" gets the app working again', recovered.includes('Admin Panel') && !/Something went wrong/.test(recovered), recovered.slice(0,70));
ok('it lands somewhere safe, not back on the broken screen', !/Change Admin PIN/.test(recovered), 'returned to the crashing screen');

console.log('\n===== ERROR BOUNDARY =====');
T.forEach(([n,p,d])=>console.log((p?'PASS  ':'FAIL  ')+n+(p?'':'   ['+d+']')));
const bad=T.filter(t=>!t[1]).length;
console.log('\n'+(T.length-bad)+' passed, '+bad+' failed');
await browser.close();
process.exit(bad?1:0);
