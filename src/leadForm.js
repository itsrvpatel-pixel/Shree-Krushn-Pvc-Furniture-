/* What the website's enquiry form accepts, in one place.
 *
 * The site could only say "WhatsApp karein" or "App kholein". Both
 * ask a stranger to start a conversation, and somebody looking at
 * wardrobes at eleven at night is not going to. They leave, and the
 * business never knows they were there.
 *
 * A form is the quiet option. But a form on a public page is also the
 * one thing on this site any bot on the internet can post to, so what
 * it accepts is defined here rather than inside the endpoint - both
 * the browser and the server run the same rules, and a test can read
 * them without either.
 *
 * Nothing here trusts the caller. The server validates again even
 * though the page already did, because the page is not where the
 * decision is made.
 */

export const LEAD_NEEDS = [
  'Full home',
  'Kitchen',
  'Wardrobe',
  'TV unit',
  'Mandir',
  'Something else',
];

/* How big the place is.
 *
 * His own request, in his words: "ketla BHK ma banava nu am" - how
 * many BHK is it to be done in. It is the first thing he asks on the
 * phone, because it decides everything after it: roughly what the job
 * is worth, how many days it takes, and whether it is worth a site
 * visit this week or next. An enquiry without it is a call that has
 * to happen before any of that can be judged.
 *
 * Shop/office is here because PVC furniture goes into those too, and
 * a shopkeeper picking "2 BHK" because nothing else fits would be
 * worse than no answer.
 */
export const LEAD_SIZES = [
  '1 BHK',
  '2 BHK',
  '3 BHK',
  '4 BHK or bigger',
  'Bungalow / villa',
  'Shop / office',
];

export const LEAD_MAX = { name: 60, area: 80, message: 500 };

// 10 digits, however they were typed: +91, 91, a leading 0, spaces,
// dashes, brackets. Matches how numbers are already stored elsewhere
// in this project - bare ten digits, no country code.
export function normalizeLeadPhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length !== 10) return '';
  // Indian mobile numbers start 6-9. Anything else is a landline, a
  // typo, or a bot filling the box with 1234567890.
  if (!/^[6-9]/.test(d)) return '';
  // All one digit repeated is nobody.
  if (/^(\d)\1{9}$/.test(d)) return '';
  return d;
}

const clean = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeLead(raw) {
  const r = raw || {};

  // The honeypot. A field the page hides and a person never sees, so
  // anything in it was typed by a script. Rejected as if accepted -
  // a bot told it failed just tries again differently.
  if (String(r.website || '').trim()) return { ok: false, reason: 'bot', lead: null };

  const name = clean(r.name, LEAD_MAX.name);
  if (name.length < 2) return { ok: false, reason: 'name', lead: null };
  // A name of only digits or punctuation is not a name.
  if (!/[a-zA-Z઀-૿ऀ-ॿ]/.test(name)) return { ok: false, reason: 'name', lead: null };

  const phone = normalizeLeadPhone(r.phone);
  if (!phone) return { ok: false, reason: 'phone', lead: null };

  const need = LEAD_NEEDS.includes(r.need) ? r.need : '';
  // Same rule as need: anything the page did not offer is dropped
  // rather than stored, so a bot cannot post arbitrary text into a
  // field the owner reads as a fact.
  const size = LEAD_SIZES.includes(r.size) ? r.size : '';
  const area = clean(r.area, LEAD_MAX.area);
  const message = clean(r.message, LEAD_MAX.message);

  return {
    ok: true,
    reason: null,
    lead: {
      name, phone, need, size, area, message,
      source: clean(r.source, 60) || 'website',
      createdAt: new Date().toISOString(),
      status: 'new',
    },
  };
}

export function leadFailureMessage(reason) {
  if (reason === 'name') return 'Enter your name';
  if (reason === 'phone') return 'Enter a valid 10-digit mobile number';
  // A bot is never told it was spotted.
  if (reason === 'bot') return 'Sent';
  return 'Could not send - please try again shortly';
}

// What the owner reads in the alert, built once so the push and the
// admin row cannot describe the same enquiry differently.
export function leadSummary(lead) {
  if (!lead) return '';
  const bits = [lead.name];
  if (lead.need) bits.push(lead.need);
  // Size before area: on a push notification only the first few words
  // survive, and "2 BHK" decides more than "Nikol" does.
  if (lead.size) bits.push(lead.size);
  if (lead.area) bits.push(lead.area);
  return bits.join(' - ');
}

/* Why the enquiry list is empty, in words that lead somewhere.
 *
 * The screen used to say "Could not load the enquiries" for anything
 * that went wrong, and then say it again, and again - the effect that
 * loaded them depended on showToast, which is rebuilt on every
 * render, so each failure re-rendered, which re-ran the load, which
 * failed. That is what "error blinking kar raha he" was.
 *
 * The loop is fixed where it was caused. This is the other half: the
 * two situations behind it need different things done, and only one
 * of them needs anything done at all.
 */
export function leadLoadMessage(reason) {
  if (reason === 'denied') {
    return 'The Firebase rules do not allow this list yet. Paste the latest firestore.rules into the Firebase console - the enquiries themselves are safe and nothing has been lost.';
  }
  if (reason === 'offline') {
    return 'No internet just now. The enquiries are safe - open this again when you are back online.';
  }
  return 'The enquiries could not be loaded. Try again in a moment.';
}
