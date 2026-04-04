// Seasonal Events system — quarterly 2-week themed events with unique modifiers,
// event-exclusive cosmetics, and community goal tie-in.
//
// Requires: guild.js (for GUILD_API), community-goals.js (for ticker refresh),
//           cosmetics.js (for seasonal cosmetic unlock checks)

// ── API endpoint ──────────────────────────────────────────────────────────────

const SE_API = typeof GUILD_API !== 'undefined' ? GUILD_API : 'https://minectris-leaderboard.workers.dev';

// ── State ─────────────────────────────────────────────────────────────────────

let _seCache       = null;   // cached event data from server
let _seFetchedAt   = 0;      // timestamp of last fetch (ms)
let _seTickerInterval = null;
let _seSessionVoidAdjacentMined = 0; // reset per game session

const SE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── API helpers ───────────────────────────────────────────────────────────────

async function _seFetch(path, options = {}) {
  try {
    const res  = await fetch(SE_API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (_) {
    return { ok: false, data: {} };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch and cache the current seasonal event.
 * Returns event data or { active: false }.
 */
async function fetchSeasonalEvent() {
  const now = Date.now();
  if (_seCache && (now - _seFetchedAt) < SE_CACHE_TTL_MS) return _seCache;

  const { ok, data } = await _seFetch('/api/seasonal-events/current');
  if (!ok) return { active: false };

  _seCache    = data;
  _seFetchedAt = now;
  return data;
}

/**
 * Returns the cached seasonal event synchronously (may be stale / null).
 * Safe to call from pieces.js or other hot paths.
 */
function getActiveSeasonalEvent() {
  return (_seCache && _seCache.active) ? _seCache : null;
}

/**
 * Returns the void block multiplier from the active event (1 = normal, no event).
 */
function getSeasonalVoidBlockMult() {
  const ev = getActiveSeasonalEvent();
  if (!ev || !ev.modifiers) return 1;
  return ev.modifiers.voidBlockMult || 1;
}

/**
 * Track a void-adjacent block mined this session.
 * Call whenever a non-void block adjacent to a void block is removed.
 */
function recordVoidAdjacentMined() {
  _seSessionVoidAdjacentMined++;
}

/**
 * Reset session void-adjacent counter (call on game reset).
 */
function resetSeasonalSessionStats() {
  _seSessionVoidAdjacentMined = 0;
}

/**
 * Submit this session's void-adjacent mining contribution to the community goal.
 * Call at game end alongside submitCommunityGoalContribution.
 */
async function submitSeasonalEventProgress() {
  const ev = getActiveSeasonalEvent();
  if (!ev || !_seSessionVoidAdjacentMined) return null;

  const displayName = typeof loadDisplayName === 'function' ? loadDisplayName() : '';
  const { ok, data } = await _seFetch('/api/seasonal-events/progress', {
    method: 'POST',
    body:   JSON.stringify({
      voidAdjacentMined: _seSessionVoidAdjacentMined,
      displayName,
    }),
  });

  if (ok) {
    // Update cached progress
    if (_seCache) {
      _seCache.progress = data.progress;
      _seCache.pct      = data.pct;
    }
    _refreshSeEventTicker();
  }

  // Reset for next session
  _seSessionVoidAdjacentMined = 0;
  return ok ? data : null;
}

// ── Void-Adjacent Mining Detection ───────────────────────────────────────────

/**
 * Check whether the given grid position is adjacent to any landed void block.
 * Call when a block is mined and the seasonal event is active.
 * @param {{ x: number, y: number, z: number }} gp  grid position of mined block
 * @returns {boolean}
 */
function isAdjacentToVoid(gp) {
  if (typeof worldGroup === 'undefined' || !worldGroup) return false;

  const offsets = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0,  y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0,  y:  0, z: -1 },
  ];

  for (let i = 0; i < worldGroup.children.length; i++) {
    const obj = worldGroup.children[i];
    if (obj.name !== 'landed_block' || !obj.userData.gridPos) continue;
    if (!obj.userData.isVoid) continue;

    const op = obj.userData.gridPos;
    for (const off of offsets) {
      if (op.x === gp.x + off.x &&
          Math.abs(op.y - (gp.y + off.y)) < 0.1 &&
          op.z === gp.z + off.z) {
        return true;
      }
    }
  }
  return false;
}

// ── Visual World Tint (Corruption Spreads) ────────────────────────────────────

let _seOverlayEl    = null;
let _seOverlayRafId = null;

/**
 * Apply or update the corruption world tint overlay.
 * Purple-to-clean gradient based on event progress pct (0 = max corruption, 100 = clean).
 */
function updateSeasonalWorldTint() {
  const ev = getActiveSeasonalEvent();
  if (!_seOverlayEl) return;

  if (!ev || !ev.active) {
    _seOverlayEl.style.display = 'none';
    return;
  }

  const progress = ev.pct || 0;
  // Opacity: 0.18 at 0%, fades to 0 at 100%
  const opacity = 0.18 * Math.max(0, (1 - progress / 100));
  if (opacity < 0.005) {
    _seOverlayEl.style.display = 'none';
    return;
  }
  _seOverlayEl.style.background = `rgba(80, 0, 120, ${opacity.toFixed(3)})`;
  _seOverlayEl.style.display    = 'block';
}

// ── HUD Ticker ────────────────────────────────────────────────────────────────

function _seProgressBar(pct) {
  return `<div class="se-ticker-bar-wrap">` +
    `<div class="se-ticker-bar-fill" style="width:${pct}%"></div>` +
    `</div>`;
}

async function _refreshSeEventTicker() {
  const el = document.getElementById('se-ticker');
  if (!el) return;

  const ev = _seCache && _seCache.active ? _seCache : await fetchSeasonalEvent();
  if (!ev || !ev.active) {
    el.style.display = 'none';
    updateSeasonalWorldTint();
    return;
  }

  const pct = ev.pct || 0;
  const progress    = ev.progress || 0;
  const target      = ev.communityGoal ? ev.communityGoal.target : 1000000;
  const displayProg = _seFormatNum(progress) + ' / ' + _seFormatNum(target);

  el.innerHTML =
    `<div class="se-ticker-inner">` +
      `<span class="se-ticker-label">☠ ${_seEsc(ev.name)}</span>` +
      `<span class="se-ticker-progress">${displayProg}</span>` +
      `<span class="se-ticker-pct">${pct}%</span>` +
      _seProgressBar(pct) +
      `<span class="se-ticker-players">👥 ${ev.activePlayerCount || 0}</span>` +
    `</div>`;
  el.style.display = 'block';

  updateSeasonalWorldTint();
}

function _seFormatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function _seEsc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Event Banner (mode-select screen) ────────────────────────────────────────

async function renderSeasonalEventBanner() {
  const bannerEl = document.getElementById('se-event-banner');
  if (!bannerEl) return;

  const ev = await fetchSeasonalEvent();
  if (!ev || !ev.active) {
    bannerEl.style.display = 'none';
    return;
  }

  // Compute days remaining
  const endDate      = new Date(ev.endDate + 'T23:59:59Z');
  const now          = new Date();
  const daysLeft     = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
  const daysStr      = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  const pct          = ev.pct || 0;
  const target       = ev.communityGoal ? ev.communityGoal.target : 1000000;
  const progressText = _seFormatNum(ev.progress || 0) + ' / ' + _seFormatNum(target);

  bannerEl.innerHTML =
    `<div class="se-banner-inner">` +
      `<div class="se-banner-left">` +
        `<span class="se-banner-icon">☠</span>` +
        `<div class="se-banner-text-wrap">` +
          `<span class="se-banner-label">SEASONAL EVENT</span>` +
          `<span class="se-banner-name">${_seEsc(ev.name)}</span>` +
          `<span class="se-banner-blurb">${_seEsc(ev.narrativeBlurb)}</span>` +
        `</div>` +
      `</div>` +
      `<div class="se-banner-right">` +
        `<div class="se-banner-days">${_seEsc(daysStr)}</div>` +
        `<div class="se-banner-goal-row">` +
          `<span class="se-banner-goal-label">COMMUNITY GOAL</span>` +
          `<span class="se-banner-goal-pct">${pct}%</span>` +
        `</div>` +
        `<div class="se-banner-goal-bar-wrap">` +
          `<div class="se-banner-goal-bar-fill" style="width:${pct}%"></div>` +
        `</div>` +
        `<span class="se-banner-goal-progress">${_seEsc(progressText)}</span>` +
        `<button class="se-banner-rewards-btn" onclick="showSeasonalEventCosmetics()">&#127873; Rewards</button>` +
      `</div>` +
    `</div>`;
  bannerEl.style.display = 'block';
}

// ── Cosmetics Showcase Panel ──────────────────────────────────────────────────

async function showSeasonalEventCosmetics() {
  const panelEl = document.getElementById('se-cosmetics-panel');
  if (!panelEl) return;

  const ev = getActiveSeasonalEvent() || await fetchSeasonalEvent();
  if (!ev || !ev.active || !ev.cosmetics || !ev.cosmetics.length) {
    panelEl.innerHTML =
      `<div class="se-cos-header">` +
        `<span>EVENT REWARDS</span>` +
        `<button class="se-cos-close" onclick="hideSeasonalEventCosmetics()">✕</button>` +
      `</div>` +
      `<div class="se-cos-empty">No rewards defined for this event.</div>`;
    panelEl.style.display = 'flex';
    return;
  }

  const rarityColors = { common: '#aaa', rare: '#4f9cf7', epic: '#b860f0', legendary: '#ffd700', seasonal: '#88ffcc' };

  const cosRows = ev.cosmetics.map(c => {
    const rc = rarityColors[c.rarity] || '#aaa';
    const rarityLabel = (c.rarity || 'seasonal').toUpperCase();
    return `<div class="se-cos-row">` +
      `<span class="se-cos-icon">${c.icon || '✦'}</span>` +
      `<div class="se-cos-info">` +
        `<span class="se-cos-name">${_seEsc(c.name)}</span>` +
        `<span class="se-cos-cat">${_seEsc(c.category || '')}</span>` +
        `<span class="se-cos-rarity" style="color:${rc}">${_seEsc(rarityLabel)}</span>` +
      `</div>` +
      `<span class="se-cos-tag">TIME-LIMITED</span>` +
    `</div>`;
  }).join('');

  panelEl.innerHTML =
    `<div class="se-cos-header">` +
      `<span>✦ EVENT REWARDS</span>` +
      `<button class="se-cos-close" onclick="hideSeasonalEventCosmetics()">✕</button>` +
    `</div>` +
    `<div class="se-cos-subtitle">These cosmetics are only available during <em>${_seEsc(ev.name)}</em>.<br>They will never return once the event ends.</div>` +
    `<div class="se-cos-list">${cosRows}</div>`;
  panelEl.style.display = 'flex';
}

function hideSeasonalEventCosmetics() {
  const panelEl = document.getElementById('se-cosmetics-panel');
  if (panelEl) panelEl.style.display = 'none';
}

// ── Unlock seasonal cosmetics ─────────────────────────────────────────────────

/**
 * Award all seasonal cosmetics from the active event to the player's unlocked set.
 * Call after a void-adjacent contribution is confirmed server-side.
 * Cosmetics are identified by their `id` field in the event's cosmetics array.
 */
function unlockSeasonalEventCosmetics() {
  const ev = getActiveSeasonalEvent();
  if (!ev || !ev.cosmetics || !ev.cosmetics.length) return;

  if (typeof loadUnlockedCosmetics !== 'function' ||
      typeof saveUnlockedCosmetics !== 'function') return;

  const unlocked = loadUnlockedCosmetics();
  let changed = false;
  for (const c of ev.cosmetics) {
    if (c.id && !unlocked.includes(c.id)) {
      unlocked.push(c.id);
      changed = true;
    }
  }
  if (changed) saveUnlockedCosmetics(unlocked);
}

// ── Init ──────────────────────────────────────────────────────────────────────

/**
 * Initialize the seasonal events system.
 * Call once after DOM is ready (from main.js or similar).
 */
async function initSeasonalEvents() {
  // Prepare overlay element
  _seOverlayEl = document.getElementById('se-world-overlay');

  await fetchSeasonalEvent();
  await renderSeasonalEventBanner();
  _refreshSeEventTicker();

  // Refresh ticker every 5 minutes
  if (_seTickerInterval) clearInterval(_seTickerInterval);
  _seTickerInterval = setInterval(_refreshSeEventTicker, 5 * 60 * 1000);
}
