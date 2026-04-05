// Lifetime player statistics — localStorage persistence and Stats panel.
// Requires: nothing (standalone module).

const STATS_KEY = 'mineCtris_stats';

// Maps comboCount index → multiplier (matches lineclear.js)
const _STATS_COMBO_MULTS = [1.0, 1.0, 1.5, 2.0, 3.0];

function _defaultStats() {
  return {
    gamesPlayed: 0,
    totalScore: 0,
    bestScore: 0,
    totalLinesCleared: 0,
    totalBlocksMined: 0,
    totalBlocksPlaced: 0,
    totalCrafts: 0,
    highestComboMultiplier: 1.0,
    highestLevel: 1,
    dailyChallengesCompleted: 0,
    puzzlesCompleted: 0,
    playerXP: 0,
    lastPlayedDate: null,
    currentStreak: 0,
    timePlayed: 0,
    totalTSpins: 0,
    totalPerfectClears: 0,
    mostLinesOneGame: 0,
    perMode: {},
    unlockedMilestones: [],
  };
}

/** Load lifetime stats from localStorage. Returns defaults on any error. */
function loadLifetimeStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? Object.assign(_defaultStats(), JSON.parse(raw)) : _defaultStats();
  } catch (_) {
    return _defaultStats();
  }
}

/** Persist lifetime stats to localStorage. Silently ignores quota/security errors. */
function saveLifetimeStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (_) {}
}

/**
 * Record a completed game into lifetime stats.
 * @param {object} params
 * @param {number} params.score
 * @param {number} params.blocksMined
 * @param {number} params.linesCleared
 * @param {number} params.blocksPlaced
 * @param {number} params.totalCrafts
 * @param {number} params.highestComboCount  raw comboCount peak, not multiplier
 * @param {number} params.highestDifficultyTier  lastDifficultyTier at game end
 * @param {boolean} params.isDailyChallenge
 * @param {number} [params.tSpins]
 * @param {number} [params.perfectClears]
 * @param {number} [params.durationSecs]
 * @param {string} [params.mode]
 * @returns {object} updated stats
 */
function submitLifetimeStats({ score, blocksMined, linesCleared, blocksPlaced, totalCrafts, highestComboCount, highestDifficultyTier, isDailyChallenge, isPuzzleMode, tSpins, perfectClears, durationSecs, mode }) {
  const stats = loadLifetimeStats();
  stats.gamesPlayed++;
  stats.totalScore += score;
  if (score > stats.bestScore) stats.bestScore = score;
  stats.totalLinesCleared += linesCleared;
  stats.totalBlocksMined += blocksMined;
  stats.totalBlocksPlaced += blocksPlaced;
  stats.totalCrafts += totalCrafts;
  const comboMult = _STATS_COMBO_MULTS[Math.min(highestComboCount, 4)];
  if (comboMult > stats.highestComboMultiplier) stats.highestComboMultiplier = comboMult;
  const level = highestDifficultyTier + 1;
  if (level > stats.highestLevel) stats.highestLevel = level;
  if (isDailyChallenge) stats.dailyChallengesCompleted++;
  if (isPuzzleMode) stats.puzzlesCompleted = (stats.puzzlesCompleted || 0) + 1;
  // New extended stats
  stats.timePlayed = (stats.timePlayed || 0) + Math.floor(durationSecs || 0);
  stats.totalTSpins = (stats.totalTSpins || 0) + (tSpins || 0);
  stats.totalPerfectClears = (stats.totalPerfectClears || 0) + (perfectClears || 0);
  if (linesCleared > (stats.mostLinesOneGame || 0)) stats.mostLinesOneGame = linesCleared;
  // Per-mode stats
  if (mode) {
    if (!stats.perMode) stats.perMode = {};
    const pm = stats.perMode[mode] || { games: 0, bestScore: 0, totalScore: 0 };
    pm.games++;
    pm.totalScore += score;
    if (score > pm.bestScore) pm.bestScore = score;
    stats.perMode[mode] = pm;
  }
  // Check milestones
  _checkMilestones(stats);
  saveLifetimeStats(stats);
  return stats;
}

// ── Session history ───────────────────────────────────────────────────────────

