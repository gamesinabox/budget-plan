/* Pure calculation functions, no DOM access.
   Classic script (not an ES module) so index.html still works when opened straight from disk:
   browsers block module scripts on file://. In the browser it sets window.Core; in Node it is module.exports. */
(function (root) {
  const GROUPS = ['Rent', 'Groceries', 'Car', 'Phone & wifi', 'Eating out & social', 'Personal & health', 'Buffer'];
  const PER = { week: 1, month: 12 / 52, year: 1 / 52 };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = s => { const p = String(s || '').split('-').map(Number); return new Date(Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1)); };
  const iso = dt => dt.toISOString().slice(0, 10);
  const num = v => (isFinite(+v) ? +v : 0);
  const weekly = it => num(it.amt) * (PER[it.per] || 1);

  function plan(s) {
    const spend = s.items.reduce((a, i) => a + weekly(i), 0);
    const left = num(s.takeHome) - spend;
    const housePre = left - num(s.europeFund);
    return { spend, left, rate: num(s.takeHome) ? left / s.takeHome : 0, housePre, housePost: housePre + num(s.europeFund) };
  }
  function trip(s, key) {
    const sc = s.scenarios[key];
    const eurPP = s.itinerary.reduce((a, r) => a + num(r.days) * num(r.eur), 0);
    const days = s.itinerary.reduce((a, r) => a + num(r.days), 0);
    const ground = eurPP * num(s.fx) * num(s.travellers) * num(sc.mult);
    const flights = num(sc.flight) * num(s.travellers);
    const inter = num(sc.inter) * num(s.travellers);
    const ins = num(sc.ins);
    const cont = (ground + inter) * num(sc.cont) / 100;
    const total = ground + flights + inter + ins + cont;
    const yourTrip = total * num(s.tripShare) / 100;
    const yours = yourTrip + num(s.ring);
    const weeks = (d(s.depart) - d(s.planStart)) / (7 * 864e5);
    return { eurPP, days, ground, flights, inter, ins, cont, total, yourTrip, ring: num(s.ring), yours, weeks, need: weeks > 0 ? yours / weeks : NaN };
  }
  function simulate(s, p) {
    const start = d(s.planStart), dep = d(s.depart);
    let y = start.getUTCFullYear(), m = start.getUTCMonth();
    let bal = num(s.saveStart), eur = 0; const rows = [];
    if (!isFinite(y)) return rows;
    while (y < 2030 || (y === 2030 && m <= 11)) {
      const pre = new Date(Date.UTC(y, m, 1)) < dep;
      const saved = (pre ? p.housePre : p.housePost) * 52 / 12;
      const interest = bal * num(s.rate) / 100 / 12;
      bal = bal + interest + saved;
      if (pre) eur += num(s.europeFund) * 52 / 12;
      rows.push({ y, m, pre, saved, interest, bal, eur });
      m++; if (m > 11) { m = 0; y++; }
    }
    return rows;
  }
  const combined = (s, dep) => num(s.price) * dep / 100 + num(s.costs) + num(s.duty);
  const target = (s, dep) => combined(s, dep) * num(s.houseShare) / 100 + num(s.reserve);
  const readyIndex = (rows, t) => rows.findIndex(r => r.bal >= t);
  const spare = r => (2031 - r.y) * 12 + 1 - (r.m + 1);
  const pay = (P, rate, years) => { years = years || 30; const i = rate / 100 / 12, n = years * 12; return i ? P * i / (1 - Math.pow(1 + i, -n)) : P / n; };
  const weeklyPay = (P, rate) => pay(P, rate) * 12 / 52;
  const monLabel = r => MON[r.m] + ' ' + r.y;

  /* ---------- quick log: categorising and weekly roll-up ---------- */
  const KEYWORDS = {
    'Groceries': ['grocery', 'groceries', 'supermarket', 'woolies', 'woolworths', 'coles', 'aldi', 'iga', 'harris farm', 'costco', 'foodworks',
      'milk', 'bread', 'eggs', 'butter', 'cheese', 'fruit', 'veg', 'vegetables', 'meat', 'mince', 'chicken', 'butcher', 'rice', 'pasta', 'cereal',
      'toilet paper', 'detergent', 'washing powder', 'cleaning', 'dishwashing'],
    'Eating out & social': ['soft drink', 'softdrink', 'drink', 'can', 'coke', 'coca cola', 'pepsi', 'sprite', 'fanta', 'solo', 'lemonade', 'pepsi max',
      'energy drink', 'red bull', 'monster', 'mother', 'water', 'coffee', 'latte', 'cappuccino', 'flat white', 'long black', 'chai', 'bubble tea',
      'smoothie', 'juice', 'snack', 'chips', 'chocolate', 'lollies', 'ice cream', 'gelato', 'donut', 'pie', 'sausage roll', 'sandwich', 'wrap',
      'burger', 'pizza', 'kebab', 'sushi', 'ramen', 'pho', 'noodles', 'thai', 'indian', 'chinese', 'maccas', 'mcdonalds', 'hungry jacks', 'kfc',
      'subway', 'guzman', 'nandos', 'oporto', 'red rooster', 'dominos', 'grilld', 'uber eats', 'ubereats', 'menulog', 'doordash', 'lunch',
      'dinner', 'breakfast', 'brunch', 'takeaway', 'cafe', 'restaurant', 'bakery', 'pub', 'bar', 'beer', 'wine', 'schooner', 'pint', 'cocktail',
      'bottle o', 'bws', 'dan murphys', 'liquor', 'drinks', 'movie', 'movies', 'cinema', 'concert', 'tickets', 'gig', 'bowling', 'footy', '7 eleven'],
    'Car': ['fuel', 'petrol', 'diesel', 'unleaded', 'e10', 'servo', 'shell', 'bp', 'ampol', 'caltex', 'car wash', 'parking', 'toll', 'tolls',
      'linkt', 'etoll', 'e toll', 'rego', 'ctp', 'green slip', 'service', 'servicing', 'mechanic', 'tyre', 'tyres', 'oil change', 'car insurance',
      'nrma', 'uber', 'didi', 'taxi', 'opal', 'train', 'bus', 'ferry'],
    'Phone & wifi': ['phone', 'mobile', 'wifi', 'internet', 'nbn', 'telstra', 'optus', 'vodafone', 'belong', 'aussie broadband', 'sim', 'recharge', 'phone bill'],
    'Personal & health': ['haircut', 'barber', 'hairdresser', 'chemist', 'pharmacy', 'priceline', 'chemist warehouse', 'medicine', 'panadol',
      'doctor', 'gp', 'dentist', 'physio', 'gym', 'clothes', 'shirt', 't shirt', 'jeans', 'shoes', 'socks', 'undies', 'kmart', 'target', 'big w',
      'uniqlo', 'gift', 'present', 'birthday', 'flowers', 'shampoo', 'deodorant', 'toothpaste', 'razor', 'skincare', 'spotify', 'netflix',
      'stan', 'disney', 'youtube premium', 'book', 'kindle', 'amazon', 'game', 'games', 'steam', 'playstation', 'xbox'],
    'Rent': ['rent', 'landlord', 'real estate', 'bond'],
    'Buffer': ['repair', 'repairs', 'emergency', 'plumber', 'electrician', 'parking fine', 'speeding fine', 'fine', 'electricity', 'power bill',
      'gas bill', 'water bill', 'vet']
  };
  const KW = Object.entries(KEYWORDS).flatMap(([g, ws]) => ws.map(w => [w, g]));
  const norm = s => String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9&]+/g, ' ').trim();

  /* Exact past name wins, then the longest keyword (yours or built in) found as a whole word, plural allowed. Unknown goes to Buffer. */
  function guessGroup(text, learned) {
    const n = norm(text); if (!n) return null;
    learned = learned || {};
    if (GROUPS.includes(learned[n])) return learned[n];
    const words = Object.entries(learned).filter(([, g]) => GROUPS.includes(g)).concat(KW).sort((a, b) => b[0].length - a[0].length);
    const hay = ' ' + n + ' ';
    for (const [w, g] of words) if (w && (hay.includes(' ' + w + ' ') || hay.includes(' ' + w + 's ') || hay.includes(' ' + w + 'es '))) return g;
    return 'Buffer';
  }

  const addDays = (ds, n) => iso(new Date(d(ds).getTime() + n * 864e5));
  const weekStart = ds => addDays(ds, -((d(ds).getUTCDay() + 6) % 7)); // Monday
  const rowIndexFor = (tracker, ds) => tracker.findIndex(r => r.date && r.date <= ds && ds < addDays(r.date, 7));
  const r2 = n => Math.round(n * 100) / 100;

  /* Adds (or with a negative amount removes) a purchase to the tracker row for its week, creating the row if needed. Mutates tracker. */
  function addToTracker(tracker, ds, group, amt) {
    let i = rowIndexFor(tracker, ds);
    if (i < 0) {
      tracker.push({ date: weekStart(ds), v: {} });
      tracker.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      i = rowIndexFor(tracker, ds);
    }
    const v = tracker[i].v, next = r2(num(v[group]) + amt);
    if (next > 0) v[group] = next; else delete v[group];
    return tracker[i];
  }

  const groupPlan = s => Object.fromEntries(GROUPS.map(g => [g, s.items.filter(i => i.group === g).reduce((a, i) => a + weekly(i), 0)]));

  /* Week view. Bills are paid on their own schedule, so they are left out of "left to spend".
     Projected saving assumes any group not yet logged will still cost its full plan. */
  const BILLS = ['Rent', 'Phone & wifi'];
  function weekStatus(s, spent, todayDs) {
    const gp = groupPlan(s);
    let left = 0, flexPlan = 0, flexSpent = 0, projected = 0;
    GROUPS.forEach(g => {
      const sp = num(spent[g]);
      projected += Math.max(gp[g], sp);
      if (!BILLS.includes(g)) { flexPlan += gp[g]; flexSpent += sp; left += gp[g] - sp; }
    });
    const daysLeft = 7 - (d(todayDs).getUTCDay() + 6) % 7;
    const target = plan(s).left;
    const save = num(s.takeHome) - projected;
    return { plan: gp, left, flexPlan, flexSpent, daysLeft, perDay: left / daysLeft, save, target, short: target - save };
  }

  /* Most-logged items with their latest price, for one-tap buttons. */
  function favourites(log, n) {
    const m = new Map();
    (log || []).forEach(e => {
      const k = norm(e.name); if (!k) return;
      const f = m.get(k) || { name: e.name, count: 0 };
      f.count++; f.amt = e.amt; f.group = e.group; f.name = e.name;
      m.set(k, f);
    });
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, n || 6);
  }

  const Core = { GROUPS, BILLS, PER, MON, d, iso, weekly, plan, trip, simulate, combined, target, readyIndex, spare, pay, weeklyPay, monLabel,
    norm, guessGroup, addDays, weekStart, rowIndexFor, addToTracker, groupPlan, weekStatus, favourites };
  if (typeof module === 'object' && module.exports) module.exports = Core; else root.Core = Core;
})(this);
