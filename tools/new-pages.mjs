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
  title: 'Kaka PVC Furniture in Ahmedabad | Sheet, Rate, Warranty - Shree Krushn',
  desc: 'We build with Kaka PVC sheet - what the grades mean, what it costs per sq ft in Ahmedabad, and how to tell the real sheet from a copy. Free site visit.',
  h1: 'Kaka PVC Furniture in Ahmedabad',
  serviceType: 'Kaka PVC furniture',
  og: 'index',
  intro: 'Kaka is the PVC sheet we build with. This page is what we tell customers who ask for it by name - what the grades mean, what it actually costs, and how to check you are getting it.',
  chips: ['<b>500+</b> designs made', '2 year warranty', '100% virgin PVC', 'Ahmedabad'],
  faq: [
    { q: 'What is the price of Kaka PVC furniture per square foot in Ahmedabad?',
      a: 'Our work starts from around Rs 600 per sq ft and goes up with the sheet thickness, the hardware and how much of it is drawers and pull-outs rather than plain shutters. A wardrobe runs lower per foot than a kitchen, because a kitchen is mostly moving parts. We measure at your home and give an itemised written rate before anything is ordered - no deposit for that.' },
    { q: 'Is Kaka PVC furniture good for a home?',
      a: 'For a kitchen, a bathroom cabinet or anything against an outside wall, it is better than plywood - there is no wood in it, so water cannot swell it and termites have nothing to eat. For a bookshelf carrying heavy weight across a long span, solid wood still bends less. We will say so at the visit rather than sell you the wrong thing.' },
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

];

for (const p of PAGES) build(p);
console.log(PAGES.length + ' page(s) written to site/');
