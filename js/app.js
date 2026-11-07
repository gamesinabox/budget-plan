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
  if (!base.period || !base.period.anchor) base.period = { every: 'week', anchor: Core.weekStart(todayDs()) };
  if (!Array.isArray(base.recurring)) base.recurring = [];
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
// Savings all go into one pot: no name, no goal to pick, just the amount.
const KCHIP = { in: ['var(--good)', 'Income'], save: ['var(--s1)', 'Savings account'] };
function setKind(k) {
  if (k !== kind) { kind = k; picked = false; if (kind === 'out') qg.innerHTML = outOpts('Buffer'); }
  document.querySelectorAll('[data-kind]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.kind === kind)));
  qn.placeholder = PH[kind]; $('q-name-lab').textContent = PH[kind];
  $('q-cat').hidden = kind !== 'out'; $('q-income').hidden = kind === 'out';
  if (KCHIP[kind]) $('q-income').innerHTML = `<span class="dot" style="background:${KCHIP[kind][0]}"></span>${KCHIP[kind][1]}`;
  qn.closest('.qname').hidden = kind === 'save' && kindPicked;
  $('quick').dataset.kind = kind;
}
/* One-line entry: "coke 3.50" fills the price as you type. qa.dataset.auto marks a price that came from the text,
   so it is cleared again if the text changes and never overrides a price you typed yourself. */
function syncGuess() {
  const pl = Core.parseLine(qn.value), name = pl.amt !== null ? pl.name : qn.value, has = name.trim() !== '';
  if (pl.amt !== null && pl.sure && (!qa.value || qa.dataset.auto)) { qa.value = pl.amt; qa.dataset.auto = '1'; }
  else if (qa.dataset.auto && !(pl.amt !== null && pl.sure)) { qa.value = ''; delete qa.dataset.auto; }
  if (!kindPicked) setKind(has ? Core.guessKind(name, S.learnedKind) : 'out');
  if (!picked && kind === 'out') qg.value = guessOut(name);
  paintDot();
  $('q-hint').textContent = kind === 'save' ? 'Goes into your savings and is shared across your goals.' : !has ? 'Tip: type it all in one go, like "coke 3.50", and press Enter.'
    : kind === 'in' ? 'Money in. Logged as income.' : picked ? 'Your pick. I\'ll remember it for next time.' : 'Guessed. Tap to change it.';
}
const entryName = () => { const pl = Core.parseLine(qn.value); return pl.amt !== null && qa.dataset.auto ? pl.name : qn.value.trim(); };
qa.addEventListener('input', () => { delete qa.dataset.auto; });
document.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => {
  kindPicked = true; setKind(b.dataset.kind); syncGuess();
  (kind === 'save' ? qa : qn).focus();
});
function lastPrice(name) {
  const k = Core.norm(name);
  for (let i = S.log.length - 1; i >= 0; i--) if (Core.norm(S.log[i].name) === k) return S.log[i].amt;
}
qn.addEventListener('input', syncGuess);
qn.addEventListener('change', () => { const p = lastPrice(entryName()); if (p && !qa.value) qa.value = p; });
qn.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const pl = Core.parseLine(qn.value);
  if (pl.amt !== null && pl.sure && qa.dataset.auto) { $('quick').requestSubmit(); return; } // "coke 3.50" + Enter: done
  if (pl.amt !== null && !qa.value) { qa.value = pl.amt; qa.dataset.auto = '1'; }           // "fuel 98": offer it, you confirm
  const p = lastPrice(entryName()); if (p && !qa.value) qa.value = p;
  qa.focus(); qa.select();
});
qg.addEventListener('change', () => { picked = true; syncGuess(); });
$('quick').addEventListener('submit', e => {
  e.preventDefault();
  const name = entryName() || (kind === 'save' ? 'Savings' : ''), amt = Math.round(parseFloat(qa.value) * 100) / 100;
  if (!name) { qn.focus(); return; }
  if (!(amt > 0)) { qa.focus(); qa.classList.add('shake'); setTimeout(() => qa.classList.remove('shake'), 400); return; }
  logItem(name, amt, kind, kind === 'in' ? 'Income' : kind === 'save' ? 'Savings' : qg.value);
  qn.value = ''; qa.value = ''; delete qa.dataset.auto; picked = false; kindPicked = false; syncGuess(); qn.focus();
});
$('q-favs').addEventListener('click', e => {
  const b = e.target.closest('[data-fav]'); if (!b) return;
  const f = Core.favourites(S.log, 8)[+b.dataset.fav];
  if (f) logItem(f.name, f.amt, f.kind, f.kind === 'save' ? 'Savings' : f.bill ? 'bill:' + f.bill : f.group);
});
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); qn.focus(); }
});

