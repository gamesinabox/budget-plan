/* UI, storage, tabs, chart. Calculations live in core.js. */
(function () {
const GROUPS = Core.GROUPS;
const DEFAULTS = window.DEFAULTS;
const KEY = 'weekly-budget-plan-v1';
const clone = o => JSON.parse(JSON.stringify(o));
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const money = n => isFinite(n) ? (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n)).toLocaleString('en-AU') : '-';
const money2 = n => isFinite(n) ? (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';
const eur = n => '€' + Math.round(n || 0).toLocaleString('en-AU');
const kfmt = v => v >= 1000 ? '$' + (v / 1000).toLocaleString('en-AU', { maximumFractionDigits: 1 }) + 'k' : '$' + Math.round(v);
const pad = n => String(n).padStart(2, '0');
const todayDs = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const nowStamp = () => { const t = new Date(); return `${todayDs()}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`; };
const dot = g => `<span class="dot" style="background:var(--g${GROUPS.indexOf(g)})"></span>`;
const kdot = e => (e.kind || 'out') === 'out' ? dot(e.group) : `<span class="dot" style="background:var(${e.kind === 'in' ? '--good' : '--s1'})"></span>`;
const dayName = ds => Core.d(ds).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
let S = load();

function merge(base, saved) {
  for (const k in saved) {
    if (k === 'scenarios') { for (const sk in saved.scenarios) Object.assign(base.scenarios[sk] || (base.scenarios[sk] = {}), saved.scenarios[sk]); }
    else base[k] = saved[k];
  }
  if (!Array.isArray(base.log)) base.log = [];
  if (!base.learned || typeof base.learned !== 'object') base.learned = {};
  if (!base.learnedKind || typeof base.learnedKind !== 'object') base.learnedKind = {};
  if (!Array.isArray(base.goals) || !base.goals.length) base.goals = Core.defaultGoals(base);
  // Data saved before bills existed: guess which items are bills.
  if (!base.items.some(i => 'bill' in i)) base.items.forEach(i => { i.bill = i.group === 'Rent' || i.group === 'Phone & wifi' || /insurance|rego|servic/i.test(i.name); });
  return base;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return merge(clone(DEFAULTS), JSON.parse(raw)); } catch (e) {}
  return merge(clone(DEFAULTS), {});
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

/* ----- binding helpers ----- */
function getPath(o, p) { return p.split('.').reduce((a, k) => a && a[k], o); }
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
function bindAll() {
  document.querySelectorAll('[data-bind]').forEach(el => {
    const v = getPath(S, el.dataset.bind);
    el.value = v === undefined ? '' : v;
    el.oninput = () => {
      const val = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      setPath(S, el.dataset.bind, val);
      document.querySelectorAll(`[data-bind="${el.dataset.bind}"]`).forEach(o => { if (o !== el) o.value = el.value; }); // same field shown on two tabs
      update();
    };
  });
}
const opt = (list, cur) => list.map(x => `<option${x === cur ? ' selected' : ''}>${esc(x)}</option>`).join('');

/* ----- quick log ----- */
const qn = $('q-name'), qa = $('q-amt'), qg = $('q-group');
let picked = false, kindPicked = false, kind = 'out', undoFn = null, toastT;
const PH = { out: 'What did you buy?', in: 'Who paid you? (e.g. pay)', save: 'Saved for what? (e.g. house)' };
const goalOpts = cur => S.goals.map(g => `<option value="${esc(g.id)}"${g.id === cur ? ' selected' : ''}>${esc(g.name)}</option>`).join('');
const goalName = id => (S.goals.find(g => g.id === id) || { name: 'Savings' }).name;
const guessGoalFor = name => S.goals.some(g => g.id === S.learned[Core.norm(name)]) ? S.learned[Core.norm(name)] : Core.guessGoal(name, S.goals);
/* Spending dropdown: the categories, then your bills. A bill's value is "bill:<item name>". */
const bills = () => S.items.filter(i => i.bill);
const outOpts = cur => `<optgroup label="Spending">${GROUPS.map(g => `<option value="${esc(g)}"${g === cur ? ' selected' : ''}>${esc(g)}</option>`).join('')}</optgroup>` +
  (bills().length ? `<optgroup label="Bills">${bills().map(b => { const v = 'bill:' + b.name; return `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(b.name)} (bill)</option>`; }).join('')}</optgroup>` : '');
const outVal = e => e.bill ? 'bill:' + e.bill : e.group;
const parseOut = v => {
  if (!String(v).startsWith('bill:')) return { group: v, bill: null };
  const b = bills().find(i => i.name === v.slice(5));
  return { group: b ? b.group : 'Buffer', bill: v.slice(5) };
};
function guessOut(name) {
  const l = S.learned[Core.norm(name)];
  if (typeof l === 'string' && (GROUPS.includes(l) || bills().some(b => 'bill:' + b.name === l))) return l;
  const b = Core.matchBill(name, S.items);
  return b ? 'bill:' + b : (Core.guessGroup(name, S.learned) || 'Eating out & social');
}
qg.innerHTML = outOpts('Buffer');
const qd = $('q-date');
const resetDate = () => { qd.value = qd.max = todayDs(); qd.classList.remove('past'); };
resetDate();
qd.addEventListener('change', () => { if (!qd.value) qd.value = todayDs(); qd.classList.toggle('past', qd.value !== todayDs()); });
const paintDot = () => { $('q-dot').style.background = kind === 'save' ? 'var(--s1)' : `var(--g${GROUPS.indexOf(parseOut(qg.value).group)})`; };
function setKind(k) {
  if (k !== kind) { kind = k; picked = false; qg.innerHTML = kind === 'save' ? goalOpts() : outOpts('Buffer'); }
  document.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.kind === kind)));
  qn.placeholder = PH[kind]; $('q-name-lab').textContent = PH[kind];
  $('q-cat').hidden = kind === 'in'; $('q-income').hidden = kind !== 'in';
  $('quick').dataset.kind = kind;
}
function syncGuess() {
  const has = qn.value.trim() !== '';
  if (!kindPicked) setKind(has ? Core.guessKind(qn.value, S.learnedKind) : 'out');
  if (!picked) qg.value = kind === 'save' ? guessGoalFor(qn.value) : guessOut(qn.value);
  paintDot();
  $('q-hint').textContent = !has ? 'Type what it was and I\'ll sort it. Tap to change.' : kind === 'in' ? 'Money in. Logged as income.' : picked ? 'Your pick. I\'ll remember it for next time.' : 'Guessed. Tap to change it.';
}
document.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { kindPicked = true; setKind(b.dataset.kind); syncGuess(); qn.focus(); });
function lastPrice(name) {
  const k = Core.norm(name);
  for (let i = S.log.length - 1; i >= 0; i--) if (Core.norm(S.log[i].name) === k) return S.log[i].amt;
}
qn.addEventListener('input', syncGuess);
qn.addEventListener('change', () => { const p = lastPrice(qn.value); if (p && !qa.value) qa.value = p; });
qn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const p = lastPrice(qn.value); if (p && !qa.value) qa.value = p; qa.focus(); qa.select(); } });
qg.addEventListener('change', () => { picked = true; syncGuess(); });
$('quick').addEventListener('submit', e => {
  e.preventDefault();
  const name = qn.value.trim(), amt = Math.round(parseFloat(qa.value) * 100) / 100;
  if (!name) { qn.focus(); return; }
  if (!(amt > 0)) { qa.focus(); qa.classList.add('shake'); setTimeout(() => qa.classList.remove('shake'), 400); return; }
  logItem(name, amt, kind, kind === 'in' ? 'Income' : qg.value);
  qn.value = ''; qa.value = ''; picked = false; kindPicked = false; syncGuess(); qn.focus();
});
$('q-favs').addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  const f = Core.favourites(S.log, 6)[+b.dataset.fav]; if (f) logItem(f.name, f.amt, f.kind, f.bill ? 'bill:' + f.bill : f.group);
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); qn.focus(); }
});

