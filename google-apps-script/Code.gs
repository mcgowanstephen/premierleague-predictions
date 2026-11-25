/**
 * Premier League Predictions — Google Apps Script backend.
 *
 * SETUP
 * 1. Create (or open) the Google Sheet you want predictions saved into.
 * 2. Extensions > Apps Script, delete any boilerplate, and paste this file in.
 * 3. Run `setupHeaders` once from the editor toolbar to authorize the script
 *    and create the "Predictions" tab with a header row.
 * 4. Deploy > New deployment > select type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the resulting /exec URL into CONFIG.SCRIPT_URL in app.js.
 *
 * UPDATING THE CODE LATER — READ THIS CAREFULLY, it's easy to get wrong:
 * Saving this file does NOT update the live /exec URL. To ship a change:
 *   Deploy > Manage deployments > pencil icon on the EXISTING deployment
 *   > Version: "New version" > Deploy.
 * This keeps the same /exec URL working. If you instead click "New
 * deployment" again, you'll get a DIFFERENT /exec URL, and app.js's
 * CONFIG.SCRIPT_URL will need updating to match (the old URL may stop
 * resolving, which shows up as a 404 in the browser).
 */

const SHEET_NAME = 'Predictions';

/**
 * The moment entries lock and everyone's picks become readable.
 * Stored as UTC: 18:45 BST (British Summer Time, UTC+1) on Fri 21 Aug 2026
 * is 17:45 UTC. Using a fixed UTC instant means the switch happens at the
 * same real-world moment for everyone, wherever they're viewing from.
 *
 * Before this instant: doGet returns only the entry COUNT, so nobody can
 * read anyone else's picks early. After it: doGet returns every entry, and
 * doPost stops accepting new submissions.
 */
const REVEAL_AT_UTC = '2026-08-21T17:45:00Z';

function isRevealed() {
  return new Date().getTime() >= new Date(REVEAL_AT_UTC).getTime();
}

const COLUMNS = [
  'Timestamp', 'Season', 'Predictor Name',
  'Pos 1', 'Pos 2', 'Pos 3', 'Pos 4', 'Pos 5', 'Pos 6', 'Pos 7', 'Pos 8',
  'Pos 9', 'Pos 10', 'Pos 11', 'Pos 12', 'Pos 13', 'Pos 14', 'Pos 15',
  'Pos 16', 'Pos 17', 'Pos 18', 'Pos 19', 'Pos 20',
  'Top Goalscorer', 'Most Assists', 'Most Yellow Cards', 'Most Red Cards',
  'Most Clean Sheets', 'Player of the Year', 'Manager of the Year',
  'First Manager Sacked', 'Top on Christmas Day', 'Boxing Day Bottom Team',
  'Best Goal Difference', 'First Team to 20 Points',
  'Last Undefeated Team', 'Survival Line Points (17th)',
  'Highest Scoring Promoted Team',
];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No data received.');
    }

    const data = JSON.parse(e.postData.contents);

    // Honeypot — real users never fill this in. Pretend success so a bot
    // doesn't learn to look elsewhere, but skip writing the row.
    if (data.website) {
      return jsonResponse({ result: 'success' });
    }

    // Hard lock. The frontend also hides the form after the deadline, but
    // that's only cosmetic — this is what actually stops a late entry.
    if (isRevealed()) {
      throw new Error('Entries closed at 18:45 on Friday 21 August.');
    }

    if (!data.predictorName || !Array.isArray(data.leagueTable) || data.leagueTable.length !== 20) {
      throw new Error('Prediction payload is missing required fields.');
    }

    const sheet = getOrCreateSheet();
    sheet.appendRow(buildRow(data));

    return jsonResponse({ result: 'success' });
  } catch (err) {
    return jsonResponse({ result: 'error', message: err.message });
  }
}

