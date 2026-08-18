'use strict';

/* ==========================================================================
   CONFIG — the only two things you need to fill in once your Google Sheet
   and Apps Script are set up. See README.md and google-apps-script/Code.gs.
   ========================================================================== */
const CONFIG = {
  // Paste the deployed Google Apps Script Web App URL here, e.g.
  // "https://script.google.com/macros/s/AKfycb.../exec"
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzlc9fUrqLud6k4h0jPUqiYuU8jlEEOBcd1t0DWvaQVfaDbpBlUjnVvWp7L8ZNwz97b0w/exec',

  // Paste the shareable URL of your Google Sheet here (used for the
  // "View Dashboard" link in the header and on the success screen).
  SHEET_VIEW_URL: 'https://docs.google.com/spreadsheets/d/1hPuOysPftninKpzSBGaSXFA2h6XyJSuJIUYopiR7sTQ/edit?usp=sharing',
};

/* ==========================================================================
   Data
   ========================================================================== */
const TEAMS = [
  'Bournemouth', 'Arsenal', 'Aston Villa', 'Brentford', 'Brighton', 'Chelsea',
  'Coventry', 'Crystal Palace', 'Everton', 'Fulham', 'Hull', 'Ipswich Town',
  'Leeds', 'Liverpool', 'Man City', 'Man United', 'Newcastle', 'Nottm Forest',
  'Sunderland', 'Tottenham',
];

const PROMOTED_TEAMS = ['Coventry', 'Hull', 'Ipswich Town'];

const SEASON = '2026/27';

// The actual final 2025/26 table, used to power the "last season" info-dot
// tooltips on the league table. Computed directly from a full match-by-match
// results dataset for the season (all 380 fixtures), so this is exact.
const LAST_YEAR_TABLE = [
  'Arsenal', 'Man City', 'Man United', 'Aston Villa', 'Liverpool',
  'Bournemouth', 'Sunderland', 'Brighton', 'Brentford', 'Chelsea',
  'Fulham', 'Newcastle', 'Everton', 'Leeds', 'Crystal Palace',
  'Nottm Forest', 'Tottenham', 'West Ham', 'Burnley', 'Wolves',
];

const TEAM_SELECT_IDS = [
  'christmasDayTop', 'boxingDayBottom', 'bestGoalDifference',
  'firstTo20Points', 'mostPenaltiesAwarded', 'lastUndefeatedTeam',
];

const REQUIRED_TEXT_IDS = [
  'predictorName', 'topGoalscorer', 'mostAssists', 'mostYellowCards',
  'mostRedCards', 'mostCleanSheets', 'playerOfTheYear', 'managerOfTheYear',
  'firstManagerSacked',
];

const REQUIRED_SELECT_IDS = [...TEAM_SELECT_IDS, 'highestScoringPromotedTeam'];

/* ==========================================================================
   DOM refs
   ========================================================================== */
const form = document.getElementById('predictions-form');
const leagueList = document.getElementById('league-list');
const submitBtn = document.getElementById('submit-btn');
const submitHint = document.getElementById('submit-hint');
const progressBar = document.getElementById('progress-bar');
const completionValue = document.getElementById('completion-value');
const warningsPanel = document.getElementById('warnings-panel');
const toastContainer = document.getElementById('toast-container');
const successScreen = document.getElementById('success-screen');
const dashboardLink = document.getElementById('dashboard-link');
const successDashboardLink = document.getElementById('success-dashboard-link');

/* ==========================================================================
   Theme
   ========================================================================== */
(function initTheme() {
  const stored = localStorage.getItem('plp-theme');
  const theme = stored || 'dark';
  applyTheme(theme);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('plp-theme', next);
  });
})();

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.getElementById('theme-icon-moon').hidden = theme !== 'dark';
  document.getElementById('theme-icon-sun').hidden = theme === 'dark';
}

/* ==========================================================================
   Dashboard link wiring
   ========================================================================== */
[dashboardLink, successDashboardLink].forEach((link) => {
  if (!link) return;
  if (CONFIG.SHEET_VIEW_URL) {
    link.href = CONFIG.SHEET_VIEW_URL;
  } else {
    link.href = '#';
    link.setAttribute('aria-disabled', 'true');
    link.title = 'Dashboard link not configured yet';
  }
});

/* ==========================================================================
   Populate <select> elements with team options
   ========================================================================== */
function populateSelect(id, options) {
  const select = document.getElementById(id);
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a team…';
  placeholder.disabled = true;
  placeholder.defaultSelected = true; // so form.reset() restores it, not just initial render
  select.appendChild(placeholder);

  options.forEach((team) => {
    const opt = document.createElement('option');
    opt.value = team;
    opt.textContent = team;
    select.appendChild(opt);
  });
}

