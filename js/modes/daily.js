// Daily challenge — seeded PRNG, date key, attempt enforcement, history, calendar, streak, and share.
// Requires: nothing (standalone module).

const DAILY_HS_KEY        = 'mineCtris_dailyBest';
const DAILY_ATTEMPTED_KEY = 'mineCtris_dailyAttempted'; // value: "YYYY-MM-DD" of last attempt
const DAILY_HISTORY_KEY   = 'mineCtris_dailyHistory';   // JSON array of past results
const DAILY_STREAK_KEY    = 'mineCtris_dailyStreak';    // JSON: { streak, lastDate }

// Epoch day 1 = 2024-01-01
const DAILY_EPOCH = new Date('2024-01-01T00:00:00Z');

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

/** Format "YYYY-MM-DD" → locale-appropriate short date (e.g. "Mar 15", "15 mars", "3月15日"). */
function formatDailyLabel(dateStr) {
  // Use i18n locale-aware formatting when available.
  if (typeof fmtLocalDate === 'function') return fmtLocalDate(dateStr);
  // Fallback: original English format.
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = dateStr.split('-');
  const month = months[parseInt(parts[1], 10) - 1];
  const day   = parseInt(parts[2], 10);
  return month + ' ' + day;
}

/** Today's short label for HUD display. */
function getTodayLabel() {
  return formatDailyLabel(getDailyDateString());
}

// ── Challenge number ─────────────────────────────────────────────────────────

/** Returns today's daily challenge number (day 1 = 2024-01-01). */
function getDailyNumber() {
  const today = new Date(getDailyDateString() + 'T00:00:00Z');
  return Math.floor((today - DAILY_EPOCH) / 86400000) + 1;
}

// ── Star rating ──────────────────────────────────────────────────────────────

/** Returns star count for a score: 1=bronze(<5000), 2=silver(<10000), 3=gold(>=10000). */
function getDailyStarCount(score) {
  if (score >= 10000) return 3;
  if (score >= 5000)  return 2;
  if (score > 0)      return 1;
  return 0;
}

/** Returns a star emoji string for display (e.g. "⭐⭐⭐"). */
function getDailyStarString(score) {
  return '\u2B50'.repeat(getDailyStarCount(score));
}

// ── Streak tracking ──────────────────────────────────────────────────────────

/** Returns yesterday's date as "YYYY-MM-DD" in UTC. */
function _getYesterdayString() {
  const d = new Date(getDailyDateString() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Load the current daily challenge streak. Returns 0 if streak is broken. */
function getDailyStreak() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_STREAK_KEY) || 'null');
    if (!data) return 0;
    const today = getDailyDateString();
    const yesterday = _getYesterdayString();
    if (data.lastDate === today || data.lastDate === yesterday) return data.streak || 0;
    return 0; // streak is broken
  } catch (_) { return 0; }
}

/**
 * Record that today's daily challenge was completed.
 * Increments the streak if yesterday was completed, otherwise resets to 1.
 */
function recordDailyStreakCompletion() {
  const today = getDailyDateString();
  try {
    let data = JSON.parse(localStorage.getItem(DAILY_STREAK_KEY) || 'null') || { streak: 0, lastDate: null };
    if (data.lastDate === today) return; // already counted today
    if (data.lastDate === _getYesterdayString()) {
      data.streak = (data.streak || 0) + 1;
    } else {
      data.streak = 1;
    }
    data.lastDate = today;
    localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(data));
  } catch (_) {}
}

// ── Share result ─────────────────────────────────────────────────────────────

/**
 * Build the shareable daily result string.
 * Format: "MineCtris Daily #142 — 8,450 pts ⭐⭐⭐"
 */
