// Which gallery categories belong to DH Home Decor's trade rather than
// Shree Krushn's own PVC furniture.
//
// Its own file so it can be tested directly - the rule is decided by
// data the owner types into the admin panel, not by anything in the
// code, so the only way to know it works is to run it against the
// category names the gallery actually holds. See test/partnerCategories.test.mjs.

// Colour/POP and electrical work are DH Home Decor's trade, not Shree
// Krushn's PVC furniture. Two places have to agree about which
// categories those are: the admin panel, which limits DH's login to
// them, and the customer gallery, which keeps them out of "All Photos"
// and out of the thumbnail warm-up.
//
// Matched by name, because a photo record carries no uploader - and
// against a list of spellings rather than one exact string, because the
// names the app seeds a new install with are not the names this gallery
// uses. 'Color/POP Work' and 'Electrical Work' were renamed to 'Color
// pop' and 'electric' long ago. The exact-match test therefore matched
// nothing at all, and 130 colour and wiring photos sat in the middle of
// the furniture in "All Photos" while the code read as though they
// could not. Case and extra spaces are ignored for the same reason.
const PARTNER_CATEGORY_NAMES = [
  'color pop', 'colour pop', 'color/pop work', 'colour/pop work',
  'color pop work', 'colour pop work', 'pop work', 'pop',
  'electric', 'electrical', 'electric work', 'electrical work',
];

export function isPartnerCategory(name) {
  return PARTNER_CATEGORY_NAMES.includes(
    String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
  );
}

// The partner categories this gallery actually has, in its own order.
// For the places that need a concrete list rather than a test: DH's
// panel has to offer categories that exist, or adding a photo would
// create a second 'Color/POP Work' next to the real 'Color pop'.
export function partnerCategories(categories) {
  return (categories || []).filter(isPartnerCategory);
}
