// The few pieces of job logic that are worth testing on their own, kept
// out of App.jsx so a test can import them without pulling in React and
// the whole app. App.jsx re-exports all three, so every existing import
// of uid or logActivity keeps working unchanged.
// See test/estimateDrafts.test.mjs.

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function logActivity(job, text) {
  return { ...job, activity: [{ id: uid(), text, date: new Date().toISOString() }, ...(job.activity || [])].slice(0, 40) };
}

// Turning one of the material options into the job's real estimate.
//
// Shared, because two people can now do it: the customer from their own
// app, and the owner from the admin panel after talking it through on
// the phone. Two copies of this would drift, and the thing they are
// copying - the items the customer will be billed for - is not a thing
// to get subtly wrong in one of the two paths.
//
// The chosen option's items and material move into the job's ordinary
// fields, so from here on the job behaves like any other: totals,
// payment milestones, the PDF and the WhatsApp summary all read
// job.items and know nothing about options. The other options are
// cleared, since the decision is made.
// One row of the two-option builder, tidied. Most items cost the same
// in both options and only a few differ, so an empty second rate means
// "same as the first" rather than free - which is what leaving it blank
// in a hurry means.
export function normalizeOptionRow(row, id) {
  return {
    id: id || row.id || uid(),
    desc: String(row.desc || '').trim(),
    length: row.length || '',
    height: row.height || '',
    qty: row.qty || '1',
    rateA: row.rateA || '0',
    rateB: (row.rateB === '' || row.rateB == null) ? (row.rateA || '0') : row.rateB,
  };
}

// The builder's single item list, split back into the two estimates the
// rest of the app understands: same items in both, each carrying its own
// option's rate. Everything downstream - the customer's comparison, the
// totals, the PDF - reads these, and knows nothing about the builder.
export function buildOptionPair(form) {
  const side = (which, id, meta) => ({
    id: id || uid(),
    label: String(meta.label || '').trim(),
    materialCompany: meta.materialCompany || '',
    sheetWeightKg: meta.sheetWeightKg || '',
    items: form.items.map((it) => ({
      id: uid(),
      desc: it.desc,
      length: it.length,
      height: it.height,
      qty: it.qty,
      rate: (which === 'a' ? it.rateA : it.rateB) || '0',
    })),
  });
  return [side('a', form.aId, form.a), side('b', form.bId, form.b)];
}

// What the two-option builder opens with.
//
// The second option's rate is found by matching the item, not by
// position. Options built one at a time under the old screen can hold
// the same items in a different order, or a different number of them,
// and lining them up by position would have quietly put the cheap sheet's
// rate against the wrong item - a mistake nobody would see until the
// customer got the estimate. Each description is matched once, so two
// items with the same name still take their own rate in order.
export function seedOptionForm(job, makeId) {
  const id = makeId || uid;
  const drafts = job.estimateDrafts || [];
  const a = drafts[0];
  const b = drafts[1];
  const hasEstimate = (job.items || []).length > 0;
  const base = (a && a.items) || (hasEstimate ? job.items : []) || [];

  const pool = new Map();
  for (const it of (b && b.items) || []) {
    const key = String(it.desc || '').trim().toLowerCase();
    if (!pool.has(key)) pool.set(key, []);
    pool.get(key).push(it);
  }
  const rateFromB = (desc) => {
    const row = (pool.get(String(desc || '').trim().toLowerCase()) || []).shift();
    return row && row.rate != null ? String(row.rate) : null;
  };

  return {
    aId: a ? a.id : null,
    bId: b ? b.id : null,
    a: {
      label: (a && a.label) || 'Option 1',
      materialCompany: (a && a.materialCompany) || job.materialCompany || '',
      sheetWeightKg: (a && a.sheetWeightKg) || job.sheetWeightKg || '',
    },
    b: {
      label: (b && b.label) || 'Option 2',
      materialCompany: (b && b.materialCompany) || '',
      sheetWeightKg: (b && b.sheetWeightKg) || '',
    },
    items: base.map((it) => {
      const rateA = String(it.rate == null ? '' : it.rate);
      // Called once per item: it consumes from the pool, so calling it
      // twice would take two of them.
      const fromB = rateFromB(it.desc);
      return {
        id: id(),
        desc: it.desc,
        length: it.length || '',
        height: it.height || '',
        qty: it.qty || '1',
        rateA,
        rateB: fromB == null ? rateA : fromB,
      };
    }),
  };
}

export function finalizeEstimateDraft(job, draft, by, byName) {
  const next = {
    ...job,
    items: draft.items,
    materialCompany: draft.materialCompany || '',
    sheetWeightKg: draft.sheetWeightKg || '',
    estimateDrafts: [],
    // Kept because the options themselves are gone a moment later. If
    // the customer picks one and the owner picks another an hour on,
    // this is the only thing that says which of them the current
    // estimate came from, and when.
    estimateChoice: {
      label: draft.label,
      by,
      byName: byName || null,
      at: new Date().toISOString(),
    },
  };
  return logActivity(next, by === 'customer'
    ? 'Customer chose the "' + draft.label + '" option - it is now the final estimate'
    : (byName || 'Admin') + ' made "' + draft.label + '" the final estimate');
}

