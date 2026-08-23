import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import {
  Calendar, Hammer, IndianRupee, Plus, X, Phone, User,
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Trash2, Edit3, Search, CheckCircle2,
  Image as ImageIcon, Star, MessageSquare, Grid3x3, LogOut, ShieldCheck,
  Camera, Send, ArrowLeft, SlidersHorizontal, Lock,
  Home, Sparkles, AlertTriangle, Link2, Check, Package, FileText,
  UserPlus, Users, Download, Eye, EyeOff, TrendingUp,
  Bell, ThumbsUp, XCircle, AlertCircle, Calculator, HelpCircle
} from 'lucide-react';

/* ===========================================================
   Shree Krushn PVC Furniture - Full App v3
   Brand: navy (#0F1B3D) + cream (#F8FAFB) + warm grey accent
=========================================================== */

const BRAND = {
  navy: '#0F1B3D',
  navyLight: '#1D2E5C',
  cream: '#F8FAFB',
  paper: '#FFFFFF',
  line: '#E4E7EE',
  gold: '#A8975F',
  textMuted: '#7C8399',
};

const DEFAULT_CATEGORIES = ['Kitchen', 'Wardrobe', 'Dressing Table', 'Bathroom Cabinet', 'TV Unit', 'Bed', 'Color/POP Work', 'Electrical Work', 'Other'];
// A special, always-present gallery bucket (not part of the admin's
// configured item-category list) for dumping a large mixed batch of
// photos in one upload instead of having to switch categories and
// upload separately for each one - photos land here first, then get
// individually moved into their real category afterward using the
// existing per-photo "move to category" edit action.
const UNCATEGORIZED = 'Uncategorized';
const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '4+ BHK', 'Individual Room', 'Shop/Office'];
const EXPENSE_TYPES = ['Karigar Payment', 'Material', 'Transport', 'Other'];

const STATUS = {
  appointment: { label: 'Appointment', color: '#A8975F', bg: '#F3EFE3', icon: Calendar },
  estimate: { label: 'Estimate', color: '#3D6B66', bg: '#E1EDEA', icon: Edit3 },
  in_progress: { label: 'In Progress', color: '#B5562E', bg: '#F7E3D8', icon: Hammer },
  delivered: { label: 'Delivered', color: '#1D2E5C', bg: '#E1E5F0', icon: Package },
  paid: { label: 'Paid', color: '#2F7D4F', bg: '#DFF0E4', icon: CheckCircle2 },
};
const STATUS_ORDER = ['appointment', 'estimate', 'in_progress', 'delivered', 'paid'];
// Complaint tracking stages - a customer-reported post-delivery
// problem moves through its own small progression, mirroring the main
// job's STATUS/STATUS_ORDER pattern above, so a customer can see WHERE
// their complaint stands (not just "open" vs "resolved" with nothing
// in between) - the same visual stepper approach used for the job
// itself, applied here at a smaller scale.
const COMPLAINT_STAGES = {
  open: { label: 'Reported', color: '#B5562E', icon: AlertCircle },
  in_progress: { label: 'Repair Ho Raha Hai', color: '#A8975F', icon: Hammer },
  resolved: { label: 'Resolved', color: '#2F7D4F', icon: CheckCircle2 },
};
const COMPLAINT_STAGE_ORDER = ['open', 'in_progress', 'resolved'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Built via fromCharCode rather than a newline escape sequence inside a
// string literal: backslash escapes inside string literals have been observed to get silently stripped when
// this file is edited/pasted through certain mobile text editors.
const NEWLINE = String.fromCharCode(10);

// Login session (who's logged in, on this device) is kept in localStorage
// rather than the shared Firebase-backed storage, since it's per-browser
// state that should survive a page refresh but never needs to sync across
// devices. Wrapped in try/catch since some browsers block localStorage in
// private-browsing mode, in which case we just fall back to no persistence.
const SESSION_STORAGE_KEY = 'shree_krushn_session';
function loadStoredSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
function saveStoredSession(session) {
  try {
    if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    // best effort - session just won't survive a refresh in this case
  }
}
const DEFAULT_PIN = '2580';

// Runs an async map over `items`, but never more than `limit` calls in
// flight at once - used for batches of Firebase Storage uploads, so a
// large photo batch doesn't fire dozens of simultaneous network
// requests (which can time out, get throttled, or on a weak mobile
// connection simply never all complete) the way Promise.all over the
// whole array would. Preserves the original order in the results.
async function mapWithConcurrencyLimit(items, limit, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Merges a local write against the FRESHEST server data for an
// id-keyed array collection (jobs, customers, expenses, staff, etc.) -
// protects against one device's stale local snapshot silently
// overwriting another device's concurrent additions/edits/deletes.
// With more than one admin device active, each one's local copy of a
// collection can fall a little behind whatever another device just
// saved; writing that local snapshot as the new document would
// silently discard anything added or changed elsewhere in the
// meantime - a new customer registration, a payment someone just
// recorded, anything. Only entries THIS write actually changes
// (compared to what this device knew about before the edit, via
// prevLocal) get applied on top of the current server data, so a
// concurrent change from elsewhere is never overwritten no matter how
// far behind this device's local copy had drifted.
async function mergeIdArrayWithFreshServer(storageKey, next, prevLocal) {
  const prevById = {};
  prevLocal.forEach((item) => { prevById[item.id] = item; });
  const nextById = {};
  next.forEach((item) => { nextById[item.id] = item; });
  const changedOrAdded = next.filter((item) => JSON.stringify(item) !== JSON.stringify(prevById[item.id]));
  const removedIds = prevLocal.filter((item) => !nextById[item.id]).map((item) => item.id);

  let freshItems = prevLocal;
  try {
    const raw = await window.storage.get(storageKey, true);
    if (raw && raw.value) freshItems = JSON.parse(raw.value);
  } catch (e) { /* fall back to this device's own local copy */ }

  const mergedById = {};
  freshItems.forEach((item) => { mergedById[item.id] = item; });
  changedOrAdded.forEach((item) => { mergedById[item.id] = item; });
  removedIds.forEach((id) => { delete mergedById[id]; });
  return Object.values(mergedById);
}

// One job's array-type sub-fields (payments, items, extra work, notes,
// photos, requirements, activity, additional visits) merged by their
// OWN id, rather than one whole job object replacing another. The
// record-level merge above already protects "two admins editing
// DIFFERENT jobs" - this covers the narrower but higher-stakes case of
// two admins editing the SAME job at close to the same time (one
// records a payment, the other adds an estimate item, say): without
// this, whichever save landed second would silently overwrite the
// other's change to that job, even though the record-level fix alone
// would correctly preserve every OTHER job. Scalar fields (status,
// discount, etc.) still follow simple "local edit wins" semantics,
// since those genuinely can't be merged the way a list of distinct
// entries can.
function mergeJobFields(freshJob, localPrevJob, localNextJob) {
  if (!freshJob) return localNextJob;
  if (JSON.stringify(freshJob) === JSON.stringify(localPrevJob)) return localNextJob;
  const listFields = ['payments', 'items', 'extraWork', 'projectNotes', 'progressPhotos', 'requirements', 'activity', 'additionalVisits', 'estimateDrafts', 'savedDesigns'];
  const merged = { ...freshJob, ...localNextJob };
  for (const field of listFields) {
    const freshList = freshJob[field] || [];
    const localPrevList = localPrevJob[field] || [];
    const localNextList = localNextJob[field] || [];
    const localPrevById = {};
    localPrevList.forEach((it) => { if (it && it.id) localPrevById[it.id] = it; });
    const localChangedOrAdded = localNextList.filter((it) => it && it.id && JSON.stringify(it) !== JSON.stringify(localPrevById[it.id]));
    const localRemovedIds = localPrevList.filter((it) => it && it.id && !localNextList.some((x) => x.id === it.id)).map((it) => it.id);
    const fieldMergedById = {};
    freshList.forEach((it) => { if (it && it.id) fieldMergedById[it.id] = it; });
    localChangedOrAdded.forEach((it) => { fieldMergedById[it.id] = it; });
    localRemovedIds.forEach((id) => { delete fieldMergedById[id]; });
    merged[field] = Object.values(fieldMergedById);
  }
  return merged;
}

// Same record-level protection as mergeIdArrayWithFreshServer, plus
// field-level merging (via mergeJobFields above) for any job that
// someone else ALSO changed concurrently - see mergeJobFields for why
// jobs specifically need this extra layer.
async function mergeJobsWithFreshServer(next, prevLocal) {
  const prevById = {};
  prevLocal.forEach((j) => { prevById[j.id] = j; });
  const nextById = {};
  next.forEach((j) => { nextById[j.id] = j; });
  const changedOrAdded = next.filter((j) => JSON.stringify(j) !== JSON.stringify(prevById[j.id]));
  const removedIds = prevLocal.filter((j) => !nextById[j.id]).map((j) => j.id);

  let freshJobs = prevLocal;
  try {
    const raw = await window.storage.get('jobs', true);
    if (raw && raw.value) freshJobs = JSON.parse(raw.value);
  } catch (e) { /* fall back to this device's own local copy */ }

  const freshById = {};
  freshJobs.forEach((j) => { freshById[j.id] = j; });

  const mergedById = {};
  freshJobs.forEach((j) => { mergedById[j.id] = j; });
  changedOrAdded.forEach((j) => {
    mergedById[j.id] = mergeJobFields(freshById[j.id], prevById[j.id], j);
  });
  removedIds.forEach((id) => { delete mergedById[id]; });
  return Object.values(mergedById);
}

function currency(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
// Plain "Rs." version for PDFs - jsPDF's default fonts don't reliably
// render the Unicode ₹ glyph (falls back to a blank/box character on
// many systems), so PDFs use this instead of currency() above.
function currencyPlain(n) {
  const v = Number(n) || 0;
  return 'Rs. ' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
// Days remaining until a target date (expected completion), counting
// whole calendar days rather than raw hours - comparing at midnight on
// both ends means someone checking at 11pm the day before still
// correctly sees "1 din baaki", not "0 din baaki" from an hours-based
// calculation just barely clearing to a fraction of a day. Negative
// means the date has already passed.
function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  if (isNaN(target)) return null;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const targetMidnight = new Date(target);
  targetMidnight.setHours(0, 0, 0, 0);
  return Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
}
// Appointment/visit times are stored as "HH:MM" (24-hour), the format
// browsers' native <input type="time"> pickers always use regardless of
// locale - this converts that to a 12-hour "h:MM AM/PM" display, since
// showing raw 24-hour values ("14:30") everywhere they're displayed
// reads unnaturally for a mostly 12-hour-clock audience.
function formatTime12h(time24) {
  if (!time24) return '';
  const parts = time24.split(':');
  const h = Number(parts[0]);
  const m = parts[1];
  if (isNaN(h) || m === undefined) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return h12 + ':' + m + ' ' + period;
}
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'abhi';
  if (min < 60) return min + 'm pehle';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h pehle';
  const day = Math.floor(hr / 24);
  if (day < 7) return day + 'd pehle';
  return formatDate(iso);
}
const BUSINESS = {
  name: 'Shree Krushn PVC Furniture',
  tagline: 'Premium PVC Interior Solutions',
  owner: 'Ravi Vasoya',
  addressLine: 'Nikol, Ahmedabad - Head Office',
  branches: [
    { city: 'Ahmedabad', contact: 'Ravi Vasoya', phone: '+91 79902 83116' },
    { city: 'Vadodara', contact: 'Sagar Patel', phone: '+91 97268 63451' },
  ],
  phone: '+91 79902 83116',
  altPhone: '+91 95123 18775',
  website: 'www.shreekrushnpvcfurniture.site',
};

const ESTIMATE_TERMS = [
  {
    title: 'Payment Terms',
    points: [
      '50% advance at the start of work',
      '40% midway during work progress',
      '10% on final completion',
      'Payments are non-refundable after work confirmation',
    ],
  },
  {
    title: 'Work Duration',
    points: ['Estimated completion: 8-10 days (depending on work & site condition)'],
  },
  {
    title: 'Material',
    points: [
      '100% PVC Board (Waterproof & Termite-proof)',
      'Kaka PVC 7kg core sheet',
      'Standard company hardware fittings (Rajvanshi, Bansi, etc.)',
      'PVC Laminate brands: Crystal, Orian, Hexa, Flexibond, Rama, Lionia (1mm-1.25mm)',
      'Hardware: Heavy channels, SS hinges, soft-closing tandem units for kitchen',
      'Sliding wardrobe: Soft-close sliding channel',
      'Other: Standard heavy locks, glue Airfast/Fevikwik 502/Evobond adhesives',
    ],
  },
  { title: 'Site Condition', points: ['Electricity, water & working space to be provided by client'] },
  {
    title: 'Quotation Includes',
    points: ['Design providing', 'Manufacturing & fixing of units', 'Material + labour + transportation charges included'],
  },
  { title: 'Extra Work', points: ['Any extra work or changes after confirmation will be charged separately'] },
  { title: 'Warranty', points: ['5 years warranty on material (manufacturing defects only - varies by item & company)'] },
  { title: 'GST', points: ['Prices are exclusive of GST', 'No GST added'] },
  {
    title: 'Price Variation',
    points: ['Given prices are tentative', 'Final quotation may change after design confirmation', 'Any high-end / expensive item is not included'],
  },
];

function jobTotal(job) {
  const itemsTotal = (job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0);
  // Customer-approved extra work is money the customer has explicitly
  // agreed to pay, on top of the original estimate - it belongs in the
  // payable total the same way an estimate line does. Pending or
  // rejected extra work items are excluded: nothing is owed for a
  // request still awaiting a price, awaiting the customer's decision, or
  // one they turned down.
  const approvedExtraWork = (job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // Discount is a flat rupee amount admin can apply to the whole
  // estimate (e.g. a negotiated final price) - subtracted last, after
  // items and approved extra work, and never allowed to push the total
  // below zero even if someone enters a discount larger than the total.
  const discount = Number(job.discount) || 0;
  return Math.max(0, itemsTotal + approvedExtraWork - discount);
}
function jobPaid(job) {
  return (job.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function jobDue(job) {
  return Math.max(0, jobTotal(job) - jobPaid(job));
}

// Per-project profit: revenue actually collected for this job, minus any
// expenses explicitly linked to it (via expense.jobId). Uses collected
// payments rather than the full estimate total, since profit realized so
// far is what's actually in hand - an unpaid estimate isn't profit yet.
// Expenses with no jobId (general/shared costs) are deliberately excluded
// here; they show up in the overall business totals instead.
function jobProfit(job, allExpenses) {
  const collected = jobPaid(job);
  const linkedExpenses = (allExpenses || []).filter((e) => e.jobId === job.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return { collected, linkedExpenses, profit: collected - linkedExpenses };
}

// Payment milestones: standard 50/40/10 split tied to work stages -
// 50% when material is ordered/arrives (status moves to in_progress),
// 40% during the work itself, 10% on completion (delivered). This gives
// admin a clear "how much should be collected by now" figure instead of
// just a single total-due number, matching how the business actually
// structures payment requests with customers.
const PAYMENT_MILESTONES = [
  { key: 'material', label: 'Material Advance (50%)', percent: 0.5, atStatus: 'in_progress' },
  { key: 'during_work', label: 'During Work (40%)', percent: 0.4, atStatus: 'delivered' },
  // atStatus is 'delivered', NOT 'paid' - a job's status auto-becomes
  // 'paid' the instant jobDue reaches 0 (see addPayment below), so if
  // this milestone waited for status==='paid' to count as "reached", it
  // could never show a nonzero due amount: by the time it's reached,
  // the job is already fully paid by definition. Tying it to 'delivered'
  // instead means the final 10% correctly shows as outstanding once
  // delivery happens, for as long as payment is still pending.
  { key: 'completion', label: 'On Completion (10%)', percent: 0.1, atStatus: 'delivered' },
];
// Returns each milestone's amount, whether it's been "reached" (job status
// has progressed far enough to owe it), and how much of it remains
// unpaid - allocating actual payments against milestones in order, so a
// partial payment fills the earliest open milestone first rather than
// being split evenly across all three.
function jobMilestoneStatus(job) {
  const total = jobTotal(job);
  const paid = jobPaid(job);
  const statusIdx = STATUS_ORDER.indexOf(job.status);
  let remainingPaid = paid;
  return PAYMENT_MILESTONES.map((m) => {
    const amount = Math.round(total * m.percent);
    const reached = statusIdx >= STATUS_ORDER.indexOf(m.atStatus);
    const appliedToThis = Math.min(remainingPaid, amount);
    remainingPaid -= appliedToThis;
    const due = Math.max(0, amount - appliedToThis);
    return { ...m, amount, reached, paidSoFar: appliedToThis, due: reached ? due : 0, upcoming: !reached ? due : 0 };
  });
}
// Estimate item: either sq-ft based (length x height x rate) or a flat qty x rate line.
// sqft = (length * height) / 144 when length/height are in inches, matching the
// business's real quotation sheet (e.g. 145 x 112 => 112.78 sq ft @ rate/sqft).
function estimateItemSqft(it) {
  const l = Number(it.length) || 0;
  const h = Number(it.height) || 0;
  if (l > 0 && h > 0) return (l * h) / 144;
  return null;
}
function estimateItemAmount(it) {
  const sqft = estimateItemSqft(it);
  if (sqft !== null) return sqft * (Number(it.rate) || 0);
  return (Number(it.qty) || 1) * (Number(it.rate) || 0);
}

// Builds a plain-text WhatsApp-friendly summary of a job's estimate -
// item list with sq-ft/amount, grand total, and a short terms line.
function buildEstimateWhatsAppText(job) {
  const lines = [];
  lines.push('*' + BUSINESS.name + '*');
  lines.push('Estimate for ' + job.customerName);
  if (job.materialCompany || job.sheetWeightKg) {
    lines.push('Material: ' + [job.materialCompany, job.sheetWeightKg && (job.sheetWeightKg + ' kg sheet')].filter(Boolean).join(' - '));
  }
  lines.push('');
  (job.items || []).forEach((it, i) => {
    const sqft = estimateItemSqft(it);
    const dims = sqft !== null ? (' (' + it.length + "'x" + it.height + "' = " + sqft.toFixed(2) + ' sqft)') : '';
    lines.push((i + 1) + '. ' + it.desc + dims + ' - ' + currency(estimateItemAmount(it)));
  });
  (job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).forEach((e, i) => {
    lines.push(((job.items || []).length + i + 1) + '. ' + e.desc + ' (Extra Work) - ' + currency(e.amount));
  });
  lines.push('');
  if (Number(job.discount) > 0) {
    const subtotal = (job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0) + (job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    lines.push('Subtotal: ' + currency(subtotal));
    lines.push('Discount: -' + currency(job.discount));
  }
  lines.push('*Grand Total: ' + currency(jobTotal(job)) + '*');
  const due = jobDue(job);
  if (due > 0) lines.push('Due: ' + currency(due));
  lines.push('');
  lines.push('Payment: 50% advance, 40% midway, 10% on completion.');
  lines.push(BUSINESS.phone + ' - ' + BUSINESS.website);
  return lines.join(NEWLINE);
}

/* ---- Payment receipt PDF: a formal, downloadable receipt for a single
   payment entry. Uses plain "Rs." instead of the actual rupee symbol,
   since jsPDF's default fonts don't reliably render the Unicode rupee
   glyph (falls back to a box/blank character on many systems) - "Rs."
   is universally readable in any PDF viewer regardless of font support.
   Kept as simple positioned text rather than pulling in the autotable
   plugin, since a receipt only needs a handful of lines, not a full
   data table. ---- */
// Fetches a same-origin image (the app icon, used as the PDF logo) and
// converts it to a base64 data URI - jsPDF's addImage needs the actual
// image bytes, not a URL, and this keeps the logo out of the app's own
// source code (a large inline base64 string there caused real
// corruption problems before - see Logo component's history) by
// loading it fresh from the same small PNG file the rest of the app
// already uses for its icon.
async function loadImageAsDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function buildReceiptPdfDoc(job, payment) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Navy header band with the logo and business name, matching the
  // app's own brand colors - a plain black-text-on-white header (the
  // old design) didn't look distinctly "this business", especially
  // once printed or viewed as a thumbnail in WhatsApp.
  const navy = [15, 27, 61];
  const gold = [168, 151, 95];
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 38, 'F');

  try {
    const logoDataUrl = await loadImageAsDataUrl('/icon-512.png');
    doc.addImage(logoDataUrl, 'PNG', 15, 7, 24, 24);
  } catch (e) {
    // Logo fetch failed (offline, blocked, etc.) - the receipt is still
    // fully valid and usable without it, just without the image.
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text(BUSINESS.name, 44, 17);
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.text(BUSINESS.addressLine, 44, 23);
  doc.text(BUSINESS.phone + '  |  ' + BUSINESS.website, 44, 28);

  let y = 50;
  doc.setTextColor(...navy);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('PAYMENT RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 3;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - 22, y, pageWidth / 2 + 22, y);
  y += 12;

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.text('Customer:', 15, y);
  doc.setFont(undefined, 'bold');
  doc.text(job.customerName, 70, y);
  doc.setFont(undefined, 'normal');
  y += 7;
  if (job.phone) {
    doc.text('Phone:', 15, y);
    doc.text(formatPhoneDisplay(job.phone), 70, y);
    y += 7;
  }
  doc.text('Receipt Date:', 15, y);
  doc.text(formatDate(payment.date), 70, y);
  y += 7;
  doc.text('Receipt No:', 15, y);
  doc.text(payment.id.slice(-8).toUpperCase(), 70, y);
  y += 10;

  doc.setDrawColor(...navy);
  doc.setLineWidth(0.2);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  // Amount received in a highlighted gold-bordered box - the single
  // most important number on the page, so it gets visual weight
  // instead of blending in with the rest of the text.
  doc.setFillColor(248, 250, 251);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, y, pageWidth - 30, 16, 2, 2, 'FD');
  doc.setTextColor(...navy);
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Amount Received', 20, y + 10);
  doc.setFontSize(14);
  doc.setTextColor(...navy);
  doc.text('Rs. ' + Number(payment.amount).toLocaleString('en-IN'), pageWidth - 20, y + 10.5, { align: 'right' });
  y += 22;

  if (payment.note) {
    doc.setFontSize(9.5);
    doc.setFont(undefined, 'italic');
    doc.setTextColor(100, 100, 100);
    doc.text('Note: ' + payment.note, 15, y);
    y += 8;
  }
  y += 2;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  const total = jobTotal(job);
  const paidTillNow = jobPaid(job);
  const dueNow = jobDue(job);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('Project Total:', 15, y);
  doc.text('Rs. ' + total.toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 6;
  doc.text('Total Paid Till Date:', 15, y);
  doc.text('Rs. ' + paidTillNow.toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 6;
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...navy);
  doc.text('Balance Due:', 15, y);
  doc.text('Rs. ' + dueNow.toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 16;

  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(120, 120, 120);
  doc.text('Thank you for your business.', pageWidth / 2, y, { align: 'center' });

  return doc;
}

// A formal warranty certificate, issued once a job reaches delivered/
// paid - separate from the receipt/estimate PDFs above, since this is
// meant to be KEPT (a certificate a customer would file away and refer
// back to if something needs a warranty claim years later), not a
// transactional record of one payment. Warranty wording matches the
// same terms shown in the app's own info cards (see the 'Warranty'
// entry there) rather than restating them differently, so the two
// never drift out of sync with each other.
async function buildWarrantyPdfDoc(job) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const navy = [15, 27, 61];
  const gold = [168, 151, 95];

  // Decorative border, since a certificate customarily looks more
  // formal/framed than an ordinary transactional document.
  doc.setDrawColor(...gold);
  doc.setLineWidth(1.2);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);
  doc.setLineWidth(0.4);
  doc.rect(11, 11, pageWidth - 22, pageHeight - 22);

  let y = 30;
  try {
    const logoDataUrl = await loadImageAsDataUrl('/icon-512.png');
    doc.addImage(logoDataUrl, 'PNG', pageWidth / 2 - 12, y, 24, 24);
  } catch (e) {
    // Logo fetch failed - certificate is still fully valid without it.
  }
  y += 32;

  doc.setTextColor(...navy);
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('WARRANTY CERTIFICATE', pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.6);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 14;

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text('This certifies that the furniture supplied to', pageWidth / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...navy);
  doc.text(job.customerName, pageWidth / 2, y, { align: 'center' });
  y += 10;

  if (job.flatNo || job.address) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text([job.flatNo, job.address].filter(Boolean).join(', '), pageWidth / 2, y, { align: 'center' });
    y += 10;
  }
  y += 4;

  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text('is covered under the warranty terms below, by ' + BUSINESS.name + '.', pageWidth / 2, y, { align: 'center' });
  y += 16;

  // Items covered (from the actual estimate) - a plain list, not a
  // priced table, since this document is about coverage, not billing.
  const items = job.items || [];
  if (items.length > 0) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...navy);
    doc.text('Items Covered:', 25, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    items.forEach((it) => {
      doc.text('- ' + it.desc, 28, y);
      y += 6;
    });
    y += 6;
  }

  doc.setFillColor(248, 250, 251);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  const boxTop = y;
  doc.roundedRect(20, boxTop, pageWidth - 40, 24, 2, 2, 'FD');
  doc.setFontSize(9.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('5 years warranty on material (manufacturing defects only - varies by item & company).', pageWidth / 2, boxTop + 10, { align: 'center', maxWidth: pageWidth - 50 });
  doc.text('Warranty does not cover physical damage, misuse, or normal wear and tear.', pageWidth / 2, boxTop + 17, { align: 'center', maxWidth: pageWidth - 50 });
  y = boxTop + 34;

  doc.setFontSize(9.5);
  doc.setTextColor(80, 80, 80);
  doc.text('Delivery Date: ' + formatDate(job.expectedCompletionDate || job.createdAt), 25, y);
  doc.text('Certificate No: WC-' + job.id.slice(-8).toUpperCase(), pageWidth - 25, y, { align: 'right' });
  y += 20;

  doc.setDrawColor(200, 200, 200);
  doc.line(pageWidth - 70, y, pageWidth - 25, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text('Authorized Signatory', pageWidth - 47.5, y, { align: 'center' });
  y += 4;
  doc.text(BUSINESS.name, pageWidth - 47.5, y, { align: 'center' });

  return doc;
}

async function generateReceiptPdf(job, payment, showToast) {
  try {
    const doc = await buildReceiptPdfDoc(job, payment);
    doc.save('Receipt-' + job.customerName.replace(/\s+/g, '-') + '-' + payment.id.slice(-8) + '.pdf');
  } catch (e) {
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
  }
}

async function generateWarrantyCertificate(job, showToast) {
  try {
    const doc = await buildWarrantyPdfDoc(job);
    doc.save('Warranty-Certificate-' + job.customerName.replace(/\s+/g, '-') + '.pdf');
  } catch (e) {
    if (showToast) showToast('Certificate banane mein dikkat aayi, dobara try karein', true);
  }
}

// A shareable price list, built from the same admin-configured rate
// types (name/rate/unit) the Instant Estimate Calculator already uses
// for customers - one source of truth for what things cost, just
// presented here as a document instead of an interactive calculator,
// for the case where a customer (or a lead who hasn't even booked a
// visit yet) just wants "what do things roughly cost" without opening
// the app at all.
async function buildPriceListPdfDoc(estimateRates) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const navy = [15, 27, 61];
  const gold = [168, 151, 95];

  doc.setFillColor(...navy);
  doc.rect(0, 0, pageWidth, 38, 'F');
  try {
    const logoDataUrl = await loadImageAsDataUrl('/icon-512.png');
    doc.addImage(logoDataUrl, 'PNG', 15, 7, 24, 24);
  } catch (e) {
    // Logo fetch failed - the price list is still fully valid without it.
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text(BUSINESS.name, 44, 17);
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'normal');
  doc.text(BUSINESS.addressLine, 44, 23);
  doc.text(BUSINESS.phone + '  |  ' + BUSINESS.website, 44, 28);

  let y = 50;
  doc.setTextColor(...navy);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('PRICE LIST', pageWidth / 2, y, { align: 'center' });
  y += 3;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.line(pageWidth / 2 - 22, y, pageWidth / 2 + 22, y);
  y += 14;

  doc.setFillColor(248, 250, 251);
  doc.rect(15, y, pageWidth - 30, 10, 'F');
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(...navy);
  doc.text('Item', 20, y + 7);
  doc.text('Rate', pageWidth - 20, y + 7, { align: 'right' });
  y += 16;

  const rates = (estimateRates && estimateRates.length > 0) ? estimateRates : [];
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  rates.forEach((r) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setTextColor(60, 60, 60);
    doc.text(r.name, 20, y);
    doc.text('Rs. ' + Number(r.rate).toLocaleString('en-IN') + (r.unit === 'piece' ? ' / piece' : ' / sqft'), pageWidth - 20, y, { align: 'right' });
    y += 8;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(15, y - 4, pageWidth - 15, y - 4);
  });

  y += 10;
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'italic');
  doc.setTextColor(120, 120, 120);
  doc.text('Prices are approximate and subject to confirmation after a site visit. Prices are exclusive of GST.', pageWidth / 2, y, { align: 'center', maxWidth: pageWidth - 40 });

  return doc;
}

async function generatePriceListPdf(estimateRates, showToast) {
  try {
    const doc = await buildPriceListPdfDoc(estimateRates);
    doc.save('Price-List-' + BUSINESS.name.replace(/\s+/g, '-') + '.pdf');
  } catch (e) {
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
  }
}

async function sharePriceListPdf(estimateRates, showToast) {
  let doc;
  try {
    doc = await buildPriceListPdfDoc(estimateRates);
  } catch (e) {
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
    return;
  }
  try {
    const fileName = 'Price-List-' + BUSINESS.name.replace(/\s+/g, '-') + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Price List - ' + BUSINESS.name });
        return;
      }
    } catch (e) {
      // user cancelled the share sheet, canShare/share threw, or it
      // otherwise failed - fall through to download either way
    }
    doc.save(fileName);
    if (showToast) showToast('PDF download ho gaya - WhatsApp mein manually attach karein');
  } catch (e) {
    if (showToast) showToast('PDF share/download mein dikkat aayi, dobara try karein', true);
  }
}

// Shares the payment receipt PDF directly to WhatsApp (or any app the
// phone offers) using the Web Share API with an actual file attached -
// same approach as shareEstimatePdf, so "payment received" also lands
// in the chat as a real PDF attachment rather than a plain-text
// message. Falls back to a plain download (with a toast explaining
// why) wherever file sharing isn't supported.
async function shareReceiptPdf(job, payment, showToast) {
  let doc;
  try {
    doc = await buildReceiptPdfDoc(job, payment);
  } catch (e) {
    // Same silent-failure risk as shareEstimatePdf had - see its own
    // comment for the full explanation. Any failure building the PDF
    // now surfaces as a toast instead of the button just doing nothing.
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
    return;
  }
  // Everything from here on (blob/File creation, the share attempt,
  // and even the final plain-download fallback) is wrapped in one
  // last outer try/catch - belt-and-suspenders, so that truly nothing
  // between "PDF built successfully" and "something visibly happened
  // for the user" can silently fail.
  try {
    const fileName = 'Receipt-' + job.customerName.replace(/\s+/g, '-') + '-' + payment.id.slice(-8) + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    // The canShare() CHECK itself (not just the actual share() call) can
    // throw on some browsers/OS versions for certain file types, rather
    // than just returning false - wrapping the whole detect-and-share
    // block in one try/catch (not just around share() as before) means
    // that no longer results in a silent, invisible failure; any issue
    // here now correctly falls through to the plain-download fallback
    // below instead.
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Payment Receipt - ' + job.customerName });
        return;
      }
    } catch (e) {
      // user cancelled the share sheet, canShare/share threw, or it
      // otherwise failed - fall through to download either way
    }
    doc.save(fileName);
    if (showToast) showToast('Receipt download ho gaya - WhatsApp mein manually attach karein');
  } catch (e) {
    if (showToast) showToast('PDF share/download mein dikkat aayi, dobara try karein', true);
  }
}

/* ---- Estimate PDF via screenshot: captures the ACTUAL rendered
   #quotation-print-area DOM node (the same content QuotationPreview
   shows on screen - logo, brand colors, Devanagari blessing line, exact
   layout) using html2canvas, then places that image into a jsPDF
   document. This is a true visual match because it's a picture of the
   real, already-styled HTML, not a separate hand-drawn reconstruction
   in jsPDF's own text/line-drawing commands - a plain text-based PDF
   can never really match a CSS-styled page (fonts, background tints,
   the logo) without duplicating the whole design a second time in a
   completely different drawing API.
   Splits into multiple PDF pages if the captured content is taller than
   one page - a full estimate with the complete Terms & Conditions
   section is usually much longer than a single A4 page.

   Before capturing, temporarily removes the modal's mobile-screen width
   cap (#quote-sheet-container has maxWidth:480 + overflow:hidden) and
   the item table's horizontal scroll clipping (#quote-table-wrap has
   overflowX:auto) - both exist so the table is USABLE on a phone
   screen (swipe sideways to see Rate/Amount), but a screenshot has no
   scrolling, so without lifting these first, html2canvas would only
   capture whatever fit in the visible width at that moment and the
   columns beyond it (Rate, Amount) would simply be missing from the
   image - which is exactly the "side wala cut gaya" symptom. Restoring
   both afterward (in a finally block, so it happens even if the capture
   itself throws) puts the on-screen modal back to its normal scrollable
   mobile layout once the screenshot is done. */
async function buildEstimatePdfFromDom(elementId) {
  const element = document.getElementById(elementId);
  if (!element || !window.html2canvas) return null;

  const sheetEl = document.getElementById('quote-sheet-container');
  const tableWrapEl = document.getElementById('quote-table-wrap');
  const prevSheetStyle = sheetEl ? { maxWidth: sheetEl.style.maxWidth, overflow: sheetEl.style.overflow, width: sheetEl.style.width } : null;
  const prevTableWrapStyle = tableWrapEl ? { overflowX: tableWrapEl.style.overflowX } : null;

  try {
    if (sheetEl) {
      sheetEl.style.maxWidth = 'none';
      sheetEl.style.width = 'fit-content';
      sheetEl.style.overflow = 'visible';
    }
    if (tableWrapEl) {
      tableWrapEl.style.overflowX = 'visible';
    }

    const canvas = await window.html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const doc = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const imgHeightMm = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeightMm;
    let position = 0;
    doc.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeightMm);
    heightLeft -= pdfHeight;
    while (heightLeft > 0) {
      position -= pdfHeight;
      doc.addPage();
      doc.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeightMm);
      heightLeft -= pdfHeight;
    }
    return doc;
  } finally {
    if (sheetEl && prevSheetStyle) {
      sheetEl.style.maxWidth = prevSheetStyle.maxWidth;
      sheetEl.style.width = prevSheetStyle.width;
      sheetEl.style.overflow = prevSheetStyle.overflow;
    }
    if (tableWrapEl && prevTableWrapStyle) {
      tableWrapEl.style.overflowX = prevTableWrapStyle.overflowX;
    }
  }
}

// Shares the estimate PDF (built from the real rendered document) directly
// to WhatsApp using the Web Share API with an actual file attached -
// this is what lets "send on WhatsApp" mean the PDF shows up as a real
// attachment in the chat. Falls back to a plain download (with a toast
// explaining why) on desktop browsers or older phones where file
// sharing isn't supported, since there's no reliable way to hand a file
// to WhatsApp without it.
async function shareEstimatePdf(job, elementId, showToast) {
  let doc;
  try {
    doc = await buildEstimatePdfFromDom(elementId);
  } catch (e) {
    // buildEstimatePdfFromDom's own try/finally doesn't catch - any
    // failure inside it (html2canvas erroring on a slow/odd device,
    // etc.) was previously propagating all the way up as an unhandled
    // promise rejection here, since this call was never awaited by its
    // caller either - which meant tapping the button did nothing
    // visible at all, not even an error toast. This is what actually
    // fixes that: whatever goes wrong now surfaces as a real message
    // instead of silently vanishing.
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
    return;
  }
  if (!doc) {
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
    return;
  }
  // Everything from here on (blob/File creation, the share attempt,
  // and even the final plain-download fallback) is wrapped in one
  // last outer try/catch - belt-and-suspenders after the two fixes
  // above, so that truly nothing between "PDF built successfully" and
  // "something visibly happened for the user" can silently fail.
  try {
    const fileName = 'Estimate-' + job.customerName.replace(/\s+/g, '-') + '.pdf';
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    try {
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Estimate - ' + job.customerName });
        return;
      }
    } catch (e) {
      // user cancelled the share sheet, canShare/share threw, or it
      // otherwise failed - fall through to download either way
    }
    doc.save(fileName);
    if (showToast) showToast('PDF download ho gaya - WhatsApp mein manually attach karein');
  } catch (e) {
    if (showToast) showToast('PDF share/download mein dikkat aayi, dobara try karein', true);
  }
}


function whatsAppShareUrl(phoneDigits10, text) {
  const encoded = encodeURIComponent(text);
  if (phoneDigits10) return 'https://wa.me/91' + phoneDigits10 + '?text=' + encoded;
  return 'https://wa.me/?text=' + encoded;
}

/* --- Google Drive / common share-link -> direct image link converter ---
   Drive file IDs can be served by more than one Google host; some accounts /
   sharing settings block one host but allow another, so we keep a list of
   candidate URLs per input and let <SmartImg> fall through them in order. */
function extractDriveId(input) {
  const url = input.trim();
  const markers = ['/file/d/', '/uc?id=', '/open?id=', '?id=', '&id='];
  if (!url.includes('drive.google.com') && !url.includes('id=')) return null;
  for (const marker of markers) {
    const idx = url.indexOf(marker);
    if (idx === -1) continue;
    let rest = url.slice(idx + marker.length);
    let end = rest.length;
    for (const stopChar of ['/', '&', '?', '#']) {
      const stopIdx = rest.indexOf(stopChar);
      if (stopIdx !== -1 && stopIdx < end) end = stopIdx;
    }
    const id = rest.slice(0, end);
    if (id) return id;
  }
  return null;
}
function toDirectImageUrl(input) {
  const url = input.trim();
  if (!url) return url;
  const driveId = extractDriveId(url);
  if (driveId) return 'https://lh3.googleusercontent.com/d/' + driveId + '=w1000';
  if (url.includes('dropbox.com') && url.includes('dl=0')) return url.replace('dl=0', 'raw=1');
  return url;
}
// All URL forms worth trying for a given pasted link, in priority order.
function candidateImageUrls(input) {
  const url = input.trim();
  const driveId = extractDriveId(url);
  if (driveId) {
    return [
      'https://lh3.googleusercontent.com/d/' + driveId + '=w1000',
      'https://drive.google.com/uc?export=view&id=' + driveId,
      'https://drive.google.com/thumbnail?id=' + driveId + '&sz=w1000',
    ];
  }
  if (url.includes('dropbox.com') && url.includes('dl=0')) return [url.replace('dl=0', 'raw=1')];
  return [url];
}
function isLikelyDriveLink(input) {
  return input.includes('drive.google.com');
}

/* --- Device photo upload: reads a File, downsizes only if needed to stay
   under the storage cap, and resolves a data-URI. Quality is kept as
   high as possible - we only shrink dimensions/quality when the original
   genuinely exceeds the limit, never as a blanket compression.

   The cap keeps uploads fast on mobile connections and bounds how big a
   single Firebase Storage upload gets - photos now upload to Storage
   (see persistGallery/window.fileStorage.upload in the App component)
   rather than living inline in Firestore, so this is purely a bandwidth/
   speed consideration, not a document-size limit workaround. --- */
const MAX_PHOTO_BYTES = 650 * 1024;
// Brochure PDFs are stored in Firebase Storage (not Firestore - see
// firebaseStorage.js's fileStorage.upload), which has no meaningful
// per-file size ceiling for this app's purposes, unlike gallery photos.
// This cap is just a sanity limit so an accidental huge upload doesn't
// silently eat the free tier's 1GB total storage quota in one file.
const MAX_BROCHURE_BYTES = 100 * 1024 * 1024;

function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUriByteSize(dataUri) {
  const base64 = dataUri.split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

async function loadImageFromDataUri(dataUri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUri;
  });
}

// Progressively reduce quality, then dimensions, until under MAX_PHOTO_BYTES.
// Returns the original untouched if it already fits.
async function prepareImageForUpload(file) {
  const original = await fileToDataUri(file);
  if (dataUriByteSize(original) <= MAX_PHOTO_BYTES) return original;

  const img = await loadImageFromDataUri(original);
  let { width, height } = img;
  let quality = 0.92;

  for (let attempt = 0; attempt < 8; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL('image/jpeg', quality);
    if (dataUriByteSize(out) <= MAX_PHOTO_BYTES) return out;
    // First reduce quality a couple of steps, then start shrinking dimensions.
    if (attempt < 3) quality = Math.max(0.6, quality - 0.12);
    else { width *= 0.85; height *= 0.85; }
  }
  // Last resort - return the smallest attempt even if still large.
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.6);
}

const emptyJob = (customerId, customerName, phone) => ({
  // Deterministic, not uid() - this fallback gets recomputed on every
  // render for a customer who doesn't have a real job document yet
  // (jobs.find(...) returning nothing), since it's not memoized. A
  // random id here would mean a DIFFERENT id every time the customer's
  // app re-renders (which happens on every background poll, roughly
  // every 8-20 seconds) - if the customer took more than that long to
  // fill in the appointment form, the job object they were editing
  // could end up with a different id than the one actually submitted,
  // and the save could land under an id nothing else ever looks up
  // again - which is exactly the "booked appointment never showed up
  // for admin" symptom. Tying it to customerId instead means it's
  // always the same value no matter how many times this runs, so the
  // customer's very first save always lands under one consistent id.
  id: 'job_' + customerId,
  customerId,               // <- every job is permanently pinned to ONE customer
  customerName,
  phone,
  address: '',
  status: 'appointment',
  appointmentDate: '',
  notes: '',
  appointment: null,        // { preferredDate, preferredTime, address, purpose, notes, status, confirmedDate, confirmedTime, requestedAt }
  requirements: [],
  items: [],
  payments: [],
  progressPhotos: [],
  review: null,
  activity: [{ id: uid(), text: 'Job created', date: new Date().toISOString() }],
  createdAt: new Date().toISOString(),
});

const APPT_STATUS = {
  none: { label: 'Not Requested', color: '#7C8399', bg: '#EEF0F5' },
  requested: { label: 'Requested', color: '#A8975F', bg: '#F3EFE3' },
  confirmed: { label: 'Confirmed', color: '#2F7D4F', bg: '#DFF0E4' },
  rescheduled: { label: 'Rescheduled', color: '#B5562E', bg: '#F7E3D8' },
  completed: { label: 'Completed', color: '#1D2E5C', bg: '#E1E5F0' },
};

function logActivity(job, text) {
  return { ...job, activity: [{ id: uid(), text, date: new Date().toISOString() }, ...(job.activity || [])].slice(0, 40) };
}

/* --- SmartImg: tries the stored URL, then falls back through alternate
   Drive host formats derived from the ORIGINAL pasted link if one is stored
   on the item (origUrl). Shows a clear broken-image state instead of a
   silent blank box when every candidate fails. --- */
function SmartImg({ src, origUrl, alt, style, onError: onErrorProp }) {
  const candidates = React.useMemo(() => {
    const list = origUrl ? candidateImageUrls(origUrl) : [src];
    return list.includes(src) ? list : [src, ...list];
  }, [src, origUrl]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => { setIdx(0); setFailed(false); }, [src, origUrl]);

  if (failed) {
    return (
      <div style={{ ...style, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#EEF0F5', gap: 4, padding: 6, boxSizing: 'border-box' }}>
        <ImageIcon size={16} color='#B3B8C6' />
        <span style={{ fontSize: 8.5, color: '#B3B8C6', fontWeight: 700, textAlign: 'center' }}>Load nahi hui</span>
      </div>
    );
  }

  return (
    <img
      src={candidates[idx]}
      alt={alt}
      style={style}
      loading='lazy'
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1);
        else { setFailed(true); if (onErrorProp) onErrorProp(); }
      }}
    />
  );
}

/* ---- Brochure PDFs: category-wise catalog documents. Metadata
   ({id, name, category, sizeKb, url}) lives in the small 'brochures' list;
   the actual PDF file lives in Firebase Storage (not Firestore - a single
   PDF can be tens of MB, far past Firestore's 1MiB document cap), and
   'url' is the direct HTTPS download link Firebase Storage hands back
   after upload. Opening a brochure is just following that link - no
   separate fetch step needed. ---- */
// Fetches the PDF (from wherever it's actually hosted - Firebase
// Storage) and opens it as a local blob: URL instead of the original
// link directly - a customer opening a brochure or estimate PDF would
// otherwise see the raw storage URL (firebasestorage.googleapis.com/...)
// in their browser's address bar, which exposes which backend
// infrastructure the app runs on. A blob: URL is generated entirely
// in the browser from the downloaded file, so the address bar just
// shows a local blob reference, never the original hosting domain.
//
// The blank tab is opened FIRST, synchronously, before any await -
// window.open() called after an await has already run is treated by
// most browsers as no longer tied to the original user tap, and gets
// silently popup-blocked. Opening blank immediately (still within the
// click handler's synchronous execution) preserves that "this came
// from a real tap" status, and the tab's location is then set once the
// blob is ready. `noopener` is deliberately left off this specific
// call (unlike other window.open calls in this file) because keeping
// a reference to the new tab is exactly what's needed to navigate it
// afterward - this is a same-app blob: URL being loaded into a tab we
// just opened ourselves, not an arbitrary external link, so the usual
// tabnabbing concern noopener guards against doesn't apply here.
async function openOrDownloadPdf(url, filename) {
  const win = window.open('', '_blank', 'noreferrer');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (win && !win.closed) {
      win.location.href = blobUrl;
    } else {
      window.location.href = blobUrl;
    }
    // Revoking too soon can break the tab still loading the PDF, so
    // this waits well past any reasonable load time rather than
    // revoking immediately.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    return true;
  } catch (e) {
    // Fetch/blob approach failed (network hiccup, host blocks
    // cross-origin fetch, etc.) - fall back to the original direct-URL
    // behavior in that same already-open tab, so the PDF still opens,
    // just without hiding the host in this one fallback case.
    if (win && !win.closed) {
      win.location.href = url;
    } else {
      try {
        const win2 = window.open(url, '_blank', 'noopener,noreferrer');
        if (!win2) window.location.href = url;
      } catch (e2) {
        return false;
      }
    }
    return true;
  }
}

function BrochureList({ brochures, showToast, canManage, onDelete }) {
  const [loadingId, setLoadingId] = useState(null);

  // Three distinct kinds of PDF, shown as three distinct sections:
  // the business's own "About Us" / PVC furniture benefits document
  // (docType 'profile' - normally just one file, shown as a single
  // featured card, not a grouped list), fluted panel catalogs
  // (docType 'fluted', grouped by company), and laminate color
  // catalogs (docType 'catalog', grouped by company) - customer taps a
  // company name to see just that company's colors, and fluted/laminate
  // stay visually separate since they're different product lines, not
  // interchangeable options of the same one.
  const profileDocs = (brochures || []).filter((b) => b.docType === 'profile');
  const flutedDocs = (brochures || []).filter((b) => b.docType === 'fluted');
  const catalogDocs = (brochures || []).filter((b) => b.docType !== 'profile' && b.docType !== 'fluted');
  const groupByCompany = (docs) => {
    const g = {};
    docs.forEach((b) => {
      const co = b.company || 'Other';
      if (!g[co]) g[co] = [];
      g[co].push(b);
    });
    return g;
  };
  const groupedFluted = useMemo(() => groupByCompany(flutedDocs), [flutedDocs]);
  const groupedCatalogs = useMemo(() => groupByCompany(catalogDocs), [catalogDocs]);

  const openBrochure = async (b) => {
    if (!b.url) { showToast(b.name + ' ka link missing hai - purani entry ho sakti hai, dobara upload karein', true); return; }
    setLoadingId(b.id);
    const ok = await openOrDownloadPdf(b.url, b.name);
    if (!ok) showToast('Brochure open nahi ho payi', true);
    setLoadingId(null);
  };

  const BrochureRow = ({ b }) => (
    <div style={styles.brochureRow}>
      <div style={styles.brochureIcon}><FileText size={16} color={BRAND.gold} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.itemDesc}>{b.name}</div>
        <div style={styles.itemSub}>
          {b.sizeKb ? (b.sizeKb + ' KB') : ''}
          {!b.url && <span style={{ color: '#C62828', fontWeight: 700 }}> - Link missing, dobara upload karein</span>}
        </div>
      </div>
      <button style={styles.brochureOpenBtn} onClick={() => openBrochure(b)} disabled={loadingId === b.id}>
        {loadingId === b.id ? '...' : <Download size={13} />}
      </button>
      {canManage && (
        <button style={styles.iconBtnSmall} onClick={() => onDelete(b.id)}><Trash2 size={14} color='#C7CCDC' /></button>
      )}
    </div>
  );

  if (!brochures || brochures.length === 0) {
    return <div style={styles.emptySmall}>Abhi koi brochure upload nahi hui.</div>;
  }

  return (
    <div>
      {profileDocs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={styles.reqGroupHeader}>Company Details</div>
          {profileDocs.map((b) => <BrochureRow key={b.id} b={b} />)}
        </div>
      )}
      {Object.keys(groupedFluted).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={styles.reqGroupHeader}>Fluted Panel Catalog</div>
          {Object.entries(groupedFluted).map(([company, list]) => (
            <div key={company} style={{ marginBottom: 14, marginTop: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: BRAND.gold, marginBottom: 4 }}>{company}</div>
              {list.map((b) => <BrochureRow key={b.id} b={b} />)}
            </div>
          ))}
        </div>
      )}
      {Object.keys(groupedCatalogs).length > 0 && (
        <div>
          <div style={styles.reqGroupHeader}>Laminate Catalog</div>
          {Object.entries(groupedCatalogs).map(([company, list]) => (
            <div key={company} style={{ marginBottom: 14, marginTop: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: BRAND.gold, marginBottom: 4 }}>{company}</div>
              {list.map((b) => <BrochureRow key={b.id} b={b} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================== ROOT ===================== */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [gallery, setGallery] = useState({});
  // Gallery data (photos across every category) is lazy-loaded - see
  // loadGalleryData below - rather than fetched during the app's
  // initial load like everything else. With photo counts meant to
  // scale into the thousands, eagerly fetching every category's full
  // metadata on every single app open (even for someone who never
  // visits the Gallery tab that session) was adding real, avoidable
  // delay to the very first thing anyone sees. galleryLoadedRef tracks
  // whether this has run yet this session, so re-visiting the tab
  // doesn't re-fetch every time.
  const galleryLoadedRef = useRef(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [adminPin, setAdminPin] = useState(DEFAULT_PIN);
  // Default rates used by the customer-facing quick estimate calculator
  // (Requirements tab) - admin manages this list in Settings. Each
  // entry has a `unit`: 'sqft' (calculated from Length x Height, for
  // things like framing/box/TV cabinet/partition) or 'piece' (a flat
  // rate x quantity, for things like baskets/drawers that are counted
  // individually rather than measured by area) - real furniture
  // components genuinely mix both pricing styles, so the calculator
  // needs to ask for different inputs depending on which type is
  // selected. Separate from actual estimate items (which admin builds
  // by hand with real, per-job rates) - this is only for a rough,
  // instant approximation before an admin-built estimate exists.
  const [estimateRates, setEstimateRatesRaw] = useState([
    { id: 'r1', name: 'Laminate', rate: '1000', unit: 'sqft' },
    { id: 'r2', name: 'Without Laminate', rate: '700', unit: 'sqft' },
  ]);
  const [partnerPin, setPartnerPin] = useState('');
  const [staff, setStaff] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [appointmentItemOptions, setAppointmentItemOptions] = useState(DEFAULT_CATEGORIES);
  const [categories, setCategoriesRaw] = useState(DEFAULT_CATEGORIES);
  const [notifications, setNotificationsRaw] = useState([]);
  // Which admin/staff devices have enabled real push notifications
  // (their FCM tokens) - a genuinely separate concept from the
  // in-app notification bell above: this list is who api/send-push.js
  // actually delivers TO. More than one entry is normal and expected,
  // since more than one admin device is regularly in use.
  const [adminPushTokens, setAdminPushTokensRaw] = useState([]);
  // Reviews are normally read live off job.review, but a job (and its
  // review with it) gets deleted whenever its customer is deleted -
  // routine cleanup of old customer records, once the list gets long,
  // was silently wiping out testimonials that had real ongoing
  // marketing value completely independent of whether the underlying
  // job record still exists. Any review that's ever been marked
  // "featured" gets copied here at delete time, so it survives the
  // customer/job being removed - featuredTestimonials below reads from
  // both sources.
  const [archivedReviews, setArchivedReviewsRaw] = useState([]);
  const [faqs, setFaqsRaw] = useState([]);
  const [itemTemplates, setItemTemplatesRaw] = useState([]);
  const [attendance, setAttendanceRaw] = useState([]);
  const [brochures, setBrochures] = useState([]);
  const [session, setSessionRaw] = useState(() => loadStoredSession());
  // Wraps setSession so every update (login, logout, role switch) is
  // automatically persisted to localStorage, keeping the session alive
  // across page refreshes without needing to update every call site.
  const setSession = useCallback((next) => {
    setSessionRaw(next);
    saveStoredSession(next);
  }, []);
  const [toast, setToast] = useState(null);

  // Gallery loading, extracted into its own callable function rather
  // than being part of the initial app-load effect - see
  // galleryLoadedRef's comment above for why. Handles the full
  // migration/repair logic exactly as before (see the extensive
  // comments below), just triggered on-demand (from CustomerApp's or
  // AdminApp's gallery tab) instead of unconditionally on every app
  // open.
  const loadGalleryData = useCallback(async () => {
    if (galleryLoadedRef.current) return;
    galleryLoadedRef.current = true;
    setGalleryLoading(true);
    try {
      const galleryCatList = await safeGet('gallery_categories');
      // Gallery is split one Firestore document PER CATEGORY (see
      // persistGallery) rather than one combined document, so total
      // photo capacity isn't capped by a single 1MiB document once
      // photo count climbs into the hundreds. 'gallery_categories'
      // just lists which category documents exist.
      //
      // If that list is missing, this is EITHER a genuinely fresh
      // install with no photos yet, OR - critically - an account that
      // still has all its photos sitting in the OLD single combined
      // 'gallery' document from before this split existed. Falling
      // straight back to itemCategories (an empty starting point) in
      // that second case would make every existing photo in every
      // category other than whichever one someone next happens to add
      // to silently vanish from view forever: the FIRST photo added
      // under the new system writes 'gallery_categories' with only
      // that one category in it, and every future load then only
      // knows to look for that one category's document - the old
      // combined document's other categories still physically exist
      // in Firestore, just permanently unreferenced. So the old
      // document is checked FIRST, and if it has data, that's what
      // loads (nothing is lost) and a background migration (below)
      // copies it into the new per-category format so this doesn't
      // need to run again next time.
      const itemCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
      let galleryObj = {};
      let oldGalleryToMigrate = null;
      let repairCategoriesList = null;
      if (galleryCatList) {
        const galleryCategories = JSON.parse(galleryCatList);
        const galleryEntries = await Promise.all(
          galleryCategories.map(async (cat) => [cat, await safeGet('gallery_cat_' + cat)])
        );
        for (const [cat, val] of galleryEntries) {
          if (val) { try { galleryObj[cat] = JSON.parse(val); } catch (e) { /* skip corrupt entry */ } }
        }
      } else {
        // Before concluding "never migrated, fall back to the old
        // document", sanity-check by trying the CURRENT per-category
        // documents directly - if 'gallery_categories' itself simply
        // failed to read this one time (a transient network blip,
        // safeGet's own 10s timeout, etc.) while the per-category
        // documents underneath it are actually fine, falling back to
        // the pre-migration document would be a serious regression:
        // it would silently undo every delete and addition made since
        // migration first completed, reviving old deleted photos and
        // losing recently-added ones - exactly the "deleted photos
        // came back, new ones vanished" failure mode this guards
        // against. Only a genuinely fresh/never-migrated install (no
        // per-category data found for ANY known category) reaches the
        // old-document fallback below.
        const sanityCheckEntries = await Promise.all(
          itemCategories.map(async (cat) => [cat, await safeGet('gallery_cat_' + cat)])
        );
        const foundAnyNewFormatData = sanityCheckEntries.some(([, val]) => val);
        if (foundAnyNewFormatData) {
          for (const [cat, val] of sanityCheckEntries) {
            if (val) { try { galleryObj[cat] = JSON.parse(val); } catch (e) { /* skip corrupt entry */ } }
          }
          repairCategoriesList = Object.keys(galleryObj);
        } else {
        const oldGalleryRaw = await safeGet('gallery');
        if (oldGalleryRaw) {
          try {
            galleryObj = JSON.parse(oldGalleryRaw);
            // An even earlier storage format (before photos moved to
            // Firebase Storage) kept each photo's actual url in its
            // OWN small 'gallery_photo_<id>' document, with only
            // {id, caption} in the combined document itself - so a
            // photo recovered from that old combined document can be
            // missing its url entirely. Filling those in here (from
            // whichever of those old per-photo documents still exist)
            // means the migration below writes complete, working
            // photo entries instead of ones that would show as
            // broken images despite now being "found" again.
            const idsNeedingUrl = [];
            for (const cat of Object.keys(galleryObj)) {
              for (const p of galleryObj[cat] || []) {
                if (!p.url) idsNeedingUrl.push(p.id);
              }
            }
            if (idsNeedingUrl.length > 0) {
              const fetched = await Promise.all(idsNeedingUrl.map((id) => safeGet('gallery_photo_' + id)));
              const recoveredById = {};
              idsNeedingUrl.forEach((id, i) => {
                if (fetched[i]) { try { recoveredById[id] = JSON.parse(fetched[i]); } catch (e) { /* skip */ } }
              });
              for (const cat of Object.keys(galleryObj)) {
                galleryObj[cat] = (galleryObj[cat] || []).map((p) => (
                  !p.url && recoveredById[p.id] ? { ...p, url: recoveredById[p.id].url, origUrl: recoveredById[p.id].origUrl } : p
                ));
              }
            }
            oldGalleryToMigrate = galleryObj;
          } catch (e) { galleryObj = {}; }
        }
        }
      }
      setGallery(galleryObj);
      // Runs after the gallery is already showing (not inside the
      // try/finally above), so migrating a large old gallery never
      // delays the tab from opening. This writes each category from
      // the old combined document into its own new 'gallery_cat_<X>'
      // document, then finally writes 'gallery_categories' listing all
      // of them - only ONCE that full list is written does any device
      // start relying on the new format, so a second admin opening the
      // app mid-migration still safely falls back to the old document
      // rather than seeing a half-migrated, partial category list.
      if (oldGalleryToMigrate) {
        (async () => {
          try {
            await Promise.all(
              Object.keys(oldGalleryToMigrate).map(async (cat) => {
                // Any photo still holding raw base64 data (from
                // before photos moved to Firebase Storage) gets
                // uploaded here too, same as a normal add would - a
                // migration that just copied that data as-is into the
                // new per-category document would recreate the exact
                // 1MiB-document problem this whole split was meant to
                // solve, just one document later.
                const catPhotos = await mapWithConcurrencyLimit(oldGalleryToMigrate[cat] || [], 5, async (p) => {
                  if (p.url && p.url.startsWith('data:')) {
                    const uploaded = await window.fileStorage.upload('gallery_' + p.id, p.url);
                    if (uploaded && !uploaded.error) {
                      return { id: p.id, caption: p.caption || '', createdAt: p.createdAt || null, url: uploaded.url, origUrl: p.origUrl || null };
                    }
                  }
                  return p;
                });
                await window.storage.set('gallery_cat_' + cat, JSON.stringify(catPhotos), true);
              })
            );
            await window.storage.set('gallery_categories', JSON.stringify(Object.keys(oldGalleryToMigrate)), true);
          } catch (e) {
            // Best effort - if this fails, the old combined document
            // is untouched and still there, so nothing is lost; the
            // next app load will just try the migration again.
          }
        })();
      } else if (repairCategoriesList) {
        // 'gallery_categories' itself was missing/unreadable, but the
        // sanity check above found real per-category data already in
        // place - migration already happened, this document just
        // needs to be (re)written pointing at what's actually there,
        // not rebuilt from old data. A lightweight repair, not a full
        // re-migration.
        (async () => {
          try {
            await window.storage.set('gallery_categories', JSON.stringify(repairCategoriesList), true);
          } catch (e) {
            // Best effort - the next load's sanity check will just
            // find the same per-category data again and retry this.
          }
        })();
      }
    } finally {
      setGalleryLoading(false);
    }
  }, [categories]);

  useEffect(() => {
    (async () => {
      try {
        const [c, j, p, st, exp, pp, aio, br, cats, notifs, tmpl, att, estRates, archRev, adminTokens, faqsRaw] = await Promise.all([
          safeGet('customers'), safeGet('jobs'), safeGet('admin_pin'), safeGet('staff'),
          safeGet('expenses'), safeGet('partner_pin'), safeGet('appointment_item_options'), safeGet('brochures'),
          safeGet('categories'), safeGet('notifications'), safeGet('item_templates'), safeGet('attendance'), safeGet('estimate_rates'),
          safeGet('archived_reviews'), safeGet('admin_push_tokens'), safeGet('faqs'),
        ]);
        if (c) setCustomers(JSON.parse(c));
        if (j) setJobs(JSON.parse(j));
        if (p) setAdminPin(p);
        if (st) setStaff(JSON.parse(st));
        if (exp) setExpenses(JSON.parse(exp));
        if (pp) setPartnerPin(pp);
        if (aio) setAppointmentItemOptions(JSON.parse(aio));
        if (br) setBrochures(JSON.parse(br));
        if (cats) setCategoriesRaw(JSON.parse(cats));
        if (notifs) setNotificationsRaw(JSON.parse(notifs));
        if (tmpl) setItemTemplatesRaw(JSON.parse(tmpl));
        if (att) setAttendanceRaw(JSON.parse(att));
        if (estRates) setEstimateRatesRaw(JSON.parse(estRates));
        if (archRev) setArchivedReviewsRaw(JSON.parse(archRev));
        if (adminTokens) setAdminPushTokensRaw(JSON.parse(adminTokens));
        if (faqsRaw) setFaqsRaw(JSON.parse(faqsRaw));
        // Gallery loads here too (not just lazily on tab-open) so the
        // app's overall startup behavior stays exactly as it always
        // was - loadGalleryData's own galleryLoadedRef guard means
        // calling it again later (when someone actually opens the
        // Gallery tab) is a safe no-op if this already ran.
        loadGalleryData();
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Firebase-backed storage here is fetch-once, not a live subscription, so
  // an admin adding gallery photos (or a customer's own job/requirements
  // updating from the admin side) won't appear for someone who already has
  // the app open. This background poll re-fetches the fast-changing,
  // shared-viewing data every 20s so updates show up without a manual
  // refresh. Kept deliberately narrow (not customers/staff/pins) since
  // those change far less often and a stale customer list briefly isn't
  // user-visible the way a missing new photo or job status update is.
  useEffect(() => {
    if (!loaded) return;
    const poll = setInterval(async () => {
      try {
        const [j, br, cats, aio] = await Promise.all([
          safeGet('jobs'), safeGet('brochures'), safeGet('categories'), safeGet('appointment_item_options'),
        ]);
        // Only polls gallery data if it's actually been loaded this
        // session (someone visited the Gallery tab) - see
        // galleryLoadedRef's comment for why fetching it unconditionally
        // on every poll tick, for users who never open Gallery at all,
        // was pure wasted network/parse work.
        if (galleryLoadedRef.current) {
          const galleryCatList = await safeGet('gallery_categories');
          if (galleryCatList && !galleryWriteInFlightRef.current) {
            const galleryCategories = JSON.parse(galleryCatList);
            const galleryEntries = await Promise.all(
              galleryCategories.map(async (cat) => [cat, await safeGet('gallery_cat_' + cat)])
            );
            const galleryObj = {};
            for (const [cat, val] of galleryEntries) {
              if (val) { try { galleryObj[cat] = JSON.parse(val); } catch (e) { /* skip corrupt entry */ } }
            }
            setGallery(galleryObj);
          }
        }
        // Skip applying this poll's jobs result while a local write
        // (delete, edit, approval, photo add, etc.) is still in flight -
        // see jobsWriteInFlightRef above. That write's own Firestore call
        // may not have landed yet, so this poll's fetch could still be
        // reading the pre-write data; applying it now would silently
        // revert the local change. Once the in-flight write finishes,
        // the very next poll will correctly reflect it (or any other
        // changes made elsewhere in the meantime).
        if (j && !jobsWriteInFlightRef.current) {
          setJobs(JSON.parse(j));
        }
        if (br) setBrochures(JSON.parse(br));
        if (cats) setCategoriesRaw(JSON.parse(cats));
        if (aio) setAppointmentItemOptions(JSON.parse(aio));
      } catch (e) {
        // best effort - a missed poll just tries again next interval
      }
    }, 20000);
    return () => clearInterval(poll);
  }, [loaded]);

  // Notifications get their own, faster poll (8s vs the general 20s) since
  // a bell/alert system feels broken if a new notification takes 20
  // seconds to show up - people expect near-immediate feedback here in a
  // way they don't for a gallery photo appearing.
  useEffect(() => {
    if (!loaded) return;
    const poll = setInterval(async () => {
      try {
        const notifs = await safeGet('notifications');
        if (notifs) setNotificationsRaw(JSON.parse(notifs));
      } catch (e) {
        // best effort
      }
    }, 8000);
    return () => clearInterval(poll);
  }, [loaded]);

  // Payment-due alerts: unlike the other notification triggers (which fire
  // on a specific customer action), an overdue payment is a standing
  // condition, not a one-time event - so this checks once per app load
  // rather than on every jobs update, and marks each job with the date it
  // was last alerted on (lastPaymentDueAlertDate) so the same overdue job
  // doesn't re-notify every few seconds while the poll above refreshes
  // jobs - at most once per calendar day per job.
  useEffect(() => {
    if (!loaded) return;
    const todayKey = new Date().toDateString();
    const overdueJobs = jobs.filter((j) =>
      jobDue(j) > 0 &&
      (j.status === 'in_progress' || j.status === 'delivered') &&
      j.lastPaymentDueAlertDate !== todayKey
    );
    if (overdueJobs.length === 0) return;
    const next = jobs.map((j) =>
      overdueJobs.some((oj) => oj.id === j.id) ? { ...j, lastPaymentDueAlertDate: todayKey } : j
    );
    persistJobs(next);
    for (const j of overdueJobs) {
      pushNotification('payment_due', j.customerName + ' - ' + currency(jobDue(j)) + ' payment due hai', j.id);
    }
    // Only depends on 'loaded' (fires once per app open) - jobs is read
    // fresh via the closure each time this effect actually runs, but
    // isn't in the dependency array on purpose, since re-running this
    // check on every jobs change (e.g. from the 20s poll above) would
    // undo the point of the once-per-day marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Follow-up reminders: an estimate the customer hasn't responded to
  // (no approve / change-request / cancel) after a few days is a lead
  // that risks going cold - flags it once per day per job, same
  // once-per-calendar-day dedup pattern as the payment-due check above,
  // so admin gets a nudge to call the customer rather than the lead
  // silently sitting untouched.
  const FOLLOW_UP_AFTER_DAYS = 3;
  useEffect(() => {
    if (!loaded) return;
    const todayKey = new Date().toDateString();
    const now = Date.now();
    const needsFollowUp = jobs.filter((j) => {
      if (j.estimateStatus) return false; // already responded to
      if ((j.items || []).length === 0) return false; // no estimate given yet
      if (!j.createdAt) return false;
      const daysSinceCreated = (now - new Date(j.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceCreated >= FOLLOW_UP_AFTER_DAYS && j.lastFollowUpAlertDate !== todayKey;
    });
    if (needsFollowUp.length === 0) return;
    const next = jobs.map((j) =>
      needsFollowUp.some((nj) => nj.id === j.id) ? { ...j, lastFollowUpAlertDate: todayKey } : j
    );
    persistJobs(next);
    for (const j of needsFollowUp) {
      pushNotification('follow_up_needed', j.customerName + ' ne estimate par abhi tak response nahi diya - follow-up karein', j.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Birthday reminders: WhatsApp has no way to auto-send a message from a
  // web app without the paid WhatsApp Business API, so this surfaces a
  // same-day notification instead - admin taps it, opens a pre-filled
  // WhatsApp wish, and sends it themselves in one tap. Checked against
  // month-day only (birthdayMonthDay, no year on file - see
  // CustomerEditDialog), and deduped once per calendar day the same way
  // as the other daily checks above.
  useEffect(() => {
    if (!loaded) return;
    const todayKey = new Date().toDateString();
    const now = new Date();
    const todayMonthDay = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const birthdaysToday = customers.filter((c) =>
      c.birthdayMonthDay === todayMonthDay && c.lastBirthdayAlertDate !== todayKey
    );
    if (birthdaysToday.length === 0) return;
    const next = customers.map((c) =>
      birthdaysToday.some((bc) => bc.id === c.id) ? { ...c, lastBirthdayAlertDate: todayKey } : c
    );
    persistCustomers(next);
    for (const c of birthdaysToday) {
      const relatedJob = jobs.find((j) => j.customerId === c.id);
      pushNotification('customer_birthday', c.name + ' ka aaj birthday hai - WhatsApp wish bhejein', relatedJob ? relatedJob.id : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // A hard timeout on every read, on top of the try/catch below - without
  // this, if the underlying window.storage.get() call ever genuinely
  // hangs (never resolves OR rejects - which can happen with certain
  // Firestore SDK states, e.g. right after a plan/rules change while
  // things are still propagating, or a flaky connection stuck retrying),
  // the try/catch alone wouldn't help, since a catch only fires on
  // rejection, not on "never settles". That would leave the app's
  // initial Promise.all() load stuck forever, and since setLoaded(true)
  // only runs once that resolves, the whole app would be stuck on its
  // loading screen indefinitely with no error ever shown - exactly what
  // "sirf loading dikhta hai, koi error nahi" looks like from the
  // outside. Racing against a timeout guarantees this call always
  // settles within 10s either way, so the app can always proceed (with
  // that one key treated as empty/not-found) instead of hanging.
  async function safeGet(key) {
    try {
      const res = await Promise.race([
        window.storage.get(key, true),
        new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      return res ? res.value : null;
    } catch (e) { return null; }
  }



  const showToast = (msg, isError) => {
    setToast({ msg, isError, id: uid() });
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 2400);
  };

  // Foreground push notifications (the app IS open right now) don't go
  // through the service worker's background handler at all - FCM
  // requires this separate listener for that case. Without it, a push
  // arriving while someone's actively looking at the app would
  // silently do nothing: no toast, no visible sign it arrived,
  // even though the SEND succeeded - the notification would only ever
  // have shown up as a system notification the NEXT time the app
  // happened to be in the background.
  useEffect(() => {
    if (!window.pushMessaging) return;
    const unsubscribe = window.pushMessaging.onForegroundMessage((payload) => {
      const body = (payload.notification && payload.notification.body) || '';
      if (body) showToast(body);
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  // Each gallery CATEGORY gets its own Firestore document
  // ('gallery_cat_<CategoryName>') rather than one combined 'gallery'
  // document holding every category's photos together. A photo's full
  // Firebase Storage download URL (with its auth token) runs well over
  // 100 characters, so a single combined document accumulates that
  // length across every photo in every category - once total photos
  // climb into the several-hundreds, that one document creeps toward
  // Firestore's 1MiB-per-document limit and starts failing to save
  // (exactly what "500 se upar add nahi hoti" was). Splitting by
  // category means each category gets its OWN 1MiB budget, multiplying
  // total capacity by however many categories exist - comfortably
  // covering several thousand photos spread across a typical set of
  // 8-10 categories instead of all sharing one shrinking budget.
  //
  // Only categories that actually changed get rewritten (compared
  // against the previous gallery state) - editing one photo in
  // "Kitchen" no longer means rewriting "Wardrobe", "TV Unit", and
  // every other untouched category's document too.
  // A boolean "is a write currently happening" flag, not a timestamp -
  // this is what actually fixes photos "disappearing a couple seconds
  // after being added" for larger batches: uploading many photos to
  // Firebase Storage (even with the concurrency limit above) can easily
  // take longer than a fixed few-second grace window, so a TIME-based
  // guard ("skip the poll if a write happened in the last 8s") would
  // expire mid-upload - the background poll would then apply its
  // fetched data (which still doesn't have the new photos, since the
  // real Firestore write hasn't landed yet) right on top of the
  // in-progress optimistic update, wiping it out. Tracking "is a write
  // in flight" instead means the poll correctly waits for the ENTIRE
  // upload+save to finish - however long that takes - before it's ever
  // allowed to overwrite gallery state, regardless of batch size.
  const galleryWriteInFlightRef = useRef(false);
  const persistGallery = useCallback(async (next) => {
    galleryWriteInFlightRef.current = true;
    const prevGallery = gallery;
    setGallery(next);
    try {
      const meta = {};
      const writes = [];
      for (const cat of Object.keys(next)) {
        const catMeta = await mapWithConcurrencyLimit(next[cat] || [], 5, async (p) => {
          if (p.url && p.url.startsWith('data:')) {
            const uploaded = await window.fileStorage.upload('gallery_' + p.id, p.url);
            if (!uploaded || uploaded.error) throw new Error(uploaded?.error || 'Photo upload failed: ' + p.id);
            return { id: p.id, caption: p.caption || '', createdAt: p.createdAt || null, url: uploaded.url, origUrl: p.origUrl || null };
          }
          return { id: p.id, caption: p.caption || '', createdAt: p.createdAt || null, url: p.url || '', origUrl: p.origUrl || null };
        });
        meta[cat] = catMeta;
        const changed = JSON.stringify(catMeta) !== JSON.stringify(prevGallery[cat] || []);
        if (changed) {
          writes.push(window.storage.set('gallery_cat_' + cat, JSON.stringify(catMeta), true));
        }
      }
      // The category NAME LIST itself (not the photos) stays in one
      // small 'gallery_categories' document, so the app knows which
      // per-category documents to fetch on load without needing to
      // separately track this via the item-category list, which can
      // differ (a category could exist for gallery photos even if no
      // estimate item uses that name, or vice versa).
      //
      // Critically, this NEVER just writes Object.keys(meta) directly -
      // that used to mean this document quietly shrank to whatever
      // categories happened to be in THIS particular write's `next`
      // (which mirrors local `gallery` state), even though every
      // ordinary add/edit/delete-a-photo call site correctly spreads
      // {...gallery, ...} first. The actual failure mode: if local
      // `gallery` state was ever incomplete for ANY reason (a slow
      // connection during the initial load, a temporary Firestore
      // hiccup, another device's write landing mid-fetch), the very
      // next ordinary photo edit anywhere would "helpfully" but
      // silently permanently drop every category missing from that
      // incomplete snapshot from this document - and once dropped
      // here, no future load ever asks Firestore for those categories'
      // documents again, even though gallery_cat_<name> itself was
      // never touched and still holds every photo. This is what was
      // actually behind categories (and, by extension, their photos)
      // disappearing with nobody ever choosing to remove them.
      //
      // The fix: always fetch the CURRENT category list fresh from
      // Firestore first and take the UNION with this write's own
      // categories - a routine photo operation can only ever ADD a
      // category to this list, never silently remove one. The only
      // way a category is meant to leave this list is the explicit,
      // deliberate "Remove Category" action in Settings, which already
      // has its own dedicated safeguard against removing one that
      // still has photos.
      let freshCategoryList = [];
      try {
        const freshRaw = await window.storage.get('gallery_categories', true);
        if (freshRaw && freshRaw.value) freshCategoryList = JSON.parse(freshRaw.value);
      } catch (e) {
        // Fetch failed - fall through using just this write's own
        // categories below rather than blocking the save entirely.
      }
      const mergedCategoryList = [...new Set([...freshCategoryList, ...Object.keys(meta)])];
      writes.push(window.storage.set('gallery_categories', JSON.stringify(mergedCategoryList), true));
      await Promise.all(writes);
      // Reflect the now-uploaded URLs (data: URI replaced by the real
      // Storage URL) back into local state too, so the freshly-added
      // photo's <img> tag switches from the temporary local preview to
      // the real hosted image immediately, without waiting on a poll.
      setGallery(meta);
      return true;
    } catch (e) {
      setGallery(prevGallery);
      showToast('Save failed: ' + (e.message || 'internet check karein aur dobara try karein'), true);
      return false;
    } finally {
      galleryWriteInFlightRef.current = false;
    }
  }, [gallery]);
  const persistCustomers = useCallback(async (next) => {
    const prevLocalCustomers = customers;
    setCustomers(next);
    try {
      const merged = await mergeIdArrayWithFreshServer('customers', next, prevLocalCustomers);
      await window.storage.set('customers', JSON.stringify(merged), true);
      setCustomers(merged);
    }
    catch (e) { showToast('Save failed', true); }
  }, [customers]);
  // Tracks when the LOCAL app last wrote to `jobs` (a delete, an edit,
  // approving something, etc.) so the background poll below can tell the
  // difference between "Firestore genuinely has nothing new" and "our
  // own recent write just hasn't finished propagating to Firestore yet".
  // Without this, a poll firing in that narrow in-flight window would
  // fetch the pre-write data and overwrite the local (correct, newer)
  // state with it - which is exactly what made a just-deleted photo or
  // extra-work item "come back a little while later": the delete
  // happened locally instantly, but the poll raced the Firestore write
  // and won, silently reverting it.
  // Boolean "write in flight" flag rather than a timestamp - same fix
  // as galleryWriteInFlightRef above, applied here for the same class
  // of protection: this write itself is normally fast (a single
  // Firestore document), but any slow network moment could still let
  // it run past a fixed time window, and a boolean guard removes that
  // possibility entirely regardless of how long a save takes.
  const jobsWriteInFlightRef = useRef(false);
  // Returns true/false so callers can tell whether the save genuinely
  // landed before announcing success of their own - see persistGallery's
  // matching comment for why this matters (a caller showing success
  // before the write actually completes is exactly what made saves look
  // like they "worked, then vanished": local state updates optimistically
  // regardless, so without checking this, a failed write is invisible
  // until a later background poll replaces it with the real data).
  //
  // Merges against the FRESHEST server data rather than blindly writing
  // this device's local `next` array as-is - the same fix as
  // persistGallery's fetchFreshCategory, applied here because jobs
  // carries the business's actual data (payments, estimates,
  // appointments, every customer's project) and is exactly as exposed
  // to the same risk: if two admin devices are both active, each
  // device's local `jobs` snapshot can fall behind whatever the OTHER
  // device just saved. Writing that stale snapshot as the new 'jobs'
  // document would silently discard anything the other device added or
  // changed in between - a new customer registration, a payment someone
  // just recorded, anything. Comparing this write's intended changes
  // against this device's OWN prior local state (not the fresh server
  // data) isolates exactly what THIS save is meant to change, then
  // applies only that on top of the current server data - so a
  // concurrent change from elsewhere is never overwritten, no matter
  // how far behind this device's local copy had drifted.
  const persistJobs = useCallback(async (next) => {
    jobsWriteInFlightRef.current = true;
    const prevLocalJobs = jobs;
    setJobs(next);
    try {
      const merged = await mergeJobsWithFreshServer(next, prevLocalJobs);
      await window.storage.set('jobs', JSON.stringify(merged), true);
      setJobs(merged);
      return true;
    } catch (e) {
      showToast('Save failed', true);
      return false;
    } finally {
      jobsWriteInFlightRef.current = false;
    }
  }, [jobs]);
  const persistPin = useCallback(async (pin) => {
    setAdminPin(pin);
    try { await window.storage.set('admin_pin', pin, true); }
    catch (e) { showToast('PIN save failed', true); }
  }, []);
  const persistEstimateRates = useCallback(async (rates) => {
    setEstimateRatesRaw(rates);
    try { await window.storage.set('estimate_rates', JSON.stringify(rates), true); }
    catch (e) { showToast('Rates save failed', true); }
  }, []);
  const persistFaqs = useCallback(async (list) => {
    setFaqsRaw(list);
    try { await window.storage.set('faqs', JSON.stringify(list), true); }
    catch (e) { showToast('FAQ save failed', true); }
  }, []);
  const persistPartnerPin = useCallback(async (pin) => {
    setPartnerPin(pin);
    try { await window.storage.set('partner_pin', pin, true); }
    catch (e) { showToast('Partner PIN save failed', true); }
  }, []);
  const persistExpenses = useCallback(async (next) => {
    const prevLocalExpenses = expenses;
    setExpenses(next);
    try {
      const merged = await mergeIdArrayWithFreshServer('expenses', next, prevLocalExpenses);
      await window.storage.set('expenses', JSON.stringify(merged), true);
      setExpenses(merged);
    }
    catch (e) { showToast('Save failed', true); }
  }, [expenses]);
  const persistAppointmentItemOptions = useCallback(async (next) => {
    setAppointmentItemOptions(next);
    try { await window.storage.set('appointment_item_options', JSON.stringify(next), true); }
    catch (e) { showToast('Save failed', true); }
  }, []);
  // Gallery categories are admin-editable (not a fixed list), so they're
  // persisted the same way as everything else the admin can add/remove.
  const setCategories = useCallback(async (next) => {
    setCategoriesRaw(next);
    try { await window.storage.set('categories', JSON.stringify(next), true); }
    catch (e) { showToast('Save failed', true); }
  }, []);
  // Reusable estimate items (e.g. "Wardrobe 8x7, rate 1000") admin builds
  // up over time - lets an estimate line be added with one tap instead
  // of retyping the same desc/rate combination for every new customer.
  const setItemTemplates = useCallback(async (next) => {
    setItemTemplatesRaw(next);
    try { await window.storage.set('item_templates', JSON.stringify(next), true); }
    catch (e) { showToast('Save failed', true); }
  }, []);
  // Attendance is a shared, capped log (like notifications) of every
  // karigar check-in/out - not scoped to a job, since a karigar's
  // workday isn't tied to just one project.
  const ATTENDANCE_CAP = 500;
  const setAttendance = useCallback(async (next) => {
    const capped = next.slice(0, ATTENDANCE_CAP);
    setAttendanceRaw(capped);
    try { await window.storage.set('attendance', JSON.stringify(capped), true); }
    catch (e) { showToast('Save failed', true); }
  }, []);
  // Notifications are a single shared, capped list (see NOTIFICATION_CAP
  // below) rather than per-user inboxes, since every admin/staff/partner
  // sees the same operational events (new appointment, estimate response,
  // payment update). "Read" state is tracked per-viewer inside each
  // notification's own readBy array, so one staff member opening the bell
  // doesn't clear the unread badge for everyone else.
  const persistNotifications = useCallback(async (next) => {
    setNotificationsRaw(next);
    try { await window.storage.set('notifications', JSON.stringify(next), true); }
    catch (e) { /* best effort - a failed notification save shouldn't block the action that triggered it */ }
  }, []);
  const NOTIFICATION_CAP = 200;
  // Which notification types are meant for admin's own awareness
  // (a customer/karigar did something admin needs to see) versus for
  // a specific customer (admin did something that customer needs to
  // know) - decides who real push notifications actually get sent to,
  // alongside the existing in-app bell entry every type already gets.
  const ADMIN_BOUND_NOTIFICATION_TYPES = ['new_appointment', 'estimate_approved', 'estimate_change_request', 'estimate_cancelled', 'extra_work_requested', 'extra_work_needs_price', 'follow_up_needed', 'customer_birthday', 'karigar_message', 'payment_received', 'complaint_reported'];
  const CUSTOMER_BOUND_NOTIFICATION_TYPES = ['appointment_confirmed', 'payment_due', 'extra_work_approved', 'extra_work_rejected', 'complaint_in_progress', 'complaint_resolved'];
  const pushNotification = useCallback((type, message, jobId) => {
    setNotificationsRaw((current) => {
      const entry = { id: uid(), type, message, jobId: jobId || null, createdAt: new Date().toISOString(), readBy: [] };
      const next = [entry, ...current].slice(0, NOTIFICATION_CAP);
      window.storage.set('notifications', JSON.stringify(next), true).catch(() => {});
      return next;
    });
    // Real push, on top of the always-created in-app bell entry above -
    // best effort: if a device never enabled push, or the API call
    // fails for any reason, the in-app notification (which just fired
    // above) is still there regardless, so nothing is actually lost.
    if (window.pushMessaging) {
      if (ADMIN_BOUND_NOTIFICATION_TYPES.includes(type) && adminPushTokens.length > 0) {
        window.pushMessaging.sendPush(adminPushTokens.map((t) => t.token), BUSINESS.name, message).catch(() => {});
      } else if (CUSTOMER_BOUND_NOTIFICATION_TYPES.includes(type) && jobId) {
        const targetJob = jobs.find((j) => j.id === jobId);
        if (targetJob && targetJob.customerPushToken) {
          window.pushMessaging.sendPush(targetJob.customerPushToken, BUSINESS.name, message).catch(() => {});
        }
      }
    }
  }, [adminPushTokens, jobs]);
  // Registers this admin/staff device's FCM token (once notification
  // permission is granted) into the shared list every admin push goes
  // to - safe to call repeatedly (e.g. every login): duplicate tokens
  // for the same device are skipped rather than piling up.
  const enableAdminPushNotifications = useCallback(async () => {
    if (!window.pushMessaging) { showToast('Push notifications is browser mein supported nahi hai', true); return false; }
    const token = await window.pushMessaging.requestPermissionAndGetToken();
    if (!token) { showToast('Notification permission nahi mili', true); return false; }
    if (adminPushTokens.some((t) => t.token === token)) { showToast('Notifications pehle se on hain'); return true; }
    const next = [...adminPushTokens, { token, addedAt: new Date().toISOString() }];
    setAdminPushTokensRaw(next);
    try { await window.storage.set('admin_push_tokens', JSON.stringify(next), true); } catch (e) { /* best effort */ }
    showToast('Notifications on ho gayi');
    return true;
  }, [adminPushTokens, showToast]);
  const markNotificationRead = useCallback((notificationId, viewerKey) => {
    setNotificationsRaw((current) => {
      const next = current.map((n) => (n.id === notificationId && !n.readBy.includes(viewerKey) ? { ...n, readBy: [...n.readBy, viewerKey] } : n));
      window.storage.set('notifications', JSON.stringify(next), true).catch(() => {});
      return next;
    });
  }, []);
  const markAllNotificationsRead = useCallback((viewerKey) => {
    setNotificationsRaw((current) => {
      const next = current.map((n) => (n.readBy.includes(viewerKey) ? n : { ...n, readBy: [...n.readBy, viewerKey] }));
      window.storage.set('notifications', JSON.stringify(next), true).catch(() => {});
      return next;
    });
  }, []);
  // Brochure PDFs: metadata list (name/category/url) is small and lives in
  // Firestore under 'brochures'; the actual PDF file lives in Firebase
  // Storage (see addBrochure/removeBrochure below), since a PDF can be tens
  // of MB - far past what a single Firestore document can hold.
  const addBrochure = useCallback(async (meta, dataUri) => {
    try {
      // Large PDFs go to Firebase Storage (no practical size limit, unlike
      // Firestore's 1MiB-per-document cap), which hands back a real HTTPS
      // download URL. Only that URL - not the PDF's raw data - gets saved
      // in the small 'brochures' metadata list.
      const uploadResult = await window.fileStorage.upload('brochure_' + meta.id, dataUri);
      if (!uploadResult || uploadResult.error) { showToast('Brochure upload fail ho gaya: ' + (uploadResult?.error || 'Firebase Storage abhi tak activate nahi hua ho sakta hai'), true); return false; }
      const next = [{ ...meta, url: uploadResult.url }, ...brochures];
      setBrochures(next);
      await window.storage.set('brochures', JSON.stringify(next), true);
      return true;
    } catch (e) {
      showToast('Brochure save failed', true);
      return false;
    }
  }, [brochures]);
  const removeBrochure = useCallback(async (id) => {
    const next = brochures.filter((b) => b.id !== id);
    setBrochures(next);
    try {
      await window.storage.set('brochures', JSON.stringify(next), true);
      await window.fileStorage.delete('brochure_' + id);
    } catch (e) { /* best effort */ }
  }, [brochures]);
  const persistStaff = useCallback(async (next) => {
    const prevLocalStaff = staff;
    setStaff(next);
    try {
      const merged = await mergeIdArrayWithFreshServer('staff', next, prevLocalStaff);
      await window.storage.set('staff', JSON.stringify(merged), true);
      setStaff(merged);
    }
    catch (e) { showToast('Staff save failed', true); }
  }, [staff]);
  const persistArchivedReviews = useCallback(async (next) => {
    const prevLocal = archivedReviews;
    setArchivedReviewsRaw(next);
    try {
      const merged = await mergeIdArrayWithFreshServer('archived_reviews', next, prevLocal);
      await window.storage.set('archived_reviews', JSON.stringify(merged), true);
      setArchivedReviewsRaw(merged);
    }
    catch (e) { showToast('Review archive save failed', true); }
  }, [archivedReviews]);

  if (!loaded) {
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <div style={styles.loadingScreen}>
          <Logo size={52} />
          <div style={{ marginTop: 10, fontWeight: 700, fontSize: 12.5, color: BRAND.textMuted }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <LoginScreen
          customers={customers}
          adminPin={adminPin}
          partnerPin={partnerPin}
          staff={staff}
          onCustomerLogin={(customerId) => setSession({ role: 'customer', customerId })}
          onRegister={(cust) => {
            const next = [cust, ...customers];
            persistCustomers(next);
            const job = emptyJob(cust.id, cust.name, cust.phone);
            persistJobs([job, ...jobs]);
            setSession({ role: 'customer', customerId: cust.id });
            showToast('Registered! Welcome ' + cust.name);
          }}
          onAdminLogin={(staffName, role, staffId) => setSession({ role: role || 'admin', staffName, staffId })}
        />
        <ToastEl toast={toast} />
      </div>
    );
  }

  if (session.role === 'admin' || session.role === 'partner') {
    const isPartner = session.role === 'partner';
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <AdminApp
          gallery={gallery} setGallery={persistGallery}
          loadGalleryData={loadGalleryData} galleryLoading={galleryLoading}
          customers={customers} setCustomers={persistCustomers}
          jobs={jobs} setJobs={persistJobs}
          adminPushTokens={adminPushTokens} enableAdminPushNotifications={enableAdminPushNotifications}
          adminPin={adminPin} setAdminPin={persistPin}
          partnerPin={partnerPin} setPartnerPin={persistPartnerPin}
          staff={staff} setStaff={persistStaff}
          expenses={expenses} setExpenses={persistExpenses}
          appointmentItemOptions={appointmentItemOptions} setAppointmentItemOptions={persistAppointmentItemOptions}
          categories={categories} setCategories={setCategories}
          brochures={brochures} addBrochure={addBrochure} removeBrochure={removeBrochure}
          notifications={notifications} markNotificationRead={markNotificationRead} markAllNotificationsRead={markAllNotificationsRead}
          itemTemplates={itemTemplates} setItemTemplates={setItemTemplates}
          attendance={attendance}
          estimateRates={estimateRates} setEstimateRates={persistEstimateRates}
          faqs={faqs} setFaqs={persistFaqs}
          archivedReviews={archivedReviews} setArchivedReviews={persistArchivedReviews}
          pushNotification={pushNotification}
          allData={{ customers, jobs, gallery, staff, expenses }}
          staffName={session.staffName}
          isPartner={isPartner}
          onLogout={() => setSession(null)}
          showToast={showToast}
        />
        <ToastEl toast={toast} />
      </div>
    );
  }

  if (session.role === 'karigar') {
    // Looked up by the ID captured at login (session.staffId), not by
    // name - matching on name would break if two karigars share a name
    // (common with everyday names), or silently lock a karigar out of
    // their own assigned jobs the moment admin edits their name in the
    // staff list, since the session's remembered name would then no
    // longer match the updated staff record until the karigar logs back
    // in. The ID never changes once a staff entry is created, so it
    // stays correct across name edits and duplicate-name scenarios. The
    // name-based fallback only matters for a session persisted to
    // localStorage before this fix shipped (no staffId saved yet) -
    // once that session ends, every future login carries staffId.
    const myStaffId = session.staffId || staff.find((s) => s.name === session.staffName)?.id;
    const myJobs = jobs.filter((j) => j.assignedStaffId === myStaffId);
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <KarigarApp
          jobs={myJobs}
          staffName={session.staffName}
          staffId={myStaffId}
          onSaveJob={async (j) => {
            if (!myJobs.some((jj) => jj.id === j.id)) return false; // guard: only ever write a job assigned to this karigar
            return await persistJobs(jobs.map((jj) => (jj.id === j.id ? j : jj)));
          }}
          onLogout={() => setSession(null)}
          showToast={showToast}
          pushNotification={pushNotification}
          attendance={attendance}
          setAttendance={setAttendance}
        />
        <ToastEl toast={toast} />
      </div>
    );
  }

  // ---- CUSTOMER SESSION ----
  // Strict isolation: a customer session only ever resolves ITS OWN customer
  // record and the ONE job row whose customerId matches the logged-in id.
  // No list of other customers, no other job, is ever passed into CustomerApp.
  const myCustomerId = session.customerId;
  const customer = customers.find((c) => c.id === myCustomerId) || null;
  const myJob = jobs.find((j) => j.customerId === myCustomerId) || emptyJob(myCustomerId, customer?.name, customer?.phone);

  // A stored session pointing at a customer that no longer exists (deleted
  // account, or corrupted localStorage) falls back to the login screen.
  // Calling setSession here - conditionally, during render - is React's
  // documented "adjusting state during rendering" pattern: it's guarded by
  // the !customer check, so it can't loop (once session is null, this
  // branch's parent condition is no longer even reached on the next render).
  if (!customer) {
    setSession(null);
    return (
      <div style={styles.app}>
        <style>{fontImport}</style>
        <div style={styles.loadingScreen}>
          <Logo size={52} />
        </div>
      </div>
    );
  }

  // Public testimonials shown to customers: only the reviews an admin has
  // explicitly marked "featured", and only the fields safe to show a
  // stranger (name, rating, text) - never the full job record, which
  // would leak another customer's address, payments, and requirements.
  // Computed here (in the privileged App-level scope that already has
  // full jobs access) rather than inside CustomerApp, which by design
  // never receives any job data beyond the logged-in customer's own.
  // Includes both live jobs' featured reviews AND archived ones (from
  // customers since deleted) - see archivedReviews' definition above
  // for why testimonials need to survive independently of the
  // underlying job record.
  const featuredTestimonials = jobs
    .filter((j) => j.review && j.review.featured)
    .map((j) => ({ customerName: j.customerName, rating: j.review.rating, text: j.review.text, date: j.review.date }))
    .concat((archivedReviews || []).map((r) => ({ customerName: r.customerName, rating: r.rating, text: r.text, date: r.date })))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Customer notifications: filtered down to only this customer's own job
  // (matched by jobId), same privacy principle as testimonials above -
  // the full shared notifications list includes events about every
  // customer, so it's narrowed here rather than inside CustomerApp.
  const myNotifications = notifications.filter((n) => n.jobId === myJob.id);

  return (
    <div style={styles.app}>
      <style>{fontImport}</style>
      <CustomerApp
        customer={customer}
        gallery={gallery}
        loadGalleryData={loadGalleryData} galleryLoading={galleryLoading}
        job={myJob}
        appointmentItemOptions={appointmentItemOptions}
        categories={categories}
        brochures={brochures}
        testimonials={featuredTestimonials}
        estimateRates={estimateRates}
        faqs={faqs}
        pushNotification={pushNotification}
        notifications={myNotifications}
        markNotificationRead={markNotificationRead}
        markAllNotificationsRead={markAllNotificationsRead}
        onSaveJob={async (j) => {
          if (j.customerId !== myCustomerId) return false; // guard: never allow writing another customer's job
          const prevJob = jobs.find((jj) => jj.id === j.id) || null;
          // Customer approving the estimate is the real-world signal that
          // work is starting - auto-advancing status here means admin
          // doesn't have to remember a separate manual step every time a
          // customer approves, which is exactly the kind of small gap
          // that causes a job's status to silently fall out of sync with
          // what's actually happening. Only fires on the transition into
          // 'approved' (not already in_progress or further along), and
          // never moves status backward if admin has already progressed
          // it past 'estimate' for some other reason.
          const justApproved = j.estimateStatus === 'approved' && prevJob?.estimateStatus !== 'approved';
          if (justApproved && (j.status === 'appointment' || j.status === 'estimate')) {
            j = { ...j, status: 'in_progress' };
          }
          const exists = !!prevJob;
          const next = exists ? jobs.map((jj) => (jj.id === j.id ? j : jj)) : [j, ...jobs];
          const ok = await persistJobs(next);
          // A brand-new appointment request (customer just submitted the
          // appointment form for the first time, or re-requested after a
          // reschedule) is the one customer-side action admin needs to
          // hear about immediately - so it's detected here, in the one
          // place that sees both the old and new job state.
          const wasRequested = prevJob?.appointment?.status === 'requested';
          const isRequested = j.appointment?.status === 'requested';
          if (isRequested && (!prevJob?.appointment || !wasRequested)) {
            pushNotification('new_appointment', j.customerName + ' ne appointment request ki hai', j.id);
          }
          // Estimate response (approve / change request / cancel): only
          // fires the moment estimateStatus actually changes, so editing
          // other job fields afterward doesn't re-trigger a stale alert.
          if (j.estimateStatus && j.estimateStatus !== prevJob?.estimateStatus) {
            if (j.estimateStatus === 'approved') {
              pushNotification('estimate_approved', j.customerName + ' ne estimate approve kiya - kaam shuru karein', j.id);
            } else if (j.estimateStatus === 'change_requested') {
              pushNotification('estimate_change_request', j.customerName + ' ne estimate mein change maanga hai', j.id);
            } else if (j.estimateStatus === 'cancelled') {
              pushNotification('estimate_cancelled', j.customerName + ' ne estimate cancel kar diya', j.id);
            }
          }
          // Extra work: customer requesting new extra work (no price yet)
          // needs admin's attention to set a price; a customer's
          // approve/reject of an already-priced item needs admin to know
          // the outcome. Diffs each entry against the previous job state
          // by id, so only genuinely new/changed entries fire - editing
          // unrelated job fields never re-triggers these.
          const prevExtraWork = prevJob?.extraWork || [];
          for (const item of (j.extraWork || [])) {
            const prevItem = prevExtraWork.find((p) => p.id === item.id);
            if (!prevItem && item.status === 'pending_admin_price') {
              pushNotification('extra_work_requested', j.customerName + ' ne extra kaam request kiya: ' + item.desc, j.id);
            } else if (prevItem && prevItem.status !== item.status) {
              if (item.status === 'approved') {
                pushNotification('extra_work_approved', j.customerName + ' ne extra kaam approve kiya: ' + item.desc + ' - Naya total: ' + currency(jobTotal(j)), j.id);
              } else if (item.status === 'rejected') {
                pushNotification('extra_work_rejected', j.customerName + ' ne extra kaam reject kiya: ' + item.desc, j.id);
              }
            }
          }
          return ok;
        }}
        onLogout={() => setSession(null)}
        showToast={showToast}
      />
      <ToastEl toast={toast} />
    </div>
  );
}

function ToastEl({ toast }) {
  if (!toast) return null;
  return (
    <div key={toast.id} style={{ ...styles.toast, background: toast.isError ? '#B5562E' : BRAND.navy }}>
      {toast.msg}
    </div>
  );
}


/* --- Logo mark: the actual Shree Krushn PVC Furniture badge artwork --- */
function Logo({ size = 40 }) {
  return (
    <img
      src='/icon-512.png'
      alt='Shree Krushn PVC Furniture'
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, display: 'block' }}
    />
  );
}

/* ===================== LOGIN / REGISTER ===================== */
// Validates & normalizes an Indian mobile number to a bare 10-digit string.
// Accepts optional +91 / 91 / 0 prefix and spaces/dashes; rejects anything
// that isn't a real 10-digit number starting 6-9 (landlines, short/garbled
// input, repeated-digit junk like 0000000000).
// Small char-filter helpers used instead of regex literals, since regex
// escape sequences (backslashes) get silently stripped when this file is
// edited/pasted through certain mobile text editors.
function digitsOnly(v) {
  let r = '';
  const s = v || '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c >= '0' && c <= '9') r += c;
  }
  return r;
}
function phoneCharsOnly(v) {
  let r = '';
  const s = v || '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c >= '0' && c <= '9') || c === '+' || c === ' ') r += c;
  }
  return r;
}

function normalizeIndianPhone(raw) {
  let digits = digitsOnly(raw);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  const firstChar = digits[0];
  if (firstChar < '6' || firstChar > '9') return null; // not a valid mobile prefix
  const allSame = digits.split('').every(function (c) { return c === digits[0]; }); // all same digit
  if (allSame) return null;
  return digits;
}
function formatPhoneDisplay(digits10) {
  if (!digits10 || digits10.length !== 10) return digits10 || '';
  return '+91 ' + digits10.slice(0, 5) + ' ' + digits10.slice(5);
}

function LoginScreen({ customers, adminPin, partnerPin, staff, onCustomerLogin, onRegister, onAdminLogin }) {
  const [mode, setMode] = useState('choose');
  const [name, setName] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // Demo-mode OTP: shows the generated code directly on screen instead of
  // sending a real SMS, since Firebase Phone Auth SMS requires the Blaze
  // (pay-as-you-go) plan - the project is currently on the free Spark
  // plan, where every real sendOtp call fails. This keeps registration
  // and login working for customers right now; swapping back to
  // window.phoneAuth.sendOtp/verifyOtp once Blaze is active only needs
  // this block replaced, everything else (UI, screens, flow) stays the
  // same either way.
  const [otpStage, setOtpStage] = useState(false); // false | 'register' | 'login'
  const [sentOtp, setSentOtp] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [pendingPhone, setPendingPhone] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);

  const sendOtp = async (forMode) => {
    const normalized = normalizeIndianPhone(phone);
    if (forMode === 'register' && !name.trim()) { setError('Naam daalein'); return; }
    if (!normalized) { setError('Sahi 10-digit mobile number daalein (jaise 98765 43210)'); return; }
    if (forMode === 'login') {
      const found = customers.find((c) => c.phone === normalized);
      if (!found) { setError('Ye number register nahi hai. Pehle register karein.'); return; }
    }
    if (forMode === 'register') {
      const existing = customers.find((c) => c.phone === normalized);
      if (existing) { onCustomerLogin(existing.id); return; }
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentOtp(code);
    setPendingPhone(normalized);
    setOtpInput('');
    setError('');
    setOtpStage(forMode);
  };

  const verifyOtp = async () => {
    if (!otpInput.trim()) { setError('OTP daalein'); return; }
    if (otpInput.trim() !== sentOtp) { setError('Galat OTP - dobara check karein'); return; }
    if (otpStage === 'register') {
      onRegister({ id: uid(), name: name.trim(), phone: pendingPhone, phoneVerified: true, referredBy: referredBy.trim() || null, createdAt: new Date().toISOString() });
    } else {
      const found = customers.find((c) => c.phone === pendingPhone);
      if (found) onCustomerLogin(found.id);
    }
  };

  const resendOtp = async () => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentOtp(code);
    setOtpInput('');
    setError('');
  };

  const backFromOtp = () => {
    setOtpStage(false);
    setSentOtp('');
    setOtpInput('');
    setError('');
  };

  const doAdmin = () => {
    if (pin === adminPin) { onAdminLogin('Admin', 'admin', null); return; }
    if (partnerPin && pin === partnerPin) { onAdminLogin('Partner', 'partner', null); return; }
    const staffMatch = (staff || []).find((s) => s.pin === pin);
    if (staffMatch) { onAdminLogin(staffMatch.name, staffMatch.role === 'karigar' ? 'karigar' : 'admin', staffMatch.id); return; }
    setError('Galat PIN');
  };

  return (
    <div style={styles.loginWrap}>
      <div style={styles.loginBgAccent} />
      <div style={styles.loginBrand}>
        <img src='/icon-512.png' alt='Shree Krushn PVC Furniture logo' style={styles.loginLogo} />
        <div style={styles.brandName}>SHREE KRUSHN</div>
        <div style={styles.brandNameSub}>PVC FURNITURE</div>
        <div style={styles.brandSub}>Design gallery - Requirements - Live work tracking</div>
      </div>

      {otpStage && (
        <div style={styles.loginCard}>
          <div style={styles.fieldLabel}>Verify OTP</div>
          <div style={styles.plainTextMuted}>{formatPhoneDisplay(pendingPhone)} par bheja gaya code daalein</div>
          <div style={styles.otpDemoBox}>
            <AlertTriangle size={13} color='#B5562E' />
            <span>Demo mode - real SMS nahi jaata. Aapka OTP: <b>{sentOtp}</b></span>
          </div>
          <input
            style={{ ...styles.input, marginTop: 10, textAlign: 'center', fontSize: 20, letterSpacing: 6, fontWeight: 800 }}
            value={otpInput}
            onChange={(e) => { setOtpInput(digitsOnly(e.target.value).slice(0, 6)); setError(''); }}
            placeholder='000000'
            inputMode='numeric'
            maxLength={6}
            autoFocus
          />
          {error && <div style={styles.errorText}>{error}</div>}
          <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={verifyOtp}>Verify &amp; Continue</button>
          <button style={styles.linkBtn2} onClick={resendOtp}>OTP dobara bhejein</button>
          <button style={styles.backLink} onClick={backFromOtp}><ArrowLeft size={13} /> Back</button>
        </div>
      )}

      {!otpStage && mode === 'choose' && (
        <div style={styles.loginCard}>
          <button style={styles.primaryBtn} onClick={() => setMode('register')}>
            <Sparkles size={15} /> Naye Customer - Register karein
          </button>
          <button style={{ ...styles.primaryBtn, background: BRAND.navyLight, marginTop: 10 }} onClick={() => setMode('login')}>
            Pehle se registered? Login karein
          </button>
          <button style={styles.adminLink} onClick={() => setMode('admin')}>
            <ShieldCheck size={13} /> Admin Login
          </button>
        </div>
      )}

      {!otpStage && mode === 'register' && (
        <div style={styles.loginCard}>
          <div style={styles.fieldLabel}>Naam</div>
          <input style={styles.input} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder='Aapka naam' autoFocus />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Phone number</div>
          <input style={styles.input} value={phone} onChange={(e) => { const v = phoneCharsOnly(e.target.value).slice(0, 14); setPhone(v); setError(''); }} placeholder='98765 43210' inputMode='tel' maxLength={14} />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Kisne refer kiya? (optional)</div>
          <input style={styles.input} value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder='Naam ya phone number' />
          {error && <div style={styles.errorText}>{error}</div>}
          <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={() => sendOtp('register')} disabled={sendingOtp}>{sendingOtp ? 'Sending...' : 'Send OTP'}</button>
          <button style={styles.backLink} onClick={() => setMode('choose')}><ArrowLeft size={13} /> Back</button>
        </div>
      )}

      {!otpStage && mode === 'login' && (
        <div style={styles.loginCard}>
          <div style={styles.fieldLabel}>Registered phone number</div>
          <input style={styles.input} value={phone} onChange={(e) => { const v = phoneCharsOnly(e.target.value).slice(0, 14); setPhone(v); setError(''); }} placeholder='98765 43210' inputMode='tel' maxLength={14} autoFocus />
          {error && <div style={styles.errorText}>{error}</div>}
          <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={() => sendOtp('login')} disabled={sendingOtp}>{sendingOtp ? 'Sending...' : 'Send OTP'}</button>
          <button style={styles.backLink} onClick={() => setMode('choose')}><ArrowLeft size={13} /> Back</button>
        </div>
      )}

      {!otpStage && mode === 'admin' && (
        <div style={styles.loginCard}>
          <div style={styles.fieldLabel}>Admin PIN</div>
          <input style={styles.input} value={pin} onChange={(e) => { setPin(e.target.value); setError(''); }} placeholder='****' inputMode='numeric' type='password' autoFocus />
          {error && <div style={styles.errorText}>{error}</div>}
          <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={doAdmin}>Enter Admin Panel</button>
          <button style={styles.backLink} onClick={() => setMode('choose')}><ArrowLeft size={13} /> Back</button>
        </div>
      )}
    </div>
  );
}

/* ===================== SHARED CHROME ===================== */
function SheetHeader({ title, onClose }) {
  return (
    <div style={styles.sheetHeader}>
      <div style={styles.sheetTitle}>{title}</div>
      <button style={styles.iconBtn} onClick={onClose}><X size={20} color={BRAND.navy} /></button>
    </div>
  );
}

// Icons/labels shown per notification type - keeps the bell dropdown
// scannable at a glance (a payment alert looks different from a new
// appointment) without every call site needing to know the styling.
const NOTIFICATION_META = {
  new_appointment: { icon: 'Calendar', label: 'New Appointment' },
  appointment_confirmed: { icon: 'CheckCircle2', label: 'Visit Confirmed' },
  estimate_approved: { icon: 'ThumbsUp', label: 'Estimate Approved' },
  estimate_change_request: { icon: 'MessageSquare', label: 'Estimate Change Request' },
  estimate_cancelled: { icon: 'XCircle', label: 'Estimate Cancelled' },
  payment_received: { icon: 'IndianRupee', label: 'Payment Received' },
  payment_due: { icon: 'AlertCircle', label: 'Payment Due' },
  extra_work_requested: { icon: 'Hammer', label: 'Extra Work Requested' },
  extra_work_needs_price: { icon: 'Hammer', label: 'Extra Work Price Set' },
  extra_work_approved: { icon: 'ThumbsUp', label: 'Extra Work Approved' },
  extra_work_rejected: { icon: 'XCircle', label: 'Extra Work Rejected' },
  follow_up_needed: { icon: 'AlertCircle', label: 'Follow-up Needed' },
  customer_birthday: { icon: 'Star', label: 'Birthday Today' },
  karigar_message: { icon: 'MessageSquare', label: 'Karigar Message' },
  complaint_reported: { icon: 'AlertCircle', label: 'Complaint' },
  complaint_in_progress: { icon: 'Hammer', label: 'Repair Started' },
  complaint_resolved: { icon: 'CheckCircle2', label: 'Complaint Resolved' },
  work_completed_by_karigar: { icon: 'CheckCircle2', label: 'Karigar Marked Complete' },
};
const NOTIFICATION_ICONS = { Calendar, CheckCircle2, ThumbsUp, MessageSquare, XCircle, IndianRupee, AlertCircle, Hammer, Star };

function FavoritesButton({ job, onSaveJob, showToast, categories, gallery }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [addCategory, setAddCategory] = useState(categories[0]);
  const savedDesigns = job.savedDesigns || [];

  // Favorited entries only store a photoId (see Lightbox's toggleSave for
  // why) - the actual image data is resolved here from the live gallery
  // state, which is already loaded and hydrated separately. If a photo
  // was later removed from the gallery, resolvedPhoto is null for that
  // entry and it's skipped from display rather than showing a broken
  // image or crashing.
  const resolvePhoto = (photoId) => {
    for (const cat of Object.keys(gallery || {})) {
      const found = (gallery[cat] || []).find((p) => p.id === photoId);
      if (found) return found;
    }
    return null;
  };
  const resolvedDesigns = savedDesigns
    .map((d) => ({ ...d, resolved: resolvePhoto(d.photoId) }))
    .filter((d) => d.resolved);

  const removeSavedDesign = (photoId) => {
    onSaveJob({ ...job, savedDesigns: savedDesigns.filter((d) => d.photoId !== photoId) });
    showToast('Favorites se hataya gaya');
  };

  // Adds a favorited photo to the customer's project requirements. Like
  // savedDesigns, only the photoId reference is stored in photoRef (not
  // the photo's url/origUrl) - same reasoning: it's always a gallery
  // photo, so the image data already exists in the gallery's own
  // storage and doesn't need a second, inline copy inside the shared
  // 'jobs' document.
  const addToProject = async (d) => {
    const req = {
      id: uid(),
      category: addCategory,
      text: 'Saved design reference' + (d.caption ? ': ' + d.caption : ''),
      dimensions: '',
      priority: 'normal',
      photoRef: { photoId: d.photoId },
      createdAt: new Date().toISOString(),
    };
    let next = { ...job, requirements: [req, ...(job.requirements || [])] };
    next = logActivity(next, 'Requirement added: ' + addCategory + ' (saved design)');
    const ok = await onSaveJob(next);
    setAddingId(null);
    if (ok) showToast('Project mein add ho gaya');
  };

  return (
    <div style={{ position: 'relative' }}>
      <button style={styles.iconBtn} onClick={() => setOpen((o) => !o)}>
        <Star size={19} color={BRAND.navy} fill={savedDesigns.length > 0 ? BRAND.gold : 'none'} />
        {savedDesigns.length > 0 && <div style={styles.notifBadge}>{savedDesigns.length > 9 ? '9+' : savedDesigns.length}</div>}
      </button>
      {open && (
        <>
          <div style={styles.notifBackdrop} onClick={() => { setOpen(false); setAddingId(null); }} />
          <div style={styles.notifPanel}>
            <div style={styles.notifPanelHeader}>
              <span>Favorites</span>
            </div>
            <div style={{ ...styles.notifList, padding: resolvedDesigns.length > 0 ? 10 : 0 }}>
              {resolvedDesigns.length === 0 && <div style={styles.emptySmall}>Gallery mein photo ke star icon se favorite add karein.</div>}
              {resolvedDesigns.length > 0 && (
                <div style={styles.savedDesignGrid}>
                  {resolvedDesigns.map((d, i) => (
                    <div key={d.photoId} style={styles.savedDesignCard}>
                      <button style={{ border: 'none', padding: 0, width: '100%', height: '100%', background: 'none', cursor: 'pointer' }} onClick={() => setLightbox({ photos: resolvedDesigns.map((sd) => ({ id: sd.photoId, url: sd.resolved.url, origUrl: sd.resolved.origUrl, caption: sd.caption })), index: i })}>
                        <SmartImg src={d.resolved.url} origUrl={d.resolved.origUrl} alt={d.caption} style={styles.savedDesignImg} />
                      </button>
                      <button style={styles.multiPhotoPreviewRemove} onClick={() => removeSavedDesign(d.photoId)}><X size={12} color='#FFF' /></button>
                      {addingId === d.photoId ? (
                        <div style={styles.favAddCategoryBar}>
                          <select style={styles.favAddCategorySelect} value={addCategory} onChange={(e) => setAddCategory(e.target.value)}>
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button style={styles.favAddConfirmBtn} onClick={() => addToProject(d)}><Check size={12} color='#FFF' /></button>
                        </div>
                      ) : (
                        <button style={{ ...styles.savedDesignActions, border: 'none', cursor: 'pointer', width: '100%' }} onClick={() => { setAddingId(d.photoId); setAddCategory(categories[0]); }}>
                          <span style={styles.savedDesignAddBtn}>Add to Project</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
    </div>
  );
}


function NotificationBell({ notifications, viewerKey, onOpenJob, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.readBy.includes(viewerKey));
  const recent = notifications.slice(0, 30);

  const handleTapNotification = (n) => {
    onMarkRead(n.id, viewerKey);
    if (n.jobId && onOpenJob) { onOpenJob(n.jobId); setOpen(false); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button style={styles.iconBtn} onClick={() => setOpen((o) => !o)}>
        <Bell size={19} color={BRAND.navy} />
        {unread.length > 0 && <div style={styles.notifBadge}>{unread.length > 9 ? '9+' : unread.length}</div>}
      </button>
      {open && (
        <>
          <div style={styles.notifBackdrop} onClick={() => setOpen(false)} />
          <div style={styles.notifPanel}>
            <div style={styles.notifPanelHeader}>
              <span>Notifications</span>
              {unread.length > 0 && <button style={styles.notifMarkAllBtn} onClick={() => onMarkAllRead(viewerKey)}>Mark all read</button>}
            </div>
            <div style={styles.notifList}>
              {recent.length === 0 && <div style={styles.emptySmall}>Koi notification nahi hai.</div>}
              {recent.map((n) => {
                const meta = NOTIFICATION_META[n.type] || { icon: 'Bell', label: n.type };
                const Icon = NOTIFICATION_ICONS[meta.icon] || Bell;
                const isUnread = !n.readBy.includes(viewerKey);
                return (
                  <button key={n.id} style={{ ...styles.notifRow, ...(isUnread ? styles.notifRowUnread : {}) }} onClick={() => handleTapNotification(n)}>
                    <div style={styles.notifIconWrap}><Icon size={15} color={BRAND.gold} /></div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={styles.notifMessage}>{n.message}</div>
                      <div style={styles.notifTime}>{timeAgo(n.createdAt)}</div>
                    </div>
                    {isUnread && <div style={styles.notifDot} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TopBar({ title, subtitle, onLogout, onBack, right, hideLogout }) {
  return (
    <div style={styles.header}>
      <div style={styles.brandRow}>
        {onBack ? (
          <button style={styles.iconBtn} onClick={onBack}><ArrowLeft size={20} color={BRAND.navy} /></button>
        ) : (
          <Logo size={34} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandNameSm}>{title}</div>
          {subtitle && <div style={styles.brandSubSm}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {right}
        {!hideLogout && <button style={styles.logoutBtn} onClick={onLogout}><LogOut size={15} /></button>}
      </div>
    </div>
  );
}

function BottomNav({ tab, setTab, items }) {
  return (
    <div style={styles.bottomNav}>
      {items.map((it) => (
        <button key={it.key} onClick={() => setTab(it.key)} style={{ ...styles.navBtn, color: tab === it.key ? BRAND.navy : '#B3B8C6' }}>
          <div style={{ position: 'relative' }}>{it.icon}</div>
          <span style={{ ...styles.navLabel, fontWeight: tab === it.key ? 800 : 600 }}>{it.label}</span>
          {tab === it.key && <div style={styles.navIndicator} />}
        </button>
      ))}
    </div>
  );
}

function MoneyBit({ label, value, muted, highlight }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={styles.moneyLabel}>{label}</div>
      <div style={{ ...styles.moneyValue, color: highlight ? '#B5562E' : muted ? BRAND.textMuted : BRAND.navy }}>{value}</div>
    </div>
  );
}
function StatCard({ icon, label, value, accent, onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp style={{ ...styles.statCard, ...(accent ? { borderColor: BRAND.gold } : {}), ...(onClick ? { cursor: 'pointer', fontFamily: 'inherit' } : {}) }} onClick={onClick}>
      <div style={{ ...styles.statIcon, color: accent ? BRAND.gold : BRAND.navy }}>{icon}</div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </Comp>
  );
}
function StageBadge({ status, size }) {
  const st = STATUS[status] || STATUS.appointment;
  const Icon = st.icon;
  return (
    <span style={{ ...styles.badge, background: st.bg, color: st.color, fontSize: size === 'sm' ? 9.5 : 10.5 }}>
      <Icon size={10} /> {st.label}
    </span>
  );
}

/* ===================== CUSTOMER APP ===================== */
/* Everything below receives ONLY this one customer's data - never a list of others. */
function HelpScreen({ faqs, onBack }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div style={{ paddingBottom: 20 }}>
      <TopBar title='Help / FAQ' onBack={onBack} hideLogout />
      <div style={{ padding: '12px 16px' }}>
        {(!faqs || faqs.length === 0) ? (
          <div style={styles.emptySmall}>Abhi koi FAQ add nahi hui hai. Kuch bhi poochhna ho to seedha call/WhatsApp karein.</div>
        ) : (
          faqs.map((f) => {
            const isOpen = openId === f.id;
            return (
              <div key={f.id} style={{ ...styles.formCard, marginTop: 10 }}>
                <button style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }} onClick={() => setOpenId(isOpen ? null : f.id)}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: BRAND.navy, flex: 1 }}>{f.question}</div>
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {isOpen && <div style={{ ...styles.plainTextMuted, marginTop: 8 }}>{f.answer}</div>}
              </div>
            );
          })
        )}
        <div style={{ ...styles.plainTextMuted, marginTop: 16, textAlign: 'center' }}>Aur koi sawaal ho to {BUSINESS.phone} par call/WhatsApp karein.</div>
      </div>
    </div>
  );
}

function CustomerApp({ customer, gallery, loadGalleryData, galleryLoading, job, appointmentItemOptions, categories, brochures, testimonials, estimateRates, faqs, pushNotification, notifications, markNotificationRead, markAllNotificationsRead, onSaveJob, onLogout, showToast }) {
  // Registers this customer's own device for push notifications
  // (visit confirmed, payment due, etc.) - the token is stored
  // directly on their job record, since that's what pushNotification
  // (top level of App) looks up when sending a customer-bound
  // notification.
  const enableCustomerPushNotifications = async () => {
    if (!window.pushMessaging) { showToast('Push notifications is browser mein supported nahi hai', true); return; }
    const token = await window.pushMessaging.requestPermissionAndGetToken();
    if (!token) { showToast('Notification permission nahi mili', true); return; }
    const ok = await onSaveJob({ ...job, customerPushToken: token });
    if (ok) showToast('Notifications on ho gayi');
  };

  // Everyone lands on Home first, regardless of whether an appointment
  // is booked yet - someone who just wants to browse the gallery or
  // try the estimate calculator before deciding to book a visit
  // shouldn't be forced through the appointment tab first. Home
  // itself has a clear "Book Visit" prompt for anyone who hasn't
  // booked yet, so booking is still one tap away, just not the ONLY
  // thing a new customer can reach.
  const [tab, setTab] = useState('home');
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Once the Gallery tab has been visited, it stays MOUNTED (just
  // hidden via CSS when a different tab is active) instead of being
  // unmounted/remounted every time someone switches away and back -
  // conditional JSX rendering ({tab === 'gallery' && <GalleryBrowser
  // .../>}) fully destroys and rebuilds the whole photo grid on every
  // single visit, which is what made photos look like they were
  // "reloading" each time: every <img> became a brand-new DOM element
  // needing to re-render, even though the browser already had the
  // image bytes cached. Keeping it mounted after the first visit means
  // returning to Gallery is instant - it was never actually gone.
  const [galleryEverVisited, setGalleryEverVisited] = useState(tab === 'gallery');
  useEffect(() => {
    if (tab === 'gallery' && !galleryEverVisited) setGalleryEverVisited(true);
  }, [tab, galleryEverVisited]);

  if (showHelp) {
    return <HelpScreen faqs={faqs} onBack={() => setShowHelp(false)} />;
  }

  if (showProfile) {
    return (
      <div style={{ paddingBottom: 20 }}>
        <TopBar title='Mera Profile' onBack={() => setShowProfile(false)} hideLogout />
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.formCard}>
            <div style={styles.fieldLabel}>Naam</div>
            <div style={styles.itemDesc}>{customer?.name || '-'}</div>
            <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Mobile Number</div>
            <div style={styles.itemDesc}>{customer?.phone ? formatPhoneDisplay(customer.phone) : '-'}</div>
          </div>
          <div style={{ ...styles.formCard, marginTop: 12 }}>
            <div style={styles.fieldLabel}>Notifications</div>
            <div style={styles.plainTextMuted}>App band ho tab bhi updates (visit confirm, payment due, waghera) turant mil jayenge.</div>
            {job.customerPushToken ? (
              <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 8 }}>
                <CheckCircle2 size={14} /> Notifications on hain
              </div>
            ) : (
              <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={enableCustomerPushNotifications}><Bell size={14} /> Notifications On Karein</button>
            )}
          </div>
          <a
            href={whatsAppShareUrl(null, 'Namaste! Maine ' + BUSINESS.name + ' ki app use ki hai - PVC furniture ke liye bahut achhi hai. Aap bhi dekho: https://' + BUSINESS.website)}
            target='_blank' rel='noopener noreferrer'
            style={{ ...styles.addBtn, marginTop: 12, textDecoration: 'none' }}
          >
            <Send size={14} /> App Doston Ko Bhejein
          </a>
          <button style={{ ...styles.addBtn, marginTop: 12 }} onClick={() => setShowHelp(true)}><HelpCircle size={14} /> Help / FAQ</button>
          <button style={{ ...styles.addBtn, background: '#FFEBEE', color: '#C62828', marginTop: 16 }} onClick={onLogout}><LogOut size={14} /> Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 74 }}>
      <TopBar
        title={customer?.name || 'Customer'}
        subtitle='Shree Krushn PVC Furniture'
        hideLogout
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FavoritesButton job={job} onSaveJob={onSaveJob} showToast={showToast} categories={categories} gallery={gallery} />
            <NotificationBell
              // Only customer-facing types (things admin/karigar did that
              // the customer needs to know about) - the shared feed also
              // carries admin-facing operational alerts (new_appointment,
              // estimate_approved, extra_work_requested, etc.), which are
              // all worded in third person about the customer's OWN
              // actions ("Ramesh ne estimate approve kiya") - showing
              // those back to the customer who just did them is confusing
              // noise, not a notification. Restricting to a small
              // allowlist here (rather than excluding admin-only types by
              // name) means any new admin-facing type added later is
              // safe-by-default and won't leak into the customer's bell
              // unless explicitly added to this list.
              notifications={(notifications || []).filter((n) => n.type === 'appointment_confirmed' || n.type === 'extra_work_needs_price')}
              viewerKey={'customer_' + (customer?.id || 'unknown')}
              onOpenJob={null}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
            />
            <button style={styles.iconBtn} onClick={() => setShowProfile(true)}><User size={19} color={BRAND.navy} /></button>
          </div>
        }
      />

      {tab === 'home' && <CustomerHome job={job} customer={customer} setTab={setTab} onOpenCalculator={() => setTab('instant_estimate')} onLogout={onLogout} />}
      {tab === 'appointment' && <AppointmentPanel job={job} onSave={onSaveJob} showToast={showToast} itemOptions={appointmentItemOptions} />}
      {galleryEverVisited && (
        <div style={{ display: tab === 'gallery' ? 'block' : 'none' }}>
          <GalleryBrowser gallery={gallery} galleryLoading={galleryLoading} brochures={brochures} categories={categories} testimonials={testimonials} job={job} onSaveJob={onSaveJob} showToast={showToast} />
        </div>
      )}
      {tab === 'requirements' && <RequirementsPanel job={job} onSave={onSaveJob} showToast={showToast} categories={categories} customer={customer} gallery={gallery} />}
      {tab === 'instant_estimate' && <InstantEstimateCalculator estimateRates={estimateRates} showToast={showToast} onBack={() => setTab('home')} />}
      {tab === 'estimate' && (
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Estimate</div>
          <EstimateView job={job} onSave={onSaveJob} showToast={showToast} />
        </div>
      )}
      {tab === 'progress' && <ProgressView job={job} onSave={onSaveJob} showToast={showToast} customer={customer} categories={categories} pushNotification={pushNotification} />}
      {tab === 'review' && <ReviewPanel job={job} onSave={onSaveJob} showToast={showToast} />}

      <BottomNav
        tab={tab} setTab={setTab}
        items={[
          { key: 'home', label: 'Home', icon: <Home size={18} /> },
          { key: 'appointment', label: 'Visit', icon: <Calendar size={18} /> },
          { key: 'gallery', label: 'Designs', icon: <Grid3x3 size={18} /> },
          { key: 'estimate', label: 'Estimate', icon: <FileText size={18} /> },
          { key: 'progress', label: 'Progress', icon: <Hammer size={18} /> },
          { key: 'review', label: 'Review', icon: <Star size={18} /> },
        ]}
      />
    </div>
  );
}

function CustomerHome({ job, customer, setTab, onOpenCalculator, onLogout }) {
  const st = STATUS[job.status] || STATUS.appointment;
  const total = jobTotal(job);
  const due = jobDue(job);
  const curIdx = STATUS_ORDER.indexOf(job.status);
  const pct = Math.round(((curIdx + 1) / STATUS_ORDER.length) * 100);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.heroCard}>
        <div style={styles.heroTop}>
          <div>
            <div style={styles.heroGreeting}>Namaste, {customer?.name?.split(' ')[0] || 'Customer'} 👋</div>
            <div style={styles.heroSub}>Aapke order ki current stage</div>
          </div>
          <StageBadge status={job.status} />
        </div>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: pct + '%', background: BRAND.gold }} />
        </div>
        <div style={styles.progressLabels}>
          {STATUS_ORDER.map((s, i) => (
            <span key={s} style={{ fontWeight: i <= curIdx ? 800 : 600, color: i <= curIdx ? '#FDFCF8' : '#5A6690' }}>
              {STATUS[s].label.split(' ')[0]}
            </span>
          ))}
        </div>
      </div>

      {job.expectedCompletionDate && (job.status === 'in_progress' || job.status === 'delivered') && (() => {
        const days = daysUntil(job.expectedCompletionDate);
        const dateText = formatDate(job.expectedCompletionDate);
        let mainText;
        if (job.status === 'delivered') {
          mainText = <span>Deliver ho chuka hai: <b>{dateText}</b></span>;
        } else if (days === 0) {
          mainText = <span><b>Aaj</b> delivery ka din hai! 🎉</span>;
        } else if (days === 1) {
          mainText = <span><b>Kal</b> delivery ka din hai - {dateText}</span>;
        } else if (days > 1) {
          mainText = <span><b>{days} din</b> baaki hain - {dateText}</span>;
        } else {
          // Date has already passed while still in_progress - shown
          // plainly rather than with alarming "delayed" language, since
          // work sometimes genuinely runs a little past the original
          // estimate for good reason, and the customer's own admin
          // contact is the right place for a status update, not a
          // banner implying something's wrong.
          mainText = <span>Expected: <b>{dateText}</b></span>;
        }
        return (
          <div style={styles.deliveryDateBanner}>
            <Calendar size={15} color={BRAND.gold} />
            {mainText}
          </div>
        );
      })()}

      {total > 0 && (
        <button style={styles.payStripBtn} onClick={() => setTab('progress')}>
          <div style={styles.payStrip}>
            <MoneyBit label='Estimate Total' value={currency(total)} />
            <MoneyBit label='Paid' value={currency(jobPaid(job))} muted />
            <MoneyBit label='Due' value={currency(due)} highlight={due > 0} />
          </div>
          {(job.items || []).length > 0 && (
            <div style={styles.homeEstimatePreview}>
              {(job.items || []).slice(0, 3).map((it) => (
                <div key={it.id} style={styles.homeEstimateRow}>
                  <span style={styles.homeEstimateDesc}>{it.desc}</span>
                  <span style={styles.homeEstimateAmt}>{currency(estimateItemAmount(it))}</span>
                </div>
              ))}
              {(job.items || []).length > 3 && (
                <div style={styles.homeEstimateMore}>+{(job.items || []).length - 3} aur item...</div>
              )}
              <div style={styles.homeEstimateViewAll}>Poora Estimate Dekhein &rarr;</div>
            </div>
          )}
        </button>
      )}

      <div style={styles.quickGrid}>
        <QuickTile icon={<Calendar size={20} color={BRAND.navy} />} label='Book Visit' onClick={() => setTab('appointment')} />
        <QuickTile icon={<Calculator size={20} color={BRAND.navy} />} label='Instant Estimate' onClick={onOpenCalculator} />
        <QuickTile icon={<Grid3x3 size={20} color={BRAND.navy} />} label='Browse Designs' onClick={() => setTab('gallery')} />
        <QuickTile icon={<Edit3 size={20} color={BRAND.navy} />} label='Add Requirement' onClick={() => setTab('requirements')} />
        <QuickTile icon={<Hammer size={20} color={BRAND.navy} />} label='Work Progress' onClick={() => setTab('progress')} />
        {(job.status === 'delivered' || job.status === 'paid') && (
          <QuickTile icon={<Star size={20} color={BRAND.navy} />} label={job.review ? 'Aapka Review' : 'Review Dein'} onClick={() => setTab('review')} />
        )}
      </div>

      {(job.activity || []).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={styles.fieldLabel}>Recent Activity</div>
          {job.activity.slice(0, 8).map((a) => (
            <div key={a.id} style={styles.activityRow}>
              <div style={styles.activityDot} />
              <div style={{ flex: 1 }}>
                <div style={styles.activityText}>{a.text}</div>
                <div style={styles.itemSub}>{timeAgo(a.date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickTile({ icon, label, onClick }) {
  return (
    <button style={styles.quickTile} onClick={onClick}>
      {icon}
      <span style={styles.quickTileLabel}>{label}</span>
    </button>
  );
}

/* ---- Gallery browser ---- */
function GalleryBrowser({ gallery, galleryLoading, brochures, categories, testimonials, job, onSaveJob, showToast }) {
  const [activeCat, setActiveCat] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [showBrochures, setShowBrochures] = useState(false);
  const [showTestimonials, setShowTestimonials] = useState(false);
  const [query, setQuery] = useState('');
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  // How many photo cards are actually rendered into the DOM at once,
  // regardless of how many exist in the current view - a category with
  // 700 photos rendering all 700 <img>+wrapper elements immediately
  // was the real slowdown here: loading='lazy' on SmartImg already
  // defers the actual image byte downloads, but it does nothing about
  // the cost of constructing and mounting 700 DOM nodes up front,
  // which is a real, separate performance hit on a budget phone.
  // Starting small and growing via "Load More" (rather than a fixed
  // small page forever) means opening a category still feels
  // instant, while still reaching every photo for someone who
  // actually scrolls that far.
  const PHOTO_PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PHOTO_PAGE_SIZE);

  // The gallery's OWN category list - a union of Settings' configured
  // item-types (categories) AND whatever categories genuinely have
  // photos in the gallery data right now (Object.keys(gallery)) - NOT
  // just categories directly, which was the actual bug: if a category
  // like "Study Table" or "Washbasin" was ever removed from Settings'
  // item-categories list (for any reason - it's no longer needed as an
  // ESTIMATE line-item type, say), every photo the gallery had under
  // that category name silently stopped appearing anywhere - not just
  // its own chip disappearing, but "All Photos" (which only flattened
  // `categories`, not the actual gallery data) skipping those photos
  // too, since as far as it knew, that category no longer existed.
  // The data itself was never actually deleted - it was just no longer
  // reachable through any part of the UI. Using this union instead
  // means a category with real photos in it can never go invisible
  // this way again, while a genuinely new, still-empty category
  // (just added in Settings, no photos yet) still shows up too.
  const galleryCategories = useMemo(() => {
    return [...new Set([...(categories || []), ...Object.keys(gallery || {})])];
  }, [categories, gallery]);

  // All photos across every category, newest first - lets a customer
  // browse everything in one flat grid instead of having to know (or
  // guess) which category something was filed under, or click into each
  // category one at a time just to see what's new. Recomputed from
  // `gallery` each render (not memoized to skip work - the useMemo here
  // is only to keep this hook call itself unconditional), which is
  // fine at this photo count - no meaningful cost, and it stays
  // trivially correct as photos get added/moved/removed.
  const allPhotosFlat = useMemo(() => {
    const combined = [];
    for (const cat of galleryCategories) {
      for (const p of (gallery[cat] || [])) combined.push({ ...p, category: cat });
    }
    return combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [gallery, galleryCategories]);

  if (galleryLoading && Object.keys(gallery || {}).length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid ' + BRAND.line, borderTopColor: BRAND.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ ...styles.plainTextMuted, marginTop: 12 }}>Gallery load ho rahi hai...</div>
      </div>
    );
  }



  if (showAllPhotos || activeCat) {
    const inAllPhotosMode = showAllPhotos && !activeCat;
    const basePhotos = inAllPhotosMode ? allPhotosFlat : [...(gallery[activeCat] || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    // Caption search only makes sense once there's enough to search
    // through - filters the CURRENT view (whichever category, or all
    // photos), not a separate global search.
    const photos = basePhotos.filter((p) => !query.trim() || (p.caption || '').toLowerCase().includes(query.toLowerCase()));
    const visiblePhotos = photos.slice(0, visibleCount);
    const hasMore = photos.length > visibleCount;
    return (
      <div style={{ padding: '12px 16px' }}>
        <button style={styles.backLink} onClick={() => { setActiveCat(null); setShowAllPhotos(false); setQuery(''); setVisibleCount(PHOTO_PAGE_SIZE); }}><ArrowLeft size={13} /> All categories</button>
        <div style={styles.catTitle}>{inAllPhotosMode ? 'All Photos' : activeCat} <span style={styles.catCount}>({photos.length})</span></div>

        {/* Quick category switcher - lets the customer jump straight to
            another album without going back to the category grid first,
            since browsing between a few related categories (e.g.
            Kitchen -> Wardrobe -> Bedroom) back-and-forth is common and
            the extra round trip through "All categories" each time was
            unnecessary friction. */}
        <div style={styles.chipRow}>
          <button onClick={() => { setActiveCat(null); setShowAllPhotos(true); setQuery(''); setVisibleCount(PHOTO_PAGE_SIZE); }} style={{ ...styles.chip, ...(inAllPhotosMode ? styles.chipActive : {}) }}>All Photos</button>
          {galleryCategories.map((c) => (
            <button key={c} onClick={() => { setActiveCat(c); setShowAllPhotos(false); setQuery(''); setVisibleCount(PHOTO_PAGE_SIZE); }} style={{ ...styles.chip, ...(!inAllPhotosMode && activeCat === c ? styles.chipActive : {}) }}>{c}</button>
          ))}
        </div>

        {basePhotos.length > 6 && (
          <input style={{ ...styles.input, marginTop: 8 }} placeholder='Search by caption...' value={query} onChange={(e) => setQuery(e.target.value)} />
        )}
        {photos.length === 0 && (
          <div style={styles.emptyBlock}>
            <ImageIcon size={26} color='#C7CCDC' />
            <p style={styles.emptyBlockText}>{query.trim() ? 'Koi photo match nahi hui.' : 'Is category mein abhi koi photo nahi hai.'}</p>
          </div>
        )}
        <div style={styles.galleryMasonry}>
          {visiblePhotos.map((p, i) => (
            <button key={p.id} style={styles.galleryMasonryItem} onClick={() => setLightbox({ photos, index: i })}>
              <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption || activeCat} style={styles.galleryMasonryImg} />
              {inAllPhotosMode && <div style={styles.photoThumbCatTag}>{p.category}</div>}
            </button>
          ))}
        </div>
        {hasMore && (
          <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={() => setVisibleCount((v) => v + PHOTO_PAGE_SIZE)}>
            Aur Dikhaein ({photos.length - visibleCount} baaki)
          </button>
        )}
        {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} job={job} onSaveDesign={onSaveJob} showToast={showToast} />}
      </div>
    );
  }

  const totalPhotos = categories.reduce((s, c) => s + (gallery[c] || []).length, 0);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Design Gallery</div>
      <div style={styles.plainTextMuted}>{totalPhotos} designs across {categories.length} categories</div>

      {totalPhotos > 0 && (
        <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={() => setShowAllPhotos(true)}><Grid3x3 size={14} /> View All Photos ({totalPhotos})</button>
      )}

      {brochures && brochures.length > 0 && (
        <div style={styles.brochureSection}>
          <button style={styles.brochureSectionToggle} onClick={() => setShowBrochures((s) => !s)}>
            <FileText size={15} color={BRAND.gold} />
            <span style={{ flex: 1, textAlign: 'left' }}>Product Brochures ({brochures.length})</span>
            <ChevronRight size={15} style={{ transform: showBrochures ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showBrochures && (
            <div style={{ marginTop: 8 }}>
              <BrochureList brochures={brochures} showToast={showToast} canManage={false} />
            </div>
          )}
        </div>
      )}

      {testimonials && testimonials.length > 0 && (
        <div style={styles.brochureSection}>
          <button style={styles.brochureSectionToggle} onClick={() => setShowTestimonials((s) => !s)}>
            <Star size={15} color={BRAND.gold} />
            <span style={{ flex: 1, textAlign: 'left' }}>Customer Reviews ({testimonials.length})</span>
            <ChevronRight size={15} style={{ transform: showTestimonials ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showTestimonials && (
            <div style={{ marginTop: 8 }}>
              {testimonials.map((t, i) => (
                <div key={i} style={styles.reviewCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={styles.cardName}>{t.customerName}</div>
                    <div style={{ display: 'flex', gap: 1 }}>
                      {[1,2,3,4,5].map((n) => <Star key={n} size={12} fill={n <= t.rating ? BRAND.gold : 'none'} color={n <= t.rating ? BRAND.gold : '#D7DAE5'} />)}
                    </div>
                  </div>
                  {t.text && <div style={{ ...styles.plainText, marginTop: 6 }}>{t.text}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={styles.catGrid}>
        {galleryCategories.map((cat) => {
          const count = (gallery[cat] || []).length;
          const cover = (gallery[cat] || [])[0];
          return (
            <button key={cat} style={styles.catCard} onClick={() => setActiveCat(cat)}>
              <div style={styles.catCover}>
                {cover ? <SmartImg src={cover.url} origUrl={cover.origUrl} alt={cat} style={styles.catCoverImg} /> : <ImageIcon size={22} color='#C7CCDC' />}
                {count > 0 && <div style={styles.catCoverBadge}>{count}</div>}
              </div>
              <div style={styles.catName}>{cat}</div>
              <div style={styles.catSub}>{count} photo{count !== 1 ? 's' : ''}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Lightbox({ data, onClose, setLightbox, job, onSaveDesign, showToast }) {
  const { photos, index } = data;
  const photo = photos[index];
  const go = (dir) => setLightbox({ photos, index: (index + dir + photos.length) % photos.length });
  const isSaved = job && (job.savedDesigns || []).some((d) => d.photoId === photo.id);

  const toggleSave = () => {
    if (!job || !onSaveDesign) return;
    const current = job.savedDesigns || [];
    // Store only a lightweight reference (photoId + caption), NOT the
    // photo's full url/origUrl - a favorited photo always comes from the
    // gallery, which already has its own Storage URL stored there.
    // Copying the full url inline here would duplicate it inside the
    // single, monolithic 'jobs' Firestore document (all jobs share one
    // document - see persistJobs); resolving it live from the gallery
    // by photoId instead means favoriting never needs to write it twice.
    const next = isSaved
      ? current.filter((d) => d.photoId !== photo.id)
      : [...current, { photoId: photo.id, caption: photo.caption || '', savedAt: new Date().toISOString() }];
    onSaveDesign({ ...job, savedDesigns: next });
    if (showToast) showToast(isSaved ? 'Design saved list se hataya' : 'Design save ho gaya');
  };

  // Zoom (double-tap or pinch) so someone can check finishing/texture
  // detail up close, without the photo ever actually leaving the app -
  // this is purely a CSS transform on the already-displayed image,
  // never producing a separate saveable/shareable file. Resets back to
  // 1x whenever the photo changes (swiping to the next one), so zoom
  // never carries over onto a different photo.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [index]);
  const lastTapRef = React.useRef(0);
  const pinchStartDistRef = React.useRef(null);
  const pinchStartZoomRef = React.useRef(1);
  const panStartRef = React.useRef(null);
  const MAX_ZOOM = 4;
  const DOUBLE_TAP_ZOOM = 2.5;

  const getTouchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Touch-swipe navigation (when NOT zoomed in) and pinch-zoom / pan
  // (when using two fingers, or dragging while already zoomed) share
  // the same touch handlers, branching on touch count and current zoom
  // level - swiping to navigate and panning a zoomed photo are
  // mutually exclusive at any given moment, so one set of handlers
  // covers both without them fighting each other.
  const touchStartX = React.useRef(null);
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchStartDistRef.current = getTouchDistance(e.touches);
      pinchStartZoomRef.current = zoom;
    } else if (e.touches.length === 1 && zoom > 1) {
      panStartRef.current = { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y };
    } else if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        setZoom((z) => (z > 1 ? 1 : DOUBLE_TAP_ZOOM));
        setPan({ x: 0, y: 0 });
      }
      lastTapRef.current = now;
    }
  };
  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      const newDist = getTouchDistance(e.touches);
      const scale = newDist / pinchStartDistRef.current;
      setZoom(Math.min(MAX_ZOOM, Math.max(1, pinchStartZoomRef.current * scale)));
    } else if (e.touches.length === 1 && zoom > 1 && panStartRef.current) {
      setPan({ x: e.touches[0].clientX - panStartRef.current.x, y: e.touches[0].clientY - panStartRef.current.y });
    }
  };
  const onTouchEnd = (e) => {
    pinchStartDistRef.current = null;
    panStartRef.current = null;
    if (zoom > 1) return; // currently zoomed - a touch-end here is the end of a pan, not a swipe
    if (touchStartX.current === null) return;
    const deltaX = (e.changedTouches[0] ? e.changedTouches[0].clientX : touchStartX.current) - touchStartX.current;
    const SWIPE_THRESHOLD = 40;
    if (deltaX > SWIPE_THRESHOLD) go(-1);
    else if (deltaX < -SWIPE_THRESHOLD) go(1);
    touchStartX.current = null;
  };
  // Double-tap on desktop/mouse (no touch) uses the browser's native
  // dblclick event instead, same toggle behavior.
  const onDoubleClick = () => {
    setZoom((z) => (z > 1 ? 1 : DOUBLE_TAP_ZOOM));
    setPan({ x: 0, y: 0 });
  };

  return (
    <div style={styles.lightboxOverlay} onClick={onClose}>
      <button style={styles.lightboxClose} onClick={onClose}><X size={22} color='#FFF' /></button>
      {job && onSaveDesign && (
        <button style={styles.lightboxSaveBtn} onClick={(e) => { e.stopPropagation(); toggleSave(); }}>
          <Star size={18} fill={isSaved ? BRAND.gold : 'none'} color={isSaved ? BRAND.gold : '#FFF'} />
        </button>
      )}
      <div style={styles.lightboxCounter}>{index + 1} / {photos.length}</div>
      {photos.length > 1 && (
        <button style={{ ...styles.lightboxNav, left: 8 }} onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft size={26} color='#FFF' /></button>
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
        style={{ ...styles.lightboxImgWrap, overflow: 'hidden', touchAction: zoom > 1 ? 'none' : 'pan-y' }}
      >
        <SmartImg
          src={photo.url} origUrl={photo.origUrl} alt={photo.caption}
          style={{ ...styles.lightboxImg, transform: 'scale(' + zoom + ') translate(' + (pan.x / zoom) + 'px, ' + (pan.y / zoom) + 'px)', transition: zoom === 1 ? 'transform 0.2s ease-out' : 'none', cursor: zoom > 1 ? 'grab' : 'default' }}
        />
      </div>
      {photos.length > 1 && (
        <button style={{ ...styles.lightboxNav, right: 8 }} onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight size={26} color='#FFF' /></button>
      )}
      {photo.caption && <div style={styles.lightboxCaption}>{photo.caption}</div>}
      <div style={styles.lightboxSwipeHint}>{photos.length > 1 ? 'Swipe left/right ya arrows use karein - zoom ke liye double-tap karein' : 'Zoom ke liye double-tap karein'}</div>
    </div>
  );
}

/* ---- Appointment: customer requests a home/showroom visit with full
   professional details; admin confirms/reschedules on their side. ---- */
const APPT_PURPOSES = ['Site measurement', 'Design consultation', 'Showroom visit', 'Installation visit', 'Other'];

function AppointmentPanel({ job, onSave, showToast, itemOptions }) {
  const appt = job.appointment;
  // manualEdit only tracks "the user explicitly tapped edit" - it does
  // NOT decide on its own whether to show the form. Whether to show the
  // booked-visit view or the form is recomputed fresh on every render
  // from the CURRENT `appt` (see showForm below), not frozen at whatever
  // `appt` happened to be when this component first mounted. That
  // distinction matters because this panel unmounts and remounts every
  // time the customer switches away from the Visit tab and back (it's
  // only rendered while tab==='appointment') - with the old
  // `useState(!appt)` pattern, each remount recomputed `editing` from
  // whatever `appt` was AT THAT MOMENT, and if a poll or prop update
  // briefly raced with the remount, it could flip to showing the
  // booking form even though a confirmed appointment already existed -
  // exactly what looked like "the booked visit disappeared".
  const [manualEdit, setManualEdit] = useState(false);
  const showForm = manualEdit || !appt;
  const [form, setForm] = useState({
    preferredDate: appt?.preferredDate || '',
    preferredTime: appt?.preferredTime || '',
    purpose: appt?.purpose || APPT_PURPOSES[0],
    bhk: appt?.bhk || '',
    items: appt?.items || [],
    address: appt?.address || job.address || '',
    notes: appt?.notes || '',
    branch: appt?.branch || job.branch || (BUSINESS.branches[0] ? BUSINESS.branches[0].city : ''),
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleItem = (cat) => {
    setForm((f) => ({
      ...f,
      items: f.items.includes(cat) ? f.items.filter((c) => c !== cat) : [...f.items, cat],
    }));
  };
  const canSubmit = form.preferredDate && form.address.trim();

  const submit = () => {
    if (!canSubmit) { showToast('Date aur address zaroori hai', true); return; }
    const nextAppt = {
      ...form,
      status: 'requested',
      requestedAt: new Date().toISOString(),
      confirmedDate: null,
      confirmedTime: null,
    };
    let next = { ...job, appointment: nextAppt, address: form.address.trim(), branch: form.branch };
    const itemsNote = form.items.length ? (' - ' + form.items.join(', ')) : '';
    next = logActivity(next, 'Appointment requested: ' + formatDate(form.preferredDate) + (form.preferredTime ? ', ' + form.preferredTime : '') + itemsNote);
    onSave(next);
    setManualEdit(false);
    showToast('Appointment request bhej di gayi');
  };

  // Admin rescheduling shows the customer a new date/time, but until now
  // there was no way for the customer to actually acknowledge it - the
  // status just said "Rescheduled" with no action. This gives them an
  // explicit accept, which flips status to 'confirmed' (so it reads the
  // same as a normal confirmation from here on); if the new time doesn't
  // work, "Request naya / edit karein" (already below) lets them submit
  // a different preferred date/time instead of silently doing nothing.
  const confirmReschedule = () => {
    let next = { ...job, appointment: { ...appt, status: 'confirmed' } };
    next = logActivity(next, 'Customer ne rescheduled time confirm kiya: ' + formatDate(appt.confirmedDate) + (appt.confirmedTime ? (', ' + appt.confirmedTime) : ''));
    onSave(next);
    showToast('Time confirm ho gaya');
  };

  const st = appt ? (APPT_STATUS[appt.status] || APPT_STATUS.requested) : APPT_STATUS.none;

  if (!showForm && appt) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div style={styles.sectionTitle}>Appointment / Visit</div>
        <div style={styles.apptCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.fieldLabel}>Status</div>
            <span style={{ ...styles.badge, background: st.bg, color: st.color }}>{st.label}</span>
          </div>

          {appt.status === 'confirmed' || appt.status === 'rescheduled' ? (
            <div style={styles.apptConfirmedBlock}>
              <Calendar size={16} color={BRAND.navy} />
              <div>
                <div style={styles.apptConfirmedDate}>{formatDate(appt.confirmedDate)} {appt.confirmedTime && ('- ' + formatTime12h(appt.confirmedTime))}</div>
                <div style={styles.itemSub}>{appt.status === 'rescheduled' ? 'Admin ne naya time diya hai' : 'Admin ne confirm ki hai'}</div>
                {appt.status === 'rescheduled' && (
                  <button style={{ ...styles.primaryBtn2, marginTop: 8 }} onClick={confirmReschedule}><Check size={14} /> Ye Time Theek Hai</button>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.apptRow}>
              <span style={styles.apptRowLabel}>Preferred</span>
              <span style={styles.apptRowValue}>{formatDate(appt.preferredDate)} {appt.preferredTime && ('- ' + formatTime12h(appt.preferredTime))}</span>
            </div>
          )}

          <div style={styles.apptRow}><span style={styles.apptRowLabel}>Purpose</span><span style={styles.apptRowValue}>{appt.purpose}</span></div>
          {appt.bhk && <div style={styles.apptRow}><span style={styles.apptRowLabel}>Property</span><span style={styles.apptRowValue}>{appt.bhk}</span></div>}
          {appt.items && appt.items.length > 0 && (
            <div style={styles.apptRow}>
              <span style={styles.apptRowLabel}>Work needed</span>
              <span style={styles.apptRowValue}>{appt.items.join(', ')}</span>
            </div>
          )}
          <div style={styles.apptRow}><span style={styles.apptRowLabel}>Address</span><span style={styles.apptRowValue}>{appt.address}</span></div>
          {appt.notes && <div style={styles.apptRow}><span style={styles.apptRowLabel}>Notes</span><span style={styles.apptRowValue}>{appt.notes}</span></div>}

          <button style={styles.linkBtn2} onClick={() => setManualEdit(true)}>
            <Edit3 size={12} style={{ marginRight: 4 }} /> Request naya / edit karein
          </button>
        </div>

        {(job.status === 'in_progress' || job.status === 'delivered') && (
          <AdditionalVisitsPanel job={job} onSave={onSave} showToast={showToast} />
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Appointment Book Karein</div>
      <div style={styles.plainTextMuted}>Site visit ya consultation ke liye apni details batayein.</div>

      <div style={styles.formCard}>
        <div style={styles.fieldLabel}>Purpose</div>
        <div style={styles.chipRow}>
          {APPT_PURPOSES.map((p) => (
            <button key={p} onClick={() => set('purpose', p)} style={{ ...styles.chip, ...(form.purpose === p ? styles.chipActive : {}) }}>{p}</button>
          ))}
        </div>

        <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Property size</div>
        <div style={styles.chipRow}>
          {BHK_OPTIONS.map((b) => (
            <button key={b} onClick={() => set('bhk', b)} style={{ ...styles.chip, ...(form.bhk === b ? styles.chipActive : {}) }}>{b}</button>
          ))}
        </div>

        <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Kya kya kaam karvana hai? (select karein)</div>
        <div style={styles.checklistGrid}>
          {(itemOptions || DEFAULT_CATEGORIES).map((cat) => {
            const checked = form.items.includes(cat);
            return (
              <button key={cat} onClick={() => toggleItem(cat)} style={{ ...styles.checklistItem, ...(checked ? styles.checklistItemActive : {}) }}>
                <div style={{ ...styles.checkbox, ...(checked ? styles.checkboxActive : {}) }}>
                  {checked && <Check size={11} color='#FFF' />}
                </div>
                <span>{cat}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={styles.fieldLabel}>Preferred date *</div>
            <input style={styles.input} type='date' value={form.preferredDate} onChange={(e) => set('preferredDate', e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.fieldLabel}>Preferred time</div>
            <input style={styles.input} type='time' value={form.preferredTime} onChange={(e) => set('preferredTime', e.target.value)} />
          </div>
        </div>

        <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Address *</div>
        <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder='Poora address - house/flat no, area, landmark, city' />

        {BUSINESS.branches.length > 1 && (
          <>
            <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Kaunsi branch se contact karein?</div>
            <div style={styles.chipRow}>
              {BUSINESS.branches.map((b) => (
                <button key={b.city} onClick={() => set('branch', b.city)} style={{ ...styles.chip, ...(form.branch === b.city ? styles.chipActive : {}) }}>{b.city}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Extra notes</div>
        <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder='Koi special instructions...' />

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={submit}><Send size={14} /> Send Request</button>
          {appt && <button style={styles.cancelBtn} onClick={() => setManualEdit(false)}>Cancel</button>}
        </div>
      </div>
    </div>
  );
}

/* ---- Additional visit requests: separate from the original
   job.appointment object entirely (never modifies it), so a customer
   can ask for another site visit once work is already underway (e.g.
   admin needs to come check a measurement, or customer wants to show
   something in person) without disturbing the original visit's own
   confirmed date/history. Each request is its own entry with its own
   status, so several can exist over the life of a project. ---- */
function AdditionalVisitsPanel({ job, onSave, showToast }) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const visits = job.additionalVisits || [];

  const requestVisit = () => {
    if (!reason.trim() || !preferredDate) { showToast('Reason aur date zaroori hai', true); return; }
    const entry = { id: uid(), reason: reason.trim(), preferredDate, preferredTime, status: 'requested', requestedAt: new Date().toISOString() };
    let next = { ...job, additionalVisits: [entry, ...visits] };
    next = logActivity(next, 'Customer ne naya visit request kiya: ' + entry.reason);
    onSave(next);
    setReason(''); setPreferredDate(''); setPreferredTime('');
    setShowForm(false);
    showToast('Visit request bhej di gayi');
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={styles.fieldLabel}>Aur Visit Chahiye?</div>
        {!showForm && (
          <button style={styles.linkBtn2} onClick={() => setShowForm(true)}>+ Naya Visit Request</button>
        )}
      </div>
      {showForm && (
        <div style={styles.formCard}>
          <textarea style={{ ...styles.input, minHeight: 50 }} placeholder='Kis liye visit chahiye...' value={reason} onChange={(e) => setReason(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={styles.input} type='date' value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} />
            <input style={styles.input} type='time' value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={requestVisit}>Bhejein</button>
            <button style={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}
      {visits.map((v) => (
        <div key={v.id} style={styles.extraWorkCard}>
          <div style={styles.itemDesc}>{v.reason}</div>
          <div style={styles.itemSub}>{formatDate(v.status === 'confirmed' ? v.confirmedDate : v.preferredDate)} {(v.status === 'confirmed' ? v.confirmedTime : v.preferredTime) && ('- ' + formatTime12h(v.status === 'confirmed' ? v.confirmedTime : v.preferredTime))}</div>
          <div style={{ ...styles.estimateStatusBanner, marginTop: 8, background: v.status === 'confirmed' ? '#E8F5E9' : '#FFF3E0', color: v.status === 'confirmed' ? '#2E7D32' : '#E65100' }}>
            {v.status === 'confirmed' ? <ThumbsUp size={14} /> : <AlertCircle size={14} />} {v.status === 'confirmed' ? 'Confirm ho gaya' : 'Admin confirm karega'}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Requirements: simplified single-step flow ---- */
const REQ_PRIORITY = { high: { label: 'Urgent', color: '#B5562E', bg: '#F7E3D8' }, normal: { label: 'Normal', color: '#A8975F', bg: '#F3EFE3' }, low: { label: 'Flexible', color: '#3D6B66', bg: '#E1EDEA' } };

/* ---- Project Notes: a shared running log both admin and customer can
   add to - free-form planning notes, with an optional photo attached to
   each entry (e.g. a customer photographing their existing space, or
   admin noting a measurement with a reference picture). Unlike
   requirements (structured: category + text) or extra work (needs
   approval), notes are just informal, timestamped, author-attributed
   entries - nothing here needs anyone's approval, it's a planning log,
   not a request. Used identically from both AdminJobDetail and the
   customer's Requirements tab. ---- */
function ProjectNotesPanel({ job, onSave, showToast, authorRole, authorName, categories }) {
  const [text, setText] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  const notes = job.projectNotes || [];
  const isAdmin = authorRole === 'admin';
  const [openFolder, setOpenFolder] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  // Note types (Color/Design/Reference/Handle/Measurement/Other) let a
  // note within an item's folder be labeled with WHAT KIND of detail it
  // is, not just free text - so once inside "Wardrobe A", it's
  // immediately clear which note is the color decision, which is the
  // design reference, which is a measurement, etc, instead of scanning
  // through a flat list of unlabeled entries to figure that out.
  const NOTE_TYPES = ['Design', 'Color', 'Reference Photo', 'Handle', 'Measurement', 'Other'];
  const [noteType, setNoteType] = useState(NOTE_TYPES[0]);

  // Item options come from THIS job's actual estimate line items (and
  // any approved extra work), not the generic app-wide furniture
  // categories - a note is almost always about a specific piece being
  // built for this customer ("Wardrobe A", "TV Unit"), so the picker
  // should offer exactly those, matching what's really in the estimate,
  // rather than a fixed business-wide list that may not even include
  // items this job has. Falls back to the general categories (and then
  // "General") only when the estimate is still empty - before there's
  // anything item-specific to tag a note against yet.
  const itemOptions = useMemo(() => {
    const fromItems = (job.items || []).map((it) => it.desc).filter(Boolean);
    const fromExtraWork = (job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).map((e) => e.desc).filter(Boolean);
    const combined = [...new Set([...fromItems, ...fromExtraWork])];
    if (combined.length > 0) return combined;
    return (categories && categories.length > 0) ? categories : ['General'];
  }, [job.items, job.extraWork, categories]);
  const [noteCategory, setNoteCategory] = useState(itemOptions[0]);

  const handleFilePicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Sirf image file select karein', true); return; }
    setUploading(true);
    try {
      const dataUri = await prepareImageForUpload(file);
      if (dataUriByteSize(dataUri) > MAX_PHOTO_BYTES) {
        showToast('Photo bahut badi hai, chhoti photo try karein', true);
        return;
      }
      setPendingPhoto(dataUri);
    } catch (err) {
      showToast('Photo process nahi ho payi', true);
    } finally {
      setUploading(false);
    }
  };

  const addNote = async () => {
    if (!text.trim() && !pendingPhoto) return;
    const entry = {
      id: uid(),
      text: text.trim(),
      photo: null,
      category: noteCategory,
      noteType,
      locked: false,
      addedBy: authorRole,
      authorName,
      createdAt: new Date().toISOString(),
    };
    // The photo (if any) is uploaded to Firebase Storage FIRST, and the
    // note only ever carries the resulting (short) download URL - never
    // the raw base64 data inline. All jobs share a single Firestore
    // document (see persistJobs), so embedding a photo's full data URI
    // directly inside a note would duplicate potentially hundreds of KB
    // into that shared document; a real Storage URL is a tiny string by
    // comparison, so this stays completely safe even with many
    // photo-attached notes.
    if (pendingPhoto) {
      const uploaded = await window.fileStorage.upload('note_' + entry.id, pendingPhoto);
      if (uploaded && !uploaded.error) {
        entry.photo = { url: uploaded.url, origUrl: null };
      } else {
        showToast('Photo save nahi ho payi: ' + (uploaded?.error || 'unknown error') + ' - sirf text save ho raha hai', true);
      }
    }
    // Awaiting onSave (and only announcing success once it genuinely
    // resolves true) is what fixes notes "sometimes not adding,
    // sometimes not showing" - previously this fired the success toast
    // and cleared the form immediately, before the actual save had even
    // finished, so a failed save (flaky connection, etc.) still looked
    // like it worked until a later background refresh replaced local
    // state with the real (note-less) server data.
    let nextJob = { ...job, projectNotes: [entry, ...notes] };
    nextJob = logActivity(nextJob, noteType + ' note added for ' + noteCategory + (entry.text ? ': ' + entry.text.slice(0, 60) : ''));
    const ok = await onSave(nextJob);
    if (ok) {
      setText('');
      setPendingPhoto(null);
      showToast('Note add ho gaya');
    }
    // If it failed, the underlying save already showed its own
    // "Save failed" toast - the text/photo stay in the form so the
    // user can just tap Add again rather than having to retype
    // everything.
  };

  const removeNote = (id) => {
    onSave({ ...job, projectNotes: notes.filter((n) => n.id !== id) });
  };

  // Once admin approves a note (e.g. "final design confirmed" or "this
  // is the handle we're using"), it's locked - only admin can still
  // remove or otherwise touch it from that point on. This exists so a
  // finalized decision doesn't get accidentally deleted or contradicted
  // by a later note once work has already moved forward based on it;
  // the customer can still see it, just not modify it.
  const approveNote = async (id) => {
    const approvedNote = notes.find((n) => n.id === id);
    let nextJob = { ...job, projectNotes: notes.map((n) => (n.id === id ? { ...n, locked: true } : n)) };
    if (approvedNote) {
      nextJob = logActivity(nextJob, (approvedNote.category || 'Design') + ' final ho gaya: ' + (approvedNote.text || approvedNote.noteType));
    }
    const ok = await onSave(nextJob);
    if (ok) showToast('Note approve ho gaya, ab locked hai');
  };

  // Notes are grouped by category (item) like separate folders, so a
  // handle-reference photo and a wardrobe design photo never end up
  // visually mixed in one long list - each category gets its own
  // section header. Notes without a category (older data, or added
  // before this existed) fall under "General".
  const grouped = useMemo(() => {
    const byCategory = {};
    for (const n of notes) {
      const cat = n.category || 'General';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(n);
    }
    return byCategory;
  }, [notes]);
  const categoryOrder = Object.keys(grouped);

  return (
    <div>
      <div style={styles.fieldLabel}>Project Notes</div>
      <div style={styles.plainTextMuted}>Planning, measurements, ya reference photos yahan save karein - item wise organize hoga.</div>

      <div style={styles.formCard}>
        <div style={styles.hintText}>Kis item ke liye hai:</div>
        <div style={styles.chipRow}>
          {itemOptions.map((c) => (
            <button key={c} onClick={() => setNoteCategory(c)} style={{ ...styles.chip, ...(noteCategory === c ? styles.chipActive : {}) }}>{c}</button>
          ))}
        </div>
        <div style={{ ...styles.hintText, marginTop: 8 }}>Kya note karna hai:</div>
        <div style={styles.chipRow}>
          {NOTE_TYPES.map((t) => (
            <button key={t} onClick={() => setNoteType(t)} style={{ ...styles.chip, ...(noteType === t ? styles.chipActive : {}) }}>{t}</button>
          ))}
        </div>
        <textarea style={{ ...styles.input, minHeight: 60, marginTop: 8 }} placeholder='Note likhein...' value={text} onChange={(e) => setText(e.target.value)} />
        {pendingPhoto ? (
          <div style={{ ...styles.previewWrap, marginTop: 8 }}>
            <img src={pendingPhoto} alt='attachment preview' style={styles.previewImg} />
            <button style={styles.cardActionBtn} onClick={() => setPendingPhoto(null)}>Photo hataein</button>
          </div>
        ) : (
          <>
            <input ref={fileInputRef} type='file' accept='image/*' style={{ display: 'none' }} onChange={handleFilePicked} />
            <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
              <Camera size={13} /> {uploading ? 'Processing...' : 'Photo attach karein (optional)'}
            </button>
          </>
        )}
        <button style={styles.addBtn} onClick={addNote}><Plus size={14} /> Add note</button>
      </div>

      {notes.length === 0 && <div style={styles.emptySmall}>Abhi koi note nahi hai.</div>}
      {categoryOrder.map((cat) => {
        const isOpen = openFolder === cat;
        // Quick per-type counts shown on the closed folder summary (e.g.
        // "Design: 1, Color: 1") so admin/customer can see AT A GLANCE
        // what kinds of decisions are captured for this item without
        // opening it - then tapping the folder expands to the full
        // breakdown, grouped by type, rather than one long flat list.
        const typeCounts = {};
        for (const n of grouped[cat]) {
          const t = n.noteType || 'Other';
          typeCounts[t] = (typeCounts[t] || 0) + 1;
        }
        const notesByType = {};
        for (const n of grouped[cat]) {
          const t = n.noteType || 'Other';
          if (!notesByType[t]) notesByType[t] = [];
          notesByType[t].push(n);
        }
        return (
          <div key={cat} style={{ marginTop: 14 }}>
            <button
              style={{ ...styles.folderHeader, width: '100%', border: 'none', cursor: 'pointer', justifyContent: 'space-between' }}
              onClick={() => setOpenFolder(isOpen ? null : cat)}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ImageIcon size={13} /> {cat} ({grouped[cat].length})</span>
              {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {!isOpen && (
              <div style={styles.plainTextMuted}>{Object.entries(typeCounts).map(([t, c]) => t + ': ' + c).join(' - ')}</div>
            )}
            {isOpen && Object.keys(notesByType).map((noteTypeKey) => (
              <div key={noteTypeKey} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.gold, marginLeft: 4, marginBottom: 4 }}>{noteTypeKey}</div>
                {notesByType[noteTypeKey].map((n) => (
                  <div key={n.id} style={styles.extraWorkCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={styles.itemSub}>{n.authorName || (n.addedBy === 'admin' ? 'Admin' : 'Customer')} - {formatDate(n.createdAt)}</div>
                      {(!n.locked || isAdmin) && (
                        <button style={styles.iconBtnSmall} onClick={() => removeNote(n.id)}><Trash2 size={13} color='#C7CCDC' /></button>
                      )}
                    </div>
                    {n.text && <div style={{ ...styles.itemDesc, marginTop: 4 }}>{n.text}</div>}
                    {n.photo && (
                      <button
                        style={{ border: 'none', padding: 0, background: 'none', cursor: 'pointer', width: '100%', display: 'block', marginTop: 8 }}
                        onClick={() => setLightbox({ photos: [{ id: n.id, url: n.photo.url, origUrl: n.photo.origUrl, caption: n.text }], index: 0 })}
                      >
                        <SmartImg src={n.photo.url} origUrl={n.photo.origUrl} alt='note attachment' style={{ ...styles.reqThumb, width: '100%', height: 140 }} />
                      </button>
                    )}
                    {n.locked ? (
                      <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 8 }}>
                        <ThumbsUp size={14} /> Approved - sirf admin change kar sakta hai
                      </div>
                    ) : (
                      isAdmin && (
                        <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={() => approveNote(n.id)}><ThumbsUp size={12} /> Approve &amp; Lock</button>
                      )
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
      {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
    </div>
  );
}

// Standalone Instant Estimate Calculator - its own dedicated screen
// rather than a collapsible section tucked inside Requirements, since
// mixing "give me a quick ballpark price" with "let me write out my
// detailed requirements" in one place made the quick-estimate path
// harder to find and more cluttered than it needed to be. Reached
// directly from Home's own "Instant Estimate" tile - a customer who
// just wants a number doesn't have to wade through the requirements
// form to get to it. Purely a local session tool - a rough total based
// on the customer's own measurements/quantities and admin's configured
// rate types, using the rates admin sets in Settings; nothing here
// gets saved anywhere or sent to admin, unlike Requirements.
function InstantEstimateCalculator({ estimateRates, showToast, onBack }) {
  const [calcItems, setCalcItems] = useState([]);
  const [calcLength, setCalcLength] = useState('');
  const [calcHeight, setCalcHeight] = useState('');
  const [calcQty, setCalcQty] = useState('1');
  const rates = (estimateRates && estimateRates.length > 0) ? estimateRates : [{ id: 'r1', name: 'Laminate', rate: '1000', unit: 'sqft' }, { id: 'r2', name: 'Without Laminate', rate: '700', unit: 'sqft' }];
  const [calcRateId, setCalcRateId] = useState(rates[0]?.id);
  const calcSelectedRate = rates.find((r) => r.id === calcRateId);
  const calcIsPieceType = calcSelectedRate?.unit === 'piece';

  const calcItemAmount = (it) => {
    const rateEntry = rates.find((r) => r.id === it.rateId);
    if (!rateEntry) return 0;
    if (rateEntry.unit === 'piece') {
      return Math.round(Number(it.qty || 0) * Number(rateEntry.rate));
    }
    const sqft = (Number(it.length) * Number(it.height)) / 144;
    return Math.round(sqft * Number(rateEntry.rate));
  };
  const calcTotal = calcItems.reduce((s, it) => s + calcItemAmount(it), 0);

  const addCalcItem = () => {
    if (calcIsPieceType) {
      if (!calcQty || Number(calcQty) <= 0) { showToast('Quantity bharein', true); return; }
      setCalcItems((prev) => [...prev, { id: uid(), qty: calcQty, rateId: calcRateId }]);
      setCalcQty('1');
    } else {
      if (!calcLength || !calcHeight) { showToast('Length aur Height dono bharein', true); return; }
      setCalcItems((prev) => [...prev, { id: uid(), length: calcLength, height: calcHeight, rateId: calcRateId }]);
      setCalcLength(''); setCalcHeight('');
    }
  };
  const removeCalcItem = (id) => setCalcItems((prev) => prev.filter((it) => it.id !== id));

  return (
    <div style={{ padding: '12px 16px' }}>
      {onBack && <button style={styles.backLink} onClick={onBack}><ArrowLeft size={13} /> Home</button>}
      <div style={{ ...styles.sectionTitle, marginTop: onBack ? 10 : 0 }}>Instant Estimate Calculator</div>
      <div style={styles.plainTextMuted}>Apni measurements daal ke turant approx price dekhein. Ye ek approx estimate hai, final estimate admin banayenge site visit ke baad.</div>

      <div style={{ ...styles.formCard, marginTop: 14 }}>
        <div style={styles.hintText}>Item (rate ke saath)</div>
        <div style={styles.chipRow}>
          {rates.map((r) => (
            <button key={r.id} onClick={() => setCalcRateId(r.id)} style={{ ...styles.chip, ...(calcRateId === r.id ? styles.chipActive : {}) }}>
              {r.name} ({r.unit === 'piece' ? ('₹' + r.rate + '/piece') : ('₹' + r.rate + '/sqft')})
            </button>
          ))}
        </div>
        {calcIsPieceType ? (
          <input style={{ ...styles.input, marginTop: 8 }} inputMode='numeric' placeholder='Kitne piece (nang)' value={calcQty} onChange={(e) => setCalcQty(e.target.value)} />
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={styles.input} inputMode='decimal' placeholder='Length (inch)' value={calcLength} onChange={(e) => setCalcLength(e.target.value)} />
            <input style={styles.input} inputMode='decimal' placeholder='Height (inch)' value={calcHeight} onChange={(e) => setCalcHeight(e.target.value)} />
          </div>
        )}
        <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={addCalcItem}><Plus size={14} /> Item Add Karein</button>

        {calcItems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {calcItems.map((it) => (
              <div key={it.id} style={styles.itemRow}>
                <div style={{ flex: 1 }}>
                  <div style={styles.itemDesc}>{rates.find((r) => r.id === it.rateId)?.name || '-'}</div>
                  <div style={styles.itemSub}>{it.qty ? (it.qty + ' piece') : (it.length + '" x ' + it.height + '" (' + ((Number(it.length) * Number(it.height)) / 144).toFixed(1) + ' sqft)')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={styles.itemDesc}>{currency(calcItemAmount(it))}</div>
                  <button style={styles.iconBtnSmall} onClick={() => removeCalcItem(it.id)}><Trash2 size={13} color='#C7CCDC' /></button>
                </div>
              </div>
            ))}
            <div style={styles.totalBar}><span>Approx Total</span><span style={styles.totalAmt}>{currency(calcTotal)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function RequirementsPanel({ job, onSave, showToast, categories, customer, gallery }) {
  const [category, setCategory] = useState(categories[0]);
  const [text, setText] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [priority, setPriority] = useState('normal');
  const [showForm, setShowForm] = useState((job.requirements || []).length === 0);
  const [lightbox, setLightbox] = useState(null);
  const savedDesigns = job.savedDesigns || [];
  // A photo the customer uploads directly from their own phone (not
  // from the gallery) - e.g. a photo of a design they saw elsewhere,
  // or a specific corner/wall they want matched - attached to the
  // requirement being added, separate from photoRef (which always
  // means "a reference to an existing gallery photo by id").
  const [ownPhotoDataUri, setOwnPhotoDataUri] = useState(null);
  const [uploadingOwnPhoto, setUploadingOwnPhoto] = useState(false);
  const ownPhotoInputRef = React.useRef(null);
  const handleOwnPhotoPicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Sirf image file select karein', true); return; }
    setUploadingOwnPhoto(true);
    try {
      const dataUri = await fileToDataUri(file);
      setOwnPhotoDataUri(dataUri);
    } catch (e) {
      showToast('Photo load nahi ho payi', true);
    } finally {
      setUploadingOwnPhoto(false);
    }
  };

  // Instant estimate calculator: a customer-side, self-service rough
  // total based on their own measurements/quantities and which rate
  // type applies (Framing, Box, Basket, Drawer, TV Cabinet, Partition,
  // etc. - admin's own configured list, not just a fixed
  // laminate/without-laminate split), using the rates admin sets in
  // Settings - separate from the actual estimate (which admin still
  // builds by hand, per real item, once they've visited/reviewed the
  // project). This just gives an early ballpark before that happens.

  // photoRef only stores a photoId (see FavoritesButton's addToProject
  // for why - the image itself already lives in the gallery's own
  // storage, so this just looks it up live rather than duplicating it).
  const resolveGalleryPhoto = (photoId) => {
    for (const cat of Object.keys(gallery || {})) {
      const found = (gallery[cat] || []).find((p) => p.id === photoId);
      if (found) return found;
    }
    return null;
  };

  const add = async (photoRef) => {
    if (!photoRef && !text.trim() && !ownPhotoDataUri) return;
    let ownPhoto = null;
    if (ownPhotoDataUri) {
      // Uploaded to Firebase Storage right here (same as gallery/
      // progress photos) rather than storing the raw data: URI inline -
      // requirements live inside the single, shared 'jobs' Firestore
      // document, so a base64 photo embedded directly there would blow
      // well past Firestore's 1MiB document cap after a few uploads.
      try {
        const uploaded = await window.fileStorage.upload('requirement_' + uid(), ownPhotoDataUri);
        if (uploaded && !uploaded.error) {
          ownPhoto = { url: uploaded.url, origUrl: null };
        } else {
          showToast('Photo upload nahi ho payi, dobara try karein', true);
          return;
        }
      } catch (e) {
        showToast('Photo upload nahi ho payi, dobara try karein', true);
        return;
      }
    }
    const req = {
      id: uid(),
      category,
      text: photoRef ? ('Saved design reference' + (photoRef.caption ? ': ' + photoRef.caption : '')) : (text.trim() || (ownPhoto ? 'Reference photo' : '')),
      dimensions: dimensions.trim(),
      priority,
      // photoRef here is a savedDesigns entry ({photoId, caption}), not
      // a photo object - only the photoId reference is kept, resolved
      // to the actual image via the live gallery at display time (see
      // resolveGalleryPhoto above), for the same reason FavoritesButton
      // does the same thing: avoids duplicating image data inline into
      // the shared 'jobs' document.
      photoRef: photoRef ? { photoId: photoRef.photoId } : null,
      // ownPhoto (unlike photoRef) is a photo the customer uploaded
      // fresh from their own device rather than one that already
      // exists in the gallery - it genuinely has no gallery entry to
      // reference, so its Storage url is kept directly on the
      // requirement itself instead.
      ownPhoto,
      createdAt: new Date().toISOString(),
    };
    let next = { ...job, requirements: [req, ...(job.requirements || [])] };
    next = logActivity(next, 'Requirement added: ' + category + (photoRef ? ' (saved design)' : (ownPhoto ? ' (photo attached)' : '')));
    const ok = await onSave(next);
    if (ok) {
      setText(''); setDimensions(''); setPriority('normal'); setOwnPhotoDataUri(null);
      setShowForm(false);
      showToast('Requirement added');
    }
  };
  const removeSavedDesign = (photoId) => {
    onSave({ ...job, savedDesigns: savedDesigns.filter((d) => d.photoId !== photoId) });
  };
  const remove = (id) => onSave({ ...job, requirements: (job.requirements || []).filter((r) => r.id !== id) });

  // group existing requirements by category for a cleaner professional view
  const grouped = useMemo(() => {
    const g = {};
    (job.requirements || []).forEach((r) => {
      if (!g[r.category]) g[r.category] = [];
      g[r.category].push(r);
    });
    return g;
  }, [job.requirements]);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={styles.sectionTitle}>Aapki Requirements</div>
          <div style={styles.plainTextMuted}>Furniture mein kya banana hai, detail mein batayein</div>
        </div>
        {!showForm && (
          <button style={styles.roundAddBtn} onClick={() => setShowForm(true)}><Plus size={18} color='#FFF' /></button>
        )}
      </div>


      {showForm && (
        <div style={styles.formCard}>
          <div style={styles.fieldLabel}>Category select karein</div>
          <div style={styles.chipRow}>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} style={{ ...styles.chip, ...(category === c ? styles.chipActive : {}) }}>{c}</button>
            ))}
          </div>
          <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Kya chahiye, likhein</div>
          <textarea
            style={{ ...styles.input, minHeight: 90, resize: 'vertical' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='e.g. Modular kitchen, 3 shutters, white finish, soft-close hinges...'
            autoFocus
          />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Size / Dimensions (agar pata ho)</div>
          <input
            style={styles.input}
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder='e.g. 10ft x 8ft, ya room ka naap'
          />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Reference Photo (optional)</div>
          <div style={styles.plainTextMuted}>Apne phone se koi photo daal sakte hain - jaisa design chahiye.</div>
          {ownPhotoDataUri ? (
            <div style={{ position: 'relative', marginTop: 8, width: 90, height: 90 }}>
              <img src={ownPhotoDataUri} alt='Reference' style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
              <button style={{ ...styles.photoDeleteBtn, top: -6, right: -6 }} onClick={() => setOwnPhotoDataUri(null)}><X size={12} color='#FFF' /></button>
            </div>
          ) : (
            <>
              <input ref={ownPhotoInputRef} type='file' accept='image/*' style={{ display: 'none' }} onChange={handleOwnPhotoPicked} />
              <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={() => ownPhotoInputRef.current && ownPhotoInputRef.current.click()} disabled={uploadingOwnPhoto}>
                <Camera size={14} /> {uploadingOwnPhoto ? 'Load ho raha hai...' : 'Photo Add Karein'}
              </button>
            </>
          )}
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Priority</div>
          <div style={styles.chipRow}>
            {Object.entries(REQ_PRIORITY).map(([k, v]) => (
              <button key={k} onClick={() => setPriority(k)} style={{ ...styles.chip, ...(priority === k ? { background: v.color, color: '#FFF', borderColor: v.color } : {}) }}>{v.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => add()}><Plus size={14} /> Add</button>
            {(job.requirements || []).length > 0 && (
              <button style={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
            )}
          </div>
        </div>
      )}

      {savedDesigns.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={styles.fieldLabel}>Aapke saved designs ({savedDesigns.length})</div>
          <div style={styles.plainTextMuted}>Gallery se save kiye gaye designs - project mein add karein.</div>
          <div style={styles.savedDesignGrid}>
            {savedDesigns.map((d) => {
              const resolved = resolveGalleryPhoto(d.photoId);
              if (!resolved) return null; // photo was removed from the gallery since being favorited
              return (
                <div key={d.photoId} style={styles.savedDesignCard}>
                  <SmartImg src={resolved.url} origUrl={resolved.origUrl} alt={d.caption} style={styles.savedDesignImg} />
                  <div style={styles.savedDesignActions}>
                    <button style={styles.savedDesignAddBtn} onClick={() => add(d)}>Add to Project</button>
                    <button style={styles.savedDesignRemoveBtn} onClick={() => removeSavedDesign(d.photoId)}><X size={12} color='#FFF' /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ ...styles.fieldLabel, marginTop: 20 }}>Your list ({(job.requirements || []).length})</div>
      {(job.requirements || []).length === 0 && !showForm && <div style={styles.emptySmall}>Abhi koi requirement add nahi ki.</div>}
      {Object.entries(grouped).map(([cat, reqs]) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div style={styles.reqGroupHeader}>{cat} <span style={styles.reqGroupCount}>({reqs.length})</span></div>
          {reqs.map((r) => (
            <div key={r.id} style={styles.reqRow}>
              {r.photoRef && resolveGalleryPhoto(r.photoRef.photoId) && (
                <button style={{ ...styles.reqThumb, border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setLightbox({ photos: [resolveGalleryPhoto(r.photoRef.photoId)], index: 0 })}>
                  <SmartImg src={resolveGalleryPhoto(r.photoRef.photoId).url} origUrl={resolveGalleryPhoto(r.photoRef.photoId).origUrl} alt={r.text} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              )}
              {r.ownPhoto && (
                <button style={{ ...styles.reqThumb, border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setLightbox({ photos: [{ id: r.id, url: r.ownPhoto.url, origUrl: r.ownPhoto.origUrl, caption: r.text }], index: 0 })}>
                  <SmartImg src={r.ownPhoto.url} origUrl={r.ownPhoto.origUrl} alt={r.text} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              )}
              <div style={{ flex: 1 }}>
                <div style={styles.reqText}>{r.text}</div>
                <div style={styles.reqMetaRow}>
                  {r.dimensions && <span style={styles.reqDim}>{r.dimensions}</span>}
                  {r.priority && r.priority !== 'normal' && (
                    <span style={{ ...styles.reqPriorityTag, color: REQ_PRIORITY[r.priority].color, background: REQ_PRIORITY[r.priority].bg }}>{REQ_PRIORITY[r.priority].label}</span>
                  )}
                  <span style={styles.itemSub}>{formatDate(r.createdAt)}</span>
                </div>
              </div>
              <button style={styles.iconBtnSmall} onClick={() => remove(r.id)}><Trash2 size={14} color='#C7CCDC' /></button>
            </div>
          ))}
        </div>
      ))}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${BRAND.line}` }}>
        <ProjectNotesPanel job={job} onSave={onSave} showToast={showToast} authorRole='customer' authorName={customer?.name || 'Customer'} categories={categories} />
      </div>

      {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} job={job} onSaveDesign={onSave} showToast={showToast} />}
    </div>
  );
}

/* ---- Progress view ---- */
/* ---- Customer-facing estimate view: pulled out of ProgressView into its
   own component so it can be reached two ways - as its own bottom-nav
   tab (quick, direct access) and inline within Progress (where it sits
   right after the status stages). Both call sites render the identical
   estimate table, approval buttons, and status banner - one component,
   not two copies that could drift apart. ---- */
function EstimateView({ job, onSave, showToast }) {
  const total = jobTotal(job);
  const paid = jobPaid(job);
  const due = jobDue(job);
  const [showQuote, setShowQuote] = useState(false);
  const [changeRequestText, setChangeRequestText] = useState('');
  const [showChangeRequestBox, setShowChangeRequestBox] = useState(false);
  const estimateStatus = job.estimateStatus || null;
  const estimateDrafts = job.estimateDrafts || [];
  const draftTotal = (d) => (d.items || []).reduce((s, it) => s + estimateItemAmount(it), 0);

  // Customer picking one of admin's material options (e.g. Laminate vs
  // Without Laminate) turns that draft into the job's real estimate -
  // copying its items/material straight into the normal fields the rest
  // of the app already reads (jobTotal, EstimateView's own table below,
  // payment milestones, PDF/WhatsApp). The other drafts are discarded
  // (estimateDrafts cleared) once one is chosen, since only one estimate
  // can be active per job - keeping a stale comparison around after the
  // decision is made would just be confusing leftover state.
  const chooseDraft = (d) => {
    let next = {
      ...job,
      items: d.items,
      materialCompany: d.materialCompany || '',
      sheetWeightKg: d.sheetWeightKg || '',
      estimateDrafts: [],
    };
    next = logActivity(next, 'Customer ne "' + d.label + '" option choose kiya - final estimate ban gaya');
    onSave(next);
    showToast(d.label + ' option select ho gaya');
  };

  const respondToEstimate = (status, note) => {
    let next = { ...job, estimateStatus: status, estimateResponseNote: note || null, estimateRespondedAt: new Date().toISOString() };
    const activityText = status === 'approved'
      ? 'Customer ne estimate approve kiya - kaam shuru karein'
      : status === 'change_requested'
        ? 'Customer ne estimate mein change maanga: ' + (note || '')
        : 'Customer ne estimate cancel kiya';
    next = logActivity(next, activityText);
    onSave(next);
    setShowChangeRequestBox(false);
    setChangeRequestText('');
    showToast(
      status === 'approved' ? 'Estimate approve ho gaya' :
      status === 'change_requested' ? 'Change request bhej di gayi' :
      'Estimate cancel ho gaya'
    );
  };

  return (
    <>
      {(job.items || []).length === 0 && estimateDrafts.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={styles.sectionTitle}>Material Options Compare Karein</div>
          <div style={styles.plainTextMuted}>Jo aapke budget mein aaye, wo option choose karein - wahi aapka final estimate ban jayega.</div>
          {estimateDrafts.map((d) => (
            <div key={d.id} style={styles.reviewCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={styles.cardName}>{d.label}</div>
                <span style={styles.itemAmount}>{currency(draftTotal(d))}</span>
              </div>
              {(d.materialCompany || d.sheetWeightKg) && (
                <div style={styles.itemSub}>{[d.materialCompany, d.sheetWeightKg && (d.sheetWeightKg + ' kg')].filter(Boolean).join(' - ')}</div>
              )}
              <div style={styles.itemSub}>{d.items.length} item{d.items.length !== 1 ? 's' : ''}</div>
              <button style={{ ...styles.primaryBtn2, marginTop: 8 }} onClick={() => chooseDraft(d)}><Check size={14} /> Ye Option Choose Karein</button>
            </div>
          ))}
        </div>
      )}

      {Number(job.discount) > 0 && (
        <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 10 }}>
          <ThumbsUp size={14} /> {currency(job.discount)} discount mila hai is estimate par.
        </div>
      )}
      {total > 0 && (
        <div style={{ ...styles.payStrip, marginTop: 10 }}>
          <MoneyBit label='Total' value={currency(total)} />
          <MoneyBit label='Paid' value={currency(paid)} muted />
          <MoneyBit label='Due' value={currency(due)} highlight={due > 0} />
        </div>
      )}

      {(job.payments || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.fieldLabel}>Payment History</div>
          {job.payments.map((p) => (
            <div key={p.id} style={styles.itemRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.itemDesc}>{currency(p.amount)}</div>
                <div style={styles.itemSub}>{formatDate(p.date)}</div>
              </div>
              <button style={styles.cardActionBtn} onClick={() => generateReceiptPdf(job, p, showToast)}><FileText size={13} /> Receipt</button>
            </div>
          ))}
        </div>
      )}

      {((job.items || []).length > 0 || (job.extraWork || []).some((e) => e.status === 'approved' && !e.mergedIntoEstimate)) && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={styles.sectionTitle}>Estimate Details</div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#25D366', color: '#FFF', border: 'none', borderRadius: 20, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }} onClick={() => { setShowQuote(true); setTimeout(() => shareEstimatePdf(job, 'quotation-print-area', showToast), 350); }}><Send size={12} /> PDF WhatsApp</button>
          </div>
          {(job.materialCompany || job.sheetWeightKg) && (
            <div style={styles.plainTextMuted}>
              Material: {job.materialCompany}{job.materialCompany && job.sheetWeightKg && ' - '}{job.sheetWeightKg && (job.sheetWeightKg + ' kg')}
            </div>
          )}
          <div style={styles.quoteTableWrap}>
            <table style={styles.quoteTable}>
              <thead>
                <tr>
                  <th style={styles.qth}>Sr No</th>
                  <th style={{ ...styles.qth, textAlign: 'left' }}>Item &amp; Description</th>
                  <th style={styles.qth}>Length</th>
                  <th style={styles.qth}>Height</th>
                  <th style={styles.qth}>Sq Feet</th>
                  <th style={styles.qth}>Rate</th>
                  <th style={styles.qth}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(job.items || []).map((it, i) => {
                  const sqft = estimateItemSqft(it);
                  return (
                    <tr key={it.id}>
                      <td style={styles.qtd}>{i + 1}</td>
                      <td style={{ ...styles.qtd, textAlign: 'left' }}>{it.desc}</td>
                      <td style={styles.qtd}>{sqft !== null ? it.length : '-'}</td>
                      <td style={styles.qtd}>{sqft !== null ? it.height : '-'}</td>
                      <td style={styles.qtd}>{sqft !== null ? sqft.toFixed(2) : (it.qty || 1)}</td>
                      <td style={styles.qtd}>{currency(it.rate)}</td>
                      <td style={{ ...styles.qtd, fontWeight: 800 }}>{currency(estimateItemAmount(it))}</td>
                    </tr>
                  );
                })}
                {(job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).map((e, i) => (
                  <tr key={e.id} style={{ background: '#FBF6EC' }}>
                    <td style={styles.qtd}>{(job.items || []).length + i + 1}</td>
                    <td style={{ ...styles.qtd, textAlign: 'left' }}>{e.desc} <span style={styles.reqCatBadge}>Extra Work</span></td>
                    <td style={styles.qtd}>-</td>
                    <td style={styles.qtd}>-</td>
                    <td style={styles.qtd}>-</td>
                    <td style={styles.qtd}>-</td>
                    <td style={{ ...styles.qtd, fontWeight: 800 }}>{currency(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={styles.quoteTotalRow}>
            <span>Grand Total</span>
            <span style={styles.quoteTotalAmt}>{currency(total)}</span>
          </div>
          <button style={{ ...styles.viewQuoteBtn, marginTop: 12 }} onClick={() => setShowQuote(true)}>
            <FileText size={14} /> View Full Quotation (Terms &amp; Conditions)
          </button>

          {estimateStatus === 'approved' && (
            <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32' }}>
              <ThumbsUp size={15} /> Aapne ye estimate approve kar diya hai - kaam shuru ho jayega.
            </div>
          )}
          {estimateStatus === 'change_requested' && (
            <div style={{ ...styles.estimateStatusBanner, background: '#FFF3E0', color: '#E65100' }}>
              <MessageSquare size={15} /> Aapka change request bheja gaya hai - hum jald contact karenge.
              {job.estimateResponseNote && <div style={{ marginTop: 4, fontWeight: 600 }}>"{job.estimateResponseNote}"</div>}
            </div>
          )}
          {estimateStatus === 'cancelled' && (
            <div style={{ ...styles.estimateStatusBanner, background: '#FFEBEE', color: '#C62828' }}>
              <XCircle size={15} /> Aapne ye estimate cancel kar diya hai.
            </div>
          )}

          {(!estimateStatus || estimateStatus === 'change_requested') && !showChangeRequestBox && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button style={{ ...styles.primaryBtn2, flex: 1, minWidth: 140, marginTop: 0 }} onClick={() => respondToEstimate('approved')}>
                <ThumbsUp size={14} /> Approve - Kaam Shuru Karein
              </button>
              <button style={{ ...styles.cancelBtn, flex: 1, minWidth: 140 }} onClick={() => setShowChangeRequestBox(true)}>
                <MessageSquare size={14} /> Change Chahiye
              </button>
              <button style={{ ...styles.cancelBtn, background: '#FFEBEE', color: '#C62828', flex: 1, minWidth: 140 }} onClick={() => respondToEstimate('cancelled')}>
                <XCircle size={14} /> Cancel Karein
              </button>
            </div>
          )}
          {showChangeRequestBox && (
            <div style={{ marginTop: 12 }}>
              <textarea
                style={{ ...styles.input, minHeight: 70 }}
                placeholder='Kya change chahiye, likhein...'
                value={changeRequestText}
                onChange={(e) => setChangeRequestText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => respondToEstimate('change_requested', changeRequestText)}>
                  Bhejein
                </button>
                <button style={styles.cancelBtn} onClick={() => setShowChangeRequestBox(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      {showQuote && <QuotationPreview job={job} onClose={() => setShowQuote(false)} showToast={showToast} />}
    </>
  );
}

function ComplaintStageStepper({ status }) {
  const curIdx = COMPLAINT_STAGE_ORDER.indexOf(status);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 8 }}>
      {COMPLAINT_STAGE_ORDER.map((s, i) => {
        const stage = COMPLAINT_STAGES[s];
        const done = i <= curIdx;
        const Icon = stage.icon;
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ flex: 1, height: 2, background: done ? stage.color : '#E4E7EE', marginTop: 10 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 64 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: done ? stage.color : '#E4E7EE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={11} color={done ? '#FFF' : '#B3B8C6'} />
              </div>
              <span style={{ fontSize: 8.5, fontWeight: done ? 800 : 600, color: done ? stage.color : '#B3B8C6', textAlign: 'center' }}>{stage.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ProgressView({ job, onSave, showToast, customer, categories, pushNotification }) {
  const [lightbox, setLightbox] = useState(null);
  const photos = job.progressPhotos || [];

  // Post-delivery complaint tracking - a customer reporting a problem
  // after the work is marked delivered needs its own, separate trail
  // from ordinary project notes/activity: it has a clear open/resolved
  // status admin can act on, rather than just being one more line in
  // an activity feed that's easy to lose track of once other updates
  // pile on top of it.
  const complaints = job.complaints || [];
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [complaintText, setComplaintText] = useState('');
  const addComplaint = async () => {
    if (!complaintText.trim()) { showToast('Problem ka detail likhein', true); return; }
    const entry = { id: uid(), text: complaintText.trim(), status: 'open', createdAt: new Date().toISOString() };
    let next = { ...job, complaints: [entry, ...complaints] };
    next = logActivity(next, 'Complaint reported: ' + entry.text);
    const ok = await onSave(next);
    if (ok) {
      setComplaintText('');
      setShowComplaintForm(false);
      showToast('Complaint darj ho gayi, admin ko bata diya gaya hai');
      if (pushNotification) pushNotification('complaint_reported', (customer?.name || job.customerName) + ' ne ek problem report ki hai', job.id);
    }
  };

  // Extra work: mid-project additions not in the original estimate.
  // Customer-initiated requests carry no price (admin sets it), so they
  // start in 'pending_admin_price'; once priced, or when admin adds one
  // directly with an amount already set, it moves to
  // 'pending_customer_approval' - the customer must explicitly approve
  // before it's treated as agreed extra cost, same principle as the
  // main estimate approval flow above.
  const [showExtraWorkForm, setShowExtraWorkForm] = useState(false);
  const [extraWorkDesc, setExtraWorkDesc] = useState('');
  const extraWork = job.extraWork || [];

  const requestExtraWork = () => {
    if (!extraWorkDesc.trim()) return;
    const entry = { id: uid(), desc: extraWorkDesc.trim(), amount: null, addedBy: 'customer', status: 'pending_admin_price', createdAt: new Date().toISOString() };
    let next = { ...job, extraWork: [entry, ...extraWork] };
    next = logActivity(next, 'Customer ne extra kaam request kiya: ' + entry.desc);
    onSave(next);
    setExtraWorkDesc('');
    setShowExtraWorkForm(false);
    showToast('Extra kaam request bhej di gayi - admin price set karega');
  };

  const respondToExtraWork = (item, approve) => {
    let next = { ...job, extraWork: extraWork.map((e) => (e.id === item.id ? { ...e, status: approve ? 'approved' : 'rejected', respondedAt: new Date().toISOString() } : e)) };
    // Approving extra work raises jobTotal (see jobTotal's own comment),
    // which can leave a job that was already marked 'paid' owing money
    // again - status is a plain stored field, not derived, so without
    // this check it would keep reading "Paid" while jobDue() is actually
    // positive. Stepping it back to 'delivered' (rather than clearing it
    // further) reflects that the work itself is still complete - only
    // the payment total changed - and lets the existing 'paid' auto-set
    // in addPayment naturally re-apply once the new balance is settled.
    if (approve && next.status === 'paid' && jobDue(next) > 0) {
      next = { ...next, status: 'delivered' };
    }
    onSave(logActivity(next, 'Customer ne extra kaam ' + (approve ? 'approve' : 'reject') + ' kiya: ' + item.desc));
    showToast(approve ? 'Extra kaam approve ho gaya' : 'Extra kaam reject kar diya gaya');
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Work Progress</div>
      <div style={styles.stageGridRead}>
        {STATUS_ORDER.map((s) => {
          const idx = STATUS_ORDER.indexOf(s);
          const curIdx = STATUS_ORDER.indexOf(job.status);
          const done = idx <= curIdx;
          const Icon = STATUS[s].icon;
          return (
            <div key={s} style={{ ...styles.progressStep, opacity: done ? 1 : 0.45 }}>
              <div style={{ ...styles.progressDot, background: done ? STATUS[s].color : '#D7DAE5' }}>
                <Icon size={12} color='#FFF' />
              </div>
              <span style={{ fontWeight: done ? 800 : 600 }}>{STATUS[s].label}</span>
              {done && idx === curIdx && <span style={styles.currentTag}>current</span>}
            </div>
          );
        })}
      </div>

      {(job.workPercent || 0) > 0 && (
        <div style={styles.deliveryDateBanner}>
          <Hammer size={15} color={BRAND.gold} />
          <span>Kaam <b>{job.workPercent}%</b> complete ho gaya hai</span>
        </div>
      )}

      {(job.status === 'delivered' || job.status === 'paid') && (
        <button style={{ ...styles.addBtn, marginTop: 12 }} onClick={() => generateWarrantyCertificate(job, showToast)}><FileText size={14} /> Warranty Certificate Download Karein</button>
      )}

      {job.status === 'delivered' && (
        <div style={{ ...styles.formCard, marginTop: 12 }}>
          <div style={styles.fieldLabel}>Koi Problem Hai?</div>
          <div style={styles.plainTextMuted}>Delivery ke baad kuch theek nahi lag raha to yahan batayein.</div>
          {complaints.map((c) => (
            <div key={c.id} style={{ ...styles.formCard, marginTop: 8, padding: 10 }}>
              <div style={styles.itemDesc}>{c.text}</div>
              <div style={styles.itemSub}>{formatDate(c.createdAt)}</div>
              <ComplaintStageStepper status={c.status} />
              {c.resolutionNote && (
                <div style={{ ...styles.plainTextMuted, marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + BRAND.line }}>
                  <b>Admin:</b> {c.resolutionNote}
                </div>
              )}
            </div>
          ))}
          {showComplaintForm ? (
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...styles.input, minHeight: 70, resize: 'vertical' }} placeholder='Kya problem hai, detail mein likhein...' value={complaintText} onChange={(e) => setComplaintText(e.target.value)} autoFocus />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={addComplaint}>Report Karein</button>
                <button style={styles.cancelBtn} onClick={() => { setShowComplaintForm(false); setComplaintText(''); }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={() => setShowComplaintForm(true)}><Plus size={14} /> Problem Report Karein</button>
          )}
        </div>
      )}

      <EstimateView job={job} onSave={onSave} showToast={showToast} />

      {(job.status === 'in_progress' || job.status === 'delivered' || (job.projectNotes || []).length > 0) && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid ' + BRAND.line }}>
          <ProjectNotesPanel job={job} onSave={onSave} showToast={showToast} authorRole='customer' authorName={customer?.name || 'Customer'} categories={categories} />
        </div>
      )}

      {(job.status === 'in_progress' || job.status === 'delivered' || extraWork.length > 0) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={styles.fieldLabel}>Extra Kaam (Original estimate se alag)</div>
            {job.status === 'in_progress' && !showExtraWorkForm && (
              <button style={styles.linkBtn2} onClick={() => setShowExtraWorkForm(true)}>+ Request Extra Work</button>
            )}
          </div>

          {showExtraWorkForm && (
            <div style={styles.formCard}>
              <textarea style={{ ...styles.input, minHeight: 60 }} placeholder='Kya extra kaam chahiye, likhein...' value={extraWorkDesc} onChange={(e) => setExtraWorkDesc(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={requestExtraWork}>Bhejein</button>
                <button style={styles.cancelBtn} onClick={() => setShowExtraWorkForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          {extraWork.length === 0 && !showExtraWorkForm && (
            <div style={styles.emptySmall}>Koi extra kaam nahi hai abhi.</div>
          )}
          {extraWork.map((e) => (
            <div key={e.id} style={styles.extraWorkCard}>
              <div style={styles.itemDesc}>{e.desc}</div>
              <div style={styles.itemSub}>
                {e.addedBy === 'admin' ? 'Admin ne add kiya' : 'Aapne request kiya'} - {formatDate(e.createdAt)}
              </div>
              {e.status === 'pending_admin_price' && (
                <div style={{ ...styles.estimateStatusBanner, background: '#FFF3E0', color: '#E65100', marginTop: 8 }}>
                  <AlertCircle size={14} /> Admin price set karega, phir approval ke liye aayega.
                </div>
              )}
              {e.status === 'pending_customer_approval' && (
                <>
                  {(e.items || []).length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {e.items.map((it) => {
                        const sqft = estimateItemSqft(it);
                        return (
                          <div key={it.id} style={styles.itemSub}>
                            {it.desc} - {sqft !== null ? (sqft.toFixed(2) + ' sq ft x ' + currency(it.rate)) : ((it.qty || 1) + ' x ' + currency(it.rate))} = {currency(estimateItemAmount(it))}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={styles.itemAmount}>{currency(e.amount)}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => respondToExtraWork(e, true)}><ThumbsUp size={13} /> Approve</button>
                    <button style={{ ...styles.cancelBtn, flex: 1, background: '#FFEBEE', color: '#C62828' }} onClick={() => respondToExtraWork(e, false)}><XCircle size={13} /> Reject</button>
                  </div>
                </>
              )}
              {e.status === 'approved' && (
                <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 8 }}>
                  <ThumbsUp size={14} /> Approved - {currency(e.amount)}
                </div>
              )}
              {e.status === 'rejected' && (
                <div style={{ ...styles.estimateStatusBanner, background: '#FFEBEE', color: '#C62828', marginTop: 8 }}>
                  <XCircle size={14} /> Reject kar diya gaya
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ ...styles.fieldLabel, marginTop: 20 }}>Progress Photos ({photos.length})</div>
      {photos.length === 0 && <div style={styles.emptySmall}>Kaam shuru hone ke baad yahan progress photos dikhengi.</div>}
      <div style={styles.photoGrid}>
        {photos.map((p, i) => (
          <button key={p.id} style={styles.photoThumb} onClick={() => setLightbox({ photos, index: i })}>
            <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption} style={styles.photoImg} />
          </button>
        ))}
      </div>

      {/* Project timeline: "design final ho gaya", "50% kaam complete",
          a change request, an extra-work approval - every logActivity()
          entry for this job, in one place. This is the same data
          CustomerHome's "Recent Activity" shows (capped to the latest
          8), but here on the Progress tab it's the FULL history, since
          this is where someone would naturally look to trace "what
          happened with my project so far" rather than just the few most
          recent updates. */}
      {(job.activity || []).length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={styles.fieldLabel}>Project History</div>
          {job.activity.map((a) => (
            <div key={a.id} style={styles.activityRow}>
              <div style={styles.activityDot} />
              <div style={{ flex: 1 }}>
                <div style={styles.activityText}>{a.text}</div>
                <div style={styles.itemSub}>{timeAgo(a.date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
    </div>
  );
}

/* ---- Review panel ---- */
function ReviewPanel({ job, onSave, showToast }) {
  const [rating, setRating] = useState(job.review?.rating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState(job.review?.text || '');
  // Review only makes sense once work is actually done - asking earlier
  // risks a premature or unfair rating, and can be confusing to a
  // customer who hasn't seen the finished result yet. A customer who
  // already has a review on file (e.g. from before this rule existed)
  // can still see/keep it below, even if the job's status doesn't
  // currently qualify.
  const canReview = job.status === 'delivered' || job.status === 'paid';

  const submit = () => {
    if (!rating) { showToast('Rating select karein', true); return; }
    let next = { ...job, review: { rating, text: text.trim(), date: new Date().toISOString() } };
    next = logActivity(next, 'Review submitted (' + rating + '*)');
    onSave(next);
    showToast('Review submit ho gayi. Dhanyavaad!');
  };

  if (!canReview && !job.review) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div style={styles.sectionTitle}>Review dein</div>
        <div style={styles.emptySmall}>
          Kaam complete hone ke baad hi review de sakte hain. Jaise hi aapka order deliver ho jaayega, yahan review ka option aa jaayega.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Review dein</div>
      <div style={styles.plainTextMuted}>Aapka anubhav kaisa raha? Hamein bataiye.</div>
      <div style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} style={styles.starBtn} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)} onClick={() => setRating(n)}>
            <Star size={32} fill={n <= (hoverRating || rating) ? BRAND.gold : 'none'} color={n <= (hoverRating || rating) ? BRAND.gold : '#D7DAE5'} />
          </button>
        ))}
      </div>
      <textarea style={{ ...styles.input, minHeight: 90, resize: 'vertical', marginTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder='Kaam, quality, service ke baare mein likhein...' />
      <button style={styles.primaryBtn2} onClick={submit}><Send size={14} /> Submit Review</button>

      {job.review && (
        <div style={styles.reviewPreview}>
          <div style={styles.fieldLabel}>Aapki last submitted review</div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
            {[1,2,3,4,5].map((n) => <Star key={n} size={14} fill={n <= job.review.rating ? BRAND.gold : 'none'} color={n <= job.review.rating ? BRAND.gold : '#D7DAE5'} />)}
          </div>
          <div style={styles.plainText}>{job.review.text}</div>
        </div>
      )}
    </div>
  );
}

/* ===================== ADMIN APP ===================== */
/* ---- Karigar (worker) app: deliberately minimal - a karigar only ever
   sees jobs explicitly assigned to them (see App's session routing above,
   which filters by assignedStaffId before this component even receives
   the list), and only progress-photo upload plus a read-only status view.
   No customer contact details, no pricing, no payments - none of that is
   this role's business, so it's never passed in at all rather than
   merely hidden in the UI. ---- */
function KarigarApp({ jobs, staffName, staffId, onSaveJob, onLogout, showToast, pushNotification, attendance, setAttendance }) {
  const [activeJobId, setActiveJobId] = useState(null);
  const activeJob = jobs.find((j) => j.id === activeJobId);
  const [msgText, setMsgText] = useState('');
  const [lightbox, setLightbox] = useState(null);

  // Attendance: a check-in/check-out button on the karigar's home screen,
  // one record per calendar day (dateKey), so tapping it twice in the
  // same day toggles check-out rather than creating duplicate entries.
  const todayKey = new Date().toDateString();
  const todaysRecord = (attendance || []).find((a) => a.staffId === staffId && a.dateKey === todayKey);
  const toggleAttendance = () => {
    if (!todaysRecord) {
      const entry = { id: uid(), staffId, staffName, dateKey: todayKey, checkedInAt: new Date().toISOString(), checkedOutAt: null };
      setAttendance([entry, ...(attendance || [])]);
      showToast('Check-in ho gaya');
    } else if (!todaysRecord.checkedOutAt) {
      setAttendance((attendance || []).map((a) => (a.id === todaysRecord.id ? { ...a, checkedOutAt: new Date().toISOString() } : a)));
      showToast('Check-out ho gaya');
    }
  };

  const addPhotos = async (job, photos) => {
    // Each photo is uploaded to Firebase Storage, and only the resulting
    // (short) download URL goes into job.progressPhotos - never the raw
    // base64 - for the same reason ProjectNotesPanel's addNote does this:
    // all jobs share one Firestore document, and inlining even a few
    // photos' worth of base64 data risks pushing that document past the
    // 1MiB limit, causing saves to fail silently and photos to vanish.
    const newPhotos = [];
    for (const p of photos) {
      const id = uid();
      const uploaded = await window.fileStorage.upload('progress_' + id, p.url);
      if (uploaded && !uploaded.error) {
        newPhotos.push({ id, url: uploaded.url, origUrl: p.origUrl || null, caption: p.caption, date: new Date().toISOString() });
      } else {
        showToast('Ek photo save nahi ho payi: ' + (uploaded?.error || 'unknown error'), true);
      }
    }
    if (newPhotos.length === 0) return false;
    let next = { ...job, progressPhotos: [...(job.progressPhotos || []), ...newPhotos] };
    next = logActivity(next, newPhotos.length + ' progress photo' + (newPhotos.length !== 1 ? 's' : '') + ' added by ' + staffName);
    const ok = await onSaveJob(next);
    if (ok) showToast(newPhotos.length + ' photo' + (newPhotos.length !== 1 ? 's' : '') + ' add ho gayi');
    return ok;
  };
  const removePhoto = (job, photoId) => {
    onSaveJob({ ...job, progressPhotos: (job.progressPhotos || []).filter((p) => p.id !== photoId) });
  };

  // Two-way thread so a karigar can ask admin a mid-work question (e.g.
  // "is measurement sahi hai?") from inside the app instead of always
  // needing a phone call - admin gets a notification the moment a
  // message lands, and can reply from the same thread in AdminJobDetail.
  const sendKarigarMessage = (job) => {
    if (!msgText.trim()) return;
    const entry = { id: uid(), text: msgText.trim(), from: 'karigar', authorName: staffName, createdAt: new Date().toISOString() };
    const next = { ...job, karigarMessages: [...(job.karigarMessages || []), entry] };
    onSaveJob(next);
    pushNotification('karigar_message', staffName + ' (' + job.customerName + ' ka kaam): ' + msgText.trim(), job.id);
    setMsgText('');
    showToast('Message bhej diya');
  };

  const markWorkComplete = (job) => {
    pushNotification('work_completed_by_karigar', staffName + ' ne ' + job.customerName + ' ka kaam complete bataya hai', job.id);
    showToast('Admin ko bata diya gaya - wo confirm karke status update karenge');
  };

  if (activeJob) {
    const notes = activeJob.projectNotes || [];
    const messages = activeJob.karigarMessages || [];
    return (
      <div style={{ paddingBottom: 20 }}>
        <TopBar title={activeJob.customerName} subtitle={STATUS[activeJob.status]?.label || activeJob.status} onBack={() => setActiveJobId(null)} hideLogout />
        <div style={{ padding: '12px 16px' }}>
          {activeJob.status === 'in_progress' && (
            <button style={{ ...styles.addBtn, marginBottom: 16 }} onClick={() => markWorkComplete(activeJob)}>
              <CheckCircle2 size={14} /> Kaam Complete - Admin ko Batayein
            </button>
          )}

          <div style={styles.sectionTitle}>Progress Photos</div>
          <div style={styles.photoGrid}>
            {(activeJob.progressPhotos || []).map((p) => (
              <div key={p.id} style={styles.progressPhotoCard}>
                <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption} style={styles.photoImg} />
                <button style={styles.photoDeleteBtn} onClick={() => removePhoto(activeJob, p.id)}><Trash2 size={12} color='#FFF' /></button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <PhotoAddPanel addLabel='Add progress photo' showToast={showToast} onAdd={(photos) => addPhotos(activeJob, photos)} />
          </div>

          {/* Read-only: karigar sees what's finalized/planned so they know
              what to build, but can't add or edit notes themselves - only
              admin and the customer set project direction; the karigar's
              job here is photos, not planning decisions. */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid ' + BRAND.line }}>
            <div style={styles.sectionTitle}>Project Notes</div>
            <div style={styles.plainTextMuted}>Admin/customer ne jo final kiya hai, yahan dikhega.</div>
            {notes.length === 0 && <div style={styles.emptySmall}>Abhi koi note nahi hai.</div>}
            {Object.entries(notes.reduce((acc, n) => { const cat = n.category || 'General'; (acc[cat] = acc[cat] || []).push(n); return acc; }, {})).map(([cat, catNotes]) => (
              <div key={cat} style={{ marginTop: 10 }}>
                <div style={styles.folderHeader}><ImageIcon size={13} /> {cat} ({catNotes.length})</div>
                {catNotes.map((n) => (
                  <div key={n.id} style={styles.extraWorkCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={styles.itemSub}>{n.authorName || (n.addedBy === 'admin' ? 'Admin' : 'Customer')} - {formatDate(n.createdAt)}</div>
                      {n.noteType && <span style={{ fontSize: 10, fontWeight: 800, color: BRAND.gold }}>{n.noteType}</span>}
                    </div>
                    {n.text && <div style={{ ...styles.itemDesc, marginTop: 4 }}>{n.text}</div>}
                    {n.photo && (
                      <button
                        style={{ border: 'none', padding: 0, background: 'none', cursor: 'pointer', width: '100%', display: 'block', marginTop: 8 }}
                        onClick={() => setLightbox({ photos: [{ id: n.id, url: n.photo.url, origUrl: n.photo.origUrl, caption: n.text }], index: 0 })}
                      >
                        <SmartImg src={n.photo.url} origUrl={n.photo.origUrl} alt='note attachment' style={{ ...styles.reqThumb, width: '100%', height: 140 }} />
                      </button>
                    )}
                    {n.locked && (
                      <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 8 }}>
                        <ThumbsUp size={14} /> Approved
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {(activeJob.materials || []).length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid ' + BRAND.line }}>
              <div style={styles.sectionTitle}>Material &amp; Hardware</div>
              {(activeJob.materials || []).map((m) => (
                <div key={m.id} style={styles.extraWorkCard}>
                  <div style={styles.itemDesc}>{m.desc} <span style={styles.reqCatBadge}>{m.category === 'hardware' ? 'Hardware' : 'Material'}</span></div>
                  <div style={styles.itemSub}>Status: {m.status === 'pending' ? 'Pending' : m.status === 'ordered' ? 'Order ho gaya' : 'Aa gaya'}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid ' + BRAND.line }}>
            <div style={styles.sectionTitle}>Admin se Sawal/Message</div>
            <div style={styles.plainTextMuted}>Kaam ke beech kuch confirm karna ho to yahan puchein, call karne ki zaroorat nahi.</div>
            {messages.length === 0 && <div style={styles.emptySmall}>Abhi koi message nahi hai.</div>}
            {messages.map((m) => (
              <div key={m.id} style={{ ...styles.extraWorkCard, ...(m.from === 'admin' ? { background: '#E1EDEA' } : {}) }}>
                <div style={styles.itemSub}>{m.from === 'admin' ? 'Admin' : staffName} - {formatDate(m.createdAt)}</div>
                <div style={{ ...styles.itemDesc, marginTop: 4 }}>{m.text}</div>
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...styles.input, minHeight: 60 }} placeholder='Apna sawal likhein...' value={msgText} onChange={(e) => setMsgText(e.target.value)} />
              <button style={styles.addBtn} onClick={() => sendKarigarMessage(activeJob)}><Send size={14} /> Bhejein</button>
            </div>
          </div>
        </div>
        {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 20 }}>
      <TopBar title='Karigar Panel' subtitle={'Logged in as ' + staffName} hideLogout />
      <div style={{ padding: '12px 16px' }}>
        <div style={styles.attendanceCard}>
          <div>
            <div style={styles.itemDesc}>{todaysRecord ? (todaysRecord.checkedOutAt ? 'Aaj ka kaam complete' : 'Checked in') : 'Abhi check-in nahi kiya'}</div>
            <div style={styles.itemSub}>
              {todaysRecord ? ('In: ' + new Date(todaysRecord.checkedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + (todaysRecord.checkedOutAt ? (' - Out: ' + new Date(todaysRecord.checkedOutAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })) : '')) : 'Din shuru karne ke liye check-in karein'}
            </div>
          </div>
          {(!todaysRecord || !todaysRecord.checkedOutAt) && (
            <button style={styles.addBtn} onClick={toggleAttendance}>{!todaysRecord ? 'Check In' : 'Check Out'}</button>
          )}
        </div>

        <div style={styles.sectionTitle}>Aapke assigned kaam ({jobs.length})</div>
        {jobs.length === 0 && <div style={styles.emptySmall}>Abhi koi kaam assign nahi hua hai.</div>}
        {jobs.map((j) => (
          <button key={j.id} style={styles.miniRowClickArea} onClick={() => setActiveJobId(j.id)}>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={styles.itemDesc}>{j.customerName}</div>
              <div style={styles.itemSub}>{STATUS[j.status]?.label || j.status} - {(j.progressPhotos || []).length} photos</div>
            </div>
            <ChevronRight size={16} color='#C7CCDC' />
          </button>
        ))}
        <button style={{ ...styles.addBtn, background: '#FFEBEE', color: '#C62828', marginTop: 16 }} onClick={onLogout}><LogOut size={14} /> Logout</button>
      </div>
    </div>
  );
}

function AdminApp({ gallery, setGallery, loadGalleryData, galleryLoading, customers, setCustomers, jobs, setJobs, adminPushTokens, enableAdminPushNotifications, adminPin, setAdminPin, partnerPin, setPartnerPin, staff, setStaff, expenses, setExpenses, appointmentItemOptions, setAppointmentItemOptions, categories, setCategories, brochures, addBrochure, removeBrochure, notifications, markNotificationRead, markAllNotificationsRead, itemTemplates, setItemTemplates, attendance, allData, estimateRates, setEstimateRates, faqs, setFaqs, archivedReviews, setArchivedReviews, staffName, isPartner, onLogout, showToast, pushNotification }) {
  const [tab, setTab] = useState('home');
  const [activeJobId, setActiveJobId] = useState(null);
  const activeJob = jobs.find((j) => j.id === activeJobId);
  // Once the Gallery tab has been visited, it stays MOUNTED (just
  // hidden via CSS when a different tab is active) instead of being
  // unmounted/remounted every time admin switches away and back - see
  // CustomerApp's matching comment for the full reasoning (this is the
  // same fix for admin's own gallery management screen).
  const [galleryEverVisited, setGalleryEverVisited] = useState(tab === 'gallery');
  useEffect(() => {
    if (tab === 'gallery' && !galleryEverVisited) setGalleryEverVisited(true);
  }, [tab, galleryEverVisited]);
  // Notifications don't have individual user accounts to key reads by, so
  // admin/staff/partner share one "viewer" bucket per role - simple, and
  // matches how they already share visibility into the same jobs list.
  const viewerKey = isPartner ? 'partner' : 'admin';

  if (activeJob) {
    return (
      <div style={{ paddingBottom: 20 }}>
        <TopBar title={activeJob.customerName} subtitle={isPartner ? 'Partner - Job detail' : 'Admin - Job detail'} onBack={() => setActiveJobId(null)} hideLogout />
        <AdminJobDetail key={activeJob.id} job={activeJob} onSave={(j) => setJobs(jobs.map((jj) => (jj.id === j.id ? j : jj)))} showToast={showToast} appointmentItemOptions={appointmentItemOptions} staff={staff} staffName={staffName} itemTemplates={itemTemplates} setItemTemplates={setItemTemplates} pushNotification={pushNotification} categories={categories} gallery={gallery} />
      </div>
    );
  }

  const pendingEstimates = jobs.filter((j) => j.status === 'appointment' && (j.requirements || []).length > 0).length;
  const overdue = jobs.filter((j) => jobDue(j) > 0 && (j.status === 'delivered' || j.status === 'in_progress')).length;
  const pendingAppointments = jobs.filter((j) => j.appointment && j.appointment.status === 'requested').length;
  // A customer's extra-work request fires a one-time notification, but
  // if that gets dismissed or missed, there was previously nothing
  // reminding admin it's still sitting there unpriced/unapproved -
  // unlike pendingEstimates/overdue/pendingAppointments, which all stay
  // visible on Home until resolved. This counts extra-work items in
  // either state (needing a price, or priced and awaiting the
  // customer's decision) so the same ongoing-reminder pattern applies
  // here too.
  const pendingExtraWork = jobs.reduce((s, j) => s + (j.extraWork || []).filter((e) => e.status === 'pending_admin_price' || e.status === 'pending_customer_approval').length, 0);

  return (
    <div style={{ paddingBottom: 70 }}>
      <TopBar
        title={isPartner ? 'Partner Panel' : 'Admin Panel'}
        subtitle={staffName ? ('Logged in as ' + staffName) : 'Shree Krushn PVC Furniture'}
        hideLogout
        right={
          <NotificationBell
            notifications={notifications}
            viewerKey={viewerKey}
            onOpenJob={setActiveJobId}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />
        }
      />

      {tab === 'home' && (
        <AdminHome
          customers={customers} jobs={jobs} expenses={expenses} gallery={gallery} categories={categories}
          pendingEstimates={pendingEstimates} overdue={overdue} pendingAppointments={pendingAppointments} pendingExtraWork={pendingExtraWork}
          onOpenJob={setActiveJobId} setTab={setTab} isPartner={isPartner}
        />
      )}
      {tab === 'customers' && <AdminCustomers customers={customers} setCustomers={setCustomers} jobs={jobs} setJobs={setJobs} archivedReviews={archivedReviews} setArchivedReviews={setArchivedReviews} onOpenJob={setActiveJobId} showToast={showToast} isPartner={isPartner} />}
      {galleryEverVisited && (
        <div style={{ display: tab === 'gallery' ? 'block' : 'none' }}>
          <AdminGallery gallery={gallery} galleryLoading={galleryLoading} setGallery={setGallery} categories={categories} setCategories={setCategories} showToast={showToast} />
        </div>
      )}
      {tab === 'reviews' && <AdminReviews jobs={jobs} setJobs={setJobs} archivedReviews={archivedReviews} setArchivedReviews={setArchivedReviews} showToast={showToast} />}
      {tab === 'expenses' && !isPartner && <AdminExpenses expenses={expenses} setExpenses={setExpenses} jobs={jobs} showToast={showToast} onOpenJob={setActiveJobId} />}
      {tab === 'settings' && (
        isPartner
          ? <PartnerSettings staffName={staffName} onLogout={onLogout} />
          : <AdminSettings adminPin={adminPin} setAdminPin={setAdminPin} partnerPin={partnerPin} setPartnerPin={setPartnerPin} staff={staff} setStaff={setStaff} appointmentItemOptions={appointmentItemOptions} setAppointmentItemOptions={setAppointmentItemOptions} categories={categories} setCategories={setCategories} gallery={gallery} setGallery={setGallery} brochures={brochures} addBrochure={addBrochure} removeBrochure={removeBrochure} allData={allData} jobs={jobs} customers={customers} attendance={attendance} estimateRates={estimateRates} setEstimateRates={setEstimateRates} faqs={faqs} setFaqs={setFaqs} adminPushTokens={adminPushTokens} enableAdminPushNotifications={enableAdminPushNotifications} onLogout={onLogout} showToast={showToast} />
      )}

      <BottomNav
        tab={tab} setTab={setTab}
        items={isPartner ? [
          { key: 'home', label: 'Home', icon: <Home size={18} /> },
          { key: 'customers', label: 'Customers', icon: <User size={18} /> },
          { key: 'gallery', label: 'Gallery', icon: <Grid3x3 size={18} /> },
          { key: 'reviews', label: 'Reviews', icon: <Star size={18} /> },
          { key: 'settings', label: 'Settings', icon: <SlidersHorizontal size={18} /> },
        ] : [
          { key: 'home', label: 'Home', icon: <Home size={18} /> },
          { key: 'customers', label: 'Customers', icon: <User size={18} /> },
          { key: 'gallery', label: 'Gallery', icon: <Grid3x3 size={18} /> },
          { key: 'expenses', label: 'Expenses', icon: <IndianRupee size={18} /> },
          { key: 'settings', label: 'Settings', icon: <SlidersHorizontal size={18} /> },
        ]}
      />
    </div>
  );
}

function AdminHome({ customers, jobs, expenses, gallery, categories, pendingEstimates, overdue, pendingAppointments, pendingExtraWork, onOpenJob, setTab, isPartner }) {
  const [showList, setShowList] = useState(null); // null | 'inProgress' | 'dueList' | 'todaysVisits' | 'tomorrowsVisits' | 'staleJobs' | 'allEstimates'

  // Total Due should only reflect work that's actually started - an
  // estimate sitting unapproved (status still 'appointment' or
  // 'estimate') isn't money owed yet, it's a quote the customer hasn't
  // committed to. Counting it here would make "how much is outstanding
  // right now" misleadingly include work nobody has agreed to pay for.
  const dueTotal = jobs.filter((j) => j.status === 'in_progress' || j.status === 'delivered' || j.status === 'paid').reduce((s, j) => s + jobDue(j), 0);
  const totalPhotos = categories.reduce((s, c) => s + (gallery[c] || []).length, 0);
  const recentJobs = [...jobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  // "Today's Summary" - a same-day operational snapshot: visits scheduled
  // for today (confirmed appointments), new leads today (customers
  // registered today), plus the same pending-work counts already computed
  // by the caller (estimates/payments), so admin sees "what's on today"
  // at a glance without hunting across tabs.
  const isSameLocalDay = (isoA, isoB) => {
    if (!isoA || !isoB) return false;
    const a = new Date(isoA), b = new Date(isoB);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  };
  const todayIso = new Date().toISOString();
  const todaysVisits = jobs.filter((j) => j.appointment && (j.appointment.status === 'confirmed' || j.appointment.status === 'rescheduled') && isSameLocalDay(j.appointment.confirmedDate, todayIso));
  const newLeadsToday = customers.filter((c) => isSameLocalDay(c.createdAt, todayIso)).length;
  // Tomorrow's confirmed visits, surfaced separately from today's so
  // admin can send a one-tap WhatsApp reminder the evening before -
  // computed the same way todaysVisits is, just against tomorrow's date
  // instead of today's.
  const tomorrowIso = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString(); })();
  const tomorrowsVisits = jobs.filter((j) => j.appointment && (j.appointment.status === 'confirmed' || j.appointment.status === 'rescheduled') && isSameLocalDay(j.appointment.confirmedDate, tomorrowIso));
  // Jobs stuck "in progress" with no activity logged in a while - a
  // customer whose estimate was approved days ago with nothing
  // visibly happening since is exactly the kind of silent gap that
  // makes people anxious/uncertain, even if work genuinely is moving
  // along behind the scenes (material sourcing, scheduling a karigar,
  // etc.) - this surfaces those jobs so admin can send a quick update
  // before the customer has to ask. job.activity's most recent entry
  // (prepended on every log) is used as "last update", since that's
  // already the single trail every status change, payment, note, and
  // progress photo add already writes to.
  const STALE_DAYS_THRESHOLD = 5;
  const staleJobs = jobs.filter((j) => {
    if (j.status !== 'in_progress') return false;
    const lastActivityDate = (j.activity && j.activity[0]) ? new Date(j.activity[0].date) : new Date(j.createdAt);
    const daysSince = Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24));
    return daysSince >= STALE_DAYS_THRESHOLD;
  });

  if (showList === 'inProgress') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminJobStatusList jobs={jobs} statuses={['in_progress']} title='In Progress' onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'dueList') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminDuePaymentsList jobs={jobs} expenses={expenses || []} onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'todaysVisits') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Aaj ki Visits</div>
          <div style={styles.plainTextMuted}>{todaysVisits.length} visit{todaysVisits.length !== 1 ? 's' : ''} aaj</div>
          {todaysVisits.length === 0 && <div style={styles.emptySmall}>Aaj koi visit nahi hai.</div>}
          {todaysVisits.map((j) => (
            <button key={j.id} style={{ ...styles.reviewCard, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => onOpenJob(j.id)}>
              <div style={styles.cardName}>{j.customerName}</div>
              <div style={styles.itemSub}>{j.appointment.confirmedTime ? formatTime12h(j.appointment.confirmedTime) : 'Time set nahi hai'} {j.appointment.address && ('- ' + j.appointment.address)}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (showList === 'tomorrowsVisits') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Kal Ki Visits</div>
          <div style={styles.plainTextMuted}>{tomorrowsVisits.length} visit{tomorrowsVisits.length !== 1 ? 's' : ''} kal - reminder bhejne ke liye WhatsApp button dabayein</div>
          {tomorrowsVisits.length === 0 && <div style={styles.emptySmall}>Kal koi visit nahi hai.</div>}
          {tomorrowsVisits.map((j) => {
            const reminderText = 'Namaste ' + j.customerName + ',' + NEWLINE + NEWLINE + 'Yeh ek reminder hai ki aapki visit KAL hai:' + NEWLINE + formatDate(j.appointment.confirmedDate) + (j.appointment.confirmedTime ? (' - ' + formatTime12h(j.appointment.confirmedTime)) : '') + NEWLINE + NEWLINE + 'Address: ' + (j.appointment.address || j.address || '-') + NEWLINE + NEWLINE + '- ' + BUSINESS.name;
            return (
              <div key={j.id} style={styles.reviewCard}>
                <button style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => onOpenJob(j.id)}>
                  <div style={styles.cardName}>{j.customerName}</div>
                  <div style={styles.itemSub}>{j.appointment.confirmedTime ? formatTime12h(j.appointment.confirmedTime) : 'Time set nahi hai'} {j.appointment.address && ('- ' + j.appointment.address)}</div>
                </button>
                <a href={whatsAppShareUrl(j.phone, reminderText)} target='_blank' rel='noopener noreferrer' style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF', marginTop: 8, display: 'inline-flex' }}>
                  <Send size={13} /> Reminder Bhejein
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (showList === 'staleJobs') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Update Chahiye</div>
          <div style={styles.plainTextMuted}>Ye jobs "In Progress" hain lekin {STALE_DAYS_THRESHOLD}+ din se koi update nahi hui - customer ko ek chhota update bhej dein.</div>
          {staleJobs.length === 0 && <div style={styles.emptySmall}>Sab jobs par recent update hai - kuch bhi stale nahi hai.</div>}
          {staleJobs.map((j) => {
            const lastActivityDate = (j.activity && j.activity[0]) ? new Date(j.activity[0].date) : new Date(j.createdAt);
            const daysSince = Math.floor((new Date() - lastActivityDate) / (1000 * 60 * 60 * 24));
            const updateText = 'Namaste ' + j.customerName + ',' + NEWLINE + NEWLINE + 'Aapke project ka kaam chal raha hai - jaldi hi update denge.' + NEWLINE + NEWLINE + '- ' + BUSINESS.name;
            return (
              <div key={j.id} style={styles.reviewCard}>
                <button style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => onOpenJob(j.id)}>
                  <div style={styles.cardName}>{j.customerName}</div>
                  <div style={styles.itemSub}>{daysSince} din se koi update nahi</div>
                </button>
                <a href={whatsAppShareUrl(j.phone, updateText)} target='_blank' rel='noopener noreferrer' style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF', marginTop: 8, display: 'inline-flex' }}>
                  <Send size={13} /> Update Bhejein
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (showList === 'allEstimates') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminAllEstimatesList jobs={jobs} onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'newAppointments') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminNewAppointmentsList jobs={jobs} onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'visitsByDate') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminVisitsByDate jobs={jobs} onOpenJob={onOpenJob} />
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div style={styles.sectionTitle}>Aaj ka Summary</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={styles.linkBtn2} onClick={() => setShowList('visitsByDate')}>Visits by Date</button>
          <button style={styles.linkBtn2} onClick={() => setShowList('allEstimates')}>All Estimates</button>
        </div>
      </div>
      <div style={styles.statRow2}>
        <StatCard icon={<Calendar size={16} />} label="Aaj ki Visits" value={todaysVisits.length} onClick={() => setShowList('todaysVisits')} />
        <StatCard icon={<Send size={16} />} label="Kal ki Visits" value={tomorrowsVisits.length} onClick={() => setShowList('tomorrowsVisits')} />
        <StatCard icon={<AlertCircle size={16} />} label="Update Chahiye" value={staleJobs.length} accent={staleJobs.length > 0} onClick={() => setShowList('staleJobs')} />
        <StatCard icon={<FileText size={16} />} label='Estimates Given' value={jobs.filter((j) => (j.items || []).length > 0).length} onClick={() => setShowList('allEstimates')} />
        <StatCard icon={<UserPlus size={16} />} label='New Appointments' value={pendingAppointments} onClick={() => setShowList('newAppointments')} />
      </div>

      {todaysVisits.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={styles.fieldLabel}>Aaj ki visits</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {todaysVisits.map((j) => (
              <button key={j.id} style={styles.miniRowClickArea} onClick={() => onOpenJob(j.id)}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={styles.itemDesc}>{j.customerName}</div>
                  <div style={styles.itemSub}>{j.appointment.confirmedTime ? formatTime12h(j.appointment.confirmedTime) : 'Time set nahi hai'} {j.appointment.address && ('- ' + j.appointment.address)}</div>
                </div>
                <Calendar size={15} color={BRAND.gold} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...styles.statRow2, marginTop: 12 }}>
        <StatCard icon={<User size={16} />} label='Customers' value={customers.length} onClick={() => setTab('customers')} />
        <StatCard icon={<Hammer size={16} />} label='In Progress' value={jobs.filter((j) => j.status === 'in_progress').length} onClick={() => setShowList('inProgress')} />
        <StatCard icon={<IndianRupee size={16} />} label='Total Due' value={currency(dueTotal)} accent onClick={() => setShowList('dueList')} />
      </div>

      {(pendingEstimates > 0 || overdue > 0 || pendingAppointments > 0 || pendingExtraWork > 0) && (
        <div style={styles.alertBox}>
          <AlertTriangle size={16} color='#B5562E' />
          <div style={{ flex: 1 }}>
            {pendingAppointments > 0 && (
              <button style={{ ...styles.alertText, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setShowList('newAppointments')}>
                {pendingAppointments} appointment request{pendingAppointments !== 1 ? 's' : ''} confirm karni hai
              </button>
            )}
            {pendingEstimates > 0 && <div style={styles.alertText}>{pendingEstimates} customer{pendingEstimates !== 1 ? 's' : ''} ka estimate pending hai</div>}
            {overdue > 0 && <div style={styles.alertText}>{overdue} job{overdue !== 1 ? 's' : ''} mein payment due hai</div>}
            {pendingExtraWork > 0 && <div style={styles.alertText}>{pendingExtraWork} extra work item{pendingExtraWork !== 1 ? 's' : ''} pending hai (price/approval)</div>}
          </div>
        </div>
      )}

      <div style={styles.quickGrid}>
        <QuickTile icon={<Grid3x3 size={20} color={BRAND.navy} />} label={'Gallery (' + totalPhotos + ')'} onClick={() => setTab('gallery')} />
        <QuickTile icon={<User size={20} color={BRAND.navy} />} label='All Customers' onClick={() => setTab('customers')} />
        <QuickTile icon={<Star size={20} color={BRAND.navy} />} label='Reviews' onClick={() => setTab('reviews')} />
        {!isPartner && <QuickTile icon={<IndianRupee size={20} color={BRAND.navy} />} label='Expenses' onClick={() => setTab('expenses')} />}
      </div>

      <div style={styles.fieldLabel}>Recent customers</div>
      {recentJobs.length === 0 && <div style={styles.emptySmall}>Abhi koi customer register nahi hua.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recentJobs.map((j) => (
          <div key={j.id} style={styles.miniRow}>
            <button style={styles.miniRowClickArea} onClick={() => onOpenJob(j.id)}>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={styles.itemDesc}>{j.customerName}</div>
                <div style={styles.itemSub}>{timeAgo(j.createdAt)}</div>
              </div>
              <StageBadge status={j.status} size='sm' />
            </button>
            {j.phone && (
              <a href={'tel:+91' + j.phone} style={styles.miniCallBtn} onClick={(e) => e.stopPropagation()}>
                <Phone size={13} color='#2F7D4F' />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Referral report: groups customers by who referred them, so admin
   can see at a glance which existing customers are bringing in the most
   new business (useful for referral rewards/discounts). Matching is by
   normalized text (trimmed, lowercased) since referredBy is free text
   the new customer typed - a name or phone number - not a link to an
   actual customer record. ---- */
/* ---- Karigar performance report: for each karigar, shows how many
   jobs are currently assigned, how many they've completed (status
   delivered/paid among assigned), total progress photos uploaded, and
   attendance days logged - a single view for admin to see who's
   actually productive, not just who's on the staff list. ---- */
function AdminKarigarPerformance({ staff, jobs, attendance }) {
  const karigars = staff.filter((s) => s.role === 'karigar');
  const rows = karigars.map((k) => {
    const assignedJobs = jobs.filter((j) => j.assignedStaffId === k.id);
    const completedJobs = assignedJobs.filter((j) => j.status === 'delivered' || j.status === 'paid');
    const totalPhotos = assignedJobs.reduce((s, j) => s + (j.progressPhotos || []).length, 0);
    const attendanceDays = (attendance || []).filter((a) => a.staffId === k.id).length;
    return { karigar: k, assignedCount: assignedJobs.length, completedCount: completedJobs.length, totalPhotos, attendanceDays };
  });

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Karigar Performance</div>
      <div style={styles.plainTextMuted}>Kaunsa karigar kitna kaam handle kar raha hai.</div>
      {rows.length === 0 && <div style={styles.emptySmall}>Abhi koi karigar add nahi kiya.</div>}
      {rows.map((r) => (
        <div key={r.karigar.id} style={styles.reviewCard}>
          <div style={styles.cardName}>{r.karigar.name}</div>
          <div style={styles.statRow2}>
            <StatCard icon={<Hammer size={14} />} label='Assigned' value={r.assignedCount} />
            <StatCard icon={<CheckCircle2 size={14} />} label='Completed' value={r.completedCount} />
          </div>
          <div style={styles.itemSub}>{r.totalPhotos} progress photos - {r.attendanceDays} din attendance</div>
        </div>
      ))}
    </div>
  );
}

function AdminReferralReport({ customers }) {
  const grouped = useMemo(() => {
    const groups = {};
    let noReferral = 0;
    for (const c of customers) {
      const key = (c.referredBy || '').trim().toLowerCase();
      if (!key) { noReferral++; continue; }
      if (!groups[key]) groups[key] = { displayName: c.referredBy.trim(), count: 0, customers: [] };
      groups[key].count++;
      groups[key].customers.push(c);
    }
    return { list: Object.values(groups).sort((a, b) => b.count - a.count), noReferral };
  }, [customers]);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Referral Report</div>
      <div style={styles.plainTextMuted}>Kis customer ne kitne naye customers refer kiye hain.</div>

      <div style={styles.statRow2}>
        <StatCard icon={<Users size={16} />} label='Total Referrals' value={grouped.list.reduce((s, g) => s + g.count, 0)} />
        <StatCard icon={<User size={16} />} label='Direct Signups' value={grouped.noReferral} />
      </div>

      <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Top referrers</div>
      {grouped.list.length === 0 && <div style={styles.emptySmall}>Abhi tak koi referral record nahi hai.</div>}
      {grouped.list.map((g) => (
        <div key={g.displayName} style={styles.reviewCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={styles.cardName}>{g.displayName}</div>
            <span style={styles.badge}>{g.count} referral{g.count !== 1 ? 's' : ''}</span>
          </div>
          <div style={styles.itemSub}>{g.customers.map((c) => c.name).join(', ')}</div>
        </div>
      ))}
    </div>
  );
}

/* ---- All Estimates: every job that has at least one estimate item, in
   one scrollable list - lets admin browse everyone's estimate total,
   status, and due amount without opening each customer individually.
   Tapping a row jumps straight into that job's detail. Sorted by most
   recently created first, since that's most often what admin wants to
   check on. ---- */
/* ---- Visits by date: every confirmed visit (original appointment +
   any confirmed additional visits), grouped by date, with completed/
   pending counts at a glance - answers "kaunsi kaunsi date hai, kitni
   ho gayi, kitni baaki hai" in one screen instead of hunting through
   individual customer records. ---- */
function AdminVisitsByDate({ jobs, onOpenJob }) {
  const allVisits = [];
  for (const j of jobs) {
    // A visit is treated as completed either because admin explicitly
    // marked it so, OR because the job has since moved past the
    // appointment stage at all (estimate given, work started, delivered,
    // paid) - reaching any of those is only possible once the visit
    // actually happened, so waiting on admin to remember a separate
    // "mark visit completed" tap (easy to forget once the job is
    // clearly progressing) left otherwise-obviously-done visits stuck
    // showing as "Pending" indefinitely, even for jobs that were fully
    // paid off.
    const jobHasMovedPastAppointment = j.status !== 'appointment';
    if (j.appointment && (j.appointment.status === 'confirmed' || j.appointment.status === 'rescheduled' || j.appointment.status === 'completed')) {
      allVisits.push({
        jobId: j.id,
        customerName: j.customerName,
        date: j.appointment.confirmedDate,
        time: j.appointment.confirmedTime,
        completed: j.appointment.status === 'completed' || jobHasMovedPastAppointment,
        reason: null,
      });
    }
    for (const v of (j.additionalVisits || [])) {
      if (v.status === 'confirmed') {
        allVisits.push({
          jobId: j.id,
          customerName: j.customerName,
          date: v.confirmedDate,
          time: v.confirmedTime,
          completed: jobHasMovedPastAppointment,
          reason: v.reason,
        });
      }
    }
  }
  const completedCount = allVisits.filter((v) => v.completed).length;
  const pendingCount = allVisits.length - completedCount;

  const byDate = {};
  for (const v of allVisits) {
    const key = v.date || 'Date not set';
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(v);
  }
  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Visits by Date</div>
      <div style={styles.statRow2}>
        <StatCard icon={<Calendar size={16} />} label='Total Visits' value={allVisits.length} />
        <StatCard icon={<CheckCircle2 size={16} />} label='Completed' value={completedCount} />
      </div>
      <div style={styles.statRow2}>
        <StatCard icon={<AlertCircle size={16} />} label='Pending' value={pendingCount} />
      </div>

      {sortedDates.length === 0 && <div style={styles.emptySmall}>Koi visit nahi hai.</div>}
      {sortedDates.map((dateKey) => (
        <div key={dateKey} style={{ marginTop: 14 }}>
          <div style={styles.folderHeader}>{dateKey === 'Date not set' ? dateKey : formatDate(dateKey)} ({byDate[dateKey].length})</div>
          {byDate[dateKey].map((v, i) => (
            <button key={i} style={{ ...styles.reviewCard, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => onOpenJob(v.jobId)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={styles.cardName}>{v.customerName}</div>
                <span style={{ ...styles.badge, background: v.completed ? '#DFF0E4' : '#F3EFE3', color: v.completed ? '#2F7D4F' : '#A8975F' }}>{v.completed ? 'Completed' : 'Pending'}</span>
              </div>
              <div style={styles.itemSub}>{v.time ? formatTime12h(v.time) : 'Time set nahi hai'}{v.reason && (' - ' + v.reason)}</div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function AdminNewAppointmentsList({ jobs, onOpenJob }) {
  const rows = jobs
    .filter((j) => j.appointment && j.appointment.status === 'requested')
    .sort((a, b) => new Date(b.appointment.requestedAt || 0) - new Date(a.appointment.requestedAt || 0));

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>New Appointment Requests</div>
      <div style={styles.plainTextMuted}>{rows.length} request{rows.length !== 1 ? 's' : ''} confirm karni hai</div>
      {rows.length === 0 && <div style={styles.emptySmall}>Koi naya request nahi hai.</div>}
      {rows.map((j) => (
        <button key={j.id} style={{ ...styles.reviewCard, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => onOpenJob(j.id)}>
          <div style={styles.cardName}>{j.customerName}</div>
          <div style={styles.itemSub}>Chaha hua: {formatDate(j.appointment.preferredDate)} {j.appointment.preferredTime && ('- ' + formatTime12h(j.appointment.preferredTime))}</div>
          <div style={styles.itemSub}>{j.appointment.address}</div>
        </button>
      ))}
    </div>
  );
}

function AdminAllEstimatesList({ jobs, onOpenJob }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    return jobs
      .filter((j) => (j.items || []).length > 0)
      .map((j) => ({ job: j, total: jobTotal(j), due: jobDue(j) }))
      .sort((a, b) => new Date(b.job.createdAt) - new Date(a.job.createdAt));
  }, [jobs]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.job.customerName || '').toLowerCase().includes(q) ||
      (r.job.flatNo || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>All Estimates</div>
      <div style={styles.plainTextMuted}>Sabhi customers ke estimates ek jagah.</div>

      <div style={styles.statRow2}>
        <StatCard icon={<FileText size={16} />} label='Total Estimates' value={rows.length} />
        <StatCard icon={<IndianRupee size={16} />} label='Combined Value' value={currency(grandTotal)} accent />
      </div>

      {rows.length > 0 && (
        <input style={{ ...styles.input, marginTop: 12 }} placeholder='Naam ya Flat Number se search karein...' value={query} onChange={(e) => setQuery(e.target.value)} />
      )}

      {rows.length === 0 && <div style={styles.emptySmall}>Abhi koi estimate nahi bana.</div>}
      {rows.length > 0 && filteredRows.length === 0 && <div style={styles.emptySmall}>Koi estimate match nahi hua.</div>}
      {filteredRows.map((r) => (
        <button key={r.job.id} style={{ ...styles.reviewCard, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => onOpenJob(r.job.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.cardName}>{r.job.customerName}</div>
            <span style={styles.badge}>{STATUS[r.job.status]?.label || r.job.status}</span>
          </div>
          {r.job.flatNo && <div style={styles.itemSub}>{r.job.flatNo}</div>}
          <div style={styles.itemSub}>{(r.job.items || []).length} item{(r.job.items || []).length !== 1 ? 's' : ''} - {currency(r.total)}{r.due > 0 && (' - ' + currency(r.due) + ' due')}</div>
        </button>
      ))}
    </div>
  );
}

function AdminCustomers({ customers, setCustomers, jobs, setJobs, archivedReviews, setArchivedReviews, onOpenJob, showToast }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [showReferralReport, setShowReferralReport] = useState(false);
  const [showAllEstimates, setShowAllEstimates] = useState(false);
  // Moved here, before the two early returns below - React's Rules of
  // Hooks require every hook to run in the same order on every render,
  // and this useMemo previously sat AFTER both "if (showX) return"
  // checks, meaning it was silently skipped whenever either report
  // screen was open. That mismatch is exactly what caused tapping
  // "Karigar Performance" (a different, now-fixed instance of the same
  // bug in AdminSettings) to blank the whole app - the same risk
  // existed here for "All Estimates" and "Referral Report" and is
  // fixed the same way: unconditional, always before any early return.
  const rows = useMemo(() => {
    let r = customers
      .map((c) => ({ customer: c, job: jobs.find((j) => j.customerId === c.id) }))
      .filter(({ customer, job }) => {
        if (filter !== 'all' && (!job || job.status !== filter)) return false;
        if (branchFilter !== 'all' && (!job || job.branch !== branchFilter)) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          return customer.name.toLowerCase().includes(q) || customer.phone.includes(q) || (job?.flatNo || '').toLowerCase().includes(q);
        }
        return true;
      });
    if (sort === 'recent') r.sort((a, b) => new Date(b.customer.createdAt) - new Date(a.customer.createdAt));
    if (sort === 'name') r.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
    if (sort === 'due') r.sort((a, b) => (b.job ? jobDue(b.job) : 0) - (a.job ? jobDue(a.job) : 0));
    return r;
  }, [customers, jobs, query, filter, branchFilter, sort]);

  if (showAllEstimates) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowAllEstimates(false)}><ArrowLeft size={13} /> Customers</button>
        </div>
        <AdminAllEstimatesList jobs={jobs} onOpenJob={onOpenJob} />
      </div>
    );
  }

  if (showReferralReport) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowReferralReport(false)}><ArrowLeft size={13} /> Customers</button>
        </div>
        <AdminReferralReport customers={customers} />
      </div>
    );
  }

  // Same rule as AdminHome's dueTotal: only work that's actually
  // started (in_progress/delivered/paid) counts as money owed - an
  // unapproved estimate isn't due yet.
  const dueTotal = jobs.filter((j) => j.status === 'in_progress' || j.status === 'delivered' || j.status === 'paid').reduce((s, j) => s + jobDue(j), 0);

  const saveEditedCustomer = (updated) => {
    const normalized = normalizeIndianPhone(updated.phone);
    if (!updated.name.trim() || !normalized) {
      showToast('Sahi naam aur phone number daalein', true);
      return;
    }
    const dupe = customers.find((c) => c.phone === normalized && c.id !== updated.id);
    if (dupe) { showToast('Ye phone number pehle se kisi aur customer ka hai', true); return; }
    setCustomers(customers.map((c) => (c.id === updated.id ? { ...c, name: updated.name.trim(), phone: normalized, birthdayMonthDay: updated.birthdayMonthDay } : c)));
    setJobs(jobs.map((j) => (j.customerId === updated.id ? { ...j, customerName: updated.name.trim(), phone: normalized } : j)));
    setEditingCustomer(null);
    showToast('Customer updated');
  };

  const confirmDeleteCustomer = () => {
    if (!deletingCustomer) return;
    // Preserve any featured review before the job (and the review
    // living inside it) is deleted along with the customer - see
    // archivedReviews' definition above for why. Only featured reviews
    // are worth keeping here since those are the ones actually being
    // used as marketing testimonials; an un-featured review had no
    // active use beyond the job record it lived on.
    const customerJobs = jobs.filter((j) => j.customerId === deletingCustomer.id);
    const reviewsToArchive = customerJobs
      .filter((j) => j.review && j.review.featured)
      .map((j) => ({ id: uid(), customerName: j.customerName, rating: j.review.rating, text: j.review.text, date: j.review.date, featured: true }));
    if (reviewsToArchive.length > 0) {
      setArchivedReviews([...archivedReviews, ...reviewsToArchive]);
    }
    setCustomers(customers.filter((c) => c.id !== deletingCustomer.id));
    setJobs(jobs.filter((j) => j.customerId !== deletingCustomer.id));
    setDeletingCustomer(null);
    showToast('Customer deleted' + (reviewsToArchive.length > 0 ? ' (review surakshit rakha gaya)' : ''));
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        <button style={styles.linkBtn2} onClick={() => setShowAllEstimates(true)}>All Estimates</button>
        <button style={styles.linkBtn2} onClick={() => setShowReferralReport(true)}>Referral Report</button>
      </div>
      <div style={styles.statRow2}>
        <StatCard icon={<User size={16} />} label='Customers' value={customers.length} />
        <StatCard icon={<Hammer size={16} />} label='In Progress' value={jobs.filter((j) => j.status === 'in_progress').length} />
        <StatCard icon={<IndianRupee size={16} />} label='Total Due' value={currency(dueTotal)} accent />
      </div>

      <div style={styles.searchWrap}>
        <Search size={15} color={BRAND.textMuted} />
        <input style={styles.searchInput} placeholder='Search naam, phone, ya flat number...' value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div style={styles.filterRow}>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label='All' />
        {STATUS_ORDER.map((s) => <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={STATUS[s].label} color={STATUS[s].color} />)}
      </div>
      {BUSINESS.branches.length > 1 && (
        <div style={styles.filterRow}>
          <FilterChip active={branchFilter === 'all'} onClick={() => setBranchFilter('all')} label='All Branches' />
          {BUSINESS.branches.map((b) => (
            <FilterChip key={b.city} active={branchFilter === b.city} onClick={() => setBranchFilter(b.city)} label={b.city} />
          ))}
        </div>
      )}
      <div style={styles.sortRow}>
        <span style={styles.sortLabel}>Sort:</span>
        {[['recent', 'Recent'], ['name', 'Name'], ['due', 'Due amount']].map(([k, l]) => (
          <button key={k} onClick={() => setSort(k)} style={{ ...styles.sortBtn, ...(sort === k ? styles.sortBtnActive : {}) }}>{l}</button>
        ))}
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.length === 0 && <div style={styles.empty}>Koi customer nahi mila.</div>}
        {rows.map(({ customer, job }) => (
          <div key={customer.id} style={styles.card}>
            <button style={styles.cardClickArea} onClick={() => job && onOpenJob(job.id)}>
              <div style={styles.cardTop}>
                <div style={styles.cardStub}>
                  <div style={styles.stubLabel}>CUST</div>
                  <div style={styles.stubNo}>#{customer.id.slice(-5).toUpperCase()}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.cardName}>{customer.name}</div>
                  <div style={styles.cardMeta}>
                    <span style={styles.metaItem}><Phone size={11} /> {formatPhoneDisplay(customer.phone)}</span>
                    {customer.phoneVerified && <span style={styles.verifiedTag}><ShieldCheck size={10} /> Verified</span>}
                    <span style={styles.metaItem}><Calendar size={11} /> {formatDate(customer.createdAt)}</span>
                    {BUSINESS.branches.length > 1 && job?.branch && <span style={styles.metaItem}>{job.branch}</span>}
                  </div>
                </div>
                {job && <StageBadge status={job.status} />}
              </div>
              {job && (job.requirements || []).length > 0 && (
                <div style={styles.reqPreview}>{job.requirements.length} requirement{job.requirements.length !== 1 ? 's' : ''} - {job.progressPhotos?.length || 0} progress photos</div>
              )}
            </button>
            <div style={styles.cardActionsRow}>
              <a href={'tel:+91' + customer.phone} style={{ ...styles.cardActionBtn, color: '#2F7D4F' }} onClick={(e) => e.stopPropagation()}><Phone size={12} /> Call</a>
              <button style={styles.cardActionBtn} onClick={() => setEditingCustomer(customer)}><Edit3 size={12} /> Edit</button>
              <button style={{ ...styles.cardActionBtn, color: '#B5562E' }} onClick={() => setDeletingCustomer(customer)}><Trash2 size={12} /> Delete</button>
              <ChevronRight size={16} color='#C7CCDC' style={{ marginLeft: 'auto' }} />
            </div>
          </div>
        ))}
      </div>

      {editingCustomer && (
        <CustomerEditDialog customer={editingCustomer} onCancel={() => setEditingCustomer(null)} onSave={saveEditedCustomer} />
      )}
      {deletingCustomer && (
        <div style={styles.overlay} onClick={() => setDeletingCustomer(null)}>
          <div style={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={24} color='#B5562E' />
            <div style={styles.confirmDialogTitle}>{deletingCustomer.name} ko delete karein?</div>
            <div style={styles.confirmDialogText}>Isse unka poora record - requirements, estimate, payments, sab hamesha ke liye mit jaayega.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%' }}>
              <button style={{ ...styles.cancelBtn, flex: 1 }} onClick={() => setDeletingCustomer(null)}>Cancel</button>
              <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0, background: '#B5562E' }} onClick={confirmDeleteCustomer}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerEditDialog({ customer, onCancel, onSave }) {
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(formatPhoneDisplay(customer.phone).replace('+91 ', ''));
  // Birthday is stored as month-day only (no year) - enough to send a
  // yearly wish, without needing a full date of birth on file.
  const [birthdayMonthDay, setBirthdayMonthDay] = useState(customer.birthdayMonthDay || '');
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <SheetHeader title='Edit Customer' onClose={onCancel} />
        <div style={styles.sheetBody}>
          <div style={styles.fieldLabel}>Naam</div>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Phone number</div>
          <input
            style={styles.input}
            value={phone}
            onChange={(e) => setPhone(phoneCharsOnly(e.target.value).slice(0, 14))}
            inputMode='tel'
          />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Birthday (optional, din/mahina)</div>
          <input
            style={styles.input}
            type='date'
            value={birthdayMonthDay ? ('2000-' + birthdayMonthDay) : ''}
            onChange={(e) => setBirthdayMonthDay(e.target.value ? e.target.value.slice(5) : '')}
          />
        </div>
        <div style={styles.sheetFooter}>
          <button style={styles.primaryBtn} onClick={() => onSave({ id: customer.id, name, phone, birthdayMonthDay: birthdayMonthDay || null })}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, label, color }) {
  return (
    <button onClick={onClick} style={{ ...styles.chip, ...(active ? { background: color || BRAND.navy, color: '#FFF', borderColor: color || BRAND.navy } : {}) }}>{label}</button>
  );
}

/* ---- Admin: view appointment request, confirm/reschedule with a date+time ---- */
function AdminAppointmentTab({ job, onSave, showToast, pushNotification }) {
  const appt = job.appointment;
  const [confirmDate, setConfirmDate] = useState(appt?.confirmedDate || appt?.preferredDate || '');
  const [confirmTime, setConfirmTime] = useState(appt?.confirmedTime || appt?.preferredTime || '');
  const [confirmingVisitId, setConfirmingVisitId] = useState(null);
  const [visitConfirmDate, setVisitConfirmDate] = useState('');
  const [visitConfirmTime, setVisitConfirmTime] = useState('');
  const additionalVisits = job.additionalVisits || [];

  // Admin booking directly (e.g. customer called in instead of using
  // the app) - no separate "requested" step needed since admin IS the
  // one confirming it, so this goes straight to 'confirmed'.
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('');
  const [bookAddress, setBookAddress] = useState(job.address || '');

  const bookDirectly = () => {
    if (!bookDate || !bookAddress.trim()) { showToast('Date aur address zaroori hai', true); return; }
    const nextAppt = {
      preferredDate: bookDate, preferredTime: bookTime, address: bookAddress.trim(),
      status: 'confirmed', confirmedDate: bookDate, confirmedTime: bookTime,
      requestedAt: new Date().toISOString(), bookedByAdmin: true,
    };
    let next = { ...job, appointment: nextAppt, address: bookAddress.trim() };
    next = logActivity(next, 'Admin ne appointment book ki: ' + formatDate(bookDate) + (bookTime ? (', ' + formatTime12h(bookTime)) : ''));
    onSave(next);
    if (pushNotification) {
      pushNotification('appointment_confirmed', 'Aapki visit ' + formatDate(bookDate) + (bookTime ? (' - ' + formatTime12h(bookTime)) : '') + ' ke liye book ho gayi hai', job.id);
    }
    showToast('Appointment book ho gayi');
  };

  const confirmAdditionalVisit = (visit) => {
    if (!visitConfirmDate) { showToast('Date select karein', true); return; }
    const next = { ...job, additionalVisits: additionalVisits.map((v) => (v.id === visit.id ? { ...v, status: 'confirmed', confirmedDate: visitConfirmDate, confirmedTime: visitConfirmTime } : v)) };
    onSave(logActivity(next, 'Additional visit confirm ki: ' + visit.reason));
    if (pushNotification) {
      pushNotification('appointment_confirmed', 'Aapki extra visit ' + formatDate(visitConfirmDate) + (visitConfirmTime ? (' - ' + visitConfirmTime) : '') + ' ke liye confirm ho gayi hai', job.id);
    }
    setConfirmingVisitId(null);
    showToast('Visit confirm ho gayi');
  };

  if (!appt) {
    return (
      <div style={{ padding: '12px 16px' }}>
        <div style={styles.emptySmall}>Customer ne abhi tak koi appointment request nahi ki.</div>
        <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Aap khud se book karein</div>
        <div style={styles.plainTextMuted}>Agar customer ne call karke bataya hai, to seedha yahan se book kar sakte hain.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={styles.input} type='date' value={bookDate} onChange={(e) => setBookDate(e.target.value)} />
          <input style={styles.input} type='time' value={bookTime} onChange={(e) => setBookTime(e.target.value)} />
        </div>
        <input style={{ ...styles.input, marginTop: 8 }} placeholder='Address' value={bookAddress} onChange={(e) => setBookAddress(e.target.value)} />
        <button style={{ ...styles.primaryBtn2, marginTop: 10 }} onClick={bookDirectly}>Appointment Book Karein</button>
      </div>
    );
  }

  const st = APPT_STATUS[appt.status] || APPT_STATUS.requested;

  const confirm = (asReschedule) => {
    if (!confirmDate) { showToast('Date select karein', true); return; }
    const nextAppt = { ...appt, status: asReschedule ? 'rescheduled' : 'confirmed', confirmedDate: confirmDate, confirmedTime: confirmTime };
    let next = { ...job, appointment: nextAppt };
    next = logActivity(next, 'Appointment ' + (asReschedule ? 'rescheduled' : 'confirmed') + ': ' + formatDate(confirmDate) + (confirmTime ? ', ' + confirmTime : ''));
    onSave(next);
    if (pushNotification) {
      pushNotification('appointment_confirmed', 'Aapki visit ' + formatDate(confirmDate) + (confirmTime ? (' - ' + confirmTime) : '') + ' ke liye confirm ho gayi hai', job.id);
    }
    showToast(asReschedule ? 'Appointment reschedule ki gayi' : 'Appointment confirm ho gayi');
  };

  const markCompleted = () => {
    let next = { ...job, appointment: { ...appt, status: 'completed' } };
    next = logActivity(next, 'Appointment completed');
    onSave(next);
    showToast('Marked as completed');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={styles.fieldLabel}>Appointment request</div>
        <span style={{ ...styles.badge, background: st.bg, color: st.color }}>{st.label}</span>
      </div>

      {job.phone && (
        <a href={'tel:+91' + job.phone} style={styles.callBtn}>
          <Phone size={15} /> Call {job.customerName} - {formatPhoneDisplay(job.phone)}
        </a>
      )}

      <div style={styles.apptCard}>
        <div style={styles.apptRow}><span style={styles.apptRowLabel}>Purpose</span><span style={styles.apptRowValue}>{appt.purpose}</span></div>
        {appt.bhk && <div style={styles.apptRow}><span style={styles.apptRowLabel}>Property</span><span style={styles.apptRowValue}>{appt.bhk}</span></div>}
        {appt.items && appt.items.length > 0 && (
          <div style={styles.apptRow}>
            <span style={styles.apptRowLabel}>Work needed</span>
            <span style={styles.apptRowValue}>{appt.items.join(', ')}</span>
          </div>
        )}
        <div style={styles.apptRow}><span style={styles.apptRowLabel}>Preferred</span><span style={styles.apptRowValue}>{formatDate(appt.preferredDate)} {appt.preferredTime && ('- ' + formatTime12h(appt.preferredTime))}</span></div>
        <div style={styles.apptRow}><span style={styles.apptRowLabel}>Address</span><span style={styles.apptRowValue}>{appt.address}</span></div>
        {appt.notes && <div style={styles.apptRow}><span style={styles.apptRowLabel}>Notes</span><span style={styles.apptRowValue}>{appt.notes}</span></div>}
        <div style={styles.apptRow}><span style={styles.apptRowLabel}>Requested</span><span style={styles.apptRowValue}>{timeAgo(appt.requestedAt)}</span></div>
      </div>

      <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Confirm / Reschedule visit</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <input style={styles.input} type='date' value={confirmDate} onChange={(e) => setConfirmDate(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <input style={styles.input} type='time' value={confirmTime} onChange={(e) => setConfirmTime(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0, background: '#2F7D4F' }} onClick={() => confirm(false)}><CheckCircle2 size={14} /> Confirm</button>
        <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0, background: '#B5562E' }} onClick={() => confirm(true)}><Calendar size={14} /> Reschedule</button>
      </div>
      {(appt.status === 'confirmed' || appt.status === 'rescheduled') && (
        <>
          <button style={styles.addBtn} onClick={markCompleted}><CheckCircle2 size={14} /> Mark visit completed</button>
          <a
            href={whatsAppShareUrl(job.phone, 'Namaste ' + job.customerName + ',\n\nAapki visit confirm ho gayi hai:\n' + formatDate(appt.confirmedDate) + (appt.confirmedTime ? (' - ' + formatTime12h(appt.confirmedTime)) : '') + '\n\nAddress: ' + (appt.address || job.address || '-') + '\n\n- ' + BUSINESS.name)}
            target='_blank' rel='noopener noreferrer'
            style={{ ...styles.addBtn, background: '#25D366', color: '#FFF', textDecoration: 'none', justifyContent: 'center' }}
          >
            <Send size={14} /> WhatsApp Par Bhejein
          </a>
        </>
      )}

      {additionalVisits.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={styles.fieldLabel}>Extra Visit Requests</div>
          {additionalVisits.map((v) => (
            <div key={v.id} style={styles.extraWorkCard}>
              <div style={styles.itemDesc}>{v.reason}</div>
              <div style={styles.itemSub}>
                {v.status === 'confirmed' ? 'Confirmed: ' : 'Requested: '}
                {formatDate(v.status === 'confirmed' ? v.confirmedDate : v.preferredDate)} {(v.status === 'confirmed' ? v.confirmedTime : v.preferredTime) && ('- ' + formatTime12h(v.status === 'confirmed' ? v.confirmedTime : v.preferredTime))}
              </div>
              {v.status === 'requested' && confirmingVisitId !== v.id && (
                <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={() => { setConfirmingVisitId(v.id); setVisitConfirmDate(v.preferredDate); setVisitConfirmTime(v.preferredTime); }}>Confirm karein</button>
              )}
              {confirmingVisitId === v.id && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={styles.input} type='date' value={visitConfirmDate} onChange={(e) => setVisitConfirmDate(e.target.value)} />
                    <input style={styles.input} type='time' value={visitConfirmTime} onChange={(e) => setVisitConfirmTime(e.target.value)} />
                  </div>
                  <button style={{ ...styles.primaryBtn2, marginTop: 8 }} onClick={() => confirmAdditionalVisit(v)}>Save</button>
                </div>
              )}
              {v.status === 'confirmed' && (
                <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 8 }}>
                  <ThumbsUp size={14} /> Confirm ho gayi
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- Admin job detail ---- */
/* ---- Admin: Estimate builder - matches the real quotation sheet:
   item, length, height (inches), auto sq-ft, rate/sqft, amount. Editable
   inline. 'Preview Quotation' opens the formal customer-facing document. ---- */
function AdminEstimateTab({ job, onSave, newItem, setNewItem, addItem, updateItem, removeItem, total, itemTemplates, setItemTemplates, showToast }) {
  const [showPreview, setShowPreview] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const applyTemplate = (t) => {
    setNewItem({ desc: t.desc, length: t.length || '', height: t.height || '', qty: t.qty || '1', rate: t.rate || '' });
  };
  const saveCurrentAsTemplate = () => {
    if (!newItem.desc.trim()) { showToast('Pehle description bharein', true); return; }
    const t = { id: uid(), desc: newItem.desc.trim(), length: newItem.length || '', height: newItem.height || '', qty: newItem.qty || '1', rate: newItem.rate || '' };
    setItemTemplates([...itemTemplates, t]);
    showToast('Template save ho gaya - ab har naye customer ke liye use kar sakte ho');
  };
  const removeTemplate = (id) => setItemTemplates(itemTemplates.filter((t) => t.id !== id));

  return (
    <div>
      {(job.items || []).length === 0 && <AdminEstimateDraftsPanel job={job} onSave={onSave} showToast={showToast} />}

      <div style={styles.fieldLabel}>Flat Name / Number</div>
      <input style={styles.input} placeholder='Jaise Flat 402, Sun City' value={job.flatNo || ''} onChange={(e) => onSave({ ...job, flatNo: e.target.value })} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <div style={styles.fieldLabel}>Estimate items</div>
        {(job.items || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.previewLinkBtn} onClick={() => setShowPreview(true)}><FileText size={12} /> Preview Quotation</button>
            <button style={{ ...styles.previewLinkBtn, background: '#25D366' }} onClick={() => { setShowPreview(true); setTimeout(() => shareEstimatePdf(job, 'quotation-print-area', showToast), 350); }}><Send size={12} /> PDF WhatsApp</button>
          </div>
        )}
      </div>

      <div style={styles.formCard}>
        <div style={styles.fieldLabel}>Add item</div>
        {itemTemplates && itemTemplates.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={styles.hintText}>Saved templates - tap to fill:</div>
            <div style={styles.chipRow}>
              {itemTemplates.map((t) => (
                <button key={t.id} onClick={() => applyTemplate(t)} style={styles.chip}>{t.desc}</button>
              ))}
            </div>
          </div>
        )}
        <input style={styles.input} placeholder='Item / work description (e.g. Wardrobe box)' value={newItem.desc} onChange={(e) => setNewItem((n) => ({ ...n, desc: e.target.value }))} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={styles.input} placeholder='Length (inch)' inputMode='decimal' value={newItem.length} onChange={(e) => setNewItem((n) => ({ ...n, length: e.target.value }))} />
          <input style={styles.input} placeholder='Height (inch)' inputMode='decimal' value={newItem.height} onChange={(e) => setNewItem((n) => ({ ...n, height: e.target.value }))} />
        </div>
        <div style={styles.hintText}>Length x Height se sq ft auto-calculate hoga (inch to sq ft: LxH/144). Bina naap ke item (jaise tandem basket) ho to yeh khaali chhod ke neeche Qty use karein.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={styles.input} placeholder='Qty (agar naap nahi)' inputMode='numeric' value={newItem.qty} onChange={(e) => setNewItem((n) => ({ ...n, qty: e.target.value }))} />
          <input style={styles.input} placeholder='Rate ₹' inputMode='decimal' value={newItem.rate} onChange={(e) => setNewItem((n) => ({ ...n, rate: e.target.value }))} />
        </div>
        {estimateItemSqft(newItem) !== null && (
          <div style={styles.liveCalcBox}>
            <span>{newItem.length}' x {newItem.height}' = <b>{estimateItemSqft(newItem).toFixed(2)} sq ft</b></span>
            {newItem.rate && <span>x {currency(newItem.rate)} = <b>{currency(estimateItemAmount(newItem))}</b></span>}
          </div>
        )}
        <button style={styles.addBtn} onClick={addItem}><Plus size={14} /> Add item</button>
        {itemTemplates && <button style={{ ...styles.cardActionBtn, marginTop: 10 }} onClick={saveCurrentAsTemplate}>Save as template</button>}
      </div>

      {(job.items || []).length === 0 && <div style={styles.emptySmall}>No items added yet.</div>}

      {(job.items || []).map((it, idx) =>
        editingId === it.id ? (
          <EstimateItemEditRow
            key={it.id}
            item={it}
            onSave={(patch) => { updateItem(it.id, patch); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={it.id} style={styles.estItemRow}>
            <div style={styles.estItemNo}>{idx + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.itemDesc}>{it.desc}</div>
              <div style={styles.itemSub}>
                {estimateItemSqft(it) !== null
                  ? (it.length + "' x " + it.height + "' = " + estimateItemSqft(it).toFixed(2) + ' sq ft x ' + currency(it.rate))
                  : ((it.qty || 1) + ' x ' + currency(it.rate))}
              </div>
            </div>
            <div style={styles.itemAmount}>{currency(estimateItemAmount(it))}</div>
            <button style={styles.iconBtnSmall} onClick={() => setEditingId(it.id)}><Edit3 size={13} color='#B3B8C6' /></button>
            <button style={styles.iconBtnSmall} onClick={() => removeItem(it.id)}><Trash2 size={14} color='#C7CCDC' /></button>
          </div>
        )
      )}

      {(job.items || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.fieldLabel}>Discount (optional)</div>
          <div style={styles.plainTextMuted}>Poore estimate par flat discount - jitne mein estimate final hua hai.</div>
          <input style={styles.input} placeholder='Discount ₹' inputMode='decimal' value={job.discount || ''} onChange={(e) => onSave({ ...job, discount: e.target.value })} />
          {Number(job.discount) > 0 && (
            <div style={styles.hintText}>
              Subtotal: {currency((job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0) + (job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).reduce((s, e) => s + (Number(e.amount) || 0), 0))} - Discount: {currency(job.discount)}
            </div>
          )}
        </div>
      )}

      <div style={styles.totalBar}><span>Estimate Total</span><span style={styles.totalAmt}>{currency(total)}</span></div>

      {(job.materialCompany || job.sheetWeightKg) && (
        <div style={styles.plainTextMuted}>
          Material: {[job.materialCompany, job.sheetWeightKg && (job.sheetWeightKg + ' kg')].filter(Boolean).join(' - ')}
        </div>
      )}

      {/* Same payment summary the customer sees below their estimate
          (total/paid/due + a receipt-downloadable history) - admin has
          full payment management in the separate Payment tab, but seeing
          this right here too means checking "kitna paid hai" doesn't
          require switching tabs while reviewing the estimate itself. */}
      {(job.payments || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.payStrip}>
            <MoneyBit label='Total' value={currency(total)} />
            <MoneyBit label='Paid' value={currency(jobPaid(job))} muted />
            <MoneyBit label='Due' value={currency(jobDue(job))} highlight={jobDue(job) > 0} />
          </div>
          <div style={{ ...styles.fieldLabel, marginTop: 10 }}>Payment History</div>
          {job.payments.map((p) => (
            <div key={p.id} style={styles.itemRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.itemDesc}>{currency(p.amount)}</div>
                <div style={styles.itemSub}>{formatDate(p.date)} {p.note && ('- ' + p.note)}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF' }} onClick={() => shareReceiptPdf(job, p, showToast)}><Send size={13} /> WhatsApp</button>
                <button style={styles.cardActionBtn} onClick={() => generateReceiptPdf(job, p, showToast)}><FileText size={13} /> Receipt</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showPreview && <QuotationPreview job={job} onClose={() => setShowPreview(false)} showToast={showToast} />}
    </div>
  );
}

/* ---- Estimate draft options: lets admin build 2+ complete estimate
   variants (e.g. "Laminate" vs "Without Laminate"), each with its own
   material, items, and total, so the customer can compare budgets
   before committing. Only relevant BEFORE the real estimate exists
   (job.items is empty) - once a draft is finalized, its items/material/
   discount get copied straight into the job's normal fields, and
   estimateDrafts is cleared. From that point on, the job behaves
   exactly like any other job with an estimate - approve/reject,
   payment milestones, PDF/WhatsApp sharing all work completely
   unchanged, since they only ever look at job.items/materialCompany/
   etc, never at estimateDrafts. This keeps the whole rest of the app's
   estimate logic untouched by this feature. ---- */
function AdminEstimateDraftsPanel({ job, onSave, showToast }) {
  const drafts = job.estimateDrafts || [];
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [draftForm, setDraftForm] = useState(null);
  const [newDraftItem, setNewDraftItem] = useState({ desc: '', length: '', height: '', qty: '1', rate: '' });

  const draftTotal = (d) => (d.items || []).reduce((s, it) => s + estimateItemAmount(it), 0);

  const startNewDraft = () => {
    setEditingDraftId('new');
    setDraftForm({ label: '', materialCompany: '', sheetWeightKg: '', items: [] });
    setNewDraftItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  const startEditDraft = (d) => {
    setEditingDraftId(d.id);
    setDraftForm({ ...d });
    setNewDraftItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  // Copies another option's full item list (fresh ids, same desc/
  // dimensions/qty/rate) into the draft currently being built - for a
  // large estimate (20-30 items isn't unusual), re-typing every item a
  // second time for each material variant would be a lot of repetitive
  // work, when usually only the RATE differs between "Laminate" and
  // "Without Laminate" versions of the same job. Admin copies once, then
  // only adjusts the rates that actually change.
  const copyItemsFromDraft = (sourceId) => {
    const source = drafts.find((d) => d.id === sourceId);
    if (!source) return;
    const copiedItems = source.items.map((it) => ({ ...it, id: uid() }));
    setDraftForm((f) => ({ ...f, items: copiedItems }));
    showToast(copiedItems.length + ' items copy ho gaye - ab rates adjust karein');
  };
  const addItemToDraft = () => {
    if (!newDraftItem.desc.trim()) return;
    const item = { id: uid(), desc: newDraftItem.desc.trim(), length: newDraftItem.length || '', height: newDraftItem.height || '', qty: newDraftItem.qty || '1', rate: newDraftItem.rate || '0' };
    setDraftForm((f) => ({ ...f, items: [...f.items, item] }));
    setNewDraftItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  // Editing an item re-loads it into the same add-item mini-form (with
  // its existing id preserved) rather than opening a separate edit UI -
  // simplest way to let admin tweak just the rate on a copied item
  // without needing a whole second form. Saving via addItemToDraft
  // would normally create a new id, so editItemInDraft removes the old
  // entry first and addItemToDraft is given the preserved id to put
  // back in the same spot conceptually (a new id is fine here since
  // list order, not identity, is what the customer sees).
  const editItemInDraft = (item) => {
    setNewDraftItem({ desc: item.desc, length: item.length || '', height: item.height || '', qty: item.qty || '1', rate: item.rate || '' });
    setDraftForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== item.id) }));
  };
  const removeItemFromDraft = (id) => setDraftForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }));
  const saveDraft = () => {
    if (!draftForm.label.trim()) { showToast('Option ka naam bharein (jaise Laminate)', true); return; }
    if (draftForm.items.length === 0) { showToast('Kam se kam ek item add karein', true); return; }
    const savedDraft = { ...draftForm, label: draftForm.label.trim(), id: editingDraftId === 'new' ? uid() : editingDraftId };
    const nextDrafts = editingDraftId === 'new' ? [...drafts, savedDraft] : drafts.map((d) => (d.id === editingDraftId ? savedDraft : d));
    onSave({ ...job, estimateDrafts: nextDrafts });
    setEditingDraftId(null);
    setDraftForm(null);
    showToast('Estimate option save ho gaya');
  };
  const deleteDraft = (id) => onSave({ ...job, estimateDrafts: drafts.filter((d) => d.id !== id) });

  if (editingDraftId) {
    // Copy-from picker only makes sense while building a NEW, empty
    // draft and only if at least one other option already has items to
    // copy from - once items exist in this draft (either typed or
    // already copied), copying again would just silently overwrite
    // work in progress, so it's hidden past that point.
    const copyableSources = drafts.filter((d) => d.id !== editingDraftId && (d.items || []).length > 0);
    return (
      <div style={styles.formCard}>
        <div style={styles.fieldLabel}>{editingDraftId === 'new' ? 'Naya Estimate Option' : 'Option Edit Karein'}</div>
        {editingDraftId === 'new' && draftForm.items.length === 0 && copyableSources.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={styles.hintText}>Kisi doosre option se items copy karein (rates baad mein badal sakte hain):</div>
            <div style={styles.chipRow}>
              {copyableSources.map((d) => (
                <button key={d.id} onClick={() => copyItemsFromDraft(d.id)} style={styles.chip}>{d.label} se copy ({d.items.length} items)</button>
              ))}
            </div>
          </div>
        )}
        <input style={styles.input} placeholder="Option ka naam (jaise 'Laminate')" value={draftForm.label} onChange={(e) => setDraftForm((f) => ({ ...f, label: e.target.value }))} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input style={styles.input} placeholder='Company (jaise Kaka)' value={draftForm.materialCompany} onChange={(e) => setDraftForm((f) => ({ ...f, materialCompany: e.target.value }))} />
          <input style={styles.input} placeholder='Sheet weight (kg)' inputMode='decimal' value={draftForm.sheetWeightKg} onChange={(e) => setDraftForm((f) => ({ ...f, sheetWeightKg: e.target.value }))} />
        </div>

        <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Items ({draftForm.items.length})</div>
        {draftForm.items.map((it, i) => {
          const sqft = estimateItemSqft(it);
          return (
            <div key={it.id} style={styles.estItemRow}>
              <div style={styles.estItemNo}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.itemDesc}>{it.desc}</div>
                <div style={styles.itemSub}>{sqft !== null ? (it.length + "' x " + it.height + "' = " + sqft.toFixed(2) + ' sq ft x ' + currency(it.rate)) : ((it.qty || 1) + ' x ' + currency(it.rate))}</div>
              </div>
              <div style={styles.itemAmount}>{currency(estimateItemAmount(it))}</div>
              <button style={styles.iconBtnSmall} onClick={() => editItemInDraft(it)}><Edit3 size={13} color='#B3B8C6' /></button>
              <button style={styles.iconBtnSmall} onClick={() => removeItemFromDraft(it.id)}><Trash2 size={14} color='#C7CCDC' /></button>
            </div>
          );
        })}

        <div style={{ marginTop: 10 }}>
          <input style={styles.input} placeholder='Item description' value={newDraftItem.desc} onChange={(e) => setNewDraftItem((n) => ({ ...n, desc: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={styles.input} placeholder='Length (inch)' inputMode='decimal' value={newDraftItem.length} onChange={(e) => setNewDraftItem((n) => ({ ...n, length: e.target.value }))} />
            <input style={styles.input} placeholder='Height (inch)' inputMode='decimal' value={newDraftItem.height} onChange={(e) => setNewDraftItem((n) => ({ ...n, height: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={styles.input} placeholder='Qty (agar naap nahi)' inputMode='numeric' value={newDraftItem.qty} onChange={(e) => setNewDraftItem((n) => ({ ...n, qty: e.target.value }))} />
            <input style={styles.input} placeholder='Rate ₹' inputMode='decimal' value={newDraftItem.rate} onChange={(e) => setNewDraftItem((n) => ({ ...n, rate: e.target.value }))} />
          </div>
          <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={addItemToDraft}><Plus size={13} /> Item add karein</button>
        </div>

        <div style={styles.totalBar}><span>Option Total</span><span style={styles.totalAmt}>{currency(draftTotal(draftForm))}</span></div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={saveDraft}><Check size={14} /> Option Save Karein</button>
          <button style={styles.cancelBtn} onClick={() => { setEditingDraftId(null); setDraftForm(null); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={styles.fieldLabel}>Compare Materials (optional)</div>
        <button style={styles.linkBtn2} onClick={startNewDraft}>+ Add Option</button>
      </div>
      <div style={styles.plainTextMuted}>Customer ko 2+ material options dikha ke compare karwayein - jo pasand aaye wahi final estimate ban jayega.</div>

      {drafts.length === 0 && <div style={styles.emptySmall}>Abhi koi option nahi bana. Customer ko sirf ek hi estimate ban ke dikhega jab tak options na banayein.</div>}
      {drafts.map((d) => (
        <div key={d.id} style={styles.extraWorkCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.itemDesc}>{d.label}</div>
            <span style={styles.itemAmount}>{currency(draftTotal(d))}</span>
          </div>
          <div style={styles.itemSub}>
            {[d.materialCompany, d.sheetWeightKg && (d.sheetWeightKg + ' kg')].filter(Boolean).join(' - ')}
            {(d.materialCompany || d.sheetWeightKg) && ' - '}
            {d.items.length} item{d.items.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={styles.cardActionBtn} onClick={() => startEditDraft(d)}><Edit3 size={12} /> Edit</button>
            <button style={{ ...styles.cardActionBtn, color: '#C62828' }} onClick={() => deleteDraft(d.id)}><Trash2 size={12} /> Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EstimateItemEditRow({ item, onSave, onCancel }) {
  const [form, setForm] = useState({ desc: item.desc, length: item.length || '', height: item.height || '', qty: item.qty || '1', rate: item.rate || '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div style={styles.formCard}>
      <input style={styles.input} value={form.desc} onChange={(e) => set('desc', e.target.value)} placeholder='Description' />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input style={styles.input} placeholder='Length (inch)' inputMode='decimal' value={form.length} onChange={(e) => set('length', e.target.value)} />
        <input style={styles.input} placeholder='Height (inch)' inputMode='decimal' value={form.height} onChange={(e) => set('height', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input style={styles.input} placeholder='Qty' inputMode='numeric' value={form.qty} onChange={(e) => set('qty', e.target.value)} />
        <input style={styles.input} placeholder='Rate ₹' inputMode='decimal' value={form.rate} onChange={(e) => set('rate', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => onSave(form)}><Check size={14} /> Save</button>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ---- Formal quotation document - matches the business's real estimate
   sheet: header, customer info, item table with sq-ft calc, grand total,
   and the standard terms & conditions block. Visible to both admin
   (preview) and customer (their own job's estimate). ---- */
function QuotationPreview({ job, onClose, showToast }) {
  const total = jobTotal(job);
  const waText = buildEstimateWhatsAppText(job);
  const waUrl = whatsAppShareUrl(job.phone, waText);
  return (
    <div style={styles.overlay} onClick={onClose}>
      {/* Print/PDF: window.print() on the Download PDF button below opens
          the browser's native print dialog, where "Save as PDF" is one of
          the built-in destination options on every phone - no extra
          library needed. This stylesheet only takes effect during actual
          printing (@media print), hiding everything on the page except
          the quotation document itself, so what gets printed/saved is a
          clean one-page estimate rather than the whole app chrome
          (overlay, buttons, bottom nav) that's visible on screen. */}
      <style>
        {'@media print { body * { visibility: hidden; } #quotation-print-area, #quotation-print-area * { visibility: visible; } #quotation-print-area { position: absolute; left: 0; top: 0; width: 100%; } }'}
      </style>
      <div id='quote-sheet-container' style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHeader}>
          <div style={styles.sheetTitle}>Estimate & Invoice</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Screenshots this exact document (logo, colors, everything)
                and attaches it as a real PDF file to WhatsApp's share
                sheet - unlike the plain-text WhatsApp button beside it. */}
            <button style={{ ...styles.waShareBtn, border: 'none', cursor: 'pointer' }} onClick={() => shareEstimatePdf(job, 'quotation-print-area', showToast)}>
              <Send size={13} /> PDF WhatsApp
            </button>
            <a href={waUrl} target='_blank' rel='noopener noreferrer' style={styles.waShareBtn}>
              <Send size={13} /> Text
            </a>
            <button style={styles.pdfDownloadBtn} onClick={() => window.print()}>
              <Download size={13} /> PDF
            </button>
            <button style={styles.iconBtn} onClick={onClose}><X size={20} color={BRAND.navy} /></button>
          </div>
        </div>
        <div style={{ ...styles.sheetBody, padding: 0 }}>
          <div style={styles.quoteDoc} id='quotation-print-area'>
            <div style={styles.quoteBlessingLine}>श्री कृष्ण शरणं ममः</div>

            <div style={styles.quoteHeader}>
              <Logo size={52} />
              <div style={{ flex: 1 }}>
                <div style={styles.quoteBizName}>{BUSINESS.name}</div>
                <div style={styles.quoteDocTitle}>Estimate &amp; Invoice</div>
                <div style={styles.quoteBizContact}>
                  Mobile no. {BUSINESS.phone.replace('+91 ', '')} / {BUSINESS.altPhone.replace('+91 ', '')}. {BUSINESS.website}
                </div>
              </div>
            </div>

            <div style={styles.quoteCustRow}>
              <div>
                <div style={styles.quoteLabel}>Contact Name</div>
                <div style={styles.quoteCustName}>{job.customerName}</div>
                {job.phone && <div style={styles.quoteCustSub}>{formatPhoneDisplay(job.phone) || job.phone}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={styles.quoteLabel}>Date</div>
                <div style={styles.quoteCustSub}>{formatDate(new Date().toISOString())}</div>
              </div>
            </div>
            {job.flatNo && (
              <div style={styles.quoteAddressRow}>
                <span style={styles.quoteLabel}>Flat&nbsp;</span>
                <span style={styles.quoteCustSub}>{job.flatNo}</span>
              </div>
            )}
            {job.address && (
              <div style={styles.quoteAddressRow}>
                <span style={styles.quoteLabel}>Address&nbsp;</span>
                <span style={styles.quoteCustSub}>{job.address}</span>
              </div>
            )}
            {(job.materialCompany || job.sheetWeightKg) && (
              <div style={styles.quoteAddressRow}>
                <span style={styles.quoteLabel}>Material&nbsp;</span>
                <span style={styles.quoteCustSub}>
                  {job.materialCompany}{job.materialCompany && job.sheetWeightKg && ' - '}{job.sheetWeightKg && (job.sheetWeightKg + ' kg sheet')}
                </span>
              </div>
            )}

            <div id='quote-table-wrap' style={styles.quoteTableWrap}>
              <table style={styles.quoteTable}>
                <thead>
                  <tr>
                    <th style={styles.qth}>Sr No</th>
                    <th style={{ ...styles.qth, textAlign: 'left' }}>Item &amp; Description</th>
                    <th style={styles.qth}>Length</th>
                    <th style={styles.qth}>Height</th>
                    <th style={styles.qth}>Sq Feet</th>
                    <th style={styles.qth}>Rate</th>
                    <th style={styles.qth}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(job.items || []).map((it, i) => {
                    const sqft = estimateItemSqft(it);
                    return (
                      <tr key={it.id}>
                        <td style={styles.qtd}>{i + 1}</td>
                        <td style={{ ...styles.qtd, textAlign: 'left' }}>{it.desc}</td>
                        <td style={styles.qtd}>{sqft !== null ? it.length : '-'}</td>
                        <td style={styles.qtd}>{sqft !== null ? it.height : '-'}</td>
                        <td style={styles.qtd}>{sqft !== null ? sqft.toFixed(2) : (it.qty || 1)}</td>
                        <td style={styles.qtd}>{currency(it.rate)}</td>
                        <td style={{ ...styles.qtd, fontWeight: 800 }}>{currency(estimateItemAmount(it))}</td>
                      </tr>
                    );
                  })}
                  {(job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).map((e, i) => (
                    <tr key={e.id}>
                      <td style={styles.qtd}>{(job.items || []).length + i + 1}</td>
                      <td style={{ ...styles.qtd, textAlign: 'left' }}>{e.desc} (Extra Work)</td>
                      <td style={styles.qtd}>-</td>
                      <td style={styles.qtd}>-</td>
                      <td style={styles.qtd}>-</td>
                      <td style={styles.qtd}>-</td>
                      <td style={{ ...styles.qtd, fontWeight: 800 }}>{currency(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {Number(job.discount) > 0 && (
              <>
                <div style={styles.quoteTotalRow}>
                  <span>Subtotal</span>
                  <span style={styles.quoteTotalAmt}>
                    {currency((job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0) + (job.extraWork || []).filter((e) => e.status === 'approved' && !e.mergedIntoEstimate).reduce((s, e) => s + (Number(e.amount) || 0), 0))}
                  </span>
                </div>
                <div style={styles.quoteTotalRow}>
                  <span>Discount</span>
                  <span style={styles.quoteTotalAmt}>- {currency(job.discount)}</span>
                </div>
              </>
            )}
            <div style={styles.quoteTotalRow}>
              <span>Grand Total</span>
              <span style={styles.quoteTotalAmt}>{currency(total)}</span>
            </div>

            <div style={styles.quoteTermsTitle}>Terms &amp; Conditions &amp; Details</div>
            {ESTIMATE_TERMS.map((section, i) => (
              <div key={i} style={styles.quoteTermSection}>
                <div style={styles.quoteTermHeading}>{i + 1}. {section.title}</div>
                {section.points.map((p, j) => (
                  <div key={j} style={styles.quoteTermPoint}>* {p}</div>
                ))}
              </div>
            ))}

            <div style={styles.quoteFooter}>Thank you for choosing {BUSINESS.name}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminJobDetail({ job, onSave, showToast, staff, staffName, itemTemplates, setItemTemplates, pushNotification, categories, gallery }) {
  const [tab, setTab] = useState('status');
  const [resolvingComplaintId, setResolvingComplaintId] = useState(null);
  const [reqLightbox, setReqLightbox] = useState(null);
  const resolveGalleryPhotoForAdmin = (photoId) => {
    for (const cat of Object.keys(gallery || {})) {
      const found = (gallery[cat] || []).find((p) => p.id === photoId);
      if (found) return found;
    }
    return null;
  };
  const [resolutionNoteText, setResolutionNoteText] = useState('');
  const [newItem, setNewItem] = useState({ desc: '', length: '', height: '', qty: '1', rate: '' });
  const [newPayment, setNewPayment] = useState({ amount: '', note: '' });
  const [newExtraWork, setNewExtraWork] = useState({ title: '', items: [] });
  const [newExtraWorkItem, setNewExtraWorkItem] = useState({ desc: '', length: '', height: '', qty: '1', rate: '' });
  const [pricingItems, setPricingItems] = useState([]);
  const [newPricingItem, setNewPricingItem] = useState({ desc: '', length: '', height: '', qty: '1', rate: '' });
  const [pricingId, setPricingId] = useState(null);
  const [priceInput, setPriceInput] = useState('');
  const [replyText, setReplyText] = useState('');
  const [newMaterial, setNewMaterial] = useState({ desc: '', category: 'material' });

  const total = jobTotal(job);
  const paid = jobPaid(job);
  const due = jobDue(job);
  const extraWork = job.extraWork || [];
  const karigarMessages = job.karigarMessages || [];
  const materials = job.materials || [];

  const addMaterial = () => {
    if (!newMaterial.desc.trim()) return;
    const entry = { id: uid(), desc: newMaterial.desc.trim(), category: newMaterial.category, status: 'pending', createdAt: new Date().toISOString() };
    onSave(logActivity({ ...job, materials: [entry, ...materials] }, (newMaterial.category === 'hardware' ? 'Hardware' : 'Material') + ' added: ' + entry.desc));
    setNewMaterial({ desc: '', category: newMaterial.category });
    showToast('Add ho gaya');
  };
  const setMaterialStatus = (id, status) => {
    const next = materials.map((m) => (m.id === id ? { ...m, status, [status + 'At']: new Date().toISOString() } : m));
    onSave({ ...job, materials: next });
  };
  const removeMaterial = (id) => onSave({ ...job, materials: materials.filter((m) => m.id !== id) });

  const sendAdminReply = () => {
    if (!replyText.trim()) return;
    const entry = { id: uid(), text: replyText.trim(), from: 'admin', authorName: staffName || 'Admin', createdAt: new Date().toISOString() };
    onSave({ ...job, karigarMessages: [...karigarMessages, entry] });
    setReplyText('');
    showToast('Reply bhej diya');
  };

  const updateStatus = (status) => {
    let next = { ...job, status };
    next = logActivity(next, 'Status updated: ' + STATUS[status].label);
    onSave(next);
    showToast('Status set to ' + STATUS[status].label);
  };
  const startComplaintRepair = (id) => {
    const complaints = (job.complaints || []).map((c) => (c.id === id ? { ...c, status: 'in_progress' } : c));
    let next = { ...job, complaints };
    next = logActivity(next, 'Complaint repair shuru hua');
    onSave(next);
    showToast('Repair shuru mark ho gaya');
    if (pushNotification) pushNotification('complaint_in_progress', 'Aapki complaint par repair shuru ho gaya hai', job.id);
  };
  const resolveComplaint = (id, resolutionNote) => {
    const complaints = (job.complaints || []).map((c) => (c.id === id ? { ...c, status: 'resolved', resolvedAt: new Date().toISOString(), resolutionNote: resolutionNote || '' } : c));
    let next = { ...job, complaints };
    next = logActivity(next, 'Complaint resolved');
    onSave(next);
    showToast('Complaint resolved mark ho gayi');
    if (pushNotification) pushNotification('complaint_resolved', 'Aapki complaint solve ho gayi hai', job.id);
  };

  const addItem = () => {
    if (!newItem.desc.trim()) return;
    const item = {
      id: uid(),
      desc: newItem.desc.trim(),
      length: newItem.length || '',
      height: newItem.height || '',
      qty: newItem.qty || '1',
      rate: newItem.rate || '0',
    };
    let next = { ...job, items: [...(job.items || []), item] };
    next = logActivity(next, 'Estimate item added: ' + newItem.desc.trim());
    onSave(next);
    setNewItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  const updateItem = (id, patch) => {
    onSave({ ...job, items: job.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  };
  const removeItem = (id) => onSave({ ...job, items: job.items.filter((it) => it.id !== id) });

  const addPayment = () => {
    if (!newPayment.amount) return;
    let nextJob = { ...job, payments: [...(job.payments || []), { id: uid(), amount: newPayment.amount, note: newPayment.note.trim(), date: new Date().toISOString() }] };
    nextJob = logActivity(nextJob, 'Payment received: ' + currency(newPayment.amount));
    // jobTotal(nextJob) > 0 guards against a job with NO estimate yet
    // (jobTotal is 0, so jobDue is trivially 0 too) auto-flipping to
    // "paid" the moment ANY stray payment gets recorded - the Payment
    // tab is reachable at any stage, even before an estimate exists, so
    // without this guard a payment entered too early would skip the
    // job straight past appointment/estimate/in_progress to paid.
    if (jobTotal(nextJob) > 0 && jobDue(nextJob) <= 0 && nextJob.status !== 'paid') nextJob.status = 'paid';
    onSave(nextJob);
    setNewPayment({ amount: '', note: '' });
    showToast('Payment recorded');
  };
  const removePayment = (id) => onSave({ ...job, payments: job.payments.filter((p) => p.id !== id) });

  // Admin adding extra work directly (with items already known) skips
  // straight to pending_customer_approval, since there's no price gap to
  // fill - unlike a customer-initiated request, which starts priceless.
  // Extra work is now itemized (desc/length/height/qty/rate per line,
  // same shape as the main estimate) instead of a single typed amount -
  // so admin, and the customer reviewing it, can see exactly what size
  // and rate make up the total, not just a lump-sum number with no way
  // to verify it. `amount` is still kept as a plain computed sum
  // alongside `items`, since a lot of existing code (jobTotal, the
  // estimate table, WhatsApp/PDF text, notifications) reads `amount`
  // directly - keeping it in sync means none of that had to change,
  // while anything that wants to show the itemized breakdown now can.
  const addItemToNewExtraWork = () => {
    if (!newExtraWorkItem.desc.trim()) return;
    const item = { id: uid(), desc: newExtraWorkItem.desc.trim(), length: newExtraWorkItem.length || '', height: newExtraWorkItem.height || '', qty: newExtraWorkItem.qty || '1', rate: newExtraWorkItem.rate || '0' };
    setNewExtraWork((f) => ({ ...f, items: [...f.items, item] }));
    setNewExtraWorkItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  const removeItemFromNewExtraWork = (id) => setNewExtraWork((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }));
  const addExtraWork = (selfApprove) => {
    if (newExtraWork.items.length === 0) { showToast('Kam se kam ek item add karein', true); return; }
    const amount = newExtraWork.items.reduce((s, it) => s + estimateItemAmount(it), 0);
    const desc = newExtraWork.title.trim() || newExtraWork.items.map((it) => it.desc).join(', ');
    const entry = { id: uid(), desc, items: newExtraWork.items, amount, addedBy: 'admin', status: selfApprove ? 'approved' : 'pending_customer_approval', createdAt: new Date().toISOString(), respondedAt: selfApprove ? new Date().toISOString() : null };
    let next = { ...job, extraWork: [entry, ...extraWork] };
    next = logActivity(next, (selfApprove ? 'Extra work add ho gaya: ' : 'Extra work added: ') + entry.desc + ' (' + currency(entry.amount) + ')');
    onSave(next);
    setNewExtraWork({ title: '', items: [] });
    showToast(selfApprove ? 'Extra work add ho gaya aur estimate mein shaamil ho gaya' : 'Extra work added, customer approval ke liye bheja gaya');
  };
  // Pricing a customer-requested item (which arrives with only a text
  // description, no amount) works the same itemized way - admin builds
  // out the sizes/rates that make up the price rather than typing one
  // flat number, giving the customer the same visibility into what
  // they're being charged for as a normal estimate line would.
  const startPricingItem = (item) => {
    setPricingId(item.id);
    setPricingItems([]);
    setNewPricingItem({ desc: item.desc, length: '', height: '', qty: '1', rate: '' });
  };
  const addItemToPricing = () => {
    if (!newPricingItem.desc.trim()) return;
    const item = { id: uid(), desc: newPricingItem.desc.trim(), length: newPricingItem.length || '', height: newPricingItem.height || '', qty: newPricingItem.qty || '1', rate: newPricingItem.rate || '0' };
    setPricingItems((items) => [...items, item]);
    setNewPricingItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  const removeItemFromPricing = (id) => setPricingItems((items) => items.filter((it) => it.id !== id));
  const setExtraWorkPrice = (item) => {
    if (pricingItems.length === 0) { showToast('Kam se kam ek item add karein', true); return; }
    const amount = pricingItems.reduce((s, it) => s + estimateItemAmount(it), 0);
    const next = { ...job, extraWork: extraWork.map((e) => (e.id === item.id ? { ...e, items: pricingItems, amount, status: 'pending_customer_approval' } : e)) };
    onSave(logActivity(next, 'Extra work priced: ' + item.desc + ' (' + currency(amount) + ')'));
    if (pushNotification) {
      pushNotification('extra_work_needs_price', 'Aapke extra kaam "' + item.desc + '" ka price ' + currency(amount) + ' set ho gaya hai - approve karein', job.id);
    }
    setPricingId(null);
    setPricingItems([]);
    showToast('Price set, customer approval ke liye bheja gaya');
  };
  const removeExtraWork = (id) => onSave({ ...job, extraWork: extraWork.filter((e) => e.id !== id) });
  // Folds an approved extra-work entry's line items into the main
  // estimate (job.items), so once work is done, the final estimate
  // reads as ONE consolidated list instead of the base items plus a
  // permanently-separate "extra work" total tacked on alongside it -
  // useful once the job is wrapping up and the estimate needs to
  // reflect everything that was actually built. The entry stays in
  // extraWork history (marked mergedIntoEstimate) rather than being
  // deleted, so the "why did the estimate grow" trail is still there;
  // every approved-total calculation above now excludes merged entries
  // specifically so the amount isn't counted twice (once via items,
  // once via the separate extra-work total).
  const mergeExtraWorkIntoEstimate = (entry) => {
    const itemsToAdd = (entry.items && entry.items.length > 0)
      ? entry.items.map((it) => ({ ...it, id: uid() }))
      : [{ id: uid(), desc: entry.desc, length: '', height: '', qty: '1', rate: String(entry.amount) }];
    let next = {
      ...job,
      items: [...(job.items || []), ...itemsToAdd],
      extraWork: extraWork.map((e) => (e.id === entry.id ? { ...e, mergedIntoEstimate: true } : e)),
    };
    next = logActivity(next, 'Extra work estimate mein merge kiya: ' + entry.desc + ' (' + currency(entry.amount) + ')');
    onSave(next);
    showToast('Estimate mein merge ho gaya');
  };

  const addPhotosFromPanel = async (photos) => {
    // Same fix as KarigarApp's addPhotos: each photo is uploaded to
    // Firebase Storage, and only the resulting (short) download URL is
    // kept in job.progressPhotos - never the raw base64 - to avoid
    // overflowing the single shared 'jobs' Firestore document (see
    // persistJobs).
    const newPhotos = [];
    for (const p of photos) {
      const id = uid();
      const uploaded = await window.fileStorage.upload('progress_' + id, p.url);
      if (uploaded && !uploaded.error) {
        newPhotos.push({ id, url: uploaded.url, origUrl: p.origUrl || null, caption: p.caption, date: new Date().toISOString() });
      } else {
        showToast('Ek photo save nahi ho payi: ' + (uploaded?.error || 'unknown error'), true);
      }
    }
    if (newPhotos.length === 0) return false;
    let next = { ...job, progressPhotos: [...(job.progressPhotos || []), ...newPhotos] };
    next = logActivity(next, newPhotos.length + ' new progress photo' + (newPhotos.length !== 1 ? 's' : '') + ' added');
    const ok = await onSave(next);
    if (ok) showToast(newPhotos.length + ' progress photo' + (newPhotos.length !== 1 ? 's' : '') + ' added');
    return ok;
  };
  const removePhoto = (id) => onSave({ ...job, progressPhotos: job.progressPhotos.filter((p) => p.id !== id) });

  return (
    <div>
      <div style={styles.tabRow}>
        <TabBtn active={tab === 'appointment'} onClick={() => setTab('appointment')} label='Appointment' />
        <TabBtn active={tab === 'status'} onClick={() => setTab('status')} label='Status' />
        <TabBtn active={tab === 'estimate'} onClick={() => setTab('estimate')} label='Estimate' />
        <TabBtn active={tab === 'extrawork'} onClick={() => setTab('extrawork')} label='Extra Work' />
        <TabBtn active={tab === 'payment'} onClick={() => setTab('payment')} label='Payment' />
        <TabBtn active={tab === 'req'} onClick={() => setTab('req')} label='Requirements' />
        <TabBtn active={tab === 'photos'} onClick={() => setTab('photos')} label='Progress' />
        <TabBtn active={tab === 'activity'} onClick={() => setTab('activity')} label='Activity' />
        <TabBtn active={tab === 'notes'} onClick={() => setTab('notes')} label='Notes' />
        <TabBtn active={tab === 'karigar'} onClick={() => setTab('karigar')} label='Karigar' />
        <TabBtn active={tab === 'materials'} onClick={() => setTab('materials')} label='Material' />
      </div>

      <div style={{ padding: '14px 16px' }}>
        {tab === 'appointment' && (
          <AdminAppointmentTab job={job} onSave={onSave} showToast={showToast} pushNotification={pushNotification} />
        )}

        {tab === 'status' && (
          <div>
            <div style={styles.fieldLabel}>Move job to stage</div>
            <div style={styles.stageGrid}>
              {STATUS_ORDER.map((s) => {
                const Icon = STATUS[s].icon;
                return (
                  <button key={s} onClick={() => updateStatus(s)} style={{ ...styles.stageBtn, ...(job.status === s ? { background: STATUS[s].color, color: '#FFF', borderColor: STATUS[s].color } : {}) }}>
                    <Icon size={14} style={{ marginRight: 7 }} />
                    {STATUS[s].label}
                    {job.status === s && <CheckCircle2 size={13} style={{ marginLeft: 'auto' }} />}
                  </button>
                );
              })}
            </div>

            {staff && staff.some((s) => s.role === 'karigar') && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Karigar assign karein</div>
                <select style={styles.input} value={job.assignedStaffId || ''} onChange={(e) => onSave({ ...job, assignedStaffId: e.target.value || null })}>
                  <option value=''>Koi assign nahi</option>
                  {staff.filter((s) => s.role === 'karigar').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {(job.complaints || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Complaints ({job.complaints.length})</div>
                {job.complaints.map((c) => (
                  <div key={c.id} style={{ ...styles.formCard, marginTop: 8, padding: 10 }}>
                    <div style={styles.itemDesc}>{c.text}</div>
                    <div style={styles.itemSub}>{formatDate(c.createdAt)}</div>
                    <ComplaintStageStepper status={c.status} />
                    {c.status === 'open' && (
                      <button style={{ ...styles.cardActionBtn, marginTop: 10 }} onClick={() => startComplaintRepair(c.id)}><Hammer size={13} /> Repair Shuru Karein</button>
                    )}
                    {c.status === 'in_progress' && (
                      resolvingComplaintId === c.id ? (
                        <div style={{ marginTop: 10 }}>
                          <textarea style={{ ...styles.input, minHeight: 50, resize: 'vertical' }} placeholder='Kya theek kiya (optional note customer ko dikhega)' value={resolutionNoteText} onChange={(e) => setResolutionNoteText(e.target.value)} autoFocus />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => { resolveComplaint(c.id, resolutionNoteText); setResolvingComplaintId(null); setResolutionNoteText(''); }}>Resolved Mark Karein</button>
                            <button style={styles.cancelBtn} onClick={() => { setResolvingComplaintId(null); setResolutionNoteText(''); }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button style={{ ...styles.cardActionBtn, marginTop: 10 }} onClick={() => setResolvingComplaintId(c.id)}><CheckCircle2 size={13} /> Resolved Mark Karein</button>
                      )
                    )}
                    {c.status === 'resolved' && c.resolutionNote && (
                      <div style={{ ...styles.plainTextMuted, marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + BRAND.line }}>{c.resolutionNote}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(job.status === 'delivered' || job.status === 'paid') && (
              <button style={{ ...styles.addBtn, marginTop: 16 }} onClick={() => generateWarrantyCertificate(job, showToast)}><FileText size={14} /> Warranty Certificate Download Karein</button>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Expected Completion Date</div>
              <div style={styles.plainTextMuted}>Customer ko Home screen par dikhega.</div>
              <input type='date' style={styles.input} value={job.expectedCompletionDate || ''} onChange={(e) => onSave({ ...job, expectedCompletionDate: e.target.value || null })} />
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Material (poore estimate ke liye)</div>
              <div style={styles.plainTextMuted}>Kaunsi company ki sheet, kitni kg - poore estimate mein ek hi material use hota hai.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input style={styles.input} placeholder='Company (jaise Kaka)' value={job.materialCompany || ''} onChange={(e) => onSave({ ...job, materialCompany: e.target.value })} />
                <input style={styles.input} placeholder='Sheet weight (kg)' inputMode='decimal' value={job.sheetWeightKg || ''} onChange={(e) => onSave({ ...job, sheetWeightKg: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Work % Complete</div>
              <div style={styles.plainTextMuted}>Kaam kitna hua hai - payment lena ho to yaad dilata hai.</div>
              <div style={styles.chipRow}>
                {[0, 25, 50, 75, 100].map((pct) => (
                  <button key={pct} onClick={() => onSave({ ...job, workPercent: pct })} style={{ ...styles.chip, ...((job.workPercent || 0) === pct ? styles.chipActive : {}) }}>{pct}%</button>
                ))}
              </div>
              {(job.workPercent || 0) > 0 && jobDue(job) > 0 && (
                <div style={styles.milestoneRow}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.itemDesc}>Kaam {job.workPercent}% hua hai</div>
                    <div style={styles.itemSub}>{currency(jobDue(job))} abhi bhi due hai</div>
                  </div>
                  <a
                    href={whatsAppShareUrl(job.phone, 'Namaste ' + job.customerName + ', aapka kaam ' + job.workPercent + '% ho gaya hai. Payment due hai: ' + currency(jobDue(job)) + '. Shree Krushn PVC Furniture.')}
                    target='_blank' rel='noopener noreferrer' style={styles.waReminderBtn}
                  >
                    <Send size={13} /> Remind
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'estimate' && (
          <AdminEstimateTab job={job} onSave={onSave} newItem={newItem} setNewItem={setNewItem} addItem={addItem} updateItem={updateItem} removeItem={removeItem} total={total} itemTemplates={itemTemplates} setItemTemplates={setItemTemplates} showToast={showToast} />
        )}

        {tab === 'extrawork' && (
          <div>
            <div style={styles.fieldLabel}>Naya extra work add karein</div>
            <div style={styles.formCard}>
              <input style={styles.input} placeholder='Title (optional - jaise "Extra shelving")' value={newExtraWork.title} onChange={(e) => setNewExtraWork((n) => ({ ...n, title: e.target.value }))} />

              <div style={{ ...styles.fieldLabel, marginTop: 10 }}>Items ({newExtraWork.items.length})</div>
              {newExtraWork.items.map((it, i) => {
                const sqft = estimateItemSqft(it);
                return (
                  <div key={it.id} style={styles.estItemRow}>
                    <div style={styles.estItemNo}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.itemDesc}>{it.desc}</div>
                      <div style={styles.itemSub}>{sqft !== null ? (it.length + "' x " + it.height + "' = " + sqft.toFixed(2) + ' sq ft x ' + currency(it.rate)) : ((it.qty || 1) + ' x ' + currency(it.rate))}</div>
                    </div>
                    <div style={styles.itemAmount}>{currency(estimateItemAmount(it))}</div>
                    <button style={styles.iconBtnSmall} onClick={() => removeItemFromNewExtraWork(it.id)}><Trash2 size={14} color='#C7CCDC' /></button>
                  </div>
                );
              })}

              <input style={{ ...styles.input, marginTop: 8 }} placeholder='Item description' value={newExtraWorkItem.desc} onChange={(e) => setNewExtraWorkItem((n) => ({ ...n, desc: e.target.value }))} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={styles.input} placeholder='Length (inch)' inputMode='decimal' value={newExtraWorkItem.length} onChange={(e) => setNewExtraWorkItem((n) => ({ ...n, length: e.target.value }))} />
                <input style={styles.input} placeholder='Height (inch)' inputMode='decimal' value={newExtraWorkItem.height} onChange={(e) => setNewExtraWorkItem((n) => ({ ...n, height: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={styles.input} placeholder='Qty (agar naap nahi)' inputMode='numeric' value={newExtraWorkItem.qty} onChange={(e) => setNewExtraWorkItem((n) => ({ ...n, qty: e.target.value }))} />
                <input style={styles.input} placeholder='Rate ₹' inputMode='decimal' value={newExtraWorkItem.rate} onChange={(e) => setNewExtraWorkItem((n) => ({ ...n, rate: e.target.value }))} />
              </div>
              <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={addItemToNewExtraWork}><Plus size={13} /> Item add karein</button>

              {newExtraWork.items.length > 0 && (
                <div style={styles.totalBar}><span>Extra Work Total</span><span style={styles.totalAmt}>{currency(newExtraWork.items.reduce((s, it) => s + estimateItemAmount(it), 0))}</span></div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={{ ...styles.addBtn, flex: 1, marginTop: 0 }} onClick={() => addExtraWork(false)}><Send size={14} /> Customer Approval Bhejein</button>
                <button style={{ ...styles.addBtn, flex: 1, marginTop: 0, background: BRAND.navy, color: '#FFF', border: 'none' }} onClick={() => addExtraWork(true)}><CheckCircle2 size={14} /> Seedha Add Karein</button>
              </div>
            </div>

            <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Extra work history ({extraWork.length})</div>
            {extraWork.length === 0 && <div style={styles.emptySmall}>Koi extra work nahi hai.</div>}
            {extraWork.map((e) => (
              <div key={e.id} style={styles.extraWorkCard}>
                <div style={styles.itemDesc}>{e.desc}</div>
                <div style={styles.itemSub}>{e.addedBy === 'admin' ? 'Aapne add kiya' : 'Customer ne request kiya'} - {formatDate(e.createdAt)}</div>

                {(e.items || []).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {e.items.map((it) => {
                      const sqft = estimateItemSqft(it);
                      return (
                        <div key={it.id} style={styles.itemSub}>
                          {it.desc} - {sqft !== null ? (sqft.toFixed(2) + ' sq ft x ' + currency(it.rate)) : ((it.qty || 1) + ' x ' + currency(it.rate))} = {currency(estimateItemAmount(it))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {e.status === 'pending_admin_price' && pricingId !== e.id && (
                  <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={() => startPricingItem(e)}>Price set karein</button>
                )}
                {pricingId === e.id && (
                  <div style={{ marginTop: 8 }}>
                    {pricingItems.map((it, i) => {
                      const sqft = estimateItemSqft(it);
                      return (
                        <div key={it.id} style={styles.estItemRow}>
                          <div style={styles.estItemNo}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={styles.itemDesc}>{it.desc}</div>
                            <div style={styles.itemSub}>{sqft !== null ? (it.length + "' x " + it.height + "' = " + sqft.toFixed(2) + ' sq ft x ' + currency(it.rate)) : ((it.qty || 1) + ' x ' + currency(it.rate))}</div>
                          </div>
                          <div style={styles.itemAmount}>{currency(estimateItemAmount(it))}</div>
                          <button style={styles.iconBtnSmall} onClick={() => removeItemFromPricing(it.id)}><Trash2 size={14} color='#C7CCDC' /></button>
                        </div>
                      );
                    })}
                    <input style={{ ...styles.input, marginTop: 8 }} placeholder='Item description' value={newPricingItem.desc} onChange={(ev) => setNewPricingItem((n) => ({ ...n, desc: ev.target.value }))} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input style={styles.input} placeholder='Length (inch)' inputMode='decimal' value={newPricingItem.length} onChange={(ev) => setNewPricingItem((n) => ({ ...n, length: ev.target.value }))} />
                      <input style={styles.input} placeholder='Height (inch)' inputMode='decimal' value={newPricingItem.height} onChange={(ev) => setNewPricingItem((n) => ({ ...n, height: ev.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input style={styles.input} placeholder='Qty' inputMode='numeric' value={newPricingItem.qty} onChange={(ev) => setNewPricingItem((n) => ({ ...n, qty: ev.target.value }))} />
                      <input style={styles.input} placeholder='Rate ₹' inputMode='decimal' value={newPricingItem.rate} onChange={(ev) => setNewPricingItem((n) => ({ ...n, rate: ev.target.value }))} />
                    </div>
                    <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={addItemToPricing}><Plus size={13} /> Item add karein</button>
                    {pricingItems.length > 0 && (
                      <div style={styles.hintText}>Total: {currency(pricingItems.reduce((s, it) => s + estimateItemAmount(it), 0))}</div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => setExtraWorkPrice(e)}>Save</button>
                      <button style={styles.cancelBtn} onClick={() => { setPricingId(null); setPricingItems([]); }}>Cancel</button>
                    </div>
                  </div>
                )}
                {e.status === 'pending_customer_approval' && (
                  <div style={{ ...styles.estimateStatusBanner, background: '#FFF3E0', color: '#E65100', marginTop: 8 }}>
                    <AlertCircle size={14} /> Customer approval ka wait hai - {currency(e.amount)}
                  </div>
                )}
                {e.status === 'approved' && (
                  <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32', marginTop: 8 }}>
                    <ThumbsUp size={14} /> Approved - {currency(e.amount)}
                  </div>
                )}
                {e.status === 'approved' && !e.mergedIntoEstimate && (
                  <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={() => mergeExtraWorkIntoEstimate(e)}><FileText size={13} /> Estimate Mein Merge Karein</button>
                )}
                {e.mergedIntoEstimate && (
                  <div style={{ ...styles.itemSub, marginTop: 6 }}>Estimate ke items mein merge ho chuka hai</div>
                )}
                {e.status === 'rejected' && (
                  <div style={{ ...styles.estimateStatusBanner, background: '#FFEBEE', color: '#C62828', marginTop: 8 }}>
                    <XCircle size={14} /> Customer ne reject kiya
                  </div>
                )}
                <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={() => removeExtraWork(e.id)}><Trash2 size={12} /> Remove</button>
              </div>
            ))}
          </div>
        )}

        {tab === 'payment' && (
          <div>
            <div style={{ ...styles.payStrip, marginTop: 10 }}>
              <MoneyBit label='Total' value={currency(total)} />
              <MoneyBit label='Paid' value={currency(paid)} muted />
              <MoneyBit label='Due' value={currency(due)} highlight={due > 0} />
            </div>

            {total > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={styles.fieldLabel}>Payment Milestones (50 / 40 / 10)</div>
                {jobMilestoneStatus(job).map((m) => {
                  const reminderText = 'Namaste ' + job.customerName + ', aapka ' + m.label + ' payment due hai: ' + currency(m.due) + '. Shree Krushn PVC Furniture.';
                  const reminderUrl = whatsAppShareUrl(job.phone, reminderText);
                  return (
                    <div key={m.key} style={styles.milestoneRow}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.itemDesc}>{m.label}</div>
                        <div style={styles.itemSub}>
                          {!m.reached ? ('Upcoming - ' + currency(m.amount)) :
                           m.due > 0 ? ('Due now - ' + currency(m.due) + ' (of ' + currency(m.amount) + ')') :
                           ('Collected - ' + currency(m.amount))}
                        </div>
                      </div>
                      {m.reached && m.due === 0 && <CheckCircle2 size={16} color='#2F7D4F' />}
                      {m.reached && m.due > 0 && (
                        <a href={reminderUrl} target='_blank' rel='noopener noreferrer' style={styles.waReminderBtn}>
                          <Send size={13} /> Remind
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Payment history</div>
            {(job.payments || []).length === 0 && <div style={styles.emptySmall}>No payments recorded yet.</div>}
            {(job.payments || []).map((p) => (
              <div key={p.id} style={styles.itemRow}>
                <div style={{ flex: 1 }}>
                  <div style={styles.itemDesc}>{currency(p.amount)}</div>
                  <div style={styles.itemSub}>{formatDate(p.date)} {p.note && ('- ' + p.note)}</div>
                </div>
                <button style={{ ...styles.iconBtnSmall, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => shareReceiptPdf(job, p, showToast)}><Send size={14} color='#25D366' /></button>
                <button style={styles.iconBtnSmall} onClick={() => generateReceiptPdf(job, p, showToast)}><FileText size={14} color='#3D6B66' /></button>
                <button style={styles.iconBtnSmall} onClick={() => removePayment(p.id)}><Trash2 size={14} color='#C7CCDC' /></button>
              </div>
            ))}
            <div style={styles.addRow}>
              <input style={{ ...styles.input, flex: 1 }} placeholder='Amount ₹' inputMode='decimal' value={newPayment.amount} onChange={(e) => setNewPayment((n) => ({ ...n, amount: e.target.value }))} />
              <input style={{ ...styles.input, flex: 1.4 }} placeholder='Note' value={newPayment.note} onChange={(e) => setNewPayment((n) => ({ ...n, note: e.target.value }))} />
            </div>
            <button style={styles.addBtn} onClick={addPayment}><Plus size={14} /> Record payment</button>
          </div>
        )}

        {tab === 'req' && (
          <div>
            <div style={styles.fieldLabel}>Customer requirements</div>
            {(job.requirements || []).length === 0 && <div style={styles.emptySmall}>Customer ne abhi koi requirement nahi di.</div>}
            {(job.requirements || []).map((r) => (
              <div key={r.id} style={styles.reqRow}>
                {r.photoRef && resolveGalleryPhotoForAdmin(r.photoRef.photoId) && (
                  <button style={{ ...styles.reqThumb, border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setReqLightbox({ photos: [resolveGalleryPhotoForAdmin(r.photoRef.photoId)], index: 0 })}>
                    <SmartImg src={resolveGalleryPhotoForAdmin(r.photoRef.photoId).url} origUrl={resolveGalleryPhotoForAdmin(r.photoRef.photoId).origUrl} alt={r.text} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                )}
                {r.ownPhoto && (
                  <button style={{ ...styles.reqThumb, border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setReqLightbox({ photos: [{ id: r.id, url: r.ownPhoto.url, origUrl: r.ownPhoto.origUrl, caption: r.text }], index: 0 })}>
                    <SmartImg src={r.ownPhoto.url} origUrl={r.ownPhoto.origUrl} alt={r.text} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                )}
                <span style={styles.reqCatBadge}>{r.category}</span>
                <div style={{ flex: 1 }}>
                  <div style={styles.reqText}>{r.text}</div>
                  <div style={styles.reqMetaRow}>
                    {r.dimensions && <span style={styles.reqDim}>{r.dimensions}</span>}
                    {r.priority && r.priority !== 'normal' && (
                      <span style={{ ...styles.reqPriorityTag, color: REQ_PRIORITY[r.priority].color, background: REQ_PRIORITY[r.priority].bg }}>{REQ_PRIORITY[r.priority].label}</span>
                    )}
                    <span style={styles.itemSub}>{formatDate(r.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
            {reqLightbox && <Lightbox data={reqLightbox} onClose={() => setReqLightbox(null)} setLightbox={setReqLightbox} />}
          </div>
        )}

        {tab === 'photos' && (
          <div>
            {(job.workPercent || 0) > 0 && (
              <div style={{ ...styles.deliveryDateBanner, marginBottom: 12 }}>
                <Hammer size={15} color={BRAND.gold} />
                <span>Kaam <b>{job.workPercent}%</b> complete ho gaya hai</span>
              </div>
            )}
            <div style={styles.fieldLabel}>Progress photos</div>
            <div style={styles.photoGrid}>
              {(job.progressPhotos || []).map((p) => (
                <div key={p.id} style={styles.progressPhotoCard}>
                  <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption} style={styles.photoImg} />
                  <button style={styles.photoDeleteBtn} onClick={() => removePhoto(p.id)}><Trash2 size={12} color='#FFF' /></button>
                  {p.caption && <div style={styles.progressCaption}>{p.caption}</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <PhotoAddPanel
                addLabel='Add progress photo'
                showToast={showToast}
                onAdd={addPhotosFromPanel}
              />
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div>
            <div style={styles.fieldLabel}>Activity log</div>
            {(job.activity || []).length === 0 && <div style={styles.emptySmall}>Koi activity nahi.</div>}
            <div style={styles.activityList}>
              {(job.activity || []).map((a) => (
                <div key={a.id} style={styles.activityRow}>
                  <div style={styles.activityDot} />
                  <div style={{ flex: 1 }}>
                    <div style={styles.activityText}>{a.text}</div>
                    <div style={styles.itemSub}>{timeAgo(a.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <ProjectNotesPanel job={job} onSave={onSave} showToast={showToast} authorRole='admin' authorName={staffName || 'Admin'} categories={categories} />
        )}

        {tab === 'karigar' && (
          <div>
            <div style={styles.fieldLabel}>Karigar se Messages</div>
            <div style={styles.plainTextMuted}>Assigned karigar ke sawal yahan aayenge, reply karein.</div>
            {karigarMessages.length === 0 && <div style={styles.emptySmall}>Abhi koi message nahi hai.</div>}
            {karigarMessages.map((m) => (
              <div key={m.id} style={{ ...styles.extraWorkCard, ...(m.from === 'admin' ? { background: '#E1EDEA' } : {}) }}>
                <div style={styles.itemSub}>{m.authorName} - {formatDate(m.createdAt)}</div>
                <div style={{ ...styles.itemDesc, marginTop: 4 }}>{m.text}</div>
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <textarea style={{ ...styles.input, minHeight: 60 }} placeholder='Reply likhein...' value={replyText} onChange={(e) => setReplyText(e.target.value)} />
              <button style={styles.addBtn} onClick={sendAdminReply}><Send size={14} /> Reply bhejein</button>
            </div>
          </div>
        )}

        {tab === 'materials' && (
          <div>
            <div style={styles.fieldLabel}>Material &amp; Hardware</div>
            <div style={styles.plainTextMuted}>Kya order karna hai, kya customer ne handle/glass select kiya - sab yahan track karein.</div>

            <div style={styles.formCard}>
              <input style={styles.input} placeholder='Kya chahiye (jaise "Rose gold handle" ya "Kaka PVC sheet 18mm")' value={newMaterial.desc} onChange={(e) => setNewMaterial((n) => ({ ...n, desc: e.target.value }))} />
              <div style={styles.chipRow}>
                <button onClick={() => setNewMaterial((n) => ({ ...n, category: 'material' }))} style={{ ...styles.chip, ...(newMaterial.category === 'material' ? styles.chipActive : {}) }}>Material</button>
                <button onClick={() => setNewMaterial((n) => ({ ...n, category: 'hardware' }))} style={{ ...styles.chip, ...(newMaterial.category === 'hardware' ? styles.chipActive : {}) }}>Hardware/Fitting</button>
              </div>
              <button style={styles.addBtn} onClick={addMaterial}><Plus size={14} /> Add karein</button>
            </div>

            {materials.length === 0 && <div style={styles.emptySmall}>Abhi koi material/hardware add nahi kiya.</div>}
            {materials.map((m) => (
              <div key={m.id} style={styles.extraWorkCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={styles.itemDesc}>{m.desc} <span style={styles.reqCatBadge}>{m.category === 'hardware' ? 'Hardware' : 'Material'}</span></div>
                  <button style={styles.iconBtnSmall} onClick={() => removeMaterial(m.id)}><Trash2 size={13} color='#C7CCDC' /></button>
                </div>
                <div style={styles.itemSub}>Status: {m.status === 'pending' ? 'Pending' : m.status === 'ordered' ? 'Order ho gaya' : 'Aa gaya'}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button style={{ ...styles.chip, ...(m.status === 'pending' ? styles.chipActive : {}) }} onClick={() => setMaterialStatus(m.id, 'pending')}>Pending</button>
                  <button style={{ ...styles.chip, ...(m.status === 'ordered' ? styles.chipActive : {}) }} onClick={() => setMaterialStatus(m.id, 'ordered')}>Ordered</button>
                  <button style={{ ...styles.chip, ...(m.status === 'arrived' ? styles.chipActive : {}) }} onClick={() => setMaterialStatus(m.id, 'arrived')}>Arrived</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }) {
  return <button onClick={onClick} style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : {}) }}>{label}</button>;
}

/* ---- Photo URL input: user types/pastes the ORIGINAL link as-is (we never
   silently rewrite what they see in the box - that hid what was actually
   pasted and made mistakes hard to spot). We show a live preview using the
   full candidate-URL fallback chain, so what you see here is what will
   actually render after saving. ---- */
function PhotoUrlInput({ value, onChange, placeholder }) {
  const isDrive = isLikelyDriveLink(value);
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          style={{ ...styles.input, paddingRight: 32 }}
          placeholder={placeholder || 'Image URL ya Google Drive link paste karein'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Link2 size={14} color='#C7CCDC' style={{ position: 'absolute', right: 10, top: 12 }} />
      </div>
      {isDrive && (
        <div style={styles.convertedTag}><Check size={11} /> Google Drive link - preview neeche check karein</div>
      )}
      {value.trim() && (
        <div style={styles.previewWrap}>
          <SmartImg
            src={toDirectImageUrl(value)}
            origUrl={value}
            alt='preview'
            style={styles.previewImg}
          />
        </div>
      )}
      {isDrive && (
        <div style={styles.hintText}>
          Agar preview nahi dikh raha: Drive file ko 'Anyone with the link' pe share karein (Viewer access).
        </div>
      )}
    </div>
  );
}

/* ---- Combined photo add: toggle between uploading straight from the
   device (camera/gallery) or pasting a URL/Drive link. Upload path reads
   the file, keeps full quality, and only compresses if it exceeds the
   5MB storage cap. onAdd receives { url, origUrl } ready to save. ---- */
function PhotoAddPanel({ onAdd, addLabel, showToast }) {
  const [mode, setMode] = useState('upload'); // upload | link
  const [linkValue, setLinkValue] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { done, total }
  // Holds one or more processed photos awaiting confirmation. Kept as an
  // array even for a single photo so the multi-select flow (picking
  // several files at once) and the single-photo flow share one code path.
  const [pendingUploads, setPendingUploads] = useState([]); // [{ dataUri, sizeMb, name }]
  const fileInputRef = React.useRef(null);

  const handleFilesPicked = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow picking the same file(s) again later
    if (files.length === 0) return;
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { showToast('Sirf image files select karein', true); return; }
    if (imageFiles.length < files.length) {
      showToast((files.length - imageFiles.length) + ' file(s) skip ki gayi (image nahi thi)', true);
    }
    setUploading(true);
    setUploadProgress({ done: 0, total: imageFiles.length });
    const results = [];
    for (const file of imageFiles) {
      try {
        const dataUri = await prepareImageForUpload(file);
        const sizeBytes = dataUriByteSize(dataUri);
        if (sizeBytes > MAX_PHOTO_BYTES) {
          showToast("'" + file.name + "' bahut badi hai (" + (sizeBytes / (1024 * 1024)).toFixed(1) + 'MB) - skip ki gayi', true);
        } else {
          results.push({ dataUri, sizeMb: (sizeBytes / (1024 * 1024)).toFixed(1), name: file.name });
        }
      } catch (err) {
        showToast("'" + file.name + "' process nahi ho payi, skip ki gayi", true);
      }
      setUploadProgress((p) => ({ done: (p ? p.done : 0) + 1, total: imageFiles.length }));
      // A brief yield between photos gives the browser a chance to run
      // garbage collection and other housekeeping between each heavy
      // decode/compress step, rather than one unbroken synchronous-ish
      // chain across the whole batch - this is what actually keeps
      // memory bounded through the loop, not just the batch size cap.
      await new Promise((r) => setTimeout(r, 30));
    }
    setPendingUploads((prev) => [...prev, ...results]);
    setUploading(false);
    setUploadProgress(null);
  };

  const removePending = (idx) => setPendingUploads((prev) => prev.filter((_, i) => i !== idx));

  const confirmUploads = async () => {
    if (pendingUploads.length === 0) return;
    // A single shared caption applies to every photo in this batch -
    // captions can still be edited individually afterward from the
    // gallery's own photo-edit dialog if a particular photo needs a
    // different one.
    //
    // Calling onAdd ONCE with the whole batch (rather than once per
    // photo in a loop) matters: the caller's state update is built from
    // whatever gallery/job snapshot was current when onAdd runs, so
    // looping and calling onAdd N times in a row - all before any of
    // those async updates actually land - means each call closes over
    // the same stale "before" snapshot and only the last one survives.
    // A single call with an array lets the caller add all N photos to
    // one fresh snapshot in one state update.
    //
    // Awaiting onAdd (and only clearing the staged photos / showing
    // success once it genuinely resolves true) is what fixes uploads
    // "disappearing" - previously this cleared pendingUploads and showed
    // success immediately, before the actual Firebase Storage upload had
    // even finished, so a failed upload still made the staged photos
    // vanish from the screen and told the user it worked, even though
    // it hadn't. onAdd's own success/failure toast (from
    // addPhotosFromPanel/persistGallery) already covers the outcome, so
    // this only adds its own toast on success to avoid a duplicate.
    const ok = await onAdd(pendingUploads.map((p) => ({ url: p.dataUri, origUrl: null, caption: caption.trim() })));
    if (ok !== false) {
      setPendingUploads([]);
      setCaption('');
    }
    // If it failed (ok === false), the staged photos and caption stay
    // exactly as they were so the user can just tap the button again to
    // retry, instead of having to re-pick every photo from scratch.
  };

  const addFromLink = () => {
    if (!linkValue.trim()) return;
    onAdd([{ url: toDirectImageUrl(linkValue), origUrl: linkValue.trim(), caption: caption.trim() }]);
    setLinkValue('');
    setCaption('');
  };

  return (
    <div style={styles.formCard}>
      <div style={styles.modeToggleRow}>
        <button style={{ ...styles.modeToggleBtn, ...(mode === 'upload' ? styles.modeToggleBtnActive : {}) }} onClick={() => setMode('upload')}>
          <Camera size={13} /> Upload Photo
        </button>
        <button style={{ ...styles.modeToggleBtn, ...(mode === 'link' ? styles.modeToggleBtnActive : {}) }} onClick={() => setMode('link')}>
          <Link2 size={13} /> Paste Link
        </button>
      </div>

      {mode === 'upload' && (
        <div style={{ marginTop: 12 }}>
          {pendingUploads.length === 0 ? (
            <>
              <input ref={fileInputRef} type='file' accept='image/*' multiple style={{ display: 'none' }} onChange={handleFilesPicked} />
              <button style={styles.uploadTapArea} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
                {uploading ? (
                  <span style={styles.uploadHint}>{uploadProgress ? ('Processing ' + uploadProgress.done + '/' + uploadProgress.total + '...') : 'Processing...'}</span>
                ) : (
                  <>
                    <Camera size={22} color={BRAND.gold} />
                    <span style={styles.uploadHint}>Camera se click karein ya gallery se ek ya zyada photos select karein</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div>
              <div style={styles.multiPhotoPreviewGrid}>
                {pendingUploads.map((p, i) => (
                  <div key={i} style={styles.multiPhotoPreviewItem}>
                    <img src={p.dataUri} alt='preview' style={styles.multiPhotoPreviewImg} />
                    <button style={styles.multiPhotoPreviewRemove} onClick={() => removePending(i)}><X size={12} color='#FFF' /></button>
                  </div>
                ))}
                <button style={styles.multiPhotoPreviewAddMore} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
                  <Plus size={18} color={BRAND.gold} />
                </button>
              </div>
              <input ref={fileInputRef} type='file' accept='image/*' multiple style={{ display: 'none' }} onChange={handleFilesPicked} />
              <div style={styles.hintText}>{pendingUploads.length} photo{pendingUploads.length !== 1 ? 's' : ''} ready - poori quality mein save hongi.</div>
              <input style={{ ...styles.input, marginTop: 8 }} placeholder='Caption (optional, sabpar lagega)' value={caption} onChange={(e) => setCaption(e.target.value)} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={confirmUploads}><Check size={14} /> {addLabel || ('Add ' + pendingUploads.length + ' photo' + (pendingUploads.length !== 1 ? 's' : ''))}</button>
                <button style={styles.cancelBtn} onClick={() => setPendingUploads([])}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'link' && (
        <div style={{ marginTop: 12 }}>
          <PhotoUrlInput value={linkValue} onChange={setLinkValue} placeholder='Image URL ya Google Drive link paste karein' />
          <input style={{ ...styles.input, marginTop: 8 }} placeholder='Caption (optional)' value={caption} onChange={(e) => setCaption(e.target.value)} />
          <button style={styles.addBtn} onClick={addFromLink}><Plus size={14} /> {addLabel || 'Add photo'}</button>
        </div>
      )}
    </div>
  );
}

/* ---- Admin gallery manager ---- */
function AdminGallery({ gallery, galleryLoading, setGallery, categories, setCategories, showToast }) {
  const [activeCat, setActiveCat] = useState(categories[0]);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [query, setQuery] = useState('');
  const [editingPhoto, setEditingPhoto] = useState(null);
  // Same fix as GalleryBrowser's matching comment - a category with
  // hundreds of photos rendering every single one into the DOM at once
  // is what made opening it feel slow, independent of image loading
  // itself. See GalleryBrowser for the full reasoning.
  const PHOTO_PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PHOTO_PAGE_SIZE);
  // Same fix as GalleryBrowser's matching "galleryCategories" comment -
  // a plain expression (not a hook), safe to compute here regardless
  // of the early return below, but still critical: without this,
  // removing a category from Settings could make its photos
  // permanently unreachable from THIS screen too, even though they're
  // still safely sitting in Firestore.
  const galleryCategories = [...new Set([...(categories || []), ...Object.keys(gallery || {})])];

  if (galleryLoading && Object.keys(gallery || {}).length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid ' + BRAND.line, borderTopColor: BRAND.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ ...styles.plainTextMuted, marginTop: 12 }}>Gallery load ho rahi hai...</div>
      </div>
    );
  }

  const allPhotos = [...(gallery[activeCat] || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const photos = allPhotos.filter((p) => !query.trim() || (p.caption || '').toLowerCase().includes(query.toLowerCase()));
  const visiblePhotos = photos.slice(0, visibleCount);
  const hasMorePhotos = photos.length > visibleCount;

  // Fetches a category's CURRENT state directly from Firestore, rather
  // than trusting this device's local `gallery` state - shared by every
  // gallery-modifying action below. With more than one admin possibly
  // adding/editing/removing photos around the same time, each device's
  // local copy can be a little behind whatever another device just
  // saved; building a write on that stale snapshot means it REPLACES
  // the whole category with this device's outdated view, silently
  // dropping whatever anyone else changed in between - which is exactly
  // what repeated "photos disappearing" across multiple admin sessions
  // looks like. Falls back to the local snapshot only if the fetch
  // itself fails, so a flaky connection doesn't block the action
  // entirely.
  const fetchFreshCategory = async (cat, localFallback) => {
    try {
      const raw = await window.storage.get('gallery_cat_' + cat, true);
      if (raw && raw.value) {
        const parsed = JSON.parse(raw.value);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) { /* fall back to local state below */ }
    return localFallback;
  };

  const addPhotosFromPanel = async (photos) => {
    // Building the full new-photo list here and calling setGallery ONCE
    // is what actually fixes the multi-upload bug: this closure's
    // `allPhotos` is a single fresh snapshot for the whole batch, so
    // every photo in `photos` lands correctly instead of only the last
    // one surviving.
    const newEntries = photos.map((p) => ({ id: uid(), url: p.url, origUrl: p.origUrl, caption: p.caption, createdAt: new Date().toISOString() }));
    // Re-fetches the CURRENT category directly from Firestore right
    // before merging in the new photos, instead of trusting this
    // device's local `gallery` state (`allPhotos`) as the base - with
    // more than one admin adding photos around the same time, each
    // device's local copy can be a little behind whatever the OTHER
    // device just saved. Building the write from a stale local snapshot
    // means the write REPLACES the whole category with "my old photos +
    // my new ones", silently dropping whatever the other admin added in
    // between - which is exactly what repeated "photos disappearing"
    // across multiple admin sessions looks like. Fetching fresh here
    // means the merge is always built on top of whatever is actually in
    // Firestore at this exact moment, not a potentially-outdated cache.
    const freshCategoryPhotos = await fetchFreshCategory(activeCat, allPhotos);
    const next = { ...gallery, [activeCat]: [...newEntries, ...freshCategoryPhotos] };
    // Awaiting setGallery (= persistGallery, an async function) before
    // showing "added" matters just as much: persistGallery does the
    // real Firestore writes in the background, and if ANY of them fail
    // (a flaky mobile connection, several photos uploading in parallel,
    // etc.), it shows its own "Save failed" toast - but only AFTER
    // already updating local state optimistically. Without awaiting
    // here, this function's OWN success toast fired immediately, before
    // that outcome was known, telling the user it worked even when it
    // hadn't.
    const ok = await setGallery(next);
    if (ok) {
      showToast(photos.length + ' photo' + (photos.length !== 1 ? 's' : '') + ' added to ' + activeCat);
    }
    // If it failed, persistGallery already showed its own error toast
    // and rolled the local state back - nothing further to say here.
    return ok;
  };

  const addBulk = async () => {
    const urls = bulkText.split(NEWLINE).map((l) => l.trim()).filter(Boolean);
    if (urls.length === 0) return;
    const newPhotos = urls.map((u) => ({ id: uid(), url: toDirectImageUrl(u), origUrl: u, caption: '', createdAt: new Date().toISOString() }));
    // Same fresh-fetch-before-merge fix as addPhotosFromPanel above -
    // see that comment for why building this from local `allPhotos`
    // alone risks silently dropping another admin's concurrent additions.
    const freshCategoryPhotos = await fetchFreshCategory(activeCat, allPhotos);
    const next = { ...gallery, [activeCat]: [...newPhotos, ...freshCategoryPhotos] };
    const ok = await setGallery(next);
    if (ok) {
      setBulkText('');
      setShowBulk(false);
      showToast(urls.length + ' photos added to ' + activeCat);
    }
  };

  const removePhoto = async (id) => {
    const freshCategoryPhotos = await fetchFreshCategory(activeCat, allPhotos);
    setGallery({ ...gallery, [activeCat]: freshCategoryPhotos.filter((p) => p.id !== id) });
  };

  const saveEditedPhoto = async (photo, newCaption, newCategory) => {
    const freshCategoryPhotos = await fetchFreshCategory(activeCat, allPhotos);
    if (newCategory === activeCat) {
      await setGallery({ ...gallery, [activeCat]: freshCategoryPhotos.map((p) => (p.id === photo.id ? { ...p, caption: newCaption } : p)) });
    } else {
      // Move to a different category: remove from current, append to
      // target - fetches BOTH categories' fresh state, since this
      // touches two documents at once.
      const remaining = freshCategoryPhotos.filter((p) => p.id !== photo.id);
      const targetPhotos = await fetchFreshCategory(newCategory, gallery[newCategory] || []);
      const ok = await setGallery({
        ...gallery,
        [activeCat]: remaining,
        [newCategory]: [{ ...photo, caption: newCaption }, ...targetPhotos],
      });
      if (ok) showToast('Photo ' + newCategory + ' mein move ho gayi');
    }
    setEditingPhoto(null);
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Design Gallery Manager</div>
      <div style={styles.plainTextMuted}>Categories add/remove karne ke liye Settings mein jaayein.</div>

      <div style={styles.chipRow}>
        <button
          onClick={() => { setActiveCat(UNCATEGORIZED); setVisibleCount(PHOTO_PAGE_SIZE); }}
          style={{ ...styles.chip, ...(activeCat === UNCATEGORIZED ? styles.chipActive : {}), borderStyle: 'dashed' }}
        >
          Uncategorized ({(gallery[UNCATEGORIZED] || []).length})
        </button>
        {galleryCategories.map((c) => {
          const count = (gallery[c] || []).length;
          return <button key={c} onClick={() => { setActiveCat(c); setVisibleCount(PHOTO_PAGE_SIZE); }} style={{ ...styles.chip, ...(activeCat === c ? styles.chipActive : {}) }}>{c} ({count})</button>;
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={styles.fieldLabel}>Add photo to '{activeCat}'</div>
        {activeCat === UNCATEGORIZED && (
          <div style={styles.plainTextMuted}>Bahut saari mixed photos ek saath daalne ke liye yahan add karein - baad mein har photo ko sahi category mein move kar sakte hain (photo par tap karke "Edit" se).</div>
        )}
        <PhotoAddPanel addLabel='Add photo' showToast={showToast} onAdd={addPhotosFromPanel} />
        <button style={styles.linkBtn2} onClick={() => setShowBulk((s) => !s)}>{showBulk ? 'Hide bulk add' : 'Bulk add (many URLs at once) ->'}</button>
        {showBulk && (
          <div style={{ marginTop: 8 }}>
            <textarea style={{ ...styles.input, minHeight: 100, resize: 'vertical' }} placeholder={['Ek line mein ek URL daalein (Google Drive links bhi chalenge):', 'https://example.com/1.jpg', 'https://drive.google.com/file/d/.../view'].join(NEWLINE)} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <button style={styles.addBtn} onClick={addBulk}><Plus size={14} /> Add all URLs</button>
          </div>
        )}
      </div>

      {allPhotos.length > 6 && (
        <div style={{ ...styles.searchWrap, marginTop: 16 }}>
          <Search size={15} color={BRAND.textMuted} />
          <input style={styles.searchInput} placeholder='Caption se search karein...' value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div style={{ ...styles.fieldLabel, marginTop: 16 }}>{activeCat} photos ({photos.length}) - edit ke liye tap karein</div>
      <div style={styles.galleryMasonry}>
        {visiblePhotos.map((p) => (
          <div key={p.id} style={{ ...styles.progressPhotoCard, breakInside: 'avoid', marginBottom: 6 }}>
            <button style={styles.photoEditTapArea} onClick={() => setEditingPhoto(p)}>
              <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption} style={styles.galleryMasonryImg} />
            </button>
            <button style={styles.photoDeleteBtn} onClick={() => removePhoto(p.id)}><Trash2 size={12} color='#FFF' /></button>
            {p.caption && <div style={styles.progressCaption}>{p.caption}</div>}
          </div>
        ))}
      </div>
      {hasMorePhotos && (
        <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={() => setVisibleCount((v) => v + PHOTO_PAGE_SIZE)}>
          Aur Dikhaein ({photos.length - visibleCount} baaki)
        </button>
      )}

      {editingPhoto && (
        <GalleryPhotoEditDialog
          photo={editingPhoto}
          currentCategory={activeCat}
          categories={galleryCategories}
          onCancel={() => setEditingPhoto(null)}
          onSave={saveEditedPhoto}
        />
      )}
    </div>
  );
}

function GalleryPhotoEditDialog({ photo, currentCategory, categories, onCancel, onSave }) {
  const [caption, setCaption] = useState(photo.caption || '');
  const [category, setCategory] = useState(currentCategory);
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <SheetHeader title='Edit Photo' onClose={onCancel} />
        <div style={styles.sheetBody}>
          <div style={styles.previewWrap}>
            <SmartImg src={photo.url} origUrl={photo.origUrl} alt={caption} style={styles.previewImg} />
          </div>
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Caption</div>
          <input style={styles.input} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder='Caption (optional)' />
          <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Category</div>
          <div style={styles.chipRow}>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} style={{ ...styles.chip, ...(category === c ? styles.chipActive : {}) }}>{c}</button>
            ))}
          </div>
        </div>
        <div style={styles.sheetFooter}>
          <button style={styles.primaryBtn} onClick={() => onSave(photo, caption, category)}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

/* ---- Admin reviews ---- */
function AdminReviews({ jobs, setJobs, archivedReviews, setArchivedReviews, showToast }) {
  const [editingJobId, setEditingJobId] = useState(null);
  const reviewed = jobs.filter((j) => j.review).sort((a, b) => new Date(b.review.date) - new Date(a.review.date));
  const avg = reviewed.length ? (reviewed.reduce((s, j) => s + j.review.rating, 0) / reviewed.length).toFixed(1) : '-';
  const featuredCount = reviewed.filter((j) => j.review.featured).length + (archivedReviews || []).length;

  const removeArchivedReview = (id) => {
    setArchivedReviews((archivedReviews || []).filter((r) => r.id !== id));
    showToast('Archived review hata diya gaya');
  };

  const toggleFeatured = (job) => {
    const next = jobs.map((j) => (j.id === job.id ? { ...j, review: { ...j.review, featured: !j.review.featured } } : j));
    setJobs(next);
    showToast(job.review.featured ? 'Review featured list se hataya gaya' : 'Review featured list mein add ho gaya');
  };

  const saveEdit = (job, newRating, newText) => {
    const next = jobs.map((j) => (j.id === job.id ? { ...j, review: { ...j.review, rating: newRating, text: newText.trim() } } : j));
    setJobs(next);
    setEditingJobId(null);
    showToast('Review update ho gaya');
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Customer Reviews</div>
      <div style={styles.statRow2}>
        <StatCard icon={<Star size={16} />} label='Avg Rating' value={avg} accent />
        <StatCard icon={<MessageSquare size={16} />} label='Total Reviews' value={reviewed.length} />
      </div>
      <div style={styles.plainTextMuted}>{featuredCount} review{featuredCount !== 1 ? 's' : ''} customers ko dikh rahe hain (featured)</div>
      {reviewed.length === 0 && <div style={styles.empty}>Abhi tak koi review nahi mila.</div>}
      {reviewed.map((j) => (
        <div key={j.id} style={styles.reviewCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.cardName}>{j.customerName}</div>
            <div style={{ display: 'flex', gap: 1 }}>
              {[1,2,3,4,5].map((n) => <Star key={n} size={13} fill={n <= j.review.rating ? BRAND.gold : 'none'} color={n <= j.review.rating ? BRAND.gold : '#D7DAE5'} />)}
            </div>
          </div>
          {editingJobId === j.id ? (
            <ReviewEditForm job={j} onSave={saveEdit} onCancel={() => setEditingJobId(null)} />
          ) : (
            <>
              {j.review.text && <div style={{ ...styles.plainText, marginTop: 6 }}>{j.review.text}</div>}
              <div style={styles.itemSub}>{formatDate(j.review.date)}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={styles.cardActionBtn} onClick={() => setEditingJobId(j.id)}><Edit3 size={12} /> Edit</button>
                <button style={{ ...styles.cardActionBtn, ...(j.review.featured ? styles.cardActionBtnActive : {}) }} onClick={() => toggleFeatured(j)}>
                  <Star size={12} fill={j.review.featured ? '#FFF' : 'none'} /> {j.review.featured ? 'Featured' : 'Feature karein'}
                </button>
              </div>
            </>
          )}
        </div>
      ))}

      {(archivedReviews || []).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={styles.fieldLabel}>Archived Reviews (customer delete ho chuke hain)</div>
          <div style={styles.plainTextMuted}>Ye reviews un customers ke hain jo delete ho chuke hain - marketing ke liye surakshit rakhe gaye hain.</div>
          {archivedReviews.map((r) => (
            <div key={r.id} style={styles.reviewCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={styles.cardName}>{r.customerName}</div>
                <div style={{ display: 'flex', gap: 1 }}>
                  {[1,2,3,4,5].map((n) => <Star key={n} size={13} fill={n <= r.rating ? BRAND.gold : 'none'} color={n <= r.rating ? BRAND.gold : '#D7DAE5'} />)}
                </div>
              </div>
              {r.text && <div style={{ ...styles.plainText, marginTop: 6 }}>{r.text}</div>}
              <div style={styles.itemSub}>{formatDate(r.date)}</div>
              <button style={{ ...styles.cardActionBtn, marginTop: 8 }} onClick={() => removeArchivedReview(r.id)}><Trash2 size={12} /> Hamesha Ke Liye Hataein</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewEditForm({ job, onSave, onCancel }) {
  const [rating, setRating] = useState(job.review.rating);
  const [text, setText] = useState(job.review.text || '');
  return (
    <div style={{ marginTop: 8 }}>
      <div style={styles.starRow}>
        {[1,2,3,4,5].map((n) => (
          <button key={n} style={styles.starBtn} onClick={() => setRating(n)}>
            <Star size={22} fill={n <= rating ? BRAND.gold : 'none'} color={n <= rating ? BRAND.gold : '#D7DAE5'} />
          </button>
        ))}
      </div>
      <textarea style={{ ...styles.input, minHeight: 70, marginTop: 8 }} value={text} onChange={(e) => setText(e.target.value)} placeholder='Review text' />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={styles.primaryBtn} onClick={() => onSave(job, rating, text)}>Save</button>
        <button style={styles.cardActionBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ---- Admin: Karigar (worker) payments & company expenses - kept
   separate from customer job revenue. Company earning (from jobs) minus
   these expenses gives real net profit. ---- */
function AdminExpenses({ expenses, setExpenses, jobs, showToast, onOpenJob }) {
  const [type, setType] = useState(EXPENSE_TYPES[0]);
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [linkedJobId, setLinkedJobId] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [activePayee, setActivePayee] = useState(null);
  const [showProfitReport, setShowProfitReport] = useState(false);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [showDueList, setShowDueList] = useState(false);
  // Moved here, before the three early returns below - same Rules of
  // Hooks fix as AdminSettings/AdminCustomers: this useMemo previously
  // sat after all three "if (showX) return" checks, meaning it was
  // silently skipped whenever any of Profit Report / Monthly Report /
  // Due List was open, which is exactly the bug pattern that made
  // "Karigar Performance" blank the whole app.
  //
  // Per-person breakdown: groups every expense by payee name (case/space
  // insensitive match so "Ramu Kaka" and "ramu kaka " land in the same
  // group), so admin can see at a glance who's been paid how much in
  // total, without having to scroll the full mixed history.
  const payeeSummary = useMemo(() => {
    const groups = {};
    for (const e of expenses) {
      const key = (e.payee || '').trim().toLowerCase();
      if (!key) continue;
      if (!groups[key]) groups[key] = { displayName: e.payee.trim(), total: 0, count: 0, entries: [] };
      groups[key].total += Number(e.amount) || 0;
      groups[key].count += 1;
      groups[key].entries.push(e);
    }
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [expenses]);

  if (showProfitReport) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowProfitReport(false)}><ArrowLeft size={13} /> Expenses</button>
        </div>
        <AdminProfitReport jobs={jobs} expenses={expenses} />
      </div>
    );
  }

  if (showMonthlyReport) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowMonthlyReport(false)}><ArrowLeft size={13} /> Expenses</button>
        </div>
        <AdminMonthlyReport jobs={jobs} expenses={expenses} />
      </div>
    );
  }

  if (showDueList) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowDueList(false)}><ArrowLeft size={13} /> Expenses</button>
        </div>
        <AdminDuePaymentsList jobs={jobs} expenses={expenses} onOpenJob={onOpenJob} />
      </div>
    );
  }

  const totalRevenue = jobs.reduce((s, j) => s + jobTotal(j), 0);
  const totalCollected = jobs.reduce((s, j) => s + jobPaid(j), 0);
  const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const karigarTotal = expenses.filter((e) => e.type === 'Karigar Payment').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalCollected - totalExpense;

  const addExpense = () => {
    if (!payee.trim() || !amount) { showToast('Naam aur amount daalein', true); return; }
    const entry = { id: uid(), type, payee: payee.trim(), amount, note: note.trim(), jobId: linkedJobId || null, date: new Date().toISOString() };
    setExpenses([entry, ...expenses]);
    setPayee(''); setAmount(''); setNote(''); setLinkedJobId('');
    showToast('Expense add ho gaya');
  };
  const removeExpense = (id) => setExpenses(expenses.filter((e) => e.id !== id));

  const filtered = expenses.filter((e) => filterType === 'all' || e.type === filterType).sort((a, b) => new Date(b.date) - new Date(a.date));
  const activePayeeEntries = activePayee
    ? expenses.filter((e) => (e.payee || '').trim().toLowerCase() === activePayee).sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];
  const activePayeeDisplayName = activePayee ? (payeeSummary.find((g) => g.displayName.trim().toLowerCase() === activePayee)?.displayName || activePayee) : '';

  if (activePayee) {
    const activeTotal = activePayeeEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return (
      <div style={{ padding: '12px 16px' }}>
        <button style={styles.backLink} onClick={() => setActivePayee(null)}><ArrowLeft size={13} /> Sab log</button>
        <div style={styles.catTitle}>{activePayeeDisplayName}</div>
        <div style={{ ...styles.payStrip, marginTop: 10 }}>
          <MoneyBit label='Total Diya' value={currency(activeTotal)} highlight />
          <MoneyBit label='Entries' value={String(activePayeeEntries.length)} muted />
        </div>
        <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Poori history</div>
        {activePayeeEntries.map((e) => (
          <div key={e.id} style={styles.itemRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.itemDesc}><span style={styles.reqCatBadge}>{e.type}</span></div>
              <div style={styles.itemSub}>{formatDate(e.date)} {e.note && ('- ' + e.note)}</div>
            </div>
            <div style={styles.itemAmount}>{currency(e.amount)}</div>
            <button style={styles.iconBtnSmall} onClick={() => removeExpense(e.id)}><Trash2 size={14} color='#C7CCDC' /></button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <div style={styles.sectionTitle}>Karigar &amp; Company Expenses</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button style={styles.linkBtn2} onClick={() => setShowDueList(true)}>Due Payments</button>
          <button style={styles.linkBtn2} onClick={() => setShowMonthlyReport(true)}>Monthly Report</button>
          <button style={styles.linkBtn2} onClick={() => setShowProfitReport(true)}>Project Profit Report</button>
        </div>
      </div>
      <div style={styles.plainTextMuted}>Customer se aayi payment alag, karigar/company kharch alag track hota hai.</div>

      <div style={styles.statRow2}>
        <StatCard icon={<IndianRupee size={16} />} label='Collected' value={currency(totalCollected)} />
        <StatCard icon={<Users size={16} />} label='Karigar Paid' value={currency(karigarTotal)} />
        <StatCard icon={<TrendingUp size={16} />} label='Net Profit' value={currency(netProfit)} accent />
      </div>

      {payeeSummary.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={styles.fieldLabel}>Person-wise total (kisko kitna diya)</div>
          {payeeSummary.map((g) => (
            <button key={g.displayName} style={{ ...styles.staffRow, background: 'none', border: 'none', width: '100%', cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setActivePayee(g.displayName.trim().toLowerCase())}>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={styles.itemDesc}>{g.displayName}</div>
                <div style={styles.itemSub}>{g.count} entr{g.count !== 1 ? 'ies' : 'y'}</div>
              </div>
              <div style={styles.itemAmount}>{currency(g.total)}</div>
              <ChevronRight size={16} color='#C7CCDC' />
            </button>
          ))}
        </div>
      )}

      <div style={styles.formCard}>
        <div style={styles.fieldLabel}>Add expense</div>
        <div style={styles.chipRow}>
          {EXPENSE_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} style={{ ...styles.chip, ...(type === t ? styles.chipActive : {}) }}>{t}</button>
          ))}
        </div>
        <input style={{ ...styles.input, marginTop: 10 }} placeholder={type === 'Karigar Payment' ? 'Karigar ka naam' : 'Kisko / kya'} value={payee} onChange={(e) => setPayee(e.target.value)} />
        <input style={{ ...styles.input, marginTop: 8 }} placeholder='Amount ₹' inputMode='decimal' value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input style={{ ...styles.input, marginTop: 8 }} placeholder='Note (optional)' value={note} onChange={(e) => setNote(e.target.value)} />
        <select style={{ ...styles.input, marginTop: 8 }} value={linkedJobId} onChange={(e) => setLinkedJobId(e.target.value)}>
          <option value=''>Kisi project se link nahi (general expense)</option>
          {jobs.filter((j) => j.status === 'in_progress').map((j) => <option key={j.id} value={j.id}>{j.customerName}</option>)}
        </select>
        <button style={styles.addBtn} onClick={addExpense}><Plus size={14} /> Add expense</button>
      </div>

      <div style={styles.filterRow}>
        <FilterChip active={filterType === 'all'} onClick={() => setFilterType('all')} label='All' />
        {EXPENSE_TYPES.map((t) => <FilterChip key={t} active={filterType === t} onClick={() => setFilterType(t)} label={t} />)}
      </div>

      <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Expense history ({filtered.length})</div>
      {filtered.length === 0 && <div style={styles.emptySmall}>Koi expense record nahi hai.</div>}
      {filtered.map((e) => (
        <div key={e.id} style={styles.itemRow}>
          <div style={{ flex: 1 }}>
            <div style={styles.itemDesc}>{e.payee} <span style={styles.reqCatBadge}>{e.type}</span></div>
            <div style={styles.itemSub}>{formatDate(e.date)} {e.note && ('- ' + e.note)}</div>
          </div>
          <div style={styles.itemAmount}>{currency(e.amount)}</div>
          <button style={styles.iconBtnSmall} onClick={() => removeExpense(e.id)}><Trash2 size={14} color='#C7CCDC' /></button>
        </div>
      ))}
    </div>
  );
}

/* ---- Per-project profit report ---- */
/* ---- Monthly business report: groups collected payments by calendar
   month (using each payment's own date, not the job's creation date, so
   revenue lands in the month it was actually received) and shows the
   last 6 months with month-over-month comparison, so admin can see at a
   glance whether the business is growing or slowing down. ---- */
function AdminMonthlyReport({ jobs, expenses }) {
  const monthlyData = useMemo(() => {
    const monthKey = (dateStr) => {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null; // skip entries with a missing/malformed date rather than corrupt a bucket with NaN-NaN
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    };
    const monthLabel = (key) => {
      const [y, m] = key.split('-');
      const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return names[Number(m) - 1] + ' ' + y;
    };
    const revenueByMonth = {};
    const expenseByMonth = {};
    for (const j of jobs) {
      for (const p of (j.payments || [])) {
        const key = monthKey(p.date);
        if (!key) continue;
        revenueByMonth[key] = (revenueByMonth[key] || 0) + (Number(p.amount) || 0);
      }
    }
    for (const e of expenses) {
      const key = monthKey(e.date);
      if (!key) continue;
      expenseByMonth[key] = (expenseByMonth[key] || 0) + (Number(e.amount) || 0);
    }
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const revenue = revenueByMonth[key] || 0;
      const expense = expenseByMonth[key] || 0;
      months.push({ key, label: monthLabel(key), revenue, expense, profit: revenue - expense });
    }
    return months;
  }, [jobs, expenses]);

  const currentMonth = monthlyData[monthlyData.length - 1];
  const prevMonth = monthlyData[monthlyData.length - 2];
  const changePercent = prevMonth && prevMonth.revenue > 0
    ? Math.round(((currentMonth.revenue - prevMonth.revenue) / prevMonth.revenue) * 100)
    : null;
  const maxRevenue = Math.max(...monthlyData.map((m) => m.revenue), 1);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Monthly Business Report</div>
      <div style={styles.plainTextMuted}>Pichle 6 mahine ka revenue trend.</div>

      <div style={styles.statRow2}>
        <StatCard icon={<IndianRupee size={16} />} label='Is Mahine' value={currency(currentMonth.revenue)} accent />
        {changePercent !== null && (
          <StatCard
            icon={<TrendingUp size={16} />}
            label='Pichle Mahine Se'
            value={(changePercent >= 0 ? '+' : '') + changePercent + '%'}
          />
        )}
      </div>

      <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Month-wise breakdown</div>
      {monthlyData.map((m) => (
        <div key={m.key} style={styles.reviewCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={styles.cardName}>{m.label}</div>
            <div style={styles.itemAmount}>{currency(m.revenue)}</div>
          </div>
          <div style={styles.monthlyBarTrack}>
            <div style={{ ...styles.monthlyBarFill, width: (m.revenue / maxRevenue * 100) + '%' }} />
          </div>
          <div style={styles.itemSub}>Expense: {currency(m.expense)} - Profit: {currency(m.profit)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---- Due payments list: every customer/project with money still owed
   (only counting jobs whose work has actually started - same rule as
   the Total Due dashboard cards - an unapproved estimate isn't a debt),
   sorted by amount so the biggest outstanding balances surface first.
   Alongside each customer's due amount, shows any expenses specifically
   linked to their project, so admin can see both sides (what's owed to
   us, what we've spent on them) in one place. ---- */
/* ---- Generic status-filtered job list: lets any Home stat card (In
   Progress, Delivered, etc) open a real filtered list instead of either
   doing nothing or dumping into the unfiltered full Customers tab -
   which is what "In Progress" and "Total Due" cards did before (no
   onClick at all), and what "Aaj ki Visits" did (navigated to the
   generic Customers tab, showing every customer rather than just
   today's visits). ---- */
function AdminJobStatusList({ jobs, statuses, title, onOpenJob }) {
  const rows = jobs
    .filter((j) => statuses.includes(j.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={styles.plainTextMuted}>{rows.length} customer{rows.length !== 1 ? 's' : ''}</div>
      {rows.length === 0 && <div style={styles.emptySmall}>Koi customer nahi hai.</div>}
      {rows.map((j) => (
        <button key={j.id} style={{ ...styles.reviewCard, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => onOpenJob(j.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.cardName}>{j.customerName}</div>
            <span style={styles.badge}>{STATUS[j.status]?.label || j.status}</span>
          </div>
          <div style={styles.itemSub}>{jobDue(j) > 0 ? (currency(jobDue(j)) + ' due') : 'Payment clear'}</div>
        </button>
      ))}
    </div>
  );
}

function AdminDuePaymentsList({ jobs, expenses, onOpenJob }) {
  const rows = useMemo(() => {
    return jobs
      .filter((j) => (j.status === 'in_progress' || j.status === 'delivered' || j.status === 'paid') && jobDue(j) > 0)
      .map((j) => ({
        job: j,
        due: jobDue(j),
        linkedExpense: expenses.filter((e) => e.jobId === j.id).reduce((s, e) => s + (Number(e.amount) || 0), 0),
      }))
      .sort((a, b) => b.due - a.due);
  }, [jobs, expenses]);

  const totalDue = rows.reduce((s, r) => s + r.due, 0);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Due Payments</div>
      <div style={styles.plainTextMuted}>Jin projects mein kaam shuru ho chuka hai aur payment abhi bhi baaki hai.</div>

      <div style={styles.statRow2}>
        <StatCard icon={<AlertCircle size={16} />} label='Total Due' value={currency(totalDue)} accent />
        <StatCard icon={<User size={16} />} label='Customers' value={rows.length} />
      </div>

      {rows.length === 0 && <div style={styles.emptySmall}>Koi payment due nahi hai.</div>}
      {rows.map((r) => (
        <button key={r.job.id} style={{ ...styles.reviewCard, width: '100%', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'block' }} onClick={() => onOpenJob && onOpenJob(r.job.id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.cardName}>{r.job.customerName}</div>
            <span style={{ ...styles.badge, background: '#FFEBEE', color: '#C62828' }}>{currency(r.due)} due</span>
          </div>
          <div style={styles.itemSub}>{STATUS[r.job.status]?.label || r.job.status}{r.linkedExpense > 0 && (' - ' + currency(r.linkedExpense) + ' expense is project mein')}</div>
        </button>
      ))}
    </div>
  );
}

function AdminProfitReport({ jobs, expenses }) {
  const rows = useMemo(() => {
    return jobs
      .map((j) => ({ job: j, ...jobProfit(j, expenses) }))
      .filter((r) => r.collected > 0 || r.linkedExpenses > 0)
      .sort((a, b) => b.profit - a.profit);
  }, [jobs, expenses]);

  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalLinkedExpense = rows.reduce((s, r) => s + r.linkedExpenses, 0);
  const totalProfit = totalCollected - totalLinkedExpense;
  const unlinkedExpenseTotal = expenses.filter((e) => !e.jobId).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Project-wise Profit Report</div>
      <div style={styles.plainTextMuted}>Har project mein kitna collect hua, kitna expense laga, aur profit kitna hai.</div>

      <div style={styles.statRow2}>
        <StatCard icon={<IndianRupee size={16} />} label='Collected' value={currency(totalCollected)} />
        <StatCard icon={<TrendingUp size={16} />} label='Linked Expense' value={currency(totalLinkedExpense)} />
        <StatCard icon={<CheckCircle2 size={16} />} label='Profit' value={currency(totalProfit)} accent />
      </div>

      {unlinkedExpenseTotal > 0 && (
        <div style={styles.plainTextMuted}>
          + {currency(unlinkedExpenseTotal)} general expenses (kisi project se link nahi) is report mein shamil nahi hain.
        </div>
      )}

      <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Project-wise breakdown</div>
      {rows.length === 0 && <div style={styles.emptySmall}>Abhi koi payment ya linked expense record nahi hai.</div>}
      {rows.map((r) => (
        <div key={r.job.id} style={styles.reviewCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={styles.cardName}>{r.job.customerName}</div>
            <span style={{ ...styles.badge, background: r.profit >= 0 ? '#DFF0E4' : '#FFEBEE', color: r.profit >= 0 ? '#2F7D4F' : '#C62828' }}>
              {currency(r.profit)}
            </span>
          </div>
          <div style={styles.itemSub}>Collected: {currency(r.collected)} - Expense: {currency(r.linkedExpenses)}</div>
        </div>
      ))}
    </div>
  );
}

/* ---- Admin settings ---- */
function FaqEditForm({ faq, onSave, onCancel }) {
  const [question, setQuestion] = useState(faq.question);
  const [answer, setAnswer] = useState(faq.answer);
  return (
    <div>
      <input style={styles.input} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <textarea style={{ ...styles.input, marginTop: 8, minHeight: 70, resize: 'vertical' }} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => onSave(question, answer)}>Save</button>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AdminSettings({ adminPin, setAdminPin, partnerPin, setPartnerPin, staff, setStaff, appointmentItemOptions, setAppointmentItemOptions, categories, setCategories, gallery, setGallery, brochures, addBrochure, removeBrochure, allData, jobs, customers, attendance, estimateRates, setEstimateRates, faqs, setFaqs, adminPushTokens, enableAdminPushNotifications, onLogout, showToast }) {
  // Same union fix as GalleryBrowser/AdminGallery's matching comment -
  // used here so a category with real gallery photos never becomes
  // unmanageable from Settings just because it isn't (or is no longer)
  // in the plain item-categories list.
  const galleryCategoriesForSettings = [...new Set([...(categories || []), ...Object.keys(gallery || {})])];
  const [current, setCurrent] = useState('');
  const [next1, setNext1] = useState('');
  const [next2, setNext2] = useState('');
  const [error, setError] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [newStaffRole, setNewStaffRole] = useState('admin');
  const [staffError, setStaffError] = useState('');
  const [newPartnerPin, setNewPartnerPin] = useState('');
  const [partnerPinError, setPartnerPinError] = useState('');
  // Old (pre-migration) photos sometimes still hold a raw base64 data:
  // URI rather than a real Storage URL - if the migration's upload
  // attempt for that specific photo failed (corrupted/truncated data,
  // a network hiccup at migration time, etc.), the broken data: URI
  // gets left in place as-is, and a broken/truncated data: URI is
  // exactly what shows as "Load nahi hui" in the gallery - a real
  // https:// Storage link essentially never fails to load once it's
  // uploaded, so a data: URI still present here IS the failure.
  //
  // This scans several parts of the app at once (gallery photos,
  // brochure PDFs - same broken-upload risk as photos, and jobs that
  // reference a customer no longer in the customers list, which can
  // happen if a delete was interrupted partway) and repairs what it
  // safely can - a re-uploadable data: URI gets retried automatically;
  // anything it can't safely fix on its own (truly corrupted data, or
  // a genuinely orphaned job) is reported clearly instead, since
  // guessing at those risks making things worse, not better.
  const [scanResults, setScanResults] = useState(null);
  // FAQ management - a plain ordered list admin fully controls (add,
  // edit, remove, reorder), shown to customers in their own Help
  // screen. Kept simple and admin-authored rather than any kind of
  // auto-generated content, since the accuracy of things like
  // warranty terms, pricing basis, or delivery timelines matters and
  // only the business itself actually knows its own current policies.
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');
  const [editingFaqId, setEditingFaqId] = useState(null);
  const addFaq = () => {
    if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) { showToast('Sawaal aur jawab dono likhein', true); return; }
    const next = [...(faqs || []), { id: uid(), question: newFaqQuestion.trim(), answer: newFaqAnswer.trim() }];
    setFaqs(next);
    setNewFaqQuestion(''); setNewFaqAnswer('');
    showToast('FAQ add ho gaya');
  };
  const updateFaq = (id, question, answer) => {
    setFaqs((faqs || []).map((f) => (f.id === id ? { ...f, question, answer } : f)));
    setEditingFaqId(null);
    showToast('FAQ update ho gaya');
  };
  const removeFaq = (id) => setFaqs((faqs || []).filter((f) => f.id !== id));
  const moveFaq = (id, dir) => {
    const list = [...(faqs || [])];
    const idx = list.findIndex((f) => f.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    setFaqs(list);
  };
  const [scanning, setScanning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [recoveringCategories, setRecoveringCategories] = useState(false);

  // Genuine data recovery for the exact bug just fixed elsewhere: scans
  // EVERY document that actually exists in Firestore (not just what
  // 'gallery_categories' currently remembers), finds any 'gallery_cat_*'
  // document whose category name isn't in the current list, and adds
  // it back - this is what recovers a category whose pointer entry was
  // already lost BEFORE the underlying write-time bug was fixed, since
  // that fix only prevents this from happening again going forward; it
  // can't retroactively know about a category the app was never asked
  // to look for. The photo data itself was never touched - only the
  // 'gallery_categories' pointer needs mending.
  const recoverMissingCategories = async () => {
    setRecoveringCategories(true);
    try {
      const allKeys = await window.storage.listAllKeys();
      const galleryCatKeys = allKeys.filter((k) => k.startsWith('gallery_cat_'));
      const recoveredNames = galleryCatKeys.map((k) => k.slice('gallery_cat_'.length));
      const currentRaw = await window.storage.get('gallery_categories');
      const currentList = currentRaw ? JSON.parse(currentRaw.value) : [];
      const missing = recoveredNames.filter((name) => !currentList.includes(name));
      if (missing.length === 0) {
        showToast('Koi missing category nahi mili - sab theek hai');
        return;
      }
      const mergedList = [...new Set([...currentList, ...recoveredNames])];
      await window.storage.set('gallery_categories', JSON.stringify(mergedList));
      showToast(missing.length + ' category(s) recover ho gayi - app band karke dobara kholein taaki photos dikhein');
    } catch (e) {
      showToast('Recovery mein dikkat aayi, dobara try karein', true);
    } finally {
      setRecoveringCategories(false);
    }
  };

  const runSystemCheck = () => {
    setScanning(true);
    const photoIssues = [];
    for (const cat of Object.keys(gallery || {})) {
      for (const p of (gallery[cat] || [])) {
        if (!p.url) {
          photoIssues.push({ cat, id: p.id, caption: p.caption, kind: 'missing', detail: 'URL bilkul missing hai' });
        } else if (p.url.startsWith('data:')) {
          const looksTruncated = p.url.length < 2000;
          photoIssues.push({ cat, id: p.id, caption: p.caption, kind: 'data-uri', detail: looksTruncated ? 'Purana data corrupt/adhoora hai - dobara upload karna hoga' : 'Storage par upload nahi ho payi thi - retry se theek ho sakti hai' });
        }
      }
    }

    const brochureIssues = [];
    for (const b of (brochures || [])) {
      if (!b.url) {
        brochureIssues.push({ id: b.id, name: b.name, detail: 'URL missing hai - dobara upload karna hoga' });
      } else if (b.url.startsWith('data:')) {
        brochureIssues.push({ id: b.id, name: b.name, detail: 'Upload poora nahi hua tha - dobara upload karna hoga' });
      }
    }

    const customerIds = new Set((customers || []).map((c) => c.id));
    const orphanedJobs = (jobs || []).filter((j) => j.customerId && !customerIds.has(j.customerId));

    setScanResults({ photoIssues, brochureIssues, orphanedJobs });
    setScanning(false);
  };

  const retryBrokenUploads = async () => {
    if (!scanResults) return;
    const retryable = scanResults.photoIssues.filter((i) => i.kind === 'data-uri' && i.detail.includes('retry'));
    if (retryable.length === 0) { showToast('Retry karne layak koi photo nahi mili', true); return; }
    setRetrying(true);
    let successCount = 0;
    const nextGallery = { ...gallery };
    for (const issue of retryable) {
      const photo = (nextGallery[issue.cat] || []).find((p) => p.id === issue.id);
      if (!photo) continue;
      try {
        const uploaded = await window.fileStorage.upload('gallery_' + photo.id, photo.url);
        if (uploaded && !uploaded.error) {
          nextGallery[issue.cat] = nextGallery[issue.cat].map((p) => (p.id === photo.id ? { ...p, url: uploaded.url } : p));
          successCount++;
        }
      } catch (e) { /* leave this one for the next retry attempt */ }
    }
    if (successCount > 0) {
      await setGallery(nextGallery);
    }
    setRetrying(false);
    showToast(successCount + ' / ' + retryable.length + ' photos fix ho gayi');
    runSystemCheck();
  };
  // Local editable copy of the rates list - changes only get persisted
  // (a Firestore write) when "Rates Save Karein" is tapped, not on
  // every keystroke while typing a rate value.
  const [rateDrafts, setRateDrafts] = useState(estimateRates && estimateRates.length > 0 ? estimateRates : []);
  const [newRateName, setNewRateName] = useState('');
  const [newRateValue, setNewRateValue] = useState('');
  const [newRateUnit, setNewRateUnit] = useState('sqft');
  const addRateType = () => {
    if (!newRateName.trim() || !newRateValue.trim()) { showToast('Naam aur rate dono bharein', true); return; }
    setRateDrafts((prev) => [...prev, { id: uid(), name: newRateName.trim(), rate: newRateValue.trim(), unit: newRateUnit }]);
    setNewRateName(''); setNewRateValue('');
  };
  const updateRateDraft = (id, field, value) => {
    setRateDrafts((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const removeRateDraft = (id) => {
    setRateDrafts((prev) => prev.filter((r) => r.id !== id));
  };
  const saveRates = () => {
    setEstimateRates(rateDrafts);
    showToast('Rates save ho gaye');
  };
  const [showKarigarPerformance, setShowKarigarPerformance] = useState(false);
  // These two were previously declared further down, AFTER the early
  // "if (showKarigarPerformance) return (...)" below - that violates
  // React's Rules of Hooks (every hook must run in the same order on
  // every render, never skipped by an early return), since tapping the
  // Karigar Performance button changes showKarigarPerformance to true,
  // and on THAT render these two hooks would never execute at all -
  // React detects the mismatched hook count and throws, which (with no
  // error boundary anywhere in this app) unmounts the whole tree,
  // exactly matching "button tap -> screen goes blank". Moved here,
  // before the early return, so they run unconditionally on every
  // render regardless of which branch below actually gets shown.
  const [newApptItem, setNewApptItem] = useState('');
  const [newGalleryCategory, setNewGalleryCategory] = useState('');

  if (showKarigarPerformance) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowKarigarPerformance(false)}><ArrowLeft size={13} /> Settings</button>
        </div>
        <AdminKarigarPerformance staff={staff} jobs={jobs || []} attendance={attendance || []} />
      </div>
    );
  }

  const change = () => {
    if (current !== adminPin) { setError('Current PIN galat hai'); return; }
    if (next1.length < 4) { setError('Naya PIN kam se kam 4 digit ka hona chahiye'); return; }
    if (next1 !== next2) { setError('Dono naye PIN match nahi karte'); return; }
    setAdminPin(next1);
    setCurrent(''); setNext1(''); setNext2(''); setError('');
    showToast('Admin PIN change ho gaya');
  };

  const addStaff = () => {
    if (!newStaffName.trim()) { setStaffError('Staff ka naam daalein'); return; }
    if (newStaffPin.length < 4) { setStaffError('PIN kam se kam 4 digit ka ho'); return; }
    const allPins = [adminPin, partnerPin, ...staff.map((s) => s.pin)].filter(Boolean);
    if (allPins.includes(newStaffPin)) { setStaffError('Ye PIN pehle se use ho raha hai - alag PIN chunein'); return; }
    setStaff([...staff, { id: uid(), name: newStaffName.trim(), pin: newStaffPin, role: newStaffRole, createdAt: new Date().toISOString() }]);
    setNewStaffName(''); setNewStaffPin(''); setNewStaffRole('admin'); setStaffError('');
    showToast('Staff member add ho gaya');
  };
  const removeStaff = (id) => {
    setStaff(staff.filter((s) => s.id !== id));
    showToast('Staff member hataya gaya');
  };

  const savePartnerPin = () => {
    if (newPartnerPin.length < 4) { setPartnerPinError('PIN kam se kam 4 digit ka ho'); return; }
    const allPins = [adminPin, ...staff.map((s) => s.pin)];
    if (allPins.includes(newPartnerPin)) { setPartnerPinError('Ye PIN pehle se use ho raha hai - alag PIN chunein'); return; }
    setPartnerPin(newPartnerPin);
    setNewPartnerPin(''); setPartnerPinError('');
    showToast('Partner PIN set ho gaya');
  };
  const removePartnerPin = () => {
    setPartnerPin('');
    showToast('Partner access hata diya gaya');
  };

  const toggleAppointmentItem = (cat) => {
    const next = appointmentItemOptions.includes(cat)
      ? appointmentItemOptions.filter((c) => c !== cat)
      : [...appointmentItemOptions, cat];
    setAppointmentItemOptions(next);
  };
  const addApptItem = () => {
    const name = newApptItem.trim();
    if (!name) return;
    if (appointmentItemOptions.some((c) => c.toLowerCase() === name.toLowerCase())) {
      showToast('Ye item pehle se list mein hai', true);
      return;
    }
    setAppointmentItemOptions([...appointmentItemOptions, name]);
    setNewApptItem('');
    showToast('Item add ho gaya');
  };
  const removeApptItem = (cat) => {
    setAppointmentItemOptions(appointmentItemOptions.filter((c) => c !== cat));
  };

  const addGalleryCategory = () => {
    const name = newGalleryCategory.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      showToast('Ye category pehle se list mein hai', true);
      return;
    }
    setCategories([...categories, name]);
    setNewGalleryCategory('');
    showToast('Category add ho gayi');
  };
  const removeGalleryCategory = (cat) => {
    if ((gallery[cat] || []).length > 0) {
      showToast('Is category mein photos hain - pehle unhe hataein ya move karein', true);
      return;
    }
    setCategories(categories.filter((c) => c !== cat));
    setAppointmentItemOptions(appointmentItemOptions.filter((c) => c !== cat));
  };

  const downloadBackup = () => {
    try {
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = 'shree-krushn-backup-' + dateStr + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup download ho gaya');
    } catch (e) {
      showToast('Backup download nahi ho paya', true);
    }
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Settings</div>
      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Lock size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Change Admin PIN</div>
        </div>
        <div style={styles.fieldLabel}>Current PIN</div>
        <input style={styles.input} type='password' inputMode='numeric' value={current} onChange={(e) => { setCurrent(e.target.value); setError(''); }} />
        <div style={{ ...styles.fieldLabel, marginTop: 10 }}>New PIN</div>
        <input style={styles.input} type='password' inputMode='numeric' value={next1} onChange={(e) => { setNext1(e.target.value); setError(''); }} />
        <div style={{ ...styles.fieldLabel, marginTop: 10 }}>Confirm New PIN</div>
        <input style={styles.input} type='password' inputMode='numeric' value={next2} onChange={(e) => { setNext2(e.target.value); setError(''); }} />
        {error && <div style={styles.errorText}>{error}</div>}
        <button style={{ ...styles.primaryBtn, marginTop: 14 }} onClick={change}>Update PIN</button>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Users size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Partner Access</div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>
          Partner ko apni PIN dein - wo customers, gallery, reviews dekh/manage kar sakta hai, lekin Settings, staff PINs, ya expenses nahi dekh sakta.
        </div>
        {partnerPin ? (
          <div style={styles.staffRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.itemDesc}>Partner PIN active</div>
              <div style={styles.itemSub}>PIN: {partnerPin}</div>
            </div>
            <button style={styles.cardActionBtn} onClick={removePartnerPin}>Remove</button>
          </div>
        ) : (
          <div>
            <input style={styles.input} placeholder='Partner PIN set karein (4+ digit)' inputMode='numeric' type='password' value={newPartnerPin} onChange={(e) => { setNewPartnerPin(e.target.value); setPartnerPinError(''); }} />
            {partnerPinError && <div style={styles.errorText}>{partnerPinError}</div>}
            <button style={styles.addBtn} onClick={savePartnerPin}><UserPlus size={14} /> Enable partner access</button>
          </div>
        )}
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color={BRAND.gold} />
            <div style={{ fontWeight: 800, fontSize: 14 }}>Staff Logins</div>
          </div>
          {staff.some((s) => s.role === 'karigar') && (
            <button style={styles.linkBtn2} onClick={() => setShowKarigarPerformance(true)}>Karigar Performance</button>
          )}
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Team members ko alag PIN dein taaki wo bhi access kar sakein.</div>

        {staff.length === 0 && <div style={styles.emptySmall}>Abhi koi staff member add nahi kiya.</div>}
        {staff.map((s) => (
          <div key={s.id} style={styles.staffRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.itemDesc}>{s.name} <span style={styles.reqCatBadge}>{s.role === 'karigar' ? 'Karigar' : 'Admin'}</span></div>
              <div style={styles.itemSub}>PIN: {s.pin}</div>
            </div>
            <button style={styles.iconBtnSmall} onClick={() => removeStaff(s.id)}><Trash2 size={14} color='#C7CCDC' /></button>
          </div>
        ))}

        <div style={{ marginTop: 10 }}>
          <input style={styles.input} placeholder='Staff member ka naam' value={newStaffName} onChange={(e) => { setNewStaffName(e.target.value); setStaffError(''); }} />
          <input style={{ ...styles.input, marginTop: 8 }} placeholder='PIN set karein (4+ digit)' inputMode='numeric' type='password' value={newStaffPin} onChange={(e) => { setNewStaffPin(e.target.value); setStaffError(''); }} />
          <div style={styles.chipRow}>
            <button onClick={() => setNewStaffRole('admin')} style={{ ...styles.chip, ...(newStaffRole === 'admin' ? styles.chipActive : {}) }}>Admin Access</button>
            <button onClick={() => setNewStaffRole('karigar')} style={{ ...styles.chip, ...(newStaffRole === 'karigar' ? styles.chipActive : {}) }}>Karigar (sirf assigned kaam)</button>
          </div>
          {staffError && <div style={styles.errorText}>{staffError}</div>}
          <button style={styles.addBtn} onClick={addStaff}><UserPlus size={14} /> Add staff login</button>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Calendar size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Appointment Checklist</div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Customer appointment book karte waqt kaunse work-items dikhne chahiye, select karein.</div>
        <div style={{ marginTop: 4 }}>
          {appointmentItemOptions.map((cat) => (
            <div key={cat} style={styles.staffRow}>
              <div style={{ flex: 1 }}>{cat}</div>
              <button style={styles.iconBtnSmall} onClick={() => removeApptItem(cat)}><Trash2 size={14} color='#C7CCDC' /></button>
            </div>
          ))}
          <input style={{ ...styles.input, marginTop: 10 }} placeholder='Naya item add karein (jaise "Painting")' value={newApptItem} onChange={(e) => setNewApptItem(e.target.value)} />
          <button style={styles.addBtn} onClick={addApptItem}><Plus size={14} /> Item add karein</button>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Grid3x3 size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Gallery Categories</div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Design gallery mein kaunse categories dikhein, add/remove karein.</div>
        <div style={{ marginTop: 4 }}>
          {galleryCategoriesForSettings.map((cat) => (
            <div key={cat} style={styles.staffRow}>
              <div style={{ flex: 1 }}>{cat} <span style={styles.itemSub}>({(gallery[cat] || []).length} photos)</span></div>
              <button style={styles.iconBtnSmall} onClick={() => removeGalleryCategory(cat)}><Trash2 size={14} color='#C7CCDC' /></button>
            </div>
          ))}
          <input style={{ ...styles.input, marginTop: 10 }} placeholder='Nayi category ka naam' value={newGalleryCategory} onChange={(e) => setNewGalleryCategory(e.target.value)} />
          <button style={styles.addBtn} onClick={addGalleryCategory}><Plus size={14} /> Category add karein</button>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <HelpCircle size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>FAQ / Help</div>
        </div>
        <div style={styles.plainTextMuted}>Customer ki Help screen mein dikhne wale common sawaal-jawab.</div>
        {(faqs || []).map((f, i) => (
          <div key={f.id} style={{ ...styles.formCard, marginTop: 10 }}>
            {editingFaqId === f.id ? (
              <FaqEditForm faq={f} onSave={(q, a) => updateFaq(f.id, q, a)} onCancel={() => setEditingFaqId(null)} />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.itemDesc}>{f.question}</div>
                    <div style={{ ...styles.itemSub, marginTop: 4 }}>{f.answer}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button style={styles.iconBtnSmall} onClick={() => moveFaq(f.id, -1)} disabled={i === 0}><ChevronUp size={13} color='#B3B8C6' /></button>
                    <button style={styles.iconBtnSmall} onClick={() => moveFaq(f.id, 1)} disabled={i === faqs.length - 1}><ChevronDown size={13} color='#B3B8C6' /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => setEditingFaqId(f.id)}><Edit3 size={12} /> Edit</button>
                  <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => removeFaq(f.id)}><Trash2 size={12} /> Hataein</button>
                </div>
              </>
            )}
          </div>
        ))}
        <div style={{ ...styles.formCard, marginTop: 10, background: '#FFF9EE', borderColor: BRAND.gold }}>
          <div style={styles.fieldLabel}>Naya FAQ Add Karein</div>
          <input style={{ ...styles.input, marginTop: 6 }} placeholder='Sawaal (jaise: PVC furniture waterproof hai?)' value={newFaqQuestion} onChange={(e) => setNewFaqQuestion(e.target.value)} />
          <textarea style={{ ...styles.input, marginTop: 8, minHeight: 70, resize: 'vertical' }} placeholder='Jawab' value={newFaqAnswer} onChange={(e) => setNewFaqAnswer(e.target.value)} />
          <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={addFaq}><Plus size={14} /> FAQ Add Karein</button>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Bell size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Push Notifications</div>
        </div>
        <div style={styles.plainTextMuted}>App band ho tab bhi (naye appointment, estimate approve, waghera) turant notification mile - is device par on karein.</div>
        <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={enableAdminPushNotifications}><Bell size={14} /> Is Device Par Notifications On Karein</button>
        {adminPushTokens.length > 0 && (
          <div style={{ ...styles.itemSub, marginTop: 8 }}>{adminPushTokens.length} device(s) par notifications on hain</div>
        )}
      </div>

      <div style={{ ...styles.card, marginTop: 12, borderColor: BRAND.navy, borderWidth: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ShieldCheck size={18} color={BRAND.navy} />
          <div style={{ fontWeight: 800, fontSize: 14.5, color: BRAND.navy }}>System Health Check</div>
        </div>
        <div style={styles.plainTextMuted}>Gallery photos, brochure PDFs, aur customer records check karta hai - jo automatically fix ho sakta hai, karta hai; baaki clearly bata deta hai.</div>
        <button style={{ ...styles.primaryBtn2, marginTop: 10 }} onClick={runSystemCheck} disabled={scanning}>
          <Search size={14} /> {scanning ? 'Check ho raha hai...' : 'Poori App Check Karein'}
        </button>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed ' + BRAND.line }}>
          <div style={styles.fieldLabel}>Missing Gallery Categories Recover Karein</div>
          <div style={styles.plainTextMuted}>Agar koi purani category (jaise "Study Table", "Washbasin") ki photos dikhna band ho gayi hain, is button se dhoondke wapas la sakte hain - photo data kabhi delete nahi hota, sirf list se hat jaata hai.</div>
          <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={recoverMissingCategories} disabled={recoveringCategories}>
            <Search size={14} /> {recoveringCategories ? 'Dhoondh raha hai...' : 'Missing Categories Recover Karein'}
          </button>
        </div>

        {scanResults && (() => {
          const totalIssues = scanResults.photoIssues.length + scanResults.brochureIssues.length + scanResults.orphanedJobs.length;
          const hasRetryable = scanResults.photoIssues.some((i) => i.kind === 'data-uri' && i.detail.includes('retry'));
          return (
            <div style={{ marginTop: 10 }}>
              {totalIssues === 0 ? (
                <div style={{ ...styles.estimateStatusBanner, background: '#E8F5E9', color: '#2E7D32' }}>
                  <CheckCircle2 size={14} /> Sab kuch theek hai - koi masla nahi mila
                </div>
              ) : (
                <div style={{ ...styles.estimateStatusBanner, background: '#FFF3E0', color: '#E65100' }}>
                  <AlertCircle size={14} /> {totalIssues} masle mile
                </div>
              )}
              {hasRetryable && (
                <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={retryBrokenUploads} disabled={retrying}>
                  <Send size={14} /> {retrying ? 'Retry ho raha hai...' : 'Automatic Retry Karein'}
                </button>
              )}

              {scanResults.photoIssues.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.fieldLabel}>Gallery Photos ({scanResults.photoIssues.length})</div>
                  {scanResults.photoIssues.map((i) => (
                    <div key={i.cat + '_' + i.id} style={{ ...styles.itemRow, marginTop: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.itemDesc}>{i.cat}{i.caption ? (' - ' + i.caption) : ''}</div>
                        <div style={styles.itemSub}>{i.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scanResults.brochureIssues.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.fieldLabel}>Brochure PDFs ({scanResults.brochureIssues.length})</div>
                  {scanResults.brochureIssues.map((i) => (
                    <div key={i.id} style={{ ...styles.itemRow, marginTop: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.itemDesc}>{i.name}</div>
                        <div style={styles.itemSub}>{i.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scanResults.orphanedJobs.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.fieldLabel}>Customer Records ({scanResults.orphanedJobs.length})</div>
                  <div style={styles.plainTextMuted}>Ye jobs ke customer records delete ho chuke hain, lekin job data abhi bhi bacha hai - shayad delete beech mein ruk gaya tha.</div>
                  {scanResults.orphanedJobs.map((j) => (
                    <div key={j.id} style={{ ...styles.itemRow, marginTop: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={styles.itemDesc}>{j.customerName || 'Naam nahi hai'}</div>
                        <div style={styles.itemSub}>Customer record nahi mila</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Calculator size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Customer Estimate Calculator Rates</div>
        </div>
        <div style={styles.plainTextMuted}>Har alag cheez ka apna rate (₹ per sqft) - Framing, Box, Basket, Drawer, TV Cabinet, Partition, jo bhi chahiye. Customer ke "Instant Estimate Calculator" mein use hota hai.</div>

        {rateDrafts.map((r) => (
          <div key={r.id} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid ' + BRAND.line }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input style={{ ...styles.input, flex: 1.3 }} placeholder='Naam' value={r.name} onChange={(e) => updateRateDraft(r.id, 'name', e.target.value)} />
              <input style={{ ...styles.input, flex: 1 }} inputMode='decimal' placeholder={r.unit === 'piece' ? '₹/piece' : '₹/sqft'} value={r.rate} onChange={(e) => updateRateDraft(r.id, 'rate', e.target.value)} />
              <button style={styles.iconBtnSmall} onClick={() => removeRateDraft(r.id)}><Trash2 size={14} color='#C7CCDC' /></button>
            </div>
            <div style={{ ...styles.chipRow, marginTop: 6 }}>
              <button onClick={() => updateRateDraft(r.id, 'unit', 'sqft')} style={{ ...styles.chip, ...((r.unit || 'sqft') === 'sqft' ? styles.chipActive : {}) }}>Sqft ke hisaab se</button>
              <button onClick={() => updateRateDraft(r.id, 'unit', 'piece')} style={{ ...styles.chip, ...(r.unit === 'piece' ? styles.chipActive : {}) }}>Per Piece (Nang)</button>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px dashed ' + BRAND.line }}>
          <div style={styles.fieldLabel}>Naya Rate Type</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input style={{ ...styles.input, flex: 1.3 }} placeholder='Naam (jaise Basket)' value={newRateName} onChange={(e) => setNewRateName(e.target.value)} />
            <input style={{ ...styles.input, flex: 1 }} inputMode='decimal' placeholder={newRateUnit === 'piece' ? '₹/piece' : '₹/sqft'} value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} />
          </div>
          <div style={{ ...styles.chipRow, marginTop: 6 }}>
            <button onClick={() => setNewRateUnit('sqft')} style={{ ...styles.chip, ...(newRateUnit === 'sqft' ? styles.chipActive : {}) }}>Sqft ke hisaab se</button>
            <button onClick={() => setNewRateUnit('piece')} style={{ ...styles.chip, ...(newRateUnit === 'piece' ? styles.chipActive : {}) }}>Per Piece (Nang)</button>
          </div>
        </div>
        <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={addRateType}><Plus size={14} /> Naya Rate Type Add Karein</button>
        <button style={{ ...styles.primaryBtn2, marginTop: 10 }} onClick={saveRates}><CheckCircle2 size={14} /> Sab Rates Save Karein</button>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed ' + BRAND.line }}>
          <div style={styles.fieldLabel}>Price List PDF</div>
          <div style={styles.plainTextMuted}>Saare rates ka ek professional PDF - customer ko WhatsApp par bhej sakte hain.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF', flex: 1 }} onClick={() => sharePriceListPdf(estimateRates, showToast)}><Send size={13} /> WhatsApp</button>
            <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => generatePriceListPdf(estimateRates, showToast)}><FileText size={13} /> Download</button>
          </div>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <FileText size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Product Brochures (PDF)</div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Apni company details ka PDF, ya alag-alag laminate companies ke color catalog PDFs upload karein - customer inhe Gallery se dekh sakega.</div>
        <BrochureUploadPanel addBrochure={addBrochure} brochures={brochures} showToast={showToast} />
        <div style={{ marginTop: 12 }}>
          <BrochureList brochures={brochures} showToast={showToast} canManage={true} onDelete={removeBrochure} />
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Download size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Backup Data</div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Sab customers, jobs, gallery, aur staff ka data ek JSON file mein download karein.</div>
        <button style={styles.addBtn} onClick={downloadBackup}><Download size={14} /> Download backup</button>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ShieldCheck size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Customer Data Privacy</div>
        </div>
        <div style={styles.plainText}>
          Har customer login sirf apna hi naam, requirements, progress photos aur payment dekh sakta hai.
          Dusre kisi bhi customer ka data unhe kabhi nahi dikhta - sirf aap (Admin) sabka data ek saath dekh sakte hain.
        </div>
      </div>

      <button style={{ ...styles.addBtn, background: '#FFEBEE', color: '#C62828', marginTop: 12 }} onClick={onLogout}><LogOut size={14} /> Logout</button>
    </div>
  );
}

/* ---- Partner: same admin interface but Settings is a stub with no
   access to PINs, staff, or backups - only their own login info. ---- */
function PartnerSettings({ staffName, onLogout }) {
  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Settings</div>
      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ShieldCheck size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Partner Access</div>
        </div>
        <div style={styles.plainText}>
          Aap '{staffName || 'Partner'}' ke roop mein logged in hain. Partner access mein Admin PIN, staff logins,
          expenses, aur data backup nahi dikhte - sirf customers, gallery, aur reviews manage kar sakte hain.
        </div>
      </div>
      <button style={{ ...styles.addBtn, background: '#FFEBEE', color: '#C62828', marginTop: 12 }} onClick={onLogout}><LogOut size={14} /> Logout</button>
    </div>
  );
}

/* ---- Brochure upload: reads a PDF file from device, converts to a
   data URI, and saves it under the chosen category. No compression is
   applied (PDFs don't shrink like images) - if a file exceeds the storage
   cap, the save is rejected with a clear message. Real PDF brochures
   (several pages of product photos) often run 1-5MB, well past what a
   single Firestore document can hold - a scanned/compressed PDF, or one
   split into fewer pages, is needed to fit under this limit. ---- */
function BrochureUploadPanel({ addBrochure, brochures, showToast }) {
  // Three kinds of PDF: our own "Company Details" document (PVC
  // furniture benefits, business info - always tagged to the
  // business's own name, no separate company field needed), a "Fluted
  // Panel Catalog" and a "Laminate Catalog" from a material supplier
  // (each needs a company name, since there are several suppliers).
  // Fluted and laminate are kept as separate types (not just separate
  // company names under one catalog type) since they're different
  // product lines the business sells, not interchangeable finishes of
  // the same thing. Picking one up front decides which fields show
  // next and how the saved PDF gets grouped in BrochureList.
  const [docType, setDocType] = useState('catalog');
  const knownCompanies = useMemo(() => {
    const set = new Set();
    (brochures || []).forEach((b) => { if (b.docType === docType && b.company) set.add(b.company); });
    return Array.from(set);
  }, [brochures, docType]);
  const [company, setCompany] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleFilePicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (docType !== 'profile' && !company.trim()) { showToast('Company ka naam likhein', true); return; }
    if (file.type !== 'application/pdf') { showToast('Sirf PDF file select karein', true); return; }
    setUploading(true);
    try {
      const dataUri = await fileToDataUri(file);
      const sizeBytes = dataUriByteSize(dataUri);
      if (sizeBytes > MAX_BROCHURE_BYTES) {
        showToast('PDF bahut badi hai (' + (sizeBytes / (1024 * 1024)).toFixed(1) + 'MB) - ' + (MAX_BROCHURE_BYTES / (1024 * 1024)).toFixed(0) + 'MB se choti file try karein', true);
        return;
      }
      const nameLower = file.name.toLowerCase();
      const displayName = nameLower.endsWith('.pdf') ? file.name.slice(0, file.name.length - 4) : file.name;
      const meta = {
        id: uid(),
        name: displayName,
        docType,
        company: docType === 'profile' ? BUSINESS.name : company.trim(),
        sizeKb: Math.round(sizeBytes / 1024),
      };
      const ok = await addBrochure(meta, dataUri);
      if (ok) showToast('PDF add ho gayi');
    } catch (e) {
      showToast('PDF upload nahi ho payi', true);
    } finally {
      setUploading(false);
    }
  };

  const canUpload = docType === 'profile' || company.trim();
  const typeLabel = docType === 'profile' ? 'Company Details' : docType === 'fluted' ? 'Fluted Panel Catalog' : 'Laminate Catalog';

  return (
    <div>
      <div style={styles.fieldLabel}>PDF Kis Type Ki Hai</div>
      <div style={styles.chipRow}>
        <button onClick={() => { setDocType('profile'); setCompany(''); }} style={{ ...styles.chip, ...(docType === 'profile' ? styles.chipActive : {}) }}>Company Details</button>
        <button onClick={() => { setDocType('fluted'); setCompany(''); }} style={{ ...styles.chip, ...(docType === 'fluted' ? styles.chipActive : {}) }}>Fluted Catalog</button>
        <button onClick={() => { setDocType('catalog'); setCompany(''); }} style={{ ...styles.chip, ...(docType === 'catalog' ? styles.chipActive : {}) }}>Laminate Catalog</button>
      </div>
      {docType !== 'profile' && (
        <>
          <div style={{ ...styles.fieldLabel, marginTop: 10 }}>Company</div>
          {knownCompanies.length > 0 && (
            <div style={styles.chipRow}>
              {knownCompanies.map((c) => (
                <button key={c} onClick={() => setCompany(c)} style={{ ...styles.chip, ...(company === c ? styles.chipActive : {}) }}>{c}</button>
              ))}
            </div>
          )}
          <input style={{ ...styles.input, marginTop: 8 }} placeholder='Company ka naam (jaise Kaka)' value={company} onChange={(e) => setCompany(e.target.value)} />
        </>
      )}
      <input ref={fileInputRef} type='file' accept='application/pdf' style={{ display: 'none' }} onChange={handleFilePicked} />
      <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading || !canUpload}>
        <FileText size={14} /> {uploading ? 'Uploading...' : (docType === 'profile' ? 'Upload Company Details PDF' : 'Upload ' + typeLabel + ' for ' + (company || '...'))}
      </button>
    </div>
  );
}

/* ===================== styles ===================== */
const fontImport = "@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=DM+Mono:wght@500&display=swap');";

const styles = {
  app: { fontFamily: "'Manrope', system-ui, sans-serif", background: BRAND.cream, minHeight: '100vh', color: BRAND.navy, maxWidth: 480, margin: '0 auto', position: 'relative' },
  loadingScreen: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' },

  loginWrap: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' },
  loginBgAccent: { position: 'absolute', top: -80, right: -80, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(15,27,61,0.06), transparent 70%)' },
  loginBrand: { textAlign: 'center', marginBottom: 28, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  loginLogo: { width: 76, height: 76, objectFit: 'contain', borderRadius: '50%' },
  loginCover: { width: '100%', maxWidth: 340, height: 126, objectFit: 'cover', objectPosition: 'center', borderRadius: 14, marginTop: 18, border: '1px solid ' + BRAND.line },
  brandName: { fontWeight: 800, fontSize: 19, letterSpacing: 1.5, marginTop: 14, color: BRAND.navy },
  brandNameSub: { fontSize: 10.5, color: BRAND.gold, fontWeight: 800, letterSpacing: 3, marginTop: 3 },
  brandSub: { fontSize: 12, color: BRAND.textMuted, fontWeight: 600, marginTop: 10 },
  loginCard: { width: '100%', maxWidth: 340, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 16, padding: 20, position: 'relative', boxShadow: '0 4px 20px rgba(15,27,61,0.06)' },
  verifiedTag: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#2F7D4F' },
  callBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', background: '#2F7D4F', color: '#FFF', textDecoration: 'none', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700, marginBottom: 10, boxSizing: 'border-box' },
  waShareBtn: { display: 'flex', alignItems: 'center', gap: 5, background: '#25D366', color: '#FFF', textDecoration: 'none', borderRadius: 20, padding: '7px 12px', fontSize: 11.5, fontWeight: 700 },
  pdfDownloadBtn: { display: 'flex', alignItems: 'center', gap: 5, background: BRAND.navy, color: '#FFF', border: 'none', textDecoration: 'none', borderRadius: 20, padding: '7px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', position: 'sticky', top: 0, background: BRAND.cream, zIndex: 25 },
  brandRow: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  brandNameSm: { fontWeight: 800, fontSize: 14.5, letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  brandSubSm: { fontSize: 11, color: BRAND.gold, fontWeight: 700, marginTop: 1 },
  logoutBtn: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 20, padding: '8px 10px', cursor: 'pointer', color: BRAND.navy, flexShrink: 0 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, position: 'relative' },
  notifBadge: { position: 'absolute', top: 0, right: 0, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 8, background: '#D14343', color: '#FFF', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 },
  notifBackdrop: { position: 'fixed', inset: 0, zIndex: 90, background: 'transparent' },
  notifPanel: { position: 'absolute', top: 34, right: 0, width: 300, maxWidth: '85vw', background: '#FFF', borderRadius: 12, boxShadow: '0 8px 28px rgba(15,27,61,0.18)', border: '1px solid ' + BRAND.line, zIndex: 91, overflow: 'hidden' },
  notifPanelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid ' + BRAND.line, fontWeight: 800, fontSize: 13 },
  notifMarkAllBtn: { background: 'none', border: 'none', color: BRAND.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 },
  notifList: { maxHeight: 320, overflowY: 'auto' },
  notifRow: { display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid ' + BRAND.line, cursor: 'pointer', textAlign: 'left' },
  notifRowUnread: { background: '#FBF6EC' },
  notifIconWrap: { width: 26, height: 26, borderRadius: 13, background: BRAND.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  notifMessage: { fontSize: 12.5, fontWeight: 600, color: BRAND.navy, lineHeight: 1.35 },
  notifTime: { fontSize: 10.5, color: BRAND.textMuted, marginTop: 2 },
  notifDot: { width: 7, height: 7, borderRadius: 4, background: BRAND.gold, flexShrink: 0, marginTop: 5 },
  iconBtnSmall: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 },

  bottomNav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: BRAND.paper, borderTop: '2px solid ' + BRAND.navy, display: 'flex', padding: '8px 4px', zIndex: 30, overflowX: 'auto' },
  navBtn: { position: 'relative', flex: '1 0 62px', minWidth: 62, background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', padding: '4px 2px' },
  navLabel: { fontSize: 9.5, whiteSpace: 'nowrap' },
  navIndicator: { position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: 2, background: BRAND.gold },

  heroCard: { background: BRAND.navy, borderRadius: 16, padding: 16, color: '#FDFCF8' },
  heroTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  heroGreeting: { fontWeight: 800, fontSize: 15.5, letterSpacing: -0.2 },
  heroSub: { fontSize: 11.5, color: '#9AA3C2', marginTop: 2 },
  progressTrack: { height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, transition: 'width 0.4s ease' },
  progressLabels: { display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 9.5 },

  quickGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '14px 0' },
  quickTile: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 13, padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' },
  quickTileLabel: { fontSize: 11.5, fontWeight: 700, color: BRAND.navy, textAlign: 'center' },

  activityList: { display: 'flex', flexDirection: 'column', gap: 2 },
  activityRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0' },
  activityDot: { width: 6, height: 6, borderRadius: 3, background: BRAND.gold, marginTop: 6, flexShrink: 0 },
  activityText: { fontSize: 12.5, fontWeight: 600, color: '#333B57' },

  sectionTitle: { fontWeight: 800, fontSize: 16, letterSpacing: -0.3, marginBottom: 4, color: BRAND.navy },
  plainTextMuted: { fontSize: 12.5, color: BRAND.textMuted, marginBottom: 4 },
  plainText: { fontSize: 13.5, color: '#333B57', lineHeight: 1.5 },
  emptySmall: { fontSize: 12.5, color: BRAND.textMuted, padding: '10px 0' },
  emptyBlock: { textAlign: 'center', padding: '30px 10px', color: BRAND.textMuted },
  emptyBlockText: { fontSize: 12.5, marginTop: 8 },
  empty: { textAlign: 'center', padding: '40px 20px', color: BRAND.textMuted, fontSize: 13 },

  catGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 },
  catCard: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 14, padding: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  catCover: { position: 'relative', width: '100%', height: 90, borderRadius: 10, background: '#EEF0F5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8 },
  catCoverImg: { width: '100%', height: '100%', objectFit: 'cover' },
  catCoverBadge: { position: 'absolute', top: 6, right: 6, background: 'rgba(15,27,61,0.75)', color: '#FFF', fontSize: 10, fontWeight: 800, borderRadius: 10, padding: '2px 6px' },
  catName: { fontWeight: 800, fontSize: 13.5 },
  catSub: { fontSize: 11, color: BRAND.textMuted, marginTop: 2, fontWeight: 600 },
  catTitle: { fontWeight: 800, fontSize: 17, letterSpacing: -0.3, margin: '10px 0 10px' },
  catCount: { color: BRAND.textMuted, fontWeight: 600, fontSize: 13 },

  photoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 8 },
  photoThumb: { border: 'none', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#EEF0F5', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  photoThumbCatTag: { position: 'absolute', bottom: 4, left: 4, right: 4, background: 'rgba(15,27,61,0.75)', color: '#FFF', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 5, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  // Google Photos-style masonry grid for the actual design gallery
  // (browsing/inspiration photos) specifically - NOT used for progress
  // photo logs elsewhere, which stay in the fixed-square grid above,
  // since those are more of a checklist than something meant to be
  // browsed for its visual look. CSS multi-column layout lets each
  // photo keep its own natural aspect ratio and flow into whichever
  // column has room next, rather than every photo being forced into an
  // identical square box - a portrait photo squeezed into a square
  // (object-fit: contain) leaves visible empty space on two sides,
  // which is exactly the "white space" look being fixed here.
  galleryMasonry: { columnCount: 3, columnGap: 6, marginTop: 8 },
  galleryMasonryItem: { border: 'none', padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#EEF0F5', display: 'block', width: '100%', marginBottom: 6, breakInside: 'avoid', position: 'relative' },
  galleryMasonryImg: { width: '100%', height: 'auto', display: 'block', objectFit: 'cover' },
  recentPhotoStrip: { display: 'flex', gap: 8, overflowX: 'auto', marginTop: 8, paddingBottom: 4 },
  recentPhotoThumb: { flexShrink: 0, width: 74, height: 74, border: 'none', padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: '#EEF0F5' },
  recentPhotoImg: { width: '100%', height: '100%', objectFit: 'cover' },
  photoImg: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' },
  progressPhotoCard: { position: 'relative', background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 8, overflow: 'hidden' },
  progressCaption: { fontSize: 10.5, padding: '4px 6px', color: '#333B57', fontWeight: 600 },
  photoDeleteBtn: { position: 'absolute', top: 4, right: 4, background: 'rgba(15,27,61,0.75)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer' },
  photoEditTapArea: { display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'pointer' },

  previewWrap: { marginTop: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid ' + BRAND.line, maxHeight: 140 },
  multiPhotoPreviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 },
  multiPhotoPreviewItem: { position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid ' + BRAND.line, aspectRatio: '1', background: '#EEF0F5' },
  multiPhotoPreviewImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  multiPhotoPreviewRemove: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: 10, background: 'rgba(15,27,61,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  multiPhotoPreviewAddMore: { border: '1.5px dashed ' + BRAND.line, borderRadius: 8, aspectRatio: '1', background: BRAND.paper, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modeToggleRow: { display: 'flex', gap: 6 },
  modeToggleBtn: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: '1px solid ' + BRAND.line, background: BRAND.paper, borderRadius: 9, padding: '9px', fontSize: 12, fontWeight: 700, color: BRAND.textMuted, cursor: 'pointer', fontFamily: 'inherit' },
  modeToggleBtnActive: { background: BRAND.navy, color: '#FFF', borderColor: BRAND.navy },
  uploadTapArea: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed ' + BRAND.gold, background: '#F3EFE3', borderRadius: 12, padding: '22px 14px', cursor: 'pointer', fontFamily: 'inherit' },
  uploadHint: { fontSize: 12, fontWeight: 600, color: '#333B57', textAlign: 'center', maxWidth: 220 },
  previewImg: { width: '100%', height: 140, objectFit: 'cover', display: 'block' },

  lightboxOverlay: { position: 'fixed', inset: 0, background: 'rgba(10,14,28,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, flexDirection: 'column' },
  lightboxImg: { maxWidth: '92%', maxHeight: '78vh', borderRadius: 6, objectFit: 'contain', touchAction: 'pan-y' },
  lightboxImgWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', touchAction: 'pan-y' },
  lightboxSwipeHint: { color: '#6A7290', fontSize: 10.5, marginTop: 6, textAlign: 'center' },
  lightboxClose: { position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer' },
  lightboxSaveBtn: { position: 'absolute', top: 16, right: 56, background: 'none', border: 'none', cursor: 'pointer' },
  lightboxCounter: { position: 'absolute', top: 18, left: 16, color: '#9AA3C2', fontSize: 12, fontWeight: 700 },
  lightboxNav: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 20, padding: 6, cursor: 'pointer' },
  lightboxCaption: { color: '#FDFCF8', fontSize: 12.5, marginTop: 14, textAlign: 'center', padding: '0 24px' },

  fieldLabel: { fontSize: 11.5, fontWeight: 700, color: BRAND.gold, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { width: '100%', border: '1px solid ' + BRAND.line, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', color: BRAND.navy, boxSizing: 'border-box', background: BRAND.paper },
  errorText: { color: '#B5562E', fontSize: 12, fontWeight: 600, marginTop: 8 },
  otpDemoBox: { display: 'flex', alignItems: 'flex-start', gap: 6, background: '#FFF3E0', border: '1px solid #F5D6B8', borderRadius: 8, padding: '8px 10px', marginTop: 10, fontSize: 11.5, color: '#7A4A1F', lineHeight: 1.4 },
  primaryBtn: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: BRAND.navy, color: '#FFF', border: 'none', borderRadius: 12, padding: '13px', fontWeight: 800, fontSize: 14.5, cursor: 'pointer' },
  primaryBtn2: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: BRAND.navy, color: '#FFF', border: 'none', borderRadius: 12, padding: '12px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', marginTop: 12 },
  adminLink: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', background: 'none', border: 'none', color: BRAND.textMuted, fontSize: 12, fontWeight: 700, marginTop: 14, cursor: 'pointer' },
  backLink: { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: BRAND.textMuted, fontSize: 12, fontWeight: 700, marginTop: 12, cursor: 'pointer', padding: 0 },
  linkBtn2: { background: 'none', border: 'none', color: '#3D6B66', fontWeight: 700, fontSize: 12, cursor: 'pointer', marginTop: 8, padding: 0 },
  roundAddBtn: { width: 36, height: 36, borderRadius: 18, background: BRAND.navy, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  cancelBtn: { background: 'none', border: '1px solid ' + BRAND.line, borderRadius: 12, padding: '0 16px', fontWeight: 700, fontSize: 13, color: BRAND.textMuted, cursor: 'pointer' },
  formCard: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 14, padding: 14, marginTop: 12 },

  chipRow: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 },
  chip: { border: '1px solid ' + BRAND.line, background: BRAND.paper, color: '#333B57', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0 },
  chipActive: { background: BRAND.navy, color: '#FFF', borderColor: BRAND.navy },
  checklistGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 },
  checklistItem: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid ' + BRAND.line, background: BRAND.paper, borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 700, color: '#333B57', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  checklistItemActive: { background: '#EEF0F5', borderColor: BRAND.navy },
  checkbox: { width: 16, height: 16, borderRadius: 4, border: '1.5px solid ' + BRAND.line, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.paper },
  checkboxActive: { background: BRAND.navy, borderColor: BRAND.navy },
  filterRow: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginTop: 8 },
  sortRow: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, overflowX: 'auto' },
  sortLabel: { fontSize: 11, color: BRAND.textMuted, fontWeight: 700, flexShrink: 0 },
  sortBtn: { border: 'none', background: 'none', color: BRAND.textMuted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: '3px 7px', borderRadius: 6, flexShrink: 0 },
  sortBtnActive: { background: '#F3EFE3', color: BRAND.gold },

  searchWrap: { display: 'flex', alignItems: 'center', gap: 8, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: '9px 12px', marginTop: 12 },
  searchInput: { border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, flex: 1, fontFamily: 'inherit', color: BRAND.navy },

  statRow2: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 4 },
  statCard: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: '10px 8px', textAlign: 'center' },
  statIcon: { display: 'flex', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontWeight: 800, fontSize: 14, letterSpacing: -0.3, color: BRAND.navy },
  statLabel: { fontSize: 9, color: BRAND.textMuted, marginTop: 2, fontWeight: 600, lineHeight: 1.2 },

  alertBox: { display: 'flex', gap: 10, alignItems: 'flex-start', background: '#F7E3D8', border: '1px solid #EAC4AC', borderRadius: 12, padding: '10px 12px', marginTop: 10 },
  alertText: { fontSize: 12, fontWeight: 700, color: '#8A3E1F' },

  card: { position: 'relative', background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 14, padding: 14, textAlign: 'left', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(15,27,61,0.04)' },
  cardClickArea: { display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, margin: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  cardActionsRow: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px dashed #EEF0F5' },
  cardActionBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: BRAND.textMuted, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 },
  cardActionBtnActive: { background: BRAND.gold, color: '#FFF', padding: '4px 8px', borderRadius: 12 },
  confirmDialog: { background: '#FFF', borderRadius: 16, padding: 22, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  confirmDialogTitle: { fontWeight: 800, fontSize: 14.5, color: BRAND.navy, marginTop: 10 },
  confirmDialogText: { fontSize: 12, color: BRAND.textMuted, marginTop: 6, lineHeight: 1.5 },
  staffRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #EEF0F5' },
  brochureRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #EEF0F5' },
  brochureSection: { marginTop: 12, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: 10 },
  brochureSectionToggle: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: BRAND.navy, fontFamily: 'inherit' },
  brochureIcon: { width: 32, height: 32, borderRadius: 8, background: '#F3EFE3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  brochureOpenBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 15, background: BRAND.navy, color: '#FFF', border: 'none', cursor: 'pointer', flexShrink: 0 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,27,61,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 },
  sheet: { background: BRAND.cream, width: '100%', maxWidth: 480, maxHeight: '88vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sheetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 10px', borderBottom: '1px solid ' + BRAND.line, background: BRAND.paper },
  sheetTitle: { fontWeight: 800, fontSize: 16, letterSpacing: -0.2, color: BRAND.navy },
  sheetBody: { padding: '14px 16px', overflowY: 'auto' },
  sheetFooter: { padding: '12px 16px 18px', borderTop: '1px solid ' + BRAND.line, background: BRAND.paper },
  cardTop: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  cardStub: { background: BRAND.cream, border: '1px dashed ' + BRAND.line, borderRadius: 8, padding: '5px 8px', textAlign: 'center', flexShrink: 0 },
  stubLabel: { fontSize: 8, fontWeight: 800, color: '#A8AEC2', letterSpacing: 1 },
  stubNo: { fontSize: 11, fontWeight: 800, color: BRAND.gold, fontFamily: "'DM Mono', monospace" },
  cardName: { fontWeight: 800, fontSize: 14.5, letterSpacing: -0.2, marginBottom: 3, color: BRAND.navy },
  cardMeta: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  metaItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: BRAND.textMuted, fontWeight: 600 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 800, padding: '4px 9px', borderRadius: 20, flexShrink: 0 },
  reqPreview: { marginTop: 10, paddingTop: 8, borderTop: '1px dashed ' + BRAND.line, fontSize: 11.5, color: '#3D6B66', fontWeight: 700 },
  miniRow: { display: 'flex', alignItems: 'center', gap: 8, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 10, padding: '6px 8px 6px 12px', fontFamily: 'inherit' },
  miniRowClickArea: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minWidth: 0 },
  attendanceCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: '12px 14px', marginBottom: 16 },
  miniCallBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 15, background: '#DFF0E4', flexShrink: 0, textDecoration: 'none' },

  tabRow: { display: 'flex', padding: '10px 16px 0', gap: 5, overflowX: 'auto', position: 'sticky', top: 62, background: BRAND.cream, zIndex: 20 },
  tabBtn: { flexShrink: 0, background: '#EEF0F5', border: 'none', borderRadius: 9, padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: BRAND.textMuted, cursor: 'pointer' },
  tabBtnActive: { background: BRAND.navy, color: '#FDFCF8' },

  stageGrid: { display: 'flex', flexDirection: 'column', gap: 6 },
  stageBtn: { display: 'flex', alignItems: 'center', border: '1px solid ' + BRAND.line, background: BRAND.paper, borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontWeight: 700, color: '#333B57', cursor: 'pointer', textAlign: 'left' },
  stageGridRead: { display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 },
  progressStep: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 13 },
  progressDot: { width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  currentTag: { marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, color: '#B5562E', background: '#F7E3D8', padding: '2px 7px', borderRadius: 8 },

  itemRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #EEF0F5' },
  milestoneRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: BRAND.paper, borderRadius: 10, marginTop: 6 },
  monthlyBarTrack: { height: 6, background: BRAND.paper, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  monthlyBarFill: { height: '100%', background: BRAND.gold, borderRadius: 3 },
  waReminderBtn: { display: 'flex', alignItems: 'center', gap: 4, background: '#25D366', color: '#FFF', textDecoration: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  itemDesc: { fontSize: 13.5, fontWeight: 700 },
  itemSub: { fontSize: 11.5, color: BRAND.textMuted, marginTop: 1 },
  itemAmount: { fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono', monospace" },
  addRow: { display: 'flex', gap: 8, marginTop: 12 },
  addBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: '#EEF0F5', border: '1px dashed ' + BRAND.line, borderRadius: 10, padding: '9px', fontSize: 12.5, fontWeight: 700, color: '#333B57', marginTop: 8, cursor: 'pointer' },
  totalBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, padding: '12px 14px', background: BRAND.navy, borderRadius: 10, color: '#FDFCF8', fontSize: 13, fontWeight: 700 },
  totalAmt: { fontSize: 16, fontWeight: 800, fontFamily: "'DM Mono', monospace" },
  payStrip: { display: 'flex', justifyContent: 'space-around', background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: '12px 8px' },
  payStripBtn: { display: 'block', width: '100%', background: 'none', border: 'none', padding: 0, marginTop: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  deliveryDateBanner: { display: 'flex', alignItems: 'center', gap: 8, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 10, padding: '10px 12px', marginTop: 10, fontSize: 12.5 },
  homeEstimatePreview: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '8px 12px 10px' },
  homeEstimateRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 },
  homeEstimateDesc: { color: BRAND.textMuted, fontWeight: 600 },
  homeEstimateAmt: { fontWeight: 700, color: BRAND.navy },
  homeEstimateMore: { fontSize: 11, color: BRAND.textMuted, marginTop: 2 },
  homeEstimateViewAll: { fontSize: 11.5, color: BRAND.gold, fontWeight: 800, marginTop: 6, textAlign: 'center' },
  moneyLabel: { fontSize: 9.5, color: '#A8AEC2', fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' },
  moneyValue: { fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono', monospace", marginTop: 1 },

  reqRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #EEF0F5' },
  reqThumb: { width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0, background: '#EEF0F5' },
  savedDesignGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10 },
  savedDesignCard: { position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid ' + BRAND.line, aspectRatio: '1', background: '#EEF0F5' },
  savedDesignImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  savedDesignActions: { position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', background: 'rgba(15,27,61,0.75)', padding: '5px 6px' },
  savedDesignAddBtn: { flex: 1, background: 'none', border: 'none', color: '#FFF', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', padding: '3px 0' },
  favAddCategoryBar: { position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(15,27,61,0.9)', padding: '4px 5px' },
  favAddCategorySelect: { flex: 1, fontSize: 10, padding: '3px 4px', borderRadius: 5, border: 'none' },
  favAddConfirmBtn: { background: BRAND.gold, border: 'none', borderRadius: 5, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 },
  savedDesignRemoveBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' },
  reqCatBadge: { fontSize: 9.5, fontWeight: 800, background: '#F3EFE3', color: BRAND.gold, borderRadius: 6, padding: '3px 7px', flexShrink: 0, marginTop: 1 },
  reqText: { fontSize: 13, color: '#333B57', lineHeight: 1.4 },
  reqGroupHeader: { fontSize: 12.5, fontWeight: 800, color: BRAND.navy, marginBottom: 2, marginTop: 6 },
  reqGroupCount: { color: BRAND.textMuted, fontWeight: 600 },
  reqMetaRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  reqDim: { fontSize: 10.5, fontWeight: 700, color: BRAND.navy, background: '#EEF0F5', borderRadius: 6, padding: '2px 6px' },
  reqPriorityTag: { fontSize: 10, fontWeight: 800, borderRadius: 6, padding: '2px 6px' },

  starRow: { display: 'flex', gap: 6, marginTop: 12 },
  starBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 2 },
  reviewPreview: { marginTop: 18, padding: 12, background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 10 },
  reviewCard: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: 12, marginTop: 10 },
  extraWorkCard: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: 12, marginTop: 10 },

  convertedTag: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: '#2F7D4F', fontWeight: 700, marginTop: 5 },

  previewLinkBtn: { display: 'flex', alignItems: 'center', gap: 4, background: BRAND.navy, color: '#FFF', border: 'none', borderRadius: 20, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' },
  viewQuoteBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: BRAND.navy, color: '#FFF', border: 'none', borderRadius: 10, padding: '11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginTop: 10 },
  estimateStatusBanner: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '10px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 700 },
  estItemRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: '1px solid #EEF0F5' },
  estItemNo: { width: 18, fontSize: 11, fontWeight: 700, color: BRAND.textMuted, flexShrink: 0 },

  quoteDoc: { background: '#FFF', padding: '20px 18px 30px' },
  quoteHeader: { display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '2px solid ' + BRAND.navy },
  quoteBizName: { fontWeight: 800, fontSize: 16, color: BRAND.navy, letterSpacing: -0.2 },
  quoteBlessingLine: { textAlign: 'center', fontSize: 12, fontWeight: 700, color: BRAND.gold, marginBottom: 10 },
  quoteDocTitle: { fontSize: 11.5, color: '#333B57', fontWeight: 700, marginTop: 1 },
  quoteBizTagline: { fontSize: 10.5, color: BRAND.gold, fontWeight: 700, marginTop: 1 },
  quoteBizContact: { fontSize: 10.5, color: BRAND.textMuted, marginTop: 3, fontWeight: 600 },
  quoteAddressRow: { padding: '8px 0', borderBottom: '1px solid ' + BRAND.line, fontSize: 11.5 },
  quoteCustRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 0', borderBottom: '1px solid ' + BRAND.line },
  quoteLabel: { fontSize: 9.5, fontWeight: 800, color: BRAND.gold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  quoteCustName: { fontSize: 14, fontWeight: 800, color: BRAND.navy },
  quoteCustSub: { fontSize: 11.5, color: '#333B57', marginTop: 1 },
  quoteTableWrap: { overflowX: 'auto', marginTop: 14 },
  quoteTable: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  qth: { textAlign: 'center', padding: '7px 6px', background: BRAND.navy, color: '#FFF', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' },
  qtd: { textAlign: 'center', padding: '7px 6px', borderBottom: '1px solid ' + BRAND.line, whiteSpace: 'nowrap' },
  quoteTotalRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: '12px 14px', background: BRAND.navy, borderRadius: 8, color: '#FFF' },
  quoteTotalAmt: { fontSize: 17, fontWeight: 800, fontFamily: "'DM Mono', monospace" },
  quoteTermsTitle: { fontWeight: 800, fontSize: 13, color: BRAND.navy, marginTop: 22, paddingBottom: 6, borderBottom: '1px solid ' + BRAND.line },
  quoteTermSection: { marginTop: 12 },
  quoteTermHeading: { fontWeight: 800, fontSize: 11.5, color: BRAND.navy, marginBottom: 3 },
  quoteTermPoint: { fontSize: 11, color: '#333B57', lineHeight: 1.6, paddingLeft: 4 },
  quoteFooter: { textAlign: 'center', fontSize: 12, fontWeight: 700, color: BRAND.gold, marginTop: 22, paddingTop: 14, borderTop: '1px solid ' + BRAND.line },
  hintText: { fontSize: 10.5, color: BRAND.textMuted, marginTop: 5, lineHeight: 1.4 },
  folderHeader: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: BRAND.navy, background: BRAND.paper, padding: '6px 10px', borderRadius: 8, marginBottom: 6 },
  liveCalcBox: { display: 'flex', flexDirection: 'column', gap: 2, background: '#F3EFE3', borderRadius: 8, padding: '8px 10px', marginTop: 8, fontSize: 11.5, color: '#5A4E2E' },

  apptCard: { background: BRAND.paper, border: '1px solid ' + BRAND.line, borderRadius: 12, padding: 14, marginTop: 10 },
  apptRow: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid #EEF0F5' },
  apptRowLabel: { fontSize: 11.5, color: BRAND.textMuted, fontWeight: 700, flexShrink: 0 },
  apptRowValue: { fontSize: 12.5, color: '#333B57', fontWeight: 600, textAlign: 'right' },
  apptConfirmedBlock: { display: 'flex', alignItems: 'center', gap: 10, background: '#DFF0E4', borderRadius: 10, padding: '10px 12px', margin: '8px 0' },
  apptConfirmedDate: { fontWeight: 800, fontSize: 13.5, color: '#1F5C38' },

  toast: { position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', color: '#FFF', padding: '9px 18px', borderRadius: 20, fontSize: 12.5, fontWeight: 700, zIndex: 60, maxWidth: '85%', textAlign: 'center' },
};