// Only spending ('out') feeds the weekly tracker; money in and savings transfers don't.
const track = (e, sign) => { if ((e.kind || 'out') === 'out') Core.addToTracker(S.tracker, e.t.slice(0, 10), e.group, sign * e.amt); };
// val is a category, "bill:<item>" for spending, a goal id for savings, or 'Income'.
function logItem(name, amt, kind, val) {
  const day = qd.value && qd.value <= todayDs() ? qd.value : todayDs();
  const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: day + nowStamp().slice(10), name, amt, kind, group: val };
  if (kind === 'out') { const p = parseOut(val); e.group = p.group; if (p.bill) e.bill = p.bill; }
  S.log.push(e);
  S.log.sort((a, b) => a.t.localeCompare(b.t)); // a back-dated entry goes in its place
  const n = Core.norm(name);
  S.learnedKind[n] = kind;
  if (kind !== 'in') S.learned[n] = val;
  track(e, 1);
  resetDate();
  buildTracker(); update();
  const when = day === todayDs() ? '' : ` on ${dayName(day)}`;
  toast((kind === 'in' ? `Added ${name}, +${money2(amt)} in` : kind === 'save' ? `Saved ${money2(amt)} to ${goalName(e.group)}`
    : `Added ${name}, ${money2(amt)} to ${e.bill ? e.bill + ' (bill)' : e.group}`) + when, () => removeEntry(e.id));
}
function removeEntry(id) {
  const i = S.log.findIndex(x => x.id === id); if (i < 0) return;
  track(S.log[i], -1);
  S.log.splice(i, 1);
  buildTracker(); update();
}
function regroup(id, v) {
  const e = S.log.find(x => x.id === id); if (!e) return;
  track(e, -1);
  if ((e.kind || 'out') === 'out') { const p = parseOut(v); e.group = p.group; if (p.bill) e.bill = p.bill; else delete e.bill; }
  else e.group = v;
  track(e, 1);
  S.learned[Core.norm(e.name)] = v;
  buildTracker(); update();
}
function toast(msg, undo) {
  $('toast-msg').textContent = msg; undoFn = undo;
  $('toast').classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').classList.remove('on'); undoFn = null; }, 5000);
}
$('toast-undo').onclick = () => { if (undoFn) undoFn(); undoFn = null; $('toast').classList.remove('on'); qn.focus(); };

