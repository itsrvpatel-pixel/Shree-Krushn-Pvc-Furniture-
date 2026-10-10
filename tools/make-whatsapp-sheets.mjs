// Pictures to send on WhatsApp instead of a link.
//
// The owner's words: "Link dekh ke darte he log." He is right, and it
// is not irrational - every scam warning in India for five years has
// been about unknown links in WhatsApp. A stranger off an Instagram ad
// has no reason to believe ours is different, and a link they will not
// tap is worse than no message.
//
// A photograph has none of that. It opens inside WhatsApp, it shows
// the work immediately, and the phone number is printed on it - so the
// reply is a tap on the number, not a leap of faith.
//
// One sheet per thing people ask for, built from his own jobs out of
// the site gallery. No link anywhere on them, by design.
//
//   node tools/make-whatsapp-sheets.mjs
//
// Output: posts/wa/ - for the owner to download and send, not for the
// website to serve.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const OUT = path.join(root, 'posts', 'wa');
const IMG = path.join(root, 'site', 'img');

const NAVY = '#0F1B3D';
const GOLD = '#A8975F';

const b64 = (p) => 'data:image/' + (p.endsWith('.png') ? 'png' : 'jpeg') + ';base64,'
  + fs.readFileSync(p).toString('base64');
const logo = b64(path.join(root, 'public', 'icon-512.png'));
const photo = (f) => b64(path.join(IMG, f));

const PHONE = '79902 83116';

/* Two photographs to a sheet, and every one of them opened and looked
   at before it went in.
   
   The first cut of this took four each, straight off the room pages'
   galleries - which are not strictly per room. The kitchen sheet went
   out with two photographs of a door on it, the same door twice. A
   sheet sent to a stranger is the whole first impression; two pictures
   that are certainly right beat four that might not be.
   
   Every figure here is the one on the price page. */
const SHEETS = [
  {
    name: '1-kitchen', title: 'PVC Modular Kitchen',
    line: 'Steam, water, damp under the platform - none of it touches this. There is no wood in it.',
    imgs: ['g/1f10ff8004.jpg', 'g/0e254e1356.jpg'],
  },
  {
    name: '2-wardrobe', title: 'PVC Wardrobe',
    line: 'Two, three or four doors, sliding or walk-in. Loft, drawers, mirror - however you want it.',
    imgs: ['g/91d4007177.jpg', 'g/5634e5e99c.jpg'],
  },
  {
    name: '3-tv-unit', title: 'PVC TV Unit',
    line: 'Panelling, hidden wiring, storage below, LED profile lighting.',
    imgs: ['card/1ec240f6f3.jpg', 'g/226553a453.jpg'],
  },
  {
    name: '4-mandir', title: 'PVC Pooja Mandir',
    line: 'Oil, water and the heat of the lamp, every day. PVC wipes clean.',
    imgs: ['g/567056f722.jpg', 'g/209475ecf3.jpg'],
  },
];

// The one sheet with no photographs: the things people ask on the
// phone, answered before they ask.
const RATE = {
  name: '0-rate', title: 'Rates and the work',
  rows: [
    ['Framing', 'From Rs 600 / sq ft'],
    ['Box work', 'From Rs 1,000 / sq ft'],
    ['GST', 'Not extra - you pay what is written'],
    ['Design', 'Free - no charge at all'],
    ['Site visit', 'Free - we measure and give the exact rate'],
    ['Warranty', '2 years, with a certificate'],
    ['A full home', 'About 10 days'],
  ],
};

const head = `<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1350px;font-family:Manrope,system-ui,sans-serif;background:${NAVY};
       display:flex;flex-direction:column;overflow:hidden}
  .top{padding:34px 44px 22px;display:flex;align-items:center;gap:16px}
  .top img{width:70px;height:70px;border-radius:50%;background:#fff;flex:none}
  .top b{color:#fff;font-size:27px;font-weight:800;letter-spacing:-.02em;display:block;line-height:1.2}
  .top i{color:${GOLD};font-style:normal;font-size:14px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
  h1{color:#fff;font-size:52px;font-weight:800;letter-spacing:-.03em;padding:0 44px}
  .line{color:#B9C2D4;font-size:25px;line-height:1.45;padding:14px 44px 22px;font-weight:500}
  /* min-height:0 so the photos give way instead of shoving the phone
     number off the bottom - which is exactly what happened first time
     and left a sheet with no way to reply on it. */
  .grid{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px}
  .cell{position:relative;overflow:hidden;background:#000;border-radius:10px}
  .cell img{width:100%;height:100%;object-fit:cover}
  .foot{flex:none;padding:26px 44px 34px;display:flex;align-items:center;gap:14px}
  .ph{background:${GOLD};color:${NAVY};font-weight:800;font-size:31px;padding:14px 26px;border-radius:999px}
  .fl{color:#8E9AB4;font-size:20px;font-weight:700;line-height:1.3}

  /* Centred: seven short rows left a hole down the middle of the
     sheet, which reads as a mistake rather than as space. */
  .rates{flex:1;min-height:0;padding:10px 44px;display:flex;flex-direction:column;justify-content:center}
  .r{display:flex;align-items:baseline;padding:30px 0;border-bottom:1px solid rgba(255,255,255,.1)}
  .r b{color:#fff;font-size:30px;font-weight:700;flex:1}
  .r span{color:${GOLD};font-size:30px;font-weight:800;text-align:right}
</style>`;

const top = `<div class="top"><img src="${logo}" alt="">
  <div><b>Shree Krushn PVC Furniture</b><i>Nikol, Ahmedabad</i></div></div>`;
// No link, anywhere. The number is the call to action.
const foot = `<div class="foot"><div class="ph">${PHONE}</div>
  <div class="fl">Call or<br>WhatsApp us</div></div>`;

const sheet = (s) => `<!doctype html><html><head>${head}</head><body>
  ${top}
  <h1>${s.title}</h1>
  <div class="line">${s.line}</div>
  <div class="grid">${s.imgs.map((f) => `<div class="cell"><img src="${photo(f)}" alt=""></div>`).join('')}</div>
  ${foot}
</body></html>`;

const rateSheet = (s) => `<!doctype html><html><head>${head}</head><body>
  ${top}
  <h1>${s.title}</h1>
  <div class="line">The questions people ask, answered before they ask.</div>
  <div class="rates">${s.rows.map(([k, v]) => `<div class="r"><b>${k}</b><span>${v}</span></div>`).join('')}</div>
  ${foot}
</body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
fs.mkdirSync(OUT, { recursive: true });
for (const s of [RATE, ...SHEETS]) {
  await page.setContent(s.rows ? rateSheet(s) : sheet(s), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const file = path.join(OUT, s.name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  console.log('  ' + s.name + '.jpg  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}
await browser.close();
console.log('whatsapp sheets: ' + (SHEETS.length + 1) + ' written to posts/wa');
