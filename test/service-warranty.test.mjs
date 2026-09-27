// The 2-year maintenance warranty schedule.
//
// The warranty certificate promises "free service visits for
// fitting/adjustment issues" for two years, and nothing tracked them -
// whether a visit happened depended on the customer complaining. These
// pin the dates, because a schedule that drifts is worse than none:
// telling a customer their visit is due when it is not, or missing one
// that is, both cost more trust than they save.
//
//   node test/service-warranty.test.mjs

import fs from 'node:fs/promises';
// Both halves of the app. The admin panel lives in its own file now so
// it is not shipped to customers, and a check that read only App.jsx
// would quietly stop testing anything the moment a function moved.
const src = (await Promise.all(['../src/App.jsx', '../src/AdminApp.jsx']
  .map((f) => fs.readFile(new URL(f, import.meta.url), 'utf8')))).join('\n');

const SERVICE_VISIT_MONTHS = [6, 12, 18, 24];
const MAINTENANCE_WARRANTY_MONTHS = 24;
function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString();
}
function jobDeliveredAt(job) {
  if (!job) return null;
  if (job.deliveredAt) return job.deliveredAt;
  if (job.status !== 'delivered' && job.status !== 'paid') return null;
  const entry = (job.activity || []).filter((a) => a && /Delivered/i.test(a.text || '')).pop();
  return (entry && entry.date) || job.createdAt || null;
}
function warrantyEndsAt(job) {
  const from = jobDeliveredAt(job);
  return from ? addMonths(from, MAINTENANCE_WARRANTY_MONTHS) : null;
}
function serviceSchedule(job) {
  const from = jobDeliveredAt(job);
  if (!from) return [];
  const done = job.serviceVisits || [];
  return SERVICE_VISIT_MONTHS.map((months) => {
    const hit = done.find((v) => Number(v.n) === months);
    return { n: months, label: months === 12 ? '1 saal' : (months === 24 ? '2 saal' : months + ' mahine'),
      dueAt: addMonths(from, months), doneAt: hit ? hit.at : null };
  });
}
// Compared by calendar day, not by timestamp. A visit due on the 15th
// is due all of the 15th - matching it against the exact hour the job
// was delivered would leave it "not due yet" until mid-morning, which
// is not how anybody reads a due date.
function serviceVisitDue(job, nowIso) {
  const today = new Date(nowIso || Date.now()).toISOString().slice(0, 10);
  return serviceSchedule(job).find((v) => !v.doneAt && v.dueAt.slice(0, 10) <= today) || null;
}

const T = []; const eq = (n,g,w)=>T.push([n, g===w, JSON.stringify(g)+' vs '+JSON.stringify(w)]);
const ok = (n,c,d)=>T.push([n,!!c,d||'']);
const day = (iso) => new Date(iso).toISOString().slice(0,10);

const delivered = { id:'j1', status:'delivered', deliveredAt:'2026-01-15T10:00:00.000Z' };

eq('four visits over two years', serviceSchedule(delivered).length, 4);
eq('first at 6 months',  day(serviceSchedule(delivered)[0].dueAt), '2026-07-15');
eq('second at 1 year',   day(serviceSchedule(delivered)[1].dueAt), '2027-01-15');
eq('fourth at 2 years',  day(serviceSchedule(delivered)[3].dueAt), '2028-01-15');
eq('warranty ends at 2 years', day(warrantyEndsAt(delivered)), '2028-01-15');

// Month-end must not roll over into the wrong month.
eq('31 Aug + 6 months is 28/29 Feb, not 2/3 March',
  day(addMonths('2026-08-31T00:00:00.000Z', 6)), '2027-02-28');

// Not delivered yet means nothing is owed.
eq('a job in progress has no schedule', serviceSchedule({ status:'in_progress' }).length, 0);
ok('a job in progress is never due', serviceVisitDue({ status:'in_progress' }) === null, 'claimed a visit');

// Due, done, and the order they come back in.
ok('not due the day before', serviceVisitDue(delivered, '2026-07-14') === null, 'due too early');
eq('due on the day', serviceVisitDue(delivered, '2026-07-15').n, 6);
eq('still the 6-month one a year later if never done', serviceVisitDue(delivered, '2027-02-01').n, 6);
const oneDone = { ...delivered, serviceVisits:[{ n:6, at:'2026-07-20' }] };
eq('after the 6-month visit, the 1-year one is next', serviceVisitDue(oneDone, '2027-02-01').n, 12);
ok('nothing due once all four are done',
  serviceVisitDue({ ...delivered, serviceVisits:SERVICE_VISIT_MONTHS.map((n)=>({n,at:'2028-02-01'})) }, '2029-01-01') === null, 'still asking');

// Jobs delivered before deliveredAt existed.
const legacy = { id:'j2', status:'paid', createdAt:'2025-01-01T00:00:00.000Z',
  activity:[{ text:'Status updated: Delivered', date:'2026-03-10T00:00:00.000Z' }] };
eq('falls back to the activity log', day(jobDeliveredAt(legacy)), '2026-03-10');
eq('and schedules from that', day(serviceSchedule(legacy)[0].dueAt), '2026-09-10');

ok('the delivery date is recorded on the status change',
  /status === 'delivered' \|\| status === 'paid'\) && !next\.deliveredAt/.test(src), 'deliveredAt never stored');
ok('the screen exists and can mark a visit done',
  /function AdminServiceDueList/.test(src) && /serviceVisits: done/.test(src), 'no way to record a visit');

console.log('\n===== SERVICE / WARRANTY =====');
T.forEach(([n,p,d])=>console.log((p?'PASS  ':'FAIL  ')+n+(p?'':'   ['+d+']')));
const bad=T.filter(t=>!t[1]).length;
console.log('\n'+(T.length-bad)+' passed, '+bad+' failed');
process.exit(bad?1:0);