function renderQuick() {
  const favs = Core.favourites(S.log, 6);
  $('q-favs').innerHTML = favs.length ? '<span class="chips-lab">Again:</span>' + favs.map((f, i) =>
    `<button type="button" class="chip" data-fav="${i}" aria-label="Log ${esc(f.name)} again, ${money2(f.amt)}">${kdot(f)}${esc(f.name)} <b>${f.kind === 'in' ? '+' : ''}${money2(f.amt)}</b></button>`).join('') : '';
  const names = [...new Set(S.log.slice(-300).map(e => e.name))];
  $('q-names').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

function renderWeek() {
  const ds = todayDs(), w = Core.weekStatus(S, ds), start = w.start;
  $('w-range').textContent = `${dayName(start)} to ${dayName(Core.addDays(start, 6))}`;
  const L = $('w-left'); L.textContent = money(w.left); L.classList.toggle('neg', w.left < 0);
  $('w-perday').textContent = w.left > 0 ? `About ${money(w.perDay)} a day for the ${w.daysLeft} day${w.daysLeft > 1 ? 's' : ''} left, today included.` : `You are ${money(-w.left)} over this week. Ease off until Monday.`;
  const ratio = w.flexPlan ? w.flexSpent / w.flexPlan : 0;
  const m = $('w-meter'); m.style.width = Math.min(100, ratio * 100) + '%';
  m.style.background = ratio > 1 ? 'var(--crit)' : ratio > 0.85 ? 'var(--warn)' : 'var(--s1)';
  $('w-of').textContent = `${money2(w.flexSpent)} spent of ${money(w.flexPlan)}`;
  $('w-save').textContent = money(w.save);
  if (w.short <= 0.5) setPill($('w-pill'), 'good', '✓', `Target met (${money(w.target)})`);
  else setPill($('w-pill'), 'crit', '!', `${money(w.short)} under your ${money(w.target)} target`);
  $('w-save-note').textContent = `${money(S.europeFund)} goes to the Europe fund until the trip, the rest to the house.`;
  const inWeek = e => e.t.slice(0, 10) >= start && e.t.slice(0, 10) < Core.addDays(start, 7);
  const sv = Core.sumKind(S.log, 'save', inWeek);
  $('m-in').textContent = '+' + money2(Core.sumKind(S.log, 'in', inWeek));
  $('m-out').textContent = money2(Core.sumKind(S.log, 'out', inWeek));
  $('m-save').textContent = money2(sv);
  $('m-save-of').textContent = `of ${money(w.target)} target`;
  const bal = Core.balance(S);
  $('m-bal').textContent = bal === null ? 'Not set' : money2(bal);
  $('m-bal').classList.toggle('neg', bal !== null && bal < 0);
  $('bal-edit').textContent = bal === null ? 'Set balance' : 'Correct it';
  $('w-groups').innerHTML = GROUPS.filter(g => w.plan[g] || w.spent[g]).map(g => {
    const sp = w.spent[g], pl = w.plan[g], r = pl ? sp / pl : (sp ? 2 : 0);
    const cls = r > 1 ? 'crit' : r > 0.85 ? 'warn' : '';
    return `<div class="grow"><div class="gname">${dot(g)}${esc(g)}</div>
      <div class="gbar" aria-hidden="true"><span class="${cls}" style="width:${Math.min(100, r * 100)}%;background:var(--g${GROUPS.indexOf(g)})"></span></div>
      <div class="gnum num"><b class="${cls}">${money2(sp)}</b> <span class="muted">of ${money(pl)}</span></div></div>`;
  }).join('');
  const bs = Core.billStatus(S, ds), PERIOD = { week: 'this week', month: 'this month', year: 'in the last 12 months' };
  $('w-bills-sum').textContent = bs.length ? `${money(w.billsWeekly)} a week` : '';
  $('w-bills').innerHTML = bs.length ? bs.map(b => `<div class="brow">
      <div class="gname">${dot(b.group)}${esc(b.name)}</div>
      <div class="muted bper">${money2(b.amt)} a ${b.per}</div>
      <div class="num">${b.done ? `<span class="pill good"><i aria-hidden="true">✓</i>Paid ${PERIOD[b.per]}</span>`
        : b.paid ? `<span class="pill warn"><i aria-hidden="true">!</i>${money2(b.paid)} paid ${PERIOD[b.per]}</span>` : '<span class="muted">Not paid ' + PERIOD[b.per] + '</span>'}</div></div>`).join('')
    : '<p class="empty">No bills yet. Tick "Bill" next to rent, insurance and the like on the Budget tab.</p>';
}

function renderLog() {
  const list = S.log.slice(-60).reverse();
  if (!list.length) { $('w-log').innerHTML = '<p class="empty">Nothing logged yet. Type your first purchase at the top, like <b>can of Coke</b> and <b>3.50</b>, then press Add. Log your pay the same way: type <b>pay</b> and the amount.</p>'; return; }
  const today = todayDs(), yday = Core.addDays(today, -1);
  let html = '', day = '';
  list.forEach(e => {
    const ds = e.t.slice(0, 10);
    if (ds !== day) {
      day = ds;
      const tot = Core.sumKind(list, 'out', x => x.t.startsWith(ds));
      html += `<div class="lday"><span>${ds === today ? 'Today' : ds === yday ? 'Yesterday' : dayName(ds)}</span><span class="num">${tot ? money2(tot) + ' spent' : ''}</span></div>`;
    }
    const k = e.kind || 'out';
    const cat = k === 'in' ? '<span class="lcat">' + kdot(e) + '<span class="muted">Income</span></span>'
      : `<label class="lcat">${kdot(e)}<select aria-label="${k === 'save' ? 'Goal' : 'Category'} for ${esc(e.name)}" data-regroup>${k === 'save' ? goalOpts(e.group) : outOpts(outVal(e))}</select></label>`;
    html += `<div class="lrow k-${k}" data-id="${esc(e.id)}">
      <span class="ltime">${esc(e.t.slice(11, 16))}</span>
      <span class="lname">${esc(e.name)}</span>
      ${cat}
      <span class="lamt num">${k === 'in' ? '+' : k === 'save' ? '→ ' : ''}${money2(e.amt)}</span>
      <button type="button" class="x" data-del aria-label="Delete ${esc(e.name)}">×</button></div>`;
  });
  $('w-log').innerHTML = html;
}
$('bal-edit').onclick = () => { const f = $('bal-form'); f.hidden = !f.hidden; if (!f.hidden) { const b = Core.balance(S); $('bal-amt').value = b === null ? '' : b; $('bal-amt').focus(); } };
$('bal-form').onsubmit = e => {
  e.preventDefault();
  const v = parseFloat($('bal-amt').value); if (!isFinite(v)) { $('bal-amt').focus(); return; }
  S.bal = { amt: Math.round(v * 100) / 100, at: nowStamp() }; $('bal-form').hidden = true; update();
};

/* ----- goals ----- */
function buildGoals() {
  $('goals').innerHTML = S.goals.map((g, i) => {
    const p = `goals.${i}.`;
    const fields = g.link === 'house'
      ? `<label class="f">Already saved ($)<input type="number" step="any" inputmode="decimal" data-bind="${p}start"></label>
         <label class="f">Want it by (month)<input type="month" data-bind="houseBy"></label>`
      : g.link === 'europe'
      ? `<label class="f">Already saved ($)<input type="number" step="any" inputmode="decimal" data-bind="${p}start"></label>
         <label class="f">Departure date<input type="date" data-bind="depart"></label>
         <label class="f">Saving per week ($)<input type="number" step="any" min="0" inputmode="decimal" data-bind="europeFund"></label>`
      : `<label class="f">Name<input data-bind="${p}name" data-rename="${i}"></label>
         <label class="f">Target ($)<input type="number" step="any" min="0" inputmode="decimal" data-bind="${p}target"></label>
         <label class="f">Want it by<input type="date" data-bind="${p}by"></label>
         <label class="f">Saving per week ($)<input type="number" step="any" min="0" inputmode="decimal" data-bind="${p}weekly"></label>
         <label class="f">Already saved ($)<input type="number" step="any" inputmode="decimal" data-bind="${p}start"></label>`;
    const how = g.link === 'house' ? 'Target comes from the price and deposit on the <a href="#timeline">House</a> tab.'
      : g.link === 'europe' ? 'Target comes from the trip and ring on the <a href="#europe">Europe</a> tab.' : '';
    return `<div class="card goal" data-goal="${i}">
      <div class="ghead"><h3 class="gtitle" id="g-name-${i}">${esc(g.name)}</h3>${g.link ? '' : `<button type="button" class="ghost" data-del-goal="${i}">Remove</button>`}</div>
      <div class="gprog"><b id="g-saved-${i}"></b> <span class="muted" id="g-of-${i}"></span></div>
      <div class="meter" aria-hidden="true"><span id="g-bar-${i}"></span></div>
      <p class="gline" id="g-line-${i}"></p><span class="pill" id="g-pill-${i}"></span>
      <div class="grid gfields">${fields}</div>
      ${how ? `<p class="note">${how}</p>` : ''}
    </div>`;
  }).join('');
  bindAll();
}
$('goals').addEventListener('input', e => { if (e.target.dataset.rename !== undefined) $('g-name-' + e.target.dataset.rename).textContent = e.target.value; });
$('goals').addEventListener('click', e => {
  const i = e.target.dataset.delGoal; if (i === undefined) return;
  S.goals.splice(+i, 1); buildGoals(); update();
});
$('add-goal').onclick = () => {
  const by = Core.addDays(todayDs(), 365);
  S.goals.push({ id: 'g' + Date.now().toString(36), name: 'New goal', target: 2000, by, weekly: 40, start: 0 });
  buildGoals(); update();
  const inp = document.querySelector(`[data-goal="${S.goals.length - 1}"] input`); if (inp) { inp.focus(); inp.select(); }
};
function renderGoals() {
  const ds = todayDs();
  S.goals.forEach((g, i) => {
    if (!$('g-saved-' + i)) return;
    const x = Core.goalInfo(S, g, ds);
    $('g-saved-' + i).textContent = money(x.saved);
    $('g-of-' + i).textContent = `of ${money(x.target)}`;
    const bar = $('g-bar-' + i); bar.style.width = (x.pct * 100) + '%'; bar.style.background = x.ok ? 'var(--good)' : 'var(--s1)';
    const byTxt = g.link === 'house' ? Core.endLabel(S) : x.by ? Core.d(x.by).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'no date';
    $('g-line-' + i).textContent = !x.togo ? 'Reached. Nice work.'
      : `${money(x.togo)} to go by ${byTxt}. ${isFinite(x.need) ? `Needs ${money(x.need)} a week; you plan ${money(x.weekly)}.` : 'Set a date in the future.'}`;
    if (!x.togo) setPill($('g-pill-' + i), 'good', '✓', 'Done');
    else if (x.ok) setPill($('g-pill-' + i), 'good', '✓', `On track${x.eta ? ', ready ' + x.eta : ''}`);
    else setPill($('g-pill-' + i), 'crit', '!', g.link === 'house' ? `Not ready by ${Core.endLabel(S)} at this pace` : x.eta ? `Behind, at this pace ready ${x.eta}` : 'Behind: add a weekly amount');
  });
}

$('w-log').addEventListener('change', e => { if (e.target.matches('[data-regroup]')) regroup(e.target.closest('[data-id]').dataset.id, e.target.value); });
$('w-log').addEventListener('click', e => {
  if (!e.target.matches('[data-del]')) return;
  const id = e.target.closest('[data-id]').dataset.id, ent = S.log.find(x => x.id === id);
  removeEntry(id);
  if (ent) toast(`Deleted ${ent.name}`, () => { S.log.push(ent); S.log.sort((a, b) => a.t.localeCompare(b.t)); track(ent, 1); buildTracker(); update(); });
});

/* ----- builders for the editable lists ----- */
function buildBudget() {
  const tb = $('items'); tb.innerHTML = '';
  S.items.forEach((it, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input aria-label="Item name" data-k="name" value="${esc(it.name)}"></td>
      <td><input type="number" step="any" min="0" inputmode="decimal" aria-label="Amount for ${esc(it.name)}" data-k="amt" value="${it.amt}" style="min-width:80px"></td>
      <td><select aria-label="Period for ${esc(it.name)}" data-k="per">${opt(['week', 'month', 'year'], it.per)}</select></td>
      <td><select aria-label="Tracker group for ${esc(it.name)}" data-k="group">${opt(GROUPS, it.group)}</select></td>
      <td class="c"><input type="checkbox" data-k="bill"${it.bill ? ' checked' : ''} aria-label="${esc(it.name)} is a bill"></td>
      <td class="num" data-w></td>
      <td><button class="ghost" type="button" data-del aria-label="Remove ${esc(it.name)}">Remove</button></td>`;
    tb.appendChild(tr);
    tr.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; it[k] = k === 'amt' ? (parseFloat(e.target.value) || 0) : k === 'bill' ? e.target.checked : e.target.value; update(); });
    tr.querySelector('[data-del]').onclick = () => { S.items.splice(i, 1); buildBudget(); update(); };
  });
}
function buildItin() {
  const tb = $('itin'); tb.innerHTML = '';
  S.itinerary.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input aria-label="Country" data-k="c" value="${esc(r.c)}"></td>
      <td><input type="number" step="1" min="0" inputmode="numeric" aria-label="Days in ${esc(r.c)}" data-k="days" value="${r.days}" style="width:80px"></td>
      <td><input type="number" step="1" min="0" inputmode="numeric" aria-label="Euros per day in ${esc(r.c)}" data-k="eur" value="${r.eur}" style="width:90px"></td>
      <td class="num" data-t></td>
      <td><button class="ghost" type="button" data-del aria-label="Remove ${esc(r.c)}">Remove</button></td>`;
    tb.appendChild(tr);
    tr.addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; r[k] = k === 'c' ? e.target.value : (parseFloat(e.target.value) || 0); update(); });
    tr.querySelector('[data-del]').onclick = () => { S.itinerary.splice(i, 1); buildItin(); update(); };
  });
}
const SC_ROWS = [['mult', 'Daily-cost multiplier (1 = the figures above)', '0.05'], ['flight', 'Flights per person, return ($)', '50'], ['inter', 'Between countries per person ($)', '50'], ['ins', 'Travel insurance, both ($)', '50'], ['cont', 'Contingency (%)', '1']];
function buildScenarios() {
  const tb = $('sc-body'); tb.innerHTML = '';
  SC_ROWS.forEach(([k, label, step]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td>` + ['lean', 'mid', 'comfy'].map(key =>
      `<td class="num"><input type="number" step="${step}" min="0" inputmode="decimal" aria-label="${label} - ${key}" data-bind="scenarios.${key}.${k}" style="width:100px"></td>`).join('');
    tb.appendChild(tr);
  });
}
const RES_ROWS = [['ground', 'Accommodation, food and activities'], ['flights', 'Flights'], ['inter', 'Between countries'], ['ins', 'Travel insurance'], ['cont', 'Contingency'], ['total', 'Total trip cost'], ['yourTrip', 'Your share of the trip'], ['ring', 'Engagement ring'], ['yours', 'Your total'], ['need', 'Weekly saving needed']];
function buildResults() {
  $('res-body').innerHTML = RES_ROWS.map(([k, l]) => {
    const strong = (k === 'total' || k === 'yours' || k === 'need') ? ' class="big"' : '';
    return `<tr><td${strong}>${l}</td>` + ['lean', 'mid', 'comfy'].map(key => `<td class="num${strong ? ' big' : ''}" data-col="${key}" id="r-${key}-${k}"></td>`).join('') + '</tr>';
  }).join('');
}
function buildTracker() {
  $('trk-head').innerHTML = `<tr><th>Week starting</th>${GROUPS.map(g => `<th class="num">${esc(g)}</th>`).join('')}<th class="num">Spent</th><th class="num">Over / (under)</th><th class="num">Saved</th><th><span class="sr">Remove</span></th></tr>
    <tr class="planrow"><th>Plan</th>${GROUPS.map((g, i) => `<th class="num" id="plan-${i}"></th>`).join('')}<th class="num" id="plan-total"></th><th></th><th></th><th></th></tr>`;
  const tb = $('trk'); tb.innerHTML = '';
  S.tracker.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="date" aria-label="Week starting" data-date value="${esc(r.date)}" style="min-width:140px"></td>` +
      GROUPS.map(g => `<td><input type="number" step="any" min="0" inputmode="decimal" aria-label="${esc(g)} spent" data-g="${esc(g)}" value="${r.v[g] === undefined ? '' : r.v[g]}" style="width:84px"></td>`).join('') +
      `<td class="num" data-spent></td><td class="num" data-over></td><td class="num" data-saved></td>
       <td><button class="ghost" type="button" data-del aria-label="Remove this week">Remove</button></td>`;
    tb.appendChild(tr);
    tr.addEventListener('input', e => {
      if (e.target.dataset.date !== undefined) r.date = e.target.value;
      else if (e.target.dataset.g) { const v = e.target.value; if (v === '') delete r.v[e.target.dataset.g]; else r.v[e.target.dataset.g] = parseFloat(v) || 0; }
      update();
    });
    tr.querySelector('[data-del]').onclick = () => { S.tracker.splice(i, 1); buildTracker(); update(); };
  });
}

