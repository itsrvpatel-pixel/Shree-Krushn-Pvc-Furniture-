// The website's enquiry form.
//
// The site could only say "WhatsApp karein" or "App kholein". Both ask
// a stranger to start a conversation, and somebody looking at
// wardrobes at eleven at night does not. They left, and the business
// never knew they were there.
//
// A form is the quiet option - and it is also the one thing on a
// public site that every bot on the internet can post to. So what it
// accepts lives in one module, checked by the page and again by the
// server, because the page is not where the decision is made.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEAD_NEEDS, LEAD_MAX, normalizeLeadPhone, normalizeLead,
  leadFailureMessage, leadSummary,
} from '../src/leadForm.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('leadForm');

t('a number is taken however it was typed', () => {
  for (const given of ['9876543210', '+91 98765 43210', '+919876543210',
    '91 9876543210', '098765-43210', '(98765) 43210', ' 9876543210 ']) {
    assert.equal(normalizeLeadPhone(given), '9876543210', 'rejected: ' + given);
  }
});

t('what is not a mobile number is refused', () => {
  // Landlines, typos, and a bot filling the box with 1234567890.
  for (const bad of ['1234567890', '5555555555', '98765', '98765432101',
    '0000000000', '9999999999', 'abcdefghij', '', null, undefined]) {
    assert.equal(normalizeLeadPhone(bad), '', 'accepted: ' + String(bad));
  }
  // 9999999999 is one digit repeated; a real 9 number is fine.
  assert.equal(normalizeLeadPhone('9998887776'), '9998887776');
});

t('a good enquiry comes through cleaned up', () => {
  const { ok, lead } = normalizeLead({
    name: '  Ramesh   Patel  ', phone: '+91 98765 43210',
    need: 'Kitchen', area: ' Nikol ', message: '  2 BHK  ka kaam  ',
  });
  assert.equal(ok, true);
  assert.equal(lead.name, 'Ramesh Patel');
  assert.equal(lead.phone, '9876543210');
  assert.equal(lead.need, 'Kitchen');
  assert.equal(lead.area, 'Nikol');
  assert.equal(lead.message, '2 BHK ka kaam');
  assert.equal(lead.status, 'new');
  assert.equal(lead.source, 'website');
  assert.ok(lead.createdAt, 'no timestamp');
});

t('a name has to be a name', () => {
  assert.equal(normalizeLead({ name: 'R', phone: '9876543210' }).reason, 'name');
  assert.equal(normalizeLead({ name: '  ', phone: '9876543210' }).reason, 'name');
  assert.equal(normalizeLead({ phone: '9876543210' }).reason, 'name');
  // Digits or punctuation alone is a bot, not a person.
  assert.equal(normalizeLead({ name: '12345', phone: '9876543210' }).reason, 'name');
  assert.equal(normalizeLead({ name: '...', phone: '9876543210' }).reason, 'name');
  // Gujarati and Hindi are names.
  assert.equal(normalizeLead({ name: 'રમેશ', phone: '9876543210' }).ok, true);
  assert.equal(normalizeLead({ name: 'रमेश', phone: '9876543210' }).ok, true);
});

