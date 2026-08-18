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
6. Any time you change `Code.gs` later, redeploy (**Deploy > Manage
   deployments > edit (pencil) > New version**) — editing the script alone
   does not update the live URL.

## 3. Wire the frontend to the backend

Open `app.js` and fill in the two values at the top:

```js
const CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  SHEET_VIEW_URL: 'https://docs.google.com/spreadsheets/d/....../edit',
};
```

- `SCRIPT_URL` is the Apps Script Web App URL from step 2.6 above — this is
  what the form POSTs predictions to.
- `SHEET_VIEW_URL` is whatever link you want the "View Dashboard" button to
  open (e.g. the Sheet itself, or a published/read-only view — **File >
  Share > Publish to web** if you'd rather your mates couldn't edit it
  directly).

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

## Customizing

- **Teams**: edit the `TEAMS` and `PROMOTED_TEAMS` arrays at the top of
  `app.js`.
- **Zones/colours**: `zoneForPosition()` in `app.js` and the `--zone-*` CSS
  variables in `styles.css` control the Champions League / Europe /
  relegation colour bands on the table.
- **Warnings**: the cheeky cross-reference checks live in `evaluateWarnings()`
  in `app.js` — add, remove, or reword them there.
