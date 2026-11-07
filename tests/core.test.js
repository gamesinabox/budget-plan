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
  const s = { takeHome: 1000, europeFund: 0, items: [{ amt: 300, per: 'week', group: 'Rent', bill: true }, { amt: 100, per: 'week', group: 'Groceries' }],
    tracker: [{ date: '2026-11-02', v: { Groceries: 130 } }], log: [] };
  const w = Core.weekStatus(s, '2026-11-07');
  assert.equal(w.left, -30);
  assert.equal(w.daysLeft, 2);
  assert.equal(w.save, 570); // rent assumed at plan, groceries at actual
  assert.equal(w.short, 30);
  const fav = Core.favourites([{ name: 'Coke', amt: 3, group: 'x' }, { name: 'coke', amt: 3.5, group: 'x' }, { name: 'Pie', amt: 6 }]);
  assert.equal(fav[0].count, 2);
  assert.equal(fav[0].amt, 3.5);
});

test('money in, out and saved are told apart', () => {
  const k = s => Core.guessKind(s, {});
  assert.equal(k('pay'), 'in');
  assert.equal(k('Mum paid me back'), 'in');
  assert.equal(k('tax refund'), 'in');
  assert.equal(k('pay rent'), 'out');
  assert.equal(k('rent'), 'out');
  assert.equal(k('car insurance'), 'out');
  assert.equal(k('to savings'), 'save');
  assert.equal(k('house fund'), 'save');
  assert.equal(Core.guessKind('bonus', { bonus: 'out' }), 'out');
  const goals = Core.defaultGoals({ saveStart: 100 }).concat({ id: 'g1', name: 'New car', target: 5000 });
  assert.equal(Core.guessGoal('europe fund', goals), 'europe');
  assert.equal(Core.guessGoal('car savings', goals), 'g1');
  assert.equal(Core.guessGoal('savings', goals), 'house');
});

test('goals, deadline and account balance', () => {
  const s = { takeHome: 1000, europeFund: 100, items: [{ amt: 500, per: 'week', group: 'Rent' }], planStart: '2026-11-06', depart: '2027-11-06',
    saveStart: 0, rate: 0, price: 100000, depositPct: 10, costs: 0, duty: 0, houseShare: 100, reserve: 0, houseBy: '2027-06',
    scenarios: { mid: { mult: 1, flight: 0, inter: 0, ins: 0, cont: 0 } }, itinerary: [], fx: 1, travellers: 1, tripShare: 100, ring: 2000, scenario: 'mid',
    goals: [{ id: 'g1', name: 'Bike', target: 1000, by: '2027-11-06', weekly: 50, start: 0 }],
    log: [{ t: '2026-11-07T10:00:00', kind: 'save', group: 'g1', amt: 200 }, { t: '2026-11-07T11:00:00', kind: 'in', amt: 1000 }, { t: '2026-11-07T12:00:00', amt: 30 }] };
  assert.equal(Core.plan(s).housePre, 350); // 1000 - 500 - 100 europe - 50 bike
  assert.equal(Core.simulate(s, Core.plan(s)).length, 8); // Nov 2026 to Jun 2027
  assert.equal(Core.endLabel(s), 'Jun 2027');
  const bike = Core.goalInfo(s, s.goals[0], '2026-11-06');
  assert.equal(bike.saved, 200);
  assert.ok(bike.ok); // needs 800 over 52 weeks = 15.4/wk, planning 50
  const trip = Core.goalInfo(s, { id: 'europe', link: 'europe', start: 0 }, '2026-11-06');
  assert.equal(trip.target, 2000);
  assert.equal(Core.balance(s), null);
  s.bal = { amt: 500, at: '2026-11-07T10:30:00' };
  assert.equal(Core.balance(s), 1470); // +1000 in, -30 out; the earlier transfer is before the balance was set
});

test('a monthly bill counts at its weekly share, whichever week it is paid', () => {
  const items = [{ name: 'Car insurance', amt: 52, per: 'month', group: 'Car', bill: true }, { name: 'Fuel', amt: 40, per: 'week', group: 'Car' },
    { name: 'Rego (and CTP)', amt: 520, per: 'year', group: 'Car', bill: true }, { name: 'Rent', amt: 300, per: 'week', group: 'Rent', bill: true },
    { name: 'Phone & wifi', amt: 60, per: 'month', group: 'Phone & wifi', bill: true }];
  assert.equal(Core.matchBill('car insurance', items), 'Car insurance');
  assert.equal(Core.matchBill('pay rent', items), 'Rent');
  assert.equal(Core.matchBill('rego', items), 'Rego (and CTP)');
  assert.equal(Core.matchBill('phone bill', items), 'Phone & wifi');
  assert.equal(Core.matchBill('fuel', items), null); // not a bill
  const s = { takeHome: 1000, europeFund: 0, items, tracker: [], log: [] };
  const quiet = Core.weekStatus(s, '2026-11-07');
  const tr = s.tracker, add = (e) => { s.log.push(e); Core.addToTracker(tr, e.t.slice(0, 10), e.group, e.amt); };
  add({ t: '2026-11-03T09:00:00', name: 'car insurance', amt: 52, group: 'Car', bill: 'Car insurance' });
  add({ t: '2026-11-04T09:00:00', name: 'petrol', amt: 30, group: 'Car' });
  const w = Core.weekStatus(s, '2026-11-07');
  assert.equal(w.save, quiet.save); // paying the bill this week changes nothing; petrol is under the fuel plan
  assert.equal(w.spent.Car, 30);
  assert.equal(w.plan.Car, 40);
  assert.equal(Core.billPaidIn(s.log, '2026-11-02', '2026-11-09'), 52);
  const bs = Core.billStatus(s, '2026-11-07');
  assert.deepEqual(bs.map(b => [b.name, b.paid, b.done]), [['Car insurance', 52, true], ['Rego (and CTP)', 0, false], ['Rent', 0, false], ['Phone & wifi', 0, false]]);
});
