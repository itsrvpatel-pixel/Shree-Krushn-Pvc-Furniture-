/* Adds a "What people ask us" block and FAQPage structured data to the
   pages that were built before the area pages taught us to include one.

   The eleven pages added in October all carry an FAQ. The thirteen older
   pages - which are the ones that actually earn enquiries: kitchen,
   wardrobe, TV unit, mandir, rates - carry none. Search Console reports
   twelve of seventeen known pages not indexed, and a page that answers
   nothing a person typed is a page Google has little reason to keep.

   Answers are written per page rather than from one template with the
   room name swapped in. Four pages repeating the same warranty
   paragraph would read as one page printed four times, which is the
   problem the area pages were carefully kept away from.

   Every figure here already appears somewhere on the site - the two
   rates and the arithmetic come off the price page, the warranty off
   the certificate. Nothing is invented for the FAQ.

   Run: node tools/page-faqs.mjs
   Idempotent: a page that already has an FAQPage is left alone.
*/
import fs from 'node:fs';
import path from 'node:path';

const site = path.resolve(import.meta.dirname, '..', 'site');

const FAQS = {
  'pvc-modular-kitchen-ahmedabad': [
    ['How much does a PVC modular kitchen cost in Ahmedabad?',
     'A kitchen is mostly box work, which starts at Rs 1,000 per square foot of the finished face - width times height of the front, in feet. The carcass that goes against the wall is framing, from Rs 600. Drawers, tandem baskets and bottle pull-outs are priced per piece, so two homes with the same platform length can land on different totals purely on how many baskets go in.'],
    ['Does PVC survive the heat and steam over a gas hob?',
     'The sheet does. It has no wood in it, so there is nothing to swell or to grow fungus in the damp under the platform. What does need care is the shutter directly beside a burner - we keep a gap there and use a thicker laminate, same as we would with any material. Nobody should put any shutter flush against a flame.'],
    ['Can you make a kitchen in an L-shape or U-shape, with a loft?',
     'L-shape, U-shape, parallel and island are all routine, and the loft or maliya above is part of the same measurement. The layout follows your plumbing and your gas point, not a catalogue drawing - which is why the free visit happens before any design, not after.'],
    ['What hardware goes in, and can I choose it?',
     'Yes, and it is where a kitchen figure moves the most. Ordinary hinges and channels, or soft-close tandem units. We show you both at the visit and put the choice on its own line in the estimate, so you can see exactly what the soft-close is costing you before you commit to it.'],
  ],
  'pvc-wardrobe-ahmedabad': [
    ['What does a PVC wardrobe cost in Ahmedabad?',
     'A wardrobe is box work, from Rs 1,000 per square foot of the front face. A wardrobe 7 feet wide and 7 feet tall is 49 square feet, so about Rs 49,000. Internal drawers and lockers are counted per piece on top, because six drawers and two drawers in the same shell are not the same job.'],
    ['Sliding or hinged - which is better?',
     'Hinged if the room has space for a door to swing, because you see the whole inside at once and the fittings are simpler. Sliding if the gap in front is tight, which in most Ahmedabad flats is the bedroom facing the bed. Sliding costs more, almost entirely because of the channel quality - a cheap sliding channel is the one thing on a wardrobe that will annoy you daily.'],
    ['Will a long hanging rod or a wide shelf sag over time?',
     'Not the way a plain board would. Long shelves are built in hollow PVC, which has ribs running inside the sheet, and the hanging rod is steel carried on the side panels rather than on the shelf. This was the one honest weak spot in PVC years ago and it is not one now.'],
    ['Can you fit a mirror and a loft above?',
     'Both are normal. A full-length mirror goes on a shutter face, and the loft or maliya box above is measured as part of the same unit. Tell us at the visit what actually lives in your wardrobe - sarees need a different internal layout from shirts and folded clothes, and it costs nothing to get that right at the drawing stage.'],
  ],
  'pvc-tv-unit-ahmedabad': [
    ['What does a PVC TV unit cost?',
     'The storage below and any closed cabinet is box work, from Rs 1,000 per square foot of the front face. Plain wall panelling behind the television is framing, from Rs 600. Most TV walls are a mix of the two, and the estimate shows them as separate lines so you can see which part is carrying the cost.'],
    ['Can the wiring be hidden inside the panelling?',
     'Yes - that is half the reason people do the wall rather than just a cabinet. The cables run behind the panel to a point near the socket. The electrical point itself has to exist before we panel over the wall, so if a new socket is needed it is better to say so at the visit than after the panel is up.'],
    ['Will LED profile lighting damage the PVC over time?',
     'No. LED profile runs cool and sits in an aluminium channel, not against the sheet. It is a common addition on the panelling and in open display shelves.'],
    ['How long does a TV wall take?',
     'A TV unit on its own is a short job - it is made in the workshop and fitted at your home, so the mess and the days in your living room are limited. When it is part of a full home it is measured together with everything else and fitted in that run.'],
  ],
  'pvc-pooja-mandir-ahmedabad': [
    ['Why is PVC suited to a pooja mandir?',
     'A mandir takes oil, water and diya heat every single day, and those are exactly the three things that mark and swell wood. PVC wipes clean. An oil ring that would be permanent on a wooden mandir comes off a PVC one with a cloth.'],
    ['Can you do a CNC cut design on the mandir front?',
     'Yes, and it is one of the most asked-for things on a mandir. A CNC cut front is slower to make than a flat shutter, so it is priced as its own line in the estimate rather than being folded into the square foot rate.'],
    ['What sizes are possible - wall mounted or floor standing?',
     'Both, and a corner mandir where there is no clear wall. The size follows what you keep in it and the height at which you want the murti to sit. Bring that to the visit; it decides the design more than the room size does.'],
    ['Does the diya flame damage it?',
     'Keep the flame off the surface, as you would on any material. The usual build puts a metal or stone plate under the diya area for exactly this reason, and that is included in the design, not an extra.'],
  ],
  'pvc-dressing-table-ahmedabad': [
    ['What goes into a PVC dressing table?',
     'A mirror, drawers for everyday things, and usually a small open shelf. It is box work, from Rs 1,000 per square foot of the front face, with the drawers counted per piece. Most dressing tables are made together with the wardrobe so the laminate and the handle match across the room.'],
    ['Can it have lights around the mirror?',
     'Yes. LED profile around or beside the mirror is a common addition and runs in an aluminium channel. Say so at the visit, because the light needs a point and that is easier to plan before the unit is built than after.'],
    ['Will the surface stain from cosmetics and water?',
     'The laminate wipes clean and the sheet under it takes no water, which is the usual complaint with a wooden dressing table over a few years. Spilled nail polish remover should still be wiped quickly, the same as on any finished surface.'],
    ['Can it be built into the wardrobe rather than standing separately?',
     'Often the better answer in a small bedroom. The dressing unit becomes one end of the wardrobe run with a shared loft above. It is measured as one job and usually works out tidier than two separate pieces competing for the same wall.'],
  ],
  'pvc-study-table-ahmedabad': [
    ['What does a PVC study table cost?',
     'It is box work, from Rs 1,000 per square foot of the front face, with drawers per piece. A study table is a small unit, so the figure is driven more by the drawers and the overhead storage than by the table top itself.'],
    ['Will the table top take the weight of books and a monitor?',
     'Yes. Where the span is long - a table running the full width of a wall - it is built in hollow PVC, which has internal ribs and does not bow the way a plain board does. This is the same build used for long wardrobe shelves.'],
    ['Can a study table fit into a small bedroom?',
     'That is most of what we build. A narrow table along one wall with overhead shelving and a drawer unit below takes very little floor and still works for a school or college setup. It is usually made along with the wardrobe so the room reads as one piece.'],
    ['Can wiring for a laptop and lamp be hidden?',
     'Yes, routed behind the back panel to the existing point. As with any built-in unit, the socket needs to be there first.'],
  ],
  'pvc-partition-elevation-ahmedabad': [
    ['What is a PVC partition used for?',
     'Separating a drawing room from a dining area, screening an entrance, or closing off a passage without building a wall. Because it is not masonry, it can be taken down later and the floor underneath is untouched.'],
    ['How is a jali or cut partition priced?',
     'A cut jali is slower to make than a flat panel, so it is its own line in the estimate rather than being averaged into the square foot rate. A plain panelled partition is framing, from Rs 600 per square foot.'],
    ['Can a partition carry storage or a television?',
     'A partition can hold open display shelves easily. For a television it has to be designed for that weight from the start, with the structure behind the panel planned for it - tell us at the visit rather than after it is built.'],
    ['Does it need to touch the ceiling?',
     'No, and often it should not. A partition stopping short of the ceiling keeps the light and the air moving between the two spaces while still breaking the line of sight, which is usually what people actually want.'],
  ],
  'pvc-shoe-rack-ahmedabad': [
    ['Why PVC for a shoe rack specifically?',
     'A shoe cabinet sits by the door, takes wet footwear in monsoon, and is usually the first piece of furniture in any home to smell or swell. PVC takes no water at all, so the damp that destroys a wooden shoe rack has nothing to work on.'],
    ['What does a shoe rack cost?',
     'It is box work, from Rs 1,000 per square foot of the front face. A shoe cabinet is a small unit, so the figure usually turns on how tall it is and whether it includes a seat or a drawer.'],
    ['Can it have ventilation?',
     'Yes. Louvre shutters or a vent cut in the shutter face are both normal on a shoe unit, and worth doing - a closed shoe cabinet with no air holds smell regardless of what it is made of.'],
    ['Can it include a seat for putting shoes on?',
     'Commonly done, with storage below the seat. It is measured as part of the same unit. If there is a mirror or a key shelf going on the same entrance wall, it is worth designing all of it together.'],
  ],
  'pvc-washbasin-cabinet-ahmedabad': [
    ['Is PVC really safe under a washbasin?',
     'This is the single clearest case for PVC. The cabinet under a basin lives in splash and in the damp around the trap, and plywood there fails within a few years no matter how it is sealed. PVC has no wood in it to swell, rot or grow fungus.'],
    ['What does a washbasin cabinet cost?',
     'Box work, from Rs 1,000 per square foot of the front face. It is a small unit, so most of the variation comes from the hardware and whether there are drawers, which are counted per piece.'],
    ['Can it be wall hung?',
     'Yes, and in a small bathroom it is usually the better choice - the floor stays clear and cleaning underneath is easier. A wall hung unit needs the wall to take the fixing, which we check at the visit.'],
    ['Will the laminate peel in constant bathroom humidity?',
     'The laminate is bonded to a sheet that does not move with moisture, which is what causes peeling in a wooden cabinet - the board swells underneath and lifts the surface. With no swelling under it, there is nothing pushing the laminate off.'],
  ],
  '2bhk-pvc-furniture-ahmedabad': [
    ['What does full PVC furniture for a 2BHK cost?',
     'There is no single figure, because it depends on how much of the home is done and in what. Framing starts at Rs 600 per square foot and box work at Rs 1,000, and a whole home is measured unit by unit at the free visit. You get an itemised estimate with the size, rate and amount on every line before anything is ordered.'],
    ['How many days does a full 2BHK take?',
     'About ten days for a full home is the usual run. Most of the making happens in the workshop, so the days your family actually lives around the work are fewer than that.'],
    ['Is it cheaper to do the whole home at once than room by room?',
     'Usually yes, and the bigger gain is not the money. Measured in one go, the design settles as one thing - the same laminate, the same handle, the lofts at the same height across rooms. Done room by room over two years, the laminate batch changes and the rooms stop matching.'],
    ['What is the payment schedule?',
     'Fifty per cent advance at the start of work, and the rest as set out in the estimate terms. The figure on the estimate is the figure you pay - there is no GST added on top, and design, material, labour and transport are already inside the rate.'],
  ],
  '3bhk-pvc-furniture-ahmedabad': [
    ['What does full PVC furniture for a 3BHK cost?',
     'It is measured, not quoted off a size. Framing from Rs 600 per square foot, box work from Rs 1,000, counted on the finished face of each unit. A 3BHK typically means three wardrobes, a kitchen, a TV wall and a mandir, and every one of those is a separate line on the estimate with its own size and amount.'],
    ['Can the work be done in stages while we live there?',
     'Yes, and in an occupied 3BHK that is often how it goes - bedrooms first, kitchen last, or whichever order suits the family. Because the units are made in the workshop, each room is disturbed for a short window rather than the whole home for weeks.'],
    ['Do all three bedrooms have to match?',
     'No, and most do not. The common areas usually share one laminate while each bedroom takes its own, especially where a children’s room is involved. It is settled at the design stage with samples held against your own walls and light.'],
    ['What is covered by the warranty?',
     'Two years, with a written certificate, covering the furniture we make and fit. The certificate is issued with the job, and it also sits inside your app along with the estimate and the work photos.'],
  ],
  'pvc-furniture-price-ahmedabad': [
    ['Why are there two rates instead of one?',
     'Because framing and box work are different amounts of work. Framing is the structure against the wall - a store, the carcass behind a kitchen platform - from Rs 600 per square foot. Box work is a finished closed unit with shutters, shelves and hardware, from Rs 1,000. Most homes need both, so a single average figure would mislead in one direction or the other.'],
    ['Is GST added on top of the estimate?',
     'No. The figure on the estimate is the figure you pay. Design, material, labour, the laminate, the hardware and transport from the workshop are all already inside the rate.'],
    ['How do I know the final bill will match the estimate?',
     'Because the estimate is itemised - every unit with its size, its rate and its amount, nothing as a lump sum. If something is added after the estimate it is added as a visible line, and the whole thing stays in your app where you can read it again at any time.'],
    ['Do you charge for the visit or the design?',
     'Neither. The site visit, the measurement and the drawing are free and carry no obligation. We bring laminate samples to hold against your own wall and light, and leave the written estimate with you.'],
  ],
  'pvc-furniture-vs-plywood-ahmedabad': [
    ['Is PVC actually stronger than plywood?',
     'Not in every way, and it would be dishonest to say so. Good marine plywood is stiffer across a long unsupported span. What PVC does is never swell, never rot and never feed termites, and in an Ahmedabad home it is water and termites that end furniture, not a load test. For the long spans we build in hollow PVC, which has ribs inside the sheet.'],
    ['Does PVC furniture look cheaper than plywood?',
     'The sheet is not what you see - the laminate is, and it is the same laminate used over plywood. We work in 1mm and 1.25mm from Crystal, Orian, Hexa, Flexibond, Rama and Lionia. Put the two side by side with the same laminate and most people cannot tell which is which.'],
    ['Is PVC more expensive than plywood?',
     'In the same finish and the same hardware they land close to each other. The difference shows later: plywood in a kitchen or under a basin needs attention within a few years, and PVC in those places does not.'],
    ['Can PVC take the same hardware as plywood?',
     'Yes - the same hinges, the same soft-close tandem channels, the same sliding systems. Nothing about the hardware choice changes because of the sheet.'],
  ],
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let changed = 0, skipped = 0;

for (const [slug, qas] of Object.entries(FAQS)) {
  const file = path.join(site, slug + '.html');
  if (!fs.existsSync(file)) { console.error('missing: ' + slug); process.exitCode = 1; continue; }
  let html = fs.readFileSync(file, 'utf8');

  if (html.includes('FAQPage')) { skipped++; continue; }

  // The visible block, using the same markup the area pages use so it
  // inherits the existing styles rather than bringing its own.
  const cards = qas
    .map(([q, a]) => '<div class="wi"><h3>' + esc(q) + '</h3><p>' + esc(a) + '</p></div>')
    .join('');
  const block = '\n<div class="why"><div class="w">\n'
    + '  <div class="eyebrow">Common questions</div>\n'
    + '  <h2>What people ask us</h2>\n'
    + '  <div class="wgrid">' + cards + '</div>\n'
    + '</div></div>\n';

  const anchor = '<section id="contact"';
  if (!html.includes(anchor)) { console.error('no contact section: ' + slug); process.exitCode = 1; continue; }
  html = html.replace(anchor, block + anchor);

  // The same questions again as structured data, appended to the @graph
  // the page already carries rather than added as a second script tag -
  // one graph per page is what the other pages do.
  const faqNode = {
    '@type': 'FAQPage',
    mainEntity: qas.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const re = /(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/;
  const m = html.match(re);
  if (!m) { console.error('no ld+json: ' + slug); process.exitCode = 1; continue; }
  const graph = JSON.parse(m[2]);
  if (!Array.isArray(graph['@graph'])) { console.error('no @graph: ' + slug); process.exitCode = 1; continue; }
  graph['@graph'].push(faqNode);
  html = html.replace(re, m[1] + JSON.stringify(graph) + m[3]);

  fs.writeFileSync(file, html);
  changed++;
}

console.log('page-faqs: ' + changed + ' pages given an FAQ, ' + skipped + ' already had one');
