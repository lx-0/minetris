// Infinite Depths — Weekly Seeded Run + Leaderboard
// Requires: weekly.js (getWeeklyDateString, formatWeeklyLabel, mulberry32, _hashDate),
//           leaderboard.js (LEADERBOARD_WORKER_URL, loadDisplayName, openDisplayNameModal),
//           highscores.js (fmtTime), dungeon-modifier.js (dungeonDescentLevel)

// ── Global mode flag ──────────────────────────────────────────────────────────

/** True when the current dungeon session is a weekly-seeded Infinite Depths run. */
var isInfiniteWeekly = false;

// ── Storage keys ──────────────────────────────────────────────────────────────

const _IW_ATTEMPT_PREFIX   = 'mineCtris_infiniteWeekly_';
const _IW_LB_SUBMITTED_KEY = 'mineCtris_infiniteWeeklyLbSubmitted';

// ── Week key helpers ──────────────────────────────────────────────────────────

/**
 * Returns the storage key suffix for the current ISO week: "YYYY_WW".
 * Derived from getWeeklyDateString() which returns "YYYY-Www".
 */
function getInfiniteWeeklyKey() {
  return getWeeklyDateString().replace('-W', '_');
}

/**
 * Returns the storage key suffix for an arbitrary week offset.
 * @param {number} weeksAgo  0 = current week, 1 = last week, etc.
 */
function _iwKeyForWeeksAgo(weeksAgo) {
  if (weeksAgo === 0) return getInfiniteWeeklyKey();
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - weeksAgo * 7));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '_' + String(week).padStart(2, '0');
}

/**
 * Convert a storage-key "YYYY_WW" back to ISO "YYYY-Www" for display helpers.
 */
function _iwKeyToIso(key) {
  // "2026_14" → "2026-W14"
  var parts = key.split('_');
  return parts[0] + '-W' + parts[1];
}

// ── PRNG ──────────────────────────────────────────────────────────────────────

/** Deterministic PRNG seeded from the current ISO week key. */
function getInfiniteWeeklyPrng() {
  return mulberry32(_hashDate(getWeeklyDateString()));
}

/** Numeric seed used for display (truncated to 6 digits). */
function getInfiniteWeeklySeed() {
  return _hashDate(getWeeklyDateString()) % 1000000;
}

// ── Attempt storage ───────────────────────────────────────────────────────────

/** True if the player has already used their one weekly attempt this week. */
function hasAttemptedInfiniteWeeklyThisWeek() {
  try {
    return localStorage.getItem(_IW_ATTEMPT_PREFIX + getInfiniteWeeklyKey()) !== null;
  } catch (_) { return false; }
}

/**
 * Save the result of a completed weekly run to localStorage.
 * @param {number} floor  Deepest floor reached (dungeonDescentLevel).
 * @param {number} score
 * @param {number} timeSeconds  Elapsed game time in seconds.
 */
function saveInfiniteWeeklyAttempt(floor, score, timeSeconds) {
  try {
    localStorage.setItem(
      _IW_ATTEMPT_PREFIX + getInfiniteWeeklyKey(),
      JSON.stringify({ floor, score, time: Math.floor(timeSeconds), week: getInfiniteWeeklyKey() })
    );
  } catch (_) {}
}

/**
 * Load a saved weekly attempt.
 * @param {string} [weekKey]  Defaults to current week.
 */
function loadInfiniteWeeklyAttempt(weekKey) {
  var key = weekKey || getInfiniteWeeklyKey();
  try {
    return JSON.parse(localStorage.getItem(_IW_ATTEMPT_PREFIX + key));
  } catch (_) { return null; }
}

// ── Leaderboard submission tracking ──────────────────────────────────────────

function hasSubmittedInfiniteWeeklyThisWeek() {
  try {
    return localStorage.getItem(_IW_LB_SUBMITTED_KEY) === getInfiniteWeeklyKey();
  } catch (_) { return false; }
}

function markSubmittedInfiniteWeeklyThisWeek() {
  try { localStorage.setItem(_IW_LB_SUBMITTED_KEY, getInfiniteWeeklyKey()); } catch (_) {}
}