const SESSION_HISTORY_KEY = 'mineCtris_sessionHistory';
const SESSION_HISTORY_LIMIT = 500;

/**
 * Load session history array from localStorage (newest first).
 * Each entry: { date, mode, score, lines, durationSecs, result }
 */
function loadSessionHistory() {
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Log a completed play session.
 * @param {object} params
 * @param {string} params.mode          e.g. 'classic', 'blitz', 'sprint', 'battle', 'puzzle'
 * @param {number} params.score
 * @param {number} params.lines         lines cleared
 * @param {number} params.durationSecs
 * @param {string} [params.result]      'win' | 'loss' | 'complete' (optional)
 * @param {number} [params.maxCombo]    highest combo count
 * @param {number} [params.tSpins]      T-spins in session
 * @param {number} [params.tetrises]    4-line clears in session
 * @param {number} [params.piecesPlaced] pieces placed
 * @param {number} [params.apm]         actions per minute
 */
function logSession({ mode, score, lines, durationSecs, result, maxCombo, tSpins, tetrises, piecesPlaced, apm }) {
  try {
    const history = loadSessionHistory();
    history.unshift({
      date: new Date().toISOString().slice(0, 10),
      mode: mode || 'classic',
      score: score || 0,
      lines: lines || 0,
      durationSecs: Math.floor(durationSecs || 0),
      result: result || 'complete',
      maxCombo: maxCombo || 0,
      tSpins: tSpins || 0,
      tetrises: tetrises || 0,
      piecesPlaced: piecesPlaced || 0,
      apm: apm || 0,
    });
    // Keep only the most recent entries
    if (history.length > SESSION_HISTORY_LIMIT) history.length = SESSION_HISTORY_LIMIT;
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(history));
  } catch (_) {}
}

// ── Milestones ────────────────────────────────────────────────────────────────

const STATS_MILESTONES = [
  { id: 'games_10',       icon: '🎮', label: '10 Games',           check: s => (s.gamesPlayed || 0) >= 10 },
  { id: 'games_100',      icon: '🏅', label: '100 Games',          check: s => (s.gamesPlayed || 0) >= 100 },
  { id: 'games_500',      icon: '🏆', label: '500 Games',          check: s => (s.gamesPlayed || 0) >= 500 },
  { id: 'lines_100',      icon: '⛏️',  label: '100 Lines',          check: s => (s.totalLinesCleared || 0) >= 100 },
  { id: 'lines_1000',     icon: '💎', label: '1,000 Lines',        check: s => (s.totalLinesCleared || 0) >= 1000 },
  { id: 'lines_10000',    icon: '🌟', label: '10,000 Lines',       check: s => (s.totalLinesCleared || 0) >= 10000 },
  { id: 'score_10k',      icon: '💰', label: '10K Score',          check: s => (s.bestScore || 0) >= 10000 },
  { id: 'score_100k',     icon: '💸', label: '100K Score',         check: s => (s.bestScore || 0) >= 100000 },
  { id: 'score_1m',       icon: '👑', label: '1M Score',           check: s => (s.bestScore || 0) >= 1000000 },
  { id: 'tspin_10',       icon: '🌀', label: '10 T-Spins',         check: s => (s.totalTSpins || 0) >= 10 },
  { id: 'tspin_100',      icon: '🌪️',  label: '100 T-Spins',        check: s => (s.totalTSpins || 0) >= 100 },
  { id: 'perfect_1',      icon: '✨', label: 'First Perfect Clear', check: s => (s.totalPerfectClears || 0) >= 1 },
  { id: 'perfect_10',     icon: '🌠', label: '10 Perfect Clears',  check: s => (s.totalPerfectClears || 0) >= 10 },
  { id: 'time_1h',        icon: '⏱️',  label: '1 Hour Played',      check: s => (s.timePlayed || 0) >= 3600 },
  { id: 'time_10h',       icon: '⏰', label: '10 Hours Played',    check: s => (s.timePlayed || 0) >= 36000 },
  { id: 'streak_7',       icon: '🔥', label: '7-Day Streak',       check: s => (s.currentStreak || 0) >= 7 },
  { id: 'streak_30',      icon: '💫', label: '30-Day Streak',      check: s => (s.currentStreak || 0) >= 30 },
];

