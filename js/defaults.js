/* Demo starting data: same shape as the real plan, round example numbers.
   Real figures live in personal.json (gitignored). Load it once through Plan > Settings > Restore from file. */
window.DEFAULTS = {
  takeHome: 1200,
  items: [
    { name: 'Rent', amt: 400, per: 'week', group: 'Rent', bill: true },
    { name: 'Groceries', amt: 100, per: 'week', group: 'Groceries' },
    { name: 'Fuel', amt: 160, per: 'month', group: 'Car' },
    { name: 'Car insurance', amt: 100, per: 'month', group: 'Car', bill: true },
    { name: 'Rego (and CTP)', amt: 900, per: 'year', group: 'Car', bill: true },
    { name: 'Car servicing', amt: 400, per: 'year', group: 'Car', bill: true },
    { name: 'Phone & wifi', amt: 120, per: 'month', group: 'Phone & wifi', bill: true },
    { name: 'Eating out & social', amt: 80, per: 'week', group: 'Eating out & social' },
    { name: 'Personal, clothes, health & gifts', amt: 50, per: 'week', group: 'Personal & health' },
    { name: 'Buffer (repairs, surprises)', amt: 40, per: 'week', group: 'Buffer' }
  ],
  europeFund: 200,
  fx: 1.6, travellers: 2, depart: '2028-06-01', planStart: '2026-11-06', ring: 5000, tripShare: 50, scenario: 'mid',
  itinerary: [
    { c: 'UK', days: 5, eur: 150 }, { c: 'Netherlands', days: 3, eur: 120 }, { c: 'Germany', days: 4, eur: 110 },
    { c: 'France', days: 5, eur: 150 }, { c: 'Italy', days: 7, eur: 130 }, { c: 'Croatia', days: 6, eur: 110 }
  ],
  scenarios: {
    lean: { mult: 0.65, flight: 2600, inter: 600, ins: 700, cont: 0 },
    mid: { mult: 1, flight: 2800, inter: 750, ins: 700, cont: 10 },
    comfy: { mult: 1.35, flight: 3200, inter: 900, ins: 700, cont: 10 }
  },
  price: 800000, depositPct: 20, costs: 5000, duty: 0, houseShare: 50, reserve: 30000,
  saveStart: 25000, rate: 4, mortRate: 6, houseBy: '2030-12',
  tracker: [],
  log: [],
  learned: {}
};
