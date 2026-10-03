import assert from 'node:assert/strict';
import {
  PROPERTY_TYPES, NEED_OPTIONS, TIMELINES, BUDGET_BANDS,
  normalizeProfile, profileCompleteness, isProfileIncomplete, profileSummary, timelineLabel, budgetLabel,
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

console.log(n + ' assertions passed\n');
