// analytics.js — Analytics dashboard and extended event tracking (v1.0).
// Tracks anonymous gameplay metrics and surfaces insights via admin dashboard.
// Admin dashboard accessible via ?admin=true URL parameter.
// No PII collected. All data is anonymous aggregate counters.
// Privacy: analytics can be disabled via opt-out setting.

const ANALYTICS_STORAGE_KEY = 'mineCtris_analytics';
const ANALYTICS_OPT_OUT_KEY = 'mineCtris_analyticsOptOut';
const ANALYTICS_DEVICE_ID_KEY = 'mineCtris_analyticsDeviceId';
const ANALYTICS_SYNC_KEY = 'mineCtris_analyticsSyncDate';
const ANALYTICS_WORKER_URL = 'https://minectris-leaderboard.workers.dev';

// ── Opt-out ───────────────────────────────────────────────────────────────────

function analyticsIsOptedOut() {
  try { return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === '1'; } catch (_) { return true; }
}

function analyticsSetOptOut(optOut) {
  try {
    if (optOut) {
      localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
    } else {
      localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    }
  } catch (_) {}
}

// ── Anonymous device ID (random, not linked to any PII) ──────────────────────

function _analyticsGetDeviceId() {
  try {
    var id = localStorage.getItem(ANALYTICS_DEVICE_ID_KEY);
    if (id) return id;
    // Generate random ID
    var arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    id = Array.from(arr).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
    localStorage.setItem(ANALYTICS_DEVICE_ID_KEY, id);
    return id;
  } catch (_) {
    return 'unknown';
  }
}

// ── Device type detection ─────────────────────────────────────────────────────

