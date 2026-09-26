// Typing in the estimate must not write to Firestore on every letter.
//
// Four fields used to be wired straight to onSave, so each keystroke
// rebuilt the job, re-rendered the whole admin tree and wrote the job
// document. Typing "Flat 402 A" produced ten writes - "F", "Fl", "Fla",
// ... - which is what made typing stutter. This pins that down, and
// pins down the thing that matters more: nothing typed may be lost,
// including a half-typed word when the tab changes.
//
// HOW TO RUN
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/typing-debounce.test.mjs
//
// Exits non-zero on any failure.

import { createRequire } from 'module';
const require=createRequire('/home/user/Shree-Krushn-Pvc-Furniture-/package.json');
const { chromium } = require('playwright');
const now=new Date().toISOString();
const JOB={id:'j1',customerId:'c1',customerName:'Ramesh Patel',phone:'9876543210',address:'Surat',status:'estimate',
  requirements:[],items:[{id:'i1',desc:'Cabinet',length:'145',height:'112',qty:'1',rate:'1200'}],
  payments:[],extraWork:[],progressPhotos:[],activity:[],createdAt:now};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:420,height:900},serviceWorkers:'block'});
await ctx.addInitScript(([now,JOB])=>{
  window.__writes=[];
  const mem={ jobs:JSON.stringify([JOB]), customers:JSON.stringify([{id:'c1',name:'Ramesh Patel',phone:'9876543210',createdAt:now}]),
    expenses:'[]', staff:'[]', notifications:'[]', admin_pin:'7777', categories:'["Kitchen"]',
    gallery_categories:'["Kitchen"]', gallery_cat_Kitchen:'[]' };
  const storage={get:async k=>(k in mem?{key:k,value:mem[k]}:null),
    getStatus:async k=>(k in mem?{ok:true,missing:false,value:mem[k]}:{ok:true,missing:true,value:null}),
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}},delete:async k=>({key:k,deleted:true}),
    listAllKeys:async()=>Object.keys(mem)};
  Object.defineProperty(storage,'subscribe',{get:()=>((k,cb)=>{Promise.resolve().then(()=>cb(mem[k]??null));return()=>{}}),set:()=>{},configurable:false});
  const mk=(lk,idOf,tag)=>{const col=new Map();
    const loadLegacy=async()=>{const r=mem[lk];return r?JSON.parse(r):[]};
    return {loadLegacy,loadAll:async()=>{const a=[...col.values()];return a.length?a:await loadLegacy()},
      getOne:async id=>col.get(String(id))||null,migrateLegacyIfNeeded:async()=>({migrated:0,skipped:0,reason:'nothing-to-migrate'}),
      subscribe:cb=>{Promise.resolve().then(async()=>{const a=[...col.values()];cb(a.length?a:await loadLegacy())});return()=>{}},
      saveDiff:async n=>{ if(tag==='jobs'){ const j=(n||[])[0]||{}; window.__writes.push(j.flatNo===undefined?'(none)':String(j.flatNo)); }
        (n||[]).forEach(r=>col.set(String(idOf(r)),r)); return{writes:1,deletes:0}; }};};
  const v={storage,jobsStore:mk('jobs',j=>j.id,'jobs'),customersStore:mk('customers',c=>c.phone,'cust'),
    appAuth:{ensureSignedIn:async()=>({ok:true,uid:'a',anonymous:true})},
    staffAuth:{login:async()=>({unconfigured:true}),signOut:async()=>{},changePin:async()=>({unconfigured:true})},
    phoneAuth:{sendOtp:async()=>({}),verifyOtp:async()=>({uid:'p'})},
    fileStorage:{upload:async(k,d)=>({url:d}),delete:async()=>({deleted:true})},
    pushMessaging:{requestPermissionAndGetToken:async()=>null,onForegroundMessage:()=>{},sendPush:async()=>null},
    dataCheck:{probe:async()=>({projectId:'x',online:true,auth:{ok:true}})}};
  for(const [k,val] of Object.entries(v)) Object.defineProperty(window,k,{get:()=>val,set:()=>{},configurable:false});
},[now,JOB]);
const page=await ctx.newPage();
const crashes=[]; page.on('pageerror',e=>crashes.push(e.message.split('\n')[0]));
await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.getByText('Admin',{exact:false}).first().click({timeout:25000});
await page.locator('input').first().fill('7777');
await page.getByRole('button',{name:/enter admin|check kar/i}).first().click();
await page.waitForTimeout(3000);
await page.getByText('Ramesh Patel',{exact:false}).first().click({timeout:10000});
await page.waitForTimeout(1200);
await page.getByText('Estimate',{exact:true}).first().click({timeout:8000});
await page.waitForTimeout(1200);

const flat = page.getByPlaceholder('Jaise Flat 402, Sun City');
await flat.click();
await page.evaluate(()=>{window.__writes=[];});
const text='Flat 402';
for(const ch of text){ await page.keyboard.type(ch); await page.waitForTimeout(90); }
const duringTyping = await page.evaluate(()=>window.__writes.length);
await page.waitForTimeout(1200);           // let the debounce settle
const afterPause = await page.evaluate(()=>window.__writes.slice());
const shownAfterTyping = await flat.inputValue();

// Switch tabs mid-word: the unmount flush must not lose it.
await flat.click();
await page.keyboard.type(' A');
await page.getByText('Payment',{exact:true}).first().click({timeout:8000});
await page.waitForTimeout(600);
await page.getByText('Estimate',{exact:true}).first().click({timeout:8000});
await page.waitForTimeout(900);
const afterTabSwitch = await page.getByPlaceholder('Jaise Flat 402, Sun City').inputValue();
const allWrites = await page.evaluate(()=>window.__writes.slice());

console.log('\n===== TYPING IN THE ESTIMATE =====');
console.log('typed              :', JSON.stringify(text), '(' + text.length + ' letters)');
console.log('writes WHILE typing:', duringTyping);
console.log('writes after pause :', afterPause.length, '->', JSON.stringify(afterPause));
console.log('field shows        :', JSON.stringify(shownAfterTyping));
console.log('after tab switch   :', JSON.stringify(afterTabSwitch));
console.log('all writes         :', JSON.stringify(allWrites));
console.log('crashes            :', crashes.length?crashes[0]:'none');
console.log('\n--- verdict ---');
console.log('no write per keystroke :', duringTyping < text.length ? 'PASS ('+duringTyping+' < '+text.length+')' : 'FAIL');
console.log('value kept on screen   :', shownAfterTyping===text ? 'PASS' : 'FAIL got '+JSON.stringify(shownAfterTyping));
console.log('saved exactly once     :', afterPause.length===1 && afterPause[0]===text ? 'PASS' : 'CHECK '+JSON.stringify(afterPause));
console.log('nothing lost on switch :', afterTabSwitch===text+' A' ? 'PASS' : 'FAIL got '+JSON.stringify(afterTabSwitch));
await browser.close();

const failed = [
  duringTyping >= text.length,
  shownAfterTyping !== text,
  !(afterPause.length === 1 && afterPause[0] === text),
  afterTabSwitch !== text + ' A',
  crashes.length > 0,
].filter(Boolean).length;
console.log('\n' + (5 - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
