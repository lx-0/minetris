// Online leaderboard — display name modal, score submission, leaderboard panel.
// Depends on: daily.js (getDailyDateString, formatDailyLabel)

const LEADERBOARD_WORKER_URL = 'https://minectris-leaderboard.workers.dev';
const DISPLAY_NAME_KEY = 'mineCtris_displayName';
const LB_SUBMITTED_KEY = 'mineCtris_lbSubmitted'; // value: "YYYY-MM-DD"

// ── 5-Minute Leaderboard Cache ────────────────────────────────────────────────
const _LB_CACHE_TTL = 5 * 60 * 1000;
const _lbCache = {};
function _lbCacheGet(key) {
  const e = _lbCache[key];
  if (!e) return null;
  if (Date.now() - e.ts > _LB_CACHE_TTL) { delete _lbCache[key]; return null; }
  return e.data;
}
function _lbCacheSet(key, data) { _lbCache[key] = { data: data, ts: Date.now() }; }
async function _lbCachedFetch(key, fn) {
  const hit = _lbCacheGet(key);
  if (hit !== null) return hit;
  const data = await fn();
  _lbCacheSet(key, data);
  return data;
}

// ── Rank-trend tracking (compare current session rank vs. previous session) ───
const _LB_RANK_HISTORY_KEY = 'mineCtris_lbRankHistory';
function _lbGetRankHistory() {
  try { return JSON.parse(localStorage.getItem(_LB_RANK_HISTORY_KEY) || '{}'); } catch (_) { return {}; }
}
function _lbRecordRank(tabKey, rank) {
  const h = _lbGetRankHistory(); h[tabKey] = rank;
  try { localStorage.setItem(_LB_RANK_HISTORY_KEY, JSON.stringify(h)); } catch (_) {}
}
function _lbPrevRank(tabKey) { return _lbGetRankHistory()[tabKey] || null; }
function _lbTrendHtml(tabKey, currentRank) {
  const prev = _lbPrevRank(tabKey);
  if (prev == null || prev === currentRank) return '';
  const delta = prev - currentRank; // positive = rank improved (moved up)
  if (delta > 0) return ' <span class="lb-trend-up" title="Up ' + delta + ' from last session">\u2191' + delta + '</span>';
  return ' <span class="lb-trend-down" title="Down ' + Math.abs(delta) + ' from last session">\u2193' + Math.abs(delta) + '</span>';
}

// ── Pagination state ──────────────────────────────────────────────────────────
let _lbPaginationState = null; // { entries, date, labelOverride, isSeason, tabKey, count }

// ── Rank badge helper ─────────────────────────────────────────────────────────
function _lbRankBadge(rank) {
  if (rank === 1) return '<span class="lb-rank-badge lb-rank-gold" title="1st">\ud83e\udd47</span>';
  if (rank === 2) return '<span class="lb-rank-badge lb-rank-silver" title="2nd">\ud83e\udd48</span>';
  if (rank === 3) return '<span class="lb-rank-badge lb-rank-bronze" title="3rd">\ud83e\udd49</span>';
  if (rank <= 10) return '<span class="lb-rank-num-badge">' + rank + '</span>';
  return rank + '';
}

// Season badge labels by rank (top-3 finishers)
const _SEASON_BADGES = {
  1: { label: 'Champion', icon: '🏆' },
  2: { label: 'Veteran',  icon: '🥈' },
  3: { label: 'Contender', icon: '🥉' },
};

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadDisplayName() {
  try { return localStorage.getItem(DISPLAY_NAME_KEY) || ''; } catch (_) { return ''; }
}

function saveDisplayName(name) {
  try { localStorage.setItem(DISPLAY_NAME_KEY, name); } catch (_) {}
}

function hasSubmittedToday() {
  try {
    return localStorage.getItem(LB_SUBMITTED_KEY) === getDailyDateString();
  } catch (_) { return false; }
}

function markSubmittedToday() {
  try { localStorage.setItem(LB_SUBMITTED_KEY, getDailyDateString()); } catch (_) {}
}

// ── Anti-cheat helpers ────────────────────────────────────────────────────────

/**
 * Compute a SHA-256 hex digest over the submission payload for tamper-evidence.
 * Format: "pieceIndicesCSV:score:linesCleared:timestamp"
 */
async function _buildReplaySignature(pieceIndices, score, linesCleared, timestamp) {
  try {
    const data = (pieceIndices || []).join(',') + ':' + score + ':' + linesCleared + ':' + timestamp;
    const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch (_) {
    return null;
  }
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiSubmitScore(displayName, score, linesCleared) {
  const date      = getDailyDateString();
  const timestamp = Date.now();
  const replay    = typeof replayConsumeSubmissionData === 'function' ? replayConsumeSubmissionData() : null;
  const signature = replay ? await _buildReplaySignature(replay.pieceIndices, score, linesCleared, timestamp) : null;
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName, score, linesCleared, date, clientTimestamp: timestamp,
      replay:    replay    || undefined,
      signature: signature || undefined,
    }),
  });
  return resp.json();
}

async function apiFetchLeaderboard(date) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/' + date);
  return resp.json();
}

async function apiFetchSeasonLeaderboard() {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/season');
  return resp.json();
}

async function apiFetchSeasonArchive(seasonId) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/archive/' + seasonId);
  return resp.json();
}

async function apiFetchPlayerBadges(displayName) {
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/badges/' + encodeURIComponent(displayName));
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.badges || [];
  } catch (_) { return []; }
}

async function apiFetchSeasonRatings(displayName) {
  const url = LEADERBOARD_WORKER_URL + '/api/season/ratings' +
    (displayName ? '?displayName=' + encodeURIComponent(displayName) : '');
  const resp = await fetch(url);
  return resp.json();
}

async function apiFetchHallOfFame() {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/hall-of-fame');
  return resp.json();
}

async function apiFetchSeasonRatingSnapshot(seasonId) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/rating-snapshot/' + encodeURIComponent(seasonId));
  return resp.json();
}

async function apiSubmitMasteryScore(displayName, totalScore, tiers, obsidianCount) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/mastery/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, totalScore, tiers, obsidianCount, timestamp: new Date().toISOString() }),
  });
  return resp.json();
}

async function apiFetchMasteryLeaderboard(displayName) {
  const url = LEADERBOARD_WORKER_URL + '/api/mastery/leaderboard' +
    (displayName ? '?displayName=' + encodeURIComponent(displayName) : '');
  const resp = await fetch(url);
  return resp.json();
}

async function apiFetchCoopLeaderboard(date, isDaily) {
  const path = isDaily
    ? '/api/leaderboard/coop/daily/' + date
    : '/api/leaderboard/coop/' + date;
  const resp = await fetch(LEADERBOARD_WORKER_URL + path);
  return resp.json();
}

async function apiSubmitCoopScore(player1, player2, score, difficulty, isDaily) {
  const date = getDailyDateString();
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/coop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player1, player2, score, date, difficulty, isDaily: !!isDaily }),
  });
  return resp.json();
}

// ── Display Name Modal ────────────────────────────────────────────────────────

/**
 * Open the display name modal.
 * @param {function} onConfirm  Called with the validated name string.
 */