TEAM_SELECT_IDS.forEach((id) => populateSelect(id, TEAMS));
populateSelect('highestScoringPromotedTeam', PROMOTED_TEAMS);

/* ==========================================================================
   League table drag-and-drop list
   ========================================================================== */
function zoneForPosition(pos) {
  if (pos <= 4) return 'cl';
  if (pos <= 6) return 'el';
  if (pos >= 18) return 'rel';
  return 'mid';
}

function lastYearWindow(pos) {
  const lines = [];
  for (let p = Math.max(1, pos - 1); p <= Math.min(20, pos + 1); p++) {
    lines.push(`${p}. ${LAST_YEAR_TABLE[p - 1]}`);
  }
  return `2025/26:\n${lines.join('\n')}`;
}

function buildTeamRow(team) {
  const li = document.createElement('li');
  li.className = 'team-row';
  li.dataset.team = team;

  li.innerHTML = `
    <span class="pos-badge" data-role="badge">0</span>
    <button type="button" class="info-dot" data-role="info" aria-label="Show 2025/26 result near this position">i</button>
    <span class="drag-handle" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
    <span class="team-name">${team}</span>
    <span class="row-actions">
      <button type="button" class="btn-icon" data-action="up" aria-label="Move ${team} up one place">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button type="button" class="btn-icon" data-action="down" aria-label="Move ${team} down one place">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </span>
  `;
  return li;
}

function renderLeagueList(order) {
  leagueList.innerHTML = '';
  order.forEach((team) => leagueList.appendChild(buildTeamRow(team)));
  refreshPositions();
}

function refreshPositions() {
  const rows = Array.from(leagueList.children);
  rows.forEach((row, index) => {
    const pos = index + 1;
    const zone = zoneForPosition(pos);
    const badge = row.querySelector('[data-role="badge"]');
    badge.textContent = String(pos);
    badge.className = `pos-badge zone-${zone}`;

    row.querySelector('[data-role="info"]').dataset.tooltip = lastYearWindow(pos);

    const upBtn = row.querySelector('[data-action="up"]');
    const downBtn = row.querySelector('[data-action="down"]');
    upBtn.disabled = index === 0;
    downBtn.disabled = index === rows.length - 1;
  });
}

function getLeagueOrder() {
  return Array.from(leagueList.children).map((row) => row.dataset.team);
}

renderLeagueList([...TEAMS]);

// Guarded: if the vendored library ever fails to load/parse, the rest of
// the form (validation, warnings, submission) must still work — reordering
// simply falls back to the up/down buttons, which are always present.
if (typeof Sortable !== 'undefined') {
  new Sortable(leagueList, {
    animation: 180,
    handle: undefined, // whole row is draggable
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    delay: 80,
    delayOnTouchOnly: true,
    onEnd: () => {
      refreshPositions();
      evaluateWarnings();
    },
  });
} else {
  console.warn('SortableJS failed to load — falling back to up/down buttons only.');
}

leagueList.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-icon');
  if (!btn) return;
  const row = btn.closest('.team-row');
  const action = btn.dataset.action;

  if (action === 'up' && row.previousElementSibling) {
    leagueList.insertBefore(row, row.previousElementSibling);
  } else if (action === 'down' && row.nextElementSibling) {
    leagueList.insertBefore(row.nextElementSibling, row);
  } else {
    return;
  }
  row.classList.add('row-flash');
  setTimeout(() => row.classList.remove('row-flash'), 500);
  refreshPositions();
  evaluateWarnings();
});

document.getElementById('btn-alphabetical').addEventListener('click', () => {
  renderLeagueList([...TEAMS].sort((a, b) => a.localeCompare(b)));
  evaluateWarnings();
});

document.getElementById('btn-shuffle').addEventListener('click', () => {
  const shuffled = [...TEAMS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  renderLeagueList(shuffled);
  evaluateWarnings();
});

/* ==========================================================================
   Toasts
   ========================================================================== */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), 6000);
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  toast.classList.add('toast--leaving');
  setTimeout(() => toast.remove(), 200);
}

/* ==========================================================================
   Cheeky cross-reference warnings (non-blocking)
   ========================================================================== */
const activeWarnings = new Map();

function setWarning(id, message, isActive) {
  const wasActive = activeWarnings.has(id);
  if (isActive && !wasActive) {
    activeWarnings.set(id, message);
    showToast(message, 'warning');
  } else if (isActive && wasActive) {
    activeWarnings.set(id, message);
  } else if (!isActive && wasActive) {
    activeWarnings.delete(id);
  }
}

function renderWarningsPanel() {
  if (activeWarnings.size === 0) {
    warningsPanel.hidden = true;
    warningsPanel.innerHTML = '';
    return;
  }
  warningsPanel.hidden = false;
  warningsPanel.innerHTML = Array.from(activeWarnings.values()).map((msg) => `
    <div class="warning-item">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span>${msg}</span>
    </div>
  `).join('');
}

