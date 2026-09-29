/* The admin panel, in a file of its own.

   Everything in here is reachable only after somebody logs in as admin
   or as a partner - fifty-five components and helpers, about 40% of the
   app's own code. It used to sit in App.jsx, which meant every customer
   who opened the gallery on their phone downloaded the whole of
   Settings, the profit report and the estimate editor before they could
   see a single photo.

   App.jsx pulls this in with React.lazy at the moment an admin login
   succeeds, so it costs a customer nothing.

   The shared pieces - styles, the brand palette, the money and date
   helpers, the PDF builders, the components both sides render - stay in
   App.jsx and are imported back here. That is a circular import on
   paper, and safe in practice because this module is only ever fetched
   after App.jsx has finished evaluating. */

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  Calendar,
  Hammer,
  IndianRupee,
  Plus,
  X,
  Phone,
  User,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  Star,
  MessageSquare,
  Grid3x3,
  LogOut,
  ShieldCheck,
  Send,
  ArrowLeft,
  SlidersHorizontal,
  Lock,
  Home,
  AlertTriangle,
  Check,
  FileText,
  UserPlus,
  Users,
  Download,
  TrendingUp,
  Bell,
  ThumbsUp,
  XCircle,
  AlertCircle,
  Calculator,
  HelpCircle,
} from 'lucide-react';
import {
  APPT_STATUS,
  BRAND,
  BUSINESS,
  BottomNav,
  BrochureList,
  ComplaintStageStepper,
  Lightbox,
  MoneyBit,
  NEWLINE,
  NotificationBell,
  partnerCategories,
  PhotoAddPanel,
  ProjectNotesPanel,
  QuickTile,
  QuotationPreview,
  REQ_PRIORITY,
  STATUS,
  STATUS_ORDER,
  SmartImg,
  StageBadge,
  TopBar,
  buildReceiptPdfDoc,
  currency,
  dataUriByteSize,
  emptyJob,
  EstimateChoiceNote,
  estimateItemAmount,
  finalizeEstimateDraft,
  estimateItemSqft,
  fileToDataUri,
  formatDate,
  formatPhoneDisplay,
  formatTime12h,
  generateReceiptPdf,
  generateThumbnail,
  generateWarrantyCertificate,
  jobDeliveredAt,
  jobDue,
  jobPaid,
  jobTotal,
  loadImageAsDataUrl,
  loadJsPDF,
  logActivity,
  mapWithConcurrencyLimit,
  normalizeIndianPhone,
  phoneCharsOnly,
  readLastCrash,
  receiptNo,
  shareEstimatePdf,
  styles,
  timeAgo,
  toDirectImageUrl,
  uid,
  useGalleryThumbWarmup,
  warrantyCertNo,
  whatsAppShareUrl,
} from './App.jsx';

// A special, always-present gallery bucket (not part of the admin's
// configured item-category list) for dumping a large mixed batch of
// photos in one upload instead of having to switch categories and
// upload separately for each one - photos land here first, then get
// individually moved into their real category afterward using the
// existing per-photo "move to category" edit action.
const UNCATEGORIZED = 'Uncategorized';

const EXPENSE_TYPES = ['Karigar Payment', 'Material', 'Transport', 'Other'];

const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'];

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
// The 2-year maintenance warranty, turned into something the business
// can actually act on.
//
// Every delivered job carries a promise the warranty certificate spells
// out: "2 Years - Shree Krushn Maintenance Warranty - free service
// visits for fitting/adjustment issues". Nothing in the app tracked it,
// so whether those visits happened depended on the customer complaining.
// Four visits over two years is also four conversations with somebody
// who already bought - which is where repeat work and referrals come
// from.
const SERVICE_VISIT_MONTHS = [6, 12, 18, 24];

const MAINTENANCE_WARRANTY_MONTHS = 24;

function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // 31 August + 6 months must not land in March: clamp to the last day
  // of the shorter month instead of rolling over.
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString();
}

function warrantyEndsAt(job) {
  const from = jobDeliveredAt(job);
  return from ? addMonths(from, MAINTENANCE_WARRANTY_MONTHS) : null;
}

// Each scheduled visit with its due date and whether it has been done.
function serviceSchedule(job) {
  const from = jobDeliveredAt(job);
  if (!from) return [];
  const done = job.serviceVisits || [];
  return SERVICE_VISIT_MONTHS.map((months) => {
    const hit = done.find((v) => Number(v.n) === months);
    return {
      n: months,
      label: months === 12 ? '1 saal' : (months === 24 ? '2 saal' : months + ' mahine'),
      dueAt: addMonths(from, months),
      doneAt: hit ? hit.at : null,
      note: hit ? hit.note : '',
    };
  });
}

// The visit to act on: the oldest one that is due and not yet done.
// Null once every visit is done or the warranty has run out.
// Compared by calendar day, not by timestamp. A visit due on the 15th
// is due all of the 15th - matching it against the exact hour the job
// was delivered would leave it "not due yet" until mid-morning, which
// is not how anybody reads a due date.
function serviceVisitDue(job, nowIso) {
  const today = new Date(nowIso || Date.now()).toISOString().slice(0, 10);
  return serviceSchedule(job).find((v) => !v.doneAt && v.dueAt.slice(0, 10) <= today) || null;
}

function buildServiceOfferText(job, visit) {
  const lines = [];
  lines.push('Namaste ' + job.customerName + ',');
  lines.push('');
  lines.push('Aapke kaam ko ' + visit.label + ' ho gaye hain.');
  lines.push('Hamari 2 saal ki maintenance warranty ke andar aapka free service visit due hai -');
  lines.push('fitting, adjustment, ya koi bhi chhoti dikkat ho to hum aakar theek kar denge.');
  lines.push('');
  lines.push('Kab aana theek rahega? Din aur time bata dijiye.');
  lines.push('');
  lines.push('- ' + BUSINESS.name);
  return lines.join(NEWLINE);
}

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

