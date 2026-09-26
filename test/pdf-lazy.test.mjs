// PDF generation must still work now that jsPDF and html2canvas are
// fetched on demand rather than shipped with every page load.
//
// This is the risk the bundle-size win creates: if the dynamic import
// never resolves, the button quietly does nothing. So this drives the
// real thing - taps "Download" on the price list and checks a PDF
// actually comes out - and separately checks that neither library is
// loaded before it is needed.
//
//   npm install --no-save playwright
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node test/pdf-lazy.test.mjs

import { createRequire } from 'module';
const require=createRequire('/home/user/Shree-Krushn-Pvc-Furniture-/package.json');
const { chromium } = require('playwright');
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:420,height:900},serviceWorkers:'block',acceptDownloads:true});
await ctx.addInitScript(()=>{
  const now=new Date().toISOString();
  const mem={ jobs:'[]', customers:'[]', expenses:'[]', staff:'[]', notifications:'[]', admin_pin:'7777',
    categories:'["Kitchen"]', gallery_categories:'["Kitchen"]', gallery_cat_Kitchen:'[]',
    estimate_rates:JSON.stringify([{id:'er1',name:'Kitchen',value:'1200',unit:'sqft'}]) };
  const storage={get:async k=>(k in mem?{key:k,value:mem[k]}:null),
    getStatus:async k=>(k in mem?{ok:true,missing:false,value:mem[k]}:{ok:true,missing:true,value:null}),
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}},delete:async k=>({key:k,deleted:true}),
    listAllKeys:async()=>Object.keys(mem)};
  Object.defineProperty(storage,'subscribe',{get:()=>((k,cb)=>{Promise.resolve().then(()=>cb(mem[k]??null));return()=>{}}),set:()=>{},configurable:false});
  const mk=(lk,idOf)=>{const col=new Map();const loadLegacy=async()=>{const r=mem[lk];return r?JSON.parse(r):[]};
    return {loadLegacy,loadAll:async()=>[...col.values()].length?[...col.values()]:await loadLegacy(),
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
const loaded=[]; page.on('request',r=>{ const u=r.url(); if(/jspdf|html2canvas/i.test(u)) loaded.push(u.split('/').pop()); });
await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);

const T=[]; const ok=(n,c,d)=>T.push([n,!!c,d||'']);
ok('no PDF library loaded on the landing page', loaded.length===0, loaded.join(','));

await page.getByText('Admin',{exact:false}).first().click({timeout:25000});
await page.locator('input').first().fill('7777');
await page.getByRole('button',{name:/enter admin|check kar/i}).first().click();
await page.waitForTimeout(3000);
await page.getByText('Settings',{exact:true}).last().click({timeout:8000});
await page.waitForTimeout(1500);
ok('still none after logging in and opening Settings', loaded.length===0, loaded.join(','));

const dl = page.waitForEvent('download',{timeout:30000});
await page.getByText('Download',{exact:true}).first().click({timeout:8000});
let file=null, err=null;
try { const d=await dl; file=d.suggestedFilename(); } catch(e){ err=String(e).split('\n')[0]; }
await page.waitForTimeout(500);
ok('tapping Download produces a PDF', !!file && /\.pdf$/i.test(file||''), err || ('got '+file));
ok('jsPDF was fetched only at that point', loaded.some(u=>/jspdf/i.test(u)), loaded.join(',') || 'never fetched');

console.log('\n===== LAZY PDF LIBRARIES =====');
T.forEach(([n,p,d])=>console.log((p?'PASS  ':'FAIL  ')+n+(p?'':'   ['+d+']')));
console.log('\nfetched during the run:', loaded.join(', ') || '(none)');
const bad=T.filter(t=>!t[1]).length;
console.log('\n'+(T.length-bad)+' passed, '+bad+' failed');
await browser.close();
process.exit(bad?1:0);
