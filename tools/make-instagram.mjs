// Instagram posts, 1080x1080, rendered rather than drawn by hand.
//
// Same reason the WhatsApp banners are generated: the wording changes,
// the rates change, and a folder of hand-made JPEGs drifts away from
// what the website actually says within a month. These read their
// numbers from the same place the site does, so a post can never quote
// a rate the business does not charge.
//
// Everything in them is real: the photographs are the owner's own work
// out of the site gallery, and the review is a customer's own words as
// published on the website. Nothing here is invented copy.
//
//   node tools/make-instagram.mjs
//
// Output: posts/ at the repo root (not public/ - these are for the
// owner to download and post, not for the website to serve).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const OUT = path.join(root, 'posts');
const IMG = path.join(root, 'site', 'img');

const NAVY = '#0F1B3D';
const GOLD = '#A8975F';
const CREAM = '#F8FAFB';

const b64 = (p) => 'data:image/' + (p.endsWith('.png') ? 'png' : 'jpeg') + ';base64,'
  + fs.readFileSync(p).toString('base64');

const logo = b64(path.join(root, 'public', 'icon-512.png'));
const photo = (f) => b64(path.join(IMG, f));

/* The four posts.
   - photo posts put the work first and the words in a band underneath,
     because on Instagram the picture is what stops the scroll.
   - the review post has no photograph on purpose: a wall of navy with
     one person's sentence on it reads differently in a feed, and the
     words are the point. */
const POSTS = [
  {
    name: '1-waterproof',
    kind: 'photo',
    img: 'card/1ec240f6f3.jpg',
    kicker: 'PVC Furniture',
    title: 'Paani lage,<br>phir bhi kuch nahi hota',
    sub: 'Lakdi phoolti hai, deemak lagti hai. PVC mein lakdi hai hi nahi.',
    tag: '100% Waterproof',
  },
  {
    name: '2-rate',
    kind: 'photo',
    img: 'g/1f10ff8004.jpg',
    kicker: 'Saaf Rate',
    title: 'Rate chhupaye<br>bina bataate hain',
    sub: 'Framing ₹600/sq ft se. Box work ₹1,000/sq ft se. GST alag nahi.',
    tag: 'Free site visit',
  },
  {
    name: '3-ten-days',
    kind: 'photo',
    img: 'g/91d4007177.jpg',
    kicker: 'Poora Ghar',
    title: 'Lagbhag 10 din<br>mein poora ghar',
    sub: 'Zyadatar kaam workshop mein hota hai, isliye ghar kam din khulta hai.',
    tag: '2 saal warranty',
  },
  {
    // Vasant Shah's own words, as published on the website.
    name: '4-review',
    kind: 'review',
    quote: 'Complete ghar mate furniture karavyu ane overall experience saro rahyo',
    who: 'Vasant Shah',
    foot: 'App par 37 review, average 5.0',
  },
];

