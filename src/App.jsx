import React, { useState, useEffect, useCallback, useMemo } from String.fromCharCode(114,101,97,99,116);
import {
Calendar, Hammer, IndianRupee, Plus, X, Phone, User,
ChevronRight, ChevronLeft, Trash2, Edit3, Search, CheckCircle2,
Image as ImageIcon, Star, MessageSquare, Grid3x3, LogOut, ShieldCheck,
Camera, Send, ArrowLeft, SlidersHorizontal, Lock,
Home, Sparkles, AlertTriangle, Link2, Check, Package, FileText,
UserPlus, Users, Download, Eye, EyeOff, TrendingUp
} from ‘lucide-react’;

/* ===========================================================
Shree Krushn PVC Furniture — Full App v3
Brand: navy (#0F1B3D) + cream (#F8FAFB) + warm grey accent
=========================================================== */

const BRAND = {
navy: ‘#0F1B3D’,
navyLight: ‘#1D2E5C’,
cream: ‘#F8FAFB’,
paper: ‘#FFFFFF’,
line: ‘#E4E7EE’,
gold: ‘#A8975F’,
textMuted: ‘#7C8399’,
};

const CATEGORIES = [‘Kitchen’, ‘Wardrobe’, ‘Dressing Table’, ‘Bathroom Cabinet’, ‘TV Unit’, ‘Bed’, ‘Color/POP Work’, ‘Electrical Work’, ‘Other’];
const BHK_OPTIONS = [‘1 BHK’, ‘2 BHK’, ‘3 BHK’, ‘4 BHK’, ‘4+ BHK’, ‘Individual Room’, ‘Shop/Office’];
const EXPENSE_TYPES = [‘Karigar Payment’, ‘Material’, ‘Transport’, ‘Other’];