function _analyticsGetDeviceType() {
  var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var w = window.innerWidth || 768;
  if (hasTouch && w < 1024) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

// ── Local data store ──────────────────────────────────────────────────────────

function _analyticsLoad() {
  try {
    var raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (_) {}
  return {
    deviceType: _analyticsGetDeviceType(),
    dailySessions: {},      // { 'YYYY-MM-DD': count }
    modePlayCounts: {},     // { mode: count }
    modeScores: {},         // { mode: [scores] } (capped at 50 per mode)
    featureUsage: {},       // { featureName: count }
    totalPiecesPlaced: 0,
    totalPlayTimeMs: 0,
    sessionCount: 0,
    firstSessionTs: null,
  };
}

function _analyticsSave(data) {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

// ── Session tracking ──────────────────────────────────────────────────────────

var _analyticsCurrentSession = null;

/**
 * Call when a game session begins.
 * @param {string} mode
 */
function analyticsSessionStart(mode) {
  if (analyticsIsOptedOut()) return;
  _analyticsCurrentSession = { mode: mode || 'classic', startTs: Date.now() };
}

/**
 * Call when a game session ends.
 * @param {object} stats  { mode, score, linesCleared, piecesPlaced, durationMs }
 */
function analyticsSessionEnd(stats) {
  if (analyticsIsOptedOut()) return;
  var data = _analyticsLoad();
  var now = Date.now();
  var day = new Date(now).toISOString().slice(0, 10);
  var mode = (stats && stats.mode) || (_analyticsCurrentSession && _analyticsCurrentSession.mode) || 'classic';
  var durationMs = (stats && stats.durationMs) ||
    (_analyticsCurrentSession ? now - _analyticsCurrentSession.startTs : 0);

  // Daily sessions counter
  data.dailySessions[day] = (data.dailySessions[day] || 0) + 1;

  // Mode play counts
  data.modePlayCounts[mode] = (data.modePlayCounts[mode] || 0) + 1;

  // Score history per mode (capped at 50 entries)
  if (stats && stats.score !== undefined) {
    if (!data.modeScores[mode]) data.modeScores[mode] = [];
    data.modeScores[mode].push(stats.score);
    if (data.modeScores[mode].length > 50) {
      data.modeScores[mode] = data.modeScores[mode].slice(-50);
    }
  }

  // Cumulative totals
  data.totalPiecesPlaced = (data.totalPiecesPlaced || 0) + ((stats && stats.piecesPlaced) || 0);
  data.totalPlayTimeMs = (data.totalPlayTimeMs || 0) + durationMs;
  data.sessionCount = (data.sessionCount || 0) + 1;
  if (!data.firstSessionTs) data.firstSessionTs = now;

  // Refresh device type
  data.deviceType = _analyticsGetDeviceType();

  _analyticsSave(data);
  _analyticsCurrentSession = null;

  // Background sync to worker (once per day, fire-and-forget)
  _analyticsMaybeSync(data);
}

/**
 * Track usage of a named feature.
 * @param {string} featureName  e.g. 'chat', 'friends', 'theme_editor', 'training_mode'
 */
function analyticsFeatureUsed(featureName) {
  if (analyticsIsOptedOut()) return;
  var data = _analyticsLoad();
  data.featureUsage[featureName] = (data.featureUsage[featureName] || 0) + 1;
  _analyticsSave(data);
}

// ── Worker sync ───────────────────────────────────────────────────────────────

function _analyticsMaybeSync(data) {
  if (analyticsIsOptedOut()) return;
  try {
    var today = new Date().toISOString().slice(0, 10);
    var lastSync = localStorage.getItem(ANALYTICS_SYNC_KEY);
    if (lastSync === today) return;

    // Compute average scores per mode for the payload
    var modeAvgScores = {};
    var modes = Object.keys(data.modeScores || {});
    for (var i = 0; i < modes.length; i++) {
      var scores = data.modeScores[modes[i]];
      if (scores && scores.length) {
        var sum = 0;
        for (var j = 0; j < scores.length; j++) sum += scores[j];
        modeAvgScores[modes[i]] = Math.round(sum / scores.length);
      }
    }

    var payload = {
      deviceId: _analyticsGetDeviceId(),
      deviceType: data.deviceType,
      sessionCount: data.sessionCount || 0,
      totalPlayTimeMs: data.totalPlayTimeMs || 0,
      totalPiecesPlaced: data.totalPiecesPlaced || 0,
      dailySessions: data.dailySessions,
      modePlayCounts: data.modePlayCounts,
      featureUsage: data.featureUsage || {},
      modeAvgScores: modeAvgScores,
    };

    fetch(ANALYTICS_WORKER_URL + '/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function(r) {
      if (r.ok) {
        try { localStorage.setItem(ANALYTICS_SYNC_KEY, today); } catch (_) {}
      }
    }).catch(function() {
      // Network failure — silent drop, retry tomorrow
    });
  } catch (_) {}
}

// ── Per-device stats (for settings panel) ────────────────────────────────────

/**
 * Returns formatted per-device stats for the settings panel.
 */
function analyticsGetDeviceStats() {
  var data = _analyticsLoad();
  var favoriteMode = 'classic';
  var maxCount = 0;
  var mKeys = Object.keys(data.modePlayCounts || {});
  for (var i = 0; i < mKeys.length; i++) {
    if (data.modePlayCounts[mKeys[i]] > maxCount) {
      maxCount = data.modePlayCounts[mKeys[i]];
      favoriteMode = mKeys[i];
    }
  }
  return {
    sessionCount: data.sessionCount || 0,
    totalPlayTimeMs: data.totalPlayTimeMs || 0,
    favoriteMode: favoriteMode,
    totalPiecesPlaced: data.totalPiecesPlaced || 0,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _analyticsFmtMs(ms) {
  if (!ms || ms <= 0) return '0s';
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  var m = Math.floor(ms / 60000);
  if (m < 60) return m + 'm ' + Math.round((ms % 60000) / 1000) + 's';
  var h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

function analyticsOpenAdminDashboard() {
  var overlay = document.getElementById('analytics-admin-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _analyticsRenderAdminDashboard();
}

function analyticsCloseAdminDashboard() {
  var overlay = document.getElementById('analytics-admin-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _analyticsRenderAdminDashboard() {
  var content = document.getElementById('analytics-admin-content');
  if (!content) return;

  content.innerHTML = '<div class="analytics-loading">Loading\u2026</div>';

  var params = new URLSearchParams(window.location.search);
  var adminKey = params.get('adminKey') || '';

  fetch(ANALYTICS_WORKER_URL + '/api/analytics/summary?key=' + encodeURIComponent(adminKey))
    .then(function(r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function(serverData) {
      _analyticsRenderDashboard(content, serverData);
    })
    .catch(function() {
      _analyticsRenderDashboard(content, null);
    });
}

function _analyticsRenderDashboard(container, serverData) {
  var local = _analyticsLoad();
  var agg = serverData && serverData.aggregate;

  container.innerHTML = '';

  // ── Header ──
  var hdr = _analyticsEl('div', 'analytics-section');
  hdr.innerHTML =
    '<div class="analytics-section-title">ANALYTICS DASHBOARD</div>' +
    '<div class="analytics-hint">' +
    (agg ? 'Live server data' : 'Local data only \u2014 server unavailable or key missing') +
    '</div>';
  container.appendChild(hdr);

  // ── Overview stats ──
  var totalSessions = agg ? agg.totalSessions : (local.sessionCount || 0);
  var active24h = agg ? agg.activePlayers24h : '\u2014';
  var avgDurMs = agg
    ? (agg.totalSessions > 0 ? Math.round(agg.totalPlayTimeMs / agg.totalSessions) : 0)
    : (local.sessionCount > 0 ? Math.round(local.totalPlayTimeMs / local.sessionCount) : 0);
  var totalPieces = agg ? agg.totalPiecesPlaced : (local.totalPiecesPlaced || 0);

  var overview = _analyticsEl('div', 'analytics-section');
  overview.innerHTML =
    '<div class="analytics-section-title">OVERVIEW</div>' +
    '<div class="analytics-grid">' +
    _analyticsStatHtml(totalSessions, 'Total Sessions') +
    _analyticsStatHtml(active24h, 'Active (24h)') +
    _analyticsStatHtml(_analyticsFmtMs(avgDurMs), 'Avg Session') +
    _analyticsStatHtml(totalPieces.toLocaleString(), 'Pieces Placed') +
    '</div>';
  container.appendChild(overview);

  // ── Daily sessions line chart ──
  var dailySec = _analyticsEl('div', 'analytics-section');
  dailySec.innerHTML = '<div class="analytics-section-title">DAILY SESSIONS (LAST 30 DAYS)</div>';
  var lineCanvas = _analyticsCanvas(560, 150);
  dailySec.appendChild(lineCanvas);
  container.appendChild(dailySec);

  // ── Mode popularity bar chart ──
  var modeSec = _analyticsEl('div', 'analytics-section');
  modeSec.innerHTML = '<div class="analytics-section-title">MODE POPULARITY</div>';
  var barCanvas = _analyticsCanvas(560, 150);
  modeSec.appendChild(barCanvas);
  container.appendChild(modeSec);

  // ── Device breakdown pie chart ──
  var devSec = _analyticsEl('div', 'analytics-section');
  devSec.innerHTML = '<div class="analytics-section-title">DEVICE BREAKDOWN</div>';
  var pieCanvas = _analyticsCanvas(220, 180);
  devSec.appendChild(pieCanvas);
  container.appendChild(devSec);

  // ── Avg score by mode ──
  var scoreSec = _analyticsEl('div', 'analytics-section');
  scoreSec.innerHTML = '<div class="analytics-section-title">AVG SCORE BY MODE</div>';
  var scoreData = agg ? (agg.modeAvgScores || {}) : {};
  // Supplement with local data where server has no entry
  var lModes = Object.keys(local.modeScores || {});
  for (var lmi = 0; lmi < lModes.length; lmi++) {
    if (!scoreData[lModes[lmi]]) {
      var lArr = local.modeScores[lModes[lmi]];
      if (lArr && lArr.length) {
        var lSum = 0;
        for (var li = 0; li < lArr.length; li++) lSum += lArr[li];
        scoreData[lModes[lmi]] = Math.round(lSum / lArr.length);
      }
    }
  }
  var scoreKeys = Object.keys(scoreData);
  if (scoreKeys.length === 0) {
    scoreSec.innerHTML += '<div class="analytics-empty">No score data yet.</div>';
  } else {
    scoreKeys.sort(function(a, b) { return scoreData[b] - scoreData[a]; });
    var sHtml = '<div class="analytics-table"><div class="analytics-row analytics-header"><span>Mode</span><span>Avg Score</span></div>';
    for (var si = 0; si < scoreKeys.length; si++) {
      sHtml += '<div class="analytics-row"><span>' + scoreKeys[si] + '</span><span>' + scoreData[scoreKeys[si]].toLocaleString() + '</span></div>';
    }
    sHtml += '</div>';
    scoreSec.innerHTML += sHtml;
  }
  container.appendChild(scoreSec);

  // ── Feature adoption ──
  var featSec = _analyticsEl('div', 'analytics-section');
  featSec.innerHTML = '<div class="analytics-section-title">FEATURE ADOPTION</div>';
  var featData = agg ? (agg.featureUsage || {}) : (local.featureUsage || {});
  var featKeys = Object.keys(featData);
  if (featKeys.length === 0) {
    featSec.innerHTML += '<div class="analytics-empty">No feature usage tracked yet.</div>';
  } else {
    featKeys.sort(function(a, b) { return featData[b] - featData[a]; });
    var fHtml = '<div class="analytics-table"><div class="analytics-row analytics-header"><span>Feature</span><span>Uses</span></div>';
    for (var fi = 0; fi < featKeys.length; fi++) {
      fHtml += '<div class="analytics-row"><span>' + featKeys[fi] + '</span><span>' + featData[featKeys[fi]] + '</span></div>';
    }
    fHtml += '</div>';
    featSec.innerHTML += fHtml;
  }
  container.appendChild(featSec);

  // Render charts once DOM is updated
  requestAnimationFrame(function() {
    var dailySessions = agg ? (agg.dailySessions || {}) : (local.dailySessions || {});
    _analyticsDrawLineChart(lineCanvas, dailySessions, 30, '#4caf50', 'Sessions/day');

    var modeCounts = agg ? (agg.modePlayCounts || {}) : (local.modePlayCounts || {});
    _analyticsDrawBarChart(barCanvas, modeCounts, '#2196f3');

    var devBreakdown = agg ? (agg.deviceBreakdown || {}) : {};
    if (!agg && local.deviceType) devBreakdown[local.deviceType] = 1;
    _analyticsDrawPieChart(pieCanvas, devBreakdown);
  });
}

function _analyticsEl(tag, cls) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

function _analyticsCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.style.width = '100%';
  c.style.maxWidth = w + 'px';
  c.style.height = h + 'px';
  return c;
}

function _analyticsStatHtml(val, label) {
  return '<div class="analytics-stat"><span class="analytics-val">' + val + '</span><span class="analytics-label">' + label + '</span></div>';
}

// ── Canvas charts ─────────────────────────────────────────────────────────────

/**
 * Line chart: daily session counts over the past `days` days.
 */
function _analyticsDrawLineChart(canvas, dailySessions, days, color, label) {
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var W = canvas.width, H = canvas.height;
  var pad = { top: 20, right: 15, bottom: 28, left: 32 };

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  // Build 30-day bucket array
  var buckets = [];
  var now = new Date();
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(now);
    d.setDate(d.getDate() - i);
    var key = d.toISOString().slice(0, 10);
    buckets.push({ key: key, value: dailySessions[key] || 0 });
  }

  var maxVal = 1;
  for (var bi = 0; bi < buckets.length; bi++) {
    if (buckets[bi].value > maxVal) maxVal = buckets[bi].value;
  }

  var cW = W - pad.left - pad.right;
  var cH = H - pad.top - pad.bottom;

  // Grid lines + Y labels
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (var gi = 0; gi <= 4; gi++) {
    var gy = pad.top + (cH / 4) * gi;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * (1 - gi / 4)), pad.left - 3, gy + 3);
  }

  // X-axis date labels every 7 days
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  for (var xi = 0; xi < buckets.length; xi += 7) {
    var bx = pad.left + (xi / (buckets.length - 1)) * cW;
    ctx.fillText(buckets[xi].key.slice(5), bx, H - 4);
  }

  // Area fill under line
  ctx.beginPath();
  for (var ai = 0; ai < buckets.length; ai++) {
    var ax = pad.left + (ai / (buckets.length - 1)) * cW;
    var ay = pad.top + cH - (buckets[ai].value / maxVal) * cH;
    if (ai === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
  }
  ctx.lineTo(pad.left + cW, pad.top + cH);
  ctx.lineTo(pad.left, pad.top + cH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(76,175,80,0.18)';
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (var li = 0; li < buckets.length; li++) {
    var lx = pad.left + (li / (buckets.length - 1)) * cW;
    var ly = pad.top + cH - (buckets[li].value / maxVal) * cH;
    if (li === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
  }
  ctx.stroke();

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, pad.left + 2, pad.top + 11);
}

/**
 * Bar chart: mode play counts.
 */
function _analyticsDrawBarChart(canvas, modeCounts, color) {
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var W = canvas.width, H = canvas.height;
  var pad = { top: 10, right: 10, bottom: 36, left: 32 };

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  var modes = Object.keys(modeCounts);
  if (modes.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.fillText('No data yet', W / 2, H / 2);
    return;
  }
  modes.sort(function(a, b) { return modeCounts[b] - modeCounts[a]; });
  if (modes.length > 10) modes = modes.slice(0, 10);

  var maxVal = modeCounts[modes[0]] || 1;
  var cW = W - pad.left - pad.right;
  var cH = H - pad.top - pad.bottom;
  var slotW = cW / modes.length;
  var barW = Math.max(4, slotW - 4);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (var gi = 0; gi <= 4; gi++) {
    var gy = pad.top + (cH / 4) * gi;
    ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(W - pad.right, gy); ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * (1 - gi / 4)), pad.left - 3, gy + 3);
  }

  // Bars + labels
  for (var mi = 0; mi < modes.length; mi++) {
    var val = modeCounts[modes[mi]];
    var bx = pad.left + mi * slotW + (slotW - barW) / 2;
    var bh = (val / maxVal) * cH;
    var by = pad.top + cH - bh;
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, barW, bh);

    // X label (truncated)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    var lbl = modes[mi].length > 8 ? modes[mi].slice(0, 8) : modes[mi];
    ctx.fillText(lbl, bx + barW / 2, H - pad.bottom + 12);
  }
}

/**
 * Pie chart: device type breakdown.
 */
function _analyticsDrawPieChart(canvas, deviceBreakdown) {
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, W, H);

  var keys = Object.keys(deviceBreakdown);
  if (keys.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.fillText('No data yet', W / 2, H / 2);
    return;
  }

  var total = 0;
  for (var ki = 0; ki < keys.length; ki++) total += deviceBreakdown[keys[ki]];
  if (total === 0) return;

  var palette = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0'];
  var cx = W * 0.38, cy = H * 0.50;
  var radius = Math.min(W * 0.32, H * 0.38);
  var angle = -Math.PI / 2;

  for (var pi = 0; pi < keys.length; pi++) {
    var sweep = (deviceBreakdown[keys[pi]] / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = palette[pi % palette.length];
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    angle += sweep;
  }

  // Legend
  var lx = W * 0.76, ly = H * 0.18;
  ctx.font = '10px monospace';
  for (var lgi = 0; lgi < keys.length; lgi++) {
    var pct = Math.round((deviceBreakdown[keys[lgi]] / total) * 100);
    ctx.fillStyle = palette[lgi % palette.length];
    ctx.fillRect(lx - 14, ly + lgi * 22 - 8, 10, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText(keys[lgi] + ' ' + pct + '%', lx, ly + lgi * 22);
  }
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Initialize analytics. Call once after DOM is ready.
 * Detects ?admin=true URL param and opens admin dashboard.
 */
function analyticsInit() {
  // Update device type in stored data
  if (!analyticsIsOptedOut()) {
    var data = _analyticsLoad();
    var det = _analyticsGetDeviceType();
    if (data.deviceType !== det) {
      data.deviceType = det;
      _analyticsSave(data);
    }
  }

  // Open admin dashboard if ?admin=true
  var params = new URLSearchParams(window.location.search);
  if (params.get('admin') === 'true') {
    // Wait for game UI to settle before showing the overlay
    setTimeout(function() { analyticsOpenAdminDashboard(); }, 800);
  }
}