function openDisplayNameModal(onConfirm) {
  const overlay = document.getElementById('lb-name-modal');
  const input   = document.getElementById('lb-name-input');
  const errEl   = document.getElementById('lb-name-error');
  const saveBtn = document.getElementById('lb-name-save-btn');
  const cancelBtn = document.getElementById('lb-name-cancel-btn');

  if (!overlay) return;

  // Pre-fill with existing name
  if (input) input.value = loadDisplayName();
  if (errEl) errEl.textContent = '';

  overlay.style.display = 'flex';
  if (input) input.focus();

  function validate() {
    const val = (input ? input.value : '').trim();
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(val)) {
      if (errEl) errEl.textContent = 'Letters, numbers and _ only (max 16)';
      return null;
    }
    if (errEl) errEl.textContent = '';
    return val;
  }

  function onSave() {
    const name = validate();
    if (!name) return;
    saveDisplayName(name);
    overlay.style.display = 'none';
    cleanup();
    onConfirm(name);
  }

  function onCancel() {
    overlay.style.display = 'none';
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') onSave();
    if (e.key === 'Escape') onCancel();
  }

  function cleanup() {
    if (saveBtn)   saveBtn.removeEventListener('click', onSave);
    if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
    if (input)     input.removeEventListener('keydown', onKeyDown);
  }

  if (saveBtn)   saveBtn.addEventListener('click', onSave);
  if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
  if (input)     input.addEventListener('keydown', onKeyDown);
}

// ── Leaderboard Panel ─────────────────────────────────────────────────────────

let _lbActiveTab = 'today'; // 'today' | 'yesterday' | 'thisweek' | 'lastweek' | 'season' | 'seasonrating' | 'coop' | 'dailycoop' | 'battle' | 'mastery' | 'modes' | 'friends'