// A category picker seeds its selection from categories[0] at mount
// time. That list starts out as the SHIPPED defaults and is only
// replaced once the real one arrives from Firestore a moment later -
// and the live names are not the defaults (they are 'Color pop',
// 'electric' and so on, the same mismatch isPartnerCategory exists to
// absorb). A selection seeded from the defaults therefore names a
// category that does not exist in the live list: a <select> renders
// with no matching <option>, so it looks blank and unselectable, and
// anything saved under that name is filed to a category no grouping
// ever reads back - the entry is stored but never displayed.
// Resolving the selection against the live list on every render keeps
// it pointing at something real, and falls back to the first live
// category rather than to undefined.
export function resolveCategory(selected, categories) {
  const list = Array.isArray(categories) ? categories : [];
  return list.includes(selected) ? selected : (list[0] || '');
}

// Where to cut a tall estimate screenshot into A4 pages.
//
// The estimate PDF is one long image of the rendered document. Slicing
// it at fixed page-height multiples cuts straight through whatever
// happens to be at that offset - which is how a row of the item table
// ended up half on one page and half on the next. `breaks` carries the
// bottom edge of every table row (and of any block marked
// data-pdf-block), so a page can be ended at the last row that still
// fits instead of mid-row.
//
// minFillRatio stops the cut being clawed back too far: a block taller
// than most of a page would otherwise leave a mostly blank page, and a
// stretch with no legal break at all has to fall back to a hard cut
// rather than make no progress and loop forever.
//
// Returns [{ start, end }] in the same units as the inputs.
export function planPdfPages(contentHeight, pageHeight, breaks, minFillRatio = 0.35) {
  const pages = [];
  if (!(contentHeight > 0) || !(pageHeight > 0)) return pages;
  const points = (Array.isArray(breaks) ? breaks : [])
    .filter((b) => Number.isFinite(b) && b > 0 && b < contentHeight)
    .sort((a, b) => a - b);
  const minFill = pageHeight * minFillRatio;

  let y = 0;
  // contentHeight - 1 rather than contentHeight: a sub-pixel remainder
  // left by rounding is not worth a whole extra page.
  while (y < contentHeight - 1) {
    let end = Math.min(y + pageHeight, contentHeight);
    if (end < contentHeight) {
      let safe = -1;
      for (const b of points) {
        if (b > y + minFill && b <= end) safe = b;
      }
      if (safe > 0) end = safe;
    }
    if (!(end > y)) end = Math.min(y + pageHeight, contentHeight);
    pages.push({ start: y, end });
    y = end;
  }
  return pages;
}

// --- The work diary -------------------------------------------------
//
// Groups everything that already happens on a job into days, newest
// first, so the customer can follow their own work the way they would
// follow a conversation. Nothing new has to be entered for this: the
// progress photos the karigar already uploads, the payments already
// recorded and the activity lines already written are the diary. The
// customer is shown job.activity on their home screen today, so this
// surfaces nothing they could not already read.
//
// `now` is injected rather than read from the clock so this can be
// tested, and so "Aaj" means the same thing for every entry in one
// render.
function dayKeyOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Local date, not UTC: a photo uploaded at 9pm IST belongs to that
  // evening's entry, not to the next day.
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

export function buildWorkDiary(job, now = new Date()) {
  const byDay = new Map();
  const touch = (iso) => {
    const key = dayKeyOf(iso);
    if (!key) return null;
    if (!byDay.has(key)) byDay.set(key, { key, date: iso, photos: [], events: [] });
    const entry = byDay.get(key);
    // Keep the earliest timestamp of the day as the entry's own, so
    // sorting within a day stays stable.
    if (new Date(iso) < new Date(entry.date)) entry.date = iso;
    return entry;
  };

  for (const p of (job && job.progressPhotos) || []) {
    const e = touch(p.date);
    if (e) e.photos.push(p);
  }
  for (const a of (job && job.activity) || []) {
    const e = touch(a.date);
    if (e) e.events.push({ id: a.id, text: a.text, date: a.date });
  }

  const days = [...byDay.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (days.length === 0) return [];

  // Day 1 is the oldest day that has anything on it, so "Din 12" means
  // twelve days of this job's own record - not twelve days since some
  // unrelated created-at stamp.
  const firstKey = days[days.length - 1].key;
  const firstDate = new Date(firstKey + 'T00:00:00');
  const todayKey = dayKeyOf(now.toISOString());
  const yesterdayKey = dayKeyOf(new Date(now.getTime() - 86400000).toISOString());

  return days.map((d) => {
    const dayDate = new Date(d.key + 'T00:00:00');
    return {
      ...d,
      dayNumber: Math.round((dayDate - firstDate) / 86400000) + 1,
      isToday: d.key === todayKey,
      isYesterday: d.key === yesterdayKey,
      events: d.events.slice().sort((a, b) => new Date(b.date) - new Date(a.date)),
    };
  });
}

// --- "is a write still in flight?" ----------------------------------
//
// A single boolean is not enough once two saves can overlap, which they
// routinely do: a customer taps Submit twice, or a screen saves a job
// while a background action saves another. Both set the flag, then the
// FIRST to finish clears it - and the live Firestore snapshot that
// arrives while the second is still writing is no longer ignored. It
// replaces local state with the pre-write server copy, and the second
// save's change disappears off the screen. That is the "saved it, then
// it was gone after a refresh" report.
//
// Counting instead means the guard only lifts when the last write
// finishes. enter() and leave() are symmetrical; leave() never drops
// below zero, so one stray extra call cannot unlock the guard.
export function createInFlightCounter() {
  let count = 0;
  return {
    enter() { count += 1; return count; },
    leave() { count = Math.max(0, count - 1); return count; },
    get active() { return count > 0; },
    get depth() { return count; },
  };
}
