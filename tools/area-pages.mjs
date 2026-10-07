// A page for each area the workshop actually works in.
//
// He named them: Bopal, Shela, Vaishnodevi, Chandkheda, Naroda,
// Kasindra, Vastral, Ranip, Gota. That matters more than it sounds -
// area pages are the standard way to reach "pvc furniture near me"
// (4,400/mo) and "pvc furniture <area>", and they are also the
// standard way to get a site penalised. Sixteen copies of one
// template with the name swapped is a doorway-page set, and Google
// has been removing those for fifteen years.
//
// So each page here says something true that only applies to that
// area: what the housing stock is, which rooms people there actually
// order, and what that means for the work. Nothing is claimed about
// jobs done in a particular street, because inventing that is the
// other way this goes wrong.
import { build } from './make-page.mjs';

const AREAS = [
  {
    name: 'Bopal',
    extra: 'One thing worth planning in a new Bopal flat: the loft. Ceilings here are generous, and the space above a wardrobe is the cheapest storage in the house - but only if it is built in at the same time. Adding it a year later means taking the wardrobe top off.', slug: 'pvc-furniture-bopal',
    intro: 'Bopal is mostly newer flats and bungalow schemes, handed over bare. Most of what we do here is a full home at once rather than one room at a time.',
    stock: 'Bopal and the schemes around it are new build - 3BHK and 4BHK flats, and row houses with a lot of wall to fill. Possession usually comes with nothing but a platform and a few points, so the job is the whole house: kitchen, every wardrobe, TV wall, mandir, and often a study.',
    lead: 'Full home packages, modular kitchens and walk-in wardrobes.',
    note: 'New flats have one practical advantage: we measure before anything is in the way, so fitting is faster and cleaner than a retrofit.',
    rooms: ['2bhk-pvc-furniture-ahmedabad', '3bhk-pvc-furniture-ahmedabad', 'pvc-modular-kitchen-ahmedabad', 'pvc-wardrobe-ahmedabad'],
  },
  {
    name: 'Shela',
    extra: 'A practical note on new possessions in Shela: get the kitchen measured before the platform is tiled if you can. Where the sink and the hob land decides the whole cabinet run, and changing it after tiling costs more than it should.', slug: 'pvc-furniture-shela',
    intro: 'Shela is still being built, which means a steady run of fresh possessions and empty flats waiting on furniture.',
    stock: 'Shela is almost entirely new towers and schemes, a lot of them 3BHK. Buyers here tend to be moving in for the first time rather than replacing old furniture, so budget goes on getting the whole flat usable at once - kitchen first, then wardrobes, then the living room.',
    lead: 'Full home packages and first-time kitchen fit-outs.',
    note: 'A new scheme usually has several flats being done at the same time. If neighbours are fitting together, measuring on the same trip saves everyone time.',
    rooms: ['3bhk-pvc-furniture-ahmedabad', 'pvc-modular-kitchen-ahmedabad', 'pvc-wardrobe-ahmedabad', 'pvc-tv-unit-ahmedabad'],
  },
  {
    name: 'Vaishnodevi',
    extra: 'If the flat is for letting, the shutters and the handles are what take the damage, not the carcass. We can match a laminate years later on a shutter without touching the rest, which is worth knowing before anyone picks a discontinued finish.', slug: 'pvc-furniture-vaishnodevi',
    intro: 'Vaishnodevi Circle and the schemes off the SG Highway side - newer towers, and flats bought as much to let as to live in.',
    stock: 'A mix here: owner-occupied 3BHK flats, and a good number bought to rent out. The rental ones want furniture that survives tenants and cleans up between them, which is the one job PVC is unarguably better at than plywood - nothing swells, nothing gets eaten, and a wipe takes a mark off.',
    lead: 'Kitchens, wardrobes and let-ready full-flat work.',
    note: 'For a flat you are letting, we will tell you where to spend and where not to. Soft-close on a rental kitchen is money you will not see back.',
    rooms: ['pvc-modular-kitchen-ahmedabad', 'pvc-wardrobe-ahmedabad', '2bhk-pvc-furniture-ahmedabad', 'pvc-furniture-price-ahmedabad'],
  },
  {
    name: 'Chandkheda',
    extra: 'In an older Chandkheda kitchen the common surprise is behind the platform - a leaking trap that has been quietly wetting the cabinet for years. We see it when the old unit comes out, and it is better fixed then than after a new one is in.', slug: 'pvc-furniture-chandkheda',
    intro: 'Chandkheda has both - large older flat schemes where the kitchen is due a replacement, and new towers out towards Motera.',
    stock: 'The older schemes here were fitted fifteen or twenty years ago, and what brings people to us is a kitchen that has finally gone: swollen shutters under the sink, a platform cabinet that smells of damp. Replacing just the kitchen in PVC and leaving the rest is a perfectly sensible job, and a common one in Chandkheda.',
    lead: 'Kitchen replacements, wardrobes, and new-flat full homes.',
    note: 'A replacement is measured around what is staying. We take the old unit out and fit on the same day wherever the run allows, so the kitchen is not unusable for a week.',
    rooms: ['pvc-modular-kitchen-ahmedabad', 'pvc-washbasin-cabinet-ahmedabad', 'pvc-wardrobe-ahmedabad', 'pvc-furniture-vs-plywood-ahmedabad'],
  },
  {
    name: 'Naroda',
    extra: 'After twenty years of use the wall itself is often the problem, not the furniture - a damp patch behind a wardrobe that has been there so long nobody notices. PVC will not rot against it, but it is worth knowing the wall is wet before deciding what goes there.', slug: 'pvc-furniture-naroda',
    intro: 'Naroda is our own side of the city, so visits here are quick and a site problem does not cost a day to come back for.',
    stock: 'Established housing, a lot of it twenty years old and more, with the furniture to match. Kitchens and wardrobes that have taken two decades of Ahmedabad humidity are the usual starting point, and the second room tends to follow once people see the first one finished.',
    lead: 'Kitchen and wardrobe replacements, mandirs, full homes.',
    note: 'Being close means we can come for a measurement at short notice, and it means a service call inside the warranty is a short trip rather than a scheduling problem.',
    rooms: ['pvc-modular-kitchen-ahmedabad', 'pvc-wardrobe-ahmedabad', 'pvc-pooja-mandir-ahmedabad', 'pvc-furniture-price-ahmedabad'],
  },
  {
    name: 'Kasindra',
    extra: 'If the budget has to be split, do the wet rooms first and the dry ones later. A kitchen or a washbasin cabinet in PVC earns its money back; a bedroom wardrobe on an inside wall is in no hurry, and can wait a season without any loss.', slug: 'pvc-furniture-kasindra',
    intro: 'Kasindra and the stretch out towards Narol - newer affordable schemes, and homes where the budget has to be spent carefully.',
    stock: 'A lot of 1BHK and 2BHK here, and the question is almost always what to do first. Our answer is usually the kitchen: it is where wooden furniture fails fastest, so it is where PVC saves the most. Wardrobes can follow next year without anything having to be redone.',
    lead: 'Kitchens first, wardrobes and storage after.',
    note: 'We will quote the whole flat and the kitchen alone, so you can see what phasing it actually costs. Nothing about doing it in stages makes the later work more expensive.',
    rooms: ['pvc-modular-kitchen-ahmedabad', '2bhk-pvc-furniture-ahmedabad', 'pvc-furniture-price-ahmedabad', 'pvc-shoe-rack-ahmedabad'],
  },
  {
    name: 'Vastral',
    extra: 'On a ground floor, check the bottom of whatever is there now. If the lowest six inches of an old wardrobe are soft, that is rising damp, and it will do the same to anything wooden that replaces it - which is usually the moment people switch material.', slug: 'pvc-furniture-vastral',
    intro: 'Vastral has grown fast since the metro, and the housing shows it - new schemes next to streets that have been there for decades.',
    stock: 'Both kinds of job here. New flats near the metro line wanting the full fit-out, and older houses replacing a kitchen or adding wardrobes. Ground-floor homes are common, and those have a damp problem that decides the material on its own.',
    lead: 'Full homes in new schemes, kitchen and wardrobe work in older ones.',
    note: 'On a ground floor, rising damp is what eats wooden furniture from the bottom. PVC has nothing to rot, which is why most ground-floor jobs here end up in it.',
    rooms: ['pvc-modular-kitchen-ahmedabad', 'pvc-wardrobe-ahmedabad', '2bhk-pvc-furniture-ahmedabad', 'pvc-furniture-vs-plywood-ahmedabad'],
  },
  {
    name: 'Ranip',
    extra: 'An old carpenter-built kitchen often hides its measurements: a run that looks straight can be an inch out from one end to the other. We measure at three heights rather than one, because a cabinet cut to the wrong one of those does not close properly.', slug: 'pvc-furniture-ranip',
    intro: 'Ranip is long-settled, and most of the work here is replacing furniture that has done its twenty years.',
    stock: 'Older flats and houses, often with a kitchen that was built in by a carpenter on site rather than fitted as units. That changes the job: the old work usually has to come out in pieces, and the new run is measured to walls that are rarely square. It is normal here and we plan for it.',
    lead: 'Kitchen replacements, wardrobes, washbasin cabinets.',
    note: 'An old carpenter-built kitchen is not a standard size anywhere. Everything is cut to the measurement we take, which is why the visit matters more on a job like this than on a new flat.',
    rooms: ['pvc-modular-kitchen-ahmedabad', 'pvc-washbasin-cabinet-ahmedabad', 'pvc-wardrobe-ahmedabad', 'pvc-furniture-price-ahmedabad'],
  },
  {
    name: 'Gota',
    extra: 'Before possession paperwork is done, take photos of the bare flat with a tape in frame. It makes the first estimate far more accurate, and in a new Gota tower where several flats share a layout, it also tells us straight away which one yours is.', slug: 'pvc-furniture-gota',
    intro: 'Gota has filled up quickly with new flat schemes, and most homes here are getting their first furniture rather than their second.',
    stock: 'Largely new 2BHK and 3BHK towers. Possession comes bare, so the order is usually kitchen, wardrobes, TV unit, in that sequence - and often all three at once because the family has not moved in yet and the flat is empty to work in.',
    lead: 'Full home packages and new-possession kitchens.',
    note: 'An empty flat is the cheapest time to do this. No furniture to work around, no dust covers, and the fitting runs straight through.',
    rooms: ['2bhk-pvc-furniture-ahmedabad', '3bhk-pvc-furniture-ahmedabad', 'pvc-modular-kitchen-ahmedabad', 'pvc-tv-unit-ahmedabad'],
  },
];