function openLeaderboardPanel(defaultTab) {
  const overlay = document.getElementById('lb-panel-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _lbActiveTab = defaultTab || 'today';
  _syncLbTabs();
  _loadLbTab(_lbActiveTab);
}

function closeLeaderboardPanel() {
  const overlay = document.getElementById('lb-panel-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _syncLbTabs() {
  const todayBtn     = document.getElementById('lb-tab-today');
  const yestBtn      = document.getElementById('lb-tab-yesterday');
  const thisWeekBtn  = document.getElementById('lb-tab-thisweek');
  const lastWeekBtn  = document.getElementById('lb-tab-lastweek');
  const seasonBtn       = document.getElementById('lb-tab-season');
  const seasonRatingBtn = document.getElementById('lb-tab-seasonrating');
  const coopBtn         = document.getElementById('lb-tab-coop');
  const dailyCoopBtn    = document.getElementById('lb-tab-dailycoop');
  const battleBtn       = document.getElementById('lb-tab-battle');
  const masteryBtn      = document.getElementById('lb-tab-mastery');
  const modesBtn        = document.getElementById('lb-tab-modes');
  const friendsBtn      = document.getElementById('lb-tab-friends');
  if (todayBtn)        todayBtn.classList.toggle('lb-tab-active',        _lbActiveTab === 'today');
  if (yestBtn)         yestBtn.classList.toggle('lb-tab-active',         _lbActiveTab === 'yesterday');
  if (thisWeekBtn)     thisWeekBtn.classList.toggle('lb-tab-active',     _lbActiveTab === 'thisweek');
  if (lastWeekBtn)     lastWeekBtn.classList.toggle('lb-tab-active',     _lbActiveTab === 'lastweek');
  if (seasonBtn)       seasonBtn.classList.toggle('lb-tab-active',       _lbActiveTab === 'season');
  if (seasonRatingBtn) seasonRatingBtn.classList.toggle('lb-tab-active', _lbActiveTab === 'seasonrating');
  if (coopBtn)         coopBtn.classList.toggle('lb-tab-active',         _lbActiveTab === 'coop');
  if (dailyCoopBtn)    dailyCoopBtn.classList.toggle('lb-tab-active',    _lbActiveTab === 'dailycoop');
  if (battleBtn)       battleBtn.classList.toggle('lb-tab-active',       _lbActiveTab === 'battle');
  if (masteryBtn)      masteryBtn.classList.toggle('lb-tab-active',      _lbActiveTab === 'mastery');
  if (modesBtn)        modesBtn.classList.toggle('lb-tab-active',        _lbActiveTab === 'modes');
  if (friendsBtn)      friendsBtn.classList.toggle('lb-tab-active',      _lbActiveTab === 'friends');
}

function _getYesterdayString() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function _loadLbTab(tab) {
  const body = document.getElementById('lb-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="lb-loading">Loading...</div>';
  _lbPaginationState = null; // reset pagination on tab switch

  try {
    if (tab === 'season') {
      // Try active season first; fall back to ended-season archive
      let rendered = false;

      const activeSeason = typeof getSeasonConfig === 'function' ? getSeasonConfig() : null;
      const endedSeason  = typeof getEndedSeasonConfig === 'function' ? getEndedSeasonConfig() : null;

      if (activeSeason && activeSeason.seasonId) {
        const data = await _lbCachedFetch('season', apiFetchSeasonLeaderboard);
        if (data && data.entries) {
          const label = data.seasonName || 'Current Season';
          _renderLeaderboard(body, data.entries, null, label, true, 'season');
          rendered = true;
        }
      }

      if (!rendered && endedSeason && endedSeason.seasonId) {
        const archive = await _lbCachedFetch('season-archive:' + endedSeason.seasonId, function() {
          return apiFetchSeasonArchive(endedSeason.seasonId);
        });
        if (archive && archive.top10) {
          const entries = archive.top10.map(function(e) {
            return { rank: e.rank, displayName: e.displayName, totalScore: e.totalScore, gamesPlayed: e.gamesPlayed, _archiveBadge: e.badge };
          });
          _renderLeaderboard(body, entries, null, (archive.name || 'Season') + ' \u2014 Final', true, 'season');
          rendered = true;
        }
      }

      if (!rendered) {
        const data = await _lbCachedFetch('season', apiFetchSeasonLeaderboard);
        if (!data || !data.entries) throw new Error('bad response');
        _renderLeaderboard(body, data.entries, null, data.seasonName || 'Season', true, 'season');
      }
    } else if (tab === 'thisweek' || tab === 'lastweek') {
      const weekStr = tab === 'thisweek' ? getWeeklyDateString() : _getLastWeekString();
      const data = await _lbCachedFetch('week:' + weekStr, function() { return apiFetchWeeklyLeaderboard(weekStr); });
      if (!data || !data.entries) throw new Error('bad response');
      const label = formatWeeklyLabel(weekStr) +
        (typeof formatWeeklyDateRange === 'function' ? ' \u00b7 ' + formatWeeklyDateRange(weekStr) : '');
      _renderLeaderboard(body, data.entries, null, label, false, tab);
    } else if (tab === 'coop' || tab === 'dailycoop') {
      const isDaily = tab === 'dailycoop';
      const date = getDailyDateString();
      const data = await _lbCachedFetch('coop:' + tab + ':' + date, function() { return apiFetchCoopLeaderboard(date, isDaily); });
      if (!data || !data.entries) throw new Error('bad response');
      const label = (isDaily ? 'Daily Co-op \u2014 ' : 'Co-op \u2014 ') + formatDailyLabel(date);
      _renderCoopLeaderboard(body, data.entries, label);
    } else if (tab === 'seasonrating') {
      const myName = loadDisplayName();
      const data = await _lbCachedFetch('seasonrating:' + myName, function() { return apiFetchSeasonRatings(myName); });
      if (!data || !data.entries) throw new Error('bad response');
      _renderSeasonRatingLeaderboard(body, data);
    } else if (tab === 'battle') {
      const data = await _lbCachedFetch('battle', apiFetchBattleLeaderboard);
      if (!data || !data.entries) throw new Error('bad response');
      _renderBattleLeaderboard(body, data.entries);
    } else if (tab === 'mastery') {
      const myName = loadDisplayName();
      const data = await _lbCachedFetch('mastery:' + myName, function() { return apiFetchMasteryLeaderboard(myName); });
      if (!data || !data.entries) throw new Error('bad response');
      _renderMasteryLeaderboard(body, data.entries, data.ownEntry);
    } else if (tab === 'modes') {
      const myName = loadDisplayName();
      const data = await _lbCachedFetch('modes:' + _lbActiveModeTab + ':' + _lbModeRange, function() {
        return apiFetchModeLeaderboard(_lbActiveModeTab, _lbModeRange, myName);
      });
      if (!data || !data.entries) throw new Error('bad response');
      _renderModeLeaderboard(body, data, _lbActiveModeTab, _lbModeRange);
      return;
    } else if (tab === 'friends') {
      await _loadFriendsTab(body);
      return;
    } else {
      const date = tab === 'today' ? getDailyDateString() : _getYesterdayString();
      const data = await _lbCachedFetch('daily:' + date, function() { return apiFetchLeaderboard(date); });
      if (!data || !data.entries) throw new Error('bad response');
      _renderLeaderboard(body, data.entries, date, null, false, tab);
    }
  } catch (_) {
    body.innerHTML = '<div class="lb-error">Could not load leaderboard.</div>';
  }
}

function _renderLeaderboard(container, entries, date, labelOverride, isSeason, tabKey) {
  // Store for pagination
  _lbPaginationState = { entries: entries, date: date, labelOverride: labelOverride, isSeason: isSeason, tabKey: tabKey, count: 25 };
  _doRenderLeaderboard(container);
}

function _doRenderLeaderboard(container) {
  if (!_lbPaginationState) return;
  const { entries, date, labelOverride, isSeason, tabKey } = _lbPaginationState;
  const count = _lbPaginationState.count;

  const myName = loadDisplayName().toLowerCase();
  const dateLabel = labelOverride || (date ? formatDailyLabel(date) : '');

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No scores yet' + (dateLabel ? ' for ' + _escHtml(dateLabel) : '') + '.</div>';
    return;
  }

  const scoreKey = isSeason ? 'totalScore' : 'score';
  const col2Label = isSeason ? 'Games' : 'Lines';
  const col2Key   = isSeason ? 'gamesPlayed' : 'linesCleared';

  // Country filter
  const myCountry = (navigator.language || '').split('-')[1] || '';
  const hasCountryData = entries.some(function(e) { return e.country; });
  const countryFilterEl = container.querySelector && container.querySelector('.lb-country-filter');
  const countryFilterChecked = countryFilterEl ? countryFilterEl.checked : false;
  const visibleEntries = (hasCountryData && countryFilterChecked && myCountry)
    ? entries.filter(function(e) { return (e.country || '').toUpperCase() === myCountry.toUpperCase(); })
    : entries;

  const pageEntries = visibleEntries.slice(0, count);
  const hasMore = visibleEntries.length > count;

  let html = '';

  // Country filter toggle
  if (hasCountryData && myCountry) {
    html += '<div class="lb-filters">' +
      '<label class="lb-country-filter-label">' +
      '<input type="checkbox" class="lb-country-filter"' + (countryFilterChecked ? ' checked' : '') + '> ' +
      '\ud83c\udff3\ufe0f My country only (' + myCountry + ')' +
      '</label></div>';
  }

  html += '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Score</th><th>' + col2Label + '</th>' +
    '</tr></thead><tbody>';

  const _myLevel = (function() {
    if (typeof getLevelFromXP !== 'function' || typeof loadLifetimeStats !== 'function') return 1;
    return getLevelFromXP(loadLifetimeStats().playerXP || 0);
  })();
  const _myTitle = typeof getLevelTitle === 'function' ? getLevelTitle(_myLevel) : '';

  let myVisibleEntry = null;

  pageEntries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    if (isMe) myVisibleEntry = e;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    let nameCell = _escHtml(e.displayName);

    // Season top-3 badges
    if (isSeason && _SEASON_BADGES[e.rank]) {
      const b = _SEASON_BADGES[e.rank];
      nameCell = '<span class="lb-season-badge lb-season-badge-' + e.rank + '" title="' + b.label + '">' +
        b.icon + '</span> ' + nameCell;
    }

    if (isMe) {
      if (typeof loadFeaturedBadge === 'function' && typeof ACHIEVEMENTS !== 'undefined') {
        const _featuredId = loadFeaturedBadge();
        if (_featuredId) {
          const _featuredAch = ACHIEVEMENTS.find(function(a) { return a.id === _featuredId; });
          if (_featuredAch) {
            nameCell = '<span class="lb-featured-badge" title="Featured: ' + _featuredAch.name + '">' + _featuredAch.icon + '</span> ' + nameCell;
          }
        }
      }
      const _prestigeHtml = typeof getPrestigeStarsHtml === 'function' ? getPrestigeStarsHtml() : '';
      if (_prestigeHtml) nameCell = _prestigeHtml + ' ' + nameCell;
      const badgeLabel = typeof getLevelBadgeLabel === 'function' ? getLevelBadgeLabel(_myLevel) : 'L' + _myLevel;
      nameCell += ' <span class="lb-level-badge">' + badgeLabel + '</span>';
      if (_myTitle) nameCell += ' <span class="lb-level-title">' + _myTitle + '</span>';
      if (typeof getMasteryScore === 'function') {
        const _ms = getMasteryScore();
        if (_ms > 0) nameCell += ' <span class="lb-mastery-badge" title="Mastery Score: ' + _ms + '/40">\u2694 ' + _ms + '</span>';
      }
      const _gc = (typeof getMyGuildCosmetics === 'function') ? getMyGuildCosmetics() : null;
      if (_gc && _gc.emblem) {
        nameCell += ' <span class="lb-guild-emblem' + (_gc.isLegendary ? ' lb-guild-emblem--legendary' : '') + '" title="Guild Emblem">' + _gc.emblem + '</span>';
      }
      // Trend indicator
      if (tabKey) nameCell += _lbTrendHtml(tabKey, e.rank);
      nameCell += ' \u25c4';
    }

    const rankCell    = _lbRankBadge(e.rank);
    const scoreVal    = (e[scoreKey] || 0).toLocaleString();
    const col2Val     = e[col2Key] != null ? e[col2Key] : '-';
    const verifiedBadge = e.verified
      ? '<span class="lb-verified-badge" title="Score verified by server replay check">\u2714</span> '
      : '';
    // Local player gets a 24×24 avatar thumbnail (lazy-rendered via data attribute)
    const avatarHtml = isMe && typeof renderAvatarToCanvas === 'function'
      ? '<canvas class="lb-avatar-thumb" data-lb-avatar="1" width="24" height="24" style="vertical-align:middle;margin-right:4px;image-rendering:pixelated;"></canvas>'
      : '';
    html += '<tr' + cls + '>' +
      '<td>' + rankCell + '</td>' +
      '<td>' + verifiedBadge + avatarHtml + nameCell + '</td>' +
      '<td>' + scoreVal + '</td>' +
      '<td>' + col2Val + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';

  // Load More button
  if (hasMore) {
    html += '<button class="lb-load-more-btn">Load More (' + (visibleEntries.length - count) + ' more)</button>';
  }

  // Pinned personal rank — shown when player is not in current page
  const myFullEntry = !myVisibleEntry && myName
    ? visibleEntries.find(function(e) { return e.displayName.toLowerCase() === myName; })
    : null;
  if (myFullEntry) {
    const scoreVal = (myFullEntry[scoreKey] || 0).toLocaleString();
    html += '<div class="lb-mode-own-entry lb-mode-own-entry-pinned">You \u2014 Rank #' + myFullEntry.rank + ' \u2014 ' + scoreVal + '</div>';
  }

  container.innerHTML = html;

  // Lazy-render local player avatar thumbnail
  const lbAvatarThumb = container.querySelector('.lb-avatar-thumb[data-lb-avatar]');
  if (lbAvatarThumb && typeof renderAvatarToCanvas === 'function' && typeof getSelectedAvatar === 'function') {
    renderAvatarToCanvas(lbAvatarThumb, getSelectedAvatar(), getSelectedFrame ? getSelectedFrame() : 'none');
  }

  // Record rank for trend tracking (first time we see it this session)
  if (myVisibleEntry && tabKey && _lbPrevRank(tabKey) === null) {
    // do not overwrite if already set this session — only record once per session
  }
  const anyMyEntry = myVisibleEntry || myFullEntry;
  if (anyMyEntry && tabKey) _lbRecordRank(tabKey, anyMyEntry.rank);

  // Wire country filter toggle
  const cfEl = container.querySelector('.lb-country-filter');
  if (cfEl) {
    cfEl.addEventListener('change', function() {
      // rebuild with filter toggled
      _doRenderLeaderboard(container);
    });
  }

  // Wire load-more
  const lmBtn = container.querySelector('.lb-load-more-btn');
  if (lmBtn) {
    lmBtn.addEventListener('click', function() {
      _lbPaginationState.count += 25;
      _doRenderLeaderboard(container);
    });
  }
}

function _renderBattleLeaderboard(container, entries) {
  const myName = loadDisplayName().toLowerCase();

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No battle rankings yet.</div>';
    return;
  }

  let html = '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Rating</th><th>W/L/D</th>' +
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    const tier = (typeof getBattleRankTier === 'function') ? getBattleRankTier(e.rating || 0) : null;
    const tierBadge = tier
      ? '<span class="battle-rank-badge battle-rank-' + tier.cls + '" title="' + tier.name + '">' + tier.icon + '</span> '
      : '';
    let nameCell = tierBadge + _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
    const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + (e.rating || 0) + '</td>' +
      '<td class="lb-wld">' + wld + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Render the season battle-rating leaderboard.
 * data: { seasonName, entries: [{rank, displayName, rating, wins, losses, draws}],
 *         playerEntry: {rank, displayName, rating, wins, losses, draws} | null }
 */
function _renderSeasonRatingLeaderboard(container, data) {
  const myName = loadDisplayName().toLowerCase();
  const entries = data.entries || [];
  const seasonName = data.seasonName || 'Current Season';
  const playerEntry = data.playerEntry || null;

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No season rating entries yet for ' + _escHtml(seasonName) + '.</div>';
    return;
  }

  let html = '<div class="lb-season-rating-header">' + _escHtml(seasonName) + ' — Rating Standings</div>';
  html += '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Rating</th><th>W/L/D</th><th>Win%</th>' +
    '</tr></thead><tbody>';

  // Check if player is in the top-100 list
  let myRankInList = -1;
  entries.forEach(function(e, i) {
    if (myName && e.displayName.toLowerCase() === myName) myRankInList = i;
  });

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    const tier = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(e.rating || 0) : null;
    const tierBadge = tier
      ? '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + '">' + tier.name + '</span> '
      : '';
    const total = (e.wins || 0) + (e.losses || 0) + (e.draws || 0);
    const winPct = total > 0 ? Math.round((e.wins || 0) / total * 100) + '%' : '-';
    const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
    let nameCell = tierBadge + _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + (e.rating || 0) + '</td>' +
      '<td class="lb-wld">' + wld + '</td>' +
      '<td>' + winPct + '</td>' +
      '</tr>';
  });

  // If player is outside top-100, pin their row at the bottom
  if (myName && myRankInList < 0 && playerEntry && playerEntry.rank != null) {
    const e = playerEntry;
    const tier = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(e.rating || 0) : null;
    const tierBadge = tier
      ? '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + '">' + tier.name + '</span> '
      : '';
    const total = (e.wins || 0) + (e.losses || 0) + (e.draws || 0);
    const winPct = total > 0 ? Math.round((e.wins || 0) / total * 100) + '%' : '-';
    const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
    html += '<tr class="lb-row-me lb-row-me-pinned">' +
      '<td>' + e.rank + '</td>' +
      '<td>' + tierBadge + _escHtml(e.displayName || loadDisplayName()) + ' &#9668;</td>' +
      '<td>' + (e.rating || 0) + '</td>' +
      '<td class="lb-wld">' + wld + '</td>' +
      '<td>' + winPct + '</td>' +
      '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// Mastery tier icons — must match mastery.js MASTERY_TIER_ICONS
const _MASTERY_TIER_ICONS = { bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎', obsidian: '⬛' };
const _MASTERY_TIER_COLORS = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', diamond: '#b9f2ff', obsidian: '#7c3aed' };
const _MASTERY_MODE_LABELS = ['classic', 'sprint', 'blitz', 'daily', 'survival', 'battle', 'expedition', 'depths'];

function _masteryTierIcon(tierNum) {
  var names = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'];
  var name = names[tierNum - 1];
  if (!name) return '<span class="mastery-icon mastery-icon-none" title="None">&#8226;</span>';
  var color = _MASTERY_TIER_COLORS[name] || '#fff';
  var icon  = _MASTERY_TIER_ICONS[name] || '?';
  return '<span class="mastery-icon" title="' + name.charAt(0).toUpperCase() + name.slice(1) + '" style="color:' + color + '">' + icon + '</span>';
}

function _renderMasteryLeaderboard(container, entries, ownEntry) {
  const myName = loadDisplayName().toLowerCase();

  if (!entries || !entries.length) {
    container.innerHTML = '<div class="lb-empty">No mastery rankings yet. Unlock mastery tiers to appear here!</div>';
    return;
  }

  var modeHeaders = _MASTERY_MODE_LABELS.map(function(m) {
    return '<th title="' + m + '">' + m.slice(0, 3).toUpperCase() + '</th>';
  }).join('');

  var html = '<div class="lb-mastery-header">Global Mastery Rankings — Max Score: 40</div>' +
    '<table class="lb-table lb-mastery-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Score</th>' + modeHeaders +
    '</tr></thead><tbody>';

  var myInTop = false;

  entries.forEach(function(e) {
    var isMe = myName && e.displayName.toLowerCase() === myName;
    if (isMe) myInTop = true;
    var cls = isMe ? ' class="lb-row-me"' : '';
    var nameCell = _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
    var tierCells = _MASTERY_MODE_LABELS.map(function(m) {
      var t = (e.tiers && e.tiers[m]) ? parseInt(e.tiers[m], 10) : 0;
      return '<td>' + (t > 0 ? _masteryTierIcon(t) : '<span class="mastery-icon mastery-icon-none">&#8226;</span>') + '</td>';
    }).join('');
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td class="mastery-score">' + (e.totalScore || 0) + '</td>' +
      tierCells +
      '</tr>';
  });

  // Pin own row at bottom if not in top 100
  if (!myInTop && ownEntry && ownEntry.rank != null) {
    var e = ownEntry;
    var tierCells = _MASTERY_MODE_LABELS.map(function(m) {
      var t = (e.tiers && e.tiers[m]) ? parseInt(e.tiers[m], 10) : 0;
      return '<td>' + (t > 0 ? _masteryTierIcon(t) : '<span class="mastery-icon mastery-icon-none">&#8226;</span>') + '</td>';
    }).join('');
    html += '<tr class="lb-row-me lb-row-me-pinned">' +
      '<td>' + e.rank + '</td>' +
      '<td>' + _escHtml(e.displayName || loadDisplayName()) + ' &#9668;</td>' +
      '<td class="mastery-score">' + (e.totalScore || 0) + '</td>' +
      tierCells +
      '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const _COOP_DIFF_BADGE = {
  casual:    { label: 'Casual',    cls: 'lb-diff-casual' },
  normal:    { label: 'Normal',    cls: 'lb-diff-normal' },
  challenge: { label: 'Challenge', cls: 'lb-diff-challenge' },
};

function _renderCoopLeaderboard(container, entries, label) {
  const myName = loadDisplayName().toLowerCase();

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No co-op scores yet for ' + _escHtml(label) + '.</div>';
    return;
  }

  let html = '<div class="lb-coop-label">' + _escHtml(label) + '</div>' +
    '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Player 1</th><th>Player 2</th><th>Score</th><th>Mode</th>' +
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    const isMe = myName && (
      e.player1.toLowerCase() === myName || e.player2.toLowerCase() === myName
    );
    const cls = isMe ? ' class="lb-row-me"' : '';
    const p1 = _escHtml(e.player1) + (e.player1.toLowerCase() === myName ? ' ◀' : '');
    const p2 = _escHtml(e.player2) + (e.player2.toLowerCase() === myName ? ' ◀' : '');
    const scoreVal = (e.score || 0).toLocaleString();
    const diff = _COOP_DIFF_BADGE[e.difficulty] || { label: e.difficulty || '?', cls: 'lb-diff-normal' };
    const badge = '<span class="lb-diff-badge ' + diff.cls + '">' + diff.label + '</span>';
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + p1 + '</td>' +
      '<td>' + p2 + '</td>' +
      '<td>' + scoreVal + '</td>' +
      '<td>' + badge + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Submit Button (game-over screen) ─────────────────────────────────────────

/**
 * Wire up the "Submit to Leaderboard" button on the game-over screen.
 * Call from triggerGameOver() when isDailyChallenge is true.
 */
function initLeaderboardSubmitBtn(score, linesCleared) {
  const btn      = document.getElementById('lb-submit-btn');
  const feedback = document.getElementById('lb-submit-feedback');
  if (!btn) return;

  // Only show for daily challenge
  btn.style.display = 'inline-block';

  if (hasSubmittedToday()) {
    btn.textContent  = 'Already Submitted';
    btn.disabled     = true;
    if (feedback) feedback.textContent = '';
    return;
  }

  btn.textContent = 'Submit to Leaderboard';
  btn.disabled    = false;

  btn.onclick = function () {
    const name = loadDisplayName();
    if (!name) {
      openDisplayNameModal(function(confirmedName) {
        _doSubmit(confirmedName, score, linesCleared, btn, feedback);
      });
    } else {
      _doSubmit(name, score, linesCleared, btn, feedback);
    }
  };
}

async function _doSubmit(name, score, linesCleared, btn, feedback) {
  btn.disabled    = true;
  btn.textContent = 'Submitting...';
  if (feedback) feedback.textContent = '';

  try {
    const result = await apiSubmitScore(name, score, linesCleared);
    if (result.ok) {
      markSubmittedToday();
      btn.textContent = 'Submitted!';
      if (feedback) {
        feedback.textContent = 'Rank #' + result.rank + ' of ' + result.total;
        feedback.className   = 'lb-submit-feedback lb-submit-ok';
      }
    } else {
      const msg = result.error || 'Submission failed';
      btn.disabled    = false;
      btn.textContent = 'Submit to Leaderboard';
      if (feedback) {
        feedback.textContent = msg;
        feedback.className   = 'lb-submit-feedback lb-submit-err';
      }
      // If already submitted from another device:
      if (result.error === 'Already submitted today') {
        markSubmittedToday();
        btn.textContent = 'Already Submitted';
        btn.disabled    = true;
      }
    }
  } catch (_) {
    btn.disabled    = false;
    btn.textContent = 'Submit to Leaderboard';
    if (feedback) {
      feedback.textContent = 'Network error — try again';
      feedback.className   = 'lb-submit-feedback lb-submit-err';
    }
  }
}

// ── Hide submit button when not in daily mode ─────────────────────────────────

function hideLeaderboardSubmitBtn() {
  const btn      = document.getElementById('lb-submit-btn');
  const feedback = document.getElementById('lb-submit-feedback');
  if (btn)      btn.style.display = 'none';
  if (feedback) feedback.textContent = '';
}

// ── Init (called once from main.js / init()) ──────────────────────────────────

function initLeaderboard() {
  // Leaderboard panel close button
  const closeBtn = document.getElementById('lb-panel-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeLeaderboardPanel);

  // Leaderboard panel tab buttons
  const todayBtn    = document.getElementById('lb-tab-today');
  const yestBtn     = document.getElementById('lb-tab-yesterday');
  const thisWeekBtn = document.getElementById('lb-tab-thisweek');
  const lastWeekBtn = document.getElementById('lb-tab-lastweek');
  if (todayBtn) {
    todayBtn.addEventListener('click', function() {
      _lbActiveTab = 'today';
      _syncLbTabs();
      _loadLbTab('today');
    });
  }
  if (yestBtn) {
    yestBtn.addEventListener('click', function() {
      _lbActiveTab = 'yesterday';
      _syncLbTabs();
      _loadLbTab('yesterday');
    });
  }
  if (thisWeekBtn) {
    thisWeekBtn.addEventListener('click', function() {
      _lbActiveTab = 'thisweek';
      _syncLbTabs();
      _loadLbTab('thisweek');
    });
  }
  if (lastWeekBtn) {
    lastWeekBtn.addEventListener('click', function() {
      _lbActiveTab = 'lastweek';
      _syncLbTabs();
      _loadLbTab('lastweek');
    });
  }

  const seasonBtn = document.getElementById('lb-tab-season');
  if (seasonBtn) {
    seasonBtn.addEventListener('click', function() {
      _lbActiveTab = 'season';
      _syncLbTabs();
      _loadLbTab('season');
    });
  }

  const seasonRatingTabBtn = document.getElementById('lb-tab-seasonrating');
  if (seasonRatingTabBtn) {
    seasonRatingTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'seasonrating';
      _syncLbTabs();
      _loadLbTab('seasonrating');
    });
  }

  const coopTabBtn = document.getElementById('lb-tab-coop');
  if (coopTabBtn) {
    coopTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'coop';
      _syncLbTabs();
      _loadLbTab('coop');
    });
  }

  const dailyCoopTabBtn = document.getElementById('lb-tab-dailycoop');
  if (dailyCoopTabBtn) {
    dailyCoopTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'dailycoop';
      _syncLbTabs();
      _loadLbTab('dailycoop');
    });
  }

  const battleTabBtn = document.getElementById('lb-tab-battle');
  if (battleTabBtn) {
    battleTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'battle';
      _syncLbTabs();
      _loadLbTab('battle');
    });
  }

  const masteryTabBtn = document.getElementById('lb-tab-mastery');
  if (masteryTabBtn) {
    masteryTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'mastery';
      _syncLbTabs();
      _loadLbTab('mastery');
    });
  }

  const modesTabBtn = document.getElementById('lb-tab-modes');
  if (modesTabBtn) {
    modesTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'modes';
      _syncLbTabs();
      _loadLbTab('modes');
    });
  }

  const friendsTabBtn = document.getElementById('lb-tab-friends');
  if (friendsTabBtn) {
    friendsTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'friends';
      _syncLbTabs();
      _loadLbTab('friends');
    });
  }

  // Leaderboard panel refresh button
  const refreshBtn = document.getElementById('lb-panel-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      _loadLbTab(_lbActiveTab);
    });
  }

  // Per-mode leaderboard buttons on mode cards (delegated)
  const modeCards = document.getElementById('mode-cards');
  if (modeCards) {
    modeCards.addEventListener('click', function(e) {
      var btn = e.target.closest('.mode-card-lb-btn');
      if (!btn) return;
      e.stopPropagation(); // don't trigger mode card click
      var tab = btn.getAttribute('data-lb-tab') || 'today';
      // Mode-specific tabs route through the Modes tab
      if (tab === 'depths' || tab === 'classic' || tab === 'sprint' || tab === 'blitz' || tab === 'marathon') {
        _lbActiveModeTab = tab;
        openLeaderboardPanel('modes');
      } else {
        openLeaderboardPanel(tab);
      }
    });
  }

  // Leaderboard button on game-over screen — open weekly tab if in weekly mode
  const goLbBtn = document.getElementById('go-lb-btn');
  if (goLbBtn) {
    goLbBtn.addEventListener('click', function () {
      openLeaderboardPanel(isWeeklyChallenge ? 'thisweek' : 'today');
    });
  }

  // Co-op leaderboard button on coop game-over screen
  const coopGoLbBtn = document.getElementById('coop-go-lb-btn');
  if (coopGoLbBtn) {
    coopGoLbBtn.addEventListener('click', function () {
      openLeaderboardPanel(isDailyCoopChallenge ? 'dailycoop' : 'coop');
    });
  }

  // Hide submit btn by default (shown only by initLeaderboardSubmitBtn)
  hideLeaderboardSubmitBtn();

  // Hall of Fame button (opens the HoF overlay)
  const hofBtn = document.getElementById('hof-open-btn');
  if (hofBtn) {
    hofBtn.addEventListener('click', openHallOfFamePanel);
  }

  // Hall of Fame close button
  const hofCloseBtn = document.getElementById('hof-close-btn');
  if (hofCloseBtn) {
    hofCloseBtn.addEventListener('click', closeHallOfFamePanel);
  }

  // Escape closes the leaderboard panel
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const lbOverlay = document.getElementById('lb-panel-overlay');
    if (!lbOverlay || lbOverlay.style.display === 'none') return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeLeaderboardPanel();
      return;
    }

    // Left/right arrow keys move between tabs
    const lbTabsEl = document.getElementById('lb-tabs');
    if (!lbTabsEl) return;
    const tabs = Array.from(lbTabsEl.querySelectorAll('.lb-tab'));
    const activeIdx = tabs.findIndex(function (t) { return t.classList.contains('lb-tab-active'); });
    if (activeIdx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight'
      ? (activeIdx + 1) % tabs.length
      : (activeIdx - 1 + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  });
}

