// The picture WhatsApp shows when one of our links is shared.
//
// It used to be icon-512.png - the round logo on white - so every
// message, whatever it was about, previewed as the same big badge
// with the website's SEO title under it. The owner's words: "aisa
// logo dikh raha he jo professional nahi lag raha". He is right, and
// the deeper problem is that a visit reminder, an estimate and a
// photos update all looked identical.
//
// One banner per kind of message, rendered here rather than drawn by
// hand so they stay consistent and can be regenerated when the
// wording changes. 1200x630 is what WhatsApp, Facebook and LinkedIn
// all crop from.
//
//   node tools/make-og-banners.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'og');
const LOGO = path.join(process.cwd(), 'public', 'icon-512.png');

const NAVY = '#0F1B3D';
const GOLD = '#A8975F';
const CREAM = '#F8FAFB';

const CARDS = [
  { name: 'go-visit', kicker: 'Site Visit', title: 'Aapki visit confirm hai',
    sub: 'Time, address aur poori jaankari app mein dekhein' },
  { name: 'go-estimate', kicker: 'Estimate', title: 'Aapka estimate taiyaar hai',
    sub: 'Item-wise rate aur payment schedule app mein' },
  { name: 'go-work', kicker: 'Kaam Ki Progress', title: 'Aapke kaam ki nayi photos',
    sub: 'Roz ki progress aur stage app mein dekhein' },
  { name: 'go-designs', kicker: 'Design Gallery', title: '500+ design dekhein',
    sub: 'Wardrobe, kitchen, TV unit - jo pasand aaye save karein' },
  { name: 'go-app', kicker: 'Shree Krushn PVC Furniture', title: 'Aapka kaam, ek app mein',
    sub: 'Estimate, photos, payment aur design - sab ek jagah' },
];

const logo = 'data:image/png;base64,' + fs.readFileSync(LOGO).toString('base64');

const html = (c) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;background:${NAVY};font-family:Manrope,system-ui,sans-serif;
       display:flex;flex-direction:column;justify-content:space-between;padding:68px 76px;position:relative;overflow:hidden}
  /* A single soft shape so the panel is not a flat rectangle. Kept
     well away from the text: WhatsApp crops the edges on some phones. */
  .glow{position:absolute;right:-180px;top:-180px;width:620px;height:620px;border-radius:50%;
        background:radial-gradient(circle,rgba(168,151,95,.30),rgba(168,151,95,0) 68%)}
  .top{display:flex;align-items:center;gap:20px;position:relative}
  .top img{width:84px;height:84px;border-radius:50%;background:#fff;flex:none}
  .brand{color:${CREAM};font-weight:800;font-size:27px;letter-spacing:-.01em;line-height:1.2}
  .brand span{display:block;color:${GOLD};font-weight:700;font-size:17px;letter-spacing:.14em;text-transform:uppercase;margin-top:5px}
  .mid{position:relative}
  .kicker{color:${GOLD};font-weight:800;font-size:22px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:18px}
  h1{color:#fff;font-size:68px;line-height:1.08;font-weight:800;letter-spacing:-.025em;max-width:16em}
  .sub{color:#C3CAD9;font-size:28px;margin-top:22px;font-weight:500;max-width:24em;line-height:1.4}
  .foot{display:flex;align-items:center;gap:16px;position:relative}
  .pill{background:${GOLD};color:${NAVY};font-weight:800;font-size:22px;padding:13px 26px;border-radius:999px}
  .site{color:#8E9AB4;font-size:21px;font-weight:600}
</style></head><body>
  <div class="glow"></div>
  <div class="top"><img src="${logo}" alt=""><div class="brand">Shree Krushn PVC Furniture<span>Nava Naroda, Ahmedabad</span></div></div>
  <div class="mid">
    <div class="kicker">${c.kicker}</div>
    <h1>${c.title}</h1>
    <div class="sub">${c.sub}</div>
  </div>
  <div class="foot"><div class="pill">App kholein</div><div class="site">shreekrushnpvcfurniture.site</div></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
fs.mkdirSync(OUT, { recursive: true });
for (const c of CARDS) {
  await page.setContent(html(c), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const file = path.join(OUT, c.name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  console.log('  ' + c.name + '.jpg  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}
await browser.close();
console.log('og banners: ' + CARDS.length + ' written to public/og');