function evaluateWarnings() {
  const order = getLeagueOrder();
  const indexOf = (team) => order.indexOf(team);

  // 1. Sunderland predicted to win the league.
  setWarning(
    'sunderland-champion',
    'Sunderland to win the league?! Are you okay?',
    order[0] === 'Sunderland'
  );

  // 2. Boxing Day bottom team is also in this predictor's own top 6.
  const boxingDayBottom = val('boxingDayBottom');
  const boxingDayIdx = boxingDayBottom ? indexOf(boxingDayBottom) : -1;
  setWarning(
    'boxing-day-top6',
    `Your Boxing Day bottom club (${boxingDayBottom}) is sitting in your own top 6 come May — that's some run-in.`,
    boxingDayIdx !== -1 && boxingDayIdx < 6
  );

  // 3. Top on Christmas Day but relegated by the end of the season.
  const christmasTop = val('christmasDayTop');
  const christmasIdx = christmasTop ? indexOf(christmasTop) : -1;
  setWarning(
    'christmas-top-relegated',
    `Top of the league at Christmas but relegated by May, ${christmasTop}? Talk about a collapse.`,
    christmasIdx !== -1 && christmasIdx >= 17
  );

  // 4. Highest scoring promoted team placed below one of the other promoted sides.
  const highestScoringPromoted = val('highestScoringPromotedTeam');
  let promotedOrderIssue = false;
  let promotedOutrankedBy = '';
  if (highestScoringPromoted) {
    const chosenIdx = indexOf(highestScoringPromoted);
    const others = PROMOTED_TEAMS.filter((t) => t !== highestScoringPromoted);
    for (const other of others) {
      const otherIdx = indexOf(other);
      if (otherIdx !== -1 && chosenIdx !== -1 && otherIdx < chosenIdx) {
        promotedOrderIssue = true;
        promotedOutrankedBy = other;
        break;
      }
    }
  }
  setWarning(
    'promoted-team-order',
    `You've picked ${highestScoringPromoted} as the highest-scoring promoted side, but ${promotedOutrankedBy} is predicted to finish above them — worth a rethink?`,
    promotedOrderIssue
  );

  // 5. First manager sacked at a club also predicted for the top 4.
  const firstSackedText = (val('firstManagerSacked') || '').trim().toLowerCase();
  const sackedTeamMatch = TEAMS.find((t) => t.toLowerCase() === firstSackedText);
  const sackedIdx = sackedTeamMatch ? indexOf(sackedTeamMatch) : -1;
  setWarning(
    'manager-sacked-top4',
    `Backing ${sackedTeamMatch} for the top four but tipping them to sack their manager first? Bold shout.`,
    sackedIdx !== -1 && sackedIdx < 4
  );

  // 6. Last remaining undefeated team also predicted for relegation.
  const undefeated = val('lastUndefeatedTeam');
  const undefeatedIdx = undefeated ? indexOf(undefeated) : -1;
  setWarning(
    'undefeated-relegated',
    `${undefeated} is your last unbeaten team of the season — and also in your relegation zone. Really?`,
    undefeatedIdx !== -1 && undefeatedIdx >= 17
  );

  renderWarningsPanel();
}

/* ==========================================================================
   Validation
   ========================================================================== */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

// Fields only show their red/invalid state once the user has actually
// interacted with them (or a submit was attempted) — not on first render.
const touchedFields = new Set();
const VALIDATED_IDS = [...REQUIRED_TEXT_IDS, ...REQUIRED_SELECT_IDS, 'survivalLinePoints'];

function setFieldValid(id, isValid, message) {
  const field = document.getElementById(id).closest('.field');
  const errorEl = document.getElementById(`err-${id}`);
  if (!field) return;
  const showError = !isValid && touchedFields.has(id);
  field.classList.toggle('is-invalid', showError);
  if (errorEl) errorEl.textContent = showError ? (message || 'Required') : '';
}

form.addEventListener('focusout', (e) => {
  if (!e.target.id || !VALIDATED_IDS.includes(e.target.id)) return;
  touchedFields.add(e.target.id);
  computeValidity();
});

