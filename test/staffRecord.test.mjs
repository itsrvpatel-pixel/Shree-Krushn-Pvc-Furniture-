// Opening one staff member and seeing everything about them.
//
// Asked directly: how does the admin open a staff member, see that
// person's record, and add something to it.
//
// There was no such place. A karigar's workload sat in one report on
// Home, a partner's commission in another, their PIN in Settings, and
// the money paid to them in Expenses under a name typed by hand. "How
// is Rishi doing and what do we owe him" meant four screens and
// adding up by eye.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { staffRecord, staffNeedsAttention } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');

// Stand-in for App.jsx's jobPaid, handed in for the same reason the
// partner dashboard hands it in: one definition of what was paid.
const P = (j) => (j.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

const jobs = [
  { id: 'a', assignedStaffId: 's1', customerName: 'Ramesh', status: 'delivered',
    payments: [{ amount: '40000' }], progressPhotos: [{}, {}] },
  { id: 'b', assignedStaffId: 's1', customerName: 'Suresh', status: 'in_progress',
    payments: [{ amount: '10000' }], progressPhotos: [] },
  { id: 'c', assignedStaffId: 'someone-else', customerName: 'Meena', status: 'delivered',
    payments: [{ amount: '99999' }], progressPhotos: [{}] },
];
const expenses = [
  { id: 'e1', payee: ' rishi ', amount: '5000', date: '2026-10-01' },
  { id: 'e2', payee: 'RISHI', amount: '2000', date: '2026-10-05' },
  { id: 'e3', payee: 'Kaka', amount: '900', date: '2026-10-02' },
];
const rishi = { id: 's1', name: 'Rishi', role: 'karigar', hasPin: true };
const partner = { id: 's1', name: 'Rishi', role: 'regional_partner', hasPin: true,
  commissionPercent: 15, commissionPayouts: [{ id: 'p1', amount: '2000', date: '2026-10-03' }] };

console.log('staffRecord');

t('only their own work counts', () => {
  const r = staffRecord(rishi, jobs, expenses, [], null, P);
  assert.equal(r.jobs.total, 2, 'somebody else\'s job is being counted');
  assert.equal(r.jobs.active, 1);
  assert.equal(r.jobs.completed, 1);
  assert.equal(r.photos, 2);
  assert.equal(r.collected, 50000, 'the other job\'s money leaked in');
});

t('money paid to them is matched however the name was typed', () => {
  // Expenses store a payee as free text, so matching is all there is.
  const r = staffRecord(rishi, jobs, expenses, [], null, P);
  assert.equal(r.paidToThem, 7000, 'a differently-cased or padded name was missed');
  assert.equal(r.payments.length, 2);
  assert.ok(!r.payments.some((e) => e.payee === 'Kaka'), 'somebody else\'s payment is on this record');
  // Newest first - the last payment is the one being asked about.
  assert.equal(r.payments[0].id, 'e2');
});

t('commission is on what was collected, never on the estimate', () => {
  const r = staffRecord(partner, jobs, expenses, [], null, P);
  assert.equal(r.commission.percent, 15);
  assert.equal(r.commission.earned, 7500);
  assert.equal(r.commission.paid, 2000);
  assert.equal(r.commission.due, 5500);
});

t('attendance counts only their days', () => {
  const att = [{ staffId: 's1' }, { staffId: 's1' }, { staffId: 'other' }, null];
  assert.equal(staffRecord(rishi, jobs, expenses, att, null, P).attendanceDays, 2);
});

t('somebody with no work shows nothing rather than a flattering 100%', () => {
  const r = staffRecord({ id: 'new', name: 'New', role: 'karigar' }, jobs, expenses, [], null, P);
  assert.equal(r.jobs.total, 0);
  assert.equal(r.completionRate, 0, 'an empty division produced a perfect score');
  assert.equal(r.paidToThem, 0);
  assert.equal(r.commission.earned, 0);
});

t('nothing throws on missing everything', () => {
  for (const empty of [null, undefined, {}]) {
    const r = staffRecord(empty, null, null, null, null, P);
    assert.equal(r.jobs.total, 0);
    assert.equal(r.name, '(no name)');
  }
});

t('a PIN stored either way counts as having one', () => {
  // Older records keep the pin inline; newer ones only a flag, since
  // the real value moved server-side.
  assert.equal(staffRecord({ id: 'x', name: 'A', pin: '1234' }, [], [], [], null, P).hasPin, true);
  assert.equal(staffRecord({ id: 'x', name: 'A', hasPin: true }, [], [], [], null, P).hasPin, true);
  assert.equal(staffRecord({ id: 'x', name: 'A' }, [], [], [], null, P).hasPin, false);
});

t('it names only what the admin can act on', () => {
  // A list that flags everything gets ignored.
  const noPin = staffRecord({ id: 'x', name: 'A', role: 'regional_partner' }, [], [], [], null, P);
  const said = staffNeedsAttention(noPin);
  assert.ok(said.some((l) => /No PIN/.test(l)), 'a person who cannot log in is not flagged');
  assert.ok(said.some((l) => /commission rate/i.test(l)), 'a partner earning 0% is not flagged');

  const healthy = staffRecord(
    { id: 's1', name: 'Rishi', role: 'karigar', hasPin: true }, jobs, expenses, [], null, P,
  );
  assert.deepEqual(staffNeedsAttention(healthy), [], 'a perfectly fine karigar is being nagged about');
  assert.deepEqual(staffNeedsAttention(null), []);
});

t('the screen exists and is reachable from all three places', () => {
  assert.ok(/export function AdminStaffProfile\(/.test(admin), 'there is no staff record screen');
  assert.ok(/const \[profileStaffId, setProfileStaffId\] = useState\(null\)/.test(admin),
    'nothing holds which staff member is open');
  // The staff list, the karigar report and the commission report.
  assert.ok((admin.match(/onOpenStaff/g) || []).length >= 5,
    'the record is not reachable from all three screens that list people');
  assert.ok(/onOpenStaff=\{setProfileStaffId\}/.test(admin), 'Settings cannot open it');
});

t('it can do the two things an admin actually adds', () => {
  const panel = admin.slice(admin.indexOf('export function AdminStaffProfile('), admin.indexOf('function AdminKarigarPerformance('));
  // A payment to a karigar, written as an ordinary expense so the
  // month's totals still see it.
  assert.ok(/type: 'Karigar Payment', payee: rec\.name/.test(panel),
    'a payment recorded here would not appear in the expense totals');
  assert.ok(/onRecordPayout\(rec\.id, payoutAmount\)/.test(panel), 'a partner payout cannot be recorded');
  assert.ok(/onResetPin\(rec\)/.test(panel), 'their PIN cannot be reset from their own record');
  assert.ok(/onOpenJob\(j\.id\)/.test(panel), 'their jobs cannot be opened from here');
});

t('it admits that payment history is matched by name', () => {
  // This will bite somebody when a name is edited, so it says so
  // rather than quietly showing a smaller number.
  const panel = admin.slice(admin.indexOf('export function AdminStaffProfile('), admin.indexOf('function AdminKarigarPerformance('));
  assert.ok(/Renaming them here will/.test(panel),
    'the screen no longer warns that renaming detaches their payments');
});

console.log(n + ' assertions passed\n');
