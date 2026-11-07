# Weekly Budget

A personal spending tracker and savings plan, built for logging on your phone. Plain HTML, CSS and JavaScript: no build step, no server, no accounts. Everything you enter stays on your device.

**Live:** https://gamesinabox.github.io/budget-plan/

## Install it on your phone

Open the link above, then:

- **iPhone (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** ⋮ menu → **Add to Home screen** (or **Install app**).

It then opens full-screen from its own icon and works with no signal. Installing also matters on iPhone: Safari can clear a website's stored data if you don't visit for 7 days, but apps added to the Home Screen keep theirs.

## First time: load your real figures

The app starts with demo numbers. Your real plan is in `personal.json` (never committed; it also sets your Tuesday pay week and weekly pay).

1. Get `personal.json` onto the phone (email it to yourself, or put it in iCloud Drive / Google Drive).
2. In the app: **Plan → Settings → Restore from file**, and pick it.

## Using it

- **Log anything fast:** type `coke 3.50` and press Enter, and it's logged. The category is guessed (tap it to change; it remembers). A bare number like `fuel 98` is put in the price box for you to check first. The **+** button jumps back to the box from anywhere.
- **Pay and savings:** type `pay 1162` and it's logged as money in. Tap **Saved** when you move money to savings: just the amount. It all goes in one pot, shared across your goals the way your plan splits your weekly saving.
- **Repeating entries:** pay, rent and other regulars (Plan → Settings, or **Repeat weekly** on any entry). On the day, Home shows a card: check the amount, tap **Log it** (or **Skip**).
- **Fix anything:** tap an entry to change its name, amount, date, category or type, or delete it. Every change has Undo.
- **Earlier dates:** tap the date chip to log something from a previous day.
- **Pay periods:** your budget runs payday to payday (weekly, fortnightly or monthly, Plan → Settings). Home shows spending money left until payday, a per-day amount, and what your account should hold before and after the next pay lands (set your balance once by tapping **Account**).
- **Warnings and recaps:** you're told the moment something takes a category over its plan. At the start of each pay period, a recap of the last one. Your logging streak sits under the date.
- **Bills:** tick "Bill" next to rent, insurance, rego and so on (Plan → Budget). They count at their share every period, so a monthly bill never wrecks one week. The Bills list shows what's paid.
- **History:** search every entry by name or category, filter by type, category and month, with totals.
- **Insights:** where your money goes, this month against last month, your biggest items, a weekly chart against plan, predictions (pace, month forecast, saving pace, deposit date at that pace) and ways to save more, ranked by how much each saves a year.
- **Goals:** every target and date is editable. Add your own goals with a weekly amount; that money comes out of the house fund.
- **Plan:** the full budget, Europe trip, house timeline and weekly tracker.

## Back up

Your data lives only on the device. **Plan → Settings → Save backup file** (on a phone this opens the share sheet: save to Files, iCloud Drive or Google Drive, or email it to yourself). Home reminds you if it's been a week. **Restore from file** brings it back on any device, with Undo.

## Tests

```
node --test
```

Needs Node 18+, nothing to install. `tests/acceptance.local.test.js` (gitignored) checks the spec's numbers against `personal.json`.

## Deploying changes

Push to `main`; GitHub Pages republishes in about a minute. The app checks for a new version whenever it's opened online (`sw.js` fetches fresh files first and only falls back to its saved copy offline). If you change the list of app files, update `SHELL` in `sw.js`.

The published site only contains demo numbers. Keep `personal.json` out of the repo (it's in `.gitignore`).

## Files

```
index.html             the page
css/styles.css         look and feel, light and dark
js/core.js             calculations, categoriser, periods, insights (no DOM, also runs in Node)
js/defaults.js         demo starting data
js/app.js              UI, storage, tabs, charts
sw.js                  offline support
manifest.webmanifest   home-screen install
icons/                 app icons
tests/core.test.js     node --test
```

All figures are estimates, not financial advice.
