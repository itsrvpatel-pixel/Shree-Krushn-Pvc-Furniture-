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
  LEAD_NEEDS, LEAD_SIZES, LEAD_MAX, normalizeLeadPhone, normalizeLead,
  leadFailureMessage, leadSummary, leadLoadMessage,
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
  const optionsOf = (html, selectName) => {
    const at = html.indexOf('name="' + selectName + '"');
    const block = html.slice(at, html.indexOf('</select>', at));
    return [...block.matchAll(/<option(?: value="")?>([^<]+)<\/option>/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/\(optional\)/.test(v));
  };
  assert.deepEqual(optionsOf(page, 'need'), LEAD_NEEDS,
    'the page offers a need the validator will throw away');
  assert.deepEqual(optionsOf(page, 'size'), LEAD_SIZES,
    'the page offers a size the validator will throw away');
  // And the template the page is built from, so a rebuild cannot
  // reintroduce the drift.
  const tpl = readFileSync(new URL('../tools/a.tpl', import.meta.url), 'utf8');
  for (const value of [...LEAD_NEEDS, ...LEAD_SIZES]) {
    assert.ok(tpl.includes('>' + value + '<'), 'the template is missing: ' + value);
  }
});

t('how big the place is survives the round trip', () => {
  // The thing he asks first on the phone. An enquiry without it is a
  // call that has to happen before the job can be judged at all.
  const res = normalizeLead({ name: 'Ramesh', phone: '9876543210', need: 'Kitchen', size: '2 BHK' });
  assert.equal(res.ok, true);
  assert.equal(res.lead.size, '2 BHK');
  // Optional, like need.
  assert.equal(normalizeLead({ name: 'Ramesh', phone: '9876543210' }).lead.size, '');
  // And anything the page did not offer is dropped, not stored - a bot
  // must not be able to post free text into a field read as a fact.
  for (const junk of ['5 BHK', '<script>', 'Poora ghar', 42, null, { a: 1 }]) {
    assert.equal(normalizeLead({ name: 'Ramesh', phone: '9876543210', size: junk }).lead.size, '',
      'accepted a size the form never offered: ' + JSON.stringify(junk));
  }
});

t('the summary leads with what decides the job', () => {
  const summary = leadSummary({ name: 'Ramesh', need: 'Kitchen', size: '2 BHK', area: 'Nikol' });
  assert.equal(summary, 'Ramesh - Kitchen - 2 BHK - Nikol');
  // On a push notification only the first few words survive, so size
  // comes before area: "2 BHK" decides more than "Nikol" does.
  assert.ok(summary.indexOf('2 BHK') < summary.indexOf('Nikol'));
  // Missing pieces leave no stray separators.
  assert.equal(leadSummary({ name: 'Ramesh' }), 'Ramesh');
  assert.equal(leadSummary({ name: 'Ramesh', size: '3 BHK' }), 'Ramesh - 3 BHK');
});

t('a list that will not load says which of the two things went wrong', () => {
  // "Could not load the enquiries" covered both a rules file older
  // than this collection and a phone that is simply offline. One
  // needs a paste into a console; the other needs nothing at all.
  const denied = leadLoadMessage('denied');
  assert.match(denied, /firestore\.rules/i, 'it does not name the file to paste');
  assert.match(denied, /nothing has been lost/i, 'it reads like the enquiries are gone');

  const offline = leadLoadMessage('offline');
  assert.match(offline, /internet/i);
  assert.ok(!/rules/i.test(offline), 'it sends someone to the console over a weak signal');

  // Anything else still says something, rather than nothing.
  for (const other of ['error', '', null, undefined, 'something-new']) {
    assert.ok(leadLoadMessage(other).length > 10, String(other));
  }
});

console.log(n + ' assertions passed');
