// Choosing between two material options is the one place in this app
// where a wrong copy changes what a customer is billed. Both the
// customer and the owner can now make that choice, so the same function
// runs on both paths and is tested here directly.
import assert from 'node:assert/strict';
import { finalizeEstimateDraft, normalizeOptionRow, buildOptionPair, seedOptionForm } from '../src/jobCore.js';

const job = {
  id: 'job_1', customerName: 'Test', items: [], discount: 0,
  materialCompany: '', sheetWeightKg: '',
  payments: [{ id: 'p1', amount: 5000 }],
  activity: [{ id: 'a0', text: 'Job created', date: '2026-01-01T00:00:00Z' }],
  estimateDrafts: [
    { id: 'd1', label: 'Kaka 7kg laminate', materialCompany: 'Kaka', sheetWeightKg: '7',
      items: [{ id: 'i1', desc: 'Wardrobe', length: '6', height: '7', rate: '1000' }] },
    { id: 'd2', label: 'Without laminate', materialCompany: 'Kaka', sheetWeightKg: '5',
      items: [{ id: 'i2', desc: 'Wardrobe', length: '6', height: '7', rate: '600' }] },
  ],
};

let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failed += 1; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); }
};

check('the chosen option becomes the estimate', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[1], 'customer');
  assert.deepEqual(out.items, job.estimateDrafts[1].items);
  assert.equal(out.materialCompany, 'Kaka');
  assert.equal(out.sheetWeightKg, '5');
});

check('the options are cleared once one is chosen', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.deepEqual(out.estimateDrafts, []);
});

check('the other option does not leak in', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].rate, '1000', 'took the rate from the wrong option');
});

check('nothing else on the job is touched', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.deepEqual(out.payments, job.payments, 'payments changed');
  assert.equal(out.id, job.id);
  assert.equal(out.customerName, job.customerName);
});

check('the original job object is not mutated', () => {
  finalizeEstimateDraft(job, job.estimateDrafts[0], 'admin', 'Ravi');
  assert.deepEqual(job.items, [], 'the job passed in was modified');
  assert.equal(job.estimateDrafts.length, 2);
});

check('who chose is recorded, for each of the two paths', () => {
  const c = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.equal(c.estimateChoice.by, 'customer');
  assert.equal(c.estimateChoice.label, 'Kaka 7kg laminate');
  assert.ok(!isNaN(new Date(c.estimateChoice.at)), 'no usable timestamp');

  const a = finalizeEstimateDraft(job, job.estimateDrafts[1], 'admin', 'Ravi');
  assert.equal(a.estimateChoice.by, 'admin');
  assert.equal(a.estimateChoice.byName, 'Ravi');
  assert.equal(a.estimateChoice.label, 'Without laminate');
});

check('the activity log names the right person', () => {
  const c = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.match(c.activity[0].text, /^Customer chose the "Kaka 7kg laminate"/);
  const a = finalizeEstimateDraft(job, job.estimateDrafts[0], 'admin', 'Ravi');
  assert.match(a.activity[0].text, /^Ravi made "Kaka 7kg laminate"/);
  const n = finalizeEstimateDraft(job, job.estimateDrafts[0], 'admin');
  assert.match(n.activity[0].text, /^Admin made /, 'no name should fall back to Admin');
});

check('the earlier history is kept, newest first', () => {
  const out = finalizeEstimateDraft(job, job.estimateDrafts[0], 'customer');
  assert.equal(out.activity.length, 2);
  assert.equal(out.activity[1].text, 'Job created');
});

check('an estimate that already exists is replaced, with payments intact', () => {
  // The options panel used to be hidden once an estimate existed, so
  // this path never ran. It runs now - the customer rings back to ask
  // what a cheaper sheet would cost - and it must not disturb money
  // already taken.
  const priced = {
    ...job,
    items: [{ id: 'old', desc: 'Wardrobe', length: '6', height: '7', rate: '1200' }],
    estimateStatus: 'approved',
    payments: [{ id: 'p1', amount: 5000 }, { id: 'p2', amount: 7000 }],
  };
  const out = finalizeEstimateDraft(priced, priced.estimateDrafts[1], 'admin', 'Ravi');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].rate, '600', 'the old estimate was not replaced');
  assert.equal(out.items[0].id, 'i2');
  assert.deepEqual(out.payments, priced.payments, 'payments were disturbed');
  assert.equal(out.estimateChoice.by, 'admin');
});

