# Premier League Predictions — 2026/27

A single-page prediction form for a mates' Premier League competition. Drag
the 20 teams into a predicted final table, fill in bonus categories, and
submit — predictions are appended as a row in a Google Sheet.

Static HTML/CSS/vanilla JS, no build step, deployable straight to GitHub
Pages. Drag-and-drop is powered by [SortableJS](https://github.com/SortableJS/Sortable),
loaded from a CDN — if it's ever blocked (offline, ad-blocker, CDN outage),
the form still fully works via the up/down buttons on each row.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page markup |
| `styles.css` | All styling — dark mode by default, CSS variables for theming |
| `app.js` | Form logic, drag-and-drop wiring, validation, warnings, submission |
| `google-apps-script/Code.gs` | Backend script that appends submissions to a Google Sheet |

## 1. Deploy the frontend to GitHub Pages

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the repo, go to **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main` (or whichever branch you keep this on), folder `/ (root)`.
4. Save — GitHub will give you a URL like `https://<username>.github.io/<repo>/`.

No build step is required; the three files at the repo root are served as-is.

## 2. Set up the Google Sheet backend

1. Create a new Google Sheet (or reuse an existing one) for the competition.
2. In the Sheet, go to **Extensions > Apps Script**.
3. Delete the placeholder `Code.gs` content and paste in the contents of
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs) from this repo.
4. In the Apps Script toolbar, select the `setupHeaders` function from the
   dropdown next to **Run**, then click **Run**. Approve the permission
   prompts — this creates a `Predictions` tab with a header row.
5. Click **Deploy > New deployment**.
   - Select type **Web app**.
   - **Execute as**: Me.
   - **Who has access**: Anyone.
   - Click **Deploy** and copy the generated URL (ends in `/exec`).
6. Any time you change `Code.gs` later: **Deploy > Manage deployments >
   pencil icon on the existing deployment > Version: New version > Deploy**.
   This keeps the same `/exec` URL. Clicking **Deploy > New deployment**
   again instead gives you a *different* URL, which means updating
   `CONFIG.SCRIPT_URL` in `app.js` to match — the old URL will start
   returning 404s once you do that.

## 3. Wire the frontend to the backend

Open `app.js` and fill in the value at the top:

```js
const CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
};
```

`SCRIPT_URL` is the Apps Script Web App URL from step 2.6 above — the form
POSTs predictions to it, and also GETs it on page load to show the total
pot (see below).

Commit and push the change; GitHub Pages picks it up automatically.

## How submissions reach the Sheet

The form POSTs a JSON payload with `Content-Type: text/plain` (deliberately,
to avoid a CORS preflight request that Apps Script web apps don't handle
well). `doPost` in `Code.gs` parses the body as JSON and appends one row per
submission to the `Predictions` sheet, creating it with headers on first use.

A hidden honeypot field (`website`) provides basic protection against
automated spam submissions to the public endpoint — real visitors never see
or fill it in, and any submission with it populated is silently accepted
without being written to the sheet.

## Payment prompt and total pot

The site never links directly to the Sheet (so entries can't be copied),
but it does two payment-related things:

- A welcome popup on first visit, plus a persistent card in the hero, both
  pointing people at Revolut (`revolut.me/steviemc`) and a "Pay on PayPal"
  button that copies an email address to the clipboard rather than linking
  a `paypal.me` alias, since one may not exist. Update the Revolut handle
  and `PAYPAL_EMAIL` in `app.js`, and the two payment links/buttons in
  `index.html` (in `#welcome-modal` and `.payment-card`), to match your own
  details.
- A "total pot" badge in the header, computed as `entries × ENTRY_FEE`
  (`ENTRY_FEE` is set in `app.js`, currently 20 to match the rules text).
  It calls `doGet` on the same Apps Script endpoint, which returns just a
  row count — never the actual predictions — so the pot size is visible
  without exposing anyone's picks.

## Entry lock and the results grid

At a fixed moment the site stops taking entries and switches to showing
everyone's picks. That instant is defined in **two places and they must
match**:

- `REVEAL_AT_UTC` in `google-apps-script/Code.gs`
- `REVEAL_AT` in `app.js`

Both are stored as UTC so the switch happens at the same real-world moment
regardless of where someone is viewing from. Currently
`2026-08-21T17:45:00Z` — that's 18:45 BST.

The server is the authority, not the browser:

- Before the deadline, `doGet` returns only the entry count. Someone hitting
  the endpoint directly can't read anyone's picks early.
- After it, `doGet` returns every row, and `doPost` refuses new
  submissions — so a late entry is genuinely blocked, not just hidden.

The frontend checks the clock on load and every 15 seconds, so a page left
open through the deadline flips itself over. If a viewer's clock is wrong
and the frontend switches early, the server still declines to send the
picks and the grid shows "Entries are still locked."

The grid puts categories down the left and predictors across the top, both
pinned while scrolling, with each entry's submission date and time under
the name. It scrolls inside its own container so the page itself never
pans sideways on a phone.

## Customizing

- **Teams**: edit the `TEAMS` and `PROMOTED_TEAMS` arrays at the top of
  `app.js`.
- **Zones/colours**: `zoneForPosition()` in `app.js` and the `--zone-*` CSS
  variables in `styles.css` control the Champions League / Europe /
  relegation colour bands on the table.
- **Warnings**: the cheeky cross-reference checks live in `evaluateWarnings()`
  in `app.js` — add, remove, or reword them there.
