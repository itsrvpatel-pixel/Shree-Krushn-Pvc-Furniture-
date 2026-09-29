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
    ? 'Customer ne "' + draft.label + '" option choose kiya - final estimate ban gaya'
    : (byName || 'Admin') + ' ne "' + draft.label + '" option final kiya');
}