const STATUS = {
appointment: { label: ‘Appointment’, color: ‘#A8975F’, bg: ‘#F3EFE3’, icon: Calendar },
estimate: { label: ‘Estimate’, color: ‘#3D6B66’, bg: ‘#E1EDEA’, icon: Edit3 },
in_progress: { label: ‘In Progress’, color: ‘#B5562E’, bg: ‘#F7E3D8’, icon: Hammer },
delivered: { label: ‘Delivered’, color: ‘#1D2E5C’, bg: ‘#E1E5F0’, icon: Package },
paid: { label: ‘Paid’, color: ‘#2F7D4F’, bg: ‘#DFF0E4’, icon: CheckCircle2 },
};
const STATUS_ORDER = [‘appointment’, ‘estimate’, ‘in_progress’, ‘delivered’, ‘paid’];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const DEFAULT_PIN = ‘2580’;

function currency(n) {
const v = Number(n) || 0;
return ‘₹’ + v.toLocaleString(‘en-IN’, { maximumFractionDigits: 0 });
}
function formatDate(iso) {
if (!iso) return ‘’;
const d = new Date(iso);
if (isNaN(d)) return iso;
return d.toLocaleDateString(‘en-IN’, { day: ‘numeric’, month: ‘short’, year: ‘numeric’ });
}
function timeAgo(iso) {
if (!iso) return ‘’;
const diff = Date.now() - new Date(iso).getTime();
const min = Math.floor(diff / 60000);
if (min < 1) return ‘abhi’;
if (min < 60) return `${min}m pehle`;
const hr = Math.floor(min / 60);
if (hr < 24) return `${hr}h pehle`;
const day = Math.floor(hr / 24);
if (day < 7) return `${day}d pehle`;
return formatDate(iso);
}
const BUSINESS = {
name: ‘Shree Krushn PVC Furniture’,
tagline: ‘Premium PVC Interior Solutions’,
owner: ‘Ravi Vasoya’,
addressLine: ‘Nikol, Ahmedabad — Head Office’,
branches: [
{ city: ‘Ahmedabad’, contact: ‘Ravi Vasoya’, phone: ‘+91 79902 83116’ },
{ city: ‘Vadodara’, contact: ‘Sagar Patel’, phone: ‘+91 97268 63451’ },
],
phone: ‘+91 79902 83116’,
altPhone: ‘+91 95123 18775’,
website: ‘www.shreekrushnpvcfurniture.com’,
};

const ESTIMATE_TERMS = [
{
title: ‘Payment Terms’,
points: [
‘50% advance at the start of work’,
‘40% midway during work progress’,
‘10% on final completion’,
‘Payments are non-refundable after work confirmation’,
],
},
{
title: ‘Work Duration’,
points: [‘Estimated completion: 8–10 days (depending on work & site condition)’],
},
{
title: ‘Material’,
points: [
‘100% PVC Board (Waterproof & Termite-proof)’,
‘Kaka PVC 7kg core sheet’,
‘Standard company hardware fittings (Rajvanshi, Bansi, etc.)’,
‘PVC Laminate brands: Crystal, Orian, Hexa, Flexibond, Rama, Lionia (1mm–1.25mm)’,
‘Hardware: Heavy channels, SS hinges, soft-closing tandem units for kitchen’,
‘Sliding wardrobe: Soft-close sliding channel’,
‘Other: Standard heavy locks, glue Airfast/Fevikwik 502/Evobond adhesives’,
],
},
{ title: ‘Site Condition’, points: [‘Electricity, water & working space to be provided by client’] },
{
title: ‘Quotation Includes’,
points: [‘Design providing’, ‘Manufacturing & fixing of units’, ‘Material + labour + transportation charges included’],
},
{ title: ‘Extra Work’, points: [‘Any extra work or changes after confirmation will be charged separately’] },
{ title: ‘Warranty’, points: [‘5 years warranty on material (manufacturing defects only — varies by item & company)’] },
{ title: ‘GST’, points: [‘Prices are exclusive of GST’, ‘No GST added’] },
{
title: ‘Price Variation’,
points: [‘Given prices are tentative’, ‘Final quotation may change after design confirmation’, ‘Any high-end / expensive item is not included’],
},
];

function jobTotal(job) {
return (job.items || []).reduce((s, it) => s + estimateItemAmount(it), 0);
}
function jobPaid(job) {
return (job.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}
function jobDue(job) {
return Math.max(0, jobTotal(job) - jobPaid(job));
}
// Estimate item: either sq-ft based (length x height x rate) or a flat qty x rate line.
// sqft = (length * height) / 144 when length/height are in inches, matching the
// business’s real quotation sheet (e.g. 145 x 112 => 112.78 sq ft @ rate/sqft).
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

// Builds a plain-text WhatsApp-friendly summary of a job’s estimate —
// item list with sq-ft/amount, grand total, and a short terms line.
function buildEstimateWhatsAppText(job) {
const lines = [];
lines.push(`*${BUSINESS.name}*`);
lines.push(`Estimate for ${job.customerName}`);
lines.push(’’);
(job.items || []).forEach((it, i) => {
const sqft = estimateItemSqft(it);
const dims = sqft !== null ? ` (${it.length}'×${it.height}' = ${sqft.toFixed(2)} sqft)` : ‘’;
lines.push(`${i + 1}. ${it.desc}${dims} — ${currency(estimateItemAmount(it))}`);
});
lines.push(’’);
lines.push(`*Grand Total: ${currency(jobTotal(job))}*`);
const due = jobDue(job);
if (due > 0) lines.push(`Due: ${currency(due)}`);
lines.push(’’);
lines.push(‘Payment: 50% advance, 40% midway, 10% on completion.’);
lines.push(`${BUSINESS.phone} · ${BUSINESS.website}`);
return lines.join(’\n’);
}
function whatsAppShareUrl(phoneDigits10, text) {
const encoded = encodeURIComponent(text);
if (phoneDigits10) return `https://wa.me/91${phoneDigits10}?text=${encoded}`;
return `https://wa.me/?text=${encoded}`;
}

/* — Google Drive / common share-link -> direct image link converter —
Drive file IDs can be served by more than one Google host; some accounts /
sharing settings block one host but allow another, so we keep a list of
candidate URLs per input and let <SmartImg> fall through them in order. */
function extractDriveId(input) {
const url = input.trim();
let m = url.match(/drive.google.com/file/d/([^/]+)/);
if (m) return m[1];
m = url.match(/drive.google.com/open?id=([^&]+)/);
if (m) return m[1];
m = url.match(/drive.google.com/uc?id=([^&]+)/);
if (m) return m[1];
m = url.match(/[?&]id=([^&]+)/);
if (m && url.includes(‘drive.google.com’)) return m[1];
return null;
}
function toDirectImageUrl(input) {
const url = input.trim();
if (!url) return url;
const driveId = extractDriveId(url);
if (driveId) return `https://lh3.googleusercontent.com/d/${driveId}=w1000`;
if (url.includes(‘dropbox.com’) && url.includes(‘dl=0’)) return url.replace(‘dl=0’, ‘raw=1’);
return url;
}
// All URL forms worth trying for a given pasted link, in priority order.
function candidateImageUrls(input) {
const url = input.trim();
const driveId = extractDriveId(url);
if (driveId) {
return [
`https://lh3.googleusercontent.com/d/${driveId}=w1000`,
`https://drive.google.com/uc?export=view&id=${driveId}`,
`https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
];
}
if (url.includes(‘dropbox.com’) && url.includes(‘dl=0’)) return [url.replace(‘dl=0’, ‘raw=1’)];
return [url];
}
function isLikelyDriveLink(input) {
return /drive.google.com/.test(input);
}

/* — Device photo upload: reads a File, downsizes only if needed to stay
under the 5MB storage cap, and resolves a data-URI. Quality is kept as
high as possible — we only shrink dimensions/quality when the original
genuinely exceeds the limit, never as a blanket compression. — */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function fileToDataUri(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = () => resolve(reader.result);
reader.onerror = () => reject(reader.error);
reader.readAsDataURL(file);
});
}

function dataUriByteSize(dataUri) {
const base64 = dataUri.split(’,’)[1] || ‘’;
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
const canvas = document.createElement(‘canvas’);
canvas.width = Math.round(width);
canvas.height = Math.round(height);
const ctx = canvas.getContext(‘2d’);
ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
const out = canvas.toDataURL(‘image/jpeg’, quality);
if (dataUriByteSize(out) <= MAX_PHOTO_BYTES) return out;
// First reduce quality a couple of steps, then start shrinking dimensions.
if (attempt < 3) quality = Math.max(0.6, quality - 0.12);
else { width *= 0.85; height *= 0.85; }
}
// Last resort — return the smallest attempt even if still large.
const canvas = document.createElement(‘canvas’);
canvas.width = Math.round(width);
canvas.height = Math.round(height);
canvas.getContext(‘2d’).drawImage(img, 0, 0, canvas.width, canvas.height);
return canvas.toDataURL(‘image/jpeg’, 0.6);
}

const emptyJob = (customerId, customerName, phone) => ({
id: uid(),
customerId,               // <- every job is permanently pinned to ONE customer
customerName,
phone,
address: ‘’,
status: ‘appointment’,
appointmentDate: ‘’,
notes: ‘’,
appointment: null,        // { preferredDate, preferredTime, address, purpose, notes, status, confirmedDate, confirmedTime, requestedAt }
requirements: [],
items: [],
payments: [],
progressPhotos: [],
review: null,
activity: [{ id: uid(), text: ‘Job created’, date: new Date().toISOString() }],
createdAt: new Date().toISOString(),
});

const APPT_STATUS = {
none: { label: ‘Not Requested’, color: ‘#7C8399’, bg: ‘#EEF0F5’ },
requested: { label: ‘Requested’, color: ‘#A8975F’, bg: ‘#F3EFE3’ },
confirmed: { label: ‘Confirmed’, color: ‘#2F7D4F’, bg: ‘#DFF0E4’ },
rescheduled: { label: ‘Rescheduled’, color: ‘#B5562E’, bg: ‘#F7E3D8’ },
completed: { label: ‘Completed’, color: ‘#1D2E5C’, bg: ‘#E1E5F0’ },
};

function logActivity(job, text) {
return { …job, activity: [{ id: uid(), text, date: new Date().toISOString() }, …(job.activity || [])].slice(0, 40) };
}

/* — SmartImg: tries the stored URL, then falls back through alternate
Drive host formats derived from the ORIGINAL pasted link if one is stored
on the item (origUrl). Shows a clear broken-image state instead of a
silent blank box when every candidate fails. — */
function SmartImg({ src, origUrl, alt, style, onError: onErrorProp }) {
const candidates = React.useMemo(() => {
const list = origUrl ? candidateImageUrls(origUrl) : [src];
return list.includes(src) ? list : [src, …list];
}, [src, origUrl]);
const [idx, setIdx] = useState(0);
const [failed, setFailed] = useState(false);

useEffect(() => { setIdx(0); setFailed(false); }, [src, origUrl]);

if (failed) {
return (
<div style={{ …style, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, justifyContent: ‘center’, background: ‘#EEF0F5’, gap: 4, padding: 6, boxSizing: ‘border-box’ }}>
<ImageIcon size={16} color='#B3B8C6' />
<span style={{ fontSize: 8.5, color: ‘#B3B8C6’, fontWeight: 700, textAlign: ‘center’ }}>Load nahi hui</span>
</div>
);
}

return (
<img
src={candidates[idx]}
alt={alt}
style={style}
loading=‘lazy’
onError={() => {
if (idx < candidates.length - 1) setIdx(idx + 1);
else { setFailed(true); if (onErrorProp) onErrorProp(); }
}}
/>
);
}

/* –– Brochure PDFs: category-wise catalog documents. Metadata
({id, name, category, sizeKb}) lives in the small ‘brochures’ list;
actual PDF bytes are fetched from storage on demand (key
‘brochure_data_<id>’) only when the user opens/downloads one, since
loading every PDF up front would be wasteful. –– */
function openOrDownloadPdf(dataUri, filename) {
try {
const a = document.createElement(‘a’);
a.href = dataUri;
a.download = filename.endsWith(’.pdf’) ? filename : `${filename}.pdf`;
a.target = ‘_blank’;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
return true;
} catch (e) {
return false;
}
}

function BrochureList({ brochures, showToast, canManage, onDelete }) {
const [loadingId, setLoadingId] = useState(null);
const grouped = useMemo(() => {
const g = {};
(brochures || []).forEach((b) => {
const cat = b.category || ‘Other’;
if (!g[cat]) g[cat] = [];
g[cat].push(b);
});
return g;
}, [brochures]);

const openBrochure = async (b) => {
setLoadingId(b.id);
try {
const res = await window.storage.get(`brochure_data_${b.id}`, true);
if (!res || !res.value) { showToast(‘Brochure load nahi hui’, true); return; }
const ok = openOrDownloadPdf(res.value, b.name);
if (!ok) showToast(‘Brochure open nahi ho payi’, true);
} catch (e) {
showToast(‘Brochure load nahi hui’, true);
} finally {
setLoadingId(null);
}
};

if (!brochures || brochures.length === 0) {
return <div style={styles.emptySmall}>Abhi koi brochure upload nahi hui.</div>;
}

return (
<div>
{Object.entries(grouped).map(([cat, list]) => (
<div key={cat} style={{ marginBottom: 14 }}>
<div style={styles.reqGroupHeader}>{cat}</div>
{list.map((b) => (
<div key={b.id} style={styles.brochureRow}>
<div style={styles.brochureIcon}><FileText size={16} color={BRAND.gold} /></div>
<div style={{ flex: 1, minWidth: 0 }}>
<div style={styles.itemDesc}>{b.name}</div>
<div style={styles.itemSub}>{b.sizeKb ? `${b.sizeKb} KB` : ‘’}</div>
</div>
<button style={styles.brochureOpenBtn} onClick={() => openBrochure(b)} disabled={loadingId === b.id}>
{loadingId === b.id ? ‘…’ : <Download size={13} />}
</button>
{canManage && (
<button style={styles.iconBtnSmall} onClick={() => onDelete(b.id)}><Trash2 size={14} color='#C7CCDC' /></button>
)}
</div>
))}
</div>
))}
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
const [partnerPin, setPartnerPin] = useState(’’);
const [staff, setStaff] = useState([]);
const [expenses, setExpenses] = useState([]);
const [appointmentItemOptions, setAppointmentItemOptions] = useState(CATEGORIES);
const [brochures, setBrochures] = useState([]);
const [session, setSession] = useState(null);
const [toast, setToast] = useState(null);

useEffect(() => {
(async () => {
try {
const [g, c, j, p, st, exp, pp, aio, br] = await Promise.all([
safeGet(‘gallery’), safeGet(‘customers’), safeGet(‘jobs’), safeGet(‘admin_pin’), safeGet(‘staff’),
safeGet(‘expenses’), safeGet(‘partner_pin’), safeGet(‘appointment_item_options’), safeGet(‘brochures’),
]);
if (g) setGallery(JSON.parse(g));
if (c) setCustomers(JSON.parse(c));
if (j) setJobs(JSON.parse(j));
if (p) setAdminPin(p);
if (st) setStaff(JSON.parse(st));
if (exp) setExpenses(JSON.parse(exp));
if (pp) setPartnerPin(pp);
if (aio) setAppointmentItemOptions(JSON.parse(aio));
if (br) setBrochures(JSON.parse(br));
} finally {
setLoaded(true);
}
})();
}, []);

async function safeGet(key) {
try {
const res = await window.storage.get(key, true);
return res ? res.value : null;
} catch (e) { return null; }
}

const showToast = (msg, isError) => {
setToast({ msg, isError, id: uid() });
setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 2400);
};

const persistGallery = useCallback(async (next) => {
setGallery(next);
try { await window.storage.set(‘gallery’, JSON.stringify(next), true); }
catch (e) { showToast(‘Save failed — connection check karein’, true); }
}, []);
const persistCustomers = useCallback(async (next) => {
setCustomers(next);
try { await window.storage.set(‘customers’, JSON.stringify(next), true); }
catch (e) { showToast(‘Save failed’, true); }
}, []);
const persistJobs = useCallback(async (next) => {
setJobs(next);
try { await window.storage.set(‘jobs’, JSON.stringify(next), true); }
catch (e) { showToast(‘Save failed’, true); }
}, []);
const persistPin = useCallback(async (pin) => {
setAdminPin(pin);
try { await window.storage.set(‘admin_pin’, pin, true); }
catch (e) { showToast(‘PIN save failed’, true); }
}, []);
const persistPartnerPin = useCallback(async (pin) => {
setPartnerPin(pin);
try { await window.storage.set(‘partner_pin’, pin, true); }
catch (e) { showToast(‘Partner PIN save failed’, true); }
}, []);
const persistExpenses = useCallback(async (next) => {
setExpenses(next);
try { await window.storage.set(‘expenses’, JSON.stringify(next), true); }
catch (e) { showToast(‘Save failed’, true); }
}, []);
const persistAppointmentItemOptions = useCallback(async (next) => {
setAppointmentItemOptions(next);
try { await window.storage.set(‘appointment_item_options’, JSON.stringify(next), true); }
catch (e) { showToast(‘Save failed’, true); }
}, []);
// Brochure PDFs: metadata list is small and stored under ‘brochures’; each
// PDF’s actual base64 data is stored under its own key (‘brochure_data_<id>’)
// since a single PDF can approach the 5MB per-key cap on its own.
const persistBrochureList = useCallback(async (next) => {
setBrochures(next);
try { await window.storage.set(‘brochures’, JSON.stringify(next), true); }
catch (e) { showToast(‘Save failed’, true); }
}, []);
const addBrochure = useCallback(async (meta, dataUri) => {
try {
await window.storage.set(`brochure_data_${meta.id}`, dataUri, true);
const next = [meta, …brochures];
setBrochures(next);
await window.storage.set(‘brochures’, JSON.stringify(next), true);
return true;
} catch (e) {
showToast(‘Brochure save failed — file bahut badi ho sakti hai’, true);
return false;
}
}, [brochures]);
const removeBrochure = useCallback(async (id) => {
const next = brochures.filter((b) => b.id !== id);
setBrochures(next);
try {
await window.storage.set(‘brochures’, JSON.stringify(next), true);
await window.storage.delete(`brochure_data_${id}`, true);
} catch (e) { /* best effort */ }
}, [brochures]);
const persistStaff = useCallback(async (next) => {
setStaff(next);
try { await window.storage.set(‘staff’, JSON.stringify(next), true); }
catch (e) { showToast(‘Staff save failed’, true); }
}, []);

if (!loaded) {
return (
<div style={styles.app}>
<style>{fontImport}</style>
<div style={styles.loadingScreen}>
<Logo size={52} />
<div style={{ marginTop: 10, fontWeight: 700, fontSize: 12.5, color: BRAND.textMuted }}>Loading…</div>
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
onCustomerLogin={(customerId) => setSession({ role: ‘customer’, customerId })}
onRegister={(cust) => {
const next = [cust, …customers];
persistCustomers(next);
const job = emptyJob(cust.id, cust.name, cust.phone);
persistJobs([job, …jobs]);
setSession({ role: ‘customer’, customerId: cust.id });
showToast(`Registered! Welcome ${cust.name}`);
}}
onAdminLogin={(staffName, role) => setSession({ role: role || ‘admin’, staffName })}
/>
<ToastEl toast={toast} />
</div>
);
}

if (session.role === ‘admin’ || session.role === ‘partner’) {
const isPartner = session.role === ‘partner’;
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
brochures={brochures} addBrochure={addBrochure} removeBrochure={removeBrochure}
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

// –– CUSTOMER SESSION ––
// Strict isolation: a customer session only ever resolves ITS OWN customer
// record and the ONE job row whose customerId matches the logged-in id.
// No list of other customers, no other job, is ever passed into CustomerApp.
const myCustomerId = session.customerId;
const customer = customers.find((c) => c.id === myCustomerId) || null;
const myJob = jobs.find((j) => j.customerId === myCustomerId) || emptyJob(myCustomerId, customer?.name, customer?.phone);

return (
<div style={styles.app}>
<style>{fontImport}</style>
<CustomerApp
customer={customer}
gallery={gallery}
job={myJob}
appointmentItemOptions={appointmentItemOptions}
brochures={brochures}
onSaveJob={(j) => {
if (j.customerId !== myCustomerId) return; // guard: never allow writing another customer’s job
const exists = jobs.some((jj) => jj.id === j.id);
const next = exists ? jobs.map((jj) => (jj.id === j.id ? j : jj)) : [j, …jobs];
persistJobs(next);
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
<div key={toast.id} style={{ …styles.toast, background: toast.isError ? ‘#B5562E’ : BRAND.navy }}>
{toast.msg}
</div>
);
}

const LOGO_DATA_URI = ‘data:image/jpeg;base64,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’;

/* — Logo mark: the actual Shree Krushn PVC Furniture badge artwork — */
function Logo({ size = 40 }) {
return (
<img
src={LOGO_DATA_URI}
alt=‘Shree Krushn PVC Furniture’
style={{ width: size, height: size, objectFit: ‘contain’, flexShrink: 0, display: ‘block’ }}
/>
);
}

/* ===================== LOGIN / REGISTER ===================== */
// Validates & normalizes an Indian mobile number to a bare 10-digit string.
// Accepts optional +91 / 91 / 0 prefix and spaces/dashes; rejects anything
// that isn’t a real 10-digit number starting 6-9 (landlines, short/garbled
// input, repeated-digit junk like 0000000000).
function normalizeIndianPhone(raw) {
let digits = (raw || ‘’).replace(/\D/g, ‘’);
if (digits.length === 12 && digits.startsWith(‘91’)) digits = digits.slice(2);
else if (digits.length === 11 && digits.startsWith(‘0’)) digits = digits.slice(1);
if (digits.length !== 10) return null;
if (!/^[6-9]\d{9}$/.test(digits)) return null;
if (/^(\d)\1{9}$/.test(digits)) return null; // all same digit
return digits;
}
function formatPhoneDisplay(digits10) {
if (!digits10 || digits10.length !== 10) return digits10 || ‘’;
return `+91 ${digits10.slice(0, 5)} ${digits10.slice(5)}`;
}

function LoginScreen({ customers, adminPin, partnerPin, staff, onCustomerLogin, onRegister, onAdminLogin }) {
const [mode, setMode] = useState(‘choose’);
const [name, setName] = useState(’’);
const [phone, setPhone] = useState(’’);
const [pin, setPin] = useState(’’);
const [error, setError] = useState(’’);

// OTP verification state — shared by both register and login flows.
const [otpStage, setOtpStage] = useState(false); // false | ‘register’ | ‘login’
const [sentOtp, setSentOtp] = useState(’’);
const [otpInput, setOtpInput] = useState(’’);
const [pendingPhone, setPendingPhone] = useState(’’);

const sendOtp = (forMode) => {
const normalized = normalizeIndianPhone(phone);
if (forMode === ‘register’ && !name.trim()) { setError(‘Naam daalein’); return; }
if (!normalized) { setError(‘Sahi 10-digit mobile number daalein (jaise 98765 43210)’); return; }
if (forMode === ‘login’) {
const found = customers.find((c) => c.phone === normalized);
if (!found) { setError(‘Ye number register nahi hai. Pehle register karein.’); return; }
}
if (forMode === ‘register’) {
const existing = customers.find((c) => c.phone === normalized);
if (existing) { onCustomerLogin(existing.id); return; }
}
const code = String(Math.floor(1000 + Math.random() * 9000));
setSentOtp(code);
setPendingPhone(normalized);
setOtpInput(’’);
setError(’’);
setOtpStage(forMode);
};

const verifyOtp = () => {
if (otpInput.trim() !== sentOtp) { setError(‘Galat OTP — dobara check karein’); return; }
if (otpStage === ‘register’) {
onRegister({ id: uid(), name: name.trim(), phone: pendingPhone, phoneVerified: true, createdAt: new Date().toISOString() });
} else {
const found = customers.find((c) => c.phone === pendingPhone);
if (found) onCustomerLogin(found.id);
}
};

const resendOtp = () => {
const code = String(Math.floor(1000 + Math.random() * 9000));
setSentOtp(code);
setOtpInput(’’);
setError(’’);
};

const backFromOtp = () => {
setOtpStage(false);
setSentOtp(’’);
setOtpInput(’’);
setError(’’);
};

const doAdmin = () => {
if (pin === adminPin) { onAdminLogin(‘Admin’, ‘admin’); return; }
if (partnerPin && pin === partnerPin) { onAdminLogin(‘Partner’, ‘partner’); return; }
const staffMatch = (staff || []).find((s) => s.pin === pin);
if (staffMatch) { onAdminLogin(staffMatch.name, ‘admin’); return; }
setError(‘Galat PIN’);
};

return (
<div style={styles.loginWrap}>
<div style={styles.loginBgAccent} />
<div style={styles.loginBrand}>
<Logo size={64} />
<div style={styles.brandName}>SHREE KRUSHN</div>
<div style={styles.brandNameSub}>PVC FURNITURE</div>
<div style={styles.brandSub}>Design gallery · Requirements · Live work tracking</div>
</div>

```
  {otpStage && (
    <div style={styles.loginCard}>
      <div style={styles.fieldLabel}>Verify OTP</div>
      <div style={styles.plainTextMuted}>{formatPhoneDisplay(pendingPhone)} par bheja gaya code daalein</div>
      <div style={styles.otpDemoBox}>
        <ShieldCheck size={13} color={BRAND.gold} />
        <span>Demo mode — real SMS nahi jaata. Aapka OTP: <b>{sentOtp}</b></span>
      </div>
      <input
        style={{ ...styles.input, marginTop: 10, textAlign: 'center', fontSize: 20, letterSpacing: 6, fontWeight: 800 }}
        value={otpInput}
        onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
        placeholder='0000'
        inputMode='numeric'
        maxLength={4}
        autoFocus
      />
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={verifyOtp}>Verify &amp; Continue</button>
      <button style={styles.linkBtn2} onClick={resendOtp}>OTP dobara bhejein</button>
      <button style={styles.backLink} onClick={backFromOtp}><ArrowLeft size={13} /> Back</button>
    </div>
  )}
``````
  {!otpStage && mode === 'choose' && (
    <div style={styles.loginCard}>
      <button style={styles.primaryBtn} onClick={() => setMode('register')}>
        <Sparkles size={15} /> Naye Customer — Register karein
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
      <input style={styles.input} value={phone} onChange={(e) => { const v = e.target.value.replace(/[^0-9+ ]/g, '').slice(0, 14); setPhone(v); setError(''); }} placeholder='98765 43210' inputMode='tel' maxLength={14} />
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={() => sendOtp('register')}>Send OTP</button>
      <button style={styles.backLink} onClick={() => setMode('choose')}><ArrowLeft size={13} /> Back</button>
    </div>
  )}

  {!otpStage && mode === 'login' && (
    <div style={styles.loginCard}>
      <div style={styles.fieldLabel}>Registered phone number</div>
      <input style={styles.input} value={phone} onChange={(e) => { const v = e.target.value.replace(/[^0-9+ ]/g, '').slice(0, 14); setPhone(v); setError(''); }} placeholder='98765 43210' inputMode='tel' maxLength={14} autoFocus />
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={() => sendOtp('login')}>Send OTP</button>
      <button style={styles.backLink} onClick={() => setMode('choose')}><ArrowLeft size={13} /> Back</button>
    </div>
  )}

  {!otpStage && mode === 'admin' && (
    <div style={styles.loginCard}>
      <div style={styles.fieldLabel}>Admin PIN</div>
      <input style={styles.input} value={pin} onChange={(e) => { setPin(e.target.value); setError(''); }} placeholder='••••' inputMode='numeric' type='password' autoFocus />
      {error && <div style={styles.errorText}>{error}</div>}
      <button style={{ ...styles.primaryBtn, marginTop: 16 }} onClick={doAdmin}>Enter Admin Panel</button>
      <button style={styles.backLink} onClick={() => setMode('choose')}><ArrowLeft size={13} /> Back</button>
    </div>
  )}
</div>
```

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

function TopBar({ title, subtitle, onLogout, onBack, right }) {
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
<div style={{ display: ‘flex’, gap: 6, alignItems: ‘center’ }}>
{right}
<button style={styles.logoutBtn} onClick={onLogout}><LogOut size={15} /></button>
</div>
</div>
);
}

function BottomNav({ tab, setTab, items }) {
return (
<div style={styles.bottomNav}>
{items.map((it) => (
<button key={it.key} onClick={() => setTab(it.key)} style={{ …styles.navBtn, color: tab === it.key ? BRAND.navy : ‘#B3B8C6’ }}>
<div style={{ position: ‘relative’ }}>{it.icon}</div>
<span style={{ …styles.navLabel, fontWeight: tab === it.key ? 800 : 600 }}>{it.label}</span>
{tab === it.key && <div style={styles.navIndicator} />}
</button>
))}
</div>
);
}

function MoneyBit({ label, value, muted, highlight }) {
return (
<div style={{ textAlign: ‘center’ }}>
<div style={styles.moneyLabel}>{label}</div>
<div style={{ …styles.moneyValue, color: highlight ? ‘#B5562E’ : muted ? BRAND.textMuted : BRAND.navy }}>{value}</div>
</div>
);
}
function StatCard({ icon, label, value, accent, onClick }) {
const Comp = onClick ? ‘button’ : ‘div’;
return (
<Comp style={{ …styles.statCard, …(accent ? { borderColor: BRAND.gold } : {}), …(onClick ? { cursor: ‘pointer’, fontFamily: ‘inherit’ } : {}) }} onClick={onClick}>
<div style={{ …styles.statIcon, color: accent ? BRAND.gold : BRAND.navy }}>{icon}</div>
<div style={styles.statValue}>{value}</div>
<div style={styles.statLabel}>{label}</div>
</Comp>
);
}
function StageBadge({ status, size }) {
const st = STATUS[status] || STATUS.appointment;
const Icon = st.icon;
return (
<span style={{ …styles.badge, background: st.bg, color: st.color, fontSize: size === ‘sm’ ? 9.5 : 10.5 }}>
<Icon size={10} /> {st.label}
</span>
);
}

/* ===================== CUSTOMER APP ===================== */
/* Everything below receives ONLY this one customer’s data — never a list of others. */
function CustomerApp({ customer, gallery, job, appointmentItemOptions, brochures, onSaveJob, onLogout, showToast }) {
const [tab, setTab] = useState(‘home’);

return (
<div style={{ paddingBottom: 74 }}>
<TopBar title={customer?.name || ‘Customer’} subtitle=‘Shree Krushn PVC Furniture’ onLogout={onLogout} />

```
  {tab === 'home' && <CustomerHome job={job} customer={customer} setTab={setTab} />}
  {tab === 'appointment' && <AppointmentPanel job={job} onSave={onSaveJob} showToast={showToast} itemOptions={appointmentItemOptions} />}
  {tab === 'gallery' && <GalleryBrowser gallery={gallery} brochures={brochures} showToast={showToast} />}
  {tab === 'requirements' && <RequirementsPanel job={job} onSave={onSaveJob} showToast={showToast} />}
  {tab === 'progress' && <ProgressView job={job} />}
  {tab === 'review' && <ReviewPanel job={job} onSave={onSaveJob} showToast={showToast} />}

  <BottomNav
    tab={tab} setTab={setTab}
    items={[
      { key: 'home', label: 'Home', icon: <Home size={18} /> },
      { key: 'appointment', label: 'Visit', icon: <Calendar size={18} /> },
      { key: 'gallery', label: 'Designs', icon: <Grid3x3 size={18} /> },
      { key: 'requirements', label: 'Needs', icon: <Edit3 size={18} /> },
      { key: 'progress', label: 'Progress', icon: <Hammer size={18} /> },
      { key: 'review', label: 'Review', icon: <Star size={18} /> },
    ]}
  />
</div>
```

);
}

function CustomerHome({ job, customer, setTab }) {
const st = STATUS[job.status] || STATUS.appointment;
const total = jobTotal(job);
const due = jobDue(job);
const curIdx = STATUS_ORDER.indexOf(job.status);
const pct = Math.round(((curIdx + 1) / STATUS_ORDER.length) * 100);

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.heroCard}>
<div style={styles.heroTop}>
<div>
<div style={styles.heroGreeting}>Namaste, {customer?.name?.split(’ ‘)[0] || ‘Customer’} 👋</div>
<div style={styles.heroSub}>Aapke order ki current stage</div>
</div>
<StageBadge status={job.status} />
</div>
<div style={styles.progressTrack}>
<div style={{ …styles.progressFill, width: `${pct}%`, background: BRAND.gold }} />
</div>
<div style={styles.progressLabels}>
{STATUS_ORDER.map((s, i) => (
<span key={s} style={{ fontWeight: i <= curIdx ? 800 : 600, color: i <= curIdx ? ‘#FDFCF8’ : ‘#5A6690’ }}>
{STATUS[s].label.split(’ ’)[0]}
</span>
))}
</div>
</div>

```
  {total > 0 && (
    <div style={styles.payStrip}>
      <MoneyBit label='Estimate Total' value={currency(total)} />
      <MoneyBit label='Paid' value={currency(jobPaid(job))} muted />
      <MoneyBit label='Due' value={currency(due)} highlight={due > 0} />
    </div>
  )}

  <div style={styles.quickGrid}>
    <QuickTile icon={<Calendar size={20} color={BRAND.navy} />} label='Book Visit' onClick={() => setTab('appointment')} />
    <QuickTile icon={<Grid3x3 size={20} color={BRAND.navy} />} label='Browse Designs' onClick={() => setTab('gallery')} />
    <QuickTile icon={<Edit3 size={20} color={BRAND.navy} />} label='Add Requirement' onClick={() => setTab('requirements')} />
    <QuickTile icon={<Hammer size={20} color={BRAND.navy} />} label='Work Progress' onClick={() => setTab('progress')} />
  </div>

  <div style={styles.fieldLabel}>Recent activity</div>
  {(job.activity || []).length === 0 && <div style={styles.emptySmall}>Koi activity abhi tak nahi.</div>}
  <div style={styles.activityList}>
    {(job.activity || []).slice(0, 6).map((a) => (
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
```

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

/* –– Gallery browser –– */
function GalleryBrowser({ gallery, brochures, showToast }) {
const [activeCat, setActiveCat] = useState(null);
const [lightbox, setLightbox] = useState(null);
const [showBrochures, setShowBrochures] = useState(false);

if (activeCat) {
const photos = gallery[activeCat] || [];
return (
<div style={{ padding: ‘12px 16px’ }}>
<button style={styles.backLink} onClick={() => setActiveCat(null)}><ArrowLeft size={13} /> All categories</button>
<div style={styles.catTitle}>{activeCat} <span style={styles.catCount}>({photos.length})</span></div>
{photos.length === 0 && (
<div style={styles.emptyBlock}>
<ImageIcon size={26} color='#C7CCDC' />
<p style={styles.emptyBlockText}>Is category mein abhi koi photo nahi hai.</p>
</div>
)}
<div style={styles.photoGrid}>
{photos.map((p, i) => (
<button key={p.id} style={styles.photoThumb} onClick={() => setLightbox({ photos, index: i })}>
<SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption || activeCat} style={styles.photoImg} />
</button>
))}
</div>
{lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
</div>
);
}

const totalPhotos = CATEGORIES.reduce((s, c) => s + (gallery[c] || []).length, 0);

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Design Gallery</div>
<div style={styles.plainTextMuted}>{totalPhotos} designs across {CATEGORIES.length} categories</div>

```
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

  <div style={styles.catGrid}>
    {CATEGORIES.map((cat) => {
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
```

);
}

function Lightbox({ data, onClose, setLightbox }) {
const { photos, index } = data;
const photo = photos[index];
const go = (dir) => setLightbox({ photos, index: (index + dir + photos.length) % photos.length });
return (
<div style={styles.lightboxOverlay} onClick={onClose}>
<button style={styles.lightboxClose} onClick={onClose}><X size={22} color='#FFF' /></button>
<div style={styles.lightboxCounter}>{index + 1} / {photos.length}</div>
{photos.length > 1 && (
<button style={{ …styles.lightboxNav, left: 8 }} onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft size={26} color='#FFF' /></button>
)}
<div onClick={(e) => e.stopPropagation()}>
<SmartImg src={photo.url} origUrl={photo.origUrl} alt={photo.caption} style={styles.lightboxImg} />
</div>
{photos.length > 1 && (
<button style={{ …styles.lightboxNav, right: 8 }} onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight size={26} color='#FFF' /></button>
)}
{photo.caption && <div style={styles.lightboxCaption}>{photo.caption}</div>}
</div>
);
}

/* –– Appointment: customer requests a home/showroom visit with full
professional details; admin confirms/reschedules on their side. –– */
const APPT_PURPOSES = [‘Site measurement’, ‘Design consultation’, ‘Showroom visit’, ‘Installation visit’, ‘Other’];

function AppointmentPanel({ job, onSave, showToast, itemOptions }) {
const appt = job.appointment;
const [editing, setEditing] = useState(!appt);
const [form, setForm] = useState({
preferredDate: appt?.preferredDate || ‘’,
preferredTime: appt?.preferredTime || ‘’,
purpose: appt?.purpose || APPT_PURPOSES[0],
bhk: appt?.bhk || ‘’,
items: appt?.items || [],
address: appt?.address || job.address || ‘’,
notes: appt?.notes || ‘’,
});

const set = (k, v) => setForm((f) => ({ …f, [k]: v }));
const toggleItem = (cat) => {
setForm((f) => ({
…f,
items: f.items.includes(cat) ? f.items.filter((c) => c !== cat) : […f.items, cat],
}));
};
const canSubmit = form.preferredDate && form.address.trim();

const submit = () => {
if (!canSubmit) { showToast(‘Date aur address zaroori hai’, true); return; }
const nextAppt = {
…form,
status: ‘requested’,
requestedAt: new Date().toISOString(),
confirmedDate: null,
confirmedTime: null,
};
let next = { …job, appointment: nextAppt, address: form.address.trim() };
const itemsNote = form.items.length ? ` — ${form.items.join(', ')}` : ‘’;
next = logActivity(next, `Appointment requested: ${formatDate(form.preferredDate)}${form.preferredTime ? ', ' + form.preferredTime : ''}${itemsNote}`);
onSave(next);
setEditing(false);
showToast(‘Appointment request bhej di gayi’);
};

const st = appt ? (APPT_STATUS[appt.status] || APPT_STATUS.requested) : APPT_STATUS.none;

if (!editing && appt) {
return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Appointment / Visit</div>
<div style={styles.apptCard}>
<div style={{ display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘flex-start’ }}>
<div style={styles.fieldLabel}>Status</div>
<span style={{ …styles.badge, background: st.bg, color: st.color }}>{st.label}</span>
</div>

```
      {appt.status === 'confirmed' || appt.status === 'rescheduled' ? (
        <div style={styles.apptConfirmedBlock}>
          <Calendar size={16} color={BRAND.navy} />
          <div>
            <div style={styles.apptConfirmedDate}>{formatDate(appt.confirmedDate)} {appt.confirmedTime && `· ${appt.confirmedTime}`}</div>
            <div style={styles.itemSub}>Admin ne confirm ki hai</div>
          </div>
        </div>
      ) : (
        <div style={styles.apptRow}>
          <span style={styles.apptRowLabel}>Preferred</span>
          <span style={styles.apptRowValue}>{formatDate(appt.preferredDate)} {appt.preferredTime && `· ${appt.preferredTime}`}</span>
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

      <button style={styles.linkBtn2} onClick={() => setEditing(true)}>
        <Edit3 size={12} style={{ marginRight: 4 }} /> Request naya / edit karein
      </button>
    </div>
  </div>
);
```

}

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Appointment Book Karein</div>
<div style={styles.plainTextMuted}>Site visit ya consultation ke liye apni details batayein.</div>

```
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
      {(itemOptions || CATEGORIES).map((cat) => {
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
    <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder='Poora address — house/flat no, area, landmark, city' />

    <div style={{ ...styles.fieldLabel, marginTop: 14 }}>Extra notes</div>
    <textarea style={{ ...styles.input, minHeight: 60, resize: 'vertical' }} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder='Koi special instructions...' />

    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={submit}><Send size={14} /> Send Request</button>
      {appt && <button style={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>}
    </div>
  </div>
</div>
```

);
}

/* –– Requirements: simplified single-step flow –– */
const REQ_PRIORITY = { high: { label: ‘Urgent’, color: ‘#B5562E’, bg: ‘#F7E3D8’ }, normal: { label: ‘Normal’, color: ‘#A8975F’, bg: ‘#F3EFE3’ }, low: { label: ‘Flexible’, color: ‘#3D6B66’, bg: ‘#E1EDEA’ } };

function RequirementsPanel({ job, onSave, showToast }) {
const [category, setCategory] = useState(CATEGORIES[0]);
const [text, setText] = useState(’’);
const [dimensions, setDimensions] = useState(’’);
const [priority, setPriority] = useState(‘normal’);
const [showForm, setShowForm] = useState((job.requirements || []).length === 0);

const add = () => {
if (!text.trim()) return;
const req = { id: uid(), category, text: text.trim(), dimensions: dimensions.trim(), priority, createdAt: new Date().toISOString() };
let next = { …job, requirements: [req, …(job.requirements || [])] };
next = logActivity(next, `Requirement added: ${category}`);
onSave(next);
setText(’’); setDimensions(’’); setPriority(‘normal’);
setShowForm(false);
showToast(‘Requirement added’);
};
const remove = (id) => onSave({ …job, requirements: (job.requirements || []).filter((r) => r.id !== id) });

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
<div style={{ padding: ‘12px 16px’ }}>
<div style={{ display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘center’ }}>
<div>
<div style={styles.sectionTitle}>Aapki Requirements</div>
<div style={styles.plainTextMuted}>Furniture mein kya banana hai, detail mein batayein</div>
</div>
{!showForm && (
<button style={styles.roundAddBtn} onClick={() => setShowForm(true)}><Plus size={18} color='#FFF' /></button>
)}
</div>

```
  {showForm && (
    <div style={styles.formCard}>
      <div style={styles.fieldLabel}>Category select karein</div>
      <div style={styles.chipRow}>
        {CATEGORIES.map((c) => (
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
        <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={add}><Plus size={14} /> Add</button>
        {(job.requirements || []).length > 0 && (
          <button style={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
        )}
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
</div>
```

);
}

/* –– Progress view –– */
function ProgressView({ job }) {
const total = jobTotal(job);
const paid = jobPaid(job);
const due = jobDue(job);
const [lightbox, setLightbox] = useState(null);
const [showQuote, setShowQuote] = useState(false);
const photos = job.progressPhotos || [];

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Work Progress</div>
<div style={styles.stageGridRead}>
{STATUS_ORDER.map((s) => {
const idx = STATUS_ORDER.indexOf(s);
const curIdx = STATUS_ORDER.indexOf(job.status);
const done = idx <= curIdx;
const Icon = STATUS[s].icon;
return (
<div key={s} style={{ …styles.progressStep, opacity: done ? 1 : 0.45 }}>
<div style={{ …styles.progressDot, background: done ? STATUS[s].color : ‘#D7DAE5’ }}>
<Icon size={12} color='#FFF' />
</div>
<span style={{ fontWeight: done ? 800 : 600 }}>{STATUS[s].label}</span>
{done && idx === curIdx && <span style={styles.currentTag}>current</span>}
</div>
);
})}
</div>

```
  {total > 0 && (
    <div style={styles.payStrip}>
      <MoneyBit label='Total' value={currency(total)} />
      <MoneyBit label='Paid' value={currency(paid)} muted />
      <MoneyBit label='Due' value={currency(due)} highlight={due > 0} />
    </div>
  )}

  {(job.items || []).length > 0 && (
    <button style={styles.viewQuoteBtn} onClick={() => setShowQuote(true)}>
      <FileText size={14} /> View Full Estimate / Quotation
    </button>
  )}
  {showQuote && <QuotationPreview job={job} onClose={() => setShowQuote(false)} />}

  <div style={{ ...styles.fieldLabel, marginTop: 20 }}>Progress Photos ({photos.length})</div>
  {photos.length === 0 && <div style={styles.emptySmall}>Kaam shuru hone ke baad yahan progress photos dikhengi.</div>}
  <div style={styles.photoGrid}>
    {photos.map((p, i) => (
      <button key={p.id} style={styles.photoThumb} onClick={() => setLightbox({ photos, index: i })}>
        <SmartImg src={p.url} origUrl={p.origUrl} alt={p.caption} style={styles.photoImg} />
      </button>
    ))}
  </div>
  {lightbox && <Lightbox data={lightbox} onClose={() => setLightbox(null)} setLightbox={setLightbox} />}
</div>
```

);
}

/* –– Review panel –– */
function ReviewPanel({ job, onSave, showToast }) {
const [rating, setRating] = useState(job.review?.rating || 0);
const [hoverRating, setHoverRating] = useState(0);
const [text, setText] = useState(job.review?.text || ‘’);

const submit = () => {
if (!rating) { showToast(‘Rating select karein’, true); return; }
let next = { …job, review: { rating, text: text.trim(), date: new Date().toISOString() } };
next = logActivity(next, `Review submitted (${rating}★)`);
onSave(next);
showToast(‘Review submit ho gayi. Dhanyavaad!’);
};

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Review dein</div>
<div style={styles.plainTextMuted}>Aapka anubhav kaisa raha? Hamein bataiye.</div>
<div style={styles.starRow}>
{[1, 2, 3, 4, 5].map((n) => (
<button key={n} style={styles.starBtn} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)} onClick={() => setRating(n)}>
<Star size={32} fill={n <= (hoverRating || rating) ? BRAND.gold : ‘none’} color={n <= (hoverRating || rating) ? BRAND.gold : ‘#D7DAE5’} />
</button>
))}
</div>
<textarea style={{ …styles.input, minHeight: 90, resize: ‘vertical’, marginTop: 10 }} value={text} onChange={(e) => setText(e.target.value)} placeholder=‘Kaam, quality, service ke baare mein likhein…’ />
<button style={styles.primaryBtn2} onClick={submit}><Send size={14} /> Submit Review</button>

```
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
```

);
}

/* ===================== ADMIN APP ===================== */
function AdminApp({ gallery, setGallery, customers, setCustomers, jobs, setJobs, adminPin, setAdminPin, partnerPin, setPartnerPin, staff, setStaff, expenses, setExpenses, appointmentItemOptions, setAppointmentItemOptions, brochures, addBrochure, removeBrochure, allData, staffName, isPartner, onLogout, showToast }) {
const [tab, setTab] = useState(‘home’);
const [activeJobId, setActiveJobId] = useState(null);
const activeJob = jobs.find((j) => j.id === activeJobId);

if (activeJob) {
return (
<div style={{ paddingBottom: 20 }}>
<TopBar title={activeJob.customerName} subtitle={isPartner ? ‘Partner · Job detail’ : ‘Admin · Job detail’} onLogout={onLogout} onBack={() => setActiveJobId(null)} />
<AdminJobDetail job={activeJob} onSave={(j) => setJobs(jobs.map((jj) => (jj.id === j.id ? j : jj)))} showToast={showToast} appointmentItemOptions={appointmentItemOptions} />
</div>
);
}

const pendingEstimates = jobs.filter((j) => j.status === ‘appointment’ && (j.requirements || []).length > 0).length;
const overdue = jobs.filter((j) => jobDue(j) > 0 && (j.status === ‘delivered’ || j.status === ‘in_progress’)).length;
const pendingAppointments = jobs.filter((j) => j.appointment && j.appointment.status === ‘requested’).length;

return (
<div style={{ paddingBottom: 70 }}>
<TopBar title={isPartner ? ‘Partner Panel’ : ‘Admin Panel’} subtitle={staffName ? `Logged in as ${staffName}` : ‘Shree Krushn PVC Furniture’} onLogout={onLogout} />

```
  {tab === 'home' && (
    <AdminHome
      customers={customers} jobs={jobs} gallery={gallery}
      pendingEstimates={pendingEstimates} overdue={overdue} pendingAppointments={pendingAppointments}
      onOpenJob={setActiveJobId} setTab={setTab} isPartner={isPartner}
    />
  )}
  {tab === 'customers' && <AdminCustomers customers={customers} setCustomers={setCustomers} jobs={jobs} setJobs={setJobs} onOpenJob={setActiveJobId} showToast={showToast} isPartner={isPartner} />}
  {tab === 'gallery' && <AdminGallery gallery={gallery} setGallery={setGallery} showToast={showToast} />}
  {tab === 'reviews' && <AdminReviews jobs={jobs} />}
  {tab === 'expenses' && !isPartner && <AdminExpenses expenses={expenses} setExpenses={setExpenses} jobs={jobs} showToast={showToast} />}
  {tab === 'settings' && (
    isPartner
      ? <PartnerSettings staffName={staffName} />
      : <AdminSettings adminPin={adminPin} setAdminPin={setAdminPin} partnerPin={partnerPin} setPartnerPin={setPartnerPin} staff={staff} setStaff={setStaff} appointmentItemOptions={appointmentItemOptions} setAppointmentItemOptions={setAppointmentItemOptions} brochures={brochures} addBrochure={addBrochure} removeBrochure={removeBrochure} allData={allData} showToast={showToast} />
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
```

);
}

function AdminHome({ customers, jobs, gallery, pendingEstimates, overdue, pendingAppointments, onOpenJob, setTab, isPartner }) {
const dueTotal = jobs.reduce((s, j) => s + jobDue(j), 0);
const totalPhotos = CATEGORIES.reduce((s, c) => s + (gallery[c] || []).length, 0);
const recentJobs = […jobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.statRow2}>
<StatCard icon={<User size={16} />} label=‘Customers’ value={customers.length} onClick={() => setTab(‘customers’)} />
<StatCard icon={<Hammer size={16} />} label=‘In Progress’ value={jobs.filter((j) => j.status === ‘in_progress’).length} />
<StatCard icon={<IndianRupee size={16} />} label=‘Total Due’ value={currency(dueTotal)} accent />
</div>

```
  {(pendingEstimates > 0 || overdue > 0 || pendingAppointments > 0) && (
    <div style={styles.alertBox}>
      <AlertTriangle size={16} color='#B5562E' />
      <div style={{ flex: 1 }}>
        {pendingAppointments > 0 && <div style={styles.alertText}>{pendingAppointments} appointment request{pendingAppointments !== 1 ? 's' : ''} confirm karni hai</div>}
        {pendingEstimates > 0 && <div style={styles.alertText}>{pendingEstimates} customer{pendingEstimates !== 1 ? 's' : ''} ka estimate pending hai</div>}
        {overdue > 0 && <div style={styles.alertText}>{overdue} job{overdue !== 1 ? 's' : ''} mein payment due hai</div>}
      </div>
    </div>
  )}

  <div style={styles.quickGrid}>
    <QuickTile icon={<Grid3x3 size={20} color={BRAND.navy} />} label={`Gallery (${totalPhotos})`} onClick={() => setTab('gallery')} />
    <QuickTile icon={<User size={20} color={BRAND.navy} />} label='All Customers' onClick={() => setTab('customers')} />
    <QuickTile icon={<Star size={20} color={BRAND.navy} />} label='Reviews' onClick={() => setTab('reviews')} />
    {!isPartner && <QuickTile icon={<IndianRupee size={20} color={BRAND.navy} />} label='Expenses' onClick={() => setTab('expenses')} />}
``````
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
          <a href={`tel:+91${j.phone}`} style={styles.miniCallBtn} onClick={(e) => e.stopPropagation()}>
            <Phone size={13} color='#2F7D4F' />
          </a>
        )}
      </div>
    ))}
  </div>
</div>
```

);
}

function AdminCustomers({ customers, setCustomers, jobs, setJobs, onOpenJob, showToast }) {
const [query, setQuery] = useState(’’);
const [filter, setFilter] = useState(‘all’);
const [sort, setSort] = useState(‘recent’);
const [editingCustomer, setEditingCustomer] = useState(null);
const [deletingCustomer, setDeletingCustomer] = useState(null);

const rows = useMemo(() => {
let r = customers
.map((c) => ({ customer: c, job: jobs.find((j) => j.customerId === c.id) }))
.filter(({ customer, job }) => {
if (filter !== ‘all’ && (!job || job.status !== filter)) return false;
if (query.trim()) {
const q = query.toLowerCase();
return customer.name.toLowerCase().includes(q) || customer.phone.includes(q);
}
return true;
});
if (sort === ‘recent’) r.sort((a, b) => new Date(b.customer.createdAt) - new Date(a.customer.createdAt));
if (sort === ‘name’) r.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
if (sort === ‘due’) r.sort((a, b) => (b.job ? jobDue(b.job) : 0) - (a.job ? jobDue(a.job) : 0));
return r;
}, [customers, jobs, query, filter, sort]);

const dueTotal = jobs.reduce((s, j) => s + jobDue(j), 0);

const saveEditedCustomer = (updated) => {
const normalized = normalizeIndianPhone(updated.phone);
if (!updated.name.trim() || !normalized) {
showToast(‘Sahi naam aur phone number daalein’, true);
return;
}
const dupe = customers.find((c) => c.phone === normalized && c.id !== updated.id);
if (dupe) { showToast(‘Ye phone number pehle se kisi aur customer ka hai’, true); return; }
setCustomers(customers.map((c) => (c.id === updated.id ? { …c, name: updated.name.trim(), phone: normalized } : c)));
setJobs(jobs.map((j) => (j.customerId === updated.id ? { …j, customerName: updated.name.trim(), phone: normalized } : j)));
setEditingCustomer(null);
showToast(‘Customer updated’);
};

const confirmDeleteCustomer = () => {
if (!deletingCustomer) return;
setCustomers(customers.filter((c) => c.id !== deletingCustomer.id));
setJobs(jobs.filter((j) => j.customerId !== deletingCustomer.id));
setDeletingCustomer(null);
showToast(‘Customer deleted’);
};

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.statRow2}>
<StatCard icon={<User size={16} />} label=‘Customers’ value={customers.length} />
<StatCard icon={<Hammer size={16} />} label=‘In Progress’ value={jobs.filter((j) => j.status === ‘in_progress’).length} />
<StatCard icon={<IndianRupee size={16} />} label=‘Total Due’ value={currency(dueTotal)} accent />
</div>

```
  <div style={styles.searchWrap}>
    <Search size={15} color={BRAND.textMuted} />
    <input style={styles.searchInput} placeholder='Search naam ya phone...' value={query} onChange={(e) => setQuery(e.target.value)} />
  </div>
  <div style={styles.filterRow}>
    <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label='All' />
    {STATUS_ORDER.map((s) => <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)} label={STATUS[s].label} color={STATUS[s].color} />)}
  </div>
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
              </div>
            </div>
            {job && <StageBadge status={job.status} />}
          </div>
          {job && (job.requirements || []).length > 0 && (
            <div style={styles.reqPreview}>{job.requirements.length} requirement{job.requirements.length !== 1 ? 's' : ''} · {job.progressPhotos?.length || 0} progress photos</div>
          )}
        </button>
        <div style={styles.cardActionsRow}>
          <a href={`tel:+91${customer.phone}`} style={{ ...styles.cardActionBtn, color: '#2F7D4F' }} onClick={(e) => e.stopPropagation()}><Phone size={12} /> Call</a>
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
        <div style={styles.confirmDialogText}>Isse unka poora record — requirements, estimate, payments, sab hamesha ke liye mit jaayega.</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%' }}>
          <button style={{ ...styles.cancelBtn, flex: 1 }} onClick={() => setDeletingCustomer(null)}>Cancel</button>
          <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0, background: '#B5562E' }} onClick={confirmDeleteCustomer}>Delete</button>
        </div>
      </div>
    </div>
  )}
</div>
```

);
}

function CustomerEditDialog({ customer, onCancel, onSave }) {
const [name, setName] = useState(customer.name);
const [phone, setPhone] = useState(formatPhoneDisplay(customer.phone).replace(’+91 ’, ‘’));
return (
<div style={styles.overlay} onClick={onCancel}>
<div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
<SheetHeader title='Edit Customer' onClose={onCancel} />
<div style={styles.sheetBody}>
<div style={styles.fieldLabel}>Naam</div>
<input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
<div style={{ …styles.fieldLabel, marginTop: 12 }}>Phone number</div>
<input
style={styles.input}
value={phone}
onChange={(e) => setPhone(e.target.value.replace(/[^0-9+ ]/g, ‘’).slice(0, 14))}
inputMode=‘tel’
/>
</div>
<div style={styles.sheetFooter}>
<button style={styles.primaryBtn} onClick={() => onSave({ id: customer.id, name, phone })}>Save Changes</button>
</div>
</div>
</div>
);
}

function FilterChip({ active, onClick, label, color }) {
return (
<button onClick={onClick} style={{ …styles.chip, …(active ? { background: color || BRAND.navy, color: ‘#FFF’, borderColor: color || BRAND.navy } : {}) }}>{label}</button>
);
}

/* –– Admin: view appointment request, confirm/reschedule with a date+time –– */
function AdminAppointmentTab({ job, onSave, showToast }) {
const appt = job.appointment;
const [confirmDate, setConfirmDate] = useState(appt?.confirmedDate || appt?.preferredDate || ‘’);
const [confirmTime, setConfirmTime] = useState(appt?.confirmedTime || appt?.preferredTime || ‘’);

if (!appt) {
return <div style={styles.emptySmall}>Customer ne abhi tak koi appointment request nahi ki.</div>;
}

const st = APPT_STATUS[appt.status] || APPT_STATUS.requested;

const confirm = (asReschedule) => {
if (!confirmDate) { showToast(‘Date select karein’, true); return; }
const nextAppt = { …appt, status: asReschedule ? ‘rescheduled’ : ‘confirmed’, confirmedDate: confirmDate, confirmedTime: confirmTime };
let next = { …job, appointment: nextAppt };
next = logActivity(next, `Appointment ${asReschedule ? 'rescheduled' : 'confirmed'}: ${formatDate(confirmDate)}${confirmTime ? ', ' + confirmTime : ''}`);
onSave(next);
showToast(asReschedule ? ‘Appointment reschedule ki gayi’ : ‘Appointment confirm ho gayi’);
};

const markCompleted = () => {
let next = { …job, appointment: { …appt, status: ‘completed’ } };
next = logActivity(next, ‘Appointment completed’);
onSave(next);
showToast(‘Marked as completed’);
};

return (
<div>
<div style={{ display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘center’, marginBottom: 10 }}>
<div style={styles.fieldLabel}>Appointment request</div>
<span style={{ …styles.badge, background: st.bg, color: st.color }}>{st.label}</span>
</div>

```
  {job.phone && (
    <a href={`tel:+91${job.phone}`} style={styles.callBtn}>
      <Phone size={15} /> Call {job.customerName} — {formatPhoneDisplay(job.phone)}
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
    <div style={styles.apptRow}><span style={styles.apptRowLabel}>Preferred</span><span style={styles.apptRowValue}>{formatDate(appt.preferredDate)} {appt.preferredTime && `· ${appt.preferredTime}`}</span></div>
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
    <button style={styles.addBtn} onClick={markCompleted}><CheckCircle2 size={14} /> Mark visit completed</button>
  )}
</div>
```

);
}

/* –– Admin job detail –– */
/* –– Admin: Estimate builder — matches the real quotation sheet:
item, length, height (inches), auto sq-ft, rate/sqft, amount. Editable
inline. ‘Preview Quotation’ opens the formal customer-facing document. –– */
function AdminEstimateTab({ job, newItem, setNewItem, addItem, updateItem, removeItem, total }) {
const [showPreview, setShowPreview] = useState(false);
const [editingId, setEditingId] = useState(null);

return (
<div>
<div style={{ display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘center’ }}>
<div style={styles.fieldLabel}>Estimate items</div>
{(job.items || []).length > 0 && (
<button style={styles.previewLinkBtn} onClick={() => setShowPreview(true)}><FileText size={12} /> Preview Quotation</button>
)}
</div>

```
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
              ? `${it.length}' × ${it.height}' = ${estimateItemSqft(it).toFixed(2)} sq ft × ${currency(it.rate)}`
              : `${it.qty || 1} × ${currency(it.rate)}`}
          </div>
        </div>
        <div style={styles.itemAmount}>{currency(estimateItemAmount(it))}</div>
        <button style={styles.iconBtnSmall} onClick={() => setEditingId(it.id)}><Edit3 size={13} color='#B3B8C6' /></button>
        <button style={styles.iconBtnSmall} onClick={() => removeItem(it.id)}><Trash2 size={14} color='#C7CCDC' /></button>
      </div>
    )
  )}

  <div style={styles.formCard}>
    <div style={styles.fieldLabel}>Add item</div>
    <input style={styles.input} placeholder='Item / work description (e.g. Wardrobe box)' value={newItem.desc} onChange={(e) => setNewItem((n) => ({ ...n, desc: e.target.value }))} />
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input style={styles.input} placeholder='Length (inch)' inputMode='decimal' value={newItem.length} onChange={(e) => setNewItem((n) => ({ ...n, length: e.target.value }))} />
      <input style={styles.input} placeholder='Height (inch)' inputMode='decimal' value={newItem.height} onChange={(e) => setNewItem((n) => ({ ...n, height: e.target.value }))} />
    </div>
    <div style={styles.hintText}>Length × Height se sq ft auto-calculate hoga (inch → sq ft: L×H÷144). Bina naap ke item (jaise tandem basket) ho to yeh khaali chhod ke neeche Qty use karein.</div>
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input style={styles.input} placeholder='Qty (agar naap nahi)' inputMode='numeric' value={newItem.qty} onChange={(e) => setNewItem((n) => ({ ...n, qty: e.target.value }))} />
      <input style={styles.input} placeholder='Rate ₹' inputMode='decimal' value={newItem.rate} onChange={(e) => setNewItem((n) => ({ ...n, rate: e.target.value }))} />
    </div>
    {estimateItemSqft(newItem) !== null && (
      <div style={styles.liveCalcBox}>
        <span>{newItem.length}' × {newItem.height}' = <b>{estimateItemSqft(newItem).toFixed(2)} sq ft</b></span>
        {newItem.rate && <span>× {currency(newItem.rate)} = <b>{currency(estimateItemAmount(newItem))}</b></span>}
      </div>
    )}
    <button style={styles.addBtn} onClick={addItem}><Plus size={14} /> Add item</button>
  </div>

  <div style={styles.totalBar}><span>Estimate Total</span><span style={styles.totalAmt}>{currency(total)}</span></div>

  {showPreview && <QuotationPreview job={job} onClose={() => setShowPreview(false)} />}
</div>
```

);
}

function EstimateItemEditRow({ item, onSave, onCancel }) {
const [form, setForm] = useState({ desc: item.desc, length: item.length || ‘’, height: item.height || ‘’, qty: item.qty || ‘1’, rate: item.rate || ‘’ });
const set = (k, v) => setForm((f) => ({ …f, [k]: v }));
return (
<div style={styles.formCard}>
<input style={styles.input} value={form.desc} onChange={(e) => set(‘desc’, e.target.value)} placeholder=‘Description’ />
<div style={{ display: ‘flex’, gap: 8, marginTop: 8 }}>
<input style={styles.input} placeholder=‘Length (inch)’ inputMode=‘decimal’ value={form.length} onChange={(e) => set(‘length’, e.target.value)} />
<input style={styles.input} placeholder=‘Height (inch)’ inputMode=‘decimal’ value={form.height} onChange={(e) => set(‘height’, e.target.value)} />
</div>
<div style={{ display: ‘flex’, gap: 8, marginTop: 8 }}>
<input style={styles.input} placeholder=‘Qty’ inputMode=‘numeric’ value={form.qty} onChange={(e) => set(‘qty’, e.target.value)} />
<input style={styles.input} placeholder=‘Rate ₹’ inputMode=‘decimal’ value={form.rate} onChange={(e) => set(‘rate’, e.target.value)} />
</div>
<div style={{ display: ‘flex’, gap: 8, marginTop: 10 }}>
<button style={{ …styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={() => onSave(form)}><Check size={14} /> Save</button>
<button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
</div>
</div>
);
}

/* –– Formal quotation document — matches the business’s real estimate
sheet: header, customer info, item table with sq-ft calc, grand total,
and the standard terms & conditions block. Visible to both admin
(preview) and customer (their own job’s estimate). –– */
function QuotationPreview({ job, onClose }) {
const total = jobTotal(job);
const waText = buildEstimateWhatsAppText(job);
const waUrl = whatsAppShareUrl(job.phone, waText);
return (
<div style={styles.overlay} onClick={onClose}>
<div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
<div style={styles.sheetHeader}>
<div style={styles.sheetTitle}>Estimate & Invoice</div>
<div style={{ display: ‘flex’, alignItems: ‘center’, gap: 6 }}>
<a href={waUrl} target='_blank' rel='noopener noreferrer' style={styles.waShareBtn}>
<Send size={13} /> WhatsApp
</a>
<button style={styles.iconBtn} onClick={onClose}><X size={20} color={BRAND.navy} /></button>
</div>
</div>
<div style={{ …styles.sheetBody, padding: 0 }}>
<div style={styles.quoteDoc}>
<div style={styles.quoteBlessingLine}>श्री कृष्ण शरणं ममः</div>

```
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
        {job.address && (
          <div style={styles.quoteAddressRow}>
            <span style={styles.quoteLabel}>Address&nbsp;</span>
            <span style={styles.quoteCustSub}>{job.address}</span>
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
                    <td style={styles.qtd}>{sqft !== null ? it.length : '—'}</td>
                    <td style={styles.qtd}>{sqft !== null ? it.height : '—'}</td>
                    <td style={styles.qtd}>{sqft !== null ? sqft.toFixed(2) : (it.qty || 1)}</td>
                    <td style={styles.qtd}>{currency(it.rate)}</td>
                    <td style={{ ...styles.qtd, fontWeight: 800 }}>{currency(estimateItemAmount(it))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.quoteTotalRow}>
          <span>Grand Total</span>
          <span style={styles.quoteTotalAmt}>{currency(total)}</span>
        </div>

        <div style={styles.quoteTermsTitle}>Terms &amp; Conditions &amp; Details</div>
        {ESTIMATE_TERMS.map((section, i) => (
          <div key={i} style={styles.quoteTermSection}>
            <div style={styles.quoteTermHeading}>{i + 1}. {section.title}</div>
            {section.points.map((p, j) => (
              <div key={j} style={styles.quoteTermPoint}>• {p}</div>
            ))}
          </div>
        ))}

        <div style={styles.quoteFooter}>Thank you for choosing {BUSINESS.name}</div>
      </div>
    </div>
  </div>
</div>
```

);
}

function AdminJobDetail({ job, onSave, showToast }) {
const [tab, setTab] = useState(‘status’);
const [newItem, setNewItem] = useState({ desc: ‘’, length: ‘’, height: ‘’, qty: ‘1’, rate: ‘’ });
const [newPayment, setNewPayment] = useState({ amount: ‘’, note: ‘’ });

const total = jobTotal(job);
const paid = jobPaid(job);
const due = jobDue(job);

const updateStatus = (status) => {
let next = { …job, status };
next = logActivity(next, `Status updated: ${STATUS[status].label}`);
onSave(next);
showToast(`Status set to ${STATUS[status].label}`);
};

const addItem = () => {
if (!newItem.desc.trim()) return;
const item = {
id: uid(),
desc: newItem.desc.trim(),
length: newItem.length || ‘’,
height: newItem.height || ‘’,
qty: newItem.qty || ‘1’,
rate: newItem.rate || ‘0’,
};
let next = { …job, items: […(job.items || []), item] };
next = logActivity(next, `Estimate item added: ${newItem.desc.trim()}`);
onSave(next);
setNewItem({ desc: ‘’, length: ‘’, height: ‘’, qty: ‘1’, rate: ‘’ });
};
const updateItem = (id, patch) => {
onSave({ …job, items: job.items.map((it) => (it.id === id ? { …it, …patch } : it)) });
};
const removeItem = (id) => onSave({ …job, items: job.items.filter((it) => it.id !== id) });

const addPayment = () => {
if (!newPayment.amount) return;
let nextJob = { …job, payments: […(job.payments || []), { id: uid(), amount: newPayment.amount, note: newPayment.note.trim(), date: new Date().toISOString() }] };
nextJob = logActivity(nextJob, `Payment received: ${currency(newPayment.amount)}`);
if (jobDue(nextJob) <= 0 && nextJob.status !== ‘paid’) nextJob.status = ‘paid’;
onSave(nextJob);
setNewPayment({ amount: ‘’, note: ‘’ });
showToast(‘Payment recorded’);
};
const removePayment = (id) => onSave({ …job, payments: job.payments.filter((p) => p.id !== id) });

const addPhotoFromPanel = (url, origUrl, caption) => {
let next = { …job, progressPhotos: […(job.progressPhotos || []), { id: uid(), url, origUrl, caption, date: new Date().toISOString() }] };
next = logActivity(next, ‘New progress photo added’);
onSave(next);
showToast(‘Progress photo added’);
};
const removePhoto = (id) => onSave({ …job, progressPhotos: job.progressPhotos.filter((p) => p.id !== id) });

return (
<div>
<div style={styles.tabRow}>
<TabBtn active={tab === ‘appointment’} onClick={() => setTab(‘appointment’)} label=‘Appointment’ />
<TabBtn active={tab === ‘status’} onClick={() => setTab(‘status’)} label=‘Status’ />
<TabBtn active={tab === ‘estimate’} onClick={() => setTab(‘estimate’)} label=‘Estimate’ />
<TabBtn active={tab === ‘payment’} onClick={() => setTab(‘payment’)} label=‘Payment’ />
<TabBtn active={tab === ‘req’} onClick={() => setTab(‘req’)} label=‘Requirements’ />
<TabBtn active={tab === ‘photos’} onClick={() => setTab(‘photos’)} label=‘Progress’ />
<TabBtn active={tab === ‘activity’} onClick={() => setTab(‘activity’)} label=‘Activity’ />
</div>

```
  <div style={{ padding: '14px 16px' }}>
    {tab === 'appointment' && (
      <AdminAppointmentTab job={job} onSave={onSave} showToast={showToast} />
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
      </div>
    )}

    {tab === 'estimate' && (
      <AdminEstimateTab job={job} newItem={newItem} setNewItem={setNewItem} addItem={addItem} updateItem={updateItem} removeItem={removeItem} total={total} />
    )}

    {tab === 'payment' && (
      <div>
        <div style={styles.payStrip}>
          <MoneyBit label='Total' value={currency(total)} />
          <MoneyBit label='Paid' value={currency(paid)} muted />
          <MoneyBit label='Due' value={currency(due)} highlight={due > 0} />
        </div>
        <div style={{ ...styles.fieldLabel, marginTop: 16 }}>Payment history</div>
        {(job.payments || []).length === 0 && <div style={styles.emptySmall}>No payments recorded yet.</div>}
        {(job.payments || []).map((p) => (
          <div key={p.id} style={styles.itemRow}>
            <div style={{ flex: 1 }}>
              <div style={styles.itemDesc}>{currency(p.amount)}</div>
              <div style={styles.itemSub}>{formatDate(p.date)} {p.note && `· ${p.note}`}</div>
            </div>
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
            onAdd={({ url, origUrl, caption }) => addPhotoFromPanel(url, origUrl, caption)}
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
  </div>
</div>
```

);
}

function TabBtn({ active, onClick, label }) {
return <button onClick={onClick} style={{ …styles.tabBtn, …(active ? styles.tabBtnActive : {}) }}>{label}</button>;
}

/* –– Photo URL input: user types/pastes the ORIGINAL link as-is (we never
silently rewrite what they see in the box — that hid what was actually
pasted and made mistakes hard to spot). We show a live preview using the
full candidate-URL fallback chain, so what you see here is what will
actually render after saving. –– */
function PhotoUrlInput({ value, onChange, placeholder }) {
const isDrive = isLikelyDriveLink(value);
return (
<div>
<div style={{ position: ‘relative’ }}>
<input
style={{ …styles.input, paddingRight: 32 }}
placeholder={placeholder || ‘Image URL ya Google Drive link paste karein’}
value={value}
onChange={(e) => onChange(e.target.value)}
/>
<Link2 size={14} color=’#C7CCDC’ style={{ position: ‘absolute’, right: 10, top: 12 }} />
</div>
{isDrive && (
<div style={styles.convertedTag}><Check size={11} /> Google Drive link — preview neeche check karein</div>
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
Agar preview nahi dikh raha: Drive file ko ‘Anyone with the link’ pe share karein (Viewer access).
</div>
)}
</div>
);
}

/* –– Combined photo add: toggle between uploading straight from the
device (camera/gallery) or pasting a URL/Drive link. Upload path reads
the file, keeps full quality, and only compresses if it exceeds the
5MB storage cap. onAdd receives { url, origUrl } ready to save. –– */
function PhotoAddPanel({ onAdd, addLabel, showToast }) {
const [mode, setMode] = useState(‘upload’); // upload | link
const [linkValue, setLinkValue] = useState(’’);
const [caption, setCaption] = useState(’’);
const [uploading, setUploading] = useState(false);
const [pendingUpload, setPendingUpload] = useState(null); // { dataUri, name }
const fileInputRef = React.useRef(null);

const handleFilePicked = async (e) => {
const file = e.target.files && e.target.files[0];
e.target.value = ‘’; // allow picking the same file again later
if (!file) return;
if (!file.type.startsWith(‘image/’)) { showToast(‘Sirf image file select karein’, true); return; }
setUploading(true);
try {
const dataUri = await prepareImageForUpload(file);
const sizeMb = (dataUriByteSize(dataUri) / (1024 * 1024)).toFixed(1);
if (dataUriByteSize(dataUri) > MAX_PHOTO_BYTES) {
showToast(`Photo bahut badi hai (${sizeMb}MB) — chhoti photo try karein`, true);
setUploading(false);
return;
}
setPendingUpload({ dataUri, sizeMb });
} catch (err) {
showToast(‘Photo process nahi ho payi, dobara try karein’, true);
} finally {
setUploading(false);
}
};

const confirmUpload = () => {
if (!pendingUpload) return;
onAdd({ url: pendingUpload.dataUri, origUrl: null, caption: caption.trim() });
setPendingUpload(null);
setCaption(’’);
};

const addFromLink = () => {
if (!linkValue.trim()) return;
onAdd({ url: toDirectImageUrl(linkValue), origUrl: linkValue.trim(), caption: caption.trim() });
setLinkValue(’’);
setCaption(’’);
};

return (
<div style={styles.formCard}>
<div style={styles.modeToggleRow}>
<button style={{ …styles.modeToggleBtn, …(mode === ‘upload’ ? styles.modeToggleBtnActive : {}) }} onClick={() => setMode(‘upload’)}>
<Camera size={13} /> Upload Photo
</button>
<button style={{ …styles.modeToggleBtn, …(mode === ‘link’ ? styles.modeToggleBtnActive : {}) }} onClick={() => setMode(‘link’)}>
<Link2 size={13} /> Paste Link
</button>
</div>

```
  {mode === 'upload' && (
    <div style={{ marginTop: 12 }}>
      {!pendingUpload ? (
        <>
          <input ref={fileInputRef} type='file' accept='image/*' style={{ display: 'none' }} onChange={handleFilePicked} />
          <button style={styles.uploadTapArea} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
            {uploading ? (
              <span style={styles.uploadHint}>Processing…</span>
            ) : (
              <>
                <Camera size={22} color={BRAND.gold} />
                <span style={styles.uploadHint}>Camera se click karein ya gallery se select karein</span>
              </>
            )}
``````
          </button>
        </>
      ) : (
        <div>
          <div style={styles.previewWrap}>
            <img src={pendingUpload.dataUri} alt='preview' style={styles.previewImg} />
          </div>
          <div style={styles.hintText}>Size: {pendingUpload.sizeMb}MB — poori quality mein save hogi.</div>
          <input style={{ ...styles.input, marginTop: 8 }} placeholder='Caption (optional)' value={caption} onChange={(e) => setCaption(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={{ ...styles.primaryBtn2, flex: 1, marginTop: 0 }} onClick={confirmUpload}><Check size={14} /> {addLabel || 'Add photo'}</button>
            <button style={styles.cancelBtn} onClick={() => setPendingUpload(null)}>Cancel</button>
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
```

);
}

/* –– Admin gallery manager –– */
function AdminGallery({ gallery, setGallery, showToast }) {
const [activeCat, setActiveCat] = useState(CATEGORIES[0]);
const [bulkText, setBulkText] = useState(’’);
const [showBulk, setShowBulk] = useState(false);
const [query, setQuery] = useState(’’);
const [editingPhoto, setEditingPhoto] = useState(null);

const allPhotos = gallery[activeCat] || [];
const photos = allPhotos.filter((p) => !query.trim() || (p.caption || ‘’).toLowerCase().includes(query.toLowerCase()));

const addPhotoFromPanel = (url, origUrl, caption) => {
const next = { …gallery, [activeCat]: [{ id: uid(), url, origUrl, caption }, …allPhotos] };
setGallery(next);
showToast(’Photo added to ’ + activeCat);
};

const addBulk = () => {
const urls = bulkText.split(’\n’).map((l) => l.trim()).filter(Boolean);
if (urls.length === 0) return;
const newPhotos = urls.map((u) => ({ id: uid(), url: toDirectImageUrl(u), origUrl: u, caption: ‘’ }));
const next = { …gallery, [activeCat]: […newPhotos, …allPhotos] };
setGallery(next);
setBulkText(’’);
setShowBulk(false);
showToast(`${urls.length} photos added to ${activeCat}`);
};

const removePhoto = (id) => setGallery({ …gallery, [activeCat]: allPhotos.filter((p) => p.id !== id) });

const saveEditedPhoto = (photo, newCaption, newCategory) => {
if (newCategory === activeCat) {
setGallery({ …gallery, [activeCat]: allPhotos.map((p) => (p.id === photo.id ? { …p, caption: newCaption } : p)) });
} else {
// Move to a different category: remove from current, append to target.
const remaining = allPhotos.filter((p) => p.id !== photo.id);
const targetPhotos = gallery[newCategory] || [];
setGallery({
…gallery,
[activeCat]: remaining,
[newCategory]: [{ …photo, caption: newCaption }, …targetPhotos],
});
showToast(`Photo ${newCategory} mein move ho gayi`);
}
setEditingPhoto(null);
};

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Design Gallery Manager</div>
<div style={styles.chipRow}>
{CATEGORIES.map((c) => {
const count = (gallery[c] || []).length;
return <button key={c} onClick={() => setActiveCat(c)} style={{ …styles.chip, …(activeCat === c ? styles.chipActive : {}) }}>{c} ({count})</button>;
})}
</div>

```
  <div style={{ marginTop: 12 }}>
    <div style={styles.fieldLabel}>Add photo to '{activeCat}'</div>
    <PhotoAddPanel addLabel='Add photo' showToast={showToast} onAdd={({ url, origUrl, caption }) => addPhotoFromPanel(url, origUrl, caption)} />
    <button style={styles.linkBtn2} onClick={() => setShowBulk((s) => !s)}>{showBulk ? 'Hide bulk add' : 'Bulk add (many URLs at once) →'}</button>
    {showBulk && (
      <div style={{ marginTop: 8 }}>
        <textarea style={{ ...styles.input, minHeight: 100, resize: 'vertical' }} placeholder={'Ek line mein ek URL daalein (Google Drive links bhi chalenge):\nhttps://example.com/1.jpg\nhttps://drive.google.com/file/d/.../view'} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
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

  <div style={{ ...styles.fieldLabel, marginTop: 16 }}>{activeCat} photos ({photos.length}) — edit ke liye tap karein</div>
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
      onCancel={() => setEditingPhoto(null)}
      onSave={saveEditedPhoto}
    />
  )}
</div>
```

);
}

function GalleryPhotoEditDialog({ photo, currentCategory, onCancel, onSave }) {
const [caption, setCaption] = useState(photo.caption || ‘’);
const [category, setCategory] = useState(currentCategory);
return (
<div style={styles.overlay} onClick={onCancel}>
<div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
<SheetHeader title='Edit Photo' onClose={onCancel} />
<div style={styles.sheetBody}>
<div style={styles.previewWrap}>
<SmartImg src={photo.url} origUrl={photo.origUrl} alt={caption} style={styles.previewImg} />
</div>
<div style={{ …styles.fieldLabel, marginTop: 12 }}>Caption</div>
<input style={styles.input} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder=‘Caption (optional)’ />
<div style={{ …styles.fieldLabel, marginTop: 12 }}>Category</div>
<div style={styles.chipRow}>
{CATEGORIES.map((c) => (
<button key={c} onClick={() => setCategory(c)} style={{ …styles.chip, …(category === c ? styles.chipActive : {}) }}>{c}</button>
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

/* –– Admin reviews –– */
function AdminReviews({ jobs }) {
const reviewed = jobs.filter((j) => j.review).sort((a, b) => new Date(b.review.date) - new Date(a.review.date));
const avg = reviewed.length ? (reviewed.reduce((s, j) => s + j.review.rating, 0) / reviewed.length).toFixed(1) : ‘-’;

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Customer Reviews</div>
<div style={styles.statRow2}>
<StatCard icon={<Star size={16} />} label=‘Avg Rating’ value={avg} accent />
<StatCard icon={<MessageSquare size={16} />} label=‘Total Reviews’ value={reviewed.length} />
</div>
{reviewed.length === 0 && <div style={styles.empty}>Abhi tak koi review nahi mila.</div>}
{reviewed.map((j) => (
<div key={j.id} style={styles.reviewCard}>
<div style={{ display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘flex-start’ }}>
<div style={styles.cardName}>{j.customerName}</div>
<div style={{ display: ‘flex’, gap: 1 }}>
{[1,2,3,4,5].map((n) => <Star key={n} size={13} fill={n <= j.review.rating ? BRAND.gold : ‘none’} color={n <= j.review.rating ? BRAND.gold : ‘#D7DAE5’} />)}
</div>
</div>
{j.review.text && <div style={{ …styles.plainText, marginTop: 6 }}>{j.review.text}</div>}
<div style={styles.itemSub}>{formatDate(j.review.date)}</div>
</div>
))}
</div>
);
}

/* –– Admin: Karigar (worker) payments & company expenses — kept
separate from customer job revenue. Company earning (from jobs) minus
these expenses gives real net profit. –– */
function AdminExpenses({ expenses, setExpenses, jobs, showToast }) {
const [type, setType] = useState(EXPENSE_TYPES[0]);
const [payee, setPayee] = useState(’’);
const [amount, setAmount] = useState(’’);
const [note, setNote] = useState(’’);
const [filterType, setFilterType] = useState(‘all’);

const totalRevenue = jobs.reduce((s, j) => s + jobTotal(j), 0);
const totalCollected = jobs.reduce((s, j) => s + jobPaid(j), 0);
const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
const karigarTotal = expenses.filter((e) => e.type === ‘Karigar Payment’).reduce((s, e) => s + (Number(e.amount) || 0), 0);
const netProfit = totalCollected - totalExpense;

const addExpense = () => {
if (!payee.trim() || !amount) { showToast(‘Naam aur amount daalein’, true); return; }
const entry = { id: uid(), type, payee: payee.trim(), amount, note: note.trim(), date: new Date().toISOString() };
setExpenses([entry, …expenses]);
setPayee(’’); setAmount(’’); setNote(’’);
showToast(‘Expense add ho gaya’);
};
const removeExpense = (id) => setExpenses(expenses.filter((e) => e.id !== id));

const filtered = expenses.filter((e) => filterType === ‘all’ || e.type === filterType).sort((a, b) => new Date(b.date) - new Date(a.date));

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Karigar & Company Expenses</div>
<div style={styles.plainTextMuted}>Customer se aayi payment alag, karigar/company kharch alag track hota hai.</div>

```
  <div style={styles.statRow2}>
    <StatCard icon={<IndianRupee size={16} />} label='Collected' value={currency(totalCollected)} />
    <StatCard icon={<Users size={16} />} label='Karigar Paid' value={currency(karigarTotal)} />
    <StatCard icon={<TrendingUp size={16} />} label='Net Profit' value={currency(netProfit)} accent />
  </div>

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
        <div style={styles.itemSub}>{formatDate(e.date)} {e.note && `· ${e.note}`}</div>
      </div>
      <div style={styles.itemAmount}>{currency(e.amount)}</div>
      <button style={styles.iconBtnSmall} onClick={() => removeExpense(e.id)}><Trash2 size={14} color='#C7CCDC' /></button>
    </div>
  ))}
</div>
```

);
}

/* –– Admin settings –– */
function AdminSettings({ adminPin, setAdminPin, partnerPin, setPartnerPin, staff, setStaff, appointmentItemOptions, setAppointmentItemOptions, brochures, addBrochure, removeBrochure, allData, showToast }) {
const [current, setCurrent] = useState(’’);
const [next1, setNext1] = useState(’’);
const [next2, setNext2] = useState(’’);
const [error, setError] = useState(’’);
const [newStaffName, setNewStaffName] = useState(’’);
const [newStaffPin, setNewStaffPin] = useState(’’);
const [staffError, setStaffError] = useState(’’);
const [newPartnerPin, setNewPartnerPin] = useState(’’);
const [partnerPinError, setPartnerPinError] = useState(’’);

const change = () => {
if (current !== adminPin) { setError(‘Current PIN galat hai’); return; }
if (next1.length < 4) { setError(‘Naya PIN kam se kam 4 digit ka hona chahiye’); return; }
if (next1 !== next2) { setError(‘Dono naye PIN match nahi karte’); return; }
setAdminPin(next1);
setCurrent(’’); setNext1(’’); setNext2(’’); setError(’’);
showToast(‘Admin PIN change ho gaya’);
};

const addStaff = () => {
if (!newStaffName.trim()) { setStaffError(‘Staff ka naam daalein’); return; }
if (newStaffPin.length < 4) { setStaffError(‘PIN kam se kam 4 digit ka ho’); return; }
const allPins = [adminPin, partnerPin, …staff.map((s) => s.pin)].filter(Boolean);
if (allPins.includes(newStaffPin)) { setStaffError(‘Ye PIN pehle se use ho raha hai — alag PIN chunein’); return; }
setStaff([…staff, { id: uid(), name: newStaffName.trim(), pin: newStaffPin, createdAt: new Date().toISOString() }]);
setNewStaffName(’’); setNewStaffPin(’’); setStaffError(’’);
showToast(‘Staff member add ho gaya’);
};
const removeStaff = (id) => {
setStaff(staff.filter((s) => s.id !== id));
showToast(‘Staff member hataya gaya’);
};

const savePartnerPin = () => {
if (newPartnerPin.length < 4) { setPartnerPinError(‘PIN kam se kam 4 digit ka ho’); return; }
const allPins = [adminPin, …staff.map((s) => s.pin)];
if (allPins.includes(newPartnerPin)) { setPartnerPinError(‘Ye PIN pehle se use ho raha hai — alag PIN chunein’); return; }
setPartnerPin(newPartnerPin);
setNewPartnerPin(’’); setPartnerPinError(’’);
showToast(‘Partner PIN set ho gaya’);
};
const removePartnerPin = () => {
setPartnerPin(’’);
showToast(‘Partner access hata diya gaya’);
};

const toggleAppointmentItem = (cat) => {
const next = appointmentItemOptions.includes(cat)
? appointmentItemOptions.filter((c) => c !== cat)
: […appointmentItemOptions, cat];
setAppointmentItemOptions(next);
};

const downloadBackup = () => {
try {
const blob = new Blob([JSON.stringify(allData, null, 2)], { type: ‘application/json’ });
const url = URL.createObjectURL(blob);
const a = document.createElement(‘a’);
const dateStr = new Date().toISOString().slice(0, 10);
a.href = url;
a.download = `shree-krushn-backup-${dateStr}.json`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
showToast(‘Backup download ho gaya’);
} catch (e) {
showToast(‘Backup download nahi ho paya’, true);
}
};

return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Settings</div>
<div style={{ …styles.card, marginTop: 12 }}>
<div style={{ display: ‘flex’, alignItems: ‘center’, gap: 8, marginBottom: 12 }}>
<Lock size={16} color={BRAND.gold} />
<div style={{ fontWeight: 800, fontSize: 14 }}>Change Admin PIN</div>
</div>
<div style={styles.fieldLabel}>Current PIN</div>
<input style={styles.input} type=‘password’ inputMode=‘numeric’ value={current} onChange={(e) => { setCurrent(e.target.value); setError(’’); }} />
<div style={{ …styles.fieldLabel, marginTop: 10 }}>New PIN</div>
<input style={styles.input} type=‘password’ inputMode=‘numeric’ value={next1} onChange={(e) => { setNext1(e.target.value); setError(’’); }} />
<div style={{ …styles.fieldLabel, marginTop: 10 }}>Confirm New PIN</div>
<input style={styles.input} type=‘password’ inputMode=‘numeric’ value={next2} onChange={(e) => { setNext2(e.target.value); setError(’’); }} />
{error && <div style={styles.errorText}>{error}</div>}
<button style={{ …styles.primaryBtn, marginTop: 14 }} onClick={change}>Update PIN</button>
</div>

```
  <div style={{ ...styles.card, marginTop: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <Users size={16} color={BRAND.gold} />
      <div style={{ fontWeight: 800, fontSize: 14 }}>Partner Access</div>
    </div>
    <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>
      Partner ko apni PIN dein — wo customers, gallery, reviews dekh/manage kar sakta hai, lekin Settings, staff PINs, ya expenses nahi dekh sakta.
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
      <div style={{ fontWeight: 800, fontSize: 14 }}>Staff Logins</div>
    </div>
    <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Team members ko alag PIN dein taaki wo bhi admin panel access kar sakein.</div>

    {staff.length === 0 && <div style={styles.emptySmall}>Abhi koi staff member add nahi kiya.</div>}
    {staff.map((s) => (
      <div key={s.id} style={styles.staffRow}>
        <div style={{ flex: 1 }}>
          <div style={styles.itemDesc}>{s.name}</div>
          <div style={styles.itemSub}>PIN: {s.pin}</div>
        </div>
        <button style={styles.iconBtnSmall} onClick={() => removeStaff(s.id)}><Trash2 size={14} color='#C7CCDC' /></button>
      </div>
    ))}

    <div style={{ marginTop: 10 }}>
      <input style={styles.input} placeholder='Staff member ka naam' value={newStaffName} onChange={(e) => { setNewStaffName(e.target.value); setStaffError(''); }} />
      <input style={{ ...styles.input, marginTop: 8 }} placeholder='PIN set karein (4+ digit)' inputMode='numeric' type='password' value={newStaffPin} onChange={(e) => { setNewStaffPin(e.target.value); setStaffError(''); }} />
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
    <div style={styles.checklistGrid}>
      {CATEGORIES.map((cat) => {
        const checked = appointmentItemOptions.includes(cat);
        return (
          <button key={cat} onClick={() => toggleAppointmentItem(cat)} style={{ ...styles.checklistItem, ...(checked ? styles.checklistItemActive : {}) }}>
            <div style={{ ...styles.checkbox, ...(checked ? styles.checkboxActive : {}) }}>
              {checked && <Check size={11} color='#FFF' />}
            </div>
            <span>{cat}</span>
          </button>
        );
      })}
    </div>
  </div>

  <div style={{ ...styles.card, marginTop: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <FileText size={16} color={BRAND.gold} />
      <div style={{ fontWeight: 800, fontSize: 14 }}>Product Brochures (PDF)</div>
    </div>
    <div style={{ ...styles.plainTextMuted, marginBottom: 10 }}>Category-wise brochure PDFs upload karein — customer inhe Gallery se dekh sakega.</div>
    <BrochureUploadPanel addBrochure={addBrochure} showToast={showToast} />
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
      Dusre kisi bhi customer ka data unhe kabhi nahi dikhta — sirf aap (Admin) sabka data ek saath dekh sakte hain.
    </div>
  </div>
</div>
```

);
}

/* –– Partner: same admin interface but Settings is a stub with no
access to PINs, staff, or backups — only their own login info. –– */
function PartnerSettings({ staffName }) {
return (
<div style={{ padding: ‘12px 16px’ }}>
<div style={styles.sectionTitle}>Settings</div>
<div style={{ …styles.card, marginTop: 12 }}>
<div style={{ display: ‘flex’, alignItems: ‘center’, gap: 8, marginBottom: 6 }}>
<ShieldCheck size={16} color={BRAND.gold} />
<div style={{ fontWeight: 800, fontSize: 14 }}>Partner Access</div>
</div>
<div style={styles.plainText}>
Aap ‘{staffName || ‘Partner’}’ ke roop mein logged in hain. Partner access mein Admin PIN, staff logins,
expenses, aur data backup nahi dikhte — sirf customers, gallery, aur reviews manage kar sakte hain.
</div>
</div>
</div>
);
}

/* –– Brochure upload: reads a PDF file from device, converts to a
data URI, and saves it under the chosen category. No compression is
applied (PDFs don’t shrink like images) — if a file exceeds the 5MB
storage cap, the save is rejected with a clear message. –– */
function BrochureUploadPanel({ addBrochure, showToast }) {
const [category, setCategory] = useState(CATEGORIES[0]);
const [uploading, setUploading] = useState(false);
const fileInputRef = React.useRef(null);

const handleFilePicked = async (e) => {
const file = e.target.files && e.target.files[0];
e.target.value = ‘’;
if (!file) return;
if (file.type !== ‘application/pdf’) { showToast(‘Sirf PDF file select karein’, true); return; }
setUploading(true);
try {
const dataUri = await fileToDataUri(file);
const sizeBytes = dataUriByteSize(dataUri);
if (sizeBytes > MAX_PHOTO_BYTES) {
showToast(`PDF bahut badi hai (${(sizeBytes / (1024 * 1024)).toFixed(1)}MB) — 5MB se choti file try karein`, true);
return;
}
const meta = { id: uid(), name: file.name.replace(/.pdf$/i, ‘’), category, sizeKb: Math.round(sizeBytes / 1024) };
const ok = await addBrochure(meta, dataUri);
if (ok) showToast(‘Brochure add ho gayi’);
} catch (e) {
showToast(‘Brochure upload nahi ho payi’, true);
} finally {
setUploading(false);
}
};

return (
<div>
<div style={styles.fieldLabel}>Category</div>
<div style={styles.chipRow}>
{CATEGORIES.map((c) => (
<button key={c} onClick={() => setCategory(c)} style={{ …styles.chip, …(category === c ? styles.chipActive : {}) }}>{c}</button>
))}
</div>
<input ref={fileInputRef} type=‘file’ accept=‘application/pdf’ style={{ display: ‘none’ }} onChange={handleFilePicked} />
<button style={{ …styles.addBtn, marginTop: 10 }} onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={uploading}>
<FileText size={14} /> {uploading ? ‘Uploading…’ : `Upload PDF to ${category}`}
</button>
</div>
);
}

/* ===================== styles ===================== */
const fontImport = `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=DM+Mono:wght@500&display=swap');`;

const styles = {
app: { fontFamily: “‘Manrope’, system-ui, sans-serif”, background: BRAND.cream, minHeight: ‘100vh’, color: BRAND.navy, maxWidth: 480, margin: ‘0 auto’, position: ‘relative’ },
loadingScreen: { display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, justifyContent: ‘center’, height: ‘100vh’ },

loginWrap: { minHeight: ‘100vh’, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, justifyContent: ‘center’, padding: 24, position: ‘relative’, overflow: ‘hidden’ },
loginBgAccent: { position: ‘absolute’, top: -80, right: -80, width: 220, height: 220, borderRadius: ‘50%’, background: ‘radial-gradient(circle, rgba(15,27,61,0.06), transparent 70%)’ },
loginBrand: { textAlign: ‘center’, marginBottom: 28, position: ‘relative’, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’ },
brandName: { fontWeight: 800, fontSize: 19, letterSpacing: 1.5, marginTop: 14, color: BRAND.navy },
brandNameSub: { fontSize: 10.5, color: BRAND.gold, fontWeight: 800, letterSpacing: 3, marginTop: 3 },
brandSub: { fontSize: 12, color: BRAND.textMuted, fontWeight: 600, marginTop: 10 },
loginCard: { width: ‘100%’, maxWidth: 340, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 16, padding: 20, position: ‘relative’, boxShadow: ‘0 4px 20px rgba(15,27,61,0.06)’ },
otpDemoBox: { display: ‘flex’, alignItems: ‘center’, gap: 7, background: ‘#F3EFE3’, borderRadius: 9, padding: ‘9px 11px’, marginTop: 10, fontSize: 11, color: ‘#5A4E2E’, lineHeight: 1.4 },
verifiedTag: { display: ‘inline-flex’, alignItems: ‘center’, gap: 3, fontSize: 10, fontWeight: 700, color: ‘#2F7D4F’ },
callBtn: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 7, width: ‘100%’, background: ‘#2F7D4F’, color: ‘#FFF’, textDecoration: ‘none’, border: ‘none’, borderRadius: 10, padding: ‘11px’, fontSize: 13, fontWeight: 700, marginBottom: 10, boxSizing: ‘border-box’ },
waShareBtn: { display: ‘flex’, alignItems: ‘center’, gap: 5, background: ‘#25D366’, color: ‘#FFF’, textDecoration: ‘none’, borderRadius: 20, padding: ‘7px 12px’, fontSize: 11.5, fontWeight: 700 },

header: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘space-between’, padding: ‘16px 16px 12px’, position: ‘sticky’, top: 0, background: BRAND.cream, zIndex: 25 },
brandRow: { display: ‘flex’, alignItems: ‘center’, gap: 10, minWidth: 0 },
brandNameSm: { fontWeight: 800, fontSize: 14.5, letterSpacing: -0.2, whiteSpace: ‘nowrap’, overflow: ‘hidden’, textOverflow: ‘ellipsis’ },
brandSubSm: { fontSize: 11, color: BRAND.gold, fontWeight: 700, marginTop: 1 },
logoutBtn: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 20, padding: ‘8px 10px’, cursor: ‘pointer’, color: BRAND.navy, flexShrink: 0 },
iconBtn: { background: ‘none’, border: ‘none’, cursor: ‘pointer’, padding: 4 },
iconBtnSmall: { background: ‘none’, border: ‘none’, cursor: ‘pointer’, padding: 4, flexShrink: 0 },

bottomNav: { position: ‘fixed’, bottom: 0, left: ‘50%’, transform: ‘translateX(-50%)’, width: ‘100%’, maxWidth: 480, background: BRAND.paper, borderTop: `1px solid ${BRAND.line}`, display: ‘flex’, padding: ‘8px 4px’, zIndex: 30 },
navBtn: { position: ‘relative’, flex: 1, background: ‘none’, border: ‘none’, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, gap: 3, cursor: ‘pointer’, padding: ‘4px 0’ },
navLabel: { fontSize: 9.5 },
navIndicator: { position: ‘absolute’, top: -8, left: ‘50%’, transform: ‘translateX(-50%)’, width: 4, height: 4, borderRadius: 2, background: BRAND.gold },

heroCard: { background: BRAND.navy, borderRadius: 16, padding: 16, color: ‘#FDFCF8’ },
heroTop: { display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘flex-start’, marginBottom: 14 },
heroGreeting: { fontWeight: 800, fontSize: 15.5, letterSpacing: -0.2 },
heroSub: { fontSize: 11.5, color: ‘#9AA3C2’, marginTop: 2 },
progressTrack: { height: 6, background: ‘rgba(255,255,255,0.15)’, borderRadius: 4, overflow: ‘hidden’ },
progressFill: { height: ‘100%’, borderRadius: 4, transition: ‘width 0.4s ease’ },
progressLabels: { display: ‘flex’, justifyContent: ‘space-between’, marginTop: 8, fontSize: 9.5 },

quickGrid: { display: ‘grid’, gridTemplateColumns: ‘1fr 1fr’, gap: 10, margin: ‘14px 0’ },
quickTile: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 13, padding: ‘14px 10px’, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, gap: 6, cursor: ‘pointer’, fontFamily: ‘inherit’ },
quickTileLabel: { fontSize: 11.5, fontWeight: 700, color: BRAND.navy, textAlign: ‘center’ },

activityList: { display: ‘flex’, flexDirection: ‘column’, gap: 2 },
activityRow: { display: ‘flex’, gap: 10, alignItems: ‘flex-start’, padding: ‘8px 0’ },
activityDot: { width: 6, height: 6, borderRadius: 3, background: BRAND.gold, marginTop: 6, flexShrink: 0 },
activityText: { fontSize: 12.5, fontWeight: 600, color: ‘#333B57’ },

sectionTitle: { fontWeight: 800, fontSize: 16, letterSpacing: -0.3, marginBottom: 4 },
plainTextMuted: { fontSize: 12.5, color: BRAND.textMuted, marginBottom: 4 },
plainText: { fontSize: 13.5, color: ‘#333B57’, lineHeight: 1.5 },
emptySmall: { fontSize: 12.5, color: BRAND.textMuted, padding: ‘10px 0’ },
emptyBlock: { textAlign: ‘center’, padding: ‘30px 10px’, color: BRAND.textMuted },
emptyBlockText: { fontSize: 12.5, marginTop: 8 },
empty: { textAlign: ‘center’, padding: ‘40px 20px’, color: BRAND.textMuted, fontSize: 13 },

catGrid: { display: ‘grid’, gridTemplateColumns: ‘1fr 1fr’, gap: 10, marginTop: 10 },
catCard: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: 12, textAlign: ‘left’, cursor: ‘pointer’, fontFamily: ‘inherit’ },
catCover: { position: ‘relative’, width: ‘100%’, height: 90, borderRadius: 10, background: ‘#EEF0F5’, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, overflow: ‘hidden’, marginBottom: 8 },
catCoverImg: { width: ‘100%’, height: ‘100%’, objectFit: ‘cover’ },
catCoverBadge: { position: ‘absolute’, top: 6, right: 6, background: ‘rgba(15,27,61,0.75)’, color: ‘#FFF’, fontSize: 10, fontWeight: 800, borderRadius: 10, padding: ‘2px 6px’ },
catName: { fontWeight: 800, fontSize: 13.5 },
catSub: { fontSize: 11, color: BRAND.textMuted, marginTop: 2, fontWeight: 600 },
catTitle: { fontWeight: 800, fontSize: 17, letterSpacing: -0.3, margin: ‘10px 0 10px’ },
catCount: { color: BRAND.textMuted, fontWeight: 600, fontSize: 13 },

photoGrid: { display: ‘grid’, gridTemplateColumns: ‘1fr 1fr 1fr’, gap: 6, marginTop: 8 },
photoThumb: { border: ‘none’, padding: 0, borderRadius: 8, overflow: ‘hidden’, cursor: ‘pointer’, background: ‘#EEF0F5’, aspectRatio: ‘1’, display: ‘block’ },
photoImg: { width: ‘100%’, height: ‘100%’, objectFit: ‘cover’, display: ‘block’, aspectRatio: ‘1’ },
progressPhotoCard: { position: ‘relative’, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 8, overflow: ‘hidden’ },
progressCaption: { fontSize: 10.5, padding: ‘4px 6px’, color: ‘#333B57’, fontWeight: 600 },
photoDeleteBtn: { position: ‘absolute’, top: 4, right: 4, background: ‘rgba(15,27,61,0.75)’, border: ‘none’, borderRadius: 6, padding: 4, cursor: ‘pointer’ },
photoEditTapArea: { display: ‘block’, width: ‘100%’, padding: 0, border: ‘none’, background: ‘none’, cursor: ‘pointer’ },

previewWrap: { marginTop: 8, borderRadius: 8, overflow: ‘hidden’, border: `1px solid ${BRAND.line}`, maxHeight: 140 },
modeToggleRow: { display: ‘flex’, gap: 6 },
modeToggleBtn: { flex: 1, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 6, border: `1px solid ${BRAND.line}`, background: BRAND.paper, borderRadius: 9, padding: ‘9px’, fontSize: 12, fontWeight: 700, color: BRAND.textMuted, cursor: ‘pointer’, fontFamily: ‘inherit’ },
modeToggleBtnActive: { background: BRAND.navy, color: ‘#FFF’, borderColor: BRAND.navy },
uploadTapArea: { width: ‘100%’, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, justifyContent: ‘center’, gap: 8, border: `1.5px dashed ${BRAND.gold}`, background: ‘#F3EFE3’, borderRadius: 12, padding: ‘22px 14px’, cursor: ‘pointer’, fontFamily: ‘inherit’ },
uploadHint: { fontSize: 12, fontWeight: 600, color: ‘#333B57’, textAlign: ‘center’, maxWidth: 220 },
previewImg: { width: ‘100%’, height: 140, objectFit: ‘cover’, display: ‘block’ },

lightboxOverlay: { position: ‘fixed’, inset: 0, background: ‘rgba(10,14,28,0.95)’, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, zIndex: 100, flexDirection: ‘column’ },
lightboxImg: { maxWidth: ‘92%’, maxHeight: ‘78vh’, borderRadius: 6, objectFit: ‘contain’ },
lightboxClose: { position: ‘absolute’, top: 16, right: 16, background: ‘none’, border: ‘none’, cursor: ‘pointer’ },
lightboxCounter: { position: ‘absolute’, top: 18, left: 16, color: ‘#9AA3C2’, fontSize: 12, fontWeight: 700 },
lightboxNav: { position: ‘absolute’, top: ‘50%’, transform: ‘translateY(-50%)’, background: ‘rgba(255,255,255,0.12)’, border: ‘none’, borderRadius: 20, padding: 6, cursor: ‘pointer’ },
lightboxCaption: { color: ‘#FDFCF8’, fontSize: 12.5, marginTop: 14, textAlign: ‘center’, padding: ‘0 24px’ },

fieldLabel: { fontSize: 11.5, fontWeight: 700, color: BRAND.gold, marginBottom: 6, textTransform: ‘uppercase’, letterSpacing: 0.3 },
input: { width: ‘100%’, border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: ‘10px 12px’, fontSize: 14, fontFamily: ‘inherit’, outline: ‘none’, color: BRAND.navy, boxSizing: ‘border-box’, background: BRAND.paper },
errorText: { color: ‘#B5562E’, fontSize: 12, fontWeight: 600, marginTop: 8 },
primaryBtn: { width: ‘100%’, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 7, background: BRAND.navy, color: ‘#FFF’, border: ‘none’, borderRadius: 12, padding: ‘13px’, fontWeight: 800, fontSize: 14.5, cursor: ‘pointer’ },
primaryBtn2: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 6, width: ‘100%’, background: BRAND.navy, color: ‘#FFF’, border: ‘none’, borderRadius: 12, padding: ‘12px’, fontWeight: 800, fontSize: 13.5, cursor: ‘pointer’, marginTop: 12 },
adminLink: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 5, width: ‘100%’, background: ‘none’, border: ‘none’, color: BRAND.textMuted, fontSize: 12, fontWeight: 700, marginTop: 14, cursor: ‘pointer’ },
backLink: { display: ‘flex’, alignItems: ‘center’, gap: 4, background: ‘none’, border: ‘none’, color: BRAND.textMuted, fontSize: 12, fontWeight: 700, marginTop: 12, cursor: ‘pointer’, padding: 0 },
linkBtn2: { background: ‘none’, border: ‘none’, color: ‘#3D6B66’, fontWeight: 700, fontSize: 12, cursor: ‘pointer’, marginTop: 8, padding: 0 },
roundAddBtn: { width: 36, height: 36, borderRadius: 18, background: BRAND.navy, border: ‘none’, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, cursor: ‘pointer’, flexShrink: 0 },
cancelBtn: { background: ‘none’, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: ‘0 16px’, fontWeight: 700, fontSize: 13, color: BRAND.textMuted, cursor: ‘pointer’ },
formCard: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: 14, marginTop: 12 },

chipRow: { display: ‘flex’, gap: 6, overflowX: ‘auto’, paddingBottom: 4 },
chip: { border: `1px solid ${BRAND.line}`, background: BRAND.paper, color: ‘#333B57’, borderRadius: 20, padding: ‘6px 12px’, fontSize: 12, fontWeight: 700, whiteSpace: ‘nowrap’, cursor: ‘pointer’, flexShrink: 0 },
chipActive: { background: BRAND.navy, color: ‘#FFF’, borderColor: BRAND.navy },
checklistGrid: { display: ‘grid’, gridTemplateColumns: ‘1fr 1fr’, gap: 8, marginTop: 4 },
checklistItem: { display: ‘flex’, alignItems: ‘center’, gap: 8, border: `1px solid ${BRAND.line}`, background: BRAND.paper, borderRadius: 10, padding: ‘9px 10px’, fontSize: 12, fontWeight: 700, color: ‘#333B57’, cursor: ‘pointer’, textAlign: ‘left’, fontFamily: ‘inherit’ },
checklistItemActive: { background: ‘#EEF0F5’, borderColor: BRAND.navy },
checkbox: { width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${BRAND.line}`, flexShrink: 0, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, background: BRAND.paper },
checkboxActive: { background: BRAND.navy, borderColor: BRAND.navy },
filterRow: { display: ‘flex’, gap: 6, overflowX: ‘auto’, paddingBottom: 4, marginTop: 8 },
sortRow: { display: ‘flex’, gap: 6, alignItems: ‘center’, marginTop: 8, overflowX: ‘auto’ },
sortLabel: { fontSize: 11, color: BRAND.textMuted, fontWeight: 700, flexShrink: 0 },
sortBtn: { border: ‘none’, background: ‘none’, color: BRAND.textMuted, fontSize: 11.5, fontWeight: 700, cursor: ‘pointer’, padding: ‘3px 7px’, borderRadius: 6, flexShrink: 0 },
sortBtnActive: { background: ‘#F3EFE3’, color: BRAND.gold },

searchWrap: { display: ‘flex’, alignItems: ‘center’, gap: 8, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: ‘9px 12px’, marginTop: 12 },
searchInput: { border: ‘none’, outline: ‘none’, background: ‘transparent’, fontSize: 13.5, flex: 1, fontFamily: ‘inherit’, color: BRAND.navy },

statRow2: { display: ‘grid’, gridTemplateColumns: ‘repeat(3, 1fr)’, gap: 8, marginBottom: 4 },
statCard: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: ‘10px 8px’, textAlign: ‘center’ },
statIcon: { display: ‘flex’, justifyContent: ‘center’, marginBottom: 4 },
statValue: { fontWeight: 800, fontSize: 14, letterSpacing: -0.3 },
statLabel: { fontSize: 9, color: BRAND.textMuted, marginTop: 2, fontWeight: 600, lineHeight: 1.2 },

alertBox: { display: ‘flex’, gap: 10, alignItems: ‘flex-start’, background: ‘#F7E3D8’, border: ‘1px solid #EAC4AC’, borderRadius: 12, padding: ‘10px 12px’, marginTop: 10 },
alertText: { fontSize: 12, fontWeight: 700, color: ‘#8A3E1F’ },

card: { position: ‘relative’, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 14, padding: 14, textAlign: ‘left’, fontFamily: ‘inherit’, boxShadow: ‘0 1px 2px rgba(15,27,61,0.04)’ },
cardClickArea: { display: ‘block’, width: ‘100%’, background: ‘none’, border: ‘none’, padding: 0, margin: 0, textAlign: ‘left’, cursor: ‘pointer’, fontFamily: ‘inherit’ },
cardActionsRow: { display: ‘flex’, alignItems: ‘center’, gap: 10, marginTop: 10, paddingTop: 10, borderTop: ‘1px dashed #EEF0F5’ },
cardActionBtn: { display: ‘flex’, alignItems: ‘center’, gap: 4, background: ‘none’, border: ‘none’, color: BRAND.textMuted, fontSize: 11.5, fontWeight: 700, cursor: ‘pointer’, padding: 0 },
confirmDialog: { background: ‘#FFF’, borderRadius: 16, padding: 22, width: ‘100%’, maxWidth: 320, display: ‘flex’, flexDirection: ‘column’, alignItems: ‘center’, textAlign: ‘center’ },
confirmDialogTitle: { fontWeight: 800, fontSize: 14.5, color: BRAND.navy, marginTop: 10 },
confirmDialogText: { fontSize: 12, color: BRAND.textMuted, marginTop: 6, lineHeight: 1.5 },
staffRow: { display: ‘flex’, alignItems: ‘center’, gap: 10, padding: ‘9px 0’, borderBottom: ‘1px solid #EEF0F5’ },
brochureRow: { display: ‘flex’, alignItems: ‘center’, gap: 10, padding: ‘9px 0’, borderBottom: ‘1px solid #EEF0F5’ },
brochureSection: { marginTop: 12, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 10 },
brochureSectionToggle: { display: ‘flex’, alignItems: ‘center’, gap: 8, width: ‘100%’, background: ‘none’, border: ‘none’, padding: 0, cursor: ‘pointer’, fontSize: 13, fontWeight: 700, color: BRAND.navy, fontFamily: ‘inherit’ },
brochureIcon: { width: 32, height: 32, borderRadius: 8, background: ‘#F3EFE3’, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, flexShrink: 0 },
brochureOpenBtn: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, width: 30, height: 30, borderRadius: 15, background: BRAND.navy, color: ‘#FFF’, border: ‘none’, cursor: ‘pointer’, flexShrink: 0 },

overlay: { position: ‘fixed’, inset: 0, background: ‘rgba(15,27,61,0.45)’, display: ‘flex’, alignItems: ‘flex-end’, justifyContent: ‘center’, zIndex: 50 },
sheet: { background: BRAND.cream, width: ‘100%’, maxWidth: 480, maxHeight: ‘88vh’, borderRadius: ‘20px 20px 0 0’, display: ‘flex’, flexDirection: ‘column’, overflow: ‘hidden’ },
sheetHeader: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘space-between’, padding: ‘16px 16px 10px’, borderBottom: `1px solid ${BRAND.line}`, background: BRAND.paper },
sheetTitle: { fontWeight: 800, fontSize: 16, letterSpacing: -0.2, color: BRAND.navy },
sheetBody: { padding: ‘14px 16px’, overflowY: ‘auto’ },
sheetFooter: { padding: ‘12px 16px 18px’, borderTop: `1px solid ${BRAND.line}`, background: BRAND.paper },
cardTop: { display: ‘flex’, alignItems: ‘flex-start’, gap: 10 },
cardStub: { background: BRAND.cream, border: `1px dashed ${BRAND.line}`, borderRadius: 8, padding: ‘5px 8px’, textAlign: ‘center’, flexShrink: 0 },
stubLabel: { fontSize: 8, fontWeight: 800, color: ‘#A8AEC2’, letterSpacing: 1 },
stubNo: { fontSize: 11, fontWeight: 800, color: BRAND.gold, fontFamily: “‘DM Mono’, monospace” },
cardName: { fontWeight: 800, fontSize: 14.5, letterSpacing: -0.2, marginBottom: 3 },
cardMeta: { display: ‘flex’, gap: 10, flexWrap: ‘wrap’ },
metaItem: { display: ‘flex’, alignItems: ‘center’, gap: 4, fontSize: 11.5, color: BRAND.textMuted, fontWeight: 600 },
badge: { display: ‘inline-flex’, alignItems: ‘center’, gap: 3, fontWeight: 800, padding: ‘4px 9px’, borderRadius: 20, flexShrink: 0 },
reqPreview: { marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${BRAND.line}`, fontSize: 11.5, color: ‘#3D6B66’, fontWeight: 700 },
miniRow: { display: ‘flex’, alignItems: ‘center’, gap: 8, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 10, padding: ‘6px 8px 6px 12px’, fontFamily: ‘inherit’ },
miniRowClickArea: { display: ‘flex’, alignItems: ‘center’, gap: 10, flex: 1, background: ‘none’, border: ‘none’, padding: ‘4px 0’, cursor: ‘pointer’, fontFamily: ‘inherit’, textAlign: ‘left’, minWidth: 0 },
miniCallBtn: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, width: 30, height: 30, borderRadius: 15, background: ‘#DFF0E4’, flexShrink: 0, textDecoration: ‘none’ },

tabRow: { display: ‘flex’, padding: ‘10px 16px 0’, gap: 5, overflowX: ‘auto’, position: ‘sticky’, top: 62, background: BRAND.cream, zIndex: 20 },
tabBtn: { flexShrink: 0, background: ‘#EEF0F5’, border: ‘none’, borderRadius: 9, padding: ‘8px 10px’, fontSize: 11.5, fontWeight: 700, color: BRAND.textMuted, cursor: ‘pointer’ },
tabBtnActive: { background: BRAND.navy, color: ‘#FDFCF8’ },

stageGrid: { display: ‘flex’, flexDirection: ‘column’, gap: 6 },
stageBtn: { display: ‘flex’, alignItems: ‘center’, border: `1px solid ${BRAND.line}`, background: BRAND.paper, borderRadius: 10, padding: ‘10px 12px’, fontSize: 13.5, fontWeight: 700, color: ‘#333B57’, cursor: ‘pointer’, textAlign: ‘left’ },
stageGridRead: { display: ‘flex’, flexDirection: ‘column’, gap: 2, marginTop: 6 },
progressStep: { display: ‘flex’, alignItems: ‘center’, gap: 10, padding: ‘6px 0’, fontSize: 13 },
progressDot: { width: 24, height: 24, borderRadius: 12, display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, flexShrink: 0 },
currentTag: { marginLeft: ‘auto’, fontSize: 9.5, fontWeight: 800, color: ‘#B5562E’, background: ‘#F7E3D8’, padding: ‘2px 7px’, borderRadius: 8 },

itemRow: { display: ‘flex’, alignItems: ‘center’, gap: 10, padding: ‘9px 0’, borderBottom: ‘1px solid #EEF0F5’ },
itemDesc: { fontSize: 13.5, fontWeight: 700 },
itemSub: { fontSize: 11.5, color: BRAND.textMuted, marginTop: 1 },
itemAmount: { fontSize: 13, fontWeight: 800, fontFamily: “‘DM Mono’, monospace” },
addRow: { display: ‘flex’, gap: 8, marginTop: 12 },
addBtn: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 6, width: ‘100%’, background: ‘#EEF0F5’, border: `1px dashed ${BRAND.line}`, borderRadius: 10, padding: ‘9px’, fontSize: 12.5, fontWeight: 700, color: ‘#333B57’, marginTop: 8, cursor: ‘pointer’ },
totalBar: { display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘center’, marginTop: 16, padding: ‘12px 14px’, background: BRAND.navy, borderRadius: 10, color: ‘#FDFCF8’, fontSize: 13, fontWeight: 700 },
totalAmt: { fontSize: 16, fontWeight: 800, fontFamily: “‘DM Mono’, monospace” },
payStrip: { display: ‘flex’, justifyContent: ‘space-around’, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: ‘12px 8px’, marginTop: 10 },
moneyLabel: { fontSize: 9.5, color: ‘#A8AEC2’, fontWeight: 700, letterSpacing: 0.3, textTransform: ‘uppercase’ },
moneyValue: { fontSize: 13, fontWeight: 800, fontFamily: “‘DM Mono’, monospace”, marginTop: 1 },

reqRow: { display: ‘flex’, gap: 10, alignItems: ‘flex-start’, padding: ‘9px 0’, borderBottom: ‘1px solid #EEF0F5’ },
reqCatBadge: { fontSize: 9.5, fontWeight: 800, background: ‘#F3EFE3’, color: BRAND.gold, borderRadius: 6, padding: ‘3px 7px’, flexShrink: 0, marginTop: 1 },
reqText: { fontSize: 13, color: ‘#333B57’, lineHeight: 1.4 },
reqGroupHeader: { fontSize: 12.5, fontWeight: 800, color: BRAND.navy, marginBottom: 2, marginTop: 6 },
reqGroupCount: { color: BRAND.textMuted, fontWeight: 600 },
reqMetaRow: { display: ‘flex’, alignItems: ‘center’, gap: 6, marginTop: 3, flexWrap: ‘wrap’ },
reqDim: { fontSize: 10.5, fontWeight: 700, color: BRAND.navy, background: ‘#EEF0F5’, borderRadius: 6, padding: ‘2px 6px’ },
reqPriorityTag: { fontSize: 10, fontWeight: 800, borderRadius: 6, padding: ‘2px 6px’ },

starRow: { display: ‘flex’, gap: 6, marginTop: 12 },
starBtn: { background: ‘none’, border: ‘none’, cursor: ‘pointer’, padding: 2 },
reviewPreview: { marginTop: 18, padding: 12, background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 10 },
reviewCard: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 12, marginTop: 10 },

convertedTag: { display: ‘flex’, alignItems: ‘center’, gap: 4, fontSize: 10.5, color: ‘#2F7D4F’, fontWeight: 700, marginTop: 5 },

previewLinkBtn: { display: ‘flex’, alignItems: ‘center’, gap: 4, background: BRAND.navy, color: ‘#FFF’, border: ‘none’, borderRadius: 20, padding: ‘6px 11px’, fontSize: 11, fontWeight: 700, cursor: ‘pointer’ },
viewQuoteBtn: { display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’, gap: 6, width: ‘100%’, background: BRAND.navy, color: ‘#FFF’, border: ‘none’, borderRadius: 10, padding: ‘11px’, fontSize: 12.5, fontWeight: 700, cursor: ‘pointer’, marginTop: 10 },
estItemRow: { display: ‘flex’, alignItems: ‘center’, gap: 8, padding: ‘9px 0’, borderBottom: ‘1px solid #EEF0F5’ },
estItemNo: { width: 18, fontSize: 11, fontWeight: 700, color: BRAND.textMuted, flexShrink: 0 },

quoteDoc: { background: ‘#FFF’, padding: ‘20px 18px 30px’ },
quoteHeader: { display: ‘flex’, alignItems: ‘center’, gap: 12, paddingBottom: 14, borderBottom: `2px solid ${BRAND.navy}` },
quoteBizName: { fontWeight: 800, fontSize: 16, color: BRAND.navy, letterSpacing: -0.2 },
quoteBlessingLine: { textAlign: ‘center’, fontSize: 12, fontWeight: 700, color: BRAND.gold, marginBottom: 10 },
quoteDocTitle: { fontSize: 11.5, color: ‘#333B57’, fontWeight: 700, marginTop: 1 },
quoteBizTagline: { fontSize: 10.5, color: BRAND.gold, fontWeight: 700, marginTop: 1 },
quoteBizContact: { fontSize: 10.5, color: BRAND.textMuted, marginTop: 3, fontWeight: 600 },
quoteAddressRow: { padding: ‘8px 0’, borderBottom: `1px solid ${BRAND.line}`, fontSize: 11.5 },
quoteCustRow: { display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘flex-start’, padding: ‘14px 0’, borderBottom: `1px solid ${BRAND.line}` },
quoteLabel: { fontSize: 9.5, fontWeight: 800, color: BRAND.gold, textTransform: ‘uppercase’, letterSpacing: 0.5, marginBottom: 3 },
quoteCustName: { fontSize: 14, fontWeight: 800, color: BRAND.navy },
quoteCustSub: { fontSize: 11.5, color: ‘#333B57’, marginTop: 1 },
quoteTableWrap: { overflowX: ‘auto’, marginTop: 14 },
quoteTable: { width: ‘100%’, borderCollapse: ‘collapse’, fontSize: 11 },
qth: { textAlign: ‘center’, padding: ‘7px 6px’, background: BRAND.navy, color: ‘#FFF’, fontWeight: 700, fontSize: 10, whiteSpace: ‘nowrap’ },
qtd: { textAlign: ‘center’, padding: ‘7px 6px’, borderBottom: `1px solid ${BRAND.line}`, whiteSpace: ‘nowrap’ },
quoteTotalRow: { display: ‘flex’, justifyContent: ‘space-between’, alignItems: ‘center’, marginTop: 14, padding: ‘12px 14px’, background: BRAND.navy, borderRadius: 8, color: ‘#FFF’ },
quoteTotalAmt: { fontSize: 17, fontWeight: 800, fontFamily: “‘DM Mono’, monospace” },
quoteTermsTitle: { fontWeight: 800, fontSize: 13, color: BRAND.navy, marginTop: 22, paddingBottom: 6, borderBottom: `1px solid ${BRAND.line}` },
quoteTermSection: { marginTop: 12 },
quoteTermHeading: { fontWeight: 800, fontSize: 11.5, color: BRAND.navy, marginBottom: 3 },
quoteTermPoint: { fontSize: 11, color: ‘#333B57’, lineHeight: 1.6, paddingLeft: 4 },
quoteFooter: { textAlign: ‘center’, fontSize: 12, fontWeight: 700, color: BRAND.gold, marginTop: 22, paddingTop: 14, borderTop: `1px solid ${BRAND.line}` },
hintText: { fontSize: 10.5, color: BRAND.textMuted, marginTop: 5, lineHeight: 1.4 },
liveCalcBox: { display: ‘flex’, flexDirection: ‘column’, gap: 2, background: ‘#F3EFE3’, borderRadius: 8, padding: ‘8px 10px’, marginTop: 8, fontSize: 11.5, color: ‘#5A4E2E’ },

apptCard: { background: BRAND.paper, border: `1px solid ${BRAND.line}`, borderRadius: 12, padding: 14, marginTop: 10 },
apptRow: { display: ‘flex’, justifyContent: ‘space-between’, gap: 10, padding: ‘7px 0’, borderBottom: ‘1px solid #EEF0F5’ },
apptRowLabel: { fontSize: 11.5, color: BRAND.textMuted, fontWeight: 700, flexShrink: 0 },
apptRowValue: { fontSize: 12.5, color: ‘#333B57’, fontWeight: 600, textAlign: ‘right’ },
apptConfirmedBlock: { display: ‘flex’, alignItems: ‘center’, gap: 10, background: ‘#DFF0E4’, borderRadius: 10, padding: ‘10px 12px’, margin: ‘8px 0’ },
apptConfirmedDate: { fontWeight: 800, fontSize: 13.5, color: ‘#1F5C38’ },

toast: { position: ‘fixed’, bottom: 90, left: ‘50%’, transform: ‘translateX(-50%)’, color: ‘#FFF’, padding: ‘9px 18px’, borderRadius: 20, fontSize: 12.5, fontWeight: 700, zIndex: 60, maxWidth: ‘85%’, textAlign: ‘center’ },
};