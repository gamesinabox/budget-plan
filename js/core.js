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

  const otherGoals = s => (s.goals || []).filter(g => !g.link);
  // Weekly money for your own goals comes out of the house fund.
  // shortcut: taken for the whole timeline even after a goal is reached; upgrade if goals often finish early.
  function plan(s) {
    const spend = s.items.reduce((a, i) => a + weekly(i), 0);
    const left = num(s.takeHome) - spend;
    const other = otherGoals(s).reduce((a, g) => a + num(g.weekly), 0);
    const housePre = left - num(s.europeFund) - other;
    return { spend, left, rate: num(s.takeHome) ? left / s.takeHome : 0, other, housePre, housePost: housePre + num(s.europeFund) };
  }
  /* House deadline, 'YYYY-MM' (default Dec 2030). The timeline runs to the end of that month. */
  const endOf = s => { const p = String((s && s.houseBy) || '2030-12').split('-').map(Number); return { y: p[0] || 2030, m: (p[1] || 12) - 1 }; };
  const endLabel = s => { const e = endOf(s); return MON[e.m] + ' ' + e.y; };
  const afterLabel = s => { const e = endOf(s); return e.m === 11 ? 'Jan ' + (e.y + 1) : MON[e.m + 1] + ' ' + e.y; };
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
    const E = endOf(s);
    while (y < E.y || (y === E.y && m <= E.m)) {
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
  const spare = (r, s) => { const E = endOf(s); return (E.y - r.y) * 12 + E.m - r.m + 1; }; // months from the ready month to the month after the deadline
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
      'insurance', 'nrma', 'uber', 'didi', 'taxi', 'opal', 'train', 'bus', 'ferry'],
    'Phone & wifi': ['phone', 'mobile', 'wifi', 'internet', 'nbn', 'telstra', 'optus', 'vodafone', 'belong', 'aussie broadband', 'sim', 'recharge', 'phone bill'],
    'Personal & health': ['haircut', 'barber', 'hairdresser', 'chemist', 'pharmacy', 'priceline', 'chemist warehouse', 'medicine', 'panadol',
      'doctor', 'gp', 'dentist', 'physio', 'gym', 'clothes', 'shirt', 't shirt', 'jeans', 'shoes', 'socks', 'undies', 'kmart', 'target', 'big w',
      'uniqlo', 'gift', 'present', 'birthday', 'flowers', 'shampoo', 'deodorant', 'toothpaste', 'razor', 'skincare', 'spotify', 'netflix',
      'stan', 'disney', 'youtube premium', 'book', 'kindle', 'amazon', 'game', 'games', 'steam', 'playstation', 'xbox'],
    'Rent': ['rent', 'landlord', 'real estate', 'bond'],
    'Buffer': ['repair', 'repairs', 'emergency', 'plumber', 'electrician', 'parking fine', 'speeding fine', 'fine', 'electricity', 'power bill',
      'gas bill', 'water bill', 'bill', 'bills', 'vet']
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

  const groupPlan = (s, pick) => Object.fromEntries(GROUPS.map(g => [g, s.items.filter(i => i.group === g && (!pick || pick(i))).reduce((a, i) => a + weekly(i), 0)]));
  const inRange = (e, from, to) => { const ds = String(e.t).slice(0, 10); return ds >= from && ds < to; };
  const billPaidIn = (log, from, to) => sumKind(log, 'out', e => e.bill && inRange(e, from, to));

  /* Week view. Bills (items ticked as bills in the budget) cost their weekly share every week, whenever you pay them,
     so a monthly or yearly bill never makes one week look bad. Day-to-day spending not logged yet counts at its full plan. */
  function weekStatus(s, todayDs) {
    const i = rowIndexFor(s.tracker || [], todayDs), row = i < 0 ? null : s.tracker[i];
    const start = row ? row.date : weekStart(todayDs), end = addDays(start, 7);
    const gp = groupPlan(s, it => !it.bill);
    const billsWeekly = s.items.filter(it => it.bill).reduce((a, it) => a + weekly(it), 0);
    // Tracker row may hold totals typed in by hand; take out bill payments logged this week so they aren't counted twice.
    const billsByGroup = {};
    (s.log || []).forEach(e => { if ((e.kind || 'out') === 'out' && e.bill && inRange(e, start, end)) billsByGroup[e.group] = num(billsByGroup[e.group]) + num(e.amt); });
    const spent = {};
    let left = 0, flexPlan = 0, flexSpent = 0, projected = billsWeekly;
    GROUPS.forEach(g => {
      const sp = spent[g] = Math.max(0, r2(num(row && row.v[g]) - num(billsByGroup[g])));
      projected += Math.max(gp[g], sp);
      flexPlan += gp[g]; flexSpent += sp; left += gp[g] - sp;
    });
    const daysLeft = 7 - (d(todayDs).getUTCDay() + 6) % 7;
    const target = plan(s).left;
    const save = num(s.takeHome) - projected;
    return { start, plan: gp, spent, left, flexPlan, flexSpent, billsWeekly, daysLeft, perDay: left / daysLeft, save, target, short: target - save };
  }

  /* For each bill: what's been paid in its current period (this week, this calendar month, or the last 12 months). */
  function billStatus(s, todayDs) {
    const ws = weekStart(todayDs), ym = todayDs.slice(0, 7);
    return s.items.filter(it => it.bill).map(it => {
      const k = norm(it.name);
      const mine = e => (e.kind || 'out') === 'out' && norm(e.bill) === k;
      const paid = sumKind(s.log, 'out', e => mine(e) && (it.per === 'week' ? inRange(e, ws, addDays(ws, 7))
        : it.per === 'year' ? inRange(e, addDays(todayDs, -365), addDays(todayDs, 1)) : String(e.t).slice(0, 7) === ym));
      return { name: it.name, group: it.group, per: it.per, amt: num(it.amt), paid, done: paid >= num(it.amt) - 0.5 };
    });
  }

  /* Which bill an entry is paying, if any: a 4+ letter word of the entry that starts a word of a bill's name
     ("rego" -> "Rego (and CTP)", "car service" -> "Car servicing", "pay rent" -> "Rent"). */
  function matchBill(text, items) {
    const words = norm(text).split(' ').filter(w => w.length >= 4 && w !== 'bill' && w !== 'bills');
    const it = (items || []).find(it => it.bill && norm(it.name).split(' ').some(iw => words.some(w => iw.startsWith(w))));
    return it ? it.name : null;
  }

  /* ---------- money in / out / saved ---------- */
  const IN_WORDS = ['pay', 'work pay', 'weekly pay', 'fortnightly pay', 'salary', 'wage', 'wages', 'payday', 'pay day', 'paid me', 'pays me', 'got paid',
    'my pay', 'pay from', 'paycheck', 'payslip', 'refund', 'refunded', 'cashback', 'interest', 'bonus', 'tax return', 'tax refund', 'reimbursement',
    'reimbursed', 'paid back', 'owed me', 'sold', 'income', 'centrelink', 'transfer from', 'received'];
  const SAVE_WORDS = ['savings', 'to savings', 'saved', 'saving', 'house fund', 'europe fund', 'trip fund', 'deposit fund', 'put away'];
  const has = (n, list) => { const hay = ' ' + n + ' '; return list.some(w => hay.includes(' ' + w + ' ')); };
  function guessKind(text, learnedKind) {
    const n = norm(text); if (!n) return 'out';
    const k = (learnedKind || {})[n]; if (k === 'in' || k === 'out' || k === 'save') return k;
    if (n === 'pay' || has(n, IN_WORDS.slice(1))) return 'in';
    return has(n, SAVE_WORDS) ? 'save' : 'out';
  }
  const GOAL_WORDS = { europe: ['europe', 'trip', 'travel', 'holiday', 'ring'], house: ['house', 'home', 'apartment', 'unit', 'deposit'] };
  function guessGoal(text, goals) {
    const n = norm(text);
    for (const g of goals || []) {
      const words = (GOAL_WORDS[g.link] || []).concat(norm(g.name).split(' ').filter(w => w.length > 2));
      if (has(n, words)) return g.id;
    }
    const house = (goals || []).find(g => g.link === 'house');
    return house ? house.id : (goals && goals[0] ? goals[0].id : null);
  }
  const defaultGoals = s => [
    { id: 'house', link: 'house', name: 'Apartment deposit', start: num(s.saveStart) },
    { id: 'europe', link: 'europe', name: 'Europe trip + ring', start: 0 }
  ];
  const sumKind = (log, kind, pred) => (log || []).filter(e => (e.kind || 'out') === kind && (!pred || pred(e))).reduce((a, e) => a + num(e.amt), 0);

  /* Savings are logged into one pot. Each goal gets the share of it that the plan's weekly split gives it
     (house fund / Europe fund until the trip / your own goals' weekly amounts).
     shortcut: past savings are re-split by today's plan, so changing the split moves old money too; store per-entry splits if that matters. */
  function saveShares(s, todayDs) {
    const p = plan(s), pre = !s.depart || todayDs < s.depart;
    const goals = s.goals || [];
    const w = goals.map(g => Math.max(0, g.link === 'house' ? (pre ? p.housePre : p.housePost) : g.link === 'europe' ? (pre ? num(s.europeFund) : 0) : num(g.weekly)));
    const tot = w.reduce((a, b) => a + b, 0);
    return Object.fromEntries(goals.map((g, i) => [g.id, tot ? w[i] / tot : (g.link === 'house' ? 1 : 0)]));
  }

  /* Target, deadline, weekly plan, saved so far (start + its share of logged savings) and when it will be reached at the planned pace. */
  function goalInfo(s, g, todayDs) {
    const p = plan(s);
    let tgt, by, wk, eta = null;
    if (g.link === 'house') {
      tgt = target(s, s.depositPct); const E = endOf(s); by = iso(new Date(Date.UTC(E.y, E.m + 1, 1))); wk = p.housePre;
      const rows = simulate(s, p), ri = readyIndex(rows, tgt); eta = ri < 0 ? null : monLabel(rows[ri]);
    } else if (g.link === 'europe') { tgt = trip(s, s.scenario).yours; by = s.depart; wk = num(s.europeFund); }
    else { tgt = num(g.target); by = g.by; wk = num(g.weekly); }
    const ids = new Set((s.goals || []).map(x => x.id));
    const pooled = sumKind(s.log, 'save', e => !ids.has(e.group));
    const saved = num(g.start) + sumKind(s.log, 'save', e => e.group === g.id) + pooled * (saveShares(s, todayDs)[g.id] || 0);
    const togo = Math.max(0, tgt - saved);
    const weeks = by ? (d(by) - d(todayDs)) / (7 * 864e5) : NaN;
    const need = weeks > 0 ? togo / weeks : (togo ? NaN : 0);
    if (g.link !== 'house') {
      if (!togo) eta = 'Done';
      else if (wk > 0) { const dt = new Date(d(todayDs).getTime() + togo / wk * 7 * 864e5); eta = MON[dt.getUTCMonth()] + ' ' + dt.getUTCFullYear(); }
    }
    const ok = !togo || (g.link === 'house' ? eta !== null : weeks > 0 && wk >= need - 0.5);
    return { target: tgt, by, weekly: wk, saved, togo, weeks, need, eta, ok, pct: tgt > 0 ? Math.min(1, saved / tgt) : 0 };
  }

  /* Everyday account balance: the last balance you set, plus money in, minus money out and savings since then. */
  function balance(s) {
    if (!s.bal || !isFinite(+s.bal.amt)) return null;
    return r2((s.log || []).filter(e => e.t > s.bal.at).reduce((a, e) => a + ((e.kind || 'out') === 'in' ? 1 : -1) * num(e.amt), num(s.bal.amt)));
  }

  /* Most-logged items with their latest price, for one-tap buttons. */
  function favourites(log, n) {
    const m = new Map();
    (log || []).forEach(e => {
      const k = norm(e.name); if (!k) return;
      const f = m.get(k) || { name: e.name, count: 0 };
      f.count++; f.amt = e.amt; f.group = e.group; f.name = e.name; f.kind = e.kind || 'out'; f.bill = e.bill;
      m.set(k, f);
    });
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, n || 6);
  }

  /* ---------- insights: where it goes, your pace, predictions, tips ---------- */
  const isOut = e => (e.kind || 'out') === 'out';
  const HABIT_GROUPS = ['Eating out & social', 'Personal & health', 'Buffer'];
  const fmt$ = n => '$' + Math.round(Math.abs(n)).toLocaleString('en-AU');
  /* days = look-back window (null = all time). Predictions need at least 7 days of logging. */
  function insights(s, todayDs, days) {
    const log = (s.log || []).filter(e => String(e.t).slice(0, 10) <= todayDs);
    const firstDs = log.length ? log.reduce((m, e) => (e.t < m ? e.t : m), log[0].t).slice(0, 10) : todayDs;
    const since = Math.round((d(todayDs) - d(firstDs)) / 864e5) + 1;
    const covered = log.length ? Math.min(days || Infinity, since) : 0;
    const from = addDays(todayDs, -(covered - 1)), to = addDays(todayDs, 1);
    const inWin = e => inRange(e, from, to);
    const weeks = covered / 7, ready = covered >= 7;
    const p = plan(s), gp = groupPlan(s, it => !it.bill);
    const billsWeekly = s.items.filter(it => it.bill).reduce((a, it) => a + weekly(it), 0);
    const flexPlan = GROUPS.reduce((a, g) => a + gp[g], 0);

    // Where the money goes (everything spent, bills at what you actually paid)
    const byGroup = GROUPS.map(g => ({ group: g, total: r2(sumKind(log, 'out', e => e.group === g && inWin(e))),
      flex: r2(sumKind(log, 'out', e => e.group === g && !e.bill && inWin(e))) }));
    const totalOut = r2(byGroup.reduce((a, x) => a + x.total, 0));
    byGroup.forEach(x => { x.pct = totalOut ? x.total / totalOut : 0; });
    const ranked = byGroup.filter(x => x.total > 0).sort((a, b) => b.total - a.total);
    const items = new Map();
    log.filter(e => isOut(e) && inWin(e)).forEach(e => {
      const k = norm(e.name), it = items.get(k) || { name: e.name, total: 0, count: 0, group: e.group, bill: !!e.bill };
      it.total = r2(it.total + num(e.amt)); it.count++; items.set(k, it);
    });
    const topItems = [...items.values()].sort((a, b) => b.total - a.total);
    const flexTotal = r2(byGroup.reduce((a, x) => a + x.flex, 0));
    const inTotal = r2(sumKind(log, 'in', inWin)), savedTotal = r2(sumKind(log, 'save', inWin));

    // Day-to-day spending per week, last 8 weeks (bills left out: they are spread evenly)
    const ws0 = weekStart(todayDs);
    const weekBars = [];
    for (let i = 7; i >= 0; i--) {
      const ws = addDays(ws0, -7 * i), we = addDays(ws, 7);
      weekBars.push({ start: ws, flex: r2(sumKind(log, 'out', e => !e.bill && inRange(e, ws, we))), current: i === 0 });
    }

    // Pace and predictions
    const pace = ready ? flexTotal / weeks : NaN;
    const delta = flexPlan - pace; // + means under plan
    const saveAtPace = num(s.takeHome) - pace - billsWeekly;
    const rowsPlan = simulate(s, p), tgt = target(s, s.depositPct);
    const riPlan = readyIndex(rowsPlan, tgt);
    let riPace = -1, rowsPace = rowsPlan;
    if (ready) { rowsPace = simulate(s, Object.assign({}, p, { housePre: p.housePre + delta, housePost: p.housePost + delta })); riPace = readyIndex(rowsPace, tgt); }
    const label = (rows, i) => i < 0 ? 'after ' + endLabel(s) : monLabel(rows[i]);
    const ym = todayDs.slice(0, 7), dom = d(todayDs).getUTCDate();
    const dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
    const monthFlex = r2(sumKind(log, 'out', e => !e.bill && String(e.t).slice(0, 7) === ym));
    const monthForecast = ready ? monthFlex + pace / 7 * (dim - dom) + billsWeekly * 52 / 12 : NaN;
    const monthPlan = p.spend * 52 / 12;
    const predictions = ready ? {
      pace, flexPlan, saveAtPace, target: p.left, monthFlex, monthForecast, monthPlan,
      readyPlan: label(rowsPlan, riPlan), readyPace: label(rowsPace, riPace),
      monthsSooner: riPlan >= 0 && riPace >= 0 ? riPlan - riPace : null,
      yearSaving: saveAtPace * 52
    } : null;

    // Tips, biggest yearly impact first
    const tips = [];
    if (ready) {
      GROUPS.forEach(g => {
        const gpace = byGroup.find(x => x.group === g).flex / weeks;
        if (gpace > gp[g] + 5) tips.push({ kind: 'over', group: g, impact: (gpace - gp[g]) * 52,
          text: `${g} is running at ${fmt$(gpace)} a week, ${fmt$(gpace - gp[g])} over plan. Getting back to plan saves about ${fmt$((gpace - gp[g]) * 52)} a year.` });
      });
      // Habits only for optional spending: "halve your groceries" isn't advice.
      topItems.filter(it => !it.bill && it.count >= 3 && HABIT_GROUPS.includes(it.group)).slice(0, 3).forEach(it => {
        const yr = it.total / weeks * 52;
        if (yr >= 100) tips.push({ kind: 'habit', group: it.group, impact: yr / 2,
          text: `${it.name}: ${it.count} times in ${Math.round(covered / 7)} week${covered >= 14 ? 's' : ''}, ${fmt$(it.total)} in all. That's about ${fmt$(yr)} a year; halving it saves ${fmt$(yr / 2)}.` });
      });
      if (delta > 5) tips.push({ kind: 'good', impact: delta * 52,
        text: `You're spending ${fmt$(delta)} a week less than planned. Move that into the house fund each week` +
          (predictions.monthsSooner > 0 ? ` and the deposit is ready ${predictions.readyPace} instead of ${predictions.readyPlan}.` : '.') });
      // Money not spent but not moved either: it's sitting in the everyday account where it's easy to spend.
      const savedWk = savedTotal / weeks, spare = Math.min(saveAtPace, p.left) - savedWk;
      if (spare > 20) tips.push({ kind: 'save', impact: spare * 52,
        text: `Your spending leaves about ${fmt$(saveAtPace)} a week spare, but you've moved ${fmt$(savedWk)} a week into savings. Move another ${fmt$(spare)} across on payday so it doesn't get spent.` });
      const inWk = inTotal / weeks;
      if (covered >= 14 && inWk < num(s.takeHome) * 0.9) tips.push({ kind: 'info', impact: 0,
        text: `Money in averages ${fmt$(inWk)} a week, under the ${fmt$(s.takeHome)} take-home your plan uses. Update it on the Plan tab so the forecasts stay honest.` });
    }
    if (dom >= 20) billStatus(s, todayDs).filter(b => b.per === 'month' && !b.paid).forEach(b => tips.push({ kind: 'bill', group: b.group, impact: 0,
      text: `${b.name} (${fmt$(b.amt)} a month) hasn't been logged this month.` }));
    tips.sort((a, b) => b.impact - a.impact);

    return { covered, ready, daysToReady: Math.max(0, 7 - covered), totalOut, flexTotal, billsTotal: r2(totalOut - flexTotal), inTotal, savedTotal,
      ranked, topItems: topItems.slice(0, 5), weekBars, flexPlan, billsWeekly, predictions, tips };
  }

  const Core = { GROUPS, PER, MON, d, iso, weekly, plan, trip, simulate, combined, target, readyIndex, spare, pay, weeklyPay, monLabel,
    norm, guessGroup, addDays, weekStart, rowIndexFor, addToTracker, groupPlan, weekStatus, favourites,
    endOf, endLabel, afterLabel, guessKind, guessGoal, defaultGoals, sumKind, goalInfo, balance, billStatus, matchBill, billPaidIn, insights, saveShares };
  if (typeof module === 'object' && module.exports) module.exports = Core; else root.Core = Core;
})(this);
