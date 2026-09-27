import json, html, os, re
g=json.load(open('/tmp/gallery.json'))
pick=json.load(open('/tmp/gallerypick.json'))
content=json.load(open('/tmp/content.json'))
m2=json.load(open('/tmp/m2.json')); man=m2['man']
def E(s): return html.escape(str(s),quote=True)

TEL='+917990283116'; PHONE='+91 79902 83116'; PHONE2='+91 95123 18775'
WA='https://wa.me/message/ZMRRGHFC4ZQTD1'
SOCIAL={'instagram':'https://instagram.com/shree_krushn_pvc_furniture',
        'facebook':'https://www.facebook.com/ShreeKrushnFiberMart',
        'youtube':'https://youtube.com/@shreekrushnpvcfurniture'}
ALBUM={'Kitchen':'https://photos.app.goo.gl/5uhwAmxXyJupxHUj8',
 'Wardrobe':'https://photos.app.goo.gl/kz5x7b7q51BCcE978',
 'TV Unit':'https://photos.app.goo.gl/KJNTpBYySt2oKg1RA',
 'Dressing Table':'https://photos.app.goo.gl/pM1gbG1rgwZsD3fT7',
 'Partition elevation':'https://photos.app.goo.gl/D2QtQk36A4NfbquC7',
 'Mandir':'https://photos.app.goo.gl/nCao1kup3ghmwy1f8',
 'Study table':'https://photos.app.goo.gl/epDizQTEjDuUvhHz9'}
VIDEO='https://photos.app.goo.gl/VjCAgj15E6opigDSA'

