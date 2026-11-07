# Weekly Budget

A personal spending tracker and savings plan. Plain HTML, CSS and JavaScript: no build step, no server, no accounts, no network calls. Everything you enter stays in your browser.

## Use it

Open `index.html` in a browser (double-click it). That's it.

- **Log a purchase:** type what you bought ("can of soft drink"), press Enter, type the price, press Enter. The category is guessed for you; tap it to change it and the app remembers your choice next time. Press `/` (or the + button at the bottom) to jump back to the box.
- **Money in and savings:** type "pay" (or "Mum paid me back", "refund") and it switches to **Got paid**. Tap **Saved** when you move money to savings: just the amount, no name. It all goes in one pot and is shared across your goals the way your plan splits your weekly saving.
- **Insights:** where your money goes, your biggest items, day-to-day spending by week, predictions (this month's total, your saving pace, when the deposit will be ready at that pace) and ways to save more, ranked by how much each saves a year. Predictions start after a week of logging.
- **Bills:** tick "Bill" next to rent, insurance, rego and so on in the Budget tab. Log "car insurance" or "rego" and it's matched to the bill. Bills count at their weekly share every week, so paying a monthly bill doesn't wreck that week, and the Bills list shows what's paid this month.
- **Earlier dates:** tap the date next to the category to log something from a previous day. It goes back to today after each entry.
- **Everyday account:** set your bank balance once on This week. After that it moves with everything you log, so you can check it against your bank app.
- **Goals:** every target and date is editable, including when you want the deposit by. Add your own goals with a weekly amount; that money comes out of the house fund.
- **Again:** your most-logged items appear as one-tap buttons under the box.
- **This week:** spending money left (bills excluded), a per-day allowance, whether you're still on track to save your weekly target, and every category against its plan.
- **Budget / Europe / House / Tracker:** the full savings plan. Logged purchases roll into the Tracker row for their week (Monday start).

### Load your real figures (first time only)

The app starts with demo numbers. Your real plan is in `personal.json` (never committed).

1. Open `personal.json` in a text editor and copy everything.
2. In the app, go to **Tracker > Backup and reset**, paste into the box, press **Load from the box**.

To move your data to another device (e.g. your phone), use **Show my data** on one device and **Load from the box** on the other.

## Tests

```
node --test
```

Needs Node 18+, nothing to install. The acceptance numbers check against `personal.json` and skip if it's missing.

## Put it online with GitHub Pages

1. Push this repo to GitHub.
2. Settings > Pages > Build and deployment > Deploy from a branch > `main`, `/ (root)` > Save.
3. Open the URL GitHub shows (on your phone too, and use "Add to Home Screen").

The published site only contains the demo numbers. Your real figures never leave your browser, so a public repo is fine as long as `personal.json` stays out of it (it is in `.gitignore`). On a free GitHub plan, Pages only works for public repos; private-repo Pages needs GitHub Pro.

## Files

```
index.html          the page
css/styles.css      look and feel, light and dark
js/core.js          calculations and the categoriser (no DOM, also runs in Node)
js/defaults.js      demo starting data
js/app.js           UI, storage, tabs, chart
tests/core.test.js  node --test
```

All figures are estimates, not financial advice.