function buildDailyShareText(score) {
  const num = getDailyNumber();
  const stars = getDailyStarString(score);
  const pts = score.toLocaleString();
  return 'MineCtris Daily #' + num + ' \u2014 ' + pts + ' pts' + (stars ? ' ' + stars : '');
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

  // Record streak completion now that the run is saved
  recordDailyStreakCompletion();
  const streak = getDailyStreak();
  const stars = getDailyStarString(best.score);

  el.style.display = 'block';
  const scoreCls = isNewBest ? 'daily-best-score daily-best-new' : 'daily-best-score';
  const streakHtml = streak >= 2
    ? `<div id="daily-go-streak">\uD83D\uDD25 ${streak}-day streak!</div>`
    : '';
  const starsHtml = stars
    ? `<div id="daily-go-stars">${stars}</div>`
    : '';
  el.innerHTML =
    `<div id="daily-go-label">DAILY #${getDailyNumber()} \u2014 ${formatDailyLabel(best.date)}</div>` +
    `<div class="${scoreCls}">${best.score}</div>` +
    starsHtml +
    streakHtml +
    `<div id="daily-go-rank-row"></div>` +
    `<button id="daily-go-share-btn">Copy Result</button>` +
    `<div id="daily-go-share-feedback"></div>` +
    `<div id="daily-go-score-card-wrap" style="display:none;margin-top:8px;display:flex;flex-direction:column;align-items:center;gap:6px;">` +
    `<canvas id="daily-go-score-card-canvas"></canvas>` +
    `<button id="daily-go-score-card-download" style="font-family:'Press Start 2P',cursive;font-size:9px;color:#0cf;background:transparent;border:1px solid rgba(0,204,255,0.4);padding:6px 14px;cursor:pointer;border-radius:4px;">&#11015; Save Card</button>` +
    `</div>`;

  // Wire up share button
  const shareBtn = el.querySelector('#daily-go-share-btn');
  const shareFeedback = el.querySelector('#daily-go-share-feedback');
  if (shareBtn) {
    shareBtn.onclick = function () {
      const baseText = buildDailyShareText(best.score);
      const baseUrl = location.href.split('?')[0].split('#')[0];
      const text = baseText + '\n' + baseUrl;
      function showCopied() {
        if (shareFeedback) {
          shareFeedback.textContent = 'Copied!';
          shareFeedback.style.opacity = '1';
          clearTimeout(shareFeedback._ft);
          shareFeedback._ft = setTimeout(function () { shareFeedback.style.opacity = '0'; }, 1500);
        }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(showCopied).catch(function () {
          _showDailyShareFallback(text, shareBtn);
        });
      } else {
        _showDailyShareFallback(text, shareBtn);
      }
    };
  }

  // Generate daily score card
  if (typeof ScoreCard !== 'undefined') {
    const _dcCanvas = el.querySelector('#daily-go-score-card-canvas');
    const _dcWrap   = el.querySelector('#daily-go-score-card-wrap');
    const _dcDl     = el.querySelector('#daily-go-score-card-download');
    if (_dcCanvas && _dcWrap) {
      const _scDate   = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const _scPlayer = typeof loadDisplayName === 'function' ? (loadDisplayName() || '') : '';
      const _scTheme  = (typeof activeTheme !== 'undefined' && activeTheme) ? activeTheme : 'classic';
      const _renderDailyCard = function () {
        ScoreCard.render(_dcCanvas, {
          score:        best.score,
          linesCleared: best.linesCleared || 0,
          blocksMined:  0,
          timeStr:      (function() { var t = Math.floor(best.timeSurvived || 0); return String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0'); }()),
          mode:         'Daily Challenge',
          theme:        _scTheme,
          rank:         null,
          date:         _scDate,
          playerName:   _scPlayer,
          dailyNumber:  getDailyNumber(),
        });
        _dcWrap.style.display = 'flex';
      };
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(_renderDailyCard);
      } else {
        _renderDailyCard();
      }
      if (_dcDl) {
        _dcDl.onclick = function () {
          ScoreCard.downloadPNG(_dcCanvas, 'minetris-daily-' + getDailyNumber() + '-' + best.score + '.png');
        };
      }
    }
  }
}

/** Fallback: insert a pre-selected text input so user can manually copy. */
function _showDailyShareFallback(text, anchorEl) {
  const existing = document.getElementById('daily-share-fallback');
  if (existing) existing.remove();
  const wrap = document.createElement('div');
  wrap.id = 'daily-share-fallback';
  wrap.style.cssText = 'display:flex;gap:4px;margin-top:4px;';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = text;
  inp.readOnly = true;
  inp.style.cssText = 'flex:1;font-size:0.6rem;padding:2px 4px;';
  inp.onclick = function () { inp.select(); };
  wrap.appendChild(inp);
  if (anchorEl && anchorEl.parentNode) {
    anchorEl.parentNode.insertBefore(wrap, anchorEl.nextSibling);
  }
  inp.select();
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

  // Show streak in calendar title
  const titleEl = document.getElementById('daily-calendar-title');
  if (titleEl) {
    const streak = getDailyStreak();
    titleEl.innerHTML = '\u{1F4C5} DAILY HISTORY' +
      (streak >= 2 ? `<span class="dcal-streak-badge">\uD83D\uDD25 ${streak} days</span>` : '');
  }

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
      const stars = getDailyStarString(cell.entry.score);
      const starClass = cell.entry.score >= 10000 ? 'dcal-gold'
        : cell.entry.score >= 5000 ? 'dcal-silver'
        : 'dcal-bronze';
      return `<div class="dcal-cell dcal-played ${starClass}" title="${cell.dateStr}">` +
        `<div class="dcal-date">${cell.label}</div>` +
        `<div class="dcal-score">${cell.entry.score}</div>` +
        `<div class="dcal-stars">${stars}</div>` +
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