// A shareable price list, built from the same admin-configured rate
// types (name/rate/unit) the Instant Estimate Calculator already uses
// for customers - one source of truth for what things cost, just
// presented here as a document instead of an interactive calculator,
// for the case where a customer (or a lead who hasn't even booked a
// visit yet) just wants "what do things roughly cost" without opening
// the app at all.
async function buildPriceListPdfDoc(estimateRates) {
  const jsPDF = await loadJsPDF();
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

// The one payment reminder message, used everywhere one is sent.
//
// A reminder button did already exist, per milestone, inside a job's
// Payment tab - but it sent a single line ("aapka Material Advance
// payment due hai: Rs 1,20,000") with no context, and it was only
// reachable after opening that one job. The Due Payments list, which is
// where the admin actually reviews who owes what across every customer,
// had no way to send anything at all.
//
// So there is now one message, built here and used from both places: it
// states the total, what has been paid, what is left, and - when the job
// is mid-way - which milestone that amount belongs to, so the customer
// can see WHY this much is due now rather than just being asked for
// money. No pressure wording; this goes to people the business wants to
// work for again.
function buildPaymentReminderText(job) {
  const total = jobTotal(job);
  const paid = jobPaid(job);
  const due = jobDue(job);
  const lines = [];
  lines.push('Namaste ' + job.customerName + ',');
  lines.push('');
  lines.push('Aapke kaam ka hisaab:');
  lines.push('Total: ' + currency(total));
  lines.push('Ab tak mila: ' + currency(paid));
  lines.push('Baaki: ' + currency(due));

  // Which stage this money belongs to, when one is actually due now.
  const milestone = jobMilestoneStatus(job).find((m) => m.due > 0);
  if (milestone) {
    lines.push('');
    lines.push(milestone.label + ' ka ' + currency(milestone.due) + ' abhi due hai.');
  }
  lines.push('');
  lines.push('Aap jab bhi bhej dein, bata dijiyega - hum receipt bhej denge.');
  lines.push('Koi sawaal ho to poochh lijiye.');
  lines.push('');
  lines.push('- ' + BUSINESS.name);
  return lines.join(NEWLINE);
}

// Brochure PDFs are stored in Firebase Storage (not Firestore - see
// firebaseStorage.js's fileStorage.upload), which has no meaningful
// per-file size ceiling for this app's purposes, unlike gallery photos.
// This cap is just a sanity limit so an accidental huge upload doesn't
// silently eat the free tier's 1GB total storage quota in one file.
const MAX_BROCHURE_BYTES = 100 * 1024 * 1024;

/* ===================== SHARED CHROME ===================== */
function SheetHeader({ title, onClose }) {
  return (
    <div style={styles.sheetHeader}>
      <div style={styles.sheetTitle}>{title}</div>
      <button style={styles.iconBtn} onClick={onClose}><X size={20} color={BRAND.navy} /></button>
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

function AdminApp({ gallery, setGallery, loadGalleryData, galleryLoading, customers, setCustomers, jobs, setJobs, adminPushTokens, enableAdminPushNotifications, adminPin, setAdminPin, partnerPin, setPartnerPin, dhPartnerPin, setDhPartnerPin, staff, setStaff, expenses, setExpenses, appointmentItemOptions, setAppointmentItemOptions, categories, setCategories, brochures, addBrochure, removeBrochure, notifications, markNotificationRead, markAllNotificationsRead, itemTemplates, setItemTemplates, attendance, allData, estimateRates, setEstimateRates, faqs, setFaqs, materialSpecs, setMaterialSpecs, companyBenefits, setCompanyBenefits, archivedReviews, setArchivedReviews, pendingGalleryPhotos, setPendingGalleryPhotos, staffName, isPartner, isDhPartner, onLogout, showToast, pushNotification }) {
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
        <TopBar title={activeJob.customerName} subtitle={isPartner ? 'Partner - Job detail' : (isDhPartner ? 'DH Home Decor - Job detail' : 'Admin - Job detail')} onBack={() => setActiveJobId(null)} hideLogout />
        <AdminJobDetail key={activeJob.id} job={activeJob} onSave={(j) => setJobs(jobs.map((jj) => (jj.id === j.id ? j : jj)))} showToast={showToast} appointmentItemOptions={appointmentItemOptions} staff={staff} staffName={staffName} itemTemplates={itemTemplates} setItemTemplates={setItemTemplates} pushNotification={pushNotification} categories={categories} gallery={gallery} />
      </div>
    );
  }

  // Every job/customer predates businessUnit, so treating a missing
  // value as Shree Krushn's own (never DH's) keeps existing data
  // visible to admin exactly as before, while only records explicitly
  // tagged 'dh_home_decor' are isolated into DH's own separate stats.
  const visibleCustomerIdsForHome = new Set(
    customers.filter((c) => (isDhPartner ? c.businessUnit === 'dh_home_decor' : c.businessUnit !== 'dh_home_decor')).map((c) => c.id)
  );
  const visibleJobsForHome = jobs.filter((j) => visibleCustomerIdsForHome.has(j.customerId));

  const pendingEstimates = visibleJobsForHome.filter((j) => j.status === 'appointment' && (j.requirements || []).length > 0).length;
  const overdue = visibleJobsForHome.filter((j) => jobDue(j) > 0 && (j.status === 'delivered' || j.status === 'in_progress')).length;
  const pendingAppointments = visibleJobsForHome.filter((j) => j.appointment && j.appointment.status === 'requested').length;
  // A customer's extra-work request fires a one-time notification, but
  // if that gets dismissed or missed, there was previously nothing
  // reminding admin it's still sitting there unpriced/unapproved -
  // unlike pendingEstimates/overdue/pendingAppointments, which all stay
  // visible on Home until resolved. This counts extra-work items in
  // either state (needing a price, or priced and awaiting the
  // customer's decision) so the same ongoing-reminder pattern applies
  // here too.
  const pendingExtraWork = visibleJobsForHome.reduce((s, j) => s + (j.extraWork || []).filter((e) => e.status === 'pending_admin_price' || e.status === 'pending_customer_approval').length, 0);

  return (
    <div style={{ paddingBottom: 70 }}>
      <TopBar
        title={isPartner ? 'Partner Panel' : (isDhPartner ? 'DH Home Decor Panel' : 'Admin Panel')}
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
          onOpenJob={setActiveJobId} setTab={setTab} isPartner={isPartner} isDhPartner={isDhPartner}
          onSaveJob={(nextJob) => setJobs(jobs.map((j) => (j.id === nextJob.id ? nextJob : j)))} showToast={showToast}
        />
      )}
      {tab === 'customers' && <AdminCustomers customers={customers} setCustomers={setCustomers} jobs={jobs} setJobs={setJobs} archivedReviews={archivedReviews} setArchivedReviews={setArchivedReviews} onOpenJob={setActiveJobId} showToast={showToast} isPartner={isPartner} isDhPartner={isDhPartner} />}
      {galleryEverVisited && (
        <div style={{ display: tab === 'gallery' ? 'block' : 'none' }}>
          <AdminGallery gallery={gallery} galleryLoading={galleryLoading} setGallery={setGallery} categories={categories} setCategories={setCategories} showToast={showToast} isDhPartner={isDhPartner} />
        </div>
      )}
      {tab === 'reviews' && !isDhPartner && <AdminReviews jobs={jobs} setJobs={setJobs} archivedReviews={archivedReviews} setArchivedReviews={setArchivedReviews} showToast={showToast} />}
      {tab === 'expenses' && !isPartner && <AdminExpenses expenses={expenses} setExpenses={setExpenses} jobs={jobs} showToast={showToast} onOpenJob={setActiveJobId} isDhPartner={isDhPartner} />}
      {tab === 'settings' && (
        (isPartner || isDhPartner)
          ? <PartnerSettings staffName={staffName} onLogout={onLogout} />
          : <AdminSettings adminPin={adminPin} setAdminPin={setAdminPin} partnerPin={partnerPin} setPartnerPin={setPartnerPin} dhPartnerPin={dhPartnerPin} setDhPartnerPin={setDhPartnerPin} staff={staff} setStaff={setStaff} appointmentItemOptions={appointmentItemOptions} setAppointmentItemOptions={setAppointmentItemOptions} categories={categories} setCategories={setCategories} gallery={gallery} setGallery={setGallery} pendingGalleryPhotos={pendingGalleryPhotos} setPendingGalleryPhotos={setPendingGalleryPhotos} brochures={brochures} addBrochure={addBrochure} removeBrochure={removeBrochure} allData={allData} jobs={jobs} customers={customers} attendance={attendance} estimateRates={estimateRates} setEstimateRates={setEstimateRates} faqs={faqs} setFaqs={setFaqs} materialSpecs={materialSpecs} setMaterialSpecs={setMaterialSpecs} companyBenefits={companyBenefits} setCompanyBenefits={setCompanyBenefits} adminPushTokens={adminPushTokens} enableAdminPushNotifications={enableAdminPushNotifications} onLogout={onLogout} showToast={showToast} />
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

function AdminHome({ customers, jobs, expenses, gallery, categories, pendingEstimates, overdue, pendingAppointments, pendingExtraWork, onOpenJob, setTab, onSaveJob, showToast, isPartner, isDhPartner }) {
  const [showList, setShowList] = useState(null); // null | 'inProgress' | 'dueList' | 'todaysVisits' | 'tomorrowsVisits' | 'staleJobs' | 'allEstimates'

  // Every customer/job predates businessUnit, so treating a missing
  // value as Shree Krushn's own (never DH's) keeps existing data
  // visible to admin exactly as before, while only records explicitly
  // tagged 'dh_home_decor' are isolated into DH's own separate view -
  // every list/stat/sub-panel below uses these, not the raw
  // customers/jobs props, so a DH Home Decor login never sees Shree
  // Krushn's own customers folded into anything on this screen.
  const visibleCustomers = customers.filter((c) => (isDhPartner ? c.businessUnit === 'dh_home_decor' : c.businessUnit !== 'dh_home_decor'));
  const visibleCustomerIds = new Set(visibleCustomers.map((c) => c.id));
  const visibleJobs = jobs.filter((j) => visibleCustomerIds.has(j.customerId));

  // Total Due should only reflect work that's actually started - an
  // estimate sitting unapproved (status still 'appointment' or
  // 'estimate') isn't money owed yet, it's a quote the customer hasn't
  // committed to. Counting it here would make "how much is outstanding
  // right now" misleadingly include work nobody has agreed to pay for.
  const dueTotal = visibleJobs.filter((j) => j.status === 'in_progress' || j.status === 'delivered' || j.status === 'paid').reduce((s, j) => s + jobDue(j), 0);
  const totalPhotos = categories.reduce((s, c) => s + (gallery[c] || []).length, 0);
  const recentJobs = [...visibleJobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

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

  // Same estimate-given-but-no-response jobs the top-level App
  // component already pushes a notification for (see its matching
  // comment) - repeated here as a proper, always-visible list rather
  // than relying on admin having seen and kept that one notification,
  // which is easy to miss or accidentally dismiss. Uses the same
  // estimateGivenAt-based timing (falling back to createdAt only for
  // older jobs from before that field existed) so this list and the
  // notification always agree on which jobs actually qualify.
  const FOLLOW_UP_AFTER_DAYS_DISPLAY = 3;
  const followUpJobs = visibleJobs.filter((j) => {
    if (j.estimateStatus) return false;
    if ((j.items || []).length === 0) return false;
    const sinceDate = j.estimateGivenAt || j.createdAt;
    if (!sinceDate) return false;
    const daysSince = Math.floor((new Date() - new Date(sinceDate)) / (1000 * 60 * 60 * 24));
    return daysSince >= FOLLOW_UP_AFTER_DAYS_DISPLAY;
  });

  // Customer questions asked from Help/FAQ (see HelpScreen's askQuestion
  // and AdminJobDetail's answerQuestion) still waiting on a reply -
  // surfaced here the same way follow-up/stale jobs are, since a
  // question sitting unanswered is easy to miss buried inside one
  // specific job's detail screen otherwise.
  const jobsWithPendingQuestions = visibleJobs.filter((j) => (j.questions || []).some((q) => q.status !== 'answered'));

  // Free service visits that have come due under the 2-year maintenance
  // warranty. Surfaced here because the promise is easy to forget and
  // nobody else is going to raise it - the customer generally does not
  // know the visits are owed to them.
  const serviceDueJobs = visibleJobs.filter((j) => serviceVisitDue(j));
  const pendingQuestionsCount = visibleJobs.reduce((s, j) => s + (j.questions || []).filter((q) => q.status !== 'answered').length, 0);

  if (showList === 'serviceDue') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminServiceDueList jobs={visibleJobs} onSaveJob={onSaveJob} onOpenJob={onOpenJob} showToast={showToast} />
      </div>
    );
  }

  if (showList === 'inProgress') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminJobStatusList jobs={visibleJobs} statuses={['in_progress']} title='In Progress' onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'dueList') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminDuePaymentsList jobs={visibleJobs} expenses={expenses || []} onOpenJob={onOpenJob} />
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
  if (showList === 'followUpJobs') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Follow-up Chahiye</div>
          <div style={styles.plainTextMuted}>In customers ko estimate mila hai lekin {FOLLOW_UP_AFTER_DAYS_DISPLAY}+ din se koi response nahi - ek call/message karke follow-up karein, lead thanda na ho.</div>
          {followUpJobs.length === 0 && <div style={styles.emptySmall}>Koi pending follow-up nahi hai - sab estimates par response aa chuka hai.</div>}
          {followUpJobs.map((j) => {
            const sinceDate = j.estimateGivenAt || j.createdAt;
            const daysSince = Math.floor((new Date() - new Date(sinceDate)) / (1000 * 60 * 60 * 24));
            const followUpText = 'Namaste ' + j.customerName + ',' + NEWLINE + NEWLINE + 'Aapko humne estimate bheja tha - koi sawaal ho ya kuch clarify karna ho to bataiye, hum madad karenge.' + NEWLINE + NEWLINE + '- ' + BUSINESS.name;
            return (
              <div key={j.id} style={styles.reviewCard}>
                <button style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => onOpenJob(j.id)}>
                  <div style={styles.cardName}>{j.customerName}</div>
                  <div style={styles.itemSub}>{daysSince} din se estimate par response nahi</div>
                </button>
                <a href={whatsAppShareUrl(j.phone, followUpText)} target='_blank' rel='noopener noreferrer' style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF', marginTop: 8, display: 'inline-flex' }}>
                  <Send size={13} /> Follow-up Bhejein
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (showList === 'pendingQuestions') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={styles.sectionTitle}>Sawaal Ka Jawab Chahiye</div>
          <div style={styles.plainTextMuted}>Customers ne Help/FAQ se sawaal poochhe hain - job kholke jawab dein.</div>
          {jobsWithPendingQuestions.length === 0 && <div style={styles.emptySmall}>Koi pending sawaal nahi hai.</div>}
          {jobsWithPendingQuestions.map((j) => {
            const openCount = (j.questions || []).filter((q) => q.status !== 'answered').length;
            return (
              <button key={j.id} style={styles.miniRowClickArea} onClick={() => onOpenJob(j.id)}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={styles.itemDesc}>{j.customerName}</div>
                  <div style={styles.itemSub}>{openCount} sawaal ka jawab baaki hai</div>
                </div>
                <ChevronRight size={16} color='#C7CCDC' />
              </button>
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
        <AdminAllEstimatesList jobs={visibleJobs} onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'newAppointments') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminNewAppointmentsList jobs={visibleJobs} onOpenJob={onOpenJob} />
      </div>
    );
  }
  if (showList === 'visitsByDate') {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowList(null)}><ArrowLeft size={13} /> Home</button>
        </div>
        <AdminVisitsByDate jobs={visibleJobs} onOpenJob={onOpenJob} />
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
        <StatCard icon={<MessageSquare size={16} />} label="Follow-up Chahiye" value={followUpJobs.length} accent={followUpJobs.length > 0} onClick={() => setShowList('followUpJobs')} />
        <StatCard icon={<HelpCircle size={16} />} label="Sawaal Ka Jawab" value={pendingQuestionsCount} accent={pendingQuestionsCount > 0} onClick={() => setShowList('pendingQuestions')} />
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
        <StatCard icon={<User size={16} />} label='Customers' value={visibleCustomers.length} onClick={() => setTab('customers')} />
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
            {serviceDueJobs.length > 0 && (
              <button style={{ ...styles.alertText, width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} onClick={() => setShowList('serviceDue')}>
                {serviceDueJobs.length} customer{serviceDueJobs.length !== 1 ? 's' : ''} ka free service visit due hai
              </button>
            )}
          </div>
        </div>
      )}

      <div style={styles.quickGrid}>
        <QuickTile icon={<Grid3x3 size={20} color={BRAND.navy} />} label={'Gallery (' + totalPhotos + ')'} onClick={() => setTab('gallery')} />
        <QuickTile icon={<User size={20} color={BRAND.navy} />} label='All Customers' onClick={() => setTab('customers')} />
        <QuickTile icon={<Star size={20} color={BRAND.navy} />} label='Reviews' onClick={() => setTab('reviews')} />
        <QuickTile icon={<Hammer size={20} color={BRAND.navy} />} label={'Service Due' + (serviceDueJobs.length ? (' (' + serviceDueJobs.length + ')') : '')} onClick={() => setShowList('serviceDue')} />
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

// For every Regional Partner (see RegionalPartnerApp), shows what
// admin actually needs to settle accounts: how many jobs each partner
// has, and the commission owed on each - computed the same way the
// partner's own app computes it (percentage of what's actually been
// COLLECTED so far, not the full estimate), so the two always agree on
// the number, and nobody's surprised at payout time.
function AdminCommissionReport({ staff, jobs, setStaff, showToast }) {
  const [payoutAmountByPartner, setPayoutAmountByPartner] = useState({});
  const partners = staff.filter((s) => s.role === 'regional_partner');
  const rows = partners.map((p) => {
    const assignedJobs = jobs.filter((j) => j.assignedStaffId === p.id);
    const completedJobs = assignedJobs.filter((j) => j.status === 'delivered' || j.status === 'paid');
    const commissionByJob = assignedJobs.map((j) => ({ job: j, commission: Math.round(jobPaid(j) * ((p.commissionPercent || 0) / 100)) }));
    const totalEarned = commissionByJob.reduce((s, c) => s + c.commission, 0);
    const totalPaidOut = (p.commissionPayouts || []).reduce((s, po) => s + Number(po.amount || 0), 0);
    const balanceOwed = totalEarned - totalPaidOut;
    const totalRevenue = assignedJobs.reduce((s, j) => s + jobPaid(j), 0);
    // Completion rate is only meaningful once a partner has actually
    // been given work - an untested partner (0 assigned) shows 0%
    // rather than a misleading 100% from an empty division.
    const completionRate = assignedJobs.length > 0 ? completedJobs.length / assignedJobs.length : 0;
    return { partner: p, assignedJobs, completedCount: completedJobs.length, completionRate, totalRevenue, commissionByJob, totalEarned, totalPaidOut, balanceOwed };
  });
  const grandTotalOwed = rows.reduce((s, r) => s + r.balanceOwed, 0);
  // A single Performance Score (0-100) blending three things that
  // actually matter for deciding who should get the NEXT lead:
  // reliability (completion rate), track record (volume of completed
  // work), and business value (revenue actually collected) - each
  // normalized against the best performer in the group so the score
  // stays meaningful whether there are 2 partners or 20. This is a
  // decision-support number for admin to weigh when manually assigning
  // a new customer to a city - it doesn't route leads automatically.
  const maxCompleted = Math.max(1, ...rows.map((r) => r.completedCount));
  const maxRevenue = Math.max(1, ...rows.map((r) => r.totalRevenue));
  const scored = rows.map((r) => {
    const score = Math.round(
      (r.completionRate * 40) +
      ((r.completedCount / maxCompleted) * 30) +
      ((r.totalRevenue / maxRevenue) * 30)
    );
    return { ...r, score };
  });
  const leaderboard = [...scored].sort((a, b) => b.score - a.score);

  // Recorded directly on the partner's own staff record (not a
  // separate collection) - a payout is inherently tied to one partner,
  // and keeping it there means AdminCommissionReport and the partner's
  // own app (which reads this same staff record) always show the
  // exact same running balance without needing to sync two places.
  const recordPayout = (partnerId) => {
    const amount = payoutAmountByPartner[partnerId];
    if (!amount || Number(amount) <= 0) { showToast('Sahi amount daalein', true); return; }
    const payout = { id: uid(), amount: Number(amount), date: new Date().toISOString() };
    setStaff(staff.map((s) => (s.id === partnerId ? { ...s, commissionPayouts: [...(s.commissionPayouts || []), payout] } : s)));
    setPayoutAmountByPartner({ ...payoutAmountByPartner, [partnerId]: '' });
    showToast('Payout record ho gaya');
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Regional Partner Commission</div>
      <div style={styles.plainTextMuted}>Har partner ko ab tak kitna commission banta hai, kitna de diya hai, aur kitna baaki hai.</div>
      {leaderboard.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div style={styles.fieldLabel}>Performance Score</div>
          <div style={styles.plainTextMuted}>Naye customer kisko dein, ye decide karne mein madad karega - completion rate, poore kiye kaam, aur revenue teenon ko milake.</div>
          {leaderboard.map((r, i) => (
            <div key={r.partner.id} style={{ ...styles.formCard, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 26, fontWeight: 800, color: i === 0 ? BRAND.gold : BRAND.textMuted }}>#{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={styles.itemDesc}>{r.partner.name}</div>
                  <div style={styles.itemSub}>{r.completedCount} kaam poore - {Math.round(r.completionRate * 100)}% completion rate</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: BRAND.navy }}>{r.score}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && <div style={styles.emptySmall}>Abhi koi Regional Partner add nahi kiya.</div>}
      {rows.length > 0 && (
        <div style={{ ...styles.statRow2, marginTop: 10 }}>
          <StatCard icon={<Users size={16} />} label='Partners' value={rows.length} />
          <StatCard icon={<IndianRupee size={16} />} label='Total Baaki' value={currency(grandTotalOwed)} accent />
        </div>
      )}
      {rows.map((r) => (
        <div key={r.partner.id} style={{ ...styles.reviewCard, marginTop: 10 }}>
          <div style={styles.cardName}>{r.partner.name}</div>
          <div style={styles.itemSub}>{r.partner.commissionPercent}% commission - {r.assignedJobs.length} job{r.assignedJobs.length !== 1 ? 's' : ''} assigned</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <div style={styles.itemSub}>Total Kamaya</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.navy }}>{currency(r.totalEarned)}</div>
            </div>
            <div>
              <div style={styles.itemSub}>De Diya</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#2F7D4F' }}>{currency(r.totalPaidOut)}</div>
            </div>
            <div>
              <div style={styles.itemSub}>Baaki Hai</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: r.balanceOwed > 0 ? BRAND.gold : '#2F7D4F' }}>{currency(r.balanceOwed)}</div>
            </div>
          </div>
          {r.balanceOwed > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input style={styles.input} inputMode='numeric' placeholder='Amount de diya' value={payoutAmountByPartner[r.partner.id] || ''} onChange={(e) => setPayoutAmountByPartner({ ...payoutAmountByPartner, [r.partner.id]: e.target.value })} />
              <button style={{ ...styles.cardActionBtn, flexShrink: 0 }} onClick={() => recordPayout(r.partner.id)}>Payout Record Karein</button>
            </div>
          )}
          {r.commissionByJob.filter((c) => c.commission > 0).map((c) => (
            <div key={c.job.id} style={{ ...styles.itemRow, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={styles.itemDesc}>{c.job.customerName}</div>
                <div style={styles.itemSub}>{currency(jobPaid(c.job))} collected</div>
              </div>
              <div style={styles.itemDesc}>{currency(c.commission)}</div>
            </div>
          ))}
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

function AdminCustomers({ customers, setCustomers, jobs, setJobs, archivedReviews, setArchivedReviews, onOpenJob, showToast, isDhPartner }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(null);
  // Same stale-prop fix as AdminJobDetail (see its matching comment) -
  // protects rapid successive customer add/edit/delete actions from
  // each other, the same way it protects rapid estimate-item adds.
  const customersRef = useRef(customers);
  useEffect(() => { customersRef.current = customers; }, [customers]);
  const jobsRef = useRef(jobs);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);
  const archivedReviewsRef = useRef(archivedReviews);
  useEffect(() => { archivedReviewsRef.current = archivedReviews; }, [archivedReviews]);
  const [showReferralReport, setShowReferralReport] = useState(false);
  const [showAllEstimates, setShowAllEstimates] = useState(false);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  // Every customer/job the app already has predates this field, so
  // treating a MISSING businessUnit as Shree Krushn's own (never DH's)
  // is what keeps every pre-existing record visible to admin exactly
  // as before, while only customers/jobs explicitly tagged
  // 'dh_home_decor' (created going forward by that panel specifically)
  // are ever isolated into DH's own separate view.
  const visibleCustomers = useMemo(() => {
    return customers.filter((c) => (isDhPartner ? c.businessUnit === 'dh_home_decor' : c.businessUnit !== 'dh_home_decor'));
  }, [customers, isDhPartner]);
  // Adds a customer (plus their matching empty job) directly, tagged
  // with the correct business unit - the app's only OTHER way a
  // customer record gets created is the customer registering
  // themselves via phone OTP (see LoginScreen's onRegister), which
  // isn't something DH Home Decor's own customers would ever do
  // through Shree Krushn's app, so this manual add is what makes DH's
  // side usable at all. Writes against the FULL customers/jobs prop
  // (never visibleCustomers) - critical, since saving a filtered
  // subset back would silently drop every record that filter excluded.
  const addNewCustomer = () => {
    const normalized = normalizeIndianPhone(newCustPhone);
    if (!newCustName.trim()) { showToast('Naam daalein', true); return; }
    if (!normalized) { showToast('Sahi 10-digit mobile number daalein', true); return; }
    const newCustomer = { id: uid(), name: newCustName.trim(), phone: normalized, createdAt: new Date().toISOString(), businessUnit: isDhPartner ? 'dh_home_decor' : undefined };
    const nextCustomers = [newCustomer, ...customersRef.current];
    customersRef.current = nextCustomers;
    setCustomers(nextCustomers);
    const newJob = emptyJob(newCustomer.id, newCustomer.name, newCustomer.phone);
    if (isDhPartner) newJob.businessUnit = 'dh_home_decor';
    const nextJobs = [newJob, ...jobsRef.current];
    jobsRef.current = nextJobs;
    setJobs(nextJobs);
    setNewCustName(''); setNewCustPhone(''); setShowAddCustomer(false);
    showToast('Customer add ho gaya');
    onOpenJob(newJob.id);
  };
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
    let r = visibleCustomers
      .map((c) => ({ customer: c, job: jobs.find((j) => j.customerId === c.id) }))
      .filter(({ customer, job }) => {
        if (filter !== 'all' && (!job || job.status !== filter)) return false;
        if (branchFilter !== 'all' && (!job || job.branch !== branchFilter)) return false;
        if (query.trim()) {
          const q = query.toLowerCase();
          return customer.name.toLowerCase().includes(q) || customer.phone.includes(q) || (job?.flatNo || '').toLowerCase().includes(q) || (job?.city || '').toLowerCase().includes(q);
        }
        return true;
      });
    if (sort === 'recent') r.sort((a, b) => new Date(b.customer.createdAt) - new Date(a.customer.createdAt));
    if (sort === 'name') r.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
    if (sort === 'due') r.sort((a, b) => (b.job ? jobDue(b.job) : 0) - (a.job ? jobDue(a.job) : 0));
    return r;
  }, [visibleCustomers, jobs, query, filter, branchFilter, sort]);

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
  // unapproved estimate isn't due yet. Scoped to visibleCustomers'
  // jobs specifically, not every job in the app - a DH Home Decor
  // login should never see Shree Krushn's own outstanding dues (or
  // vice versa) folded into this total.
  const visibleCustomerIds = new Set(visibleCustomers.map((c) => c.id));
  const visibleJobs = jobs.filter((j) => visibleCustomerIds.has(j.customerId));
  const dueTotal = visibleJobs.filter((j) => j.status === 'in_progress' || j.status === 'delivered' || j.status === 'paid').reduce((s, j) => s + jobDue(j), 0);

  const saveEditedCustomer = (updated) => {
    const normalized = normalizeIndianPhone(updated.phone);
    if (!updated.name.trim() || !normalized) {
      showToast('Sahi naam aur phone number daalein', true);
      return;
    }
    const dupe = customers.find((c) => c.phone === normalized && c.id !== updated.id);
    if (dupe) { showToast('Ye phone number pehle se kisi aur customer ka hai', true); return; }
    setCustomers(customersRef.current.map((c) => (c.id === updated.id ? { ...c, name: updated.name.trim(), phone: normalized, birthdayMonthDay: updated.birthdayMonthDay } : c)));
    setJobs(jobsRef.current.map((j) => (j.customerId === updated.id ? { ...j, customerName: updated.name.trim(), phone: normalized } : j)));
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
    const customerJobs = jobsRef.current.filter((j) => j.customerId === deletingCustomer.id);
    const reviewsToArchive = customerJobs
      .filter((j) => j.review && j.review.featured)
      .map((j) => ({ id: uid(), customerName: j.customerName, rating: j.review.rating, text: j.review.text, date: j.review.date, featured: true }));
    if (reviewsToArchive.length > 0) {
      const nextArchived = [...archivedReviewsRef.current, ...reviewsToArchive];
      archivedReviewsRef.current = nextArchived;
      setArchivedReviews(nextArchived);
    }
    setCustomers(customersRef.current.filter((c) => c.id !== deletingCustomer.id));
    setJobs(jobsRef.current.filter((j) => j.customerId !== deletingCustomer.id));
    setDeletingCustomer(null);
    showToast('Customer deleted' + (reviewsToArchive.length > 0 ? ' (review surakshit rakha gaya)' : ''));
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
        {!isDhPartner && <button style={styles.linkBtn2} onClick={() => setShowAllEstimates(true)}>All Estimates</button>}
        {!isDhPartner && <button style={styles.linkBtn2} onClick={() => setShowReferralReport(true)}>Referral Report</button>}
        <button style={styles.linkBtn2} onClick={() => setShowAddCustomer(true)}>+ Naya Customer</button>
      </div>
      {showAddCustomer && (
        <div style={{ ...styles.formCard, marginTop: 10 }}>
          <div style={styles.fieldLabel}>Naam</div>
          <input style={styles.input} value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder='Customer ka naam' autoFocus />
          <div style={{ ...styles.fieldLabel, marginTop: 10 }}>Mobile Number</div>
          <input style={styles.input} inputMode='numeric' value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder='98765 43210' />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={addNewCustomer}>Add Karein</button>
            <button style={styles.cancelBtn} onClick={() => { setShowAddCustomer(false); setNewCustName(''); setNewCustPhone(''); }}>Cancel</button>
          </div>
        </div>
      )}
      <div style={styles.statRow2}>
        <StatCard icon={<User size={16} />} label='Customers' value={visibleCustomers.length} />
        <StatCard icon={<Hammer size={16} />} label='In Progress' value={visibleJobs.filter((j) => j.status === 'in_progress').length} />
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
                    {job?.city && <span style={styles.metaItem}>{job.city}</span>}
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
  // Same stale-prop protection as AdminJobDetail (see its matching
  // comment) - keeps rapid successive actions here (confirm, then
  // immediately mark completed, etc.) from each reading an outdated
  // job snapshot and silently overwriting one another's changes.
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);
  const saveJob = (next) => { jobRef.current = next; return onSave(next); };

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
    let next = { ...jobRef.current, appointment: nextAppt, address: bookAddress.trim() };
    next = logActivity(next, 'Admin ne appointment book ki: ' + formatDate(bookDate) + (bookTime ? (', ' + formatTime12h(bookTime)) : ''));
    saveJob(next);
    if (pushNotification) {
      pushNotification('appointment_confirmed', 'Aapki visit ' + formatDate(bookDate) + (bookTime ? (' - ' + formatTime12h(bookTime)) : '') + ' ke liye book ho gayi hai', job.id);
    }
    showToast('Appointment book ho gayi');
  };

  const confirmAdditionalVisit = (visit) => {
    if (!visitConfirmDate) { showToast('Date select karein', true); return; }
    const base = jobRef.current;
    const next = { ...base, additionalVisits: (base.additionalVisits || []).map((v) => (v.id === visit.id ? { ...v, status: 'confirmed', confirmedDate: visitConfirmDate, confirmedTime: visitConfirmTime } : v)) };
    saveJob(logActivity(next, 'Additional visit confirm ki: ' + visit.reason));
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
    let next = { ...jobRef.current, appointment: nextAppt };
    next = logActivity(next, 'Appointment ' + (asReschedule ? 'rescheduled' : 'confirmed') + ': ' + formatDate(confirmDate) + (confirmTime ? ', ' + confirmTime : ''));
    saveJob(next);
    if (pushNotification) {
      pushNotification('appointment_confirmed', 'Aapki visit ' + formatDate(confirmDate) + (confirmTime ? (' - ' + confirmTime) : '') + ' ke liye confirm ho gayi hai', job.id);
    }
    showToast(asReschedule ? 'Appointment reschedule ki gayi' : 'Appointment confirm ho gayi');
  };

  const markCompleted = () => {
    let next = { ...jobRef.current, appointment: { ...jobRef.current.appointment, status: 'completed' } };
    next = logActivity(next, 'Appointment completed');
    saveJob(next);
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
// A text input that saves when you stop typing, not on every letter.
//
// WHY THIS EXISTS
//
// Several fields were wired straight to onSave: every keystroke rebuilt
// the job, re-rendered the whole admin tree, and wrote the job document
// to Firestore. Typing "Flat 402" meant eight full document writes and
// eight re-renders of a very large component, which is exactly what the
// stutter while typing was.
//
// Debouncing is the easy half. The hard half is not losing what was
// typed, because a field that silently drops the last few characters is
// worse than a slow one - and "text disappears" is a bug this app has
// already had once. So the pending value is committed on three
// occasions: after a pause, on blur, and on unmount, which covers
// switching tabs or closing the job mid-word.
//
// An update arriving from outside (another device, a listener) is
// adopted only while nothing is pending. Otherwise a save landing
// mid-word would replace what is being typed and move the cursor.
function SavedInput({ value, onCommit, delay = 600, ...rest }) {
  const asText = (v) => (v === null || v === undefined ? '' : String(v));
  const [draft, setDraft] = useState(() => asText(value));
  const latest = useRef(asText(value));
  const lastSent = useRef(asText(value));
  const timer = useRef(null);

  // Kept in a ref, refreshed after every render, so a commit fired by
  // the timer uses the current handler - and therefore the current job -
  // rather than whichever one was captured when typing started.
  const commitRef = useRef(onCommit);
  useEffect(() => { commitRef.current = onCommit; });

  useEffect(() => {
    const incoming = asText(value);
    if (timer.current) return;                 // still typing - leave it alone
    if (incoming === lastSent.current) return; // our own value coming back
    setDraft(incoming);
    latest.current = incoming;
    lastSent.current = incoming;
  }, [value]);

  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (latest.current === lastSent.current) return;
    lastSent.current = latest.current;
    commitRef.current(latest.current);
  };

  // Unmount is the one that matters most: leaving the tab with an
  // uncommitted word must save it, not drop it.
  useEffect(() => () => flush(), []);

  const handleChange = (e) => {
    const v = e.target.value;
    setDraft(v);
    latest.current = v;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; flush(); }, delay);
  };

  return <input {...rest} value={draft} onChange={handleChange} onBlur={flush} />;
}

function AdminEstimateTab({ job, onSave, newItem, setNewItem, addItem, updateItem, removeItem, total, itemTemplates, setItemTemplates, showToast, approveSuggestedItem, rejectSuggestedItem, staffName }) {
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
      {(job.items || []).length === 0 && <AdminEstimateDraftsPanel job={job} onSave={onSave} showToast={showToast} staffName={staffName} />}
      <EstimateChoiceNote job={job} />

      <div style={styles.fieldLabel}>Flat Name / Number</div>
      <SavedInput style={styles.input} placeholder='Jaise Flat 402, Sun City' value={job.flatNo || ''} onCommit={(v) => onSave({ ...job, flatNo: v })} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <div style={styles.fieldLabel}>Estimate items{job.quoteNo ? (' - ' + job.quoteNo) : ''}</div>
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
        {/* Naap diya ho to Qty ginti mein nahi aati - estimateItemAmount
            sqft x rate leta hai, qty sirf bina-naap wale item ke liye hai.
            Pehle ye chup-chaap hota tha aur screen par " x 2" bhi dikh
            jata tha, jabki paisa ek ka hi lagta tha. */}
        {estimateItemSqft(newItem) !== null && Number(newItem.qty) > 1 && (
          <div style={{ ...styles.hintText, color: BRAND.gold, fontWeight: 700, marginTop: 6 }}>
            Naap diya hai, isliye Qty {newItem.qty} ginti mein nahi aayegi - daam sirf {estimateItemSqft(newItem).toFixed(2)} sq ft ka lagega.
            Ek hi naap ke {newItem.qty} item chahiye to item {newItem.qty} baar add karein.
          </div>
        )}
        {estimateItemSqft(newItem) !== null && (
          <div style={styles.liveCalcBox}>
            <span>{newItem.length}&quot; x {newItem.height}&quot; = <b>{estimateItemSqft(newItem).toFixed(2)} sq ft</b></span>
            {newItem.rate && <span>x {currency(newItem.rate)} = <b>{currency(estimateItemAmount(newItem))}</b></span>}
          </div>
        )}
        <button style={styles.addBtn} onClick={addItem}><Plus size={14} /> Add item</button>
        {itemTemplates && <button style={{ ...styles.cardActionBtn, marginTop: 10 }} onClick={saveCurrentAsTemplate}>Save as template</button>}
      </div>

      {(job.suggestedItems || []).length > 0 && (
        <div style={{ ...styles.card, marginTop: 12, borderColor: BRAND.gold, borderWidth: 1.5 }}>
          <div style={styles.fieldLabel}>Regional Partner Ke Suggestions</div>
          <div style={styles.plainTextMuted}>Partner ne estimate items banaye hain - approve karne par hi asli estimate mein add hoga.</div>
          {job.suggestedItems.map((s) => (
            <div key={s.id} style={{ ...styles.formCard, marginTop: 8 }}>
              <div style={styles.itemDesc}>{s.desc}</div>
              {s.length && s.height && <div style={styles.itemSub}>{s.length}&quot; x {s.height}&quot; = {estimateItemSqft(s).toFixed(2)} sq ft</div>}
              <div style={styles.itemSub}>{currency(estimateItemAmount(s))} - {s.suggestedBy} ne banaya</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => approveSuggestedItem(s)}><CheckCircle2 size={13} /> Approve Karein</button>
                <button style={styles.cancelBtn} onClick={() => rejectSuggestedItem(s.id)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
          <SavedInput style={styles.input} placeholder='Discount ₹' inputMode='decimal' value={job.discount || ''} onCommit={(v) => onSave({ ...job, discount: v })} />
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
function AdminEstimateDraftsPanel({ job, onSave, showToast, staffName }) {
  const drafts = job.estimateDrafts || [];
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [draftForm, setDraftForm] = useState(null);
  const [newDraftItem, setNewDraftItem] = useState({ desc: '', length: '', height: '', qty: '1', rate: '' });
  // Same stale-prop fix as AdminJobDetail (see its matching comment) -
  // protects rapid successive draft saves (e.g. saving "Laminate" then
  // immediately "Without Laminate") from overwriting each other.
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);

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
    const base = jobRef.current;
    const baseDrafts = base.estimateDrafts || [];
    const nextDrafts = editingDraftId === 'new' ? [...baseDrafts, savedDraft] : baseDrafts.map((d) => (d.id === editingDraftId ? savedDraft : d));
    const nextJob = { ...base, estimateDrafts: nextDrafts };
    jobRef.current = nextJob;
    onSave(nextJob);
    setEditingDraftId(null);
    setDraftForm(null);
    showToast('Estimate option save ho gaya');
  };
  // The customer can pick an option from their own app. So can the
  // owner, from here, which is what actually happens when the choice is
  // made on the phone - before this, the only way to finish that call
  // was to ask the customer to open the app and press the button
  // themselves. Same code path as the customer's, so both produce the
  // same estimate, and both leave a record of who decided.
  const finalizeDraft = (d) => {
    if (!window.confirm('"' + d.label + '" ko final estimate banayein?\n\nBaaki options hat jayenge.')) return;
    const nextJob = finalizeEstimateDraft(jobRef.current, d, 'admin', staffName);
    jobRef.current = nextJob;
    onSave(nextJob);
    showToast(d.label + ' final estimate ban gaya');
  };

  const deleteDraft = (id) => {
    const nextJob = { ...jobRef.current, estimateDrafts: (jobRef.current.estimateDrafts || []).filter((d) => d.id !== id) };
    jobRef.current = nextJob;
    onSave(nextJob);
  };

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
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button style={styles.cardActionBtn} onClick={() => startEditDraft(d)}><Edit3 size={12} /> Edit</button>
            <button style={{ ...styles.cardActionBtn, color: '#C62828' }} onClick={() => deleteDraft(d.id)}><Trash2 size={12} /> Delete</button>
            <button style={{ ...styles.cardActionBtn, color: '#2E7D32', fontWeight: 800 }} onClick={() => finalizeDraft(d)}><Check size={12} /> Ye Final Karein</button>
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

function AdminJobDetail({ job, onSave, showToast, staff, staffName, itemTemplates, setItemTemplates, pushNotification, categories, gallery }) {
  const [tab, setTab] = useState('status');
  const [resolvingComplaintId, setResolvingComplaintId] = useState(null);
  const [reqLightbox, setReqLightbox] = useState(null);
  // Fixes items (and payments, complaints, etc.) going missing when two
  // edits happen back-to-back quickly - e.g. adding one estimate item,
  // then immediately adding a second before the first save has finished
  // round-tripping to the server and the parent has re-rendered with
  // the updated job. Without this, the SECOND edit would still read the
  // OLD job prop (missing the first item), and its own save would
  // silently overwrite - and lose - the first item entirely.
  //
  // jobRef always holds the most recently INTENDED state (updated the
  // instant any local edit happens, not just when the parent eventually
  // re-renders), so every handler below builds its next state from
  // jobRef.current rather than the (possibly stale) job prop directly.
  // The effect keeps the ref caught up whenever the parent's own state
  // does change - e.g. after a real server-merge came back with fields
  // this device didn't touch.
  const jobRef = useRef(job);
  useEffect(() => { jobRef.current = job; }, [job]);
  const saveJob = (next) => {
    jobRef.current = next;
    return onSave(next);
  };
  const resolveGalleryPhotoForAdmin = (photoId) => {
    for (const cat of Object.keys(gallery || {})) {
      const found = (gallery[cat] || []).find((p) => p.id === photoId);
      if (found) return found;
    }
    return null;
  };
  const [resolutionNoteText, setResolutionNoteText] = useState('');
  const [newItem, setNewItem] = useState({ desc: '', length: '', height: '', qty: '1', rate: '' });
  const [newPayment, setNewPayment] = useState({ amount: '', note: '', method: 'Cash' });
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
    const base = jobRef.current;
    saveJob(logActivity({ ...base, materials: [entry, ...(base.materials || [])] }, (newMaterial.category === 'hardware' ? 'Hardware' : 'Material') + ' added: ' + entry.desc));
    setNewMaterial({ desc: '', category: newMaterial.category });
    showToast('Add ho gaya');
  };
  const setMaterialStatus = (id, status) => {
    const base = jobRef.current;
    const next = (base.materials || []).map((m) => (m.id === id ? { ...m, status, [status + 'At']: new Date().toISOString() } : m));
    saveJob({ ...base, materials: next });
  };
  const removeMaterial = (id) => saveJob({ ...jobRef.current, materials: (jobRef.current.materials || []).filter((m) => m.id !== id) });

  const sendAdminReply = () => {
    if (!replyText.trim()) return;
    const entry = { id: uid(), text: replyText.trim(), from: 'admin', authorName: staffName || 'Admin', createdAt: new Date().toISOString() };
    const base = jobRef.current;
    saveJob({ ...base, karigarMessages: [...(base.karigarMessages || []), entry] });
    setReplyText('');
    showToast('Reply bhej diya');
  };

  // Lets the business set its own certificate / receipt numbers. Both
  // defaulted to a slice of an internal id - unique, but meaningless to
  // read out or file against. Saving only stores what was typed, so a
  // document already issued keeps the number it went out with.
  const editDocNumber = (which, payment) => {
    const current = which === 'warranty' ? warrantyCertNo(jobRef.current) : receiptNo(payment);
    const entered = window.prompt(
      which === 'warranty' ? 'Certificate number:' : 'Receipt number:',
      current,
    );
    if (entered === null) return;
    const value = String(entered).trim();
    if (!value) { showToast('Number khali nahi ho sakta', true); return; }
    const base = jobRef.current;
    if (which === 'warranty') {
      saveJob({ ...base, warrantyCertNo: value });
    } else {
      saveJob({ ...base, payments: (base.payments || []).map((p) => (p.id === payment.id ? { ...p, receiptNo: value } : p)) });
    }
    showToast('Number save ho gaya');
  };

  const updateStatus = (status) => {
    let next = { ...jobRef.current, status };
    // When the work was finished, recorded once. The whole service
    // schedule counts from this date, and until now nothing stored it -
    // it had to be dug back out of the activity log.
    if ((status === 'delivered' || status === 'paid') && !next.deliveredAt) {
      next.deliveredAt = new Date().toISOString();
    }
    next = logActivity(next, 'Status updated: ' + STATUS[status].label);
    saveJob(next);
    showToast('Status set to ' + STATUS[status].label);
  };
  const startComplaintRepair = (id) => {
    const base = jobRef.current;
    const complaints = (base.complaints || []).map((c) => (c.id === id ? { ...c, status: 'in_progress' } : c));
    let next = { ...base, complaints };
    next = logActivity(next, 'Complaint repair shuru hua');
    saveJob(next);
    showToast('Repair shuru mark ho gaya');
    if (pushNotification) pushNotification('complaint_in_progress', 'Aapki complaint par repair shuru ho gaya hai', job.id);
  };
  const resolveComplaint = (id, resolutionNote) => {
    const base = jobRef.current;
    const complaints = (base.complaints || []).map((c) => (c.id === id ? { ...c, status: 'resolved', resolvedAt: new Date().toISOString(), resolutionNote: resolutionNote || '' } : c));
    let next = { ...base, complaints };
    next = logActivity(next, 'Complaint resolved');
    saveJob(next);
    showToast('Complaint resolved mark ho gayi');
    if (pushNotification) pushNotification('complaint_resolved', 'Aapki complaint solve ho gayi hai', job.id);
  };
  // Lets admin log a repair directly on an already-delivered job, even
  // when the customer never reported anything through the app (a phone
  // call, or admin noticing something on their own during a routine
  // visit) - reuses the exact same complaints array and open/in_progress/
  // resolved lifecycle a customer-reported complaint goes through, just
  // tagged with source:'admin' so it's clear where it came from without
  // needing a second, separate tracking list. This is specifically what
  // gives admin a durable record of repair work done well after
  // delivery, on customers who'd otherwise have no complaint trail at
  // all if they just called instead of using the app.
  const [showAdminRepairForm, setShowAdminRepairForm] = useState(false);
  const [adminRepairText, setAdminRepairText] = useState('');
  const addAdminRepair = () => {
    if (!adminRepairText.trim()) { showToast('Repair ka detail likhein', true); return; }
    const entry = { id: uid(), text: adminRepairText.trim(), status: 'open', source: 'admin', createdAt: new Date().toISOString() };
    const base = jobRef.current;
    let next = { ...base, complaints: [entry, ...(base.complaints || [])] };
    next = logActivity(next, 'Repair admin ne add kiya: ' + entry.text);
    saveJob(next);
    setAdminRepairText(''); setShowAdminRepairForm(false);
    showToast('Repair add ho gaya');
  };

  // Customer questions asked from the Help/FAQ screen (see HelpScreen's
  // matching askQuestion) - answering here is what actually notifies
  // the customer and marks their question resolved on their end.
  const [answeringQuestionId, setAnsweringQuestionId] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const answerQuestion = (id) => {
    if (!answerText.trim()) { showToast('Jawab likhein', true); return; }
    const base = jobRef.current;
    const questions = (base.questions || []).map((q) => (q.id === id ? { ...q, status: 'answered', answer: answerText.trim(), answeredAt: new Date().toISOString() } : q));
    let next = { ...base, questions };
    next = logActivity(next, 'Customer ke sawaal ka jawab diya');
    saveJob(next);
    setAnsweringQuestionId(null); setAnswerText('');
    showToast('Jawab bhej diya');
    if (pushNotification) pushNotification('question_answered', 'Aapke sawaal ka jawab mil gaya hai', job.id);
  };

  const addItem = () => {
    if (!newItem.desc.trim()) return;
    const item = {
      id: uid(),
      desc: newItem.desc.trim(),
      length: newItem.length || '',
      height: newItem.height || '',
      // With a measurement present the price is sqft x rate and the
      // quantity is not part of it, so storing anything but 1 would
      // record a quantity nobody was charged for.
      qty: estimateItemSqft(newItem) !== null ? '1' : (newItem.qty || '1'),
      rate: newItem.rate || '0',
    };
    const base = jobRef.current;
    let next = { ...base, items: [...(base.items || []), item] };
    // Marks exactly when the customer FIRST actually had an estimate to
    // respond to - the follow-up reminder below needs this, not
    // job.createdAt (customer registration date), since those two can
    // be days apart if admin doesn't build the estimate right away. Set
    // once, on the transition from 0 items to 1+ - never touched again,
    // so adding more items later or an admin correction doesn't reset
    // the "customer's clock" the follow-up reminder is running against.
    if (!(base.items || []).length) next.estimateGivenAt = new Date().toISOString();
    next = logActivity(next, 'Estimate item added: ' + newItem.desc.trim());
    saveJob(next);
    setNewItem({ desc: '', length: '', height: '', qty: '1', rate: '' });
  };
  const updateItem = (id, patch) => {
    const base = jobRef.current;
    saveJob({ ...base, items: base.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  };
  const removeItem = (id) => saveJob({ ...jobRef.current, items: jobRef.current.items.filter((it) => it.id !== id) });
  // Moves a Regional Partner's suggested local rate into the REAL
  // estimate (job.items) - the only way a suggestion ever actually
  // affects what the customer is billed, since suggestedItems itself
  // is never read by jobTotal/jobPaid anywhere in the app.
  const approveSuggestedItem = (suggestion) => {
    const item = { id: uid(), desc: suggestion.desc, length: suggestion.length || '', height: suggestion.height || '', qty: suggestion.qty || '1', rate: suggestion.rate };
    const base = jobRef.current;
    let next = { ...base, items: [...(base.items || []), item], suggestedItems: (base.suggestedItems || []).filter((s) => s.id !== suggestion.id) };
    if (!(base.items || []).length) next.estimateGivenAt = new Date().toISOString();
    next = logActivity(next, 'Partner suggestion approved: ' + suggestion.desc);
    saveJob(next);
    showToast('Estimate mein add ho gaya');
  };
  const rejectSuggestedItem = (suggestionId) => {
    saveJob({ ...jobRef.current, suggestedItems: (jobRef.current.suggestedItems || []).filter((s) => s.id !== suggestionId) });
  };

  const addPayment = () => {
    if (!newPayment.amount) return;
    const base = jobRef.current;
    let nextJob = { ...base, payments: [...(base.payments || []), { id: uid(), amount: newPayment.amount, note: newPayment.note.trim(), method: newPayment.method, date: new Date().toISOString() }] };
    nextJob = logActivity(nextJob, 'Payment received: ' + currency(newPayment.amount));
    // jobTotal(nextJob) > 0 guards against a job with NO estimate yet
    // (jobTotal is 0, so jobDue is trivially 0 too) auto-flipping to
    // "paid" the moment ANY stray payment gets recorded - the Payment
    // tab is reachable at any stage, even before an estimate exists, so
    // without this guard a payment entered too early would skip the
    // job straight past appointment/estimate/in_progress to paid.
    const justCompletedPayment = jobTotal(nextJob) > 0 && jobDue(nextJob) <= 0 && nextJob.status !== 'paid';
    if (justCompletedPayment) nextJob.status = 'paid';
    saveJob(nextJob);
    if (justCompletedPayment && pushNotification) {
      pushNotification('payment_completed', 'Aapka poora payment ho gaya hai - ' + BUSINESS.name + ' ki taraf se dhanyavaad! Hume aapke saath kaam karke khushi hui.', job.id);
    }
    setNewPayment({ amount: '', note: '', method: 'Cash' });
    showToast('Payment recorded');
  };
  const removePayment = (id) => saveJob({ ...jobRef.current, payments: jobRef.current.payments.filter((p) => p.id !== id) });

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
    const base = jobRef.current;
    let next = { ...base, extraWork: [entry, ...(base.extraWork || [])] };
    next = logActivity(next, (selfApprove ? 'Extra work add ho gaya: ' : 'Extra work added: ') + entry.desc + ' (' + currency(entry.amount) + ')');
    saveJob(next);
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
    const base = jobRef.current;
    const next = { ...base, extraWork: (base.extraWork || []).map((e) => (e.id === item.id ? { ...e, items: pricingItems, amount, status: 'pending_customer_approval' } : e)) };
    saveJob(logActivity(next, 'Extra work priced: ' + item.desc + ' (' + currency(amount) + ')'));
    if (pushNotification) {
      pushNotification('extra_work_needs_price', 'Aapke extra kaam "' + item.desc + '" ka price ' + currency(amount) + ' set ho gaya hai - approve karein', job.id);
    }
    setPricingId(null);
    setPricingItems([]);
    showToast('Price set, customer approval ke liye bheja gaya');
  };
  const removeExtraWork = (id) => saveJob({ ...jobRef.current, extraWork: (jobRef.current.extraWork || []).filter((e) => e.id !== id) });
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
    const base = jobRef.current;
    let next = {
      ...base,
      items: [...(base.items || []), ...itemsToAdd],
      extraWork: (base.extraWork || []).map((e) => (e.id === entry.id ? { ...e, mergedIntoEstimate: true } : e)),
    };
    if (!(base.items || []).length) next.estimateGivenAt = new Date().toISOString();
    next = logActivity(next, 'Extra work estimate mein merge kiya: ' + entry.desc + ' (' + currency(entry.amount) + ')');
    saveJob(next);
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
    const base = jobRef.current;
    let next = { ...base, progressPhotos: [...(base.progressPhotos || []), ...newPhotos] };
    next = logActivity(next, newPhotos.length + ' new progress photo' + (newPhotos.length !== 1 ? 's' : '') + ' added');
    const ok = await saveJob(next);
    if (ok) showToast(newPhotos.length + ' progress photo' + (newPhotos.length !== 1 ? 's' : '') + ' added');
    return ok;
  };
  const removePhoto = (id) => saveJob({ ...jobRef.current, progressPhotos: jobRef.current.progressPhotos.filter((p) => p.id !== id) });

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

            {staff && staff.some((s) => s.role === 'karigar' || s.role === 'regional_partner') && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Karigar / Regional Partner assign karein</div>
                <select
                  style={styles.input}
                  value={job.assignedStaffId || ''}
                  onChange={(e) => {
                    const newStaffId = e.target.value || null;
                    saveJob({ ...jobRef.current, assignedStaffId: newStaffId });
                    // A staff-targeted push (not admin-bound or
                    // customer-bound, so it goes straight through
                    // window.pushMessaging here rather than the shared
                    // pushNotification helper) - only fires when this
                    // is a genuinely NEW assignment (not re-selecting
                    // the same person), and only if that person has
                    // ever enabled notifications on their own device.
                    if (newStaffId && newStaffId !== job.assignedStaffId && window.pushMessaging) {
                      const assignedStaff = staff.find((s) => s.id === newStaffId);
                      if (assignedStaff?.pushToken) {
                        window.pushMessaging.sendPush(assignedStaff.pushToken, BUSINESS.name, 'Aapko ' + job.customerName + ' ka naya kaam assign hua hai').catch(() => {});
                      }
                    }
                  }}
                >
                  <option value=''>Koi assign nahi</option>
                  {staff.filter((s) => s.role === 'karigar' || s.role === 'regional_partner').map((s) => <option key={s.id} value={s.id}>{s.name}{s.role === 'regional_partner' ? ' (Regional Partner)' : ''}</option>)}
                </select>
              </div>
            )}

            {(job.status === 'delivered' || job.status === 'paid') && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Repair Ka Record Rakhein</div>
                <div style={styles.plainTextMuted}>Agar customer ne phone par bataya ho ya aapko khud pata chala ho ki kuch theek karna hai - yahan add karein, taaki record rahe.</div>
                {showAdminRepairForm ? (
                  <div style={{ marginTop: 8 }}>
                    <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} placeholder='Kya repair karna hai, detail likhein...' value={adminRepairText} onChange={(e) => setAdminRepairText(e.target.value)} autoFocus />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={addAdminRepair}>Add Karein</button>
                      <button style={styles.cancelBtn} onClick={() => { setShowAdminRepairForm(false); setAdminRepairText(''); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={() => setShowAdminRepairForm(true)}><Plus size={14} /> Repair Add Karein</button>
                )}
              </div>
            )}

            {(job.questions || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Customer Ke Sawaal ({job.questions.length})</div>
                {job.questions.map((q) => (
                  <div key={q.id} style={{ ...styles.formCard, marginTop: 8, padding: 10 }}>
                    <div style={styles.itemDesc}>{q.text}</div>
                    <div style={styles.itemSub}>{formatDate(q.createdAt)}</div>
                    {q.status === 'answered' ? (
                      <div style={{ ...styles.formCard, background: '#F0F7F0', marginTop: 8, padding: 8 }}>
                        <div style={styles.itemSub}>Aapka jawab:</div>
                        <div style={{ ...styles.itemDesc, marginTop: 2 }}>{q.answer}</div>
                      </div>
                    ) : answeringQuestionId === q.id ? (
                      <div style={{ marginTop: 8 }}>
                        <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} placeholder='Jawab likhein...' value={answerText} onChange={(e) => setAnswerText(e.target.value)} autoFocus />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => answerQuestion(q.id)}>Jawab Bhejein</button>
                          <button style={styles.cancelBtn} onClick={() => { setAnsweringQuestionId(null); setAnswerText(''); }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button style={{ ...styles.cardActionBtn, marginTop: 10 }} onClick={() => setAnsweringQuestionId(q.id)}><MessageSquare size={13} /> Jawab Dein</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(job.complaints || []).length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Complaints ({job.complaints.length})</div>
                {job.complaints.map((c) => (
                  <div key={c.id} style={{ ...styles.formCard, marginTop: 8, padding: 10 }}>
                    <div style={styles.itemDesc}>{c.text} {c.source === 'admin' && <span style={styles.reqCatBadge}>Admin ne add kiya</span>}</div>
                    {c.photo && (
                      <button style={{ border: 'none', padding: 0, background: 'none', cursor: 'pointer', marginTop: 8, display: 'block' }} onClick={() => setReqLightbox({ photos: [{ id: c.id, url: c.photo.url, origUrl: c.photo.origUrl, caption: c.text }], index: 0 })}>
                        <SmartImg src={c.photo.url} origUrl={c.photo.origUrl} alt='Problem' style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8 }} />
                      </button>
                    )}
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
              <>
              <button style={{ ...styles.addBtn, marginTop: 16 }} onClick={() => generateWarrantyCertificate(job, showToast)}><FileText size={14} /> Warranty Certificate Download Karein</button>
              {/* The number printed on the certificate. It used to be a
                  slice of the internal job id, which nobody can read out
                  over a phone - now it is whatever the business wants to
                  call it, and only suggests the old value. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <div style={styles.itemSub}>Certificate No: <b>{warrantyCertNo(job)}</b></div>
                <button style={styles.previewLinkBtn} onClick={() => editDocNumber('warranty')}>Badlein</button>
              </div>
              </>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Expected Completion Date</div>
              <div style={styles.plainTextMuted}>Customer ko Home screen par dikhega.</div>
              <input type='date' style={styles.input} value={job.expectedCompletionDate || ''} onChange={(e) => saveJob({ ...jobRef.current, expectedCompletionDate: e.target.value || null })} />
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Material (poore estimate ke liye)</div>
              <div style={styles.plainTextMuted}>Kaunsi company ki sheet, kitni kg - poore estimate mein ek hi material use hota hai.</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <SavedInput style={styles.input} placeholder='Company (jaise Kaka)' value={job.materialCompany || ''} onCommit={(v) => saveJob({ ...jobRef.current, materialCompany: v })} />
                <SavedInput style={styles.input} placeholder='Sheet weight (kg)' inputMode='decimal' value={job.sheetWeightKg || ''} onCommit={(v) => saveJob({ ...jobRef.current, sheetWeightKg: v })} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Work % Complete</div>
              <div style={styles.plainTextMuted}>Kaam kitna hua hai - payment lena ho to yaad dilata hai.</div>
              <div style={styles.chipRow}>
                {[0, 25, 50, 75, 100].map((pct) => (
                  <button key={pct} onClick={() => saveJob({ ...jobRef.current, workPercent: pct })} style={{ ...styles.chip, ...((job.workPercent || 0) === pct ? styles.chipActive : {}) }}>{pct}%</button>
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
          <AdminEstimateTab job={job} onSave={saveJob} newItem={newItem} setNewItem={setNewItem} addItem={addItem} updateItem={updateItem} removeItem={removeItem} total={total} itemTemplates={itemTemplates} setItemTemplates={setItemTemplates} showToast={showToast} approveSuggestedItem={approveSuggestedItem} rejectSuggestedItem={rejectSuggestedItem} staffName={staffName} />
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
                  const reminderUrl = whatsAppShareUrl(job.phone, buildPaymentReminderText(job));
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
                  <button style={{ ...styles.itemSub, border: 'none', background: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => editDocNumber('receipt', p)}>
                    Receipt No: {receiptNo(p)}
                  </button>
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
            <select style={{ ...styles.input, marginTop: 8 }} value={newPayment.method} onChange={(e) => setNewPayment((n) => ({ ...n, method: e.target.value }))}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
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

/* ---- Admin gallery manager ---- */
function AdminGallery({ gallery, galleryLoading, setGallery, categories, setCategories, showToast, isDhPartner }) {
  // DH Home Decor only ever does Color/POP and Electrical work - their
  // panel can only add photos into those two categories, never any of
  // Shree Krushn's own (Kitchen, Wardrobe, etc.) or create new ones.
  //
  // Picked out of the gallery's real categories rather than written out
  // here, so this cannot drift from what the gallery contains. It used
  // to name 'Color/POP Work' and 'Electrical Work', which this gallery
  // does not have - they are 'Color pop' and 'electric'. DH's panel was
  // therefore offering two categories that did not exist, and a photo
  // added to one would have created a duplicate beside the real one.
  const DH_PARTNER_CATEGORIES = useMemo(
    () => partnerCategories([...new Set([...(categories || []), ...Object.keys(gallery || {})])]),
    [categories, gallery]
  );
  const [activeCat, setActiveCat] = useState(isDhPartner ? DH_PARTNER_CATEGORIES[0] : categories[0]);
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
  const galleryCategories = isDhPartner
    ? DH_PARTNER_CATEGORIES
    : [...new Set([...(categories || []), ...Object.keys(gallery || {})])];

  // The same warm-up the customer's gallery uses. It was a second copy
  // of the code here, and it carried the same two faults.
  useGalleryThumbWarmup(gallery, galleryCategories);

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
      <div style={styles.galleryMasonryRow}>
        {[0, 1, 2].map((colIdx) => (
          <div key={colIdx} style={styles.galleryMasonryCol}>
            {visiblePhotos.filter((_, i) => i % 3 === colIdx).map((p) => (
              <div key={p.id} style={{ ...styles.progressPhotoCard }}>
                <button style={styles.photoEditTapArea} onClick={() => setEditingPhoto(p)}>
                  <SmartImg src={p.thumbUrl || p.url} origUrl={p.origUrl} alt={p.caption} style={styles.galleryMasonryImg} />
                </button>
                <button style={styles.photoDeleteBtn} onClick={() => removePhoto(p.id)}><Trash2 size={12} color='#FFF' /></button>
                {p.caption && <div style={styles.progressCaption}>{p.caption}</div>}
              </div>
            ))}
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
function AdminExpenses({ expenses, setExpenses, jobs, showToast, onOpenJob, isDhPartner }) {
  const [type, setType] = useState(EXPENSE_TYPES[0]);
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [linkedJobId, setLinkedJobId] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [activePayee, setActivePayee] = useState(null);
  const [showProfitReport, setShowProfitReport] = useState(false);
  // Same stale-prop fix as AdminJobDetail (see its matching comment) -
  // protects two rapid expense entries from the second silently
  // overwriting the first if the parent hasn't re-rendered with the
  // first one yet.
  const expensesRef = useRef(expenses);
  useEffect(() => { expensesRef.current = expenses; }, [expenses]);
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [showDueList, setShowDueList] = useState(false);
  // Every expense/job predating businessUnit has no such field, so
  // treating that as Shree Krushn's own (never DH's) keeps existing
  // records visible to admin exactly as before - only ones explicitly
  // tagged 'dh_home_decor' (logged going forward through that panel)
  // are isolated into DH's own separate view.
  const visibleExpenses = useMemo(() => {
    return expenses.filter((e) => (isDhPartner ? e.businessUnit === 'dh_home_decor' : e.businessUnit !== 'dh_home_decor'));
  }, [expenses, isDhPartner]);
  const visibleJobs = useMemo(() => {
    return jobs.filter((j) => (isDhPartner ? j.businessUnit === 'dh_home_decor' : j.businessUnit !== 'dh_home_decor'));
  }, [jobs, isDhPartner]);
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
    for (const e of visibleExpenses) {
      const key = (e.payee || '').trim().toLowerCase();
      if (!key) continue;
      if (!groups[key]) groups[key] = { displayName: e.payee.trim(), total: 0, count: 0, entries: [] };
      groups[key].total += Number(e.amount) || 0;
      groups[key].count += 1;
      groups[key].entries.push(e);
    }
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [visibleExpenses]);

  if (showProfitReport) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowProfitReport(false)}><ArrowLeft size={13} /> Expenses</button>
        </div>
        <AdminProfitReport jobs={visibleJobs} expenses={visibleExpenses} />
      </div>
    );
  }

  if (showMonthlyReport) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowMonthlyReport(false)}><ArrowLeft size={13} /> Expenses</button>
        </div>
        <AdminMonthlyReport jobs={visibleJobs} expenses={visibleExpenses} />
      </div>
    );
  }

  if (showDueList) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowDueList(false)}><ArrowLeft size={13} /> Expenses</button>
        </div>
        <AdminDuePaymentsList jobs={visibleJobs} expenses={visibleExpenses} onOpenJob={onOpenJob} />
      </div>
    );
  }

  const totalRevenue = visibleJobs.reduce((s, j) => s + jobTotal(j), 0);
  const totalCollected = visibleJobs.reduce((s, j) => s + jobPaid(j), 0);
  const totalExpense = visibleExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const karigarTotal = visibleExpenses.filter((e) => e.type === 'Karigar Payment').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalCollected - totalExpense;

  const addExpense = () => {
    if (!payee.trim() || !amount) { showToast('Naam aur amount daalein', true); return; }
    const entry = { id: uid(), type, payee: payee.trim(), amount, note: note.trim(), jobId: linkedJobId || null, date: new Date().toISOString(), businessUnit: isDhPartner ? 'dh_home_decor' : undefined };
    const next = [entry, ...expensesRef.current];
    expensesRef.current = next;
    setExpenses(next);
    setPayee(''); setAmount(''); setNote(''); setLinkedJobId('');
    showToast('Expense add ho gaya');
  };
  const removeExpense = (id) => {
    const next = expensesRef.current.filter((e) => e.id !== id);
    expensesRef.current = next;
    setExpenses(next);
  };

  const filtered = visibleExpenses.filter((e) => filterType === 'all' || e.type === filterType).sort((a, b) => new Date(b.date) - new Date(a.date));
  const activePayeeEntries = activePayee
    ? visibleExpenses.filter((e) => (e.payee || '').trim().toLowerCase() === activePayee).sort((a, b) => new Date(b.date) - new Date(a.date))
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
          {visibleJobs.filter((j) => j.status === 'in_progress').map((j) => <option key={j.id} value={j.id}>{j.customerName}</option>)}
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
        // The row is a div rather than a button now: it holds the
        // WhatsApp link, and a link inside a button is invalid markup
        // that browsers handle inconsistently.
        <div key={r.job.id} style={styles.reviewCard}>
          <button
            style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
            onClick={() => onOpenJob && onOpenJob(r.job.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={styles.cardName}>{r.job.customerName}</div>
              <span style={{ ...styles.badge, background: '#FFEBEE', color: '#C62828' }}>{currency(r.due)} due</span>
            </div>
            <div style={styles.itemSub}>{STATUS[r.job.status]?.label || r.job.status}{r.linkedExpense > 0 && (' - ' + currency(r.linkedExpense) + ' expense is project mein')}</div>
          </button>
          <a
            href={whatsAppShareUrl(r.job.phone, buildPaymentReminderText(r.job))}
            target='_blank'
            rel='noopener noreferrer'
            style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF', marginTop: 8, display: 'inline-flex' }}
          >
            <Send size={13} /> Payment Yaad Dilayein
          </a>
        </div>
      ))}
    </div>
  );
}

function AdminServiceDueList({ jobs, onSaveJob, onOpenJob, showToast }) {
  const nowIso = new Date().toISOString();

  const rows = useMemo(() => {
    return (jobs || [])
      .map((j) => ({ job: j, visit: serviceVisitDue(j, nowIso), warrantyEnds: warrantyEndsAt(j) }))
      .filter((r) => r.visit)
      // Longest overdue first - the promise that has been outstanding
      // the longest is the one to keep today.
      .sort((a, b) => new Date(a.visit.dueAt) - new Date(b.visit.dueAt));
  }, [jobs, nowIso]);

  const upcoming = useMemo(() => {
    return (jobs || [])
      .map((j) => ({ job: j, next: serviceSchedule(j).find((v) => !v.doneAt && new Date(v.dueAt) > new Date(nowIso)) }))
      .filter((r) => r.next)
      .sort((a, b) => new Date(a.next.dueAt) - new Date(b.next.dueAt))
      .slice(0, 5);
  }, [jobs, nowIso]);

  const markDone = (job, visit) => {
    const done = [...(job.serviceVisits || []), { n: visit.n, at: new Date().toISOString(), note: '' }];
    let next = { ...job, serviceVisits: done };
    next = logActivity(next, 'Free service visit (' + visit.label + ') ho gaya');
    onSaveJob(next);
    if (showToast) showToast('Service visit mark ho gaya');
  };

  const daysLate = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Free Service Due</div>
      <div style={styles.plainTextMuted}>
        Har delivered kaam par 2 saal ki maintenance warranty hai - 6 mahine, 1 saal, 18 mahine
        aur 2 saal par ek free service visit. Jinka time aa gaya hai, wo yahan hain.
      </div>

      <div style={styles.statRow2}>
        <StatCard icon={<AlertCircle size={16} />} label='Abhi due' value={rows.length} accent />
        <StatCard icon={<Calendar size={16} />} label='Aage aane wale' value={upcoming.length} />
      </div>

      {rows.length === 0 && <div style={styles.emptySmall}>Abhi koi service visit due nahi hai.</div>}
      {rows.map((r) => (
        <div key={r.job.id} style={styles.reviewCard}>
          <button
            style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}
            onClick={() => onOpenJob && onOpenJob(r.job.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={styles.cardName}>{r.job.customerName}</div>
              <span style={{ ...styles.badge, background: '#FFF4E5', color: '#8A5A00' }}>{r.visit.label} ka visit</span>
            </div>
            <div style={styles.itemSub}>
              {formatDate(r.visit.dueAt)} ko due tha
              {daysLate(r.visit.dueAt) > 0 ? (' - ' + daysLate(r.visit.dueAt) + ' din ho gaye') : ''}
            </div>
            {r.warrantyEnds && (
              <div style={styles.itemSub}>Warranty {formatDate(r.warrantyEnds)} tak</div>
            )}
          </button>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <a
              href={whatsAppShareUrl(r.job.phone, buildServiceOfferText(r.job, r.visit))}
              target='_blank'
              rel='noopener noreferrer'
              style={{ ...styles.cardActionBtn, background: '#25D366', color: '#FFF', display: 'inline-flex' }}
            >
              <Send size={13} /> Visit Offer Bhejein
            </a>
            <button style={styles.cardActionBtn} onClick={() => markDone(r.job, r.visit)}>
              <CheckCircle2 size={13} /> Ho gaya
            </button>
          </div>
        </div>
      ))}

      {upcoming.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={styles.fieldLabel}>Aage aane wale</div>
          {upcoming.map((r) => (
            <div key={r.job.id} style={styles.milestoneRow}>
              <div style={{ flex: 1 }}>
                <div style={styles.itemDesc}>{r.job.customerName}</div>
                <div style={styles.itemSub}>{r.next.label} ka visit - {formatDate(r.next.dueAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminProfitReport({ jobs, expenses }) {
  // "Is Saal" vs "Sab Milaake" - lets admin see just one year's numbers
  // without ever deleting or archiving anything. Deleting old data
  // after a year would break the 2-year maintenance warranty (a
  // customer's job record needs to still exist to honor a warranty
  // claim), lose the history repeat customers/referrals rely on, and
  // conflict with how long business records typically need to be kept
  // for tax purposes - a view filter gets the "fresh start" feeling
  // admin wants for reporting without any of that risk.
  const availableYears = useMemo(() => {
    const years = new Set();
    for (const j of jobs) {
      for (const p of (j.payments || [])) years.add(new Date(p.date).getFullYear());
    }
    for (const e of expenses) years.add(new Date(e.date).getFullYear());
    return Array.from(years).filter((y) => !isNaN(y)).sort((a, b) => b - a);
  }, [jobs, expenses]);
  const [selectedYear, setSelectedYear] = useState('all');

  // Recomputes collected/expense per job using only payments/expenses
  // that actually fall within the selected year - a job created in one
  // year but paid off in the next would otherwise misattribute revenue
  // to the wrong year if this filtered by job.createdAt instead of the
  // individual payment/expense dates themselves.
  const jobProfitForYear = (job, allExpenses, year) => {
    if (year === 'all') return jobProfit(job, allExpenses);
    const collected = (job.payments || [])
      .filter((p) => new Date(p.date).getFullYear() === year)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const linkedExpenses = (allExpenses || [])
      .filter((e) => e.jobId === job.id && new Date(e.date).getFullYear() === year)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { collected, linkedExpenses, profit: collected - linkedExpenses };
  };

  const rows = useMemo(() => {
    return jobs
      .map((j) => ({ job: j, ...jobProfitForYear(j, expenses, selectedYear) }))
      .filter((r) => r.collected > 0 || r.linkedExpenses > 0)
      .sort((a, b) => b.profit - a.profit);
  }, [jobs, expenses, selectedYear]);

  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalLinkedExpense = rows.reduce((s, r) => s + r.linkedExpenses, 0);
  const totalProfit = totalCollected - totalLinkedExpense;
  const unlinkedExpenseTotal = expenses
    .filter((e) => !e.jobId && (selectedYear === 'all' || new Date(e.date).getFullYear() === selectedYear))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={styles.sectionTitle}>Project-wise Profit Report</div>
      <div style={styles.plainTextMuted}>Har project mein kitna collect hua, kitna expense laga, aur profit kitna hai.</div>

      {availableYears.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={{ ...styles.chip, ...(selectedYear === 'all' ? styles.chipActive : {}) }} onClick={() => setSelectedYear('all')}>Sab Milaake</button>
          {availableYears.map((y) => (
            <button key={y} style={{ ...styles.chip, ...(selectedYear === y ? styles.chipActive : {}) }} onClick={() => setSelectedYear(y)}>{y}</button>
          ))}
        </div>
      )}

      <div style={{ ...styles.statRow2, marginTop: 12 }}>
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

// Same shape as FaqEditForm above, just generic title/desc field names -
// used for both Material Specs ("100% Virgin PVC" / "no warping,
// termite or water damage") and Company Benefits ("10+ Years
// Experience" / "500+ happy families across Ahmedabad"),
// which share this exact title+description structure even though
// they answer different questions for the customer.
function TitleDescEditForm({ item, onSave, onCancel }) {
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.desc);
  return (
    <div>
      <input style={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea style={{ ...styles.input, marginTop: 8, minHeight: 60, resize: 'vertical' }} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => onSave(title, desc)}>Save</button>
        <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ---- Data check: answers "where did my data go" without anyone having
   to open the Firebase console. Reports what is actually in storage
   versus what the app can see, in plain terms, and gives one button to
   copy the whole thing so it can be sent on. Read-only - it changes
   nothing. ---- */
function DataCheckPanel({ gallery, showToast }) {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);

  // Turns one raw probe result into a line a person can read.
  //
  // The distinction this panel exists to draw is between "denied" and
  // "empty", so an error is never rendered as a zero: a failed read says
  // so, and says the code, because 'permission-denied' and 'unavailable'
  // mean completely different things and lead to different fixes.
  const describeDoc = (r) => {
    if (!r) return '-';
    if (!r.ok) return 'ERROR: ' + r.error;
    if (!r.exists) return 'document maujood nahi';
    const size = Math.round(r.bytes / 1024) + ' KB';
    const count = typeof r.records === 'number' ? ', ' + r.records + ' record' : '';
    return 'maujood (' + size + count + ')' + (r.fromCache ? ' [cache se]' : '');
  };
  const describeList = (r) => {
    if (!r) return '-';
    if (!r.ok) return 'ERROR: ' + r.error;
    return r.count + ' document' + (r.fromCache ? ' [cache se]' : '');
  };

  const run = async () => {
    setRunning(true);
    const lines = [];
    const add = (label, value) => lines.push({ label, value });
    try {
      if (!window.dataCheck || !window.dataCheck.probe) {
        add('Data Check', 'is build mein available nahi - app update kijiye');
        setReport(lines);
        setRunning(false);
        return;
      }
      const p = await window.dataCheck.probe();

      add('Firebase project', p.projectId);
      add('Internet', p.online ? 'haan' : 'nahi');
      add(
        'Login (anonymous)',
        p.auth && p.auth.ok
          ? 'ho gaya' + (p.auth.anonymous ? ' (anonymous)' : ' (staff)')
          : 'FAIL: ' + ((p.auth && p.auth.error) || 'unknown'),
      );
      add('app_data/categories', describeDoc(p.appDataCategories));
      add('app_data/jobs', describeDoc(p.appDataJobs));
      add('app_data/customers', describeDoc(p.appDataCustomers));
      add('app_data list', describeList(p.appDataList));
      add('jobs collection', describeList(p.jobsList));
      add('customers collection', describeList(p.customersList));

      const cats = Object.keys(gallery || {});
      const photos = cats.reduce((n, c) => n + ((gallery[c] || []).length), 0);
      add('Gallery (screen par)', cats.length + ' category, ' + photos + ' photo');

      // A crash this device hit earlier, kept by the error boundary.
      // Without this, a screen that broke once and then recovered
      // leaves no trace at all - which is exactly the situation where
      // "app kaam nahi kar raha" arrives with nothing to go on.
      const crash = readLastCrash();
      if (crash) {
        add('Pichhla crash', crash.scope + ' - ' + new Date(crash.at).toLocaleString('en-IN'));
        add('Crash ka message', crash.message);
      } else {
        add('Pichhla crash', 'koi nahi');
      }

      // The one-line verdict, so the answer does not depend on reading
      // seven rows correctly. Ordered by which cause makes the others
      // meaningless: no auth explains every denial after it.
      const denied = [p.appDataCategories, p.appDataJobs, p.appDataCustomers, p.appDataList, p.jobsList, p.customersList]
        .some((r) => r && !r.ok && String(r.error).indexOf('permission-denied') >= 0);
      const anyData = [p.appDataJobs, p.appDataCustomers, p.appDataCategories].some((r) => r && r.ok && r.exists)
        || [p.appDataList, p.jobsList, p.customersList].some((r) => r && r.ok && r.count > 0);
      // The app reads the per-record collection whenever it has anything
      // in it, and falls back to the pre-split document only while it is
      // completely empty. So a collection holding FEWER records than the
      // old document is the one state that hides data without any error
      // anywhere: the migration stopped partway, and the records it never
      // copied simply stop appearing. Naming it here is the only place it
      // becomes visible.
      const shortfall = (legacy, list, what) => {
        if (!legacy || !legacy.ok || typeof legacy.records !== 'number') return null;
        if (!list || !list.ok) return null;
        if (list.count === 0) return null;
        if (list.count >= legacy.records) return null;
        return what + ': purane document mein ' + legacy.records + ' record hain lekin naye collection mein sirf '
          + list.count + '. Migration adhoora hai - ' + (legacy.records - list.count) + ' record app mein nahi dikh rahe.';
      };
      const gaps = [
        shortfall(p.appDataJobs, p.jobsList, 'Jobs'),
        shortfall(p.appDataCustomers, p.customersList, 'Customers'),
      ].filter(Boolean);

      let verdict;
      if (gaps.length > 0) {
        verdict = gaps.join(' ');
      } else if (p.auth && !p.auth.ok && denied) {
        verdict = 'Login fail + reads blocked. Firebase Console -> Authentication -> Sign-in method -> Anonymous ko Enable kijiye. Data safe hai.';
      } else if (denied) {
        verdict = 'Firestore Rules reads block kar rahe hain. Data safe hai, rules theek karne par wapas aa jayega.';
      } else if (!p.online) {
        verdict = 'Device offline hai - dobara online hokar check kijiye.';
      } else if (!anyData) {
        verdict = 'Reads chal rahe hain lekin is project mein data nahi mila. Firebase Console -> Firestore Database dekhiye.';
      } else {
        verdict = 'Data padha ja raha hai.';
      }
      add('NATIJA', verdict);
    } catch (e) {
      add('Check fail ho gaya', String((e && e.message) || e));
    }
    setReport(lines);
    setRunning(false);
  };

  const copy = async () => {
    const text = (report || []).map((l) => l.label + ': ' + l.value).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copy ho gaya - ab paste karke bhej sakte hain');
    } catch (e) {
      showToast('Copy nahi ho paya - screenshot bhej dijiye', true);
    }
  };

  return (
    <div style={{ ...styles.card, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <AlertCircle size={16} color={BRAND.gold} />
        <div style={{ fontWeight: 800, fontSize: 14 }}>Data Check</div>
      </div>
      <div style={styles.plainText}>
        App ka data kahan hai ye batata hai. Kuch badalta nahi - sirf padh kar
        dikhata hai. Agar data gayab lage to ye chala kar result bhej dijiye.
      </div>
      <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={run} disabled={running}>
        {running ? 'Check kar rahe hain...' : 'Data check karein'}
      </button>
      {report && (
        <div style={{ marginTop: 12 }}>
          {report.map((l) => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid ' + BRAND.line }}>
              <span style={{ fontSize: 13, color: BRAND.textMuted }}>{l.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{String(l.value)}</span>
            </div>
          ))}
          <button style={{ ...styles.addBtn, marginTop: 10 }} onClick={copy}>Result copy karein</button>
        </div>
      )}
    </div>
  );
}

function AdminSettings({ adminPin, setAdminPin, partnerPin, setPartnerPin, dhPartnerPin, setDhPartnerPin, staff, setStaff, appointmentItemOptions, setAppointmentItemOptions, categories, setCategories, gallery, setGallery, pendingGalleryPhotos, setPendingGalleryPhotos, brochures, addBrochure, removeBrochure, allData, jobs, customers, attendance, estimateRates, setEstimateRates, faqs, setFaqs, materialSpecs, setMaterialSpecs, companyBenefits, setCompanyBenefits, adminPushTokens, enableAdminPushNotifications, onLogout, showToast }) {
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
  const [newCommissionPercent, setNewCommissionPercent] = useState('');
  const [staffError, setStaffError] = useState('');
  const [changingPin, setChangingPin] = useState(false);
  const [addingStaff, setAddingStaff] = useState(false);
  const [newPartnerPin, setNewPartnerPin] = useState('');
  const [partnerPinError, setPartnerPinError] = useState('');
  const [newDhPartnerPin, setNewDhPartnerPin] = useState('');
  const [dhPartnerPinError, setDhPartnerPinError] = useState('');
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
  // Same admin-authored, fully-controlled list pattern as FAQ above -
  // material specs (what the PVC/hardware actually is, physically) and
  // company benefits (why choose Shree Krushn specifically) are shown
  // together on one customer-facing screen (see MaterialSpecsScreen),
  // but kept as two separate lists here since they answer genuinely
  // different questions and a customer or admin thinking about one
  // isn't necessarily thinking about the other.
  const [newSpecTitle, setNewSpecTitle] = useState('');
  const [newSpecDesc, setNewSpecDesc] = useState('');
  const [editingSpecId, setEditingSpecId] = useState(null);
  const addMaterialSpec = () => {
    if (!newSpecTitle.trim()) { showToast('Title likhein', true); return; }
    const next = [...(materialSpecs || []), { id: uid(), title: newSpecTitle.trim(), desc: newSpecDesc.trim() }];
    setMaterialSpecs(next);
    setNewSpecTitle(''); setNewSpecDesc('');
    showToast('Specification add ho gayi');
  };
  const updateMaterialSpec = (id, title, desc) => {
    setMaterialSpecs((materialSpecs || []).map((s) => (s.id === id ? { ...s, title, desc } : s)));
    setEditingSpecId(null);
    showToast('Specification update ho gayi');
  };
  const removeMaterialSpec = (id) => setMaterialSpecs((materialSpecs || []).filter((s) => s.id !== id));
  const moveMaterialSpec = (id, dir) => {
    const list = [...(materialSpecs || [])];
    const idx = list.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    setMaterialSpecs(list);
  };

  const [newBenefitTitle, setNewBenefitTitle] = useState('');
  const [newBenefitDesc, setNewBenefitDesc] = useState('');
  const [editingBenefitId, setEditingBenefitId] = useState(null);
  const addCompanyBenefit = () => {
    if (!newBenefitTitle.trim()) { showToast('Title likhein', true); return; }
    const next = [...(companyBenefits || []), { id: uid(), title: newBenefitTitle.trim(), desc: newBenefitDesc.trim() }];
    setCompanyBenefits(next);
    setNewBenefitTitle(''); setNewBenefitDesc('');
    showToast('Benefit add ho gaya');
  };
  const updateCompanyBenefit = (id, title, desc) => {
    setCompanyBenefits((companyBenefits || []).map((b) => (b.id === id ? { ...b, title, desc } : b)));
    setEditingBenefitId(null);
    showToast('Benefit update ho gaya');
  };
  const removeCompanyBenefit = (id) => setCompanyBenefits((companyBenefits || []).filter((b) => b.id !== id));
  const moveCompanyBenefit = (id, dir) => {
    const list = [...(companyBenefits || [])];
    const idx = list.findIndex((b) => b.id === id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
    setCompanyBenefits(list);
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
      // Surfaces the actual underlying error (e.g. a Firestore
      // "permission-denied" code if the security rules don't allow
      // listing this collection, or the 15s timeout message) instead
      // of a generic one - this is exactly the diagnostic previously
      // missing when the button appeared to do nothing at all: the
      // scan itself was hanging/failing with no visible feedback at
      // any point.
      showToast('Recovery mein dikkat aayi: ' + (e.code || e.message || 'unknown error'), true);
    } finally {
      setRecoveringCategories(false);
    }
  };

  // Retroactively generates the small grid thumbnail for every EXISTING
  // photo that doesn't have one yet - photos uploaded before this
  // feature existed only have their full-quality file, so the grid
  // speed improvement only applied to new uploads going forward until
  // this runs. Processes 3 photos at a time (mapWithConcurrencyLimit)
  // to avoid overwhelming the browser/connection with hundreds of
  // simultaneous fetch+canvas+upload operations, and re-reads each
  // category fresh from Firestore right before writing it back (same
  // pattern persistGallery uses) rather than trusting whatever was in
  // local `gallery` state when this started, since this can run for a
  // while and other writes could land in the meantime.
  const [backfillingThumbnails, setBackfillingThumbnails] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState(null);
  // Which photos failed and WHY. The count on its own was useless: a
  // photo that cannot be thumbnailed fails identically on every run, so
  // "12 fail hui" was all you ever got no matter how many times you
  // pressed the button, with nothing saying which twelve or what to do
  // about them.
  const [backfillReport, setBackfillReport] = useState(null);
  const backfillThumbnails = async () => {
    setBackfillingThumbnails(true);
    setBackfillProgress(null);
    setBackfillReport(null);
    try {
      const categoriesToProcess = [...new Set([...(categories || []), ...Object.keys(gallery || {})])];
      let totalNeedingThumb = 0;
      const perCategoryNeeding = {};
      for (const cat of categoriesToProcess) {
        const needing = (gallery[cat] || []).filter((p) => p.url && !p.thumbUrl);
        if (needing.length > 0) {
          perCategoryNeeding[cat] = needing;
          totalNeedingThumb += needing.length;
        }
      }
      if (totalNeedingThumb === 0) {
        showToast('Saari photos mein pehle se thumbnail hai - kuch karne ki zaroorat nahi');
        return;
      }
      let doneCount = 0;
      const failures = [];
      setBackfillProgress({ done: 0, total: totalNeedingThumb });
      // Save every 40 photos rather than once per category. Kitchen alone
      // holds 477: the old shape uploaded all 477 thumbnails and only then
      // recorded them, so closing the app at 400 threw away all 400 and
      // the next run did them again. This whole job is 1506 photos on a
      // phone, where being interrupted is the normal case, not the odd one.
      const BATCH = 40;
      for (const cat of Object.keys(perCategoryNeeding)) {
        const needing = perCategoryNeeding[cat];
        for (let start = 0; start < needing.length; start += BATCH) {
        const slice = needing.slice(start, start + BATCH);
        const thumbUrlById = {};
        await mapWithConcurrencyLimit(slice, 3, async (p) => {
          try {
            // A photo whose url never made it to Storage is still sitting
            // inline as a data: URI. If that inline copy was cut short by
            // the failed upload there is no image left to shrink, and no
            // number of retries will conjure one - say so plainly instead
            // of letting it fail as a mystery on every run.
            if (typeof p.url === 'string' && p.url.startsWith('data:') && p.url.length < 2000) {
              throw new Error('Photo ka data adhoora hai - ise dobara upload karna hoga');
            }
            const fullDataUri = await loadImageAsDataUrl(p.url);
            const thumbDataUri = await generateThumbnail(fullDataUri);
            const uploaded = await window.fileStorage.upload('gallery_thumb_' + p.id, thumbDataUri);
            if (uploaded && !uploaded.error) {
              thumbUrlById[p.id] = uploaded.url;
            } else {
              failures.push({ cat, id: p.id, caption: p.caption || '', reason: 'Upload nahi hui: ' + ((uploaded && uploaded.error) || 'pata nahi') });
            }
          } catch (e) {
            failures.push({ cat, id: p.id, caption: p.caption || '', reason: e.message || String(e) });
          }
          doneCount++;
          setBackfillProgress({ done: doneCount, total: totalNeedingThumb });
        });
        if (Object.keys(thumbUrlById).length === 0) continue;
        // Re-fetch this specific category fresh right before writing,
        // so a slow-running backfill never clobbers a caption edit,
        // delete, or move that happened on this category while it was
        // still processing other photos.
        const freshRaw = await window.storage.get('gallery_cat_' + cat);
        const freshPhotos = freshRaw ? JSON.parse(freshRaw.value) : (gallery[cat] || []);
        const updatedPhotos = freshPhotos.map((p) => (thumbUrlById[p.id] ? { ...p, thumbUrl: thumbUrlById[p.id] } : p));
        await window.storage.set('gallery_cat_' + cat, JSON.stringify(updatedPhotos));
        }
      }
      const made = totalNeedingThumb - failures.length;
      setBackfillReport({ made, total: totalNeedingThumb, failures });
      showToast(made + ' photo(s) ke thumbnail ban gaye' + (failures.length > 0 ? (', ' + failures.length + ' nahi bani - neeche wajah dekhein') : '') + (made > 0 ? ' - app band karke dobara kholein' : ''), failures.length > 0 && made === 0);
    } catch (e) {
      showToast('Backfill mein dikkat aayi: ' + (e.message || 'unknown error'), true);
    } finally {
      setBackfillingThumbnails(false);
      setBackfillProgress(null);
    }
  };

  // Approving moves the photo into the REAL gallery (via the SAME
  // persistGallery path any normal admin upload uses, so it gets
  // uploaded/compressed/thumbnailed identically) - a partner's
  // submission never touches the live gallery on its own, exactly the
  // isolation pendingGalleryPhotos exists for.
  const approveGalleryPhoto = async (photo) => {
    const category = photo.category;
    const nextCategoryPhotos = [...(gallery[category] || []), { id: photo.id, url: photo.url, origUrl: photo.origUrl, caption: photo.customerName ? ('Kaam: ' + photo.customerName) : '', createdAt: photo.createdAt }];
    await setGallery({ ...gallery, [category]: nextCategoryPhotos });
    setPendingGalleryPhotos(pendingGalleryPhotos.filter((p) => p.id !== photo.id));
    showToast('Gallery mein add ho gaya');
  };
  const rejectGalleryPhoto = (photoId) => {
    setPendingGalleryPhotos(pendingGalleryPhotos.filter((p) => p.id !== photoId));
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
  const [showCommissionReport, setShowCommissionReport] = useState(false);
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

  if (showCommissionReport) {
    return (
      <div>
        <div style={{ padding: '12px 16px 0' }}>
          <button style={styles.backLink} onClick={() => setShowCommissionReport(false)}><ArrowLeft size={13} /> Settings</button>
        </div>
        <AdminCommissionReport staff={staff} jobs={jobs || []} setStaff={setStaff} showToast={showToast} />
      </div>
    );
  }

  // Changing a PIN goes through the server when the server is the thing
  // checking PINs, and through the old Firestore write when it is not.
  //
  // The two paths cannot be collapsed: on the server path the PIN is
  // deliberately NOT written to Firestore or kept in local state, because
  // the whole point is that no browser holds it. Calling setAdminPin
  // there would write app_data/admin_pin straight back - recreating the
  // readable copy the server had just deleted.
  const changePinVia = async (which, currentValue, newValue, localSetter) => {
    const api = window.staffAuth && window.staffAuth.changePin;
    if (api) {
      const res = await api(which, currentValue, newValue);
      if (res && res.ok) { localSetter(newValue, true); return { ok: true, server: true }; }
      if (res && !res.unconfigured) return { ok: false, error: res.error };
    }
    // Server side not set up: keep the original in-browser behaviour.
    localSetter(newValue);
    return { ok: true, server: false };
  };

  const change = async () => {
    if (next1.length < 4) { setError('Naya PIN kam se kam 4 digit ka hona chahiye'); return; }
    if (next1 !== next2) { setError('Dono naye PIN match nahi karte'); return; }
    if (changingPin) return;
    setChangingPin(true);
    try {
      const api = window.staffAuth && window.staffAuth.changePin;
      let res = api ? await api('admin', current, next1) : { unconfigured: true };
      if (res.unconfigured) {
        // No server session to verify against, so the old local check is
        // the only one there is.
        if (current !== adminPin) { setError('Current PIN galat hai'); return; }
        setAdminPin(next1);
      } else if (!res.ok) {
        setError(res.error || 'PIN change nahi ho paya');
        return;
      } else {
        setAdminPin(next1, true);
      }
      setCurrent(''); setNext1(''); setNext2(''); setError('');
      showToast('Admin PIN change ho gaya');
    } finally {
      setChangingPin(false);
    }
  };

  // The staff record itself is not secret - name, role and commission
  // all have to be readable for the app to work. The PIN is, so it goes
  // to the server and never into app_data/staff, which every signed-in
  // user can read. hasPin is what the screen shows instead.
  const addStaff = async () => {
    if (!newStaffName.trim()) { setStaffError('Staff ka naam daalein'); return; }
    if (newStaffPin.length < 4) { setStaffError('PIN kam se kam 4 digit ka ho'); return; }
    // A first pass against what this device can still see. The complete
    // check is on the server, which is the only thing that knows every
    // PIN now - it answers 409 and the message below shows that.
    const visiblePins = [adminPin, partnerPin, dhPartnerPin, ...staff.map((s) => s.pin)].filter(Boolean);
    if (visiblePins.includes(newStaffPin)) { setStaffError('Ye PIN pehle se use ho raha hai - alag PIN chunein'); return; }
    if (newStaffRole === 'regional_partner' && (!newCommissionPercent || Number(newCommissionPercent) <= 0)) { setStaffError('Commission percentage daalein'); return; }
    if (addingStaff) return;
    setAddingStaff(true);
    try {
      const id = uid();
      const member = {
        id, name: newStaffName.trim(), role: newStaffRole,
        commissionPercent: newStaffRole === 'regional_partner' ? Number(newCommissionPercent) : null,
        createdAt: new Date().toISOString(),
      };
      const api = window.staffAuth && window.staffAuth.changePin;
      const res = api ? await api('staff:' + id, '', newStaffPin) : { unconfigured: true };
      if (res && res.ok) {
        // Stored server-side; the list carries only the flag.
        setStaff([...staff, { ...member, hasPin: true }]);
      } else if (res && res.unconfigured) {
        // Server side not set up - keep the original behaviour so staff
        // logins do not stop working on a half-configured deploy.
        setStaff([...staff, { ...member, pin: newStaffPin }]);
      } else {
        setStaffError((res && res.error) || 'PIN set nahi ho paya');
        return;
      }
      setNewStaffName(''); setNewStaffPin(''); setNewStaffRole('admin'); setNewCommissionPercent(''); setStaffError('');
      showToast('Staff member add ho gaya');
    } finally {
      setAddingStaff(false);
    }
  };
  const removeStaff = async (id) => {
    const api = window.staffAuth && window.staffAuth.changePin;
    // Drop the PIN as well, or the person keeps a working login after
    // being removed from the list.
    if (api) { try { await api('staff:' + id, '', ''); } catch (e) { /* removal below still stands */ } }
    setStaff(staff.filter((s) => s.id !== id));
    showToast('Staff member hataya gaya');
  };
  const resetStaffPin = async (member) => {
    const entered = window.prompt('Naya PIN ' + member.name + ' ke liye (4+ digit):', '');
    if (entered === null) return;
    const next = String(entered).trim();
    if (!/^[0-9]{4,10}$/.test(next)) { showToast('PIN 4 se 10 digit ka hona chahiye', true); return; }
    const api = window.staffAuth && window.staffAuth.changePin;
    const res = api ? await api('staff:' + member.id, '', next) : { unconfigured: true };
    if (res && res.ok) {
      setStaff(staff.map((m) => (m.id === member.id ? { ...m, pin: undefined, hasPin: true } : m)));
      showToast('PIN badal gaya');
    } else if (res && res.unconfigured) {
      setStaff(staff.map((m) => (m.id === member.id ? { ...m, pin: next } : m)));
      showToast('PIN badal gaya');
    } else {
      showToast((res && res.error) || 'PIN badla nahi ja saka', true);
    }
  };

  const savePartnerPin = async () => {
    if (newPartnerPin.length < 4) { setPartnerPinError('PIN kam se kam 4 digit ka ho'); return; }
    const allPins = [adminPin, dhPartnerPin, ...staff.map((s) => s.pin)].filter(Boolean);
    if (allPins.includes(newPartnerPin)) { setPartnerPinError('Ye PIN pehle se use ho raha hai - alag PIN chunein'); return; }
    const res = await changePinVia('partner', '', newPartnerPin, setPartnerPin);
    if (!res.ok) { setPartnerPinError(res.error || 'PIN set nahi ho paya'); return; }
    setNewPartnerPin(''); setPartnerPinError('');
    showToast('Partner PIN set ho gaya');
  };
  const removePartnerPin = async () => {
    const res = await changePinVia('partner', '', '', setPartnerPin);
    if (!res.ok) { setPartnerPinError(res.error || 'Hataya nahi ja saka'); return; }
    showToast('Partner access hata diya gaya');
  };
  const saveDhPartnerPin = async () => {
    if (newDhPartnerPin.length < 4) { setDhPartnerPinError('PIN kam se kam 4 digit ka ho'); return; }
    const allPins = [adminPin, partnerPin, ...staff.map((s) => s.pin)].filter(Boolean);
    if (allPins.includes(newDhPartnerPin)) { setDhPartnerPinError('Ye PIN pehle se use ho raha hai - alag PIN chunein'); return; }
    const res = await changePinVia('dh_partner', '', newDhPartnerPin, setDhPartnerPin);
    if (!res.ok) { setDhPartnerPinError(res.error || 'PIN set nahi ho paya'); return; }
    setNewDhPartnerPin(''); setDhPartnerPinError('');
    showToast('DH Home Decor PIN set ho gaya');
  };
  const removeDhPartnerPin = async () => {
    const res = await changePinVia('dh_partner', '', '', setDhPartnerPin);
    if (!res.ok) { setDhPartnerPinError(res.error || 'Hataya nahi ja saka'); return; }
    showToast('DH Home Decor access hata diya gaya');
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <Users size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>DH Home Decor Access</div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>
          DH Home Decor ko apni alag PIN dein - unko sirf apne khud ke customers/estimates/expenses dikhenge, aapke Shree Krushn customers kabhi nahi. Gallery mein sirf Color/POP Work aur Electrical Work categories mein hi photo add kar sakte hain.
        </div>
        {dhPartnerPin ? (
          <div style={styles.staffRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.itemDesc}>DH Home Decor PIN active</div>
              <div style={styles.itemSub}>PIN: {dhPartnerPin}</div>
            </div>
            <button style={styles.cardActionBtn} onClick={removeDhPartnerPin}>Remove</button>
          </div>
        ) : (
          <div>
            <input style={styles.input} placeholder='DH Home Decor PIN set karein (4+ digit)' inputMode='numeric' type='password' value={newDhPartnerPin} onChange={(e) => { setNewDhPartnerPin(e.target.value); setDhPartnerPinError(''); }} />
            {dhPartnerPinError && <div style={styles.errorText}>{dhPartnerPinError}</div>}
            <button style={styles.addBtn} onClick={saveDhPartnerPin}><UserPlus size={14} /> Enable DH Home Decor access</button>
          </div>
        )}
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color={BRAND.gold} />
            <div style={{ fontWeight: 800, fontSize: 14 }}>Staff Logins</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {staff.some((s) => s.role === 'karigar') && (
              <button style={styles.linkBtn2} onClick={() => setShowKarigarPerformance(true)}>Karigar Performance</button>
            )}
            {staff.some((s) => s.role === 'regional_partner') && (
              <button style={styles.linkBtn2} onClick={() => setShowCommissionReport(true)}>Commission Report</button>
            )}
          </div>
        </div>
        <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Team members ko alag PIN dein taaki wo bhi access kar sakein.</div>

        {staff.length === 0 && <div style={styles.emptySmall}>Abhi koi staff member add nahi kiya.</div>}
        {staff.map((s) => (
          <div key={s.id} style={styles.staffRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.itemDesc}>{s.name} <span style={styles.reqCatBadge}>{s.role === 'karigar' ? 'Karigar' : (s.role === 'regional_partner' ? 'Regional Partner' : 'Admin')}</span></div>
              <div style={styles.itemSub}>
                {s.pin ? ('PIN: ' + s.pin) : 'PIN set hai (surakshit)'}
                {s.role === 'regional_partner' && s.commissionPercent ? (' - Commission: ' + s.commissionPercent + '%') : ''}
              </div>
              <button style={{ ...styles.previewLinkBtn, marginTop: 6 }} onClick={() => resetStaffPin(s)}>PIN badlein</button>
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
            <button onClick={() => setNewStaffRole('regional_partner')} style={{ ...styles.chip, ...(newStaffRole === 'regional_partner' ? styles.chipActive : {}) }}>Regional Partner (Dusre Sheher)</button>
          </div>
          {newStaffRole === 'regional_partner' && (
            <input style={{ ...styles.input, marginTop: 8 }} inputMode='decimal' placeholder='Commission % (jaise 15)' value={newCommissionPercent} onChange={(e) => { setNewCommissionPercent(e.target.value); setStaffError(''); }} />
          )}
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
          <ShieldCheck size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Material Specifications</div>
        </div>
        <div style={styles.plainTextMuted}>Aapke material ki khasiyat - customer ko dikhti hain, unki app ke ek dedicated screen par.</div>
        {(materialSpecs || []).map((s, i) => (
          <div key={s.id} style={{ ...styles.formCard, marginTop: 10 }}>
            {editingSpecId === s.id ? (
              <TitleDescEditForm item={s} onSave={(t, d) => updateMaterialSpec(s.id, t, d)} onCancel={() => setEditingSpecId(null)} />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.itemDesc}>{s.title}</div>
                    <div style={{ ...styles.itemSub, marginTop: 4 }}>{s.desc}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button style={styles.iconBtnSmall} onClick={() => moveMaterialSpec(s.id, -1)} disabled={i === 0}><ChevronUp size={13} color='#B3B8C6' /></button>
                    <button style={styles.iconBtnSmall} onClick={() => moveMaterialSpec(s.id, 1)} disabled={i === materialSpecs.length - 1}><ChevronDown size={13} color='#B3B8C6' /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => setEditingSpecId(s.id)}><Edit3 size={12} /> Edit</button>
                  <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => removeMaterialSpec(s.id)}><Trash2 size={12} /> Hataein</button>
                </div>
              </>
            )}
          </div>
        ))}
        <div style={{ ...styles.formCard, marginTop: 10, background: '#FFF9EE', borderColor: BRAND.gold }}>
          <div style={styles.fieldLabel}>Nayi Specification Add Karein</div>
          <input style={{ ...styles.input, marginTop: 6 }} placeholder='Title (jaise: 100% Virgin PVC)' value={newSpecTitle} onChange={(e) => setNewSpecTitle(e.target.value)} />
          <textarea style={{ ...styles.input, marginTop: 8, minHeight: 60, resize: 'vertical' }} placeholder='Detail (jaise: Termite-proof, waterproof, koi warping nahi)' value={newSpecDesc} onChange={(e) => setNewSpecDesc(e.target.value)} />
          <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={addMaterialSpec}><Plus size={14} /> Specification Add Karein</button>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <ThumbsUp size={16} color={BRAND.gold} />
          <div style={{ fontWeight: 800, fontSize: 14 }}>Hamare Saath Judne Ke Fayde</div>
        </div>
        <div style={styles.plainTextMuted}>Aapki company ke saath kaam karne ke benefits - customer ko same screen par dikhte hain.</div>
        {(companyBenefits || []).map((b, i) => (
          <div key={b.id} style={{ ...styles.formCard, marginTop: 10 }}>
            {editingBenefitId === b.id ? (
              <TitleDescEditForm item={b} onSave={(t, d) => updateCompanyBenefit(b.id, t, d)} onCancel={() => setEditingBenefitId(null)} />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.itemDesc}>{b.title}</div>
                    <div style={{ ...styles.itemSub, marginTop: 4 }}>{b.desc}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button style={styles.iconBtnSmall} onClick={() => moveCompanyBenefit(b.id, -1)} disabled={i === 0}><ChevronUp size={13} color='#B3B8C6' /></button>
                    <button style={styles.iconBtnSmall} onClick={() => moveCompanyBenefit(b.id, 1)} disabled={i === companyBenefits.length - 1}><ChevronDown size={13} color='#B3B8C6' /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => setEditingBenefitId(b.id)}><Edit3 size={12} /> Edit</button>
                  <button style={{ ...styles.cardActionBtn, flex: 1 }} onClick={() => removeCompanyBenefit(b.id)}><Trash2 size={12} /> Hataein</button>
                </div>
              </>
            )}
          </div>
        ))}
        <div style={{ ...styles.formCard, marginTop: 10, background: '#FFF9EE', borderColor: BRAND.gold }}>
          <div style={styles.fieldLabel}>Naya Benefit Add Karein</div>
          <input style={{ ...styles.input, marginTop: 6 }} placeholder='Title (jaise: 5+ Years Experience)' value={newBenefitTitle} onChange={(e) => setNewBenefitTitle(e.target.value)} />
          <textarea style={{ ...styles.input, marginTop: 8, minHeight: 60, resize: 'vertical' }} placeholder='Detail (jaise: 500+ khush customers poore Ahmedabad mein)' value={newBenefitDesc} onChange={(e) => setNewBenefitDesc(e.target.value)} />
          <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={addCompanyBenefit}><Plus size={14} /> Benefit Add Karein</button>
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

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed ' + BRAND.line }}>
          <div style={styles.fieldLabel}>Purani Photos Ke Liye Thumbnails Banayein</div>
          <div style={styles.plainTextMuted}>Naye upload ki photos automatically fast hoti hain, lekin purani photos ke liye ye ek baar chalana hoga - poori Gallery fast ho jayegi.</div>
          <button style={{ ...styles.addBtn, marginTop: 8 }} onClick={backfillThumbnails} disabled={backfillingThumbnails}>
            <Search size={14} /> {backfillingThumbnails ? (backfillProgress ? ('Ban rahi hain... (' + backfillProgress.done + '/' + backfillProgress.total + ')') : 'Shuru ho raha hai...') : 'Thumbnails Banayein'}
          </button>
          {backfillReport && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...styles.estimateStatusBanner, ...(backfillReport.failures.length === 0
                ? { background: '#E8F5E9', color: '#2E7D32' } : { background: '#FFF3E0', color: '#E65100' }) }}>
                {backfillReport.failures.length === 0
                  ? <><CheckCircle2 size={14} /> {backfillReport.made} thumbnail ban gaye - sab ho gaya</>
                  : <><AlertCircle size={14} /> {backfillReport.made}/{backfillReport.total} bane, {backfillReport.failures.length} nahi</>}
              </div>
              {/* Grouped by reason - one line per cause beats twelve
                  identical lines, and the cause is the part you act on. */}
              {Object.entries(backfillReport.failures.reduce((acc, f) => {
                (acc[f.reason] = acc[f.reason] || []).push(f); return acc;
              }, {})).map(([reason, list]) => (
                <div key={reason} style={{ ...styles.itemRow, marginTop: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.itemDesc}>{list.length} photo - {reason}</div>
                    <div style={styles.itemSub}>{list.slice(0, 6).map((f) => f.cat + (f.caption ? (' / ' + f.caption) : '')).join(', ')}{list.length > 6 ? (' +' + (list.length - 6) + ' aur') : ''}</div>
                  </div>
                </div>
              ))}
              {backfillReport.failures.length > 0 && (
                <div style={{ ...styles.plainTextMuted, marginTop: 8 }}>
                  Dobara chalane se yahi photos phir fail hongi - inhe theek karne ke liye upar wala "Poori App Check Karein" chalayein, ya ye photos gallery mein dobara upload karein. Baaki gallery par koi asar nahi, ye photos ab bhi dikhti hain - bas grid mein thodi dheere.
                </div>
              )}
            </div>
          )}
        </div>

        {pendingGalleryPhotos && pendingGalleryPhotos.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed ' + BRAND.line }}>
            <div style={styles.fieldLabel}>Regional Partner Ki Gallery Photos ({pendingGalleryPhotos.length})</div>
            <div style={styles.plainTextMuted}>Partner ne poore kiye kaam ki photos bheji hain - approve karne par hi customer-facing gallery mein dikhengi.</div>
            {pendingGalleryPhotos.map((p) => (
              <div key={p.id} style={{ ...styles.formCard, marginTop: 8 }}>
                <SmartImg src={p.url} origUrl={p.origUrl} alt={p.customerName} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 6 }} />
                <div style={{ ...styles.itemSub, marginTop: 6 }}>{p.category} - {p.submittedBy} ne bheja{p.customerName ? (' (' + p.customerName + ')') : ''}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => approveGalleryPhoto(p)}><CheckCircle2 size={13} /> Approve Karein</button>
                  <button style={styles.cancelBtn} onClick={() => rejectGalleryPhoto(p.id)}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}


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

      <DataCheckPanel gallery={gallery} showToast={showToast} />

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

export default AdminApp;
