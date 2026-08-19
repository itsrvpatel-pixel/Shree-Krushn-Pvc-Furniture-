import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import {
  Calendar, Hammer, IndianRupee, Plus, X, Phone, User,
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Trash2, Edit3, Search, CheckCircle2,
  Image as ImageIcon, Star, MessageSquare, Grid3x3, LogOut, ShieldCheck,
  Camera, Send, ArrowLeft, SlidersHorizontal, Lock,
  Home, Sparkles, AlertTriangle, Link2, Check, Package, FileText,
  UserPlus, Users, Download, Eye, EyeOff, TrendingUp,
  Bell, ThumbsUp, XCircle, AlertCircle, Calculator
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
  const approvedExtraWork = (job.extraWork || []).filter((e) => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0);
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
  (job.extraWork || []).filter((e) => e.status === 'approved').forEach((e, i) => {
    lines.push(((job.items || []).length + i + 1) + '. ' + e.desc + ' (Extra Work) - ' + currency(e.amount));
  });
  lines.push('');
  if (Number(job.discount) > 0) {
    const subtotal = (job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0) + (job.extraWork || []).filter((e) => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0);
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
function buildReceiptPdfDoc(job, payment) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(BUSINESS.name, pageWidth / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(BUSINESS.addressLine, pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.text(BUSINESS.phone + '  |  ' + BUSINESS.website, pageWidth / 2, y, { align: 'center' });
  y += 10;
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('PAYMENT RECEIPT', pageWidth / 2, y, { align: 'center' });
  y += 12;

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.text('Customer:', 15, y);
  doc.text(job.customerName, 70, y);
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
  y += 12;

  doc.setLineWidth(0.2);
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('Amount Received:', 15, y);
  doc.text('Rs. ' + Number(payment.amount).toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 8;
  if (payment.note) {
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('Note: ' + payment.note, 15, y);
    y += 8;
  }
  y += 4;
  doc.line(15, y, pageWidth - 15, y);
  y += 10;

  const total = jobTotal(job);
  const paidTillNow = jobPaid(job);
  const dueNow = jobDue(job);
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('Project Total:', 15, y);
  doc.text('Rs. ' + total.toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 6;
  doc.text('Total Paid Till Date:', 15, y);
  doc.text('Rs. ' + paidTillNow.toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 6;
  doc.setFont(undefined, 'bold');
  doc.text('Balance Due:', 15, y);
  doc.text('Rs. ' + dueNow.toLocaleString('en-IN'), pageWidth - 15, y, { align: 'right' });
  y += 16;

  doc.setFontSize(9);
  doc.setFont(undefined, 'italic');
  doc.text('Thank you for your business.', pageWidth / 2, y, { align: 'center' });

  return doc;
}

function generateReceiptPdf(job, payment) {
  const doc = buildReceiptPdfDoc(job, payment);
  doc.save('Receipt-' + job.customerName.replace(/\s+/g, '-') + '-' + payment.id.slice(-8) + '.pdf');
}

// Shares the payment receipt PDF directly to WhatsApp (or any app the
// phone offers) using the Web Share API with an actual file attached -
// same approach as shareEstimatePdf, so "payment received" also lands
// in the chat as a real PDF attachment rather than a plain-text
// message. Falls back to a plain download (with a toast explaining
// why) wherever file sharing isn't supported.
async function shareReceiptPdf(job, payment, showToast) {
  const doc = buildReceiptPdfDoc(job, payment);
  const fileName = 'Receipt-' + job.customerName.replace(/\s+/g, '-') + '-' + payment.id.slice(-8) + '.pdf';
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Payment Receipt - ' + job.customerName });
      return;
    } catch (e) {
      // user cancelled the share sheet, or it failed - fall through to download
    }
  }
  doc.save(fileName);
  if (showToast) showToast('Receipt download ho gaya - WhatsApp mein manually attach karein');
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
  const doc = await buildEstimatePdfFromDom(elementId);
  if (!doc) {
    if (showToast) showToast('PDF banane mein dikkat aayi, dobara try karein', true);
    return;
  }
  const fileName = 'Estimate-' + job.customerName.replace(/\s+/g, '-') + '.pdf';
  const blob = doc.output('blob');
  const file = new File([blob], fileName, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Estimate - ' + job.customerName });
      return;
    } catch (e) {
      // user cancelled the share sheet, or it failed - fall through to download
    }
  }
  doc.save(fileName);
  if (showToast) showToast('PDF download ho gaya - WhatsApp mein manually attach karein');
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
function openOrDownloadPdf(url, filename) {
  try {
    // window.open is far more reliable than a synthetic <a> click for
    // cross-origin URLs (Firebase Storage) on mobile browsers, which
    // sometimes silently swallow the click on a programmatically-created,
    // download-attributed anchor without any visible error - the tab
    // just never opens. window.open triggers the browser's normal
    // new-tab/download handling directly.
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      // Popup blocked (rare, since this fires from a direct tap) - fall
      // back to in-place navigation so the PDF still opens somewhere.
      window.location.href = url;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function BrochureList({ brochures, showToast, canManage, onDelete }) {
  const [loadingId, setLoadingId] = useState(null);

  // Two distinct kinds of PDF, shown as two distinct sections rather
  // than mixed into one list: the business's own "About Us" / PVC
  // furniture benefits document (docType 'profile' - normally just one
  // file, so it's shown as a single featured card, not a grouped list),
  // and laminate/material color catalogs from various supplier
  // companies (docType 'catalog', grouped by company like before) -
  // customer taps a company name to see just that company's colors.
  const profileDocs = (brochures || []).filter((b) => b.docType === 'profile');
  const catalogDocs = (brochures || []).filter((b) => b.docType !== 'profile');
  const groupedCatalogs = useMemo(() => {
    const g = {};
    catalogDocs.forEach((b) => {
      const co = b.company || 'Other';
      if (!g[co]) g[co] = [];
      g[co].push(b);
    });
    return g;
  }, [catalogDocs]);

  const openBrochure = (b) => {
    if (!b.url) { showToast(b.name + ' ka link missing hai - purani entry ho sakti hai, dobara upload karein', true); return; }
    setLoadingId(b.id);
    const ok = openOrDownloadPdf(b.url, b.name);
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
      {Object.keys(groupedCatalogs).length > 0 && (
        <div>
          <div style={styles.reqGroupHeader}>Laminate & Material Colors</div>
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

  useEffect(() => {
    (async () => {
      try {
        const [galleryCatList, c, j, p, st, exp, pp, aio, br, cats, notifs, tmpl, att, estRates] = await Promise.all([
          safeGet('gallery_categories'), safeGet('customers'), safeGet('jobs'), safeGet('admin_pin'), safeGet('staff'),
          safeGet('expenses'), safeGet('partner_pin'), safeGet('appointment_item_options'), safeGet('brochures'),
          safeGet('categories'), safeGet('notifications'), safeGet('item_templates'), safeGet('attendance'), safeGet('estimate_rates'),
        ]);
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
        const itemCategories = cats ? JSON.parse(cats) : DEFAULT_CATEGORIES;
        let galleryObj = {};
        let oldGalleryToMigrate = null;
        if (galleryCatList) {
          const galleryCategories = JSON.parse(galleryCatList);
          const galleryEntries = await Promise.all(
            galleryCategories.map(async (cat) => [cat, await safeGet('gallery_cat_' + cat)])
          );
          for (const [cat, val] of galleryEntries) {
            if (val) { try { galleryObj[cat] = JSON.parse(val); } catch (e) { /* skip corrupt entry */ } }
          }
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
        setGallery(galleryObj);
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
        // Runs after the app is already usable (not inside the
        // try/finally above), so migrating a large old gallery never
        // delays showing the login/home screen. This writes each
        // category from the old combined document into its own new
        // 'gallery_cat_<X>' document, then finally writes
        // 'gallery_categories' listing all of them - only ONCE that
        // full list is written does any device start relying on the
        // new format, so a second admin opening the app mid-migration
        // still safely falls back to the old document rather than
        // seeing a half-migrated, partial category list.
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
        }
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
        const [galleryCatList, j, br, cats, aio] = await Promise.all([
          safeGet('gallery_categories'), safeGet('jobs'), safeGet('brochures'), safeGet('categories'), safeGet('appointment_item_options'),
        ]);
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
      writes.push(window.storage.set('gallery_categories', JSON.stringify(Object.keys(meta)), true));
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
  const pushNotification = useCallback((type, message, jobId) => {
    setNotificationsRaw((current) => {
      const entry = { id: uid(), type, message, jobId: jobId || null, createdAt: new Date().toISOString(), readBy: [] };
      const next = [entry, ...current].slice(0, NOTIFICATION_CAP);
      window.storage.set('notifications', JSON.stringify(next), true).catch(() => {});
      return next;
    });
  }, []);
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
          customers={customers} setCustomers={persistCustomers}
          jobs={jobs} setJobs={persistJobs}
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
  const featuredTestimonials = jobs
    .filter((j) => j.review && j.review.featured)
    .map((j) => ({ customerName: j.customerName, rating: j.review.rating, text: j.review.text, date: j.review.date }))
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
        job={myJob}
        appointmentItemOptions={appointmentItemOptions}
        categories={categories}
        brochures={brochures}
        testimonials={featuredTestimonials}
        estimateRates={estimateRates}
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

const LOGO_DATA_URI = 'data:image/jpeg;base64,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';

/* --- Logo mark: the actual Shree Krushn PVC Furniture badge artwork --- */
function Logo({ size = 40 }) {
  return (
    <img
      src={LOGO_DATA_URI}
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
        <img src='/logo.jpeg' alt='Shree Krushn PVC Furniture logo' style={styles.loginLogo} />
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
function CustomerApp({ customer, gallery, job, appointmentItemOptions, categories, brochures, testimonials, estimateRates, notifications, markNotificationRead, markAllNotificationsRead, onSaveJob, onLogout, showToast }) {
  // A brand-new customer (no appointment booked yet) lands straight on
  // the appointment tab instead of home, since booking a visit is the
  // one thing every new customer needs to do first - skipping this extra
  // navigation step removes a whole separate "now go find the booking
  // tab" step right after registration. Existing customers with an
  // appointment already on file still land on home as before.
  const [tab, setTab] = useState(job.appointment ? 'home' : 'appointment');
  const [showProfile, setShowProfile] = useState(false);

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

      {tab === 'home' && <CustomerHome job={job} customer={customer} setTab={setTab} onLogout={onLogout} />}
      {tab === 'appointment' && <AppointmentPanel job={job} onSave={onSaveJob} showToast={showToast} itemOptions={appointmentItemOptions} />}
      {tab === 'gallery' && <GalleryBrowser gallery={gallery} brochures={brochures} categories={categories} testimonials={testimonials} job={job} onSaveJob={onSaveJob} showToast={showToast} />}
      {tab === 'requirements' && <RequirementsPanel job={job} onSave={onSaveJob} showToast={showToast} categories={categories} customer={customer} gallery={gallery} estimateRates={estimateRates} />}
      {tab === 'estimate' && (
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Estimate</div>
          <EstimateView job={job} onSave={onSaveJob} showToast={showToast} />
        </div>
      )}
      {tab === 'progress' && <ProgressView job={job} onSave={onSaveJob} showToast={showToast} customer={customer} categories={categories} />}
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

function CustomerHome({ job, customer, setTab, onLogout }) {
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

      {job.expectedCompletionDate && (job.status === 'in_progress' || job.status === 'delivered') && (
        <div style={styles.deliveryDateBanner}>
          <Calendar size={15} color={BRAND.gold} />
          <span>Expected completion: <b>{formatDate(job.expectedCompletionDate)}</b></span>
        </div>
      )}

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
function GalleryBrowser({ gallery, brochures, categories, testimonials, job, onSaveJob, showToast }) {
  const [activeCat, setActiveCat] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [showBrochures, setShowBrochures] = useState(false);
  const [showTestimonials, setShowTestimonials] = useState(false);
  const [query, setQuery] = useState('');
  const [showAllPhotos, setShowAllPhotos] = useState(false);

  // All photos across every category, newest first - lets a customer
  // browse everything in one flat grid instead of having to know (or
  // guess) which category something was filed under, or click into each
  // category one at a time just to see what's new. Recomputed from
  // `gallery` each render (not memoized), which is fine at this photo
  // count - no meaningful cost, and it stays trivially correct as
  // photos get added/moved/removed.
  const allPhotosFlat = useMemo(() => {
    const combined = [];
    for (const cat of categories) {
      for (const p of (gallery[cat] || [])) combined.push({ ...p, category: cat });
    }
    return combined.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [gallery, categories]);


  if (showAllPhotos || activeCat) {
    const inAllPhotosMode = showAllPhotos && !activeCat;
    const basePhotos = inAllPhotosMode ? allPhotosFlat : [...(gallery[activeCat] || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    // Caption search only makes sense once there's enough to search
    // through - filters the CURRENT view (whichever category, or all
    // photos), not a separate global search.
    const photos = basePhotos.filter((p) => !query.trim() || (p.caption || '').toLowerCase().includes(query.toLowerCase()));
    return (
      <div style={{ padding: '12px 16px' }}>
        <button style={styles.backLink} onClick={() => { setActiveCat(null); setShowAllPhotos(false); setQuery(''); }}><ArrowLeft size={13} /> All categories</button>
        <div style={styles.catTitle}>{inAllPhotosMode ? 'All Photos' : activeCat} <span style={styles.catCount}>({photos.length})</span></div>

        {/* Quick category switcher - lets the customer jump straight to
            another album without going back to the category grid first,
            since browsing between a few related categories (e.g.
            Kitchen -> Wardrobe -> Bedroom) back-and-forth is common and
            the extra round trip through "All categories" each time was
            unnecessary friction. */}
        <div style={styles.chipRow}>
          <button onClick={() => { setActiveCat(null); setShowAllPhotos(true); setQuery(''); }} style={{ ...styles.chip, ...(inAllPhotosMode ? styles.chipActive : {}) }}>All Photos</button>
          {categories.map((c) => (
            <button key={c} onClick={() => { setActiveCat(c); setShowAllPhotos(false); setQuery(''); }} style={{ ...styles.chip, ...(!inAllPhotosMode && activeCat === c ? styles.chipActive : {}) }}>{c}</button>
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
        <div style={styles.photoGrid}>
          {photos.map((p, i) => (
            <button key={p.id} style={styles.photoThumb} onClick={() => setLightbox({ photos, index: i })}>
              <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption || activeCat} style={styles.photoImg} />
              {inAllPhotosMode && <div style={styles.photoThumbCatTag}>{p.category}</div>}
            </button>
          ))}
        </div>
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
        {categories.map((cat) => {
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

  // Touch-swipe navigation: tracks the horizontal drag distance between
  // touchstart and touchend on the image itself, and treats anything past
  // a small threshold as a deliberate swipe rather than a tap.
  const touchStartX = React.useRef(null);
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const SWIPE_THRESHOLD = 40;
    if (deltaX > SWIPE_THRESHOLD) go(-1);
    else if (deltaX < -SWIPE_THRESHOLD) go(1);
    touchStartX.current = null;
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
        onTouchEnd={onTouchEnd}
        style={styles.lightboxImgWrap}
      >
        <SmartImg src={photo.url} origUrl={photo.origUrl} alt={photo.caption} style={styles.lightboxImg} />
      </div>
      {photos.length > 1 && (
        <button style={{ ...styles.lightboxNav, right: 8 }} onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight size={26} color='#FFF' /></button>
      )}
      {photo.caption && <div style={styles.lightboxCaption}>{photo.caption}</div>}
      {photos.length > 1 && <div style={styles.lightboxSwipeHint}>Swipe left/right ya arrows use karein</div>}
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
    const fromExtraWork = (job.extraWork || []).filter((e) => e.status === 'approved').map((e) => e.desc).filter(Boolean);
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
                    {n.photo && <img src={n.photo.url} alt='note attachment' style={{ ...styles.reqThumb, width: '100%', height: 140, marginTop: 8 }} />}
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
    </div>
  );
}

function RequirementsPanel({ job, onSave, showToast, categories, customer, gallery, estimateRates }) {
  const [category, setCategory] = useState(categories[0]);
  const [text, setText] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [priority, setPriority] = useState('normal');
  const [showForm, setShowForm] = useState((job.requirements || []).length === 0);
  const [lightbox, setLightbox] = useState(null);
  const savedDesigns = job.savedDesigns || [];

  // Instant estimate calculator: a customer-side, self-service rough
  // total based on their own measurements/quantities and which rate
  // type applies (Framing, Box, Basket, Drawer, TV Cabinet, Partition,
  // etc. - admin's own configured list, not just a fixed
  // laminate/without-laminate split), using the rates admin sets in
  // Settings - separate from the actual estimate (which admin still
  // builds by hand, per real item, once they've visited/reviewed the
  // project). This just gives an early ballpark before that happens.
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcItems, setCalcItems] = useState([]);
  const [calcCategory, setCalcCategory] = useState(categories[0]);
  const [calcLength, setCalcLength] = useState('');
  const [calcHeight, setCalcHeight] = useState('');
  const [calcQty, setCalcQty] = useState('1');
  const rates = (estimateRates && estimateRates.length > 0) ? estimateRates : [{ id: 'r1', name: 'Laminate', rate: '1000', unit: 'sqft' }, { id: 'r2', name: 'Without Laminate', rate: '700', unit: 'sqft' }];
  const [calcRateId, setCalcRateId] = useState(rates[0]?.id);
  const calcSelectedRate = rates.find((r) => r.id === calcRateId);
  const calcIsPieceType = calcSelectedRate?.unit === 'piece';

  // Piece-priced items (baskets, drawers) are just quantity x rate - no
  // measurement needed, since they're counted individually rather than
  // measured by area, unlike sqft-priced items (framing, box, TV
  // cabinet, partition) which need Length x Height.
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
      setCalcItems((prev) => [...prev, { id: uid(), category: calcCategory, qty: calcQty, rateId: calcRateId }]);
      setCalcQty('1');
    } else {
      if (!calcLength || !calcHeight) { showToast('Length aur Height dono bharein', true); return; }
      setCalcItems((prev) => [...prev, { id: uid(), category: calcCategory, length: calcLength, height: calcHeight, rateId: calcRateId }]);
      setCalcLength(''); setCalcHeight('');
    }
  };
  const removeCalcItem = (id) => setCalcItems((prev) => prev.filter((it) => it.id !== id));

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
    if (!photoRef && !text.trim()) return;
    const req = {
      id: uid(),
      category,
      text: photoRef ? ('Saved design reference' + (photoRef.caption ? ': ' + photoRef.caption : '')) : text.trim(),
      dimensions: dimensions.trim(),
      priority,
      // photoRef here is a savedDesigns entry ({photoId, caption}), not
      // a photo object - only the photoId reference is kept, resolved
      // to the actual image via the live gallery at display time (see
      // resolveGalleryPhoto above), for the same reason FavoritesButton
      // does the same thing: avoids duplicating image data inline into
      // the shared 'jobs' document.
      photoRef: photoRef ? { photoId: photoRef.photoId } : null,
      createdAt: new Date().toISOString(),
    };
    let next = { ...job, requirements: [req, ...(job.requirements || [])] };
    next = logActivity(next, 'Requirement added: ' + category + (photoRef ? ' (saved design)' : ''));
    const ok = await onSave(next);
    if (ok) {
      setText(''); setDimensions(''); setPriority('normal');
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

      <div style={{ ...styles.formCard, marginTop: 14, background: '#FFF9EE', borderColor: BRAND.gold }}>
        <button style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setShowCalculator((s) => !s)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 13.5, color: BRAND.navy }}><Calculator size={16} color={BRAND.gold} /> Instant Estimate Calculator</div>
          {showCalculator ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {!showCalculator && <div style={styles.plainTextMuted}>Apni measurements daal ke turant approx price dekhein</div>}
        {showCalculator && (
          <div style={{ marginTop: 10 }}>
            <div style={styles.plainTextMuted}>Ye ek approx estimate hai, final estimate admin banayenge site visit ke baad.</div>
            <div style={{ ...styles.hintText, marginTop: 10 }}>Item</div>
            <div style={styles.chipRow}>
              {categories.map((c) => (
                <button key={c} onClick={() => setCalcCategory(c)} style={{ ...styles.chip, ...(calcCategory === c ? styles.chipActive : {}) }}>{c}</button>
              ))}
            </div>
            <div style={{ ...styles.hintText, marginTop: 8 }}>Type</div>
            <div style={styles.chipRow}>
              {rates.map((r) => (
                <button key={r.id} onClick={() => setCalcRateId(r.id)} style={{ ...styles.chip, ...(calcRateId === r.id ? styles.chipActive : {}) }}>{r.name}</button>
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
                      <div style={styles.itemDesc}>{it.category} - {rates.find((r) => r.id === it.rateId)?.name || '-'}</div>
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
              <button style={styles.cardActionBtn} onClick={() => generateReceiptPdf(job, p)}><FileText size={13} /> Receipt</button>
            </div>
          ))}
        </div>
      )}

      {((job.items || []).length > 0 || (job.extraWork || []).some((e) => e.status === 'approved')) && (
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
                {(job.extraWork || []).filter((e) => e.status === 'approved').map((e, i) => (
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

function ProgressView({ job, onSave, showToast, customer, categories }) {
  const [lightbox, setLightbox] = useState(null);
  const photos = job.progressPhotos || [];

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
                    {n.photo && <img src={n.photo.url} alt='note attachment' style={{ ...styles.reqThumb, width: '100%', height: 140, marginTop: 8 }} />}
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

function AdminApp({ gallery, setGallery, customers, setCustomers, jobs, setJobs, adminPin, setAdminPin, partnerPin, setPartnerPin, staff, setStaff, expenses, setExpenses, appointmentItemOptions, setAppointmentItemOptions, categories, setCategories, brochures, addBrochure, removeBrochure, notifications, markNotificationRead, markAllNotificationsRead, itemTemplates, setItemTemplates, attendance, allData, estimateRates, setEstimateRates, staffName, isPartner, onLogout, showToast, pushNotification }) {
  const [tab, setTab] = useState('home');
  const [activeJobId, setActiveJobId] = useState(null);
  const activeJob = jobs.find((j) => j.id === activeJobId);
  // Notifications don't have individual user accounts to key reads by, so
  // admin/staff/partner share one "viewer" bucket per role - simple, and
  // matches how they already share visibility into the same jobs list.
  const viewerKey = isPartner ? 'partner' : 'admin';

  if (activeJob) {
    return (
      <div style={{ paddingBottom: 20 }}>
        <TopBar title={activeJob.customerName} subtitle={isPartner ? 'Partner - Job detail' : 'Admin - Job detail'} onBack={() => setActiveJobId(null)} hideLogout />
        <AdminJobDetail key={activeJob.id} job={activeJob} onSave={(j) => setJobs(jobs.map((jj) => (jj.id === j.id ? j : jj)))} showToast={showToast} appointmentItemOptions={appointmentItemOptions} staff={staff} staffName={staffName} itemTemplates={itemTemplates} setItemTemplates={setItemTemplates} pushNotification={pushNotification} categories={categories} />
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
      {tab === 'customers' && <AdminCustomers customers={customers} setCustomers={setCustomers} jobs={jobs} setJobs={setJobs} onOpenJob={setActiveJobId} showToast={showToast} isPartner={isPartner} />}
      {tab === 'gallery' && <AdminGallery gallery={gallery} setGallery={setGallery} categories={categories} setCategories={setCategories} showToast={showToast} />}
      {tab === 'reviews' && <AdminReviews jobs={jobs} setJobs={setJobs} showToast={showToast} />}
      {tab === 'expenses' && !isPartner && <AdminExpenses expenses={expenses} setExpenses={setExpenses} jobs={jobs} showToast={showToast} onOpenJob={setActiveJobId} />}
      {tab === 'settings' && (
        isPartner
          ? <PartnerSettings staffName={staffName} onLogout={onLogout} />
          : <AdminSettings adminPin={adminPin} setAdminPin={setAdminPin} partnerPin={partnerPin} setPartnerPin={setPartnerPin} staff={staff} setStaff={setStaff} appointmentItemOptions={appointmentItemOptions} setAppointmentItemOptions={setAppointmentItemOptions} categories={categories} setCategories={setCategories} gallery={gallery} brochures={brochures} addBrochure={addBrochure} removeBrochure={removeBrochure} allData={allData} jobs={jobs} attendance={attendance} estimateRates={estimateRates} setEstimateRates={setEstimateRates} onLogout={onLogout} showToast={showToast} />
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
  const [showList, setShowList] = useState(null); // null | 'inProgress' | 'dueList' | 'todaysVisits' | 'allEstimates'

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

function AdminCustomers({ customers, setCustomers, jobs, setJobs, onOpenJob, showToast }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  const [showReferralReport, setShowReferralReport] = useState(false);
  const [showAllEstimates, setShowAllEstimates] = useState(false);

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
    setCustomers(customers.filter((c) => c.id !== deletingCustomer.id));
    setJobs(jobs.filter((j) => j.customerId !== deletingCustomer.id));
    setDeletingCustomer(null);
    showToast('Customer deleted');
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
              Subtotal: {currency((job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0) + (job.extraWork || []).filter((e) => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0))} - Discount: {currency(job.discount)}
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
                <button style={styles.cardActionBtn} onClick={() => generateReceiptPdf(job, p)}><FileText size={13} /> Receipt</button>
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
                  {(job.extraWork || []).filter((e) => e.status === 'approved').map((e, i) => (
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
                    {currency((job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0) + (job.extraWork || []).filter((e) => e.status === 'approved').reduce((s, e) => s + (Number(e.amount) || 0), 0))}
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

function AdminJobDetail({ job, onSave, showToast, staff, staffName, itemTemplates, setItemTemplates, pushNotification, categories }) {
  const [tab, setTab] = useState('status');
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
  const addExtraWork = () => {
    if (newExtraWork.items.length === 0) { showToast('Kam se kam ek item add karein', true); return; }
    const amount = newExtraWork.items.reduce((s, it) => s + estimateItemAmount(it), 0);
    const desc = newExtraWork.title.trim() || newExtraWork.items.map((it) => it.desc).join(', ');
    const entry = { id: uid(), desc, items: newExtraWork.items, amount, addedBy: 'admin', status: 'pending_customer_approval', createdAt: new Date().toISOString() };
    let next = { ...job, extraWork: [entry, ...extraWork] };
    next = logActivity(next, 'Extra work added: ' + entry.desc + ' (' + currency(entry.amount) + ')');
    onSave(next);
    setNewExtraWork({ title: '', items: [] });
    showToast('Extra work added, customer approval ke liye bheja gaya');
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
              <button style={styles.addBtn} onClick={addExtraWork}><Plus size={14} /> Extra work add karein</button>
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
                <button style={styles.iconBtnSmall} onClick={() => generateReceiptPdf(job, p)}><FileText size={14} color='#3D6B66' /></button>
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
          </div>
        )}

        {tab === 'photos' && (
          <div>
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
function AdminGallery({ gallery, setGallery, categories, setCategories, showToast }) {
  const [activeCat, setActiveCat] = useState(categories[0]);
  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [query, setQuery] = useState('');
  const [editingPhoto, setEditingPhoto] = useState(null);

  const allPhotos = [...(gallery[activeCat] || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const photos = allPhotos.filter((p) => !query.trim() || (p.caption || '').toLowerCase().includes(query.toLowerCase()));

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
        {categories.map((c) => {
          const count = (gallery[c] || []).length;
          return <button key={c} onClick={() => setActiveCat(c)} style={{ ...styles.chip, ...(activeCat === c ? styles.chipActive : {}) }}>{c} ({count})</button>;
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={styles.fieldLabel}>Add photo to '{activeCat}'</div>
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
      <div style={styles.photoGrid}>
        {photos.map((p) => (
          <div key={p.id} style={styles.progressPhotoCard}>
            <button style={styles.photoEditTapArea} onClick={() => setEditingPhoto(p)}>
              <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption} style={styles.photoImg} />
            </button>
            <button style={styles.photoDeleteBtn} onClick={() => removePhoto(p.id)}><Trash2 size={12} color='#FFF' /></button>
            {p.caption && <div style={styles.progressCaption}>{p.caption}</div>}
          </div>
        ))}
      </div>

      {editingPhoto && (
        <GalleryPhotoEditDialog
          photo={editingPhoto}
          currentCategory={activeCat}
          categories={categories}
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
function AdminReviews({ jobs, setJobs, showToast }) {
  const [editingJobId, setEditingJobId] = useState(null);
  const reviewed = jobs.filter((j) => j.review).sort((a, b) => new Date(b.review.date) - new Date(a.review.date));
  const avg = reviewed.length ? (reviewed.reduce((s, j) => s + j.review.rating, 0) / reviewed.length).toFixed(1) : '-';
  const featuredCount = reviewed.filter((j) => j.review.featured).length;

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
function AdminSettings({ adminPin, setAdminPin, partnerPin, setPartnerPin, staff, setStaff, appointmentItemOptions, setAppointmentItemOptions, categories, setCategories, gallery, brochures, addBrochure, removeBrochure, allData, jobs, attendance, estimateRates, setEstimateRates, onLogout, showToast }) {
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
  const [newApptItem, setNewApptItem] = useState('');
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

  const [newGalleryCategory, setNewGalleryCategory] = useState('');
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
          {categories.map((cat) => (
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
  // Two kinds of PDF: our own "Company Details" document (PVC furniture
  // benefits, business info - always tagged to the business's own name,
  // no separate company field needed), or a "Laminate Catalog" from a
  // material supplier (needs a company name, since there are several -
  // Kaka and others). Picking one up front decides which fields show
  // next and how the saved PDF gets grouped in BrochureList.
  const [docType, setDocType] = useState('catalog');
  const knownCompanies = useMemo(() => {
    const set = new Set();
    (brochures || []).forEach((b) => { if (b.docType !== 'profile' && b.company) set.add(b.company); });
    return Array.from(set);
  }, [brochures]);
  const [company, setCompany] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef(null);

  const handleFilePicked = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (docType === 'catalog' && !company.trim()) { showToast('Company ka naam likhein', true); return; }
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

  return (
    <div>
      <div style={styles.fieldLabel}>PDF Kis Type Ki Hai</div>
      <div style={styles.chipRow}>
        <button onClick={() => setDocType('profile')} style={{ ...styles.chip, ...(docType === 'profile' ? styles.chipActive : {}) }}>Company Details</button>
        <button onClick={() => setDocType('catalog')} style={{ ...styles.chip, ...(docType === 'catalog' ? styles.chipActive : {}) }}>Laminate Catalog</button>
      </div>
      {docType === 'catalog' && (
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
        <FileText size={14} /> {uploading ? 'Uploading...' : (docType === 'profile' ? 'Upload Company Details PDF' : 'Upload PDF for ' + (company || '...'))}
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

  bottomNav: { position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 480, background: BRAND.paper, borderTop: '1px solid ' + BRAND.line, display: 'flex', padding: '8px 4px', zIndex: 30, overflowX: 'auto' },
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

  sectionTitle: { fontWeight: 800, fontSize: 16, letterSpacing: -0.3, marginBottom: 4 },
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
  statValue: { fontWeight: 800, fontSize: 14, letterSpacing: -0.3 },
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
  cardName: { fontWeight: 800, fontSize: 14.5, letterSpacing: -0.2, marginBottom: 3 },
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
