import assert from 'node:assert/strict';
import {
  PROPERTY_TYPES, NEED_OPTIONS, TIMELINES, BUDGET_BANDS,
  normalizeProfile, profileForEditing, profileCompleteness, isProfileIncomplete, profileSummary, timelineLabel, budgetLabel,
} from '../src/customerProfile.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('customerProfile');

t('a record saved before these fields existed reads as empty, not broken', () => {
  for (const c of [undefined, null, {}, { name: 'Ravi', phone: '99' }]) {
    const p = normalizeProfile(c);
    assert.deepEqual(p, { area: '', propertyType: '', needs: [], timeline: '', budget: '' });
    assert.equal(profileCompleteness(c), 0);
    assert.equal(isProfileIncomplete(c), true);
    assert.equal(profileSummary(c), '');
  }
});

t('a value that is not on the list is dropped rather than stored', () => {
  const p = normalizeProfile({ propertyType: '7 BHK', timeline: 'whenever', budget: 'a crore', needs: ['Wardrobe', 'Spaceship'] });
  assert.equal(p.propertyType, '');
  assert.equal(p.timeline, '');
  assert.equal(p.budget, '');
  assert.deepEqual(p.needs, ['Wardrobe']);
});

t('needs survives a non-array', () => {
  assert.deepEqual(normalizeProfile({ needs: 'Wardrobe' }).needs, []);
  assert.deepEqual(normalizeProfile({ needs: null }).needs, []);
});

t('area is trimmed', () => {
  assert.equal(normalizeProfile({ area: '  Nava Naroda  ' }).area, 'Nava Naroda');
  assert.equal(normalizeProfile({ area: '   ' }).area, '');
  assert.equal(normalizeProfile({ area: 42 }).area, '');
});

t('completeness counts every field', () => {
  assert.equal(profileCompleteness({ area: 'Nikol' }), 20);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK' }), 40);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK', needs: ['Wardrobe'] }), 60);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK', needs: ['Wardrobe'], timeline: 'now' }), 80);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK', needs: ['Wardrobe'], timeline: 'now', budget: '1_2l' }), 100);
});

t('an empty needs array does not count as filled', () => {
  assert.equal(profileCompleteness({ area: 'Nikol', needs: [] }), 20);
});

t('a complete profile is not flagged as incomplete', () => {
  const full = { area: 'Nava Naroda', propertyType: '2 BHK', needs: ['Full home'], timeline: 'now', budget: 'unsure' };
  assert.equal(isProfileIncomplete(full), false);
});

t('the summary shows only what was given', () => {
  assert.equal(profileSummary({ area: 'Nava Naroda' }), 'Nava Naroda');
  assert.equal(
    profileSummary({ area: 'Nikol', propertyType: '3 BHK', needs: ['Wardrobe', 'Modular kitchen'], timeline: 'now' }),
    'Nikol · 3 BHK · Wardrobe, Modular kitchen · Ready to start'
  );
  assert.equal(profileSummary({ propertyType: '2 BHK', timeline: 'looking' }), '2 BHK · Just looking');
});

t('a long needs list is capped so the card does not wrap away', () => {
  const needs = NEED_OPTIONS.slice(0, 6);
  const s = profileSummary({ needs });
  assert.ok(s.includes('+3'), 'expected a +3 overflow marker, got: ' + s);
  assert.ok(s.split(',').length <= 3);
});

t('budget bands cover the real spread of this business\'s jobs', () => {
  // 17 priced estimates run Rs 50,750 to Rs 6,31,655, median 2,72,500.
  assert.ok(BUDGET_BANDS.length >= 5);
  assert.equal(BUDGET_BANDS[0].value, 'unsure', 'the honest answer should come first');
  assert.equal(new Set(BUDGET_BANDS.map((b) => b.value)).size, BUDGET_BANDS.length);
  assert.equal(budgetLabel('2_35l'), '2 - 3.5 lakh');
  assert.equal(budgetLabel('nonsense'), '');
});

t('the partner trades are offered, and sit after the furniture', () => {
  // Colour/POP and electrical are DH Home Decor's work. A furniture
  // customer may want them handled too; they are never the headline.
  assert.ok(NEED_OPTIONS.includes('Colour / POP work'));
  assert.ok(NEED_OPTIONS.includes('Electrical work'));
  assert.ok(NEED_OPTIONS.indexOf('Colour / POP work') > NEED_OPTIONS.indexOf('Wardrobe'));
  assert.equal(NEED_OPTIONS[0], 'Full home');
});

t('timelineLabel is safe for an unknown value', () => {
  assert.equal(timelineLabel('now'), 'Ready to start');
  assert.equal(timelineLabel('nonsense'), '');
  assert.equal(timelineLabel(undefined), '');
});

t('the option lists are non-empty and unique', () => {
  for (const [name, list] of [['PROPERTY_TYPES', PROPERTY_TYPES], ['NEED_OPTIONS', NEED_OPTIONS]]) {
    assert.ok(list.length > 0, name + ' is empty');
    assert.equal(new Set(list).size, list.length, name + ' has duplicates');
  }
  assert.equal(new Set(TIMELINES.map((x) => x.value)).size, TIMELINES.length);
});

t('reading a profile does not modify the customer', () => {
  const c = { area: ' Nikol ', propertyType: '3 BHK', needs: ['Wardrobe', 'Nope'], timeline: 'now' };
  const before = JSON.stringify(c);
  normalizeProfile(c); profileCompleteness(c); profileSummary(c);
  assert.equal(JSON.stringify(c), before);
});