// ── Hall of Fame ──────────────────────────────────────────────────────────────

let _hofSeasons = null; // cached season list from hall-of-fame endpoint

async function openHallOfFamePanel() {
  const overlay = document.getElementById('hof-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  const body    = document.getElementById('hof-body');
  const select  = document.getElementById('hof-season-select');
  if (body) body.innerHTML = '<div class="lb-loading">Loading...</div>';

  try {
    if (!_hofSeasons) {
      const data = await apiFetchHallOfFame();
      _hofSeasons = (data && data.seasons) ? data.seasons : [];
    }

    if (!_hofSeasons.length) {
      if (body) body.innerHTML = '<div class="lb-empty">No past seasons yet.</div>';
      if (select) select.style.display = 'none';
      return;
    }

    // Populate dropdown
    if (select) {
      select.innerHTML = '';
      _hofSeasons.forEach(function(s) {
        const opt = document.createElement('option');
        opt.value = s.seasonId;
        opt.textContent = s.name + ' (' + (s.endDate || '') + ')';
        select.appendChild(opt);
      });
      select.style.display = 'block';
      select.onchange = function() {
        _loadHofSeason(select.value, body);
      };
    }

    // Load the first (most recent) season by default
    _loadHofSeason(_hofSeasons[0].seasonId, body);
  } catch (_) {
    if (body) body.innerHTML = '<div class="lb-error">Could not load Hall of Fame.</div>';
  }
}

async function _loadHofSeason(seasonId, body) {
  if (!body) return;
  body.innerHTML = '<div class="lb-loading">Loading...</div>';
  try {
    const snapshot = await apiFetchSeasonRatingSnapshot(seasonId);
    if (!snapshot || !snapshot.top100) {
      body.innerHTML = '<div class="lb-empty">No data for this season.</div>';
      return;
    }

    const myName = loadDisplayName().toLowerCase();
    const entries = snapshot.top100.slice(0, 10); // Top 10 for Hall of Fame display
    const accent = { overworld: '#4A90D9', nether: '#CC3300', end: '#7B2FBE', deep_dark: '#00CED1' };
    const borderColor = accent[snapshot.theme] || '#00ff88';

    let html = '<div class="hof-season-title" style="--hof-accent:' + borderColor + '">' +
      _escHtml(snapshot.name || '') +
      '<span class="hof-season-date"> — ' + _escHtml(snapshot.endDate || '') + '</span>' +
      '</div>';
    html += '<table class="lb-table"><thead><tr>' +
      '<th>#</th><th>Champion</th><th>Rating</th><th>W/L/D</th>' +
      '</tr></thead><tbody>';

    entries.forEach(function(e) {
      const isMe = myName && e.displayName.toLowerCase() === myName;
      const cls  = isMe ? ' class="lb-row-me"' : '';
      const tier = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(e.rating || 0) : null;
      const tierBadge = tier
        ? '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + '">' + tier.name + '</span> '
        : '';
      const championIcon = e.rank === 1 ? '<span class="hof-champion-icon" title="Season Champion">&#127942;</span> ' : '';
      const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
      let nameCell = championIcon + tierBadge + _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
      html += '<tr' + cls + '>' +
        '<td>' + e.rank + '</td>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + (e.rating || 0) + '</td>' +
        '<td class="lb-wld">' + wld + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (_) {
    body.innerHTML = '<div class="lb-error">Could not load season data.</div>';
  }
}

function closeHallOfFamePanel() {
  const overlay = document.getElementById('hof-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Per-Mode Leaderboard ──────────────────────────────────────────────────────

// Mode sub-tab state (persists across range toggles)
let _lbActiveModeTab = 'classic'; // 'classic' | 'sprint' | 'blitz' | 'depths' | 'marathon'
let _lbModeRange = 'weekly';      // 'weekly' | 'alltime'

const _MODE_LB_CONFIG = {
  classic:  { label: 'Classic',   icon: '\u26cf\ufe0f',   scoreLabel: 'Score',   sortAsc: false },
  sprint:   { label: 'Sprint',    icon: '\u26a1',          scoreLabel: 'Time',    sortAsc: true  },
  blitz:    { label: 'Blitz',     icon: '\u23f1',          scoreLabel: 'Score',   sortAsc: false },
  marathon: { label: 'Marathon',  icon: '\u267E\ufe0f',    scoreLabel: 'Level',   sortAsc: false },
  endless:  { label: 'Endless',   icon: '\u221e',          scoreLabel: 'Score',   sortAsc: false },
  depths:   { label: 'Depths',    icon: '\u{1F573}\ufe0f', scoreLabel: 'Score',   sortAsc: false },
  ultra:    { label: 'Ultra',     icon: '\u{1F525}',       scoreLabel: 'Score',   sortAsc: false },
  survival: { label: 'Survival',  icon: '\u2764',          scoreLabel: 'Score',   sortAsc: false },
  daily:    { label: 'Daily',     icon: '\ud83d\udcc5',    scoreLabel: 'Score',   sortAsc: false },
  puzzle:   { label: 'Puzzle',    icon: '\ud83e\udde9',    scoreLabel: 'Score',   sortAsc: false },
};

async function apiSubmitModeScore(displayName, mode, score, linesCleared) {
  const week      = typeof getWeeklyDateString === 'function' ? getWeeklyDateString() : null;
  const timestamp = Date.now();
  const replay    = typeof replayConsumeSubmissionData === 'function' ? replayConsumeSubmissionData() : null;
  const signature = replay ? await _buildReplaySignature(replay.pieceIndices, score, linesCleared, timestamp) : null;
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/scores/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName, mode, score, linesCleared, week, clientTimestamp: timestamp,
      replay:    replay    || undefined,
      signature: signature || undefined,
    }),
  });
  return resp.json();
}

async function apiFetchModeLeaderboard(mode, range, displayName) {
  const week = typeof getWeeklyDateString === 'function' ? getWeeklyDateString() : null;
  let url = LEADERBOARD_WORKER_URL + '/api/leaderboard/mode/' + mode + '?range=' + range;
  if (range === 'weekly' && week) url += '&week=' + encodeURIComponent(week);
  if (displayName) url += '&displayName=' + encodeURIComponent(displayName);
  const resp = await fetch(url);
  return resp.json();
}

/**
 * Attempt to submit a per-mode score silently (no UI feedback needed).
 * Called from game-over handlers. Skips if no display name is set.
 */
function trySubmitModeScore(mode, score, linesCleared) {
  const name = loadDisplayName();
  if (!name) return;
  apiSubmitModeScore(name, mode, score, linesCleared || 0).catch(function() {});
}

function _renderModeLeaderboard(container, data, mode, range) {
  const cfg = _MODE_LB_CONFIG[mode] || _MODE_LB_CONFIG.classic;
  const entries = data.entries || [];
  const ownEntry = data.ownEntry || null;
  const myName = loadDisplayName().toLowerCase();

  // ── Mode sub-tabs ─────────────────────────────────────────────────────────
  let html = '<div class="lb-mode-header">';

  // Mode selector
  html += '<div class="lb-mode-tabs">';
  Object.keys(_MODE_LB_CONFIG).forEach(function(mId) {
    const mc = _MODE_LB_CONFIG[mId];
    const active = mId === mode ? ' lb-mode-tab-active' : '';
    html += '<button class="lb-mode-tab' + active + '" data-mode="' + mId + '">' +
      mc.label + '</button>';
  });
  html += '</div>';

  // Time range toggle: Today / Weekly / Monthly / All-Time
  html += '<div class="lb-mode-range-toggle">' +
    '<button class="lb-mode-range-btn' + (range === 'today'   ? ' lb-mode-range-active' : '') + '" data-range="today">Today</button>' +
    '<button class="lb-mode-range-btn' + (range === 'weekly'  ? ' lb-mode-range-active' : '') + '" data-range="weekly">Weekly</button>' +
    '<button class="lb-mode-range-btn' + (range === 'monthly' ? ' lb-mode-range-active' : '') + '" data-range="monthly">Monthly</button>' +
    '<button class="lb-mode-range-btn' + (range === 'alltime' ? ' lb-mode-range-active' : '') + '" data-range="alltime">All-Time</button>' +
    '</div>';

  html += '</div>'; // lb-mode-header

  // ── Personal best ─────────────────────────────────────────────────────────
  if (ownEntry) {
    const pbScore = cfg.sortAsc
      ? (typeof fmtSprintTime === 'function' && mode === 'sprint' ? fmtSprintTime(ownEntry.score) : ownEntry.score)
      : (ownEntry.score || 0).toLocaleString();
    const rankTxt = ownEntry.rank ? '#' + ownEntry.rank : 'unranked';
    html += '<div class="lb-mode-own-entry">Your best: <strong>' + _escHtml(pbScore + '') + '</strong> &mdash; ' + rankTxt + '</div>';
  } else {
    // Try to show local PB even if not on leaderboard
    let localPb = null;
    if (mode === 'sprint') {
      try {
        const raw = localStorage.getItem('mineCtris_sprintBest');
        if (raw) { const pb = JSON.parse(raw); localPb = typeof fmtSprintTime === 'function' ? fmtSprintTime(pb.timeMs) : pb.timeMs + 'ms'; }
      } catch (_) {}
    } else if (mode === 'blitz') {
      try {
        const raw = localStorage.getItem('mineCtris_blitzBest');
        if (raw) { const pb = JSON.parse(raw); localPb = (pb.score || 0).toLocaleString(); }
      } catch (_) {}
    }
    if (localPb) {
      html += '<div class="lb-mode-own-entry">Your best (local): <strong>' + _escHtml(localPb + '') + '</strong></div>';
    }
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  if (!entries.length) {
    html += '<div class="lb-empty">No scores yet. Be the first!</div>';
    container.innerHTML = html;
    _attachModeTabListeners(container, mode, range);
    return;
  }

  const col2Label = cfg.sortAsc ? 'Lines' : 'Lines';

  html += '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>' + cfg.scoreLabel + '</th><th>Lines</th>';
  if (range === 'weekly') html += '<th>\u0394</th>';
  html += '</tr></thead><tbody>';

  const _myLevel = (function() {
    if (typeof getLevelFromXP !== 'function' || typeof loadLifetimeStats !== 'function') return 1;
    return getLevelFromXP(loadLifetimeStats().playerXP || 0);
  })();
  const _myTitle = typeof getLevelTitle === 'function' ? getLevelTitle(_myLevel) : '';

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';

    // Score formatting
    let scoreStr;
    if (cfg.sortAsc && mode === 'sprint') {
      scoreStr = typeof fmtSprintTime === 'function' ? fmtSprintTime(e.score) : e.score + 'ms';
    } else {
      scoreStr = (e.score || 0).toLocaleString();
    }

    // Name cell
    let nameCell = _escHtml(e.displayName);
    if (isMe) {
      const _prestigeHtml = typeof getPrestigeStarsHtml === 'function' ? getPrestigeStarsHtml() : '';
      if (_prestigeHtml) nameCell = _prestigeHtml + ' ' + nameCell;
      const badgeLabel = typeof getLevelBadgeLabel === 'function' ? getLevelBadgeLabel(_myLevel) : 'L' + _myLevel;
      nameCell += ' <span class="lb-level-badge">' + badgeLabel + '</span>';
      if (_myTitle) nameCell += ' <span class="lb-level-title">' + _myTitle + '</span>';
      nameCell += _lbTrendHtml('mode:' + mode + ':' + range, e.rank);
      nameCell += ' \u25c4';
    }

    // Rank change column (weekly only)
    let changeCell = '';
    if (range === 'weekly') {
      if (e.rankChange == null) {
        changeCell = '<td class="lb-rank-new" title="New entry this week">new</td>';
      } else if (e.rankChange > 0) {
        changeCell = '<td class="lb-rank-up" title="Up ' + e.rankChange + '">\u2191' + e.rankChange + '</td>';
      } else if (e.rankChange < 0) {
        changeCell = '<td class="lb-rank-down" title="Down ' + Math.abs(e.rankChange) + '">\u2193' + Math.abs(e.rankChange) + '</td>';
      } else {
        changeCell = '<td class="lb-rank-same">&ndash;</td>';
      }
    }

    const _modeVerifiedBadge = e.verified
      ? '<span class="lb-verified-badge" title="Score verified by server replay check">\u2714</span> '
      : '';
    html += '<tr' + cls + '>' +
      '<td>' + _lbRankBadge(e.rank) + '</td>' +
      '<td>' + _modeVerifiedBadge + nameCell + '</td>' +
      '<td>' + _escHtml(scoreStr) + '</td>' +
      '<td>' + (e.linesCleared != null ? e.linesCleared : '-') + '</td>' +
      changeCell +
      '</tr>';
  });

  html += '</tbody></table>';

  // Pinned own-row if player is outside top 100
  if (myName && ownEntry && ownEntry.rank && !entries.find(function(e) { return e.displayName.toLowerCase() === myName; })) {
    let pbStr = cfg.sortAsc && mode === 'sprint'
      ? (typeof fmtSprintTime === 'function' ? fmtSprintTime(ownEntry.score) : ownEntry.score + 'ms')
      : (ownEntry.score || 0).toLocaleString();
    html += '<div class="lb-mode-own-entry lb-mode-own-entry-pinned">You \u2014 Rank #' + ownEntry.rank + ' &mdash; ' + _escHtml(pbStr + '') + '</div>';
  }

  container.innerHTML = html;
  _attachModeTabListeners(container, mode, range);

  // Record rank for trend tracking
  const modeTabKey = 'mode:' + mode + ':' + range;
  const myModeEntry = entries.find(function(e) { return myName && e.displayName.toLowerCase() === myName; })
    || (ownEntry && ownEntry.rank != null ? ownEntry : null);
  if (myModeEntry) _lbRecordRank(modeTabKey, myModeEntry.rank);
}

function _attachModeTabListeners(container, currentMode, currentRange) {
  // Mode sub-tab clicks
  container.querySelectorAll('.lb-mode-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _lbActiveModeTab = btn.getAttribute('data-mode') || 'classic';
      _loadLbTab('modes');
    });
  });
  // Range toggle clicks
  container.querySelectorAll('.lb-mode-range-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _lbModeRange = btn.getAttribute('data-range') || 'weekly';
      _lbCacheSet('modes:' + _lbActiveModeTab + ':' + _lbModeRange, null); // bust cache for new range
      _loadLbTab('modes');
    });
  });
}