function computeValidity() {
  let filledCount = 0;
  let totalCount = 0;
  let allValid = true;

  REQUIRED_TEXT_IDS.forEach((id) => {
    totalCount++;
    const value = val(id);
    const isValid = value.length > 0;
    if (isValid) filledCount++;
    else allValid = false;
    setFieldValid(id, isValid);
  });

  REQUIRED_SELECT_IDS.forEach((id) => {
    totalCount++;
    const value = val(id);
    const isValid = value.length > 0;
    if (isValid) filledCount++;
    else allValid = false;
    setFieldValid(id, isValid);
  });

  // Survival line points: any non-negative whole number — this is a guess at
  // 17th place's actual points total, not bounded to a fixed range.
  totalCount++;
  const survivalRaw = val('survivalLinePoints');
  const survivalNum = Number(survivalRaw);
  const survivalValid = survivalRaw !== '' && Number.isInteger(survivalNum) && survivalNum >= 0;
  if (survivalValid) filledCount++;
  else allValid = false;
  setFieldValid('survivalLinePoints', survivalValid, 'Enter a whole number of points.');

  const percent = Math.round((filledCount / totalCount) * 100);
  progressBar.style.width = `${percent}%`;
  completionValue.textContent = `${percent}%`;

  submitBtn.disabled = !allValid;
  submitHint.textContent = allValid
    ? 'All set — ready to submit.'
    : `${totalCount - filledCount} field${totalCount - filledCount === 1 ? '' : 's'} left to complete.`;

  return allValid;
}

form.addEventListener('input', () => {
  computeValidity();
});
form.addEventListener('change', (e) => {
  computeValidity();
  if (e.target.tagName === 'SELECT') evaluateWarnings();
});

computeValidity();
evaluateWarnings();

/* ==========================================================================
   Submission
   ========================================================================== */
function buildPayload() {
  return {
    timestamp: new Date().toISOString(),
    season: SEASON,
    predictorName: val('predictorName'),
    leagueTable: getLeagueOrder(),
    topGoalscorer: val('topGoalscorer'),
    mostAssists: val('mostAssists'),
    mostYellowCards: val('mostYellowCards'),
    mostRedCards: val('mostRedCards'),
    mostCleanSheets: val('mostCleanSheets'),
    playerOfTheYear: val('playerOfTheYear'),
    managerOfTheYear: val('managerOfTheYear'),
    firstManagerSacked: val('firstManagerSacked'),
    christmasDayTop: val('christmasDayTop'),
    boxingDayBottom: val('boxingDayBottom'),
    bestGoalDifference: val('bestGoalDifference'),
    firstTo20Points: val('firstTo20Points'),
    mostPenaltiesAwarded: val('mostPenaltiesAwarded'),
    lastUndefeatedTeam: val('lastUndefeatedTeam'),
    survivalLinePoints: Number(val('survivalLinePoints')),
    highestScoringPromotedTeam: val('highestScoringPromotedTeam'),
    website: val('website'), // honeypot — should always be blank
  };
}

function setSubmitting(isSubmitting) {
  submitBtn.disabled = isSubmitting;
  submitBtn.querySelector('.btn__label').hidden = isSubmitting;
  submitBtn.querySelector('.btn__spinner').hidden = !isSubmitting;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!computeValidity()) {
    VALIDATED_IDS.forEach((id) => touchedFields.add(id));
    computeValidity();
    showToast('Please complete all required fields before submitting.', 'error');
    return;
  }

  const payload = buildPayload();

  // Honeypot tripped — silently no-op rather than tipping off a bot.
  if (payload.website) return;

  if (!CONFIG.SCRIPT_URL) {
    showToast('This form isn’t connected to a Google Sheet yet — set CONFIG.SCRIPT_URL in app.js.', 'error');
    return;
  }

  setSubmitting(true);

  try {
    const response = await fetch(CONFIG.SCRIPT_URL, {
      method: 'POST',
      // text/plain avoids a CORS preflight request, which Apps Script
      // web apps don't handle. The Apps Script side still parses this
      // as JSON — see google-apps-script/Code.gs.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.result !== 'success') {
      throw new Error((data && data.message) || 'Unknown error from the sheet.');
    }

    showSuccessScreen(payload);
  } catch (err) {
    console.error(err);
    showToast(`Couldn’t submit your predictions: ${err.message}`, 'error');
  } finally {
    setSubmitting(false);
  }
});

/* ==========================================================================
   Success screen
   ========================================================================== */
function showSuccessScreen(payload) {
  form.hidden = true;
  document.querySelector('.hero').hidden = true;
  successScreen.hidden = false;
  document.getElementById('success-name').textContent = payload.predictorName || 'mate';
  document.getElementById('success-champion').textContent = payload.leagueTable[0] || '—';
  launchConfetti();
  successScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function launchConfetti() {
  const container = document.getElementById('confetti');
  container.innerHTML = '';
  const colors = ['#E90052', '#04F5FF', '#3D195B', '#f4f6fb', '#f59e0b'];
  for (let i = 0; i < 48; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 3500);
}

document.getElementById('btn-reset').addEventListener('click', () => {
  form.reset();
  touchedFields.clear();
  renderLeagueList([...TEAMS]);
  activeWarnings.clear();
  renderWarningsPanel();
  computeValidity();
  form.hidden = false;
  document.querySelector('.hero').hidden = false;
  successScreen.hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