# slug, H1, <title>, the sentence under the H1, and what a job includes.
# Written for each room rather than one template with the name swapped -
# a page that says nothing specific ranks for nothing specific.
PAGES=[
 ('Kitchen','pvc-modular-kitchen-ahmedabad','PVC Modular Kitchen in Ahmedabad',
  'PVC Modular Kitchen Ahmedabad | Waterproof Kitchen Furniture - Shree Krushn',
  'A kitchen is where wooden furniture dies first - steam off the hob, water round the sink, and the damp under the platform that nobody sees until the shutter swells. PVC has no wood in it, so none of that touches it.',
  ['L-shape, U-shape, parallel and island layouts','Tandem baskets, cutlery and bottle pull-outs','Loft and maliya storage above','Crockery unit, service counter and store cabinets','Soft-close hinges and channels','Waterproof sink cabinet']),
 ('Wardrobe','pvc-wardrobe-ahmedabad','PVC Wardrobe in Ahmedabad',
  'PVC Wardrobe Ahmedabad | 2, 3 and 4 Door Wardrobe Design - Shree Krushn',
  'Two, three and four door, sliding, or a full walk-in along one wall. Hanging, shelves, drawers and a loft above, worked out around what you actually keep in it.',
  ['Two, three and four door, hinged or sliding','Loft and maliya box above','Internal drawers, lockers and shelves','Full-length mirror on a shutter','Walk-in and corner layouts','Soft-close fittings']),
 ('TV Unit','pvc-tv-unit-ahmedabad','PVC TV Unit in Ahmedabad',
  'PVC TV Unit Ahmedabad | TV Cabinet and Wall Panelling - Shree Krushn',
  'The wall behind the television, done properly - panelling, concealed wiring, storage below and open shelves where you want them.',
  ['Wall panelling behind the television','Drawers and closed storage below','Open display shelves','Concealed wiring and sockets','LED profile lighting','Matching side units']),
 ('Mandir','pvc-pooja-mandir-ahmedabad','PVC Pooja Mandir in Ahmedabad',
  'PVC Pooja Mandir Ahmedabad | Temple Design for Home - Shree Krushn',
  'A mandir takes oil, water and diya heat every day. PVC wipes clean and does not stain or swell, which is why it suits the pooja room better than wood.',
  ['Carved and CNC-cut doors','Bell and ghanti fittings','Drawer for samagri','Wall-mounted and floor-standing','Backlit and LED profile options','Marble-finish panels']),
 ('Dressing Table','pvc-dressing-table-ahmedabad','PVC Dressing Table in Ahmedabad',
  'PVC Dressing Table Ahmedabad | Dresser with Mirror - Shree Krushn',
  'Full mirror, drawers for what you use every morning, and closed storage for the rest. Wall-hung or floor-standing, sized to the space you have.',
  ['Full-length or half mirror','Drawers and side storage','Wall-hung or floor-standing','Mirror lighting','Matching stool','Jewellery drawer with lock']),
 ('Study table','pvc-study-table-ahmedabad','PVC Study Table in Ahmedabad',
  'PVC Study Table Ahmedabad | Study Unit and Book Shelf - Shree Krushn',
  'A desk that fits the room rather than the other way round - overhead storage, a book shelf, and drawers at the right height.',
  ['Overhead storage cabinets','Open book shelves','Drawer unit and keyboard tray','Wall-mounted or floor-standing','Cable routing','Matching chair-height finish']),
 ('Partition elevation','pvc-partition-elevation-ahmedabad','PVC Partition and Wall Elevation in Ahmedabad',
  'PVC Partition Ahmedabad | Room Divider and Wall Elevation - Shree Krushn',
  'A divider that separates without closing the room in - jali, louvre and panel designs, and full wall elevations in the hall.',
  ['Jali and CNC-cut partitions','Louvre and fluted panels','Full wall elevation in the hall','Backlit and LED profile','Half-height and full-height','Matching entrance panelling']),
 ('Shoes box','pvc-shoe-rack-ahmedabad','PVC Shoe Rack in Ahmedabad',
  'PVC Shoe Rack Ahmedabad | Shoe Cabinet with Bench - Shree Krushn',
  'By the door, where it gets wet feet and monsoon mud. Closed shutters, a bench to sit on, and no swelling at the bottom shelf.',
  ['Closed shutter and tilt-out racks','Bench top to sit on','Umbrella and helmet space','Wall-hung and floor-standing','Ventilated shelves','Matching entrance unit']),
 ('Washbasin','pvc-washbasin-cabinet-ahmedabad','PVC Washbasin Cabinet in Ahmedabad',
  'PVC Washbasin Cabinet Ahmedabad | Waterproof Vanity Unit - Shree Krushn',
  'Under a basin, plywood has a short life. This is the one place where waterproof is not a selling line but the whole point.',
  ['Waterproof cabinet under the basin','Mirror unit with storage','Wall-hung and floor-standing','Soft-close drawers','Matching side cabinet','Concealed plumbing access']),
 ('Color pop','false-ceiling-pop-work-ahmedabad','False Ceiling and POP Work in Ahmedabad',
  'False Ceiling and POP Work Ahmedabad | Colour and Painting - Shree Krushn',
  'Ceiling, POP and paint, done alongside the furniture so the whole room is finished by one team on one timeline.',
  ['POP and gypsum false ceiling','Cove and profile lighting','Wall putty and painting','Texture and accent walls','Done with the furniture work','One team, one schedule']),
 ('electric','electrical-work-ahmedabad','Electrical Work in Ahmedabad',
  'Electrical Work Ahmedabad | Wiring and Light Fitting - Shree Krushn',
  'Points where the furniture needs them, not where they happen to be. Planned with the layout so nothing ends up behind a cabinet.',
  ['Concealed wiring and conduiting','New points and switch boards','Light and profile fitting','Kitchen and platform points','Planned with the furniture layout','Tested and certified']),
]
SHORT={'Kitchen':'Modular Kitchen','Wardrobe':'Wardrobe','TV Unit':'TV Unit','Mandir':'Pooja Mandir',
 'Dressing Table':'Dressing Table','Study table':'Study Table','Partition elevation':'Partition & Elevation',
 'Shoes box':'Shoe Rack','Washbasin':'Washbasin Unit','Color pop':'Colour & POP','electric':'Electrical'}