// ── Worker API ────────────────────────────────────────────────────────────────

async function apiSubmitInfiniteWeeklyScore(displayName, floor, score, timeSeconds) {
  const week = getWeeklyDateString(); // "YYYY-Www"
  const seed = _hashDate(getWeeklyDateString());
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/infinite-weekly/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName, floor, score,
      time: Math.floor(timeSeconds),
      week, seed,
      clientTimestamp: Date.now(),
    }),
  });
  return resp.json();
}

async function apiFetchInfiniteWeeklyLeaderboard(weekStr) {
  var param = weekStr ? '?week=' + encodeURIComponent(weekStr) : '';
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/infinite-weekly/leaderboard' + param);
  return resp.json();
}

// ── Game-over rendering ───────────────────────────────────────────────────────

/**
 * Render the infinite weekly section in the game-over screen.
 * @param {number} floor        Deepest floor reached.
 * @param {number} score
 * @param {number} timeSeconds
 */
function renderInfiniteWeeklyGameOver(floor, score, timeSeconds) {
  var el = document.getElementById('infinite-weekly-go-section');
  if (!el) return;
  el.style.display = 'block';

  var weekLabel = formatWeeklyLabel(getWeeklyDateString());
  var seedDisp  = getInfiniteWeeklySeed();
  var timeDisp  = typeof fmtTime === 'function' ? fmtTime(Math.floor(timeSeconds)) : '--:--';

  el.innerHTML =
    '<div class="iw-go-label">WEEKLY DEPTHS \u2014 ' + weekLabel + '</div>' +
    '<div class="iw-go-meta">Seed&nbsp;#' + seedDisp + '</div>' +
    '<div class="iw-go-stats">' +
      '<div><span class="go-label">FLOOR REACHED</span><br>' + floor + '</div>' +
      '<div><span class="go-label">SCORE</span><br>' + score + '</div>' +
      '<div><span class="go-label">TIME</span><br>' + timeDisp + '</div>' +
    '</div>' +
    '<div id="iw-submit-row">' +
      '<button id="iw-submit-btn" class="iw-lb-btn">Submit to Weekly Board</button>' +
      '<div id="iw-submit-feedback" class="lb-submit-feedback"></div>' +
    '</div>' +
    '<div id="iw-leaderboard-container"></div>' +
    '<div id="iw-history-section"></div>';

  _initIwSubmitBtn(floor, score, timeSeconds);
  _loadAndRenderIwLeaderboard(getWeeklyDateString());
  _renderIwHistory();
}

function _initIwSubmitBtn(floor, score, timeSeconds) {
  var btn      = document.getElementById('iw-submit-btn');
  var feedback = document.getElementById('iw-submit-feedback');
  if (!btn) return;

  if (hasSubmittedInfiniteWeeklyThisWeek()) {
    btn.textContent = 'Already Submitted';
    btn.disabled    = true;
    if (feedback) feedback.textContent = '';
    return;
  }

  btn.onclick = function () {
    var name = typeof loadDisplayName === 'function' ? loadDisplayName() : null;
    if (!name) {
      openDisplayNameModal(function (confirmedName) {
        _doIwSubmit(confirmedName, floor, score, timeSeconds, btn, feedback);
      });
    } else {
      _doIwSubmit(name, floor, score, timeSeconds, btn, feedback);
    }
  };
}

async function _doIwSubmit(name, floor, score, timeSeconds, btn, feedback) {
  btn.disabled    = true;
  btn.textContent = 'Submitting\u2026';
  if (feedback) feedback.textContent = '';

  try {
    var result = await apiSubmitInfiniteWeeklyScore(name, floor, score, timeSeconds);
    if (result.ok) {
      markSubmittedInfiniteWeeklyThisWeek();
      btn.textContent = 'Submitted!';
      if (feedback) {
        feedback.textContent = 'Rank #' + result.rank + ' of ' + result.total;
        feedback.className   = 'lb-submit-feedback lb-submit-ok';
      }
      _loadAndRenderIwLeaderboard(getWeeklyDateString());
    } else {
      var msg = result.error || 'Submission failed';
      btn.disabled    = false;
      btn.textContent = 'Submit to Weekly Board';
      if (feedback) {
        feedback.textContent = msg;
        feedback.className   = 'lb-submit-feedback lb-submit-err';
      }
    }
  } catch (_) {
    btn.disabled    = false;
    btn.textContent = 'Submit to Weekly Board';
    if (feedback) {
      feedback.textContent = 'Network error \u2014 try again';
      feedback.className   = 'lb-submit-feedback lb-submit-err';
    }
  }
}

