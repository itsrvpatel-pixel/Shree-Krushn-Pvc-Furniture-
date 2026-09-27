// Generates the receipt and warranty PDFs from the running app, by
// driving the real UI, so they can be inspected or asserted on. Used by
// test/warranty-pages.test.mjs; also handy on its own when changing a
// document's layout - render it and LOOK at it, because reading jsPDF
// coordinates is how three separate overlaps got shipped.
//
//   NITEMS=50 node test/_pdf-harness.mjs <output-dir>

import { createRequire } from 'module';
const require=createRequire('/home/user/Shree-Krushn-Pvc-Furniture-/package.json');
const { chromium } = require('playwright');
const path=process.argv[2]||'/tmp/out';
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({viewport:{width:420,height:900},serviceWorkers:'block',acceptDownloads:true});
const N = Number(process.env.NITEMS || 6);
await ctx.addInitScript((N)=>{
  const now=new Date().toISOString();
  const job={id:'j1a2b3c4d5',customerId:'c1',customerName:'Rameshbhai Patel',phone:'9876543210',
    flatNo:'Flat 402, Sun City Residency', address:'Nikol Gam Road, Ahmedabad - 382350',
    status:'delivered', deliveredAt:now, expectedCompletionDate:now, quoteNo:'SK/2026-27/014',
    items:Array.from({length:N},(_,i)=>({id:'i'+i,
      desc:['Modular Kitchen - L shape with tandem baskets','Wardrobe 3 door with loft','TV Unit with wall panelling',
            'Study Table with overhead storage','Crockery Unit','Shoe Rack','Pooja Mandir with carved doors',
            'Dressing Unit with full mirror'][i%8] + ' (' + (i+1) + ')',
      length:'100',height:'90',qty:'1',rate:'1100'})),
    payments:[{id:'p1a2b3c4',amount:'250000',note:'Material advance - Kaka PVC sheets',method:'UPI',date:now}],
    extraWork:[],progressPhotos:[],requirements:[],activity:[],createdAt:now};
  const mem={ jobs:JSON.stringify([job]), customers:JSON.stringify([{id:'c1',name:'Rameshbhai Patel',phone:'9876543210',createdAt:now}]),
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
}, N);
const page=await ctx.newPage();
page.on('pageerror',e=>console.log('PAGEERROR:',e.message.split('\n')[0]));
await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2500);
// Drive the real UI: log in, open the job, download both documents.
await page.getByText('Admin',{exact:false}).first().click({timeout:25000});
await page.locator('input').first().fill('7777');
await page.getByRole('button',{name:/enter admin|check kar/i}).first().click();
await page.waitForTimeout(3500);
await page.getByText('Rameshbhai Patel',{exact:false}).first().click({timeout:10000});
await page.waitForTimeout(1500);

async function grab(tab, label, file) {
  await page.getByText(tab,{exact:true}).first().click({timeout:8000});
  await page.waitForTimeout(1400);
  const dl = page.waitForEvent('download',{timeout:40000});
  await page.getByText(label,{exact:false}).first().click({timeout:8000});
  try { const d = await dl; await d.saveAs(path + '/' + file + '.pdf'); console.log(file, 'saved'); }
  catch (e) { console.log(file, 'FAILED:', String(e).split('\n')[0].slice(0,90)); }
  await page.waitForTimeout(800);
}
// The receipt button in the admin payment row is icon-only, so it is
// reached by position within the row rather than by label.
await page.getByText('Payment',{exact:true}).first().click({timeout:8000});
await page.waitForTimeout(1400);
{
  const dl = page.waitForEvent('download',{timeout:40000});
  // The download button is the one just before the delete button in the
  // payment row - picked from the DOM so an added button does not move it.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter(
      (d) => d.innerText && d.innerText.includes('2,50,000') && d.querySelectorAll('button').length >= 3);
    const row = rows[rows.length - 1];
    const bs = row.querySelectorAll('button');
    bs[bs.length - 2].click();
  });
  try { const d = await dl; await d.saveAs(path + '/receipt.pdf'); console.log('receipt saved'); }
  catch (e) { console.log('receipt FAILED:', String(e).split('\n')[0].slice(0,90)); }
}
await page.waitForTimeout(900);
await grab('Status', 'Warranty Certificate', 'warranty');

await browser.close();
