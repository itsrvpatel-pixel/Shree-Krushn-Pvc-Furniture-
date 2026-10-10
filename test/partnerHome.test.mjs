// What a regional partner sees when they open the app.
//
// His ask, in his words: the partner's home should carry the gallery,
// their customers' payment records, and whatever else they need, so it
// feels like the whole company is behind them.
//
// That last part is the requirement rather than decoration. A regional
// partner stands in somebody's front room in another city with no
// office behind them. What makes that feel backed is being able to
// answer on the spot - designs, rate, material, warranty - and knowing
// where every job stands without ringing anyone.
//
// Before this they landed on a list of jobs, could see their own
// commission, and had no way at all to see what their customers still
// owed - which is the number that decides whether there is any
// commission coming.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  partnerDashboard, partnerCustomerPayments, partnerCommission,
  partnerNeedsAttention, PARTNER_STALE_DAYS,
} from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const NOW = Date.parse('2026-10-10T12:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

// Stand-ins for App.jsx's own jobTotal/jobPaid. The real ones are
// handed in rather than reimplemented in jobCore - see its note - so
// the tests hand in their own, which is the whole point of the shape.
const T = (j) => (j.items || []).reduce((s, i) => s + Number(i.rate || 0), 0);
const P = (j) => (j.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

const jobs = [
  { id: 'a', customerName: 'Ramesh', phone: '9876543210', status: 'in_progress',
    items: [{ rate: '50000' }], payments: [{ amount: '20000' }],
    createdAt: ago(30), lastUpdatedAt: ago(20) },
  { id: 'b', customerName: 'Suresh', phone: '9998887777', status: 'delivered',
    items: [{ rate: '30000' }], payments: [{ amount: '30000' }], createdAt: ago(60) },
  { id: 'c', customerName: 'Meena', phone: '9123456780', status: 'delivered',
    items: [{ rate: '20000' }], payments: [], createdAt: ago(10) },
];

console.log('partnerHome');

t('the money adds up, both sides of it', () => {
  const d = partnerDashboard(jobs, 15, [{ amount: '3000' }], NOW, T, P);
  assert.equal(d.money.worth, 100000);
  assert.equal(d.money.collected, 50000);
  assert.equal(d.money.outstanding, 50000);
  // Commission is on what was COLLECTED, not on the estimate - an
  // unpaid estimate has produced nothing to take a percentage of.
  assert.equal(d.money.commissionEarned, 7500);
  assert.equal(d.money.commissionPaid, 3000);
  assert.equal(d.money.commissionDue, 4500);
});

t('the customer rows are ordered by what is owed', () => {
  // The order the calls get made in.
  const rows = partnerCustomerPayments(jobs, T, P);
  assert.deepEqual(rows.map((r) => r.name), ['Ramesh', 'Meena', 'Suresh']);
  assert.deepEqual(rows.map((r) => r.due), [30000, 20000, 0]);
  assert.deepEqual(rows.map((r) => r.pct), [40, 0, 100]);
});

t('an overpayment does not show as more than paid in full', () => {
  const over = [{ id: 'x', customerName: 'A', status: 'paid', items: [{ rate: '1000' }], payments: [{ amount: '1500' }] }];
  const [row] = partnerCustomerPayments(over, T, P);
  assert.equal(row.due, 0, 'a negative amount due');
  assert.equal(row.pct, 100, 'a bar past the end of itself');
});

t('a job with no estimate yet does not divide by zero', () => {
  const blank = [{ id: 'y', customerName: 'B', status: 'estimate', items: [], payments: [] }];
  const [row] = partnerCustomerPayments(blank, T, P);
  assert.equal(row.total, 0);
  assert.equal(row.pct, 0);
  assert.equal(row.due, 0);
});

t('only three things are called out as needing them', () => {
  // A list that names everything names nothing. Appointment to
  // confirm, money owed on delivered work, and a job that has gone
  // quiet - and the first match wins, so one job never produces two
  // lines.
  const a = partnerNeedsAttention(jobs, NOW, T, P);
  assert.deepEqual(a.map((r) => r.kind).sort(), ['payment', 'stale']);
  const byId = Object.fromEntries(a.map((r) => [r.id, r]));
  assert.equal(byId.a.kind, 'stale', 'a job untouched for 20 days is not flagged');
  assert.equal(byId.c.kind, 'payment', 'delivered and unpaid is not flagged');
  assert.equal(byId.c.due, 20000, 'the amount owed is not carried through');
  assert.ok(!byId.b, 'a finished, fully paid job is being nagged about');
});

t('an unconfirmed appointment outranks everything else on that job', () => {
  const withAppt = [{ ...jobs[2], appointment: { preferredDate: ago(1), status: 'requested' } }];
  const a = partnerNeedsAttention(withAppt, NOW, T, P);
  assert.equal(a.length, 1, 'one job produced two lines');
  assert.equal(a[0].kind, 'appointment');
});

t('a quiet job is only called quiet after a week', () => {
  const fresh = [{ ...jobs[0], lastUpdatedAt: new Date(NOW - (PARTNER_STALE_DAYS - 1) * 86400000).toISOString() }];
  assert.deepEqual(partnerNeedsAttention(fresh, NOW, T, P), []);
  const old = [{ ...jobs[0], lastUpdatedAt: new Date(NOW - PARTNER_STALE_DAYS * 86400000).toISOString() }];
  assert.equal(partnerNeedsAttention(old, NOW, T, P).length, 1);
});

t('nothing throws on nothing', () => {
  for (const empty of [null, undefined, []]) {
    const d = partnerDashboard(empty, 15, null, NOW, T, P);
    assert.equal(d.jobs.total, 0);
    assert.equal(d.money.outstanding, 0);
    assert.deepEqual(d.payments, []);
    assert.deepEqual(d.attention, []);
  }
  assert.equal(partnerCommission(null, null, P).total, 0);
});

t('a job with no name still gets a row rather than a blank one', () => {
  const [row] = partnerCustomerPayments([{ id: 'z', items: [], payments: [] }], T, P);
  assert.equal(row.name, '(no name)');
});

t('the screen is a layout, not a second set of sums', () => {
  // Every figure comes from the one call. The moment a screen starts
  // computing its own, Home and Money begin to disagree.
  const panel = app.slice(app.indexOf('function RegionalPartnerApp('));
  assert.ok(/const dash = partnerDashboard\(jobs, commissionPercent, commissionPayouts, Date\.now\(\), jobTotal, jobPaid\)/.test(panel),
    'the dashboard is no longer computed in one place');
  assert.ok(/dash\.money\.outstanding/.test(panel), 'Home does not show what customers still owe');
  assert.ok(/dash\.payments\.map/.test(panel), 'there is no per-customer payment list');
  assert.ok(/dash\.attention/.test(panel), 'nothing tells the partner which job is waiting on them');
});

t('the partner lands on Home, and can still reach everything', () => {
  const panel = app.slice(app.indexOf('function RegionalPartnerApp('));
  assert.ok(/useState\('home'\)/.test(panel), 'they still land on a list of jobs');
  for (const key of ['home', 'jobs', 'money', 'gallery', 'profile']) {
    assert.ok(new RegExp("key: '" + key + "'").test(panel), 'the ' + key + ' tab is missing');
  }
  // Activity lost its place in the bottom row; it must not have lost
  // its way in entirely.
  assert.ok(/tab === 'notifications'/.test(panel), 'the activity screen is gone');
  assert.ok(/setTab\('notifications'\)/.test(panel), 'the activity screen is unreachable');
});

t('the company material is the company\'s, not the partner\'s', () => {
  // The point of this screen: it is the firm speaking. A partner can
  // show it and cannot edit it.
  const panel = app.slice(app.indexOf('function RegionalPartnerApp('));
  const support = panel.slice(panel.indexOf("tab === 'support'"), panel.indexOf('<BottomNav'));
  for (const bit of ['estimateRates', 'materialSpecs', 'companyBenefits', 'faqs', 'brochures']) {
    assert.ok(support.includes(bit), 'the support screen does not carry ' + bit);
  }
  assert.ok(!/setEstimateRates|setFaqs|setMaterialSpecs|setCompanyBenefits/.test(support),
    'a partner can edit the company material');
  assert.ok(/waInviteText\('designs'\)/.test(support), 'there is no app link to send a new customer');
});

console.log(n + ' assertions passed\n');
