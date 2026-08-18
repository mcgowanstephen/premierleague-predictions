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
    return jsonResponse({ result: 'ok', entries: entries });
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