/**
 * Check milestones against current stats and mark newly unlocked ones.
 * Mutates stats.unlockedMilestones in-place; does NOT save to localStorage.
 */
function _checkMilestones(stats) {
  if (!stats.unlockedMilestones) stats.unlockedMilestones = [];
  STATS_MILESTONES.forEach(function (m) {
    if (!stats.unlockedMilestones.includes(m.id) && m.check(stats)) {
      stats.unlockedMilestones.push(m.id);
    }
  });
}

/** Export all stats and session history to a JSON file download. */
function _exportStatsJson() {
  try {
    var exportData = {
      exportedAt: new Date().toISOString(),
      lifetimeStats: loadLifetimeStats(),
      sessionHistory: loadSessionHistory(),
    };
    var json = JSON.stringify(exportData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'minectris-stats-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (_) {}
}

/** Reset all lifetime stats and session history after confirmation. */
function resetAllStats() {
  try { localStorage.removeItem(STATS_KEY); } catch (_) {}
  try { localStorage.removeItem(SESSION_HISTORY_KEY); } catch (_) {}
}

// ── XP multipliers per game mode
const XP_MODE_MULTIPLIERS = {
  classic: 1.0,
  sprint:  1.1,
  blitz:   1.2,
  daily:   1.3,
  weekly:  1.5,
  puzzle:  1.0,
};

/**
 * Calculate and award XP for a completed session. Updates playerXP,
 * lastPlayedDate, and currentStreak in lifetime stats.
 * @param {number} finalScore  the session score
 * @param {string} modeKey     one of: classic, sprint, blitz, daily, weekly, puzzle
 * @returns {{ xpEarned: number, streakBonus: boolean, currentStreak: number }}
 */
function awardXP(finalScore, modeKey) {
  const stats = loadLifetimeStats();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let isNewStreakDay = false;
  if (stats.lastPlayedDate !== today) {
    // First session of a new calendar day
    if (stats.lastPlayedDate === yesterdayStr) {
      // Consecutive day — extend the streak
      stats.currentStreak = (stats.currentStreak || 0) + 1;
    } else {
      // Missed a day (or first ever session) — reset streak
      stats.currentStreak = 1;
    }
    isNewStreakDay = true;
    stats.lastPlayedDate = today;
  }

  const streak = stats.currentStreak || 1;
  // Streak bonus (+10% XP) applies on every session once you have 2+ consecutive days
  const streakBonus = streak >= 2;

  const multiplier = XP_MODE_MULTIPLIERS[modeKey] || 1.0;
  const baseXP = Math.floor(finalScore / 50);
  let xpEarned = Math.floor(baseXP * multiplier);
  if (streakBonus) xpEarned = Math.floor(xpEarned * 1.1);
  // Prestige XP bonus (multiplicative)
  if (typeof getPrestigeXPBonus === 'function') {
    const prestigeBonus = getPrestigeXPBonus();
    if (prestigeBonus > 0) xpEarned = Math.floor(xpEarned * (1 + prestigeBonus));
  }

  // Guild XP boost perk (multiplicative)
  if (typeof getGuildXPBoost === 'function') {
    const guildBoost = getGuildXPBoost();
    if (guildBoost > 0) xpEarned = Math.floor(xpEarned * (1 + guildBoost));
  }

  // First-game completion bonus (one-time 100 XP)
  if (typeof _awardFirstGameBonus === 'function') {
    xpEarned += _awardFirstGameBonus();
  }

  stats.playerXP = (stats.playerXP || 0) + xpEarned;
  saveLifetimeStats(stats);

  // Award guild XP for game completion
  if (typeof awardGuildXP === 'function') {
    awardGuildXP('game_completion');
  }

  // Fire milestone toast on new streak days only (3, 7, 30)
  if (isNewStreakDay && (streak === 3 || streak === 7 || streak === 30)) {
    if (typeof showStreakMilestoneToast === 'function') {
      showStreakMilestoneToast(streak);
    }
  }

  return { xpEarned, streakBonus, currentStreak: streak };
}

// ── Dashboard helpers ─────────────────────────────────────────────────────────

/** Format seconds as Xh Ym or Ym Zs. */
function _fmtTimePlayed(totalSecs) {
  const s = Math.floor(totalSecs || 0);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h + 'h ' + m + 'm';
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m + 'm ' + sec + 's';
}

/** Build one stats-row HTML string. */
function _statsRow(label, val) {
  return '<div class="stats-row">' +
    '<span class="stats-label">' + _escStatsHtml(String(label)) + '</span>' +
    '<span class="stats-value">' + _escStatsHtml(String(val)) + '</span>' +
    '</div>';
}

/** Build a section header. */
function _statsSection(title) {
  return '<div class="stats-section-title">' + _escStatsHtml(title) + '</div>';
}

// ── Tab rendering ─────────────────────────────────────────────────────────────

function _renderTabOverview(stats) {
  var html = _statsSection('OVERVIEW');
  html += _statsRow('GAMES PLAYED',      stats.gamesPlayed);
  html += _statsRow('TIME PLAYED',       _fmtTimePlayed(stats.timePlayed));
  html += _statsRow('TOTAL SCORE',       stats.totalScore);
  html += _statsRow('BEST SCORE',        stats.bestScore);
  html += _statsRow('LINES CLEARED',     stats.totalLinesCleared);
  html += _statsRow('BLOCKS MINED',      stats.totalBlocksMined);
  html += _statsRow('TOTAL XP',          stats.playerXP || 0);
  html += _statsRow('PLAYER LEVEL',      typeof getLevelFromXP === 'function' ? getLevelFromXP(stats.playerXP || 0) : 1);
  html += _statsRow('CURRENT STREAK',    (stats.currentStreak || 0) + ' day' + ((stats.currentStreak || 0) === 1 ? '' : 's'));
  // Prestige
  if (typeof getPrestigeLevel === 'function') {
    var pLevel = getPrestigeLevel();
    if (pLevel > 0) {
      html += _statsSection('PRESTIGE');
      html += _statsRow('PRESTIGE', '\u2B50'.repeat(Math.min(pLevel, 10)) + ' (' + pLevel + ')');
      html += _statsRow('XP BONUS', '+' + Math.round(getPrestigeXPBonus() * 100) + '%');
    }
  }
  // Prestige button
  if (typeof canPrestige === 'function' && canPrestige()) {
    var nextReward = typeof getNextPrestigeReward === 'function' ? getNextPrestigeReward() : null;
    var rewardPreview = nextReward
      ? 'Next reward: +' + Math.round(nextReward.xpBonus * 100) + '% XP, ' + nextReward.cosmetic
      : 'Max prestige rewards reached!';
    html += '<div class="stats-prestige-section">' +
      '<button id="prestige-btn" class="prestige-btn" onclick="_openPrestigeConfirm()">' +
        '\u2B50 PRESTIGE \u2B50' +
      '</button>' +
      '<div class="prestige-reward-preview">' + _escStatsHtml(rewardPreview) + '</div>' +
      '</div>';
  }
  return html;
}

var _MODE_LABELS = {
  classic:  'Classic',
  blitz:    'Blitz',
  sprint:   'Sprint',
  daily:    'Daily',
  weekly:   'Weekly',
  puzzle:   'Puzzle',
  survival: 'Survival',
  endless:  'Endless',
  battle:   'Battle',
};
var _MODE_PIE_COLORS = {
  classic: '#00ff00', blitz: '#ff8800', sprint: '#00ccff', daily: '#ffff00',
  weekly: '#ff00ff', puzzle: '#88ff00', survival: '#ff4444', endless: '#ff6688', battle: '#ff6666',
};

function _renderTabModes(stats) {
  var pm = stats.perMode || {};
  var html = _statsSection('TIME SPENT PER MODE');
  html += '<canvas id="stats-pie-canvas" width="260" height="120" style="width:100%;max-width:260px;display:block;margin:4px auto 8px;"></canvas>';
  html += _statsSection('PER-MODE BREAKDOWN');
  var modes = Object.keys(pm);
  if (modes.length === 0) {
    html += '<div class="stats-empty">No games recorded yet.</div>';
    return html;
  }
  modes.forEach(function (modeKey) {
    var d = pm[modeKey];
    var label = _MODE_LABELS[modeKey] || modeKey.toUpperCase();
    var avg = d.games > 0 ? Math.round(d.totalScore / d.games) : 0;
    html += _statsSection(label.toUpperCase());
    html += _statsRow('GAMES',      d.games);
    html += _statsRow('BEST SCORE', d.bestScore);
    html += _statsRow('AVG SCORE',  avg);
  });
  return html;
}

function _drawModePieChart() {
  // Aggregate time per mode from session history
  var history = typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];
  var timePerMode = {};
  history.forEach(function (e) {
    if (!timePerMode[e.mode]) timePerMode[e.mode] = 0;
    timePerMode[e.mode] += e.durationSecs || 0;
  });
  var data = Object.keys(timePerMode).map(function (m) {
    return { label: (_MODE_LABELS[m] || m), value: timePerMode[m], color: _MODE_PIE_COLORS[m] || '#00ff00' };
  }).filter(function (d) { return d.value > 0; });
  _drawPieChart('stats-pie-canvas', data);
}

function _renderTabRecords(stats) {
  var html = _statsSection('RECORDS');
  var comboStr = (stats.highestComboMultiplier || 1.0) === 1.0 ? '1x' : stats.highestComboMultiplier + 'x';
  var sprintBest = typeof loadSprintBest === 'function' ? loadSprintBest() : null;
  var sprintBestStr = sprintBest ? fmtSprintTime(sprintBest.timeMs) : '--';
  html += _statsRow('BEST SCORE',        stats.bestScore);
  html += _statsRow('MOST LINES / GAME', stats.mostLinesOneGame || 0);
  html += _statsRow('BEST COMBO',        comboStr);
  html += _statsRow('FASTEST SPRINT',    sprintBestStr);
  html += _statsRow('HIGHEST LEVEL',     stats.highestLevel || 1);
  html += _statsSection('SPECIAL MOVES');
  html += _statsRow('T-SPINS',           stats.totalTSpins || 0);
  html += _statsRow('PERFECT CLEARS',    stats.totalPerfectClears || 0);
  html += _statsRow('DAILY CHALLENGES',  stats.dailyChallengesCompleted || 0);
  html += _statsRow('PUZZLES COMPLETED', stats.puzzlesCompleted || 0);
  // Tournaments
  if (typeof tournamentLobby !== 'undefined' &&
      typeof tournamentLobby.getTournamentStats === 'function') {
    var ts = tournamentLobby.getTournamentStats();
    if (ts.entered > 0) {
      html += _statsSection('TOURNAMENTS');
      html += _statsRow('ENTERED', ts.entered);
      html += _statsRow('WINS', ts.wins || 0);
      html += _statsRow('BEST FINISH', ts.bestFinish || '—');
    }
  }
  return html;
}

let _statsTrendMetric = 'score';

function _renderTabTrends() {
  return '<div class="stats-trends-metric-row">' +
    '<button class="stats-trends-metric-btn stats-trends-metric-active" id="stm-score"   onclick="_setTrendMetric(\'score\')">SCORE</button>' +
    '<button class="stats-trends-metric-btn" id="stm-lines"   onclick="_setTrendMetric(\'lines\')">LINES</button>' +
    '<button class="stats-trends-metric-btn" id="stm-apm"     onclick="_setTrendMetric(\'apm\')">APM</button>' +
    '</div>' +
    '<canvas id="stats-trends-canvas" width="400" height="180" style="width:100%;max-width:400px;display:block;margin:0 auto;"></canvas>' +
    '<div class="stats-trends-legend" id="stats-trends-legend">Last 20 games — score by session</div>';
}

function _setTrendMetric(metric) {
  _statsTrendMetric = metric;
  ['score', 'lines', 'apm'].forEach(function (m) {
    var btn = document.getElementById('stm-' + m);
    if (btn) btn.classList.toggle('stats-trends-metric-active', m === metric);
  });
  _drawTrendsChart();
}

function _drawTrendsChart() {
  var canvas = document.getElementById('stats-trends-canvas');
  if (!canvas || !canvas.getContext) return;
  var history = typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];
  var recent = history.slice(0, 20).reverse();
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var PAD_L = 40, PAD_B = 20, PAD_R = 10, PAD_T = 10;
  ctx.clearRect(0, 0, W, H);

  var metric = _statsTrendMetric || 'score';
  var metricLabels = { score: 'score', lines: 'lines', apm: 'APM' };

  // Update legend text
  var legendEl = document.getElementById('stats-trends-legend');
  if (legendEl) legendEl.textContent = 'Last 20 games — ' + (metricLabels[metric] || metric) + ' per session';

  if (recent.length === 0) {
    ctx.fillStyle = 'rgba(0,255,0,0.4)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No session history yet', W / 2, H / 2);
    return;
  }

  var getValue = function (e) {
    if (metric === 'score') return e.score || 0;
    if (metric === 'lines') return e.lines || 0;
    if (metric === 'apm')   return e.apm || 0;
    return 0;
  };

  var values = recent.map(getValue);
  var maxVal = values.reduce(function (m, v) { return Math.max(m, v); }, 1);
  var chartW = W - PAD_L - PAD_R;
  var chartH = H - PAD_T - PAD_B;

  // Grid lines (4 horizontal)
  ctx.strokeStyle = 'rgba(0,255,0,0.12)';
  ctx.lineWidth = 1;
  for (var g = 1; g <= 4; g++) {
    var gy = PAD_T + chartH - (g / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(W - PAD_R, gy); ctx.stroke();
    // Y-axis label
    var labelVal = Math.round((g / 4) * maxVal);
    ctx.fillStyle = 'rgba(0,255,0,0.4)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'right';
    var labelStr = labelVal >= 1000 ? (labelVal / 1000).toFixed(1) + 'k' : String(labelVal);
    ctx.fillText(labelStr, PAD_L - 3, gy + 3);
  }

  // X-axis
  ctx.strokeStyle = 'rgba(0,255,0,0.3)';
  ctx.beginPath();
  ctx.moveTo(PAD_L, PAD_T + chartH);
  ctx.lineTo(W - PAD_R, PAD_T + chartH);
  ctx.stroke();

  // Y-axis
  ctx.beginPath();
  ctx.moveTo(PAD_L, PAD_T);
  ctx.lineTo(PAD_L, PAD_T + chartH);
  ctx.stroke();

  if (recent.length === 1) {
    // Single point — draw a dot
    var _sx = PAD_L + chartW / 2;
    var _sy = PAD_T + chartH - Math.max(4, (values[0] / maxVal) * chartH);
    ctx.fillStyle = '#0f0';
    ctx.beginPath(); ctx.arc(_sx, _sy, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }

  var stepX = chartW / (recent.length - 1);

  // Line chart
  ctx.strokeStyle = '#0f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  recent.forEach(function (entry, i) {
    var x = PAD_L + i * stepX;
    var y = PAD_T + chartH - (values[i] / maxVal) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#0f0';
  recent.forEach(function (entry, i) {
    var x = PAD_L + i * stepX;
    var y = PAD_T + chartH - (values[i] / maxVal) * chartH;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  });
}

function _drawPieChart(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  var total = data.reduce(function (s, d) { return s + d.value; }, 0);
  if (total === 0) {
    ctx.fillStyle = 'rgba(0,255,0,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', W / 2, H / 2);
    return;
  }

  var cx = W / 2 - 10, cy = H / 2, r = Math.min(cx, cy) - 10;
  var angle = -Math.PI / 2;
  data.forEach(function (d) {
    if (d.value === 0) return;
    var slice = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.stroke();
    angle += slice;
  });

  // Legend (right side)
  var legendX = cx + r + 14;
  var legendY = cy - (data.length * 10) / 2;
  data.forEach(function (d, i) {
    if (d.value === 0) return;
    var pct = Math.round((d.value / total) * 100);
    ctx.fillStyle = d.color;
    ctx.fillRect(legendX, legendY + i * 12, 8, 8);
    ctx.fillStyle = 'rgba(0,255,0,0.7)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(d.label + ' ' + pct + '%', legendX + 11, legendY + i * 12 + 7);
  });
}