// --- where the details actually surface -----------------------------
// They were only on the customer LIST card and in the edit dialog.
// Neither is where an admin works, so in practice the answers a
// customer gave were invisible and looked like they had not saved.
import fs from 'node:fs';
const admin = fs.readFileSync(new URL('../src/AdminApp.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

t('the job detail screen shows the customer details', () => {
  assert.ok(/function CustomerDetailsCard\(/.test(admin), 'no card component');
  const detail = admin.slice(admin.indexOf('function AdminJobDetail('));
  assert.ok(/<CustomerDetailsCard/.test(detail), 'the job detail does not render it');
  assert.ok(/customer=\{customers\.find/.test(admin), 'the customer is never passed to the job detail');
});

t('an admin can fill the details in from the job screen', () => {
  const card = admin.slice(admin.indexOf('function CustomerDetailsCard('), admin.indexOf('function AdminJobDetail('));
  assert.ok(/<CustomerProfileFields/.test(card), 'the card has no editable fields');
  assert.ok(/onSaveCustomer\(/.test(card), 'the card cannot save');
});

t('staff see customer changes without restarting the app', () => {
  assert.ok(/customersStore\.subscribe\(/.test(app),
    'the customer list is still fetched once per session and never updated');
  const sub = app.slice(app.indexOf('customersStore.subscribe(') - 600, app.indexOf('customersStore.subscribe(') + 400);
  assert.ok(/role === 'customer'/.test(sub), 'a customer must not subscribe to the whole customer list');
  assert.ok(/customersWriteInFlightRef/.test(sub), 'a snapshot could revert a local write');
});

t('the area box keeps the space you just typed', () => {
  // The bug in one line: a value passing back through normalizeProfile
  // on every keystroke loses the space the instant it is pressed, so a
  // second word can never be reached and nobody could type an address.
  assert.equal(normalizeProfile({ area: 'Nava ' }).area, 'Nava', 'normalizeProfile still trims - that is its job');
  assert.equal(profileForEditing({ area: 'Nava ' }).area, 'Nava ', 'the editor must not');

  // Typed one character at a time, which is how it actually failed.
  let typed = '';
  for (const ch of 'Nava Naroda') typed = profileForEditing({ area: typed + ch }).area;
  assert.equal(typed, 'Nava Naroda');

  // A whole address, spaces and punctuation intact.
  const addr = 'B-404, Shivalik Residency, Nava Naroda ';
  assert.equal(profileForEditing({ area: addr }).area, addr);
});

t('the editor agrees with normalizeProfile on everything else', () => {
  const rich = { area: ' x ', propertyType: '3 BHK', needs: ['Wardrobe'], timeline: 'soon', budget: '2_35l' };
  const e = profileForEditing(rich);
  assert.equal(e.propertyType, '3 BHK');
  assert.deepEqual(e.needs, ['Wardrobe']);
  assert.equal(e.timeline, 'soon');
  assert.equal(e.budget, '2_35l');
  assert.equal(profileForEditing(null).area, '');
  assert.equal(profileForEditing({ area: 42 }).area, '', 'a non-string area is still empty, not "42"');
});



// The full profile, reachable from inside a job.
//
// Everything known about a customer - every app visit, what the job
// made, who they referred - already had a screen. Only the customer
// list could open it, so from inside a job you had to back out, find
// the person again and open them. The owner asked for it on the job.
t('the job screen can open the full customer profile', () => {
  const card = admin.slice(admin.indexOf('function CustomerDetailsCard('), admin.indexOf('function AdminJobDetail('));
  assert.ok(/onOpenProfile/.test(card), 'the details card offers no way through to the profile');
  assert.ok(/onOpenProfile\(customer\.id\)/.test(card), 'the card does not say which customer to open');

  const detail = admin.slice(admin.indexOf('function AdminJobDetail('));
  assert.ok(/onOpenCustomerProfile/.test(detail.slice(0, 400)), 'the job detail does not take the handler');
  assert.ok(/onOpenProfile=\{onOpenCustomerProfile\}/.test(detail), 'the job detail never passes it to the card');
});

t('the profile opens above the job, and Back returns to it', () => {
  const top = admin.slice(0, admin.indexOf('function AdminHome('));
  assert.ok(/const \[profileCustomerId, setProfileCustomerId\] = useState\(null\)/.test(top),
    'AdminApp does not hold the open profile');
  assert.ok(/useBackToClose\(!!profileCustomerId/.test(top), 'Android Back will not close it');
  // Rendered before the job, so it sits over it rather than replacing
  // the job in the stack.
  const profileAt = top.indexOf('if (profileCustomer)');
  const jobAt = top.indexOf('if (activeJob)');
  assert.ok(profileAt > -1 && jobAt > -1 && profileAt < jobAt,
    'the profile must be checked before the job so Back lands on the job');
  assert.ok(/onOpenCustomerProfile=\{setProfileCustomerId\}/.test(top),
    'the job detail is never wired to open it');
});

t('the profile says where Back goes, and hides what it cannot do', () => {
  const prof = admin.slice(admin.indexOf('export function AdminCustomerProfile('));
  assert.ok(/backLabel = 'Customers'/.test(prof), 'the back label is not settable, so it always says Customers');
  assert.ok(/\{backLabel\}/.test(prof), 'the back button ignores the label');
  // The name-and-phone dialog belongs to the customer list. Opened from
  // a job there is nothing to open, so the button must not be there.
  assert.ok(/\{onEdit && <button/.test(prof), 'Edit details shows even when there is no editor behind it');
});

console.log(n + ' assertions passed\n');