// Only spending ('out') feeds the weekly tracker; money in and savings transfers don't.
const track = (e, sign) => { if ((e.kind || 'out') === 'out') Core.addToTracker(S.tracker, e.t.slice(0, 10), e.group, sign * e.amt, Core.periodStartDow(S)); };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PN = { week: 'week', fortnight: 'fortnight', month: 'month' };
let askedPersist = false;
// val is a category, "bill:<item>" for spending, 'Savings', or 'Income'. day overrides the date chip (for repeating entries).
function logItem(name, amt, kind, val, day) {
  day = day || (qd.value && qd.value <= todayDs() ? qd.value : todayDs());
  const e = { id: newId(), t: day + nowStamp().slice(10), name, amt, kind, group: val };
  if (kind === 'out') { const p = parseOut(val); e.group = p.group; if (p.bill) e.bill = p.bill; }
  const before = Core.periodStatus(S, todayDs());
  S.log.push(e);
  S.log.sort((a, b) => a.t.localeCompare(b.t)); // a back-dated entry goes in its place
  const n = Core.norm(name);
  S.learnedKind[n] = kind;
  if (kind === 'out') S.learned[n] = val;
  track(e, 1);
  resetDate();
  buildTracker(); update();
  // Ask the browser not to clear our storage when space runs low (Chrome/Android honour this).
  if (!askedPersist && navigator.storage && navigator.storage.persist) { askedPersist = true; navigator.storage.persist().catch(() => {}); }
  // Warn the moment a category goes over its plan for this pay period.
  let warn = '';
  if (kind === 'out' && !e.bill && day >= before.start) {
    const now = Core.periodStatus(S, todayDs()), g = e.group, over = now.spent[g] - now.plan[g];
    if (over > 0.5) warn = before.spent[g] <= before.plan[g] + 0.5
      ? ` That takes ${g} ${money(over)} over plan this ${PN[now.every]}.` : ` ${g} is now ${money(over)} over plan this ${PN[now.every]}.`;
  }
  const when = day === todayDs() ? '' : ` on ${dayName(day)}`;
  toast((kind === 'in' ? `Added ${name}, +${money2(amt)} in` : kind === 'save' ? `Saved ${money2(amt)}`
    : `Added ${name}, ${money2(amt)} to ${e.bill ? e.bill + ' (bill)' : e.group}`) + when + (warn ? '.' + warn : ''), () => removeEntry(e.id), warn ? 'warn' : '');
  return e;
}
function removeEntry(id) {
  const i = S.log.findIndex(x => x.id === id); if (i < 0) return;
  track(S.log[i], -1);
  S.log.splice(i, 1);
  buildTracker(); update();
}
function toast(msg, undo, cls) {
  $('toast-msg').textContent = msg; undoFn = undo;
  $('toast-undo').hidden = !undo;
  $('toast').className = 'toast on ' + (cls || '');
  clearTimeout(toastT); toastT = setTimeout(() => { $('toast').classList.remove('on'); undoFn = null; }, cls === 'warn' ? 7000 : 5000);
}
$('toast-undo').onclick = () => { if (undoFn) undoFn(); undoFn = null; $('toast').classList.remove('on'); qn.focus(); };