SLUG={k:s for k,s,_,_,_,_ in PAGES}
N=sum(len(v) for v in g.values())
ICON={'instagram':'M12 2.2c3.2 0 3.6 0 4.9.07 3.3.15 4.8 1.7 5 5 .06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.2 3.3-1.7 4.8-5 5-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-3.3-.2-4.8-1.7-5-5C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.2-3.3 1.7-4.8 5-5C8.4 2.2 8.8 2.2 12 2.2zm0 3.4a6.4 6.4 0 100 12.8 6.4 6.4 0 000-12.8zm0 10.6a4.2 4.2 0 110-8.4 4.2 4.2 0 010 8.4zm6.6-10.9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
 'youtube':'M23 12s0-3.9-.5-5.7a3 3 0 00-2.1-2.1C18.6 3.7 12 3.7 12 3.7s-6.6 0-8.4.5A3 3 0 001.5 6.3C1 8.1 1 12 1 12s0 3.9.5 5.7a3 3 0 002.1 2.1c1.8.5 8.4.5 8.4.5s6.6 0 8.4-.5a3 3 0 002.1-2.1c.5-1.8.5-5.7.5-5.7zM9.8 15.5v-7l6.2 3.5-6.2 3.5z',
 'facebook':'M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z'}
socs=''.join('<a href="%s" target="_blank" rel="noopener" aria-label="%s"><svg viewBox="0 0 24 24"><path d="%s"/></svg></a>'
             % (E(u),k,ICON[k]) for k,u in SOCIAL.items())
revs=''.join('<figure><div class="st">%s</div><blockquote>%s</blockquote><figcaption>%s</figcaption></figure>'
             % ('&#9733;'*int(r.get('rating',5)), E(r.get('text','')), E(r.get('customerName','')))
             for r in content['featured_reviews'])
css=open('/tmp/a.css').read()+open('/tmp/cat.css').read()
tpl=open('/tmp/cat.tpl').read()

for key,slug,h1,title,intro,incl in PAGES:
    photos=pick.get(key,[])
    grid=''.join('<img src="img/g/%s" alt="%s design %d - Shree Krushn PVC Furniture, Nikol Ahmedabad" loading="lazy" />'
                 % (n, E(h1.replace(' in Ahmedabad','')), i+1) for i,n in enumerate(photos))
    incl_html=''.join('<li>%s</li>' % E(x) for x in incl)
    others=''.join('<a class="oc" href="%s.html"><img src="img/card/%s" alt="" loading="lazy" /><span>%s</span></a>'
                   % (SLUG[k], man[k][0], E(SHORT[k])) for k,_,_,_,_,_ in PAGES if k!=key and man.get(k))
    album=ALBUM.get(key)
    album_btn=('<a class="btn b3" href="%s" target="_blank" rel="noopener">See all %d designs in the album</a>'
               % (E(album), len(g.get(key,[]))) if album else
               '<a class="btn b3" href="%s" target="_blank" rel="noopener">Watch the work on video</a>' % E(VIDEO))
    ld={"@context":"https://schema.org","@type":"Service","serviceType":h1.replace(' in Ahmedabad',''),
        "provider":{"@type":"HomeAndConstructionBusiness","name":"Shree Krushn PVC Furniture",
          "telephone":"+91-79902-83116",
          "address":{"@type":"PostalAddress","streetAddress":"Nikol","addressLocality":"Ahmedabad",
                     "addressRegion":"Gujarat","postalCode":"382350","addressCountry":"IN"}},
        "areaServed":{"@type":"City","name":"Ahmedabad"},
        "description":intro[:250]}
    vals={'CSS':css,'TITLE':E(title),'DESC':E(intro[:155]),'SLUG':slug,'H1':E(h1),'INTRO':E(intro),
          'GRID':grid,'INCL':incl_html,'OTHERS':others,'ALBUMBTN':album_btn,'REVS':revs,'SOCS':socs,
          'COUNT':str(len(g.get(key,[]))),'N':str(N),'TEL':TEL,'PHONE':PHONE,'PHONE2':PHONE2,'WA':E(WA),
          'LD':json.dumps(ld)}
    doc=tpl
    for k2,v2 in vals.items(): doc=doc.replace('{'+k2+'}', v2)
    open('site/%s.html'%slug,'w',encoding='utf-8').write(doc)
    print('%-40s %2d photos  %d KB' % (slug+'.html', len(photos), len(doc)//1024))
json.dump({k:SLUG[k] for k in SLUG}, open('/tmp/slugs.json','w'))
