// Daily challenge — seeded PRNG, date key, attempt enforcement, history, and calendar.
// Requires: nothing (standalone module).

const DAILY_HS_KEY        = 'mineCtris_dailyBest';
const DAILY_ATTEMPTED_KEY = 'mineCtris_dailyAttempted'; // value: "YYYY-MM-DD" of last attempt
const DAILY_HISTORY_KEY   = 'mineCtris_dailyHistory';   // JSON array of past results

/**
 * Simple 32-bit seeded PRNG (mulberry32).
 * Returns a function that yields uniformly distributed floats in [0, 1).
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns today's date as "YYYY-MM-DD" in UTC. */
function getDailyDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Derive a 32-bit unsigned seed from a date string. */
function _hashDate(str) {
  let h = 0x12345678;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h = ((h << 13) | (h >>> 19)) ^ h;
  }
  return h >>> 0;
}

/** Returns a fresh seeded PRNG function for today's daily challenge. */
function getDailyPrng() {
  return mulberry32(_hashDate(getDailyDateString()));
}

/** Format "YYYY-MM-DD" → "Mar 15" */
function formatDailyLabel(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = dateStr.split('-');
  const month = months[parseInt(parts[1], 10) - 1];
  const day   = parseInt(parts[2], 10);
  return month + ' ' + day;
}

/** Today's short label for HUD display, e.g. "Mar 15". */
function getTodayLabel() {
  return formatDailyLabel(getDailyDateString());
}

// ── One-attempt-per-day enforcement ──────────────────────────────────────────

/** Returns true if the player has already attempted today's daily challenge. */
function hasDailyAttemptedToday() {
  try {
    return localStorage.getItem(DAILY_ATTEMPTED_KEY) === getDailyDateString();
  } catch (_) { return false; }
}

/** Record that the player has used their daily attempt for today. */
function markDailyAttempted() {
  try { localStorage.setItem(DAILY_ATTEMPTED_KEY, getDailyDateString()); } catch (_) {}
}

// ── Daily best score storage ──────────────────────────────────────────────────

/** Load today's daily best entry from localStorage. Returns null if none. */
function loadDailyBest() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_HS_KEY) || 'null');
    if (!data || data.date !== getDailyDateString()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Submit today's daily score. Saves only if higher than existing best for today.
 * Returns true if this run is a new daily best.
 */
function submitDailyScore(score, timeSurvived, blocksMined, linesCleared) {
  const today = getDailyDateString();
  let best = null;
  try {
    best = JSON.parse(localStorage.getItem(DAILY_HS_KEY) || 'null');
  } catch (_) {}
  if (!best || best.date !== today || score > best.score) {
    try {
      localStorage.setItem(DAILY_HS_KEY, JSON.stringify({
        date: today,
        score,
        timeSurvived,
        blocksMined,
        linesCleared,
      }));
    } catch (_) {}
    return true;
  }
  return false;
}

// ── Daily history (calendar view data) ───────────────────────────────────────

/**
 * Load all past daily results. Returns array of
 * { date, score, linesCleared, rank, total } sorted newest-first.
 */
function loadDailyHistory() {
  try {
    return JSON.parse(localStorage.getItem(DAILY_HISTORY_KEY) || '[]');
  } catch (_) { return []; }
}

/**
 * Save a completed daily run to history.
 * Only saves the best score per date.
 */
function saveToDailyHistory(date, score, linesCleared, rank, total) {
  let history = loadDailyHistory();
  const existing = history.find(function(e) { return e.date === date; });
  if (existing) {
    if (score > existing.score) {
      existing.score = score;
      existing.linesCleared = linesCleared;
      if (rank) existing.rank = rank;
      if (total) existing.total = total;
    }
  } else {
    history.unshift({ date: date, score: score, linesCleared: linesCleared, rank: rank || null, total: total || null });
    // Keep only last 90 days of history
    if (history.length > 90) history = history.slice(0, 90);
  }
  try { localStorage.setItem(DAILY_HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
}

// ── Game-over rendering ───────────────────────────────────────────────────────

/** Render the daily best section on the game-over screen. */
function renderDailyBestGameOver(isNewBest) {
  const el = document.getElementById('daily-go-section');
  if (!el) return;
  const best = loadDailyBest();
  if (!best) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const scoreCls = isNewBest ? 'daily-best-score daily-best-new' : 'daily-best-score';
  el.innerHTML =
    `<div id="daily-go-label">DAILY BEST \u2014 ${formatDailyLabel(best.date)}</div>` +
    `<div class="${scoreCls}">${best.score}</div>` +
    `<div id="daily-go-rank-row"></div>`;
}

/**
 * Update the rank/percentile row in the game-over daily section.
 * Called after leaderboard submission returns a result.
 */
function updateDailyRankDisplay(rank, total) {
  const el = document.getElementById('daily-go-rank-row');
  if (!el) return;
  if (!rank || !total) { el.textContent = ''; return; }
  const pct = Math.round(((total - rank) / total) * 100);
  el.innerHTML =
    `<span class="daily-go-rank">RANK #${rank}</span>` +
    `<span class="daily-go-sep"> &mdash; </span>` +
    `<span class="daily-go-pct">TOP ${pct}%</span>` +
    `<span class="daily-go-total"> of ${total}</span>`;
}

// ── Calendar modal ────────────────────────────────────────────────────────────

/** Open the daily calendar modal showing past results. */
function openDailyCalendar() {
  const modal = document.getElementById('daily-calendar-modal');
  if (!modal) return;
  _renderDailyCalendarContent();
  modal.style.display = 'flex';
}

/** Close the daily calendar modal. */
function closeDailyCalendar() {
  const modal = document.getElementById('daily-calendar-modal');
  if (modal) modal.style.display = 'none';
}

function _renderDailyCalendarContent() {
  const container = document.getElementById('daily-calendar-grid');
  if (!container) return;

  const history = loadDailyHistory();
  const historyByDate = {};
  history.forEach(function(e) { historyByDate[e.date] = e; });

  // Show a rolling 30-day grid (most recent first)
  const today = getDailyDateString();
  const cells = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const entry = historyByDate[dateStr];
    cells.push({ dateStr: dateStr, label: formatDailyLabel(dateStr), entry: entry });
  }

  container.innerHTML = cells.map(function(cell) {
    if (cell.entry) {
      const rankStr = cell.entry.rank
        ? `<div class="dcal-rank">#${cell.entry.rank}${cell.entry.total ? ' / ' + cell.entry.total : ''}</div>`
        : '';
      return `<div class="dcal-cell dcal-played" title="${cell.dateStr}">` +
        `<div class="dcal-date">${cell.label}</div>` +
        `<div class="dcal-score">${cell.entry.score}</div>` +
        rankStr +
        `</div>`;
    } else if (cell.dateStr === today) {
      const attempted = hasDailyAttemptedToday();
      const cls = attempted ? 'dcal-today dcal-attempted' : 'dcal-today';
      return `<div class="dcal-cell ${cls}" title="Today">` +
        `<div class="dcal-date">${cell.label}</div>` +
        `<div class="dcal-today-label">${attempted ? 'DONE' : 'TODAY'}</div>` +
        `</div>`;
    } else {
      return `<div class="dcal-cell dcal-missed" title="${cell.dateStr}">` +
        `<div class="dcal-date">${cell.label}</div>` +
        `<div class="dcal-missed-dash">&mdash;</div>` +
        `</div>`;
    }
  }).join('');
}