async function _loadAndRenderIwLeaderboard(isoWeekStr) {
  var container = document.getElementById('iw-leaderboard-container');
  if (!container) return;
  container.innerHTML = '<div class="lb-loading">Loading leaderboard\u2026</div>';
  try {
    var data = await apiFetchInfiniteWeeklyLeaderboard(isoWeekStr);
    if (!data.entries || data.entries.length === 0) {
      container.innerHTML = '<div class="iw-lb-empty">No entries yet \u2014 be the first!</div>';
      return;
    }
    var rows = data.entries.map(function (e) {
      var t = typeof e.time === 'number' ? (typeof fmtTime === 'function' ? fmtTime(e.time) : e.time + 's') : '\u2014';
      return '<tr><td>' + e.rank + '</td><td class="iw-lb-name">' +
        _iwEsc(e.displayName) + '</td><td>' + e.floor + '</td><td>' + e.score + '</td><td>' + t + '</td></tr>';
    }).join('');
    container.innerHTML =
      '<div class="iw-lb-title">Top Scores \u2014 ' + formatWeeklyLabel(isoWeekStr) + '</div>' +
      '<table class="iw-lb-table"><thead><tr>' +
        '<th>#</th><th>Player</th><th>Floor</th><th>Score</th><th>Time</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  } catch (_) {
    container.innerHTML = '<div class="lb-error">Failed to load leaderboard.</div>';
  }
}

/** Render personal history for past 4 weeks. */
function _renderIwHistory() {
  var el = document.getElementById('iw-history-section');
  if (!el) return;

  var rows = '';
  for (var i = 1; i < 4; i++) {
    var wk      = _iwKeyForWeeksAgo(i);
    var attempt = loadInfiniteWeeklyAttempt(wk);
    var label   = formatWeeklyLabel(_iwKeyToIso(wk));
    if (attempt) {
      var t = typeof attempt.time === 'number' && typeof fmtTime === 'function'
        ? fmtTime(attempt.time) : '\u2014';
      rows += '<tr><td>' + label + '</td><td>' + attempt.floor + '</td><td>' + attempt.score + '</td><td>' + t + '</td></tr>';
    } else {
      rows += '<tr><td>' + label + '</td><td colspan="3" class="iw-hist-none">Not attempted</td></tr>';
    }
  }

  if (!rows) return;
  el.innerHTML =
    '<div class="iw-lb-title">Your Past Results</div>' +
    '<table class="iw-lb-table"><thead><tr>' +
      '<th>Week</th><th>Floor</th><th>Score</th><th>Time</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function _iwEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Mode-select UI helpers ────────────────────────────────────────────────────

/**
 * Refresh the "Weekly Depths" button state in the depths variant overlay.
 * Shows personal best or "Attempted" if already played this week.
 */
function refreshInfiniteWeeklyVariantBtn() {
  var btn = document.getElementById('depths-variant-weekly-infinite');
  if (!btn) return;

  var seedLine = document.getElementById('dvb-iw-seed');
  var pbLine   = document.getElementById('dvb-iw-pb');

  if (seedLine) seedLine.textContent = 'Seed\u00a0#' + getInfiniteWeeklySeed();

  var attempt = loadInfiniteWeeklyAttempt();
  if (attempt) {
    btn.classList.add('iw-attempted');
    if (pbLine) pbLine.textContent = 'Floor\u00a0' + attempt.floor + '\u00a0\u2022\u00a0' + attempt.score + '\u00a0pts';
  } else {
    btn.classList.remove('iw-attempted');
    if (pbLine) pbLine.textContent = getCurrentWeekLabel() + '\u00a0\u2014\u00a0Not\u00a0attempted';
  }
}