// ---- the two-option builder ------------------------------------------
// One item list, a rate per option. Both estimates must come out
// complete - the same items in each, only the rate different.

const form = {
  aId: 'A', bId: 'B',
  a: { label: ' Kaka 7kg ', materialCompany: 'Kaka', sheetWeightKg: '7' },
  b: { label: 'Economy', materialCompany: 'Other', sheetWeightKg: '5' },
  items: [
    { id: 'r1', desc: 'Wardrobe', length: '6', height: '7', qty: '1', rateA: '1200', rateB: '800' },
    { id: 'r2', desc: 'Loft', length: '6', height: '2', qty: '1', rateA: '900', rateB: '900' },
    { id: 'r3', desc: 'Handle', length: '', height: '', qty: '4', rateA: '150', rateB: '150' },
  ],
};

check('both options come out with every item', () => {
  const [a, b] = buildOptionPair(form);
  assert.equal(a.items.length, 3);
  assert.equal(b.items.length, 3);
  assert.deepEqual(a.items.map((i) => i.desc), ['Wardrobe', 'Loft', 'Handle']);
  assert.deepEqual(b.items.map((i) => i.desc), ['Wardrobe', 'Loft', 'Handle']);
});

check('each option carries its own rate, and nothing else differs', () => {
  const [a, b] = buildOptionPair(form);
  assert.deepEqual(a.items.map((i) => i.rate), ['1200', '900', '150']);
  assert.deepEqual(b.items.map((i) => i.rate), ['800', '900', '150']);
  a.items.forEach((it, i) => {
    assert.equal(it.desc, b.items[i].desc);
    assert.equal(it.length, b.items[i].length);
    assert.equal(it.height, b.items[i].height);
    assert.equal(it.qty, b.items[i].qty);
  });
});

check('the two options keep their own name and material', () => {
  const [a, b] = buildOptionPair(form);
  assert.equal(a.label, 'Kaka 7kg', 'label was not trimmed');
  assert.equal(b.label, 'Economy');
  assert.equal(a.sheetWeightKg, '7');
  assert.equal(b.sheetWeightKg, '5');
  assert.equal(a.id, 'A');
  assert.equal(b.id, 'B');
});

check('the two options do not share item objects', () => {
  const [a, b] = buildOptionPair(form);
  a.items[0].rate = '9999';
  assert.equal(b.items[0].rate, '800', 'editing one option changed the other');
  assert.notEqual(a.items[0].id, b.items[0].id, 'same item id in both options');
});

check('a blank second rate means the same as the first, not free', () => {
  const r = normalizeOptionRow({ desc: ' Shutter ', rateA: '700', rateB: '' });
  assert.equal(r.rateB, '700');
  assert.equal(r.desc, 'Shutter');
  assert.equal(r.qty, '1');
  const missing = normalizeOptionRow({ desc: 'X', rateA: '500' });
  assert.equal(missing.rateB, '500');
});

check('a real second rate of zero is kept as zero', () => {
  const r = normalizeOptionRow({ desc: 'Free fitting', rateA: '700', rateB: '0' });
  assert.equal(r.rateB, '0');
});

check('editing a row keeps its place, by keeping its id', () => {
  const r = normalizeOptionRow({ desc: 'Wardrobe', rateA: '1200', rateB: '800' }, 'r1');
  assert.equal(r.id, 'r1');
});

check('the pair drops straight into the job as a real estimate', () => {
  const [, b] = buildOptionPair(form);
  const out = finalizeEstimateDraft({ ...job, estimateDrafts: buildOptionPair(form) }, b, 'admin', 'Ravi');
  assert.equal(out.items.length, 3);
  assert.deepEqual(out.items.map((i) => i.rate), ['800', '900', '150']);
  assert.equal(out.materialCompany, 'Other');
  assert.deepEqual(out.estimateDrafts, []);
});

// ---- opening the builder --------------------------------------------
let seq = 0;
const fakeId = () => 'id' + (++seq);