function _renderTabMilestones(stats) {
  var unlocked = stats.unlockedMilestones || [];
  var html = _statsSection('MILESTONES');
  html += '<div class="stats-milestones-grid">';
  STATS_MILESTONES.forEach(function (m) {
    var isUnlocked = unlocked.includes(m.id);
    html += '<div class="stats-milestone' + (isUnlocked ? ' stats-milestone-unlocked' : '') + '">' +
      '<span class="stats-milestone-icon">' + (isUnlocked ? m.icon : '🔒') + '</span>' +
      '<span class="stats-milestone-label">' + _escStatsHtml(m.label) + '</span>' +
      '</div>';
  });
  html += '</div>';
  html += '<div class="stats-milestone-count">' + unlocked.length + ' / ' + STATS_MILESTONES.length + ' unlocked</div>';
  return html;
}

// ── Active tab state ──────────────────────────────────────────────────────────
let _statsDashTab = 'overview';

function _renderTabHistory() {
  var history = typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];
  var recent = history.slice(0, 20);
  if (recent.length === 0) {
    return _statsSection('RECENT GAMES') + '<div class="stats-empty">No games recorded yet.</div>';
  }
  var html = _statsSection('RECENT GAMES (last 20)');
  html += '<div class="stats-history-list">';
  recent.forEach(function (e) {
    var dur = e.durationSecs || 0;
    var durStr = dur >= 60 ? Math.floor(dur / 60) + 'm ' + (dur % 60) + 's' : dur + 's';
    html += '<div class="stats-history-entry">' +
      '<div class="stats-history-header">' +
        '<span class="stats-history-mode">' + _escStatsHtml((_MODE_LABELS[e.mode] || e.mode).toUpperCase()) + '</span>' +
        '<span class="stats-history-date">' + _escStatsHtml(e.date || '') + '</span>' +
      '</div>' +
      '<div class="stats-history-row">' +
        '<span>Score: ' + _escStatsHtml(String(e.score || 0)) + '</span>' +
        '<span>Lines: ' + _escStatsHtml(String(e.lines || 0)) + '</span>' +
        '<span>Time: ' + _escStatsHtml(durStr) + '</span>' +
      '</div>' +
      '<div class="stats-history-row">' +
        '<span>Combo: ' + _escStatsHtml(String(e.maxCombo || 0)) + '</span>' +
        '<span>T-Spins: ' + _escStatsHtml(String(e.tSpins || 0)) + '</span>' +
        '<span>Tetrises: ' + _escStatsHtml(String(e.tetrises || 0)) + '</span>' +
      '</div>' +
      '<div class="stats-history-row">' +
        '<span>Pieces: ' + _escStatsHtml(String(e.piecesPlaced || 0)) + '</span>' +
        '<span>APM: ' + _escStatsHtml(String(e.apm || 0)) + '</span>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';
  return html;
}

function _switchStatsDashTab(tab) {
  _statsDashTab = tab;
  // Update tab button active states
  ['overview', 'modes', 'records', 'trends', 'history', 'milestones'].forEach(function (t) {
    var btn = document.getElementById('stats-tab-' + t);
    if (btn) btn.classList.toggle('stats-tab-active', t === tab);
  });
  _renderActiveStatsDashTab();
}

function _renderActiveStatsDashTab() {
  var contentEl = document.getElementById('stats-dash-content');
  if (!contentEl) return;
  var stats = loadLifetimeStats();
  var html = '';
  if (_statsDashTab === 'overview')    html = _renderTabOverview(stats);
  else if (_statsDashTab === 'modes')  html = _renderTabModes(stats);
  else if (_statsDashTab === 'records') html = _renderTabRecords(stats);
  else if (_statsDashTab === 'trends') html = _renderTabTrends();
  else if (_statsDashTab === 'history') html = _renderTabHistory();
  else if (_statsDashTab === 'milestones') html = _renderTabMilestones(stats);
  contentEl.innerHTML = html;
  if (_statsDashTab === 'trends') {
    _statsTrendMetric = 'score';
    _drawTrendsChart();
  }
  if (_statsDashTab === 'modes') _drawModePieChart();
}

/** Render the full stats dashboard. */
function renderStatsPanel() {
  var body = document.getElementById('stats-panel-body');
  if (!body) return;
  body.innerHTML =
    '<div id="stats-dash-tabs">' +
      '<button id="stats-tab-overview"    class="stats-tab stats-tab-active" onclick="_switchStatsDashTab(\'overview\')">OVERVIEW</button>' +
      '<button id="stats-tab-modes"       class="stats-tab" onclick="_switchStatsDashTab(\'modes\')">MODES</button>' +
      '<button id="stats-tab-records"     class="stats-tab" onclick="_switchStatsDashTab(\'records\')">RECORDS</button>' +
      '<button id="stats-tab-trends"      class="stats-tab" onclick="_switchStatsDashTab(\'trends\')">TRENDS</button>' +
      '<button id="stats-tab-history"     class="stats-tab" onclick="_switchStatsDashTab(\'history\')">HISTORY</button>' +
      '<button id="stats-tab-milestones"  class="stats-tab" onclick="_switchStatsDashTab(\'milestones\')">BADGES</button>' +
    '</div>' +
    '<div id="stats-dash-content"></div>' +
    '<div id="stats-dash-footer">' +
      '<button class="stats-export-btn" onclick="_exportStatsJson()">Export JSON</button>' +
      '<button class="stats-reset-btn" onclick="_openStatsResetConfirm()">Reset Stats</button>' +
    '</div>';
  _statsDashTab = 'overview';
  _renderActiveStatsDashTab();
}

/** Render the season rank section into #stats-season-rank (if it exists). */
function renderSeasonRankSection() {
  const el = document.getElementById('stats-season-rank');
  if (!el) return;
  const season = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  if (!season) { el.style.display = 'none'; return; }
  const rating = (typeof loadBattleRating === 'function') ? loadBattleRating().rating : 0;
  const badgeHtml = (typeof getSeasonRankBadgeHtml === 'function')
    ? getSeasonRankBadgeHtml(rating) : rating + ' pts';
  el.innerHTML =
    '<div class="stats-season-rank-label">' + _escStatsHtml(season.name || 'Season') + '</div>' +
    '<div class="stats-season-rank-badge">' + badgeHtml + '</div>';
  el.style.display = '';
}

function _escStatsHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Open the stats overlay and populate it. */
function openStatsPanel() {
  renderStatsPanel();
  renderSeasonRankSection();
  if (typeof renderSeasonRecapSection === 'function') {
    renderSeasonRecapSection('stats-season-cards');
  }
  const el = document.getElementById('stats-overlay');
  if (el) el.style.display = 'flex';
}

/** Close the stats overlay. */
function closeStatsPanel() {
  const el = document.getElementById('stats-overlay');
  if (el) el.style.display = 'none';
}

// ── Stats reset confirmation dialog ──────────────────────────────────────────

function _openStatsResetConfirm() {
  var overlay = document.getElementById('stats-reset-confirm-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
}

function _closeStatsResetConfirm() {
  var overlay = document.getElementById('stats-reset-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _confirmStatsReset() {
  resetAllStats();
  _closeStatsResetConfirm();
  renderStatsPanel();
}

// ── Prestige confirmation dialog ─────────────────────────────────────────────

function _openPrestigeConfirm() {
  var overlay = document.getElementById('prestige-confirm-overlay');
  if (!overlay) return;
  var nextPrestige = (typeof getPrestigeLevel === 'function' ? getPrestigeLevel() : 0) + 1;
  var nextReward = typeof getNextPrestigeReward === 'function' ? getNextPrestigeReward() : null;
  var rewardHtml = '';
  if (nextReward) {
    rewardHtml = '<div class="prestige-confirm-reward">' +
      '<strong>You will earn:</strong><br>' +
      '+' + Math.round(nextReward.xpBonus * 100) + '% XP gain<br>' +
      nextReward.cosmetic +
    '</div>';
  }
  var body = document.getElementById('prestige-confirm-body');
  if (body) {
    body.innerHTML =
      '<p>Reset to <strong>Level 1</strong>?</p>' +
      '<p>Your XP will be reset to 0, but all mode unlocks and cosmetics remain.</p>' +
      rewardHtml +
      '<p class="prestige-confirm-warning">This cannot be undone!</p>';
  }
  overlay.style.display = 'flex';
}

function _closePrestigeConfirm() {
  var overlay = document.getElementById('prestige-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _confirmPrestige() {
  if (typeof performPrestige === 'function') {
    performPrestige();
  }
  _closePrestigeConfirm();
  // Refresh stats panel to show new state
  renderStatsPanel();
}
