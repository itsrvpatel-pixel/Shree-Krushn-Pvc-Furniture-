import assert from 'node:assert/strict';
import { resolveRegistration } from '../src/jobCore.js';

// Stands in for emptyJob: the real one lives in App.jsx, which cannot be
// imported without React, and all this needs to know is that a job was
// built from the customer it was handed.
const makeJob = (c) => ({ id: 'job_' + c.id, customerId: c.id, customerName: c.name, phone: c.phone, items: [] });

const fresh = { id: 'new_uid_1', name: 'Mehul', phone: '9632578525' };

// A genuinely new customer: nothing on file for this phone.
{
  const plan = resolveRegistration(fresh, null, makeJob);
  assert.equal(plan.adopted, false);
  assert.equal(plan.customer.id, 'new_uid_1', 'a new customer keeps the id they were given');
  assert.ok(plan.jobToCreate, 'a new customer needs an empty job');
  assert.equal(plan.jobToCreate.customerId, 'new_uid_1');
  assert.equal(plan.jobToCreate.phone, '9632578525');
}

// Admin already took this number and quoted an estimate against it.
// The registration must join that job, not open a second account.
{
  const onFile = { id: 'job_admin_a', customerId: 'admin_a', phone: '9632578525', items: [{ id: 'i1' }, { id: 'i2' }] };
  const plan = resolveRegistration(fresh, onFile, makeJob);
  assert.equal(plan.adopted, true);
  assert.equal(plan.customer.id, 'admin_a', 'the customer adopts the id their job already points at');
  assert.equal(plan.jobToCreate, null, 'no second job is created beside the one on file');
  // Everything else they typed at registration survives.
  assert.equal(plan.customer.name, 'Mehul');
  assert.equal(plan.customer.phone, '9632578525');
}

// The real shape of the four broken accounts found on the live database:
// a customer record and a job for the same phone, carrying different ids.
{
  const lavkumar = { id: 'muju24qfkbljx', name: 'Lavkumar Padhya', phone: '8734868241' };
  const his24ItemJob = { id: 'job_mujsmd26ib8sn', customerId: 'mujsmd26ib8sn', phone: '8734868241', items: new Array(24).fill({}) };
  const plan = resolveRegistration(lavkumar, his24ItemJob, makeJob);
  assert.equal(plan.customer.id, 'mujsmd26ib8sn');
  assert.equal(plan.adopted, true);
  assert.equal(plan.jobToCreate, null);
}

// A job record too damaged to point anywhere is not adopted - better a
// clean new account than one wired to nothing.
{
  const plan = resolveRegistration(fresh, { id: 'job_x', phone: '9632578525' }, makeJob);
  assert.equal(plan.adopted, false);
  assert.ok(plan.jobToCreate);
}

// The customer object handed in is never mutated: the caller still holds
// its own copy, and a half-applied registration is how records diverge.
{
  const input = { id: 'keep_me', name: 'Rohit', phone: '7990293941' };
  resolveRegistration(input, { id: 'job_z', customerId: 'other', phone: '7990293941' }, makeJob);
  assert.equal(input.id, 'keep_me');
}

console.log('customerLink: 15 assertions passed');
