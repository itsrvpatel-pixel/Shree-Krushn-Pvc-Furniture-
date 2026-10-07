// Pages written to cover searches the site was missing entirely.
//
// Picked from live demand, not from guesswork - the keyword research
// behind each one is in the comment above it. Written in full rather
// than templated: a page made by swapping one word into a template
// says nothing specific and ranks for nothing specific, which is
// exactly how "make a page for every search" fails.
import { build } from './make-page.mjs';

const PAGES = [

// "kaka pvc furniture" 880/mo, "kaka pvc furniture ahmedabad" 880,
// "kaka pvc furniture price list" 320, "kaka pvc furniture price list
// pdf" 140, "kaka pvc furniture near me" 260 - roughly 2,500 searches
// a month for the material this workshop actually builds with, and
// not one page about it. The people searching it already know they
// want PVC and are looking for the brand; that is the warmest traffic
// on the whole list.
{
  slug: 'kaka-pvc-furniture-ahmedabad',
  title: 'Kaka PVC Furniture Ahmedabad | Hollow PVC, Rate, Grades - Shree Krushn',
  desc: 'We build with Kaka PVC sheet, foam board and hollow PVC - what the grades mean, which sheet goes where, the rate per sq ft in Ahmedabad, and how to tell a real sheet from a copy.',
  h1: 'Kaka PVC Furniture in Ahmedabad',
  serviceType: 'Kaka PVC furniture',
  og: 'index',
  intro: 'Kaka is the PVC sheet we build with. This page is what we tell customers who ask for it by name - what the grades mean, what it actually costs, and how to check you are getting it.',
  chips: ['<b>500+</b> designs made', '2 year warranty', '100% virgin PVC', 'Ahmedabad'],
  faq: [
    { q: 'What is the price of Kaka PVC furniture per square foot in Ahmedabad?',
      a: 'Our work starts from around Rs 600 per sq ft and goes up with the sheet thickness, the hardware and how much of it is drawers and pull-outs rather than plain shutters. A wardrobe runs lower per foot than a kitchen, because a kitchen is mostly moving parts. We measure at your home and give an itemised written rate before anything is ordered - no deposit for that.' },
    { q: 'Is Kaka PVC furniture good for a home?',
      a: 'For a kitchen, a bathroom cabinet or anything against an outside wall it beats plywood outright - there is no wood in it, so water cannot swell it and termites have nothing to eat. Long shelves used to be the one weak spot, and they are not any more: for those we build in hollow PVC, which has internal ribs running down the sheet and does not sag the way a plain board does. We pick the sheet per piece of furniture rather than using one board for the whole house.' },
    { q: 'How do I know the sheet is really Kaka and not a copy?',
      a: 'Ask to see the sheet before it is cut. The genuine sheet carries the brand printed along the edge that gets trimmed off, and it has a consistent density - a copy feels lighter and the foam inside looks coarse. We show the stock to the customer on request, and the brand and thickness are written on your estimate, so there is a record of what you paid for.' },
    { q: 'Which is better, wooden furniture or PVC?',
      a: 'They fail in different places. Wood is stronger per inch and takes a screw better, so it wins for long shelves and heavy loads. PVC does not care about water, damp walls or termites, which is what actually destroys furniture in an Ahmedabad kitchen or near a washbasin. Most homes we do are PVC in the wet and humid rooms, and that is the honest split.' },
    { q: 'How long does Kaka PVC furniture last?',
      a: 'The sheet itself does not rot or get eaten, so what wears out is the hardware - hinges, channels and soft-close. We use branded hardware and give a two-year written warranty with free service visits inside it, which covers the adjustment a new fitting always needs in the first year.' },
  ],
  sections: `
<section class="w" style="padding-top:26px">
  <div class="eyebrow">The material</div>
  <h2>What you are actually buying</h2>
  <p>A PVC sheet is foam board with a laminate face. The board is what decides whether your furniture survives a leaking platform; the laminate is what decides how it looks. Most arguments about PVC are really arguments about which of the two somebody skimped on.</p>
  <ul class="incl">
    <li><b>Thickness</b> - 18mm for shutters and carcass, 12mm where weight allows, 25mm for a kitchen platform run</li>
    <li><b>Virgin vs recycled</b> - recycled board is cheaper, heavier and splits at the screw. We use virgin</li>
    <li><b>Density</b> - a low-density sheet will not hold a hinge screw after a year of opening</li>
    <li><b>Laminate</b> - the finish, and the only part you will actually look at</li>
    <li><b>Edge banding</b> - a bad edge is where moisture gets in, even on PVC</li>
  </ul>
</section>

<section class="w">
  <div class="eyebrow">Foam board and hollow board</div>
  <h2>Two different sheets, and we use both</h2>
  <p>Most PVC furniture talk is about foam board - a solid sheet, easy to machine, good for shutters and carcass. It has one honest weakness: span it far enough with weight on it and it will bow, the same as any flat board will.</p>
  <p>Hollow PVC is the answer to that. The sheet is not solid; it carries internal ribs running along its length, so it behaves like a beam rather than a plank. A long shelf, a wide wardrobe loft, a run of overhead kitchen storage - these are where we use it, and they are exactly the places where a plain board starts to dip after a year of weight.</p>
  <p>We do a lot of work in hollow PVC for that reason. Which sheet goes where is decided piece by piece at the measuring visit, and it is written on your estimate - so you can see what you are paying for rather than being handed one rate for "PVC".</p>
  <ul class="incl">
    <li><b>Hollow PVC</b> - long shelves, lofts, wide overhead runs, anything that has to span and carry</li>
    <li><b>Foam board</b> - shutters, carcass, drawer boxes, anything shaped or routed</li>
    <li><b>Both are waterproof and termite proof</b> - the choice is about stiffness, not about damp</li>
  </ul>
</section>

<div class="why"><div class="w">
  <div class="eyebrow">Where it belongs</div>
  <h2>Rooms where PVC is the right answer</h2>
  <p class="note" style="margin-top:8px">The longer comparison: <a href="/pvc-furniture-vs-plywood-ahmedabad">PVC vs plywood</a>.</p>
  <div class="wgrid">
    <div class="wi"><h3>Kitchen</h3><p>Steam, a wet sink cabinet and the damp under the platform. This is where wooden shutters swell first. <a href="/pvc-modular-kitchen-ahmedabad">PVC modular kitchen</a>.</p></div>
    <div class="wi"><h3>Wardrobe on an outside wall</h3><p>Monsoon damp comes through the wall and sits behind the back panel. PVC does not mind. <a href="/pvc-wardrobe-ahmedabad">PVC wardrobe</a>.</p></div>
    <div class="wi"><h3>Washbasin and bathroom</h3><p>Permanent splash. Nothing wooden lasts under a basin. <a href="/pvc-washbasin-cabinet-ahmedabad">Washbasin cabinet</a>.</p></div>
    <div class="wi"><h3>Ground floor and old buildings</h3><p>Rising damp and termites, the two things PVC is simply immune to.</p></div>
  </div>
</div></div>

<section class="w">
  <div class="eyebrow">Rate</div>
  <h2>What it costs in Ahmedabad</h2>
  <p>From about Rs 600 per sq ft. What moves the number is the hardware and the proportion of drawers to plain shutters, not the brand name on the sheet. Our full rate card, room by room, is on the <a href="/pvc-furniture-price-ahmedabad">price page</a> - or put your own measurements into the instant estimate and see a figure in a minute, without talking to anyone.</p>
  <div style="margin-top:18px"><a class="btn b3" href="/app?do=estimate">Work out your own estimate</a></div>
</section>
`,
},

// "pvc furniture design" 1,000/mo, "pvc kitchen furniture design" 210,
// "pvc furniture design for bedroom" 210, "pvc furniture colour
// combination" 170, "pvc furniture photos" 170, "tv unit pvc furniture
// design" 140, "pvc furniture design for kitchen" 140, "pvc furniture
// design for living room" 110, "pvc furniture colour" 390. Close to
// 2,500 a month of people looking for ideas before they look for a
// price - and this workshop has 500+ photographs of its own work
// sitting in the app, which is the one thing most of the competing
// pages do not have.
{
  slug: 'pvc-furniture-design-ahmedabad',
  title: 'PVC Furniture Design in Ahmedabad | Photos, Colours - Shree Krushn',
  desc: 'PVC furniture design ideas from work we have actually fitted in Ahmedabad - kitchen, wardrobe, TV unit, bedroom. Colour combinations and 500+ photos.',
  h1: 'PVC Furniture Design in Ahmedabad',
  serviceType: 'PVC furniture design',
  og: 'index',
  intro: 'Design ideas from homes we have actually fitted, not catalogue renders. Every photo here is a job that was measured, built and handed over in Ahmedabad.',
  chips: ['<b>500+</b> designs made', 'Real homes, not renders', '2 year warranty', 'Ahmedabad'],
  faq: [
    { q: 'Which colour combination looks best in PVC furniture?',
      a: 'The one that survives the room, not the one that looks best in the shop. A dark matte finish shows every fingerprint in a kitchen, and a high-gloss white shows every scratch in a childrens room. What works in most Ahmedabad flats is a light body with one darker accent - shutters in a wood-grain laminate against a plain carcass, or a dark base with light overheads so the kitchen does not close in. We bring laminate samples to the site visit and hold them against your actual wall and light, which tells you more in two minutes than an hour of scrolling.' },
    { q: 'Can PVC furniture be made in any design?',
      a: 'Nearly. It routs, grooves and takes a profile shutter well, and it can be louvred or fluted. Where it differs from plywood is carving and very thin decorative sections - those are better in another material, and we will say so. Anything built to a measurement, which is most of a home, is no harder in PVC than in wood.' },
    { q: 'Do you have PVC furniture photos of real work?',
      a: 'Over 500, sorted by room, in the app - kitchens, wardrobes, TV units, mandirs, dressing tables, partitions. They are our own jobs in Ahmedabad homes, photographed after handover. You can browse them without registering and save the ones you like, and the ones you save come up at the measuring visit so nobody has to describe a design from memory.' },
    { q: 'What is the latest design trend in PVC furniture?',
      a: 'Handleless shutters with a J-profile or a groove, fluted panels on a TV wall, and matte finishes instead of high gloss. In kitchens, tall units instead of a loft you need a stool for. These are all straightforward in PVC - the sheet takes a profile well - so a modern look does not cost what it used to.' },
  ],
  sections: `
<section class="w" style="padding-top:26px">
  <div class="eyebrow">By room</div>
  <h2>Start where the work is</h2>
  <p>Design is easier to judge room by room than as one big idea. Each of these pages has photos of that room only, with what a job there actually includes.</p>
  <ul class="incl">
    <li><a href="/pvc-modular-kitchen-ahmedabad">Modular kitchen</a> - L, U, parallel and island, with pull-outs and loft</li>
    <li><a href="/pvc-wardrobe-ahmedabad">Wardrobe</a> - 2, 3 and 4 door, sliding, with loft and dresser</li>
    <li><a href="/pvc-tv-unit-ahmedabad">TV unit and wall panelling</a> - fluted panels, floating units</li>
    <li><a href="/pvc-dressing-table-ahmedabad">Dressing table</a> - with mirror, drawers and light</li>
    <li><a href="/pvc-pooja-mandir-ahmedabad">Pooja mandir</a> - wall-mounted and floor-standing</li>
    <li><a href="/pvc-study-table-ahmedabad">Study table</a> - with book shelf and overhead storage</li>
    <li><a href="/pvc-partition-elevation-ahmedabad">Partition and elevation</a> - room dividers and feature walls</li>
  </ul>
  <div style="margin-top:18px"><a class="btn b3" href="/app?do=designs">Browse all 500+ designs in the app</a></div>
</section>

<div class="why"><div class="w">
  <div class="eyebrow">Choosing a finish</div>
  <h2>What actually decides how it looks in a year</h2>
  <div class="wgrid">
    <div class="wi"><h3>Matte over gloss in a kitchen</h3><p>Gloss shows every fingerprint and every wipe mark. Matte hides both and does not dull with cleaning.</p></div>
    <div class="wi"><h3>Light body, dark accent</h3><p>An all-dark kitchen in a standard Ahmedabad flat makes the room feel half its size. One accent run is usually enough.</p></div>
    <div class="wi"><h3>Grain direction</h3><p>A wood-grain laminate run the wrong way across two adjacent shutters is the commonest finishing mistake, and it cannot be fixed afterwards.</p></div>
    <div class="wi"><h3>Handleless costs less than it looks</h3><p>A J-profile or a routed groove removes the handle line entirely, and in PVC it is a cut rather than an extra part.</p></div>
  </div>
</div></div>

<section class="w">
  <div class="eyebrow">From design to a number</div>
  <h2>Saved designs come to the visit</h2>
  <p>Pick what you like in the app and save it. Those exact photos come up when we measure, so the conversation starts from a picture instead of a description - which is the single biggest reason finished work ends up looking like what somebody had in mind.</p>
  <p>If you want the price before you talk to anyone, the <a href="/app?do=estimate">instant estimate</a> works from your own measurements, and the full rate card is on the <a href="/pvc-furniture-price-ahmedabad">price page</a>.</p>
</section>
`,
},

];

for (const p of PAGES) build(p);
console.log(PAGES.length + ' page(s) written to site/');
