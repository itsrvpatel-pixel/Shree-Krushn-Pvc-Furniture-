import assert from 'node:assert/strict';
import { stripUndefined } from '../src/jobsStore.js';

// The exact record "+ New customer" used to build for an ordinary
// admin. Firestore rejects the whole write over that one undefined, so
// the customer never saved while their job did.
{
  const out = stripUndefined({ id: 'abc', name: 'Mehul', phone: '9632578525', businessUnit: undefined });
  assert.deepEqual(out, { id: 'abc', name: 'Mehul', phone: '9632578525' });
  assert.ok(!('businessUnit' in out), 'the key is gone, not set to null');
}

// Everything that is NOT undefined survives. Each of these is a real
// value somebody chose and none may be quietly turned into something
// else: a zero payment, an empty note, an unfeatured review.
{
  const out = stripUndefined({ paid: 0, note: '', featured: false, referredBy: null });
  assert.deepEqual(out, { paid: 0, note: '', featured: false, referredBy: null });
}

// Nested, because a job carries items, payments and an appointment.
{
  const out = stripUndefined({
    id: 'job_1',
    appointment: { date: '2026-10-09', slot: undefined },
    items: [{ id: 'i1', rate: 450, discount: undefined }],
  });
  assert.deepEqual(out, {
    id: 'job_1',
    appointment: { date: '2026-10-09' },
    items: [{ id: 'i1', rate: 450 }],
  });
}

// An undefined slot in an array becomes null rather than collapsing:
// shifting later entries up one would silently renumber a payment list.
{
  const out = stripUndefined({ payments: [{ amt: 100 }, undefined, { amt: 300 }] });
  assert.equal(out.payments.length, 3);
  assert.equal(out.payments[1], null);
  assert.deepEqual(out.payments[2], { amt: 300 });
}

// Dates are passed through intact - rebuilding one as a plain object
// would hand Firestore {} instead of a timestamp.
{
  const d = new Date('2026-10-03T00:00:00Z');
  const out = stripUndefined({ at: d });
  assert.equal(out.at, d);
  assert.ok(out.at instanceof Date);
}

// Primitives and empty input never throw.
{
  assert.equal(stripUndefined(null), null);
  assert.equal(stripUndefined('x'), 'x');
  assert.equal(stripUndefined(7), 7);
  assert.deepEqual(stripUndefined({}), {});
  assert.deepEqual(stripUndefined([]), []);
}

// The input is not mutated: the caller still holds the record it built,
// and persistCustomers diffs against exactly that object.
{
  const input = { a: 1, b: undefined };
  const out = stripUndefined(input);
  assert.ok('b' in input, 'the original keeps its undefined key');
  assert.ok(!('b' in out));
}

console.log('stripUndefined: 17 assertions passed');