/* ----- chart ----- */
function niceStep(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
let CH = null;
function drawChart(rows, t, tripIdx) {
  const host = $('chart');
  if (!rows.length) { host.innerHTML = '<p class="note" style="padding:20px">Set a plan start date to see the chart.</p>'; return; }
  const W = Math.max(300, host.clientWidth || 600), H = 280;
  const m = { l: 50, r: 58, t: 16, b: 26 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const maxV = Math.max(t, ...rows.map(r => r.bal), 1) * 1.06;
  const step = niceStep(maxV / 4), top = Math.ceil(maxV / step) * step;
  const n = rows.length;
  const x = i => m.l + iw * (n > 1 ? i / (n - 1) : 0), y = v => m.t + ih * (1 - v / top);
  let g = '';
  for (let v = 0; v <= top + 1e-6; v += step) g += `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="mut" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${kfmt(v)}</text>`;
  g += `<line class="axl" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => { if (r.m === 0) g += `<text class="mut" x="${x(i)}" y="${H - 8}" text-anchor="middle">${r.y}</text>`; });
  const path = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r.bal).toFixed(1)}`).join('');
  const area = path + `L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  let marks = `<path d="${area}" fill="var(--s1)" fill-opacity=".10"/>`;
  if (tripIdx > 0 && tripIdx < n) marks += `<line x1="${x(tripIdx)}" x2="${x(tripIdx)}" y1="${m.t}" y2="${y(0)}" stroke="var(--base)" stroke-width="1"/><text x="${x(tripIdx) + 5}" y="${m.t + 10}">Europe trip</text>`;
  marks += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--s2)" stroke-width="1.5"/><text x="${m.l + 6}" y="${y(t) - 6}">Target ${kfmt(t)}</text>`;
  marks += `<path d="${path}" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const last = rows[n - 1];
  marks += `<circle cx="${x(n - 1)}" cy="${y(last.bal)}" r="4" fill="var(--s1)" stroke="var(--surface)" stroke-width="2"/><text x="${x(n - 1) + 8}" y="${y(last.bal) + 4}">${kfmt(last.bal)}</text>`;
  marks += `<line id="cx" y1="${m.t}" y2="${y(0)}" stroke="var(--ink2)" stroke-width="1" style="display:none"/><circle id="cd" r="5" fill="var(--s1)" stroke="var(--surface)" stroke-width="2" style="display:none"/>`;
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${g}${marks}<rect id="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
  CH = { rows, x, y, m, iw, W };
  const hit = $('hit'), tip = $('tip');
  const show = i => {
    i = Math.max(0, Math.min(n - 1, i)); const r = rows[i];
    const cx = $('cx'), cd = $('cd');
    cx.setAttribute('x1', x(i)); cx.setAttribute('x2', x(i)); cx.style.display = '';
    cd.setAttribute('cx', x(i)); cd.setAttribute('cy', y(r.bal)); cd.style.display = '';
    tip.innerHTML = `<b>${Core.monLabel(r)}</b><span>House fund <em>${money(r.bal)}</em></span><span>Saved this month <em>${money(r.saved)}</em></span><span>Interest <em>${money(r.interest)}</em></span><span>Europe fund <em>${money(r.eur)}</em></span>`;
    tip.style.display = 'block';
    const tw = tip.offsetWidth, left = x(i) + 8 + (host.offsetLeft || 0);
    tip.style.left = Math.max(4, Math.min(left, host.clientWidth - tw + 8)) + 'px';
    tip.style.top = '16px';
    CH.i = i;
  };
  const hide = () => { tip.style.display = 'none'; $('cx').style.display = 'none'; $('cd').style.display = 'none'; };
  const idxAt = e => { const rc = hit.getBoundingClientRect(); const px = (e.clientX - rc.left) * (iw / rc.width); return Math.round(px / iw * (n - 1)); };
  hit.onpointermove = e => show(idxAt(e));
  hit.onpointerdown = e => show(idxAt(e));
  hit.onpointerleave = e => { if (e.pointerType === 'mouse') hide(); };
  host.onkeydown = e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show((CH.i === undefined ? 0 : CH.i) + (e.key === 'ArrowRight' ? 1 : -1)); } else if (e.key === 'Escape') hide(); };
  host.onblur = hide;
}

/* ----- main update ----- */
function setPill(el, kind, icon, text) { el.className = 'pill ' + kind; el.innerHTML = `<i aria-hidden="true">${icon}</i>${text}`; }
function update() {
  const p = Core.plan(S), rows = Core.simulate(S, p);
  const sel = Core.trip(S, S.scenario);
  const endL = Core.endLabel(S), notBy = 'Not by ' + endL;
  const spare = ri => { if (ri < 0) return ['crit', '!', notBy]; const n = Core.spare(rows[ri], S); return n >= 6 ? ['good', '✓', `${n} months to spare before ${Core.afterLabel(S)}`] : ['warn', '!', `Tight: ${n} month${n === 1 ? '' : 's'} to spare`]; };
  $('today-line').textContent = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  /* budget tab */
  document.querySelectorAll('#items tr').forEach((tr, i) => { tr.querySelector('[data-w]').textContent = money2(Core.weekly(S.items[i])); });
  $('b-spend').textContent = money2(p.spend); $('b-left').textContent = money2(p.left);
  $('b-rate').textContent = (p.rate * 100).toFixed(1) + '%';
  $('b-pre').textContent = money2(p.housePre); $('b-post').textContent = money2(p.housePost); $('b-other').textContent = money2(p.other);

  /* europe tab */
  document.querySelectorAll('#itin tr').forEach((tr, i) => { const r = S.itinerary[i]; tr.querySelector('[data-t]').textContent = eur((r.days || 0) * (r.eur || 0)); });
  $('e-days').textContent = sel.days + ' days'; $('e-eur').textContent = eur(sel.eurPP);
  ['lean', 'mid', 'comfy'].forEach(key => {
    const t = Core.trip(S, key);
    RES_ROWS.forEach(([k]) => { $(`r-${key}-${k}`).textContent = money(t[k]); });
  });
  document.querySelectorAll('#res-table [data-col]').forEach(el => el.classList.toggle('sel', el.dataset.col === S.scenario));
  const gap = S.europeFund - sel.need;
  $('e-verdict').textContent = isFinite(sel.need)
    ? `With the ${S.scenario === 'mid' ? 'mid-range' : S.scenario === 'lean' ? 'lean' : 'comfortable'} plan you need ${money(sel.yours)} over ${sel.weeks.toFixed(0)} weeks, which is ${money(sel.need)} a week. Your Europe fund is ${money(S.europeFund)} a week, so you are ${gap >= 0 ? money(gap) + ' a week ahead' : money(-gap) + ' a week short'}.`
    : 'Set a departure date after the plan start date.';

  /* timeline tab */
  const comb = Core.combined(S, S.depositPct), tgt = Core.target(S, S.depositPct);
  const ri = Core.readyIndex(rows, tgt), loan = S.price * (1 - S.depositPct / 100);
  $('t-comb').textContent = money(comb); $('t-target').textContent = money(tgt);
  $('t-ready').textContent = ri < 0 ? notBy : Core.monLabel(rows[ri]);
  $('t-loan').textContent = money(loan); $('t-repay').textContent = money(Core.weeklyPay(loan, S.mortRate)) + ' a week';
  const depIdx = rows.findIndex(r => !r.pre), preRow = rows[(depIdx < 0 ? rows.length : depIdx) - 1];
  $('t-pre').textContent = preRow ? money(preRow.bal) : '-'; $('t-eurfund').textContent = preRow ? money(preRow.eur) : '-';
  $('cmp').innerHTML = [5, 10, 20].concat([5, 10, 20].includes(+S.depositPct) ? [] : [+S.depositPct]).map(dp => {
    const t = Core.target(S, dp), i = Core.readyIndex(rows, t), L = S.price * (1 - dp / 100);
    return `<tr${dp == S.depositPct ? ' class="big"' : ''}><td>${dp}%</td><td class="num">${money(L)}</td><td class="num">${money(Core.weeklyPay(L, S.mortRate))}</td><td class="num">${money(t)}</td><td class="num">${i < 0 ? 'After ' + endL : Core.monLabel(rows[i])}</td></tr>`;
  }).join('');
  $('mt').innerHTML = rows.map(r => `<tr><td>${Core.monLabel(r)}</td><td>${r.pre ? 'Before trip' : 'After trip'}</td><td class="num">${money(r.saved)}</td><td class="num">${money(r.interest)}</td><td class="num">${money(r.bal)}</td><td class="num">${money(r.eur)}</td></tr>`).join('');
  $('chart-cap').textContent = `${S.depositPct}% deposit on ${money(S.price)}. Hover or tap the chart for each month.`;
  if (rows.length) $('chart').setAttribute('aria-label', `House fund grows from ${money(S.saveStart)} to ${money(rows[rows.length - 1].bal)} by ${endL}. Target ${money(tgt)}, ${ri < 0 ? 'not reached' : 'reached ' + Core.monLabel(rows[ri])}.`);
  if (!$('p-timeline').hidden) drawChart(rows, tgt, depIdx);

  /* tracker tab */
  const gp = Core.groupPlan(S);
  GROUPS.forEach((g, i) => { const el = $('plan-' + i); if (el) el.textContent = money(gp[g]); });
  const planTotal = p.spend; if ($('plan-total')) $('plan-total').textContent = money(planTotal);
  let used = 0, spentSum = 0, savedSum = 0;
  const billsWeekly = S.items.filter(it => it.bill).reduce((a, it) => a + Core.weekly(it), 0);
  document.querySelectorAll('#trk tr').forEach((tr, i) => {
    const r = S.tracker[i]; const vals = Object.values(r.v); const has = vals.length > 0;
    // Bills logged this week are swapped for their weekly share, so a monthly bill doesn't make one week look bad.
    const tot = vals.reduce((a, b) => a + b, 0) - Core.billPaidIn(S.log, r.date, Core.addDays(r.date, 7)) + billsWeekly;
    tr.querySelector('[data-spent]').textContent = has ? money(tot) : '';
    const over = tr.querySelector('[data-over]'), sv = tr.querySelector('[data-saved]');
    over.textContent = has ? (tot - planTotal > 0 ? money(tot - planTotal) : '(' + money(planTotal - tot) + ')') : '';
    over.style.color = has && tot > planTotal ? 'var(--crit)' : '';
    sv.textContent = has ? money(S.takeHome - tot) : '';
    if (has) { used++; spentSum += tot; savedSum += S.takeHome - tot; }
  });
  $('trk-sum').textContent = used ? `${used} week${used > 1 ? 's' : ''} logged. Average spend ${money(spentSum / used)} a week against a plan of ${money(planTotal)}. Saved so far: ${money(savedSum)}.` : 'No weeks logged yet.';

  /* summary strip */
  $('s-left').textContent = money(p.left) + ' a week';
  $('s-left-sub').textContent = `${(p.rate * 100).toFixed(0)}% of take-home. ${money(p.housePre)} to the house, ${money(S.europeFund)} to Europe until the trip.`;
  $('s-ready').textContent = ri < 0 ? notBy : Core.monLabel(rows[ri]);
  const sp = spare(ri); setPill($('s-pill'), sp[0], sp[1], sp[2]);
  $('s-eur').textContent = isFinite(sel.need) ? money(sel.need) + ' a week needed' : '-';
  if (isFinite(sel.need)) { gap >= 0 ? setPill($('s-eur-pill'), 'good', '✓', `Covered, ${money(gap)} a week spare`) : setPill($('s-eur-pill'), 'crit', '!', `${money(-gap)} a week short`); }
  else setPill($('s-eur-pill'), 'warn', '!', 'Check the dates');

  /* this week + quick log */
  renderWeek(); renderLog(); renderQuick(); renderGoals();
  if (kind !== 'in') { const v = qg.value; qg.innerHTML = kind === 'save' ? goalOpts(v) : outOpts(v); } // goals or bills renamed or added
  save();
}

/* ----- tabs ----- */
const TABS = ['week', 'goals', 'budget', 'europe', 'timeline', 'tracker'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'week';
  TABS.forEach(t => { $('p-' + t).hidden = t !== name; $('tab-' + t).setAttribute('aria-selected', String(t === name)); });
  if (name === 'timeline') update();
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.tab); showTab(b.dataset.tab); });
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(update, 120); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { resetDate(); update(); } }); // new day while the tab sat open

/* ----- buttons ----- */
$('add-item').onclick = () => { S.items.push({ name: 'New item', amt: 0, per: 'week', group: 'Buffer', bill: false }); buildBudget(); update(); };
$('add-country').onclick = () => { S.itinerary.push({ c: 'New country', days: 3, eur: 120 }); buildItin(); update(); };
$('add-week').onclick = () => {
  const last = S.tracker.length ? S.tracker[S.tracker.length - 1].date : null;
  S.tracker.push({ date: last ? Core.addDays(last, 7) : Core.weekStart(todayDs()), v: {} }); buildTracker(); update();
};
$('bk-fill').onclick = async () => {
  const txt = JSON.stringify(S); $('bk').value = txt; $('bk').select();
  try { await navigator.clipboard.writeText(txt); $('bk-msg').textContent = 'Copied. Keep this text somewhere safe.'; }
  catch (e) { $('bk-msg').textContent = 'Select the text in the box and copy it.'; }
};
$('bk-load').onclick = () => {
  try { const obj = JSON.parse($('bk').value); S = merge(clone(DEFAULTS), obj); init(); $('bk-msg').textContent = 'Loaded.'; }
  catch (e) { $('bk-msg').textContent = 'That text could not be read. Paste the full backup and try again.'; }
};
let rt; $('reset').onclick = () => {
  const b = $('reset');
  if (!rt) { b.textContent = 'Click again to reset everything'; rt = setTimeout(() => { rt = null; b.textContent = 'Reset to the starting plan'; }, 4000); return; }
  clearTimeout(rt); rt = null; b.textContent = 'Reset to the starting plan'; S = merge(clone(DEFAULTS), {}); init(); $('bk-msg').textContent = 'Reset to the starting plan.';
};

function init() { buildBudget(); buildItin(); buildScenarios(); buildResults(); buildTracker(); buildGoals(); update(); syncGuess(); }
init(); showTab(location.hash.slice(1));
})();
