// The three features added on top of the audit: a payment reminder from
// the Due Payments list, a quotation number, and the free-service
// tracker for the 2-year maintenance warranty.
//
// Driven end to end rather than asserted on source, because what each
// one is worth depends on what actually reaches the screen and the
// WhatsApp message - a reminder without the figures in it, or a
// quotation number that never appears on the quotation, is no feature
// at all.
//
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/new-features.test.mjs

import { createRequire } from 'module';
const require=createRequire('/home/user/Shree-Krushn-Pvc-Furniture-/package.json');
const { chromium } = require('playwright');
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:420,height:900},serviceWorkers:'block'});
await ctx.addInitScript(()=>{
  const now=new Date().toISOString();
  const ago=(m)=>{const d=new Date();d.setMonth(d.getMonth()-m);return d.toISOString();};
  const jobs=[
    // owes money, work started
    {id:'j1',customerId:'c1',customerName:'Ramesh Patel',phone:'9876543210',status:'in_progress',
     items:[{id:'i1',desc:'Kitchen',length:'145',height:'112',qty:'1',rate:'1200'}],
     payments:[{id:'p1',amount:'25000',note:'Advance',date:now}],extraWork:[],progressPhotos:[],
     requirements:[],activity:[],estimateGivenAt:ago(2),createdAt:ago(3)},
    // delivered 8 months ago -> the 6-month service visit is overdue
    {id:'j2',customerId:'c2',customerName:'Suresh Shah',phone:'9998887777',status:'delivered',
     items:[{id:'i2',desc:'Wardrobe',length:'100',height:'90',qty:'1',rate:'1100'}],
     payments:[{id:'p2',amount:'68750',note:'Full',date:now}],extraWork:[],progressPhotos:[],
     requirements:[],activity:[],deliveredAt:ago(8),estimateGivenAt:ago(11),createdAt:ago(12)},
  ];
  const mem={ jobs:JSON.stringify(jobs),
    customers:JSON.stringify([{id:'c1',name:'Ramesh Patel',phone:'9876543210',createdAt:now},{id:'c2',name:'Suresh Shah',phone:'9998887777',createdAt:now}]),
    expenses:'[]', staff:'[]', notifications:'[]', admin_pin:'7777', categories:'["Kitchen"]',
    gallery_categories:'["Kitchen"]', gallery_cat_Kitchen:'[]' };
  const storage={get:async k=>(k in mem?{key:k,value:mem[k]}:null),
    getStatus:async k=>(k in mem?{ok:true,missing:false,value:mem[k]}:{ok:true,missing:true,value:null}),
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}},delete:async k=>({key:k,deleted:true}),listAllKeys:async()=>Object.keys(mem)};
  Object.defineProperty(storage,'subscribe',{get:()=>((k,cb)=>{Promise.resolve().then(()=>cb(mem[k]??null));return()=>{}}),set:()=>{},configurable:false});
  const mk=(lk,idOf)=>{const col=new Map();const loadLegacy=async()=>{const r=mem[lk];return r?JSON.parse(r):[]};
    return {loadLegacy,loadAll:async()=>{const a=[...col.values()];return a.length?a:await loadLegacy()},
      getOne:async()=>null,migrateLegacyIfNeeded:async()=>({migrated:0,skipped:0,reason:'nothing-to-migrate'}),
      subscribe:cb=>{Promise.resolve().then(async()=>{const a=[...col.values()];cb(a.length?a:await loadLegacy())});return()=>{}},
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
const crashes=[]; page.on('pageerror',e=>crashes.push(e.message.split('\n')[0]));
const T=[]; const ok=(n,c,d)=>T.push([n,!!c,d||'']);
const decode=(u)=>{try{return decodeURIComponent((u.split('?text=')[1]||''));}catch(e){return '';}};

await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.getByText('Admin',{exact:false}).first().click({timeout:25000});
await page.locator('input').first().fill('7777');
await page.getByRole('button',{name:/enter admin|check kar/i}).first().click();
await page.waitForTimeout(3500);
const home=await page.locator('#root').innerText();

// ---- #4 service due ----
ok('Home warns about the due service visit', /free service visit due hai/.test(home), home.slice(0,200));
await page.getByText('Service Due',{exact:false}).first().click({timeout:6000});
await page.waitForTimeout(1500);
const sd=await page.locator('#root').innerText();
ok('the service screen names the customer', /Suresh Shah/.test(sd), sd.slice(0,200));
ok('it says which visit', /6 mahine ka visit/.test(sd), sd.slice(0,220));
ok('it says how overdue', /din ho gaye/.test(sd), sd.slice(0,260));
const offer=await page.locator('a[href*="wa.me"]').first().getAttribute('href');
ok('the WhatsApp offer mentions the free visit', /free service visit due hai/.test(decode(offer)), decode(offer).slice(0,120));
await page.getByText('Ho gaya',{exact:false}).first().click({timeout:5000});
await page.waitForTimeout(1500);
const after=await page.locator('#root').innerText();
ok('marking it done clears it from the list', !/6 mahine ka visit/.test(after), after.slice(0,200));

// ---- #1 payment reminder ----
await page.getByText('Home',{exact:true}).first().click({timeout:6000}); await page.waitForTimeout(1400);
await page.getByText('Total Due',{exact:false}).first().click({timeout:6000});
await page.waitForTimeout(1500);
const dp=await page.locator('#root').innerText();
ok('the due list offers a reminder', /Payment Yaad Dilayein/.test(dp), dp.slice(0,240));
const rem=await page.locator('a[href*="wa.me"]').first().getAttribute('href');
const remText=decode(rem);
ok('the reminder states the total, paid and due',
  /Total: /.test(remText) && /Ab tak mila: /.test(remText) && /Baaki: /.test(remText), remText.slice(0,200));
ok('and which milestone it is for', /abhi due hai/.test(remText), remText.slice(0,200));

// ---- #3 quotation number ----
await page.getByText('Home',{exact:true}).first().click({timeout:6000}); await page.waitForTimeout(1400);
await page.getByText('Ramesh Patel',{exact:false}).first().click({timeout:8000}); await page.waitForTimeout(1500);
await page.getByText('Estimate',{exact:true}).first().click({timeout:6000}); await page.waitForTimeout(1500);
const est=await page.locator('#root').innerText();
const m=est.match(/SK\/\d{4}-\d{2}\/\d{3}/);
ok('a quotation number was assigned', !!m, est.slice(0,200));
await page.getByText('Preview Quotation',{exact:false}).first().click({timeout:6000});
await page.waitForTimeout(1800);
const q=await page.locator('#root').innerText();
ok('the quotation shows the number', m && q.includes(m[0]), (q.match(/No\. \S+/)||['none'])[0]);

console.log('\n===== NEW FEATURES =====');
T.forEach(([n,p,d])=>console.log((p?'PASS  ':'FAIL  ')+n+(p?'':'\n        '+d)));
console.log('\nquotation number seen:', m?m[0]:'(none)');
console.log('crashes:', crashes.length?crashes[0]:'none');
const bad=T.filter(t=>!t[1]).length+crashes.length;
console.log('\n'+(T.length-T.filter(t=>!t[1]).length)+' passed, '+T.filter(t=>!t[1]).length+' failed');
await browser.close();
process.exit(bad?1:0);
