import json, html, re
m2=json.load(open('/tmp/m2.json')); man=m2['man']; slides=m2['slides']
content=json.load(open('/tmp/content.json')); g=json.load(open('/tmp/gallery.json'))
def E(s): return html.escape(str(s or ''), quote=True)

TEL='+917990283116'; PHONE='+91 79902 83116'; PHONE2='+91 95123 18775'
WA='https://wa.me/message/ZMRRGHFC4ZQTD1'
SOCIAL={'instagram':'https://instagram.com/shree_krushn_pvc_furniture',
        'facebook':'https://www.facebook.com/ShreeKrushnFiberMart',
        'youtube':'https://youtube.com/@shreekrushnpvcfurniture'}
SLUG=json.load(open('/tmp/slugs.json'))
ALBUM={'all':'https://photos.app.goo.gl/XnQE8gph2gpxN6xb7',
 'Kitchen':'https://photos.app.goo.gl/5uhwAmxXyJupxHUj8',
 'Wardrobe':'https://photos.app.goo.gl/kz5x7b7q51BCcE978',
 'TV Unit':'https://photos.app.goo.gl/KJNTpBYySt2oKg1RA',
 'Dressing Table':'https://photos.app.goo.gl/pM1gbG1rgwZsD3fT7',
 'Partition elevation':'https://photos.app.goo.gl/D2QtQk36A4NfbquC7',
 'Mandir':'https://photos.app.goo.gl/nCao1kup3ghmwy1f8',
 'Study table':'https://photos.app.goo.gl/epDizQTEjDuUvhHz9',
 'video':'https://photos.app.goo.gl/VjCAgj15E6opigDSA'}
CATS=[('Kitchen','Modular Kitchen','Tandem baskets, loft, crockery unit'),
 ('Wardrobe','Wardrobe','Two, three and four door. Sliding, walk-in'),
 ('TV Unit','TV Unit','Wall panelling, drawers, open shelves'),
 ('Mandir','Pooja Mandir','Carved doors, bells, samagri drawer'),
 ('Dressing Table','Dressing Table','Full mirror, drawers, side storage'),
 ('Study table','Study Table','Overhead storage, book shelf'),
 ('Partition elevation','Partition & Elevation','Room divider, wall panelling'),
 ('Shoes box','Shoe Rack','Bench top, closed shutter'),
 ('Washbasin','Washbasin Unit','Waterproof cabinet, mirror unit'),
 ('Color pop','Colour & POP','False ceiling, POP, painting'),
 ('electric','Electrical','Wiring, points, light fitting')]
SL={'Kitchen':'Modular Kitchen','Wardrobe':'Wardrobe','TV Unit':'TV Unit','Mandir':'Pooja Mandir'}
WHY=['100% Waterproof','Termite & Borer Proof — For Life','Fire Resistant (Self-Extinguishing)',
     'Fast installation just in 10 days','Very Low Maintenance','Cost-Effective Premium Appearance']
specs={s['title']:s.get('desc','') for s in content['material_specs']}
def clean(d, lim=125):
    d=(d or '').strip().strip('“”"').replace('—','-')
    out=''
    for p in re.split(r'(?<=[.!?])\s+', d):
        if out and len(out)+len(p)+1>lim: break
        out=(out+' '+p).strip()
    return out or d[:lim]
N=sum(len(v) for v in g.values())

parts=[]
for i,(c,n) in enumerate(slides):
    lazy='' if i==0 else ' loading="lazy"'
    on=' on' if i==0 else ''
    parts.append('<div class="sld"><img src="img/slide/%s" alt="%s by Shree Krushn PVC Furniture, Ahmedabad"%s /><span>%s</span></div>'
                 % (n, E(SL[c]), lazy, E(SL[c])))
slide_html=''.join(parts)
dots=''.join('<button class="dot%s" data-i="%d" aria-label="Slide %d"></button>' % (' on' if i==0 else '', i, i+1)
             for i in range(len(slides)))

cards=''
for k,t,s in CATS:
    if not man.get(k): continue
    slug=SLUG.get(k)
    if slug:
        open_tag='<a class="card" href="/%s">' % E(slug); close='</a>'
        more='%d designs' % len(g.get(k,[]))
    else:
        open_tag='<div class="card">'; close='</div>'
        more='%d designs' % len(g.get(k,[]))
    cards+=('%s<img src="img/card/%s" alt="%s PVC furniture, Nikol Ahmedabad" loading="lazy" />'
            '<span class="t"><b>%s</b><i>%s</i></span>%s'
            % (open_tag, man[k][0], E(t), E(t), more, close))

rail=''.join('<img src="img/rail/%s" alt="%s PVC design, Ahmedabad" loading="lazy" />' % (n, E(t))
             for k,t,_ in CATS for n in (man.get(k) or [])[:2])
why=''.join('<div class="w"><span>%02d</span><h3>%s</h3><p>%s</p></div>'
            % (i, E(t.replace(' — ',' - ')), E(clean(specs.get(t,''))))
            for i,t in enumerate(WHY,1))
revs=''.join('<figure><div class="st">%s</div><blockquote>%s</blockquote><figcaption>%s</figcaption></figure>'
             % ('&#9733;'*int(r.get('rating',5)), E(r.get('text','')), E(r.get('customerName','')))
             for r in content['featured_reviews'])
ICON={'instagram':'M12 2.2c3.2 0 3.6 0 4.9.07 3.3.15 4.8 1.7 5 5 .06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.2 3.3-1.7 4.8-5 5-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-3.3-.2-4.8-1.7-5-5C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.2-3.3 1.7-4.8 5-5C8.4 2.2 8.8 2.2 12 2.2zm0 3.4a6.4 6.4 0 100 12.8 6.4 6.4 0 000-12.8zm0 10.6a4.2 4.2 0 110-8.4 4.2 4.2 0 010 8.4zm6.6-10.9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
 'youtube':'M23 12s0-3.9-.5-5.7a3 3 0 00-2.1-2.1C18.6 3.7 12 3.7 12 3.7s-6.6 0-8.4.5A3 3 0 001.5 6.3C1 8.1 1 12 1 12s0 3.9.5 5.7a3 3 0 002.1 2.1c1.8.5 8.4.5 8.4.5s6.6 0 8.4-.5a3 3 0 002.1-2.1c.5-1.8.5-5.7.5-5.7zM9.8 15.5v-7l6.2 3.5-6.2 3.5z',
 'facebook':'M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z'}
socs=''.join('<a href="%s" target="_blank" rel="noopener" aria-label="%s"><svg viewBox="0 0 24 24"><path d="%s"/></svg></a>'
             % (E(u), k, ICON[k]) for k,u in SOCIAL.items())

css = open('tools/a.css').read()
tpl = open('tools/a.tpl').read()
# Plain replacement, not str.format - the stylesheet is full of braces.
vals={'CSS':css,'N':str(N),'SLIDES':slide_html,'DOTS':dots,'CARDS':cards,'RAIL':rail,
      'WHY':why,'REVS':revs,'SOCS':socs,'TEL':TEL,'PHONE':PHONE,'PHONE2':PHONE2,
      'WA':E(WA),'VIDEO':E(ALBUM['video'])}
doc=tpl
for k,v in vals.items(): doc=doc.replace('{'+k+'}', v)
open('site/index.html','w',encoding='utf-8').write(doc)
print('site/index.html', len(doc)//1024,'KB | albums:', sum(1 for k,_,_ in CATS if ALBUM.get(k)), '| socials:', len(SOCIAL))