check('the second rate follows the item, not its position in the list', () => {
  // Built one at a time under the old screen, the two options can hold
  // the same items in a different order. Lining them up by position
  // would put the cheap sheet's rate against the wrong item.
  const j = {
    items: [], materialCompany: '', sheetWeightKg: '',
    estimateDrafts: [
      { id: 'A', label: 'Kaka', materialCompany: 'Kaka', sheetWeightKg: '7', items: [
        { id: '1', desc: 'Wardrobe', length: '6', height: '7', qty: '1', rate: '1200' },
        { id: '2', desc: 'Loft', length: '6', height: '2', qty: '1', rate: '900' },
        { id: '3', desc: 'Handle', qty: '4', rate: '150' },
      ] },
      { id: 'B', label: 'Economy', items: [
        { id: '9', desc: 'Handle', qty: '4', rate: '120' },
        { id: '7', desc: 'Wardrobe', length: '6', height: '7', qty: '1', rate: '800' },
        { id: '8', desc: 'Loft', length: '6', height: '2', qty: '1', rate: '650' },
      ] },
    ],
  };
  const f = seedOptionForm(j, fakeId);
  assert.deepEqual(f.items.map((i) => i.desc), ['Wardrobe', 'Loft', 'Handle']);
  assert.deepEqual(f.items.map((i) => i.rateA), ['1200', '900', '150']);
  assert.deepEqual(f.items.map((i) => i.rateB), ['800', '650', '120'],
    'the second option\'s rates were matched by position, not by item');
});

check('two items with the same name each keep their own second rate', () => {
  const j = {
    items: [],
    estimateDrafts: [
      { id: 'A', label: 'A', items: [
        { id: '1', desc: 'Shutter', qty: '1', rate: '100' },
        { id: '2', desc: 'Shutter', qty: '1', rate: '200' },
      ] },
      { id: 'B', label: 'B', items: [
        { id: '3', desc: 'Shutter', qty: '1', rate: '60' },
        { id: '4', desc: 'Shutter', qty: '1', rate: '90' },
      ] },
    ],
  };
  const f = seedOptionForm(j, fakeId);
  assert.deepEqual(f.items.map((i) => i.rateB), ['60', '90']);
});

check('an item the second option never had falls back to the first rate', () => {
  const j = {
    items: [],
    estimateDrafts: [
      { id: 'A', label: 'A', items: [
        { id: '1', desc: 'Wardrobe', qty: '1', rate: '1200' },
        { id: '2', desc: 'Mandir', qty: '1', rate: '4000' },
      ] },
      { id: 'B', label: 'B', items: [{ id: '3', desc: 'Wardrobe', qty: '1', rate: '800' }] },
    ],
  };
  const f = seedOptionForm(j, fakeId);
  assert.deepEqual(f.items.map((i) => i.rateB), ['800', '4000']);
});

check('with no options saved it starts from the job\'s own estimate', () => {
  const j = {
    items: [{ id: 'x', desc: 'Wardrobe', length: '6', height: '7', qty: '1', rate: '1250' }],
    materialCompany: 'Kaka', sheetWeightKg: '7', estimateDrafts: [],
  };
  const f = seedOptionForm(j, fakeId);
  assert.equal(f.items.length, 1);
  assert.equal(f.items[0].rateA, '1250');
  assert.equal(f.items[0].rateB, '1250', 'the second option should start level with the first');
  assert.equal(f.a.materialCompany, 'Kaka');
  assert.equal(f.aId, null);
});

check('a brand new job opens empty rather than breaking', () => {
  const f = seedOptionForm({ items: [], estimateDrafts: [] }, fakeId);
  assert.deepEqual(f.items, []);
  assert.equal(f.a.label, 'Option 1');
  assert.equal(f.b.label, 'Option 2');
});

check('seeding does not touch the job it read', () => {
  const j = {
    items: [{ id: 'x', desc: 'W', qty: '1', rate: '10' }],
    estimateDrafts: [{ id: 'A', label: 'A', items: [{ id: '1', desc: 'W', qty: '1', rate: '10' }] }],
  };
  const before = JSON.stringify(j);
  seedOptionForm(j, fakeId);
  assert.equal(JSON.stringify(j), before);
});

console.log(failed === 0 ? '\nall passed' : '\n' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
