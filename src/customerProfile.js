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
export const NEED_OPTIONS = [
  'Full home', 'Wardrobe', 'Modular kitchen', 'TV unit', 'Pooja mandir',
  'Study table', 'Dressing table', 'Shoe rack', 'Washbasin cabinet',
  'Partition / elevation', 'Repair / service',
];

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
  };
}

// 0-100. Each of the four counts the same: none is more essential than
// another, and weighting them would only make the number harder to
// read on a list of cards.
export function profileCompleteness(customer) {
  const p = normalizeProfile(customer);
  const filled = [p.area, p.propertyType, p.needs.length > 0 ? 'y' : '', p.timeline]
    .filter((v) => v !== '' && v !== false).length;
  return Math.round((filled / 4) * 100);
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