const LABEL = {
  '2bhk-pvc-furniture-ahmedabad': '2BHK full home package',
  '3bhk-pvc-furniture-ahmedabad': '3BHK full home package',
  'pvc-modular-kitchen-ahmedabad': 'PVC modular kitchen',
  'pvc-wardrobe-ahmedabad': 'PVC wardrobe',
  'pvc-tv-unit-ahmedabad': 'PVC TV unit and wall panelling',
  'pvc-pooja-mandir-ahmedabad': 'PVC pooja mandir',
  'pvc-washbasin-cabinet-ahmedabad': 'PVC washbasin cabinet',
  'pvc-shoe-rack-ahmedabad': 'PVC shoe rack',
  'pvc-furniture-price-ahmedabad': 'Rate card and prices',
  'pvc-furniture-vs-plywood-ahmedabad': 'PVC vs plywood',
};

for (const a of AREAS) {
  build({
    slug: a.slug,
    title: 'PVC Furniture in ' + a.name + ', Ahmedabad | Kitchen, Wardrobe - Shree Krushn',
    desc: 'PVC furniture in ' + a.name + ', Ahmedabad - modular kitchen, wardrobe, TV unit. Waterproof and termite proof, 2 year warranty. Free site visit in ' + a.name + '.',
    h1: 'PVC Furniture in ' + a.name + ', Ahmedabad',
    serviceType: 'PVC furniture',
    og: 'index',
    intro: a.intro,
    chips: ['<b>500+</b> designs made', '2 year warranty', 'Free site visit', a.name + ', Ahmedabad'],
    // One question, and it is the one that differs. The generic two -
    // what it costs, how long it takes - were on all nine pages in
    // nearly the same words, which is the similarity that turns a set
    // of area pages into a doorway set. They live on the price page
    // and the home page, where they belong once.
    faq: [
      { q: 'Do you work in ' + a.name + '?',
        a: 'Yes, regularly. The site visit is free and carries no obligation - we measure, bring laminate samples to hold against your own wall and light, and leave a written itemised estimate before anything is ordered. There is no travel charge to ' + a.name + '. ' + a.note },
    ],
    sections: `
<section class="w" style="padding-top:26px">
  <div class="eyebrow">Homes in ${a.name}</div>
  <h2>What the work here usually is</h2>
  <p>${a.stock}</p>
  <p class="note" style="margin-top:8px"><b>Mostly:</b> ${a.lead}</p>
</section>

<section class="w">
  <div class="eyebrow">Worth knowing</div>
  <h2>One thing to check before you order</h2>
  <p>${a.extra}</p>
</section>

<div class="why"><div class="w">
  <div class="eyebrow">The material</div>
  <h2>Why PVC</h2>
  <p>Waterproof, termite proof, about ten days for a full home, two year written warranty. The same everywhere, so it is written once rather than nine times: <a href="/pvc-furniture-vs-plywood-ahmedabad">PVC vs plywood</a> for the comparison, and <a href="/kaka-pvc-furniture-ahmedabad">Kaka PVC and hollow PVC</a> for which sheet goes where and why a long shelf needs the hollow one.</p>
</div></div>

<section class="w">
  <div class="eyebrow">What we make</div>
  <h2>Rooms we fit in ${a.name}</h2>
  <ul class="incl">
${a.rooms.map((r) => '    <li><a href="/' + r + '">' + LABEL[r] + '</a></li>').join('\n')}
  </ul>
  <div style="margin-top:18px"><a class="btn b3" href="/app?do=designs">See 500+ designs</a></div>
</section>
`,
  });
}
console.log(AREAS.length + ' area page(s) written to site/');