t('the honeypot is answered, not argued with', () => {
  // A field the page hides and a person never sees. A bot told it was
  // spotted just tries again differently, so the caller is given the
  // same answer a success gets.
  const r = normalizeLead({ name: 'Bot', phone: '9876543210', website: 'http://spam' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bot');
  assert.equal(leadFailureMessage('bot'), 'Sent');
  assert.equal(r.lead, null, 'a bot submission still produced a record');
});

t('a made-up need is dropped rather than stored', () => {
  assert.equal(normalizeLead({ name: 'Ramesh', phone: '9876543210', need: '<script>' }).lead.need, '');
  assert.equal(normalizeLead({ name: 'Ramesh', phone: '9876543210', need: LEAD_NEEDS[0] }).lead.need, LEAD_NEEDS[0]);
});

t('nothing arrives longer than it is allowed to be', () => {
  const long = normalizeLead({
    name: 'R'.repeat(500), phone: '9876543210',
    area: 'A'.repeat(500), message: 'M'.repeat(5000),
  });
  assert.equal(long.lead.name.length, LEAD_MAX.name);
  assert.equal(long.lead.area.length, LEAD_MAX.area);
  assert.equal(long.lead.message.length, LEAD_MAX.message);
});

t('every refusal says what to fix', () => {
  for (const r of ['name', 'phone']) {
    const m = leadFailureMessage(r);
    assert.ok(m && m.length > 8 && m !== r, 'no readable message for: ' + r);
  }
  assert.ok(leadFailureMessage('something-else'), 'no fallback message');
});

t('the alert reads as a person, not a record', () => {
  assert.equal(leadSummary({ name: 'Ramesh', need: 'Kitchen', area: 'Nikol' }), 'Ramesh - Kitchen - Nikol');
  assert.equal(leadSummary({ name: 'Ramesh' }), 'Ramesh');
  assert.equal(leadSummary(null), '');
});

/* ---- and that the three places agree ---- */
const api = readFileSync(new URL('../api/lead.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

t('the server checks again, with the same rules', () => {
  assert.ok(/from '\.\.\/src\/leadForm\.js'/.test(api),
    'the endpoint has its own copy of the rules, which will drift from the page');
  assert.ok(/normalizeLead\(body/.test(api), 'the endpoint trusts whatever the page sent');
});

t('a bot gets 200 and no explanation', () => {
  const block = api.slice(api.indexOf('if (!ok)'), api.indexOf('try {', api.indexOf('if (!ok)')));
  assert.ok(/reason === 'bot'/.test(block) && /status\(200\)/.test(block),
    'a bot is told it was spotted and will simply try again differently');
});

t('a saved enquiry is never lost to a failed notification', () => {
  const i = api.indexOf('sendEachForMulticast');
  assert.ok(i > 0, 'the owner is not notified at all');
  assert.ok(api.indexOf("collection('leads').add") < i, 'it notifies before saving');
  const after = api.slice(i, i + 600);
  assert.ok(/catch/.test(after), 'a push failure turns a captured lead into an error the visitor sees');
});

t('the form is on the live homepage and posts to the endpoint', () => {
  assert.ok(/id="lf"/.test(page), 'the homepage has no form');
  assert.ok(/\/api\/lead/.test(page), 'the form posts nowhere');
  assert.ok(/name="website"/.test(page), 'there is no honeypot');
  // Without JavaScript the form must not be shown at all, rather than
  // leaving a Send button that silently does nothing.
  assert.ok(/id="enquiry"[^>]*style="display:none"/.test(page),
    'the form shows even where its script cannot run');
});

t('only the server can write an enquiry', () => {
  const r = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const block = r.slice(r.indexOf('match /leads/'), r.indexOf('}', r.indexOf('allow', r.indexOf('match /leads/'))));
  assert.ok(/isStaff\(\)/.test(block), 'the leads collection is not staff-only');
  assert.ok(!/request\.auth != null;/.test(block),
    'any signed-in client can write enquiries directly, bypassing every check');
});

t('the owner has somewhere to work through them', () => {
  assert.ok(/function AdminLeads\(/.test(admin), 'there is no screen for enquiries');
  assert.ok(/window\.leads\.loadAll\(\)/.test(admin), 'the screen never loads them');
  assert.ok(/Website enquiry/.test(admin), 'there is no way to reach the screen');
  assert.ok(/whatsAppShareUrl\(r\.phone/.test(admin), 'an enquiry cannot be replied to in one tap');
});

t('the form offers exactly what the validator accepts', () => {
  // These two lists are written in different files, in different
  // languages - HTML options on the page, a JS array on the server -
  // and nothing connects them but the strings themselves. When the
  // copy was translated the page said "Full home" and the validator
  // said "Whole home", so every enquiry that picked the first option
  // had its need silently dropped: normalizeLead only keeps a need it
  // recognises, and an unrecognised one is not an error.
  const page = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
  const form = page.slice(page.indexOf('<select'), page.indexOf('</select>'));
  const offered = [...form.matchAll(/<option(?: value="")?>([^<]+)<\/option>/g)]
    .map((m) => m[1].trim())
    .filter((v) => !/\(optional\)/.test(v));
  assert.ok(offered.length >= 5, 'only ' + offered.length + ' options found - the form has moved');
  assert.deepEqual(offered, LEAD_NEEDS,
    'the page offers a need the validator will throw away');
  // And the template the page is built from, so a rebuild cannot
  // reintroduce the drift.
  const tpl = readFileSync(new URL('../tools/a.tpl', import.meta.url), 'utf8');
  for (const need of LEAD_NEEDS) {
    assert.ok(tpl.includes('>' + need + '<'), 'the template is missing: ' + need);
  }
});

console.log(n + ' assertions passed');