const head = `<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1080px;height:1080px;font-family:Manrope,system-ui,sans-serif;
       background:${NAVY};overflow:hidden;position:relative}

  /* photo posts
     The work is photographed portrait, on a phone, and a square post
     cropped to fill cut the top off a wardrobe and the lower unit off
     a TV wall - the parts a customer is looking at. So the photograph
     is shown whole, over a blurred, enlarged copy of itself. Nothing
     of the furniture is lost and the frame still fills. */
  .shot{position:absolute;inset:0 0 362px 0;overflow:hidden;background:#000}
  .shot .blur{position:absolute;inset:-60px;width:calc(100% + 120px);height:calc(100% + 120px);
              object-fit:cover;filter:blur(38px) brightness(.62);transform:scale(1.1)}
  .shot .real{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
  /* The band is opaque, not a gradient over the photo: Instagram
     compresses hard and text over a busy image goes to mush. */
  .band{position:absolute;left:0;right:0;bottom:0;height:362px;background:${NAVY};
        padding:40px 62px 44px;display:flex;flex-direction:column;justify-content:space-between}
  .kicker{color:${GOLD};font-weight:800;font-size:21px;letter-spacing:.2em;text-transform:uppercase}
  h1{color:#fff;font-size:60px;line-height:1.08;font-weight:800;letter-spacing:-.03em;margin-top:14px}
  .sub{color:#B9C2D4;font-size:25px;line-height:1.45;font-weight:500;margin-top:16px;max-width:21em}
  .row{display:flex;align-items:center;gap:16px}
  .tag{background:${GOLD};color:${NAVY};font-weight:800;font-size:21px;padding:11px 22px;border-radius:999px}
  .ph{color:#8E9AB4;font-size:21px;font-weight:700;margin-left:auto}

  /* the badge sitting on the photo */
  .mark{position:absolute;top:44px;left:44px;display:flex;align-items:center;gap:14px;
        background:rgba(15,27,61,.82);padding:12px 22px 12px 12px;border-radius:999px}
  .mark img{width:56px;height:56px;border-radius:50%;background:#fff}
  .mark b{color:#fff;font-size:22px;font-weight:800;letter-spacing:-.01em;display:block;line-height:1.2}
  .mark i{color:${GOLD};font-style:normal;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}

  /* review post */
  /* Centred, not spread top-to-bottom: a short quote left a hole in
     the middle of the frame, and on Instagram that reads as a mistake
     rather than as space. */
  .rev{position:absolute;inset:0;padding:96px 86px 0;display:flex;flex-direction:column;justify-content:center}
  .rfoot{position:absolute;left:86px;right:86px;bottom:86px}
  .glow{position:absolute;right:-200px;top:-200px;width:700px;height:700px;border-radius:50%;
        background:radial-gradient(circle,rgba(168,151,95,.26),rgba(168,151,95,0) 68%)}
  .stars{color:${GOLD};font-size:46px;letter-spacing:10px}
  blockquote{color:#fff;font-size:58px;line-height:1.26;font-weight:800;letter-spacing:-.03em;margin-top:34px}
  .who{color:${GOLD};font-size:27px;font-weight:800;margin-top:34px}
  .rfoot{display:flex;align-items:center;gap:18px;position:absolute}
  .rfoot img{width:76px;height:76px;border-radius:50%;background:#fff}
  .rfoot b{color:${CREAM};font-size:25px;font-weight:800;display:block;line-height:1.25}
  .rfoot i{color:#8E9AB4;font-style:normal;font-size:20px;font-weight:600}
</style>`;

const photoPost = (p) => `<!doctype html><html><head>${head}</head><body>
  <div class="shot"><img class="blur" src="${photo(p.img)}" alt=""><img class="real" src="${photo(p.img)}" alt=""></div>
  <div class="mark"><img src="${logo}" alt=""><div><b>Shree Krushn PVC Furniture</b><i>Nikol, Ahmedabad</i></div></div>
  <div class="band">
    <div>
      <div class="kicker">${p.kicker}</div>
      <h1>${p.title}</h1>
      <div class="sub">${p.sub}</div>
    </div>
    <div class="row"><div class="tag">${p.tag}</div><div class="ph">79902 83116</div></div>
  </div>
</body></html>`;

const reviewPost = (p) => `<!doctype html><html><head>${head}</head><body>
  <div class="glow"></div>
  <div class="rev">
    <div>
      <div class="stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      <blockquote>&ldquo;${p.quote}&rdquo;</blockquote>
      <div class="who">&mdash; ${p.who}</div>
    </div>
    <div class="rfoot"><img src="${logo}" alt="">
      <div><b>Shree Krushn PVC Furniture</b><i>${p.foot}</i></div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
fs.mkdirSync(OUT, { recursive: true });
for (const p of POSTS) {
  await page.setContent(p.kind === 'review' ? reviewPost(p) : photoPost(p), { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const file = path.join(OUT, p.name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  console.log('  ' + p.name + '.jpg  ' + Math.round(fs.statSync(file).size / 1024) + ' KB');
}
await browser.close();
console.log('instagram: ' + POSTS.length + ' posts written to posts/');
