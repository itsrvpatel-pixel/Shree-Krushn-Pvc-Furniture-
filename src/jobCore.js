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

// --- Merging a shared list before writing it ------------------------
//
// Most of this app's shared data is one Firestore document holding one
// list: the brochures, the FAQs, the rate card, a partner's pending
// photo submissions, the karigar attendance log. Saving any of them
// used to serialise this device's whole array over the top of
// whatever was there. Two people working at once is then simply
// destructive - a partner submits a photo while an admin approves a
// different one, and whichever write lands second erases the other's,
// with nothing on screen to say so.
//
// This works out what THIS device actually changed (by comparing its
// own before and after), and applies only that on top of the server's
// current copy. Anything another device added in the meantime
// survives; anything this device deleted is still deleted.
//
// Order follows `next`, so the local edit's arrangement is kept, and
// entries only the server knows about are appended rather than lost.
export function listKeyOf(item) {
  if (item && typeof item === 'object') return item.id != null ? String(item.id) : JSON.stringify(item);
  return String(item);
}

export function mergeListWithServer(next, prevLocal, fresh, keyOf = listKeyOf) {
  const nextList = Array.isArray(next) ? next : [];
  const prevList = Array.isArray(prevLocal) ? prevLocal : [];
  const freshList = Array.isArray(fresh) ? fresh : [];

  const nextKeys = new Set(nextList.map(keyOf));
  // Deleted HERE, deliberately - must not come back from the server copy.
  const removed = new Set(prevList.map(keyOf).filter((k) => !nextKeys.has(k)));

  const out = [];
  const seen = new Set();
  for (const item of nextList) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  for (const item of freshList) {
    const k = keyOf(item);
    if (seen.has(k) || removed.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/* --- One person, one account -----------------------------------------
   A customer is identified two different ways and nothing kept the two
   in step. The app gives every customer a random internal id, and a job
   points at that id; the customer DOCUMENT, though, is keyed by phone
   number, because phone is the only thing the login screen knows before
   it knows who you are.

   So one person could end up as two records. Admin adds a number, quotes
   a 24-item estimate against id A. The same man later registers himself,
   gets a fresh id B, and his account opens empty - the estimate is still
   sitting on A, and nothing looks for it. That is not a theory: it had
   happened to four customers on the live database, and eight more had a
   job with no customer record at all, so their number came back as "not
   registered" when they tried to log in.

   This decides, at the moment someone registers, whether they are
   actually new. If a job already exists for their phone, they are not:
   they adopt that job's customer id and that job, instead of being given
   a blank second account beside it. Returns the customer to save, the
   job to create (null when an existing one is adopted), and whether a
   job was adopted, so the caller can say so.
------------------------------------------------------------------- */
export function resolveRegistration(customer, existingJob, makeJob) {
  if (existingJob && existingJob.customerId) {
    return {
      customer: { ...customer, id: existingJob.customerId },
      jobToCreate: null,
      adopted: true,
    };
  }
  return { customer, jobToCreate: makeJob(customer), adopted: false };
}

/* --- When is each payment due ----------------------------------------
   The app told a customer one number: "Due 1,22,500". True, and useless
   - it does not say when, or in how many parts, so the only way to find
   out was to ring up and ask. Every estimate this business quotes is
   already paid in stages; the stages just were not written down
   anywhere the customer could see them.

   Percentages, not fixed rupee amounts, because the estimate changes:
   extra work gets approved, a discount gets agreed. A schedule stored
   in rupees would quietly stop adding up to the total the moment that
   happened, and a payment plan that does not add up is worse than none.
------------------------------------------------------------------- */
// The timings are this business's actual practice, not the textbook
// one: Ravi does NOT take money when the order is confirmed, he takes
// the first payment once work has started. A schedule that promised a
// customer something the business does not do would be worse than no
// schedule, so the first stage says what really happens.
export const DEFAULT_PAYMENT_STAGES = [
  // atStatus is which job stage makes this money actually DUE, as
  // opposed to merely planned. It carried over from the admin-side
  // milestone list this replaced, and it already said 'in_progress'
  // for the first payment - the business was taking its first money
  // when work started long before the customer-facing wording said so.
  { key: 'advance', label: 'Advance', percent: 50, when: 'Kaam shuru hone par', atStatus: 'in_progress' },
  { key: 'progress', label: 'Progress payment', percent: 40, when: 'Kaam aadha hone par', atStatus: 'delivered' },
  // 'delivered', NOT 'paid'. A job's status flips to 'paid' the moment
  // nothing is outstanding, so a milestone waiting for 'paid' could
  // never show a nonzero due amount: by the time it is reached the job
  // is settled by definition. Tying the last stage to delivery means
  // it correctly reads as outstanding while payment is still pending.
  { key: 'final', label: 'Final payment', percent: 10, when: 'Delivery ke baad', atStatus: 'delivered' },
];

// Which stages a job is on: its own, if admin set them, otherwise the
// standard three. A stored list is only trusted when it is a non-empty
// array whose percents are numbers - a half-saved one falls back rather
// than showing a customer a broken plan.
export function paymentStagesOf(job) {
  const own = job && job.paymentStages;
  if (!Array.isArray(own) || own.length === 0) return DEFAULT_PAYMENT_STAGES;
  if (!own.every((s) => s && typeof s.label === 'string' && Number.isFinite(Number(s.percent)))) {
    return DEFAULT_PAYMENT_STAGES;
  }
  return own;
}

/* Turns the stages into rupee amounts and works out which are settled.

   Two things this gets right that an obvious version would not.

   The amounts always sum to EXACTLY the total. Rounding each stage on
   its own leaves 50/40/10 of 1,21,875 adding up to a rupee more or less
   than the bill, and a customer who adds up three numbers and gets a
   different answer stops trusting the whole screen. The last stage
   takes the remainder, so the column always ties out.

   Money pays off the stages IN ORDER, like a real ledger. Anything else
   has to guess which stage a payment was meant for, and the customer's
   own receipt does not say. */
export function buildPaymentSchedule(total, paid, stages) {
  const list = Array.isArray(stages) && stages.length > 0 ? stages : DEFAULT_PAYMENT_STAGES;
  const grand = Math.max(0, Math.round(Number(total) || 0));
  if (grand === 0) return [];

  let allocated = 0;
  const amounts = list.map((s, i) => {
    if (i === list.length - 1) return grand - allocated; // the remainder, so it ties out
    const amt = Math.round((grand * (Number(s.percent) || 0)) / 100);
    allocated += amt;
    return amt;
  });

  let left = Math.max(0, Math.round(Number(paid) || 0));
  return list.map((s, i) => {
    const amount = Math.max(0, amounts[i]);
    const paidHere = Math.min(left, amount);
    left -= paidHere;
    let status = 'due';
    if (amount > 0 && paidHere >= amount) status = 'paid';
    else if (paidHere > 0) status = 'part';
    return {
      key: s.key || ('stage_' + i),
      label: s.label,
      when: s.when || '',
      percent: Number(s.percent) || 0,
      amount,
      paidAmount: paidHere,
      remaining: Math.max(0, amount - paidHere),
      status,
    };
  });
}

// The stage the customer owes money on next, or null when nothing is
// outstanding. This is what Home and the estimate screen lead with -
// "what do I owe next" is the question, not "here is a table".
export function nextDueStage(schedule) {
  return (schedule || []).find((s) => s.status !== 'paid') || null;
}

/* --- What one job actually cost, and who was paid ---------------------
   Admin could already see every karigar payment in the Expenses tab,
   and a per-person total there. What was missing was the other
   direction: standing on ONE customer, what went out on their job and
   to whom - so "Rishi ka kaam" has a cost beside its price instead of
   only a price.

   Deliberately counts every expense type, not only karigar payments:
   material and transport are money that left for this job too, and a
   profit figure that quietly ignored them would be worse than none.
   The caller gets them split by type as well as by person, so it can
   show both without computing anything itself.
------------------------------------------------------------------- */
export function jobCostBreakdown(expenses, jobId) {
  const mine = (expenses || []).filter((e) => e && e.jobId && e.jobId === jobId);

  const byPayee = new Map();
  const byType = new Map();
  let total = 0;

  for (const e of mine) {
    const amount = Number(e.amount) || 0;
    total += amount;

    // Names are typed by hand every time, so "Suresh", "suresh " and
    // "Suresh" are one person. The first spelling seen is the one
    // shown, matching how the Expenses tab already groups them.
    const key = String(e.payee || '').trim().toLowerCase() || '(naam nahi)';
    const payee = byPayee.get(key) || { name: String(e.payee || '').trim() || '(naam nahi)', total: 0, count: 0 };
    payee.total += amount;
    payee.count += 1;
    byPayee.set(key, payee);

    const type = e.type || 'Other';
    byType.set(type, (byType.get(type) || 0) + amount);
  }

  return {
    total,
    entries: mine.length,
    // Biggest first: on a phone the top two rows are what gets read.
    byPayee: [...byPayee.values()].sort((a, b) => b.total - a.total),
    byType: [...byType.entries()].map(([type, amount]) => ({ type, amount })).sort((a, b) => b.amount - a.amount),
    karigar: byType.get('Karigar Payment') || 0,
  };
}

/* Admin's view of the same schedule: which stages the job has actually
   reached, so "owed now" can be told apart from "owed later".

   There used to be two separate 50/40/10 models - this one on the
   admin side keyed to job status, and the customer's schedule - with
   their own percentages, their own labels and their own allocation
   loop. They agreed on the money and disagreed on the words, which is
   the kind of difference nobody notices until a customer quotes one
   back at you. Now there is one list of stages, one allocation, and
   this adds only the question the admin side needs answering.
------------------------------------------------------------------- */
export function paymentProgress(total, paid, stages, status, statusOrder) {
  const list = Array.isArray(stages) && stages.length > 0 ? stages : DEFAULT_PAYMENT_STAGES;
  const order = Array.isArray(statusOrder) ? statusOrder : [];
  const statusIdx = order.indexOf(status);
  return buildPaymentSchedule(total, paid, list).map((s, i) => {
    const at = list[i] && list[i].atStatus;
    // A stage with no atStatus is due as soon as it is in the plan -
    // the honest reading of a custom schedule somebody typed in.
    const reached = !at || (statusIdx >= 0 && statusIdx >= order.indexOf(at));
    return { ...s, reached, dueNow: reached ? s.remaining : 0, upcoming: reached ? 0 : s.remaining };
  });
}

// Whether to offer writing a review at all. Asking somebody to rate
// work that is still half-built gets you a rating of the waiting, not
// of the furniture - so the invitation only appears once the job is
// delivered. A review already on file keeps the row alive whatever the
// status, because the customer must be able to go back and change it.
// Reading other people's reviews is NOT gated by this: that is the
// part a customer wants early, while they are still deciding.
export function canLeaveReview(job) {
  if (!job) return false;
  if (job.review) return true;
  return job.status === 'delivered' || job.status === 'paid';
}

// What the review row should say, wherever it is shown. Home and More
// both offer it, and writing the cases out twice is how the two drift
// apart - which is the exact bug class cleaned up elsewhere in this
// app.
//
// The locked case is not a dead end, it is the point: the More tab
// keeps the row visible before delivery precisely so a customer reads
// "kaam poora hone ke baad hi" and understands, without being told,
// that the reviews they just read could not have been posted by
// anyone who merely logged in. Home hides the row instead, because
// Home is the screen he wants quiet.
export function reviewPrompt(job) {
  if (job && job.review) return { title: 'Aapka Review', sub: 'Badalna ho to yahan se' };
  if (canLeaveReview(job)) return { title: 'Review Dein', sub: 'Aapka anubhav kaisa raha?' };
  return { title: 'Review Dein', sub: 'Kaam poora hone ke baad hi de sakte hain' };
}

// "5.0 stars - from 17 customers", worked out once. The same line is
// now on Home and in the More tab, and a number computed twice is a
// number that eventually disagrees with itself.
export function reviewsSummary(testimonials) {
  const list = (testimonials || []).filter((r) => r && Number(r.rating) > 0);
  if (list.length === 0) return { count: 0, avg: null };
  const avg = list.reduce((a, r) => a + Number(r.rating), 0) / list.length;
  return { count: list.length, avg: avg.toFixed(1) };
}

// "Aakhri baar kab aaya" - the stamp, and how it reads.
//
// Two separate decisions, kept apart because only one of them is about
// money. Writing costs a Firestore write every time a customer opens
// the app; reading costs nothing. So the write is throttled hard and
// the label is free to be as precise as it likes.

export const LAST_SEEN_GAP_MS = 60 * 60 * 1000;

// Worth a write? Only if the last one is old enough. A customer who
// opens the app eight times while waiting for a photo to upload is one
// visit, not eight, and the admin screen cannot tell the difference
// anyway - it says "2 ghante pehle" either way.
//
// A missing or unparseable stamp always writes: that is a customer
// whose last visit is unknown, which is the one case worth spending a
// write on immediately.
export function shouldTouchLastSeen(stored, now, gapMs) {
  const gap = typeof gapMs === 'number' ? gapMs : LAST_SEEN_GAP_MS;
  const prev = Number(stored);
  if (!stored || !Number.isFinite(prev) || prev <= 0) return true;
  // A stamp in the future is a clock that was wrong when it was
  // written. Left alone it would freeze the field forever, so it is
  // treated as unknown and overwritten.
  if (prev > Number(now)) return true;
  return Number(now) - prev >= gap;
}

// How it reads on the admin's screen. Returns the phrase and its
// number separately rather than a finished sentence, so the phrase can
// go through the translation table like every other string in the app
// - a finished sentence cannot be translated without the table growing
// one entry per number.
//
// Deliberately vague past a day: "6 din pehle" is what he actually
// wants to know, and a date and time to the minute from last Tuesday is
// just harder to read.
export function lastSeenLabel(stored, now) {
  const prev = Number(stored);
  if (!stored || !Number.isFinite(prev) || prev <= 0) return { key: 'Kabhi nahi khola' };
  const ms = Number(now) - prev;
  // A stamp from the future means a phone with a wrong clock. Never
  // "-3 ghante pehle", which on his screen is worse than useless.
  if (ms < 0) return { key: 'Abhi abhi' };
  const mins = Math.floor(ms / 60000);
  if (mins < 2) return { key: 'Abhi abhi' };
  if (mins < 60) return { key: '{n} minute pehle', n: mins };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { key: '{n} ghante pehle', n: hours };
  const days = Math.floor(hours / 24);
  if (days === 1) return { key: 'Kal' };
  if (days < 30) return { key: '{n} din pehle', n: days };
  const months = Math.floor(days / 30);
  if (months < 12) return { key: '{n} mahine pehle', n: months };
  return { key: '{n} saal pehle', n: Math.floor(days / 365) };
}

// Why switching notifications on did not work, in words the person
// holding the phone can act on.
//
// Three different screens ask for permission - admin, karigar/partner,
// customer - and each used to word this its own way. One of them said
// "permission nahi mili" for every case, including the one where
// nobody was ever asked for permission because the Web Push key was
// not set up yet. Being sent to fix a permission that was never
// refused is a bad half hour.
export function pushFailureMessage(reason, env) {
  // An iPhone in a Safari tab is the one "unsupported" that is not
  // really unsupported. Apple allows web push only once the app has
  // been added to the Home Screen and opened from that icon - so the
  // honest answer is a two-step instruction, not a dead end. Telling
  // the owner his browser cannot do it, when his phone can, costs him
  // the feature entirely.
  if (reason === 'unsupported' && env && env.iosInBrowser) {
    return 'iPhone par pehle app ko Home Screen par add karein - Share button dabayein, phir "Add to Home Screen". Us icon se app kholkar yahi button dobara dabayein.';
  }
  return {
    not_configured: 'Notifications abhi setup nahi hui - Firebase Console se Web Push key chahiye',
    unsupported: 'Ye browser notifications support nahi karta',
    denied: 'Notification permission nahi mili - phone ki settings se allow karein',
    no_token: 'Notification token nahi mila - dobara koshish karein',
  }[reason] || 'Notifications on nahi ho payi';
}

// An iPhone or iPad being used in a browser tab rather than from the
// Home Screen icon.
//
// iPadOS 13 and later report themselves as "Macintosh", so a Mac that
// also has a touchscreen is the one thing that tells them apart -
// desktop Safari on a real Mac has no touch points. Getting this
// wrong in that direction is harmless: the worst case is a Mac user
// being told about the Home Screen, which simply does not apply.
export function isIosInBrowser(ua, standalone, maxTouchPoints) {
  if (standalone) return false;
  const s = String(ua || '');
  const iPhoneOrIPad = /iPad|iPhone|iPod/.test(s);
  const iPadPretendingToBeMac = /Macintosh/.test(s) && Number(maxTouchPoints) > 1;
  return iPhoneOrIPad || iPadPretendingToBeMac;
}