function doGet() {
  try {
    const sheet = getOrCreateSheet();
    const entries = Math.max(0, sheet.getLastRow() - 1); // minus header row
    const revealed = isRevealed();

    const payload = {
      result: 'ok',
      entries: entries,
      revealed: revealed,
      revealAt: REVEAL_AT_UTC,
    };

    // Only hand out the actual predictions once entries have locked.
    if (revealed && entries > 0) {
      payload.columns = COLUMNS;
      payload.rows = sheet
        .getRange(2, 1, entries, COLUMNS.length)
        .getDisplayValues();

      // Settled answers and everyone's marks, scored fresh on every
      // request so the site is never behind the Results tab.
      const scored = scoreAll(payload.rows);
      payload.results = scored.results;
      payload.marks = scored.marks;
    }

    return jsonResponse(payload);
  } catch (err) {
    return jsonResponse({ result: 'error', message: err.message });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildRow(data) {
  const positions = [];
  for (let i = 0; i < 20; i++) {
    positions.push(data.leagueTable[i] || '');
  }

  return [
    data.timestamp || new Date().toISOString(),
    data.season || '',
    data.predictorName || '',
    ...positions,
    data.topGoalscorer || '',
    data.mostAssists || '',
    data.mostYellowCards || '',
    data.mostRedCards || '',
    data.mostCleanSheets || '',
    data.playerOfTheYear || '',
    data.managerOfTheYear || '',
    data.firstManagerSacked || '',
    data.christmasDayTop || '',
    data.boxingDayBottom || '',
    data.bestGoalDifference || '',
    data.firstTo20Points || '',
    data.lastUndefeatedTeam || '',
    data.survivalLinePoints || '',
    data.highestScoringPromotedTeam || '',
  ];
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once manually from the Apps Script editor (select this function in
 * the toolbar dropdown, then click Run) to authorize the script and create
 * the "Predictions" sheet with its header row ahead of the first real
 * submission.
 */
function setupHeaders() {
  getOrCreateSheet();
}

/* ==========================================================================
   SCORING

   Three extra tabs, all created by running `setupScoring` once:

   - Results   — you fill this in. One row per category; type the real
                 answer in "Answer" once it's settled and leave it blank
                 until then. "Also Accept" takes extra correct answers
                 separated by | (for joint winners, or a spelling you've
                 agreed to allow). "Settled On" is just for reference.
   - Overrides — optional. A row here (Predictor, Category, Points, Reason)
                 replaces whatever the script worked out for that one
                 person and category. Use it to settle arguments.
   - Scores    — written by the script; don't edit it by hand. Rebuilt
                 whenever you edit Results or Overrides, or from the
                 Predictions menu > Recalculate scores.

   Category names must match the Predictions column headers exactly
   ("Pos 1" .. "Pos 20", "First Manager Sacked", etc.) — setupScoring
   writes them in for you, so it's easiest not to retype them.

   The website scores entries itself on every load (see doGet), so the
   Scores tab is only there so the tally is visible in the Sheet. Neither
   one needs a redeploy when answers change.
   ========================================================================== */

const RESULTS_SHEET = 'Results';
const OVERRIDES_SHEET = 'Overrides';
const SCORES_SHEET = 'Scores';

// Everything from "Pos 1" onwards can be scored.
const SCORED_COLUMNS = COLUMNS.slice(COLUMNS.indexOf('Pos 1'));

// Rules: 1 point per correct answer, plus 1 bonus point for an exact
// 1st, 2nd, 3rd, 18th, 19th or 20th, and for the first manager sacked.
const BASE_POINTS = 1;
const BONUS_POINTS = {
  'Pos 1': 1, 'Pos 2': 1, 'Pos 3': 1,
  'Pos 18': 1, 'Pos 19': 1, 'Pos 20': 1,
  'First Manager Sacked': 1,
};

// Typed-in names (not picked from a dropdown) get lenient matching — see
// namesMatch(). Everything else is a team or a number and must match
// exactly, give or take case and spacing.
const PERSON_COLUMNS = [
  'Top Goalscorer', 'Most Assists', 'Most Yellow Cards', 'Most Red Cards',
  'Most Clean Sheets', 'Player of the Year', 'Manager of the Year',
  'First Manager Sacked',
];

// Answers already settled when the scoring was added, so the Results tab
// starts filled in. Only used when setupScoring creates the tab; after
// that, the Results tab is the only source of truth.
const SEED_RESULTS = {
  'First Manager Sacked': ['Michael Carrick', '', '2026-11-12', 'Man United. Palace sacked Pierre Sage ~30 mins later the same morning.'],
  'First Team to 20 Points': ['Man City', '', '', 'Won their first 7 (21 pts after game 7). Nobody else could reach 20 that early.'],
  'Last Undefeated Team': ['Man City', '', '2026-10-24', 'First defeat 2-1 at Aston Villa.'],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Predictions')
    .addItem('Recalculate scores', 'recalculateScores')
    .addItem('Set up scoring tabs', 'setupScoring')
    .addToUi();
}

// Simple trigger: rescore as soon as an answer or override is typed in.
function onEdit(e) {
  const name = e && e.range && e.range.getSheet().getName();
  if (name === RESULTS_SHEET || name === OVERRIDES_SHEET) {
    recalculateScores();
  }
}

/**
 * Run once from the editor (or the Predictions menu) to create the
 * Results, Overrides and Scores tabs. Safe to run again — tabs that
 * already exist are left alone.
 */
function setupScoring() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss.getSheetByName(RESULTS_SHEET)) {
    const sheet = ss.insertSheet(RESULTS_SHEET);
    const rows = [['Category', 'Answer', 'Also Accept', 'Settled On', 'Notes']];
    SCORED_COLUMNS.forEach((col) => {
      const seed = SEED_RESULTS[col] || ['', '', '', ''];
      rows.push([col].concat(seed));
    });
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sheet.getRange('D:D').setNumberFormat('@'); // keep dates as typed
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    sheet.autoResizeColumns(1, rows[0].length);
  }

  if (!ss.getSheetByName(OVERRIDES_SHEET)) {
    const sheet = ss.insertSheet(OVERRIDES_SHEET);
    sheet.appendRow(['Predictor', 'Category', 'Points', 'Reason']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  recalculateScores();
}

/** Rebuilds the Scores tab from Predictions + Results + Overrides. */
function recalculateScores() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const predictions = getOrCreateSheet();
  const count = Math.max(0, predictions.getLastRow() - 1);
  const rows = count > 0
    ? predictions.getRange(2, 1, count, COLUMNS.length).getDisplayValues()
    : [];

  const scored = scoreAll(rows);
  const settledCols = scored.results.map((r) => r.category);

  const table = rows.map((row, i) => {
    const marks = scored.marks[i];
    const total = marks.reduce((sum, m) => sum + (m || 0), 0);
    const perCategory = settledCols.map((col) => marks[COLUMNS.indexOf(col)] || 0);
    return { name: row[2], total: total, perCategory: perCategory };
  });
  table.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));

  // Joint positions share a rank: 1, 2, 2, 4.
  const out = [['Rank', 'Predictor', 'Total'].concat(settledCols)];
  table.forEach((t, i) => {
    const rank = i > 0 && t.total === table[i - 1].total ? out[i][0] : i + 1;
    out.push([rank, t.name, t.total].concat(t.perCategory));
  });

  let sheet = ss.getSheetByName(SCORES_SHEET);
  if (!sheet) sheet = ss.insertSheet(SCORES_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, out.length, out[0].length).setValues(out);
  sheet.getRange(1, 1, 1, out[0].length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  const updated = 'Updated ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'd MMM yyyy HH:mm');
  sheet.getRange(out.length + 2, 1).setValue(updated).setFontStyle('italic');
}

/**
 * Scores every entry against the settled answers.
 * Returns:
 *   results — [{ category, answer, settledOn, notes }] for settled rows only
 *   marks   — one array per entry, aligned with COLUMNS: null where the
 *             category isn't settled (or isn't scored), otherwise points.
 */
function scoreAll(rows) {
  const results = readResults();
  const overrides = readOverrides();

  const marks = rows.map((row) => {
    const name = normalise(row[2]);
    return COLUMNS.map((col, c) => {
      const result = results.byCategory[col];
      if (!result) return null;
      const key = name + '\u0000' + col;
      if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
      return isCorrect(col, row[c], result.accepted)
        ? BASE_POINTS + (BONUS_POINTS[col] || 0)
        : 0;
    });
  });

  return { results: results.list, marks: marks };
}

function readResults() {
  const list = [];
  const byCategory = {};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESULTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { list: list, byCategory: byCategory };

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues().forEach((r) => {
    const category = String(r[0]).trim();
    const answer = String(r[1]).trim();
    if (!answer || SCORED_COLUMNS.indexOf(category) === -1) return;
    const accepted = [answer].concat(
      String(r[2]).split('|').map((a) => a.trim()).filter(Boolean)
    );
    byCategory[category] = { accepted: accepted };
    list.push({ category: category, answer: answer, settledOn: String(r[3]).trim(), notes: String(r[4]).trim() });
  });
  return { list: list, byCategory: byCategory };
}

function readOverrides() {
  const overrides = {};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(OVERRIDES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return overrides;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach((r) => {
    const name = normalise(r[0]);
    const category = String(r[1]).trim();
    const points = Number(r[2]);
    if (!name || !category || String(r[2]).trim() === '' || isNaN(points)) return;
    overrides[name + '\u0000' + category] = points;
  });
  return overrides;
}

function isCorrect(col, pick, accepted) {
  if (!String(pick).trim()) return false;
  if (PERSON_COLUMNS.indexOf(col) !== -1) {
    return accepted.some((a) => namesMatch(pick, a));
  }
  return accepted.some((a) => normalise(a) === normalise(pick));
}

/**
 * Lenient name matching for typed-in answers. Against "Michael Carrick":
 *   "Michael Carrick", "carrick", "M. Carrick", "Micheal Carrick",
 *   "Carrick (Man Utd)"                                    -> match
 *   "Kieran Carrick" (wrong first initial), "Michael"      -> no match
 * i.e. the surname must appear, and if there's a first name or initial in
 * front of it, its first letter must match too. Misspelt surnames won't
 * match — fix those with an "Also Accept" entry or an Override.
 */
function namesMatch(pick, answer) {
  const p = normalise(pick);
  const a = normalise(answer);
  if (!p || !a) return false;
  if (p === a) return true;

  const pWords = p.split(' ');
  const aWords = a.split(' ');
  const surname = aWords[aWords.length - 1];
  const at = pWords.lastIndexOf(surname);
  if (at === -1) return false;
  if (at === 0 || aWords.length === 1) return true;
  return pWords[at - 1].charAt(0) === aWords[0].charAt(0);
}

// Lowercase, strip accents and punctuation, collapse spaces.
function normalise(value) {
  return String(value == null ? '' : value)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
