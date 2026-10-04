/* --- Who is this customer? -----------------------------------------
   Registration used to capture a name, a phone number and an optional
   referral. That is all an admin saw for anyone who signed up and then
   stopped: no idea where they live, how big the home is, what they
   want, or whether they are ready to start. The address only appeared
   later, and only if they booked a visit.

   These four fields close that gap. They are deliberately the four an
   admin would ask on a first phone call, in that order, and none of
   them is required - a half-filled profile is still far more than a
   bare name, and the app asks again later rather than blocking anyone
   at the door.
------------------------------------------------------------------- */

export const PROPERTY_TYPES = [
  '1 BHK', '2 BHK', '3 BHK', '4 BHK+', 'Villa / Bungalow', 'Shop / Office', 'Other',
];

// Matches the gallery's own categories closely enough to be useful for
// filtering, with "Full home" for someone furnishing an empty flat -
// by far the most valuable enquiry and the one worth spotting early.
//
// Colour/POP and electrical are DH Home Decor's trade, not this
// business's. They sit at the end of the list, after the furniture,
// because the point is to know whether a furniture customer ALSO
// wants them handled - that is the "sab kaam ho jayega" convenience -
// and never to tout for them on their own.
export const NEED_OPTIONS = [
  'Full home', 'Wardrobe', 'Modular kitchen', 'TV unit', 'Pooja mandir',
  'Study table', 'Dressing table', 'Shoe rack', 'Washbasin cabinet',
  'Partition / elevation', 'Repair / service',
  'Colour / POP work', 'Electrical work',
];

// Bands drawn from this business's own 17 priced estimates, which run
// from Rs 50,750 to Rs 6,31,655 with a median of Rs 2,72,500 - not from
// round numbers picked out of the air. They split the real jobs 3 / 2 /
// 6 / 5 / 1, so no band is a dead option and none swallows everything.
// "Not decided yet" is first because for most people at enquiry stage
// it is the honest answer, and forcing a guess would make the field
// worse than useless.
export const BUDGET_BANDS = [
  { value: 'unsure', label: 'Not decided yet' },
  { value: 'under_1l', label: 'Under 1 lakh' },
  { value: '1_2l', label: '1 - 2 lakh' },
  { value: '2_35l', label: '2 - 3.5 lakh' },
  { value: '35_6l', label: '3.5 - 6 lakh' },
  { value: 'over_6l', label: '6 lakh +' },
];

export function budgetLabel(value) {
  const hit = BUDGET_BANDS.find((b) => b.value === value);
  return hit ? hit.label : '';
}

export const TIMELINES = [
  { value: 'now', label: 'Ready to start' },
  { value: 'soon', label: 'In 1-3 months' },
  { value: 'later', label: 'After 3 months' },
  { value: 'looking', label: 'Just looking' },
];

export function timelineLabel(value) {
  const hit = TIMELINES.find((t) => t.value === value);
  return hit ? hit.label : '';
}

// Everything that reads a profile goes through this, so a customer
// record saved before these fields existed behaves like one with them
// left blank rather than throwing on a missing property.
export function normalizeProfile(customer) {
  const c = customer || {};
  return {
    area: typeof c.area === 'string' ? c.area.trim() : '',
    propertyType: PROPERTY_TYPES.includes(c.propertyType) ? c.propertyType : '',
    needs: Array.isArray(c.needs) ? c.needs.filter((n) => NEED_OPTIONS.includes(n)) : [],
    timeline: TIMELINES.some((t) => t.value === c.timeline) ? c.timeline : '',
    budget: BUDGET_BANDS.some((b) => b.value === c.budget) ? c.budget : '',
  };
}

// The same shape, but WITHOUT trimming the area - for the text box
// someone is currently typing into.
//
// normalizeProfile trims, which is right everywhere a profile is read
// or saved and wrong in exactly one place: an input whose value comes
// back through it on every keystroke. Type "Nava", press space, and
// the trim removes the space before the next character arrives, so the
// box snaps back to "Nava" and a second word can never be reached.
// That is why nobody could enter more than one word of their address.
export function profileForEditing(customer) {
  const c = customer || {};
  return { ...normalizeProfile(c), area: typeof c.area === 'string' ? c.area : '' };
}

// 0-100. Each field counts the same: none is more essential than
// another, and weighting them would only make the number harder to
// read on a list of cards.
export function profileCompleteness(customer) {
  const p = normalizeProfile(customer);
  const fields = [p.area, p.propertyType, p.needs.length > 0 ? 'y' : '', p.timeline, p.budget];
  const filled = fields.filter((v) => v !== '' && v !== false).length;
  return Math.round((filled / fields.length) * 100);
}

export function isProfileIncomplete(customer) {
  return profileCompleteness(customer) < 100;
}

// One line for the admin's customer card: only the parts that exist,
// so a customer who gave just an area reads "Nava Naroda" rather than
// "Nava Naroda - - -".
export function profileSummary(customer) {
  const p = normalizeProfile(customer);
  const bits = [];
  if (p.area) bits.push(p.area);
  if (p.propertyType) bits.push(p.propertyType);
  if (p.needs.length > 0) bits.push(p.needs.slice(0, 3).join(', ') + (p.needs.length > 3 ? ' +' + (p.needs.length - 3) : ''));
  if (p.timeline) bits.push(timelineLabel(p.timeline));
  return bits.join(' · ');
}