// ── Friends Leaderboard ───────────────────────────────────────────────────────

async function _loadFriendsTab(container) {
  // Get friend display names from the friends system
  const friendList = (typeof friendsGetList === 'function') ? friendsGetList() : [];
  const myName = loadDisplayName();

  if (!myName) {
    container.innerHTML = '<div class="lb-empty">Set your leaderboard name in Settings to use the Friends leaderboard.</div>';
    return;
  }

  if (!friendList.length) {
    container.innerHTML = '<div class="lb-empty">You have no friends added yet. Use the Friends panel to add friends by code.</div>';
    return;
  }

  // Collect all display names to filter for (friends + yourself)
  const friendNames = friendList
    .map(function(f) { return (f.name || '').toLowerCase(); })
    .filter(Boolean);
  if (myName) friendNames.push(myName.toLowerCase());

  // Fetch today's leaderboard (best option for friends since scores are submitted there)
  const date = getDailyDateString();
  let entries;
  try {
    const data = await _lbCachedFetch('daily:' + date, function() { return apiFetchLeaderboard(date); });
    entries = (data && data.entries) ? data.entries : [];
  } catch (_) {
    container.innerHTML = '<div class="lb-error">Could not load friend scores.</div>';
    return;
  }

  // Filter to only friends (and self)
  const filtered = entries.filter(function(e) {
    return friendNames.indexOf(e.displayName.toLowerCase()) !== -1;
  });

  if (!filtered.length) {
    container.innerHTML = '<div class="lb-empty">None of your friends have submitted a score today yet.</div>';
    return;
  }

  // Re-rank within friends scope
  const reranked = filtered.map(function(e, i) {
    return Object.assign({}, e, { friendRank: i + 1 });
  });

  _renderFriendsLeaderboard(container, reranked, date);
}

function _renderFriendsLeaderboard(container, entries, date) {
  const myName = loadDisplayName().toLowerCase();
  const dateLabel = date ? formatDailyLabel(date) : '';

  let html = '<div class="lb-friends-header">\ud83d\udc65 Friends — ' + _escHtml(dateLabel) + '</div>';
  html += '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Score</th><th>Lines</th>' +
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    let nameCell = _escHtml(e.displayName);
    if (isMe) nameCell += ' \u25c4';
    html += '<tr' + cls + '>' +
      '<td>' + _lbRankBadge(e.friendRank) + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + (e.score || 0).toLocaleString() + '</td>' +
      '<td>' + (e.linesCleared != null ? e.linesCleared : '-') + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  html += '<div class="lb-friends-note">Showing today\'s daily scores for friends on your list.</div>';
  container.innerHTML = html;
}