/* ----- icons: inline SVG drawn with currentColor ----- */
const IC = {
  'Rent': '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
  'Groceries': '<path d="M3 4h2.4l2.3 11.2h10.4L20.5 7.5H6.4"/><circle cx="9.5" cy="19.3" r="1.3"/><circle cx="16.8" cy="19.3" r="1.3"/>',
  'Car': '<path d="M5 11.5 6.7 7a2 2 0 0 1 1.9-1.3h6.8A2 2 0 0 1 17.3 7l1.7 4.5"/><rect x="3" y="11.5" width="18" height="6" rx="2"/><path d="M6.5 17.5v2M17.5 17.5v2M6.8 14.5h1.4M15.8 14.5h1.4"/>',
  'Phone & wifi': '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.3h2"/>',
  'Eating out & social': '<path d="M5 8.5h11.5v4.5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5z"/><path d="M16.5 10h1.3a2.3 2.3 0 0 1 0 4.6h-1.5"/><path d="M8.5 3v2.5M12.5 3v2.5M4 21h14"/>',
  'Personal & health': '<path d="M12 20s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z"/>',
  'Buffer': '<path d="M12 3 19 6v5.5c0 4.4-2.9 7.6-7 9.5-4.1-1.9-7-5.1-7-9.5V6z"/>',
  in: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  save: '<path d="M19 8.5V6.5a1 1 0 0 0-1-1H5.8A2.8 2.8 0 0 0 3 8.3v8.9A2.8 2.8 0 0 0 5.8 20H19a1 1 0 0 0 1-1v-3"/><path d="M21 11.3h-3.8a2 2 0 0 0 0 4H21z"/>',
  home: '<path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6.5H9V21H4.5a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 20V12M10 20V5M16 20v-7M21 20H3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2v.2h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.4-5.3 3.6-7.9.4 1.8 1.4 2.9 2.4 3.4C11.9 7.2 13 4.6 15.5 3c-.3 3 3 5.4 3 9.9 0 4.6-2.7 8.1-6.5 8.1z"/>'
};
const icon = k => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[k] || IC.Buffer}</svg>`;
const gcol = g => `var(--g${GROUPS.indexOf(g)})`;
const gi = (k, col) => `<span class="gi" style="--c:${col}">${icon(k)}</span>`;
const eIcon = e => { const k = e.kind || 'out'; return k === 'in' ? gi('in', 'var(--good)') : k === 'save' ? gi('save', 'var(--s1)') : gi(e.group, gcol(e.group)); };
document.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon); });

function renderQuick() {
  const favs = Core.favourites(S.log, 8);
  $('q-favs').innerHTML = favs.map((f, i) =>
    `<button type="button" class="fav" data-fav="${i}" aria-label="Log ${esc(f.name)} again, ${money2(f.amt)}">${eIcon(f)}<span>${esc(f.name)}</span><b>${f.kind === 'in' ? '+' : ''}${money2(f.amt)}</b></button>`).join('');
  const names = [...new Set(S.log.slice(-300).map(e => e.name))];
  $('q-names').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
}

const row = (ic, name, right, sub) => `<div class="ri">${ic}<div class="ri-main"><div class="ri-top"><span class="ri-name">${name}</span><span class="ri-amt">${right}</span></div>${sub || ''}</div></div>`;
const bar = (pct, col, cls) => `<div class="bar" aria-hidden="true"><span class="${cls || ''}" style="width:${Math.max(0, Math.min(100, pct))}%;background:${col}"></span></div>`;

function renderWeek() {
  const ds = todayDs(), w = Core.periodStatus(S, ds), start = w.start, pn = PN[w.every];
  document.querySelectorAll('.pname').forEach(el => { el.textContent = 'this ' + pn; });
  $('w-range').textContent = 'this ' + pn;
  const L = $('w-left'); L.textContent = money(w.left); L.classList.toggle('neg', w.left < 0);
  $('w-perday').textContent = w.left > 0 ? `About ${money(w.perDay)} a day for ${w.daysLeft === 1 ? 'today' : `the ${w.daysLeft} days to payday`}` : `${money(-w.left)} over. Ease off until payday.`;
  const ratio = w.flexPlan ? w.flexSpent / w.flexPlan : 0;
  const ring = $('w-ring');
  ring.setAttribute('stroke-dasharray', `${Math.min(100, ratio * 100).toFixed(1)} 100`);
  ring.classList.toggle('warn', ratio > 0.85 && ratio <= 1); ring.classList.toggle('over', ratio > 1);
  $('w-ring-t').textContent = Math.round(ratio * 100) + '%';
  $('w-of').textContent = `${money2(w.flexSpent)} of ${money(w.flexPlan)} spent · ${dayName(start)} to ${dayName(Core.addDays(w.end, -1))}`;
  $('w-save').textContent = money(w.save);
  if (w.short <= 0.5) setPill($('w-pill'), 'good', '✓', 'On target');
  else setPill($('w-pill'), 'crit', '!', `${money(w.short)} short`);
  $('w-save-note').textContent = `Target ${money(w.target)} this ${pn}. ${money(S.europeFund)} a week to Europe until the trip, the rest to the house.`;
  const inP = e => e.t.slice(0, 10) >= start && e.t.slice(0, 10) < w.end;
  const sv = Core.sumKind(S.log, 'save', inP);
  $('m-in').textContent = '+' + money(Core.sumKind(S.log, 'in', inP));
  $('m-out').textContent = money(Core.sumKind(S.log, 'out', inP));
  $('m-save').textContent = money(sv);
  $('m-save-of').textContent = sv ? `${money2(sv)} moved to savings so far this ${pn}.` : 'Log a transfer as Saved when you move money to savings.';
  const bal = Core.balance(S);
  $('m-bal').textContent = bal === null ? 'Set' : money2(bal);
  $('m-bal').classList.toggle('neg', bal !== null && bal < 0);
  $('w-groups').innerHTML = GROUPS.filter(g => w.plan[g] || w.spent[g]).map(g => {
    const sp = w.spent[g], pl = w.plan[g], r = pl ? sp / pl : (sp ? 2 : 0);
    const cls = r > 1 ? 'crit' : r > 0.85 ? 'warn' : '';
    return row(gi(g, gcol(g)), esc(g) + (r > 1 ? ' <span class="tag crit">Over</span>' : ''),
      `<b>${money2(sp)}</b><span class="muted"> / ${money(pl)}</span>`, bar(r * 100, gcol(g), cls));
  }).join('');
  const bs = Core.billStatus(S, ds), PERIOD = { week: 'this week', month: 'this month', year: 'in the last 12 months' };
  $('w-bills-sum').textContent = bs.length ? `${money(w.billsWeekly)} a week` : '';
  $('w-bills').innerHTML = bs.length ? bs.map(b => row(gi(b.group, gcol(b.group)), esc(b.name),
      `${money2(b.amt)}<span class="muted"> / ${b.per}</span>`,
      `<div class="ri-sub">${b.done ? `<span class="pill good"><i aria-hidden="true">✓</i>Paid ${PERIOD[b.per]}</span>`
        : b.paid ? `<span class="pill warn"><i aria-hidden="true">!</i>${money2(b.paid)} paid ${PERIOD[b.per]}</span>` : `<span class="muted">Not paid ${PERIOD[b.per]}</span>`}</div>`)).join('')
    : '<p class="empty">No bills yet. Tick "Bill" next to rent, insurance and the like in Plan → Budget.</p>';
  renderForecast(); renderDue(); renderRecap(); renderBackupNag();
}

/* What you'll have when the next pay lands. */
function renderForecast() {
  const f = Core.paydayForecast(S, todayDs()), el = $('w-forecast');
  if (!f) {
    el.innerHTML = `${gi('cal', 'var(--s1)')}<div class="ri-main"><div class="lab">What you'll have on payday</div>
      <div class="note">Tap <b>Account</b> at the top and enter your bank balance. I'll forecast what's left when your pay lands.</div></div>`;
    return;
  }
  const when = f.payday === todayDs() ? 'today' : f.days === 1 ? 'tomorrow' : dayName(f.payday);
  const parts = [`${money2(f.bal)} now`];
  if (f.bills) parts.push(`− ${money(f.bills)} repeating payments`);
  if (f.flex) parts.push(`− ${money(f.flex)} spending money left`);
  el.innerHTML = `${gi('cal', 'var(--s1)')}<div class="ri-main"><div class="lab">Left in your account before pay (${when})</div>
    <div class="bignum${f.before < 0 ? ' neg' : ''}">${money(f.before)}</div>
    <div class="note">${parts.join(' ')}${f.payAmt ? `. About <b>${money(f.after)}</b> once pay lands.` : '.'}</div></div>`;
}

/* Repeating entries that are due: one tap to log (amount editable), or skip. */
function renderDue() {
  const today = todayDs(), due = Core.dueRecurring(S, today);
  $('due').innerHTML = due.map(r => {
    const g = r.kind === 'out' ? parseOut(r.group).group : r.group;
    return `<div class="card duecard k-${esc(r.kind)}" data-rid="${esc(r.id)}">
      <div class="duetop">${eIcon({ kind: r.kind, group: g })}<div class="ri-main"><div class="ri-name">${r.kind === 'in' ? 'Payday' : r.kind === 'save' ? 'Savings day' : 'Due'}: ${esc(r.name)}</div>
        <div class="ri-sub">${r.next === today ? 'Today' : dayName(r.next)} · every ${esc(r.every)}</div></div></div>
      <div class="duerow"><label class="dueamt"><span class="sr">Amount for ${esc(r.name)}</span><span aria-hidden="true">$</span><input type="number" step="0.01" min="0.01" inputmode="decimal" value="${r.amt}"></label>
        <button type="button" class="btn" data-due-skip>Skip</button><button type="button" class="add" data-due-log>Log it</button></div></div>`;
  }).join('');
}
$('due').addEventListener('click', e => {
  const c = e.target.closest('[data-rid]'); if (!c) return;
  const r = S.recurring.find(x => x.id === c.dataset.rid); if (!r) return;
  const prev = r.next;
  if (e.target.closest('[data-due-log]')) {
    const amt = Math.round(parseFloat(c.querySelector('input').value) * 100) / 100;
    if (!(amt > 0)) { c.querySelector('input').focus(); return; }
    r.next = Core.nextDate(r.next, r.every);
    const ent = logItem(r.name, amt, r.kind, r.kind === 'in' ? 'Income' : r.kind === 'save' ? 'Savings' : r.group, prev);
    undoFn = () => { removeEntry(ent.id); r.next = prev; update(); };
  } else if (e.target.closest('[data-due-skip]')) {
    r.next = Core.nextDate(r.next, r.every); update();
    toast(`Skipped ${r.name} for ${dayName(prev)}`, () => { r.next = prev; update(); });
  }
});

/* How the last pay period went, for the first couple of days of a new one. */
function renderRecap() {
  const today = todayDs(), cur = Core.periodOf(S, today);
  const rc = Core.daysBetween(cur.start, today) <= 2 ? Core.recap(S, today) : null;
  if (!rc || S.recapSeen === rc.start) { $('recap').innerHTML = ''; return; }
  const pn = PN[rc.every], under = rc.flexPlan - rc.flex;
  const lines = [
    `Day-to-day: <b>${money(rc.flex)}</b> of ${money(rc.flexPlan)} plan${under >= 0 ? `, ${money(under)} under` : `, ${money(-under)} over`}.`,
    `Moved to savings: <b>${money(rc.saved)}</b> of ${money(rc.target)} target.`,
    rc.best ? `Best: ${esc(rc.best.group)}, ${money(-rc.best.diff)} under plan.` : '',
    rc.worst ? `Watch: ${esc(rc.worst.group)}, ${money(rc.worst.diff)} over plan.` : '',
    `You logged on ${rc.daysLogged} of ${rc.days} days.`
  ].filter(Boolean);
  $('recap').innerHTML = `<div class="card recap"><div class="ghead"><h2>Last ${pn}: ${dayName(rc.start)} to ${dayName(Core.addDays(rc.end, -1))}</h2>
    <button type="button" class="x" data-recap-ok aria-label="Dismiss">${icon('x')}</button></div>
    <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul></div>`;
}
$('recap').addEventListener('click', e => { if (!e.target.closest('[data-recap-ok]')) return; S.recapSeen = Core.recap(S, todayDs()).start; update(); });

/* Back-up nudge: once there is something to lose and the last backup is a week old. */
function renderBackupNag() {
  const days = S.lastBackup ? Core.daysBetween(S.lastBackup.slice(0, 10), todayDs()) : null;
  const show = S.log.length >= 5 && (days === null || days >= 7) && S.nagSnooze !== todayDs();
  $('bk-remind').innerHTML = show ? `<div class="card nag">${gi('save', 'var(--warn)')}<div class="ri-main"><div class="ri-name">Back up your data</div>
    <div class="ri-sub">${days === null ? "You haven't saved a backup yet." : `Last backup was ${days} days ago.`} It only lives on this device.</div></div>
    <button type="button" class="btn" data-bk-now>Back up</button><button type="button" class="x" data-bk-later aria-label="Remind me tomorrow">${icon('x')}</button></div>` : '';
}
$('bk-remind').addEventListener('click', e => {
  if (e.target.closest('[data-bk-now]')) saveBackup();
  else if (e.target.closest('[data-bk-later]')) { S.nagSnooze = todayDs(); update(); }
});

/* Entry rows (Home and History). Tap a row to edit it. */
function entryRows(list, emptyHtml) {
  if (!list.length) return emptyHtml;
  const today = todayDs(), yday = Core.addDays(today, -1);
  let html = '', day = '';
  list.forEach(e => {
    const ds = e.t.slice(0, 10);
    if (ds !== day) {
      day = ds;
      const tot = Core.sumKind(list, 'out', x => x.t.startsWith(ds));
      html += `<div class="lday"><span>${ds === today ? 'Today' : ds === yday ? 'Yesterday' : dayName(ds)}</span><span>${tot ? money2(tot) + ' spent' : ''}</span></div>`;
    }
    const k = e.kind || 'out';
    const cat = k === 'in' ? 'Income' : k === 'save' ? 'Savings account' : e.bill ? `${esc(e.bill)} (bill)` : esc(e.group);
    html += `<button type="button" class="lrow k-${k}" data-id="${esc(e.id)}" aria-label="Edit ${esc(e.name)}, ${money2(e.amt)}">${eIcon(e)}
      <span class="ri-main"><span class="ri-top"><span class="ri-name">${esc(e.name)}</span><span class="lamt">${k === 'in' ? '+' : ''}${money2(e.amt)}</span></span>
      <span class="ri-sub"><span>${cat}</span><span class="ltime">${esc(e.t.slice(11, 16))}</span></span></span></button>`;
  });
  return html;
}
function renderLog() {
  $('w-log').innerHTML = entryRows(S.log.slice(-40).reverse(),
    '<p class="empty">Nothing logged yet. Type your first purchase at the top, like <b>coke 3.50</b>, and press Enter. Log your pay the same way: <b>pay 1162</b>.</p>');
}

/* ----- history: search and filter everything ----- */
let hKind = '';
$('h-group').innerHTML = '<option value="">All categories</option>' + GROUPS.map(g => `<option>${esc(g)}</option>`).join('');
document.querySelectorAll('[data-hk]').forEach(b => b.onclick = () => {
  hKind = b.dataset.hk;
  document.querySelectorAll('[data-hk]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  renderHistory();
});
['h-q', 'h-group', 'h-month'].forEach(id => $(id).addEventListener('input', renderHistory));
function renderHistory() {
  const months = [...new Set(S.log.map(e => e.t.slice(0, 7)))].sort().reverse(), mSel = $('h-month'), mv = mSel.value;
  mSel.innerHTML = '<option value="">All months</option>' + months.map(m => `<option value="${m}"${m === mv ? ' selected' : ''}>${Core.MON[+m.slice(5) - 1]} ${m.slice(0, 4)}</option>`).join('');
  const q = Core.norm($('h-q').value), g = $('h-group').value, mo = mSel.value;
  const list = S.log.filter(e => {
    const k = e.kind || 'out';
    return (!hKind || k === hKind) && (!g || (k === 'out' && e.group === g)) && (!mo || e.t.startsWith(mo))
      && (!q || Core.norm(e.name).includes(q) || Core.norm(e.group).includes(q) || Core.norm(e.bill).includes(q));
  }).reverse();
  const out = Core.sumKind(list, 'out'), inn = Core.sumKind(list, 'in'), sv = Core.sumKind(list, 'save');
  $('h-sum').innerHTML = list.length ? `<b>${list.length}</b> entr${list.length === 1 ? 'y' : 'ies'}` + (out ? ` · spent <b>${money2(out)}</b>` : '') + (inn ? ` · in <b>${money2(inn)}</b>` : '') + (sv ? ` · saved <b>${money2(sv)}</b>` : '') : '';
  const shown = list.slice(0, 300); // shortcut: shows the newest 300 matches; add paging if history gets long enough to need it
  $('h-list').innerHTML = entryRows(shown, `<p class="empty">${S.log.length ? 'Nothing matches. Try fewer words or clear a filter.' : 'Nothing logged yet.'}</p>`)
    + (list.length > shown.length ? `<p class="empty">Showing the newest 300 of ${list.length}. Narrow it down with the filters.</p>` : '');
}

/* ----- insights ----- */
let iDays = 28;
document.querySelectorAll('[data-days]').forEach(b => b.onclick = () => {
  iDays = +b.dataset.days;
  document.querySelectorAll('[data-days]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  renderInsights();
});
function renderInsights() {
  const x = Core.insights(S, todayDs(), iDays || null);
  const per = iDays === 28 ? 'last 4 weeks' : iDays === 91 ? 'last 3 months' : 'all time';
  $('i-hero').innerHTML = `<div class="hero-lab">Spent, ${per}</div><div class="hero-num">${money(x.totalOut)}</div>
    <div class="hero-sub">${x.covered ? `Over ${x.covered} day${x.covered > 1 ? 's' : ''} of logging` : 'Nothing logged yet'}</div>
    <div class="hero-stats"><div><span>Day-to-day</span><b>${money(x.flexTotal)}</b></div><div><span>Bills</span><b>${money(x.billsTotal)}</b></div><div><span>Money in</span><b>+${money(x.inTotal)}</b></div></div>`;

  const P = x.predictions;
  const pcard = (lab, val, sub, pill) => `<div class="card pred"><div class="lab">${lab}</div><div class="bignum">${val}</div><div class="note">${sub}</div>${pill || ''}</div>`;
  const pill = (ok, txt) => `<span class="pill ${ok ? 'good' : 'crit'}"><i aria-hidden="true">${ok ? '✓' : '!'}</i>${txt}</span>`;
  $('i-pred').innerHTML = !P ? `<div class="card pred wide"><div class="lab">Predictions</div><p class="note">They start once you've logged for a week, so they're based on real spending. ${x.daysToReady} more day${x.daysToReady === 1 ? '' : 's'} to go.</p></div>`
    : pcard('Day-to-day pace', `${money(P.pace)}<small>/wk</small>`, `Plan is ${money(P.flexPlan)} a week`, pill(P.pace <= P.flexPlan + 1, P.pace <= P.flexPlan + 1 ? `${money(P.flexPlan - P.pace)} under` : `${money(P.pace - P.flexPlan)} over`))
    + pcard('This month, forecast', money(P.monthForecast), `${money(P.monthFlex)} day-to-day so far · plan ${money(P.monthPlan)}`, pill(P.monthForecast <= P.monthPlan + 5, P.monthForecast <= P.monthPlan + 5 ? 'Within plan' : `${money(P.monthForecast - P.monthPlan)} over`))
    + pcard('Saving at this pace', `${money(P.saveAtPace)}<small>/wk</small>`, `About ${money(P.yearSaving)} a year · target ${money(P.target)}/wk`, pill(P.saveAtPace >= P.target - 1, P.saveAtPace >= P.target - 1 ? 'On target' : `${money(P.target - P.saveAtPace)} short`))
    + pcard('Deposit ready', P.readyPace, `The plan says ${P.readyPlan}`, P.monthsSooner ? pill(P.monthsSooner > 0, P.monthsSooner > 0 ? `${P.monthsSooner} month${P.monthsSooner > 1 ? 's' : ''} sooner` : `${-P.monthsSooner} month${P.monthsSooner < -1 ? 's' : ''} later`) : '');

  const TIPI = { over: t => gi(t.group, gcol(t.group)), habit: t => gi(t.group, gcol(t.group)), good: () => gi('trend', 'var(--good)'),
    save: () => gi('save', 'var(--s1)'), bill: () => gi('cal', 'var(--warn)'), info: () => gi('bulb', 'var(--ink2)') };
  $('i-tips').innerHTML = x.tips.length ? x.tips.map(t => `<div class="card tipcard">${(TIPI[t.kind] || TIPI.info)(t)}<p>${esc(t.text)}</p>${t.impact >= 10 ? `<span class="impact">${money(t.impact)}<small>/yr</small></span>` : ''}</div>`).join('')
    : `<div class="card tipcard">${gi('bulb', 'var(--ink2)')}<p>${x.ready ? "Nothing to flag. You're spending to plan; keep it up." : 'Tips appear after a week of logging, once there is a pattern to look at.'}</p></div>`;

  const max = x.ranked.length ? x.ranked[0].total : 1;
  $('i-groups').innerHTML = x.ranked.length ? x.ranked.map(r => row(gi(r.group, gcol(r.group)), esc(r.group),
      `<b>${money(r.total)}</b><span class="muted"> · ${Math.round(r.pct * 100)}%</span>`, bar(r.total / max * 100, gcol(r.group)))).join('')
    : '<p class="empty">Log some spending to see where it goes.</p>';
  $('i-items').innerHTML = x.topItems.length ? x.topItems.map(it => row(gi(it.group, gcol(it.group)), esc(it.name) + (it.bill ? ' <span class="tag">bill</span>' : ''),
      `<b>${money2(it.total)}</b>`, `<div class="ri-sub muted">${it.count} time${it.count > 1 ? 's' : ''}</div>`)).join('')
    : '<p class="empty">Nothing yet.</p>';
  drawWeeks(x.weekBars, x.flexPlan);

  const mc = Core.monthCompare(S, todayDs()), lastM = Core.MON[+mc.pm.slice(5) - 1];
  $('i-mc-sum').textContent = mc.rows.length ? `${money(mc.now)} vs ${money(mc.prev)}` : '';
  $('i-mc').innerHTML = !mc.rows.length ? '<p class="empty">Log some spending to compare months.</p>'
    : mc.rows.map(r => {
      const diff = r.now - r.prev;
      const sub = !mc.hasPrev ? `Nothing logged in ${lastM} to compare with yet.`
        : diff > 1 ? `<span class="tag crit">+${money(diff)}</span> more than by ${mc.dom} ${lastM}`
        : diff < -1 ? `<span class="tag good">−${money(-diff)}</span> less than by ${mc.dom} ${lastM}` : `About the same as by ${mc.dom} ${lastM}`;
      return row(gi(r.group, gcol(r.group)), esc(r.group), `<b>${money(r.now)}</b><span class="muted"> vs ${money(r.prev)}</span>`, `<div class="ri-sub">${sub}</div>`);
    }).join('');
}

/* Weekly bars: one series, a dashed plan line, tap or hover a bar for its total. */
function drawWeeks(weeks, planW) {
  const W = 340, H = 180, m = { l: 40, r: 10, t: 16, b: 24 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const top0 = Math.max(planW, ...weeks.map(w => w.flex), 10) * 1.12;
  const step = niceStep(top0 / 3), top = Math.ceil(top0 / step) * step;
  const y = v => m.t + ih * (1 - v / top), col = iw / weeks.length, bw = Math.min(26, col * 0.58);
  let g = '';
  for (let v = 0; v <= top + 1e-6; v += step) g += `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="mut" x="${m.l - 6}" y="${y(v) + 3.5}" text-anchor="end">${kfmt(v)}</text>`;
  weeks.forEach((w, i) => {
    const x0 = m.l + col * i + (col - bw) / 2, yv = y(w.flex), base = y(0), r = Math.min(4, base - yv);
    if (w.flex > 0) g += `<path class="wbar${w.current ? ' cur' : ''}" d="M${x0},${base}V${yv + r}Q${x0},${yv} ${x0 + r},${yv}H${x0 + bw - r}Q${x0 + bw},${yv} ${x0 + bw},${yv + r}V${base}Z"/>`;
    g += `<text class="mut" x="${x0 + bw / 2}" y="${H - 7}" text-anchor="middle">${w.current ? 'Now' : +w.start.slice(8) + '/' + +w.start.slice(5, 7)}</text>`;
  });
  g += `<line class="axl" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  if (planW > 0) g += `<line class="planl" x1="${m.l}" x2="${W - m.r}" y1="${y(planW)}" y2="${y(planW)}"/><text x="${W - m.r}" y="${y(planW) - 5}" text-anchor="end">Plan ${money(planW)}</text>`;
  weeks.forEach((w, i) => { g += `<rect class="hit" data-i="${i}" x="${m.l + col * i}" y="${m.t}" width="${col}" height="${ih}" tabindex="0" aria-label="Week of ${dayName(w.start)}: ${money2(w.flex)}"/>`; });
  const host = $('i-weeks');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="wchart" role="img" aria-label="Day-to-day spending per week for the last 8 weeks, against a plan of ${money(planW)} a week">${g}</svg>`;
  const cap = $('i-week-cap'), show = i => {
    const w = weeks[i]; host.querySelectorAll('.wbar').forEach(b => b.classList.remove('sel'));
    host.querySelectorAll('.hit').forEach(h => h.classList.toggle('sel', +h.dataset.i === i));
    cap.textContent = `Week of ${dayName(w.start)}${w.current ? ' (so far)' : ''}: ${money2(w.flex)} day-to-day, ${w.flex > planW ? money(w.flex - planW) + ' over' : money(planW - w.flex) + ' under'} the ${money(planW)} plan.`;
  };
  host.querySelectorAll('.hit').forEach(h => { const i = +h.dataset.i; h.onpointerenter = h.onclick = h.onfocus = () => show(i); });
  $('i-weeks-table').innerHTML = `<table class="mini"><thead><tr><th>Week of</th><th class="num">Day-to-day</th><th class="num">vs plan</th></tr></thead><tbody>${
    weeks.map(w => `<tr><td>${dayName(w.start)}${w.current ? ' (so far)' : ''}</td><td class="num">${money2(w.flex)}</td><td class="num">${w.flex > planW ? '+' : '-'}${money(Math.abs(w.flex - planW))}</td></tr>`).join('')}</tbody></table>`;
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

/* ----- edit sheet ----- */
let editId = null;
const sheet = $('sheet');
function openEdit(id) {
  const e = S.log.find(x => x.id === id); if (!e) return;
  editId = id;
  $('e-name').value = e.name; $('e-amt').value = e.amt;
  $('e-date').value = e.t.slice(0, 10); $('e-date').max = todayDs();
  $('e-kind').value = e.kind || 'out';
  fillEditCat(e);
  sheet.showModal();
}
function fillEditCat(e) {
  const k = $('e-kind').value;
  $('e-cat-wrap').hidden = k !== 'out';
  $('e-cat').innerHTML = outOpts(e && (e.kind || 'out') === 'out' ? outVal(e) : guessOut($('e-name').value));
}
$('e-kind').onchange = () => fillEditCat(null);
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); }); // tap outside the sheet closes it
$('sheet-form').addEventListener('submit', ev => {
  ev.preventDefault();
  const e = S.log.find(x => x.id === editId); if (!e) { sheet.close(); return; }
  const amt = Math.round(parseFloat($('e-amt').value) * 100) / 100;
  if (!(amt > 0)) { $('e-amt').focus(); return; }
  const k = $('e-kind').value, ds = $('e-date').value && $('e-date').value <= todayDs() ? $('e-date').value : e.t.slice(0, 10);
  const before = Object.assign({}, e);
  track(e, -1);
  e.name = $('e-name').value.trim() || e.name; e.amt = amt; e.kind = k; e.t = ds + e.t.slice(10);
  delete e.bill;
  if (k === 'out') { const v = $('e-cat').value, p = parseOut(v); e.group = p.group; if (p.bill) e.bill = p.bill; S.learned[Core.norm(e.name)] = v; }
  else e.group = k === 'in' ? 'Income' : 'Savings';
  S.learnedKind[Core.norm(e.name)] = k;
  track(e, 1);
  S.log.sort((a, b) => a.t.localeCompare(b.t));
  sheet.close(); buildTracker(); update();
  toast(`Updated ${e.name}`, () => { track(e, -1); Object.keys(e).forEach(x => delete e[x]); Object.assign(e, before); track(e, 1); S.log.sort((a, b) => a.t.localeCompare(b.t)); buildTracker(); update(); });
});
$('e-del').onclick = () => {
  const ent = S.log.find(x => x.id === editId); if (!ent) return;
  sheet.close(); removeEntry(editId);
  toast(`Deleted ${ent.name}`, () => { S.log.push(ent); S.log.sort((a, b) => a.t.localeCompare(b.t)); track(ent, 1); buildTracker(); update(); });
};
$('e-repeat').onclick = () => {
  const e = S.log.find(x => x.id === editId); if (!e) return;
  let next = Core.nextDate(e.t.slice(0, 10), 'week');
  while (next <= todayDs()) next = Core.nextDate(next, 'week');
  const k = e.kind || 'out';
  const r = { id: newId(), name: e.name, amt: e.amt, kind: k, group: k === 'out' ? outVal(e) : k === 'in' ? 'Income' : 'Savings', every: 'week', next };
  S.recurring.push(r);
  sheet.close(); buildRecurring(); update();
  toast(`${e.name} now repeats every week, next ${dayName(next)}. Change it in Plan → Settings.`, () => { S.recurring = S.recurring.filter(x => x !== r); buildRecurring(); update(); });
};
['w-log', 'h-list'].forEach(id => $(id).addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openEdit(b.dataset.id); }));

/* ----- settings: repeating entries ----- */
const KINDS = [['in', 'Got paid'], ['out', 'Spent'], ['save', 'Saved']];
function buildRecurring() {
  $('rec-list').innerHTML = S.recurring.length ? S.recurring.map((r, i) => `<div class="card pad recrow" data-ri="${i}">
    <div class="grid2"><label class="f">Name<input data-rk="name" value="${esc(r.name)}" placeholder="e.g. pay, rent"></label>
      <label class="f">Amount ($)<input data-rk="amt" type="number" step="0.01" min="0" inputmode="decimal" value="${r.amt}"></label></div>
    <div class="grid3"><label class="f">Type<select data-rk="kind">${KINDS.map(([v, l]) => `<option value="${v}"${r.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="f">Every<select data-rk="every">${['week', 'fortnight', 'month'].map(v => `<option${r.every === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="f">Next due<input data-rk="next" type="date" value="${esc(r.next)}"></label></div>
    ${r.kind === 'out' ? `<label class="f">Category<select data-rk="group">${outOpts(r.group)}</select></label>` : ''}
    <div class="rowend"><button type="button" class="ghost" data-rdel>Remove</button></div></div>`).join('')
    : '<p class="note">None yet. Add your pay, then rent and any other regulars.</p>';
}
$('rec-list').addEventListener('change', e => {
  const k = e.target.dataset.rk; if (!k) return;
  const r = S.recurring[+e.target.closest('[data-ri]').dataset.ri];
  r[k] = k === 'amt' ? (Math.round((parseFloat(e.target.value) || 0) * 100) / 100) : e.target.value;
  if (k === 'kind') { r.group = r.kind === 'in' ? 'Income' : r.kind === 'save' ? 'Savings' : guessOut(r.name); buildRecurring(); }
  if (k === 'name' && r.kind === 'out') { r.group = guessOut(r.name); buildRecurring(); }
  update();
});
$('rec-list').addEventListener('click', e => {
  if (!e.target.closest('[data-rdel]')) return;
  const i = +e.target.closest('[data-ri]').dataset.ri, r = S.recurring[i];
  S.recurring.splice(i, 1); buildRecurring(); update();
  toast(`Removed ${r.name || 'repeating entry'}`, () => { S.recurring.splice(i, 0, r); buildRecurring(); update(); });
});
$('add-rec').onclick = () => {
  S.recurring.push({ id: newId(), name: '', amt: 0, kind: 'out', group: 'Buffer', every: 'week', next: Core.addDays(todayDs(), 1) });
  buildRecurring(); update();
  const last = $('rec-list').lastElementChild.querySelector('input'); if (last) last.focus();
};

/* ----- settings: backup ----- */
async function saveBackup() {
  const name = `budget-backup-${todayDs()}.json`;
  const done = how => { S.lastBackup = nowStamp(); update(); $('bk-msg2').textContent = how; toast('Backup saved'); };
  S.lastBackup = nowStamp();
  const file = new File([JSON.stringify(S)], name, { type: 'application/json' });
  // On a phone, the share sheet lets you save to Files / iCloud / Drive or email it; elsewhere, download it.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Budget backup' }); done(`Saved ${name}.`); return; }
    catch (err) { if (err.name === 'AbortError') { $('bk-msg2').textContent = 'Backup cancelled.'; return; } }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  done(`Downloaded ${name}. Keep it somewhere safe, like iCloud Drive or Google Drive.`);
}
$('bk-save').onclick = saveBackup;
$('bk-file').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj || !Array.isArray(obj.items) || !('takeHome' in obj)) throw new Error('not a backup');
    const prev = S;
    S = merge(clone(DEFAULTS), obj); init();
    $('bk-msg2').textContent = `Restored ${f.name}: ${S.log.length} entries.`;
    toast('Backup restored', () => { S = prev; init(); $('bk-msg2').textContent = 'Restore undone.'; });
  } catch (err) {
    $('bk-msg2').textContent = "That file isn't a budget backup. Pick the .json file you saved from this app.";
  }
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
  const st = Core.streak(S.log, todayDs());
  $('today-line').innerHTML = esc(new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }))
    + (st >= 2 ? ` <span class="streak" title="Days in a row you've logged something">${icon('flame')}${st}-day streak</span>` : '');
  const nextPay = Core.periodOf(S, todayDs()).end;
  $('per-note').textContent = `Your budget runs ${PN[S.period.every] === 'month' ? 'monthly' : PN[S.period.every] + 'ly'} from ${dayName(Core.periodOf(S, todayDs()).start)}. Next one starts ${dayName(nextPay)}.`;
  $('bk-last').innerHTML = S.lastBackup ? `Last backup: <b>${dayName(S.lastBackup.slice(0, 10))} ${S.lastBackup.slice(0, 4)}</b>` : "<b>No backup saved yet.</b>";

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
  renderWeek(); renderLog(); renderQuick(); renderGoals(); renderInsights(); renderHistory();
  if (kind === 'out') { const v = qg.value; qg.innerHTML = outOpts(v); } // bills renamed or added
  save();
}

/* ----- tabs ----- */
const PLAN = ['budget', 'europe', 'timeline', 'tracker', 'settings'], TABS = ['week', 'history', 'insights', 'goals'].concat(PLAN);
const navOf = n => PLAN.includes(n) ? 'plan' : n === 'history' ? 'week' : n; // History lives under Home
function showTab(name) {
  if (!TABS.includes(name)) name = 'week';
  TABS.forEach(t => { $('p-' + t).hidden = t !== name; });
  $('plan-head').hidden = !PLAN.includes(name);
  document.querySelectorAll('[data-tab]').forEach(b => {
    const on = b.hasAttribute('data-nav') ? (b.dataset.nav === 'plan' ? 'plan' : b.dataset.tab) === navOf(name) : b.dataset.tab === name;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  if (name === 'timeline') update(); // the chart needs the section visible to measure its width
}
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { history.replaceState(null, '', '#' + b.dataset.tab); showTab(b.dataset.tab); });
$('fab').onclick = () => { if (!$('p-week').hidden) window.scrollTo({ top: 0, behavior: 'smooth' }); else { history.replaceState(null, '', '#week'); showTab('week'); } qn.focus(); };
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

function init() { buildBudget(); buildItin(); buildScenarios(); buildResults(); buildTracker(); buildGoals(); buildRecurring(); update(); syncGuess(); }
init(); showTab(location.hash.slice(1));
// Ready to type on a computer; on a phone, wait for a tap so the keyboard doesn't jump up and shift the page on open.
if (matchMedia('(pointer: fine)').matches && ['', 'week'].includes(location.hash.slice(1))) qn.focus();
// Hide the bottom bar while typing (phones push fixed bars up over the content when the keyboard opens).
const isTyping = el => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|file|date|month)$/.test(el.type)));
document.addEventListener('focusin', e => document.body.classList.toggle('typing', isTyping(e.target)));
document.addEventListener('focusout', () => setTimeout(() => document.body.classList.toggle('typing', isTyping(document.activeElement)), 0));
// Offline support and home-screen install (needs http(s); skipped when opened as a file).
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
