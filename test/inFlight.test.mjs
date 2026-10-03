import assert from 'node:assert/strict';
import { createInFlightCounter } from '../src/jobCore.js';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

console.log('createInFlightCounter');

t('starts idle', () => {
  const g = createInFlightCounter();
  assert.equal(g.active, false);
  assert.equal(g.depth, 0);
});

t('one write holds the guard until it finishes', () => {
  const g = createInFlightCounter();
  g.enter();
  assert.equal(g.active, true);
  g.leave();
  assert.equal(g.active, false);
});

t('the guard holds while a SECOND write is still running', () => {
  // This is the exact bug: with a boolean, A finishing unlocked the
  // guard while B was still in flight, and the snapshot that landed
  // then reverted B's change.
  const g = createInFlightCounter();
  g.enter();            // save A starts
  g.enter();            // save B starts
  g.leave();            // A finishes
  assert.equal(g.active, true, 'guard must stay up while B is in flight');
  g.leave();            // B finishes
  assert.equal(g.active, false);
});

t('deeply nested writes all have to finish', () => {
  const g = createInFlightCounter();
  for (let i = 0; i < 5; i++) g.enter();
  for (let i = 0; i < 4; i++) { g.leave(); assert.equal(g.active, true); }
  g.leave();
  assert.equal(g.active, false);
});

t('an extra leave cannot unlock the guard', () => {
  const g = createInFlightCounter();
  g.leave(); g.leave();
  assert.equal(g.depth, 0);
  g.enter();
  assert.equal(g.active, true, 'a stray leave must not leave the count negative');
  g.leave();
  assert.equal(g.active, false);
});

t('enter and leave report the resulting depth', () => {
  const g = createInFlightCounter();
  assert.equal(g.enter(), 1);
  assert.equal(g.enter(), 2);
  assert.equal(g.leave(), 1);
  assert.equal(g.leave(), 0);
});

console.log(n + ' assertions passed\n');
