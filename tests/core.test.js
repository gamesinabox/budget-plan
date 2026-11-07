// Run with: node --test
// Your real-figure acceptance tests live in acceptance.local.test.js (gitignored), so they never reach GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

test('edge cases never give NaN and dates are checked', () => {
  const blank = { takeHome: '', items: [{ amt: '', per: 'week' }], europeFund: '', itinerary: [{ days: '', eur: '' }],
    scenarios: { mid: {} }, fx: '', travellers: '', tripShare: '', ring: '', depart: '2026-01-01', planStart: '2026-11-06' };
  const p = Core.plan(blank);
  Object.values(p).forEach(v => assert.ok(!Number.isNaN(v)));
  const t = Core.trip(blank, 'mid');
  assert.ok(Number.isNaN(t.need), 'departure before start gives no weekly figure, so the UI shows "Check the dates"');
  assert.ok(!Number.isNaN(t.total));
  assert.equal(Core.readyIndex([{ bal: 1 }], 1e9), -1, 'never reached, so the UI shows "Not by Dec 2030"');
});

test('categoriser', () => {
  const g = s => Core.guessGroup(s, {});
  assert.equal(g('can of soft drink'), 'Eating out & social');
  assert.equal(g('Coke'), 'Eating out & social');
  assert.equal(g('2 coffees'), 'Eating out & social');
  assert.equal(g('Woolies shop'), 'Groceries');
  assert.equal(g('petrol'), 'Car');
  assert.equal(g('Uber Eats'), 'Eating out & social');
  assert.equal(g('Uber'), 'Car');
  assert.equal(g('parking fine'), 'Buffer');
  assert.equal(g('haircut'), 'Personal & health');
  assert.equal(g('mystery thing'), 'Buffer');
  assert.equal(g('   '), null);
  // what you chose before wins, exact name or as a word inside a new name
  assert.equal(Core.guessGroup('Coke', { coke: 'Groceries' }), 'Groceries');
  assert.equal(Core.guessGroup('zooper dooper x2', { 'zooper dooper': 'Groceries' }), 'Groceries');
});

test('logging rolls into the tracker week and undoes cleanly', () => {
  const tr = [];
  Core.addToTracker(tr, '2026-11-07', 'Groceries', 3.1); // Saturday, so the week starts Mon 2 Nov
  Core.addToTracker(tr, '2026-11-02', 'Groceries', 0.2);
  assert.deepEqual(tr, [{ date: '2026-11-02', v: { Groceries: 3.3 } }]);
  Core.addToTracker(tr, '2026-11-09', 'Car', 50);
  assert.equal(tr.length, 2);
  Core.addToTracker(tr, '2026-11-07', 'Groceries', -3.3);
  assert.deepEqual(tr[0].v, {});
  assert.equal(Core.weekStart('2026-11-08'), '2026-11-02'); // Sunday
});

test('week status', () => {
  const s = { takeHome: 1000, europeFund: 0, items: [{ amt: 300, per: 'week', group: 'Rent' }, { amt: 100, per: 'week', group: 'Groceries' }] };
  const w = Core.weekStatus(s, { Groceries: 130 }, '2026-11-07');
  assert.equal(w.left, -30);
  assert.equal(w.daysLeft, 2);
  assert.equal(w.save, 570); // rent assumed at plan, groceries at actual
  assert.equal(w.short, 30);
  const fav = Core.favourites([{ name: 'Coke', amt: 3, group: 'x' }, { name: 'coke', amt: 3.5, group: 'x' }, { name: 'Pie', amt: 6 }]);
  assert.equal(fav[0].count, 2);
  assert.equal(fav[0].amt, 3.5);
});
