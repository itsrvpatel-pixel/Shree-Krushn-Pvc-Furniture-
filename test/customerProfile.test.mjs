import assert from 'node:assert/strict';
import {
  PROPERTY_TYPES, NEED_OPTIONS, TIMELINES,
  normalizeProfile, profileCompleteness, isProfileIncomplete, profileSummary, timelineLabel,
} from '../src/customerProfile.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('customerProfile');

t('a record saved before these fields existed reads as empty, not broken', () => {
  for (const c of [undefined, null, {}, { name: 'Ravi', phone: '99' }]) {
    const p = normalizeProfile(c);
    assert.deepEqual(p, { area: '', propertyType: '', needs: [], timeline: '' });
    assert.equal(profileCompleteness(c), 0);
    assert.equal(isProfileIncomplete(c), true);
    assert.equal(profileSummary(c), '');
  }
});

t('a value that is not on the list is dropped rather than stored', () => {
  const p = normalizeProfile({ propertyType: '7 BHK', timeline: 'whenever', needs: ['Wardrobe', 'Spaceship'] });
  assert.equal(p.propertyType, '');
  assert.equal(p.timeline, '');
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

t('completeness counts the four fields', () => {
  assert.equal(profileCompleteness({ area: 'Nikol' }), 25);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK' }), 50);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK', needs: ['Wardrobe'] }), 75);
  assert.equal(profileCompleteness({ area: 'Nikol', propertyType: '3 BHK', needs: ['Wardrobe'], timeline: 'now' }), 100);
});

t('an empty needs array does not count as filled', () => {
  assert.equal(profileCompleteness({ area: 'Nikol', needs: [] }), 25);
});

t('a complete profile is not flagged as incomplete', () => {
  const full = { area: 'Nava Naroda', propertyType: '2 BHK', needs: ['Full home'], timeline: 'now' };
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

console.log(n + ' assertions passed\n');
