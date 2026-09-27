import json, html
m2=json.load(open('/tmp/m2.json')); man=m2['man']; slides=m2['slides']
g=json.load(open('/tmp/gallery.json'))
N=sum(len(v) for v in g.values())
HERO='img/slide/'+slides[0][1]
def E(s): return html.escape(str(s),quote=True)
CATS=[('Kitchen','Modular Kitchen'),('Wardrobe','Wardrobe'),('TV Unit','TV Unit'),
      ('Mandir','Pooja Mandir'),('Dressing Table','Dressing Table'),('Study table','Study Table')]
def cards(cls,h,radius):
    return ''.join(
      '<a class="%s"><img src="img/card/%s" alt=""><span><b>%s</b><i>%d designs</i></span></a>'
      % (cls, man[k][0], E(t), len(g.get(k,[]))) for k,t in CATS if man.get(k))

FONTS='<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'

# ---------- A: bright, rounded, bold - the Livspace/HomeLane language --
A = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>A</title>''' + FONTS + '''
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
:root{--ink:#10151F;--mut:#6B7280;--line:#ECEEF2;--acc:#E4572E;--navy:#0E1A38}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--mut);
font:16px/1.65 Manrope,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}a{color:inherit;text-decoration:none}
.w{max-width:1100px;margin:0 auto;padding:0 18px}
h1,h2,b{color:var(--ink);font-weight:800;letter-spacing:-.03em;line-height:1.08}
nav{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);z-index:9}
.nv{display:flex;align-items:center;gap:10px;max-width:1100px;margin:0 auto;padding:12px 18px}
.nv img{width:34px;height:34px;border-radius:50%}
.nv .nm{font-weight:800;color:var(--ink);font-size:14px;line-height:1.1}
.nv .nm i{display:block;font-style:normal;font-size:10px;color:var(--mut);font-weight:500}
.nv .go{margin-left:auto;display:flex;gap:8px}
.pill{border:1.5px solid var(--line);border-radius:999px;padding:9px 15px;font-size:13px;font-weight:700;color:var(--ink)}
.pill.on{background:var(--acc);border-color:var(--acc);color:#fff}
.hero{padding-top:34px;padding-bottom:8px}
h1{font-size:38px}
h1 em{font-style:normal;color:var(--acc)}
.sub{margin:14px 0 20px;font-size:16px}
.cta{display:flex;gap:10px;flex-wrap:wrap}
.btn{border-radius:14px;padding:15px 22px;font-weight:800;font-size:15px}
.b1{background:var(--acc);color:#fff}.b2{background:var(--navy);color:#fff}
.b3{border:1.5px solid var(--line);color:var(--ink)}
.chips{display:flex;gap:8px;overflow:auto;margin-top:22px;padding-bottom:4px}
.chip{flex:0 0 auto;background:#F6F7F9;border-radius:999px;padding:9px 15px;font-size:13px;font-weight:700;color:var(--ink)}
.big{margin-top:22px;border-radius:22px;overflow:hidden}
.big img{width:100%;height:230px;object-fit:cover}
.sec{padding-top:40px;padding-bottom:10px}
h2{font-size:27px;margin:0 0 6px}
.gr{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:18px}
.c{border-radius:18px;overflow:hidden;background:#F6F7F9}
.c img{width:100%;height:120px;object-fit:cover}
.c span{display:block;padding:11px 13px 14px}
.c b{display:block;font-size:14.5px}.c i{font-style:normal;font-size:11.5px;color:var(--mut);font-weight:600}
</style></head><body>
<nav><div class="nv"><img src="/boot-mark.jpg" alt="">
<div class="nm">Shree Krushn<i>PVC Furniture</i></div>
<div class="go"><a class="pill">Open app</a><a class="pill on">Free visit</a></div></div></nav>
<div class="w hero"><h1>Full home PVC furniture in <em>10 days</em></h1>
<p class="sub">Modular kitchen, wardrobe, TV unit - waterproof, termite proof. Free site visit and a written estimate.</p>
<div class="cta"><a class="btn b1">Book a free visit</a><a class="btn b2">Instant estimate</a><a class="btn b3">Open my app</a></div>
<div class="chips"><span class="chip">''' + str(N) + ''' designs</span><span class="chip">2 yr warranty</span><span class="chip">100% virgin PVC</span><span class="chip">Nikol, Ahmedabad</span></div>
<div class="big"><img src="''' + HERO + '''" alt=""></div></div>
<div class="w sec"><h2>What we make</h2><p>Tap a room to see the album.</p>
<div class="gr">''' + cards('c',120,18) + '''</div></div>
</body></html>'''

# ---------- B: dark, huge type, one image - gallery/atelier -----------
B = '''<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>B</title>''' + FONTS + '''
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0B0E14;--fg:#F2F3F5;--mut:#9AA1AE;--acc:#C9A961;--line:#1E2330}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--mut);
font:16px/1.7 Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}a{color:inherit;text-decoration:none}
.w{max-width:1100px;margin:0 auto;padding:0 20px}
h1,h2{font-family:Syne,sans-serif;color:var(--fg);margin:0;line-height:.98;letter-spacing:-.03em;font-weight:800}
nav{position:sticky;top:0;background:rgba(11,14,20,.86);backdrop-filter:blur(10px);
border-bottom:1px solid var(--line);z-index:9}
.nv{display:flex;align-items:center;gap:10px;max-width:1100px;margin:0 auto;padding:13px 20px}
.nv img{width:32px;height:32px;border-radius:50%}
.nm{font-weight:600;color:var(--fg);font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.go{margin-left:auto;display:flex;gap:9px}
.gh{border:1px solid var(--line);color:var(--fg);padding:9px 14px;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.gf{background:var(--acc);color:#0B0E14;padding:9px 14px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.hero{padding-top:44px}
.tag{color:var(--acc);font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600}
h1{font-size:38px;margin:16px 0 0}
h1 span{display:block;color:var(--acc)}
.sub{margin:20px 0 26px;max-width:26em}
.cta{display:flex;flex-direction:column;gap:9px;max-width:300px}
.btn{padding:15px 20px;font-size:13.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-align:center}
.b1{background:var(--acc);color:#0B0E14}.b2{border:1px solid var(--line);color:var(--fg)}
.shot{margin-top:34px}
.shot img{width:100%;height:300px;object-fit:cover;filter:saturate(.92)}
.num{display:flex;gap:26px;padding:22px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);margin-top:0}
.num div b{display:block;font-family:Syne,sans-serif;color:var(--fg);font-size:22px}
.num div span{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase}
.sec{padding-top:44px;padding-bottom:10px}
h2{font-size:28px;margin-bottom:8px}
.gr{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:20px}
.c{position:relative;overflow:hidden}
.c img{width:100%;height:160px;object-fit:cover;filter:saturate(.92)}
.c span{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 11px;
background:linear-gradient(transparent,rgba(11,14,20,.92))}
.c b{display:block;color:var(--fg);font-family:Inter,sans-serif;font-weight:600;font-size:14px;letter-spacing:0}
.c i{font-style:normal;font-size:10.5px;color:var(--acc);letter-spacing:.1em;text-transform:uppercase}
</style></head><body>
<nav><div class="nv"><img src="/boot-mark.jpg" alt=""><span class="nm">Shree Krushn</span>
<div class="go"><a class="gh">App</a><a class="gf">Free visit</a></div></div></nav>
<div class="w hero"><div class="tag">Nikol &#183; Ahmedabad</div>
<h1>We furnish<span>the dreams</span></h1>
<p class="sub">Modular kitchens, wardrobes and full-home interiors in 100% virgin PVC. Fitted in about ten days.</p>
<div class="cta"><a class="btn b1">Book a free visit</a><a class="btn b2">Instant estimate</a><a class="btn b2">Open my app</a></div></div>
<div class="shot"><img src="''' + HERO + '''" alt=""></div>
<div class="w"><div class="num">
<div><b>''' + str(N) + '''</b><span>designs</span></div>
<div><b>10</b><span>days</span></div>
<div><b>2 yr</b><span>warranty</span></div></div></div>
<div class="w sec"><h2>Collections</h2><p>Tap a room for the album.</p>
<div class="gr">''' + cards('c',150,0) + '''</div></div>
</body></html>'''

# ---------- C: the one already built, for comparison -------------------
import shutil
open('site/var-a.html','w').write(A)
open('site/var-b.html','w').write(B)
shutil.copy('site/home.html','site/var-c.html')
print('wrote var-a.html, var-b.html, var-c.html')
