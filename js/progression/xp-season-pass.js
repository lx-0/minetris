// XP Season Pass — 30-tier reward track driven by gameplay XP.
//
// XP sources (awarded per event):
//   lines cleared  : 1 XP per line
//   game completed : 10 XP
//   daily challenge: 25 XP (additional, on top of game XP)
//   tournament win : 50 XP
//   achievement    : 5 XP
//
// 30 tiers at 100 XP each → 3 000 XP to max the pass.
// Season duration mirrors the backend season if available; otherwise a
// local 30-day window starting the first time the game is played in a period.
// XP resets each season; earned rewards are kept permanently.
// 2× XP multiplier when a seasonal event is active.
//
// Depends on:
//   season.js (getSeasonConfig)
//   seasonal-events.js (getActiveSeasonalEvent)

// ── Tier reward definitions (30 tiers) ───────────────────────────────────────

const XP_PASS_TIERS = (function () {
  // Helper to build tier objects concisely.
  function t(tier, name, icon, type, desc) {
    return { tier, name, icon, type, desc };
  }
  return [
    // ── Seedling (1-6) ─────────────────────────────────────────────────────
    t( 1, 'Sprout Badge',       '&#127807;', 'badge',        'A fresh sprout badge for your profile.'),
    t( 2, 'Dirt Border',        '&#129521;', 'border',       'Earthy dirt-block profile border.'),
    t( 3, 'Leaf Green Tint',    '&#127809;', 'theme_color',  'Leaf-green accent color for your HUD.'),
    t( 4, 'Sapling Badge',      '&#127804;', 'badge',        'You\'re growing — a sapling badge for your profile.'),
    t( 5, 'Oak Block Skin',     '&#129492;', 'block_skin',   'Oak plank texture on all placed blocks.'),
    t( 6, 'Pollen Particle',    '&#10024;',  'particle',     'Tiny pollen particles burst on each line clear.'),

    // ── Adventurer (7-12) ──────────────────────────────────────────────────
    t( 7, 'Adventurer Badge',   '&#9935;',   'badge',        'Stone-edged badge — you\'ve found your footing.'),
    t( 8, 'Stone Border',       '&#128336;', 'border',       'Cobblestone-textured profile border.'),
    t( 9, 'Lava Orange Tint',   '&#128293;', 'theme_color',  'Lava-orange accent color for your HUD.'),
    t(10, 'Iron Block Skin',    '&#9881;',   'block_skin',   'Polished iron texture on all placed blocks.'),
    t(11, 'Spark Trail',        '&#128165;', 'trail',        'A spark trail follows your falling piece.'),
    t(12, 'Miner Badge',        '&#9935;',   'badge',        'Iron-pickaxe badge — the mines are yours.'),

    // ── Champion (13-18) ───────────────────────────────────────────────────
    t(13, 'Champion Badge',     '&#127942;', 'badge',        'A golden trophy badge for persistent players.'),
    t(14, 'Gold Border',        '&#11088;',  'border',       'Gleaming gold-block profile border.'),
    t(15, 'Redstone Tint',      '&#128308;', 'theme_color',  'Redstone-red accent color for your HUD.'),
    t(16, 'Gold Block Skin',    '&#11088;',  'block_skin',   'Gleaming gold texture on all placed blocks.'),
    t(17, 'Ember Particle',     '&#127825;', 'particle',     'Ember sparks erupt on Tetris clears.'),
    t(18, 'Veteran Badge',      '&#129414;', 'badge',        'Dragon-scale badge for the truly seasoned.'),

    // ── Legend (19-24) ─────────────────────────────────────────────────────
    t(19, 'Legend Badge',       '&#129395;', 'badge',        'A gleaming star badge for elite players.'),
    t(20, 'Diamond Border',     '&#128142;', 'border',       'Sparkling diamond-block profile border.'),
    t(21, 'Ender Tint',         '&#128995;', 'theme_color',  'Ender-purple accent color for your HUD.'),
    t(22, 'Diamond Block Skin', '&#128142;', 'block_skin',   'Glittering diamond texture on all placed blocks.'),
    t(23, 'Crystal Trail',      '&#128739;', 'trail',        'Crystal shards follow your falling piece.'),
    t(24, 'Aurora Particle',    '&#127774;', 'particle',     'Aurora ribbons ripple on every line clear.'),

    // ── Master (25-30) ─────────────────────────────────────────────────────
    t(25, 'Master Badge',       '&#129351;', 'badge',        'Gold crown badge — a true Minetris master.'),
    t(26, 'Netherite Border',   '&#129354;', 'border',       'Rare netherite-framed profile border.'),
    t(27, 'Deep Dark Tint',     '&#128064;', 'theme_color',  'Deep-dark cyan accent color for your HUD.'),
    t(28, 'Netherite Skin',     '&#129354;', 'block_skin',   'Dark netherite texture on all placed blocks.'),
    t(29, 'Warden Aura',        '&#128064;', 'particle',     'Warden sonic-burst rings on every placement.'),
    t(30, 'Season Champion',    '&#127881;', 'full_cosmetic', 'Exclusive season champion cosmetic — only for those who max the pass.'),
  ];
})();

const XP_PASS_XP_PER_TIER = 100;  // 100 XP per tier, 3 000 XP total

// ── Storage keys ──────────────────────────────────────────────────────────────

const _XPPASS_SEASON_KEY  = 'mineCtris_xpPass_season';    // { id, start, end }
const _XPPASS_XP_PREFIX   = 'mineCtris_xpPass_xp_';       // + seasonId
const _XPPASS_EARNED_KEY  = 'mineCtris_xpPass_earned';    // { seasonId: [tierNums] }
const _XPPASS_HISTORY_KEY = 'mineCtris_xpPass_history';   // [{ id, name, start, end, maxTier }]

// ── Local season helpers ──────────────────────────────────────────────────────

function _xpPassGetOrCreateLocalSeason() {
  try {
    const raw = localStorage.getItem(_XPPASS_SEASON_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.id && s.end && new Date(s.end) > new Date()) return s;
      // Expired — archive it
      if (s && s.id) _xpPassArchiveSeason(s);
    }
  } catch (_) {}

  // Create a new local 30-day season
  const now   = new Date();
  const end   = new Date(now);
  end.setDate(end.getDate() + 30);
  const season = {
    id:    'local_' + now.toISOString().slice(0, 10).replace(/-/g, ''),
    name:  'Season ' + now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    start: now.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
  try { localStorage.setItem(_XPPASS_SEASON_KEY, JSON.stringify(season)); } catch (_) {}
  return season;
}

function _xpPassArchiveSeason(season) {
  try {
    const hist = _xpPassLoadHistory();
    const xp   = _xpPassLoadXP(season.id);
    const maxT = _xpPassTierForXP(xp);
    if (!hist.find(function (h) { return h.id === season.id; })) {
      hist.unshift({ id: season.id, name: season.name, start: season.start, end: season.end, maxTier: maxT });
      if (hist.length > 12) hist.length = 12;  // keep last 12 seasons
      localStorage.setItem(_XPPASS_HISTORY_KEY, JSON.stringify(hist));
    }
  } catch (_) {}
}

/**
 * Returns the current season descriptor { id, name, start, end }.
 * Uses backend season if available; falls back to local 30-day window.
 */
function xpPassGetCurrentSeason() {
  const backend = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  if (backend && backend.seasonId) {
    return {
      id:    backend.seasonId,
      name:  backend.name || 'Active Season',
      start: backend.startDate || '',
      end:   backend.endDate   || '',
    };
  }
  return _xpPassGetOrCreateLocalSeason();
}

// ── XP persistence ────────────────────────────────────────────────────────────

function _xpPassLoadXP(seasonId) {
  try { return parseInt(localStorage.getItem(_XPPASS_XP_PREFIX + seasonId) || '0', 10) || 0; } catch (_) { return 0; }
}

function _xpPassSaveXP(seasonId, xp) {
  try { localStorage.setItem(_XPPASS_XP_PREFIX + seasonId, String(xp)); } catch (_) {}
}

// ── Earned rewards persistence ────────────────────────────────────────────────

function _xpPassLoadEarned() {
  try { return JSON.parse(localStorage.getItem(_XPPASS_EARNED_KEY) || '{}'); } catch (_) { return {}; }
}

function _xpPassSaveEarned(earned) {
  try { localStorage.setItem(_XPPASS_EARNED_KEY, JSON.stringify(earned)); } catch (_) {}
}

// ── History persistence ───────────────────────────────────────────────────────

function _xpPassLoadHistory() {
  try { return JSON.parse(localStorage.getItem(_XPPASS_HISTORY_KEY) || '[]'); } catch (_) { return []; }
}

// ── Tier / XP helpers ─────────────────────────────────────────────────────────

/** Returns the highest tier reached for a given total XP (1–30). */
function _xpPassTierForXP(xp) {
  return Math.min(30, 1 + Math.floor((xp || 0) / XP_PASS_XP_PER_TIER));
}

/** XP required to reach the START of a given tier. */
function _xpPassXpForTier(tier) {
  return Math.max(0, tier - 1) * XP_PASS_XP_PER_TIER;
}

/** Progress percentage within the current tier (0–100). */
function _xpPassPctInTier(xp) {
  const tier = _xpPassTierForXP(xp);
  if (tier >= 30) return 100;
  const tierStart = _xpPassXpForTier(tier);
  return Math.min(100, Math.floor(((xp - tierStart) / XP_PASS_XP_PER_TIER) * 100));
}

// ── XP multiplier ─────────────────────────────────────────────────────────────

/** Returns 2 when a seasonal event is active, otherwise 1. */
function _xpPassGetMultiplier() {
  try {
    if (typeof getActiveSeasonalEvent === 'function' && getActiveSeasonalEvent()) return 2;
  } catch (_) {}
  return 1;
}

// ── Core XP award ─────────────────────────────────────────────────────────────

/**
 * Award season-pass XP and unlock any newly-reached tier rewards.
 * @param {string} source  'lines'|'game'|'daily'|'tournament_win'|'achievement'
 * @param {number} amount  Base XP amount before multiplier.
 * @returns {{ xpEarned: number, tiersUp: number[], newRewards: object[] }}
 */
function awardSeasonPassXP(source, amount) {
  const season = xpPassGetCurrentSeason();
  if (!season || !season.id) return { xpEarned: 0, tiersUp: [], newRewards: [] };

  const multiplier = _xpPassGetMultiplier();
  const xpToAdd    = Math.max(0, Math.round((amount || 0) * multiplier));
  if (!xpToAdd) return { xpEarned: 0, tiersUp: [], newRewards: [] };

  const xpBefore   = _xpPassLoadXP(season.id);
  const tierBefore = _xpPassTierForXP(xpBefore);
  const xpAfter    = xpBefore + xpToAdd;
  _xpPassSaveXP(season.id, xpAfter);

  const tierAfter = _xpPassTierForXP(xpAfter);

  // Collect newly reached tiers and unlock their rewards
  const tiersUp   = [];
  const newRewards = [];
  if (tierAfter > tierBefore) {
    const earned = _xpPassLoadEarned();
    if (!earned[season.id]) earned[season.id] = [];
    for (let t = tierBefore + 1; t <= tierAfter; t++) {
      tiersUp.push(t);
      if (!earned[season.id].includes(t)) {
        earned[season.id].push(t);
        const def = XP_PASS_TIERS[t - 1];
        if (def) newRewards.push(def);
      }
    }
    _xpPassSaveEarned(earned);

    // Show tier-up notification for each newly reached tier
    if (newRewards.length && typeof notifPush === 'function') {
      newRewards.forEach(function (def) {
        notifPush('xp_pass', def.icon,
          'Season Pass Tier ' + def.tier + ' — ' + def.name + ' unlocked!');
      });
    }
  }

  return { xpEarned: xpToAdd, tiersUp: tiersUp, newRewards: newRewards };
}

// ── Public XP award entry points (called by game systems) ────────────────────

/** Award 1 XP per line cleared. Called from lineclear.js. */
function awardXpPassLines(count) {
  if (!count || count < 1) return;
  awardSeasonPassXP('lines', count);
}

/** Award 10 XP for completing a game; 25 extra XP for a daily challenge. */
function awardXpPassGameEnd(isDailyChallenge) {
  awardSeasonPassXP('game', 10);
  if (isDailyChallenge) awardSeasonPassXP('daily', 25);
}

/** Award 50 XP for winning a tournament match. */
function awardXpPassTournamentWin() {
  awardSeasonPassXP('tournament_win', 50);
}

/** Award 5 XP for unlocking an achievement. */
function awardXpPassAchievement() {
  awardSeasonPassXP('achievement', 5);
}

// ── Public queries ────────────────────────────────────────────────────────────

/** Returns current XP in the active season. */
function getXpPassXP() {
  const s = xpPassGetCurrentSeason();
  return s ? _xpPassLoadXP(s.id) : 0;
}

/** Returns current tier (1-30) in the active season. */
function getXpPassTier() {
  return _xpPassTierForXP(getXpPassXP());
}

/** Returns true if the player has earned the reward for a given tier number. */
function hasXpPassReward(seasonId, tierNum) {
  const earned = _xpPassLoadEarned();
  return !!(earned[seasonId] && earned[seasonId].includes(tierNum));
}

// ── Days remaining helper ─────────────────────────────────────────────────────

function _xpPassDaysRemaining(season) {
  if (!season || !season.end) return 0;
  const end  = new Date(season.end + (season.end.length <= 10 ? 'T23:59:59Z' : ''));
  const diff = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// ── Panel rendering ───────────────────────────────────────────────────────────

/**
 * Render the XP Pass tab contents into #xp-pass-tab-body.
 * Called whenever the XP Pass tab is shown.
 */
function renderXpPassTab() {
  const container = document.getElementById('xp-pass-tab-body');
  if (!container) return;

  const season   = xpPassGetCurrentSeason();
  const xp       = season ? _xpPassLoadXP(season.id) : 0;
  const tier     = _xpPassTierForXP(xp);
  const pct      = _xpPassPctInTier(xp);
  const daysLeft = season ? _xpPassDaysRemaining(season) : 0;
  const mult     = _xpPassGetMultiplier();
  const earned   = _xpPassLoadEarned();
  const earnedSet = new Set((season && earned[season.id]) ? earned[season.id] : []);

  let html = '';

  // ── Season header ──────────────────────────────────────────────────────────
  html += '<div class="xpp-header">';
  html += '<div class="xpp-season-name">' + _xppEsc(season ? (season.name || 'Season Pass') : 'Season Pass') + '</div>';
  html += '<div class="xpp-meta-row">';
  html += '<span class="xpp-tier-label">Tier ' + tier + ' / 30</span>';
  html += '<span class="xpp-xp-val">' + xp.toLocaleString() + ' XP</span>';
  if (daysLeft > 0) {
    html += '<span class="xpp-days-left">' + daysLeft + (daysLeft === 1 ? ' day left' : ' days left') + '</span>';
  }
  if (mult >= 2) {
    html += '<span class="xpp-2x-badge">&#9889; 2× XP Active!</span>';
  }
  html += '</div>';

  // XP progress bar within the current tier
  const xpInTier  = xp - _xpPassXpForTier(tier);
  const xpToNext  = tier < 30 ? (XP_PASS_XP_PER_TIER - xpInTier) + ' XP to tier ' + (tier + 1) : 'Max tier reached!';
  html += '<div class="xpp-bar-wrap"><div class="xpp-bar-fill" style="width:' + pct + '%"></div></div>';
  html += '<div class="xpp-bar-label">' + _xppEsc(xpToNext) + '</div>';
  html += '</div>'; // .xpp-header

  // ── XP sources legend ──────────────────────────────────────────────────────
  html += '<div class="xpp-sources">';
  html += '<span class="xpp-source-item">&#9632; Line cleared: +1 XP</span>';
  html += '<span class="xpp-source-item">&#9632; Game completed: +10 XP</span>';
  html += '<span class="xpp-source-item">&#9632; Daily challenge: +25 XP</span>';
  html += '<span class="xpp-source-item">&#9632; Tournament win: +50 XP</span>';
  html += '<span class="xpp-source-item">&#9632; Achievement: +5 XP</span>';
  if (mult >= 2) html += '<span class="xpp-source-item xpp-source-boost">&#9889; 2× boost active!</span>';
  html += '</div>';

  // ── Tier track ─────────────────────────────────────────────────────────────
  html += '<div class="xpp-tier-track">';
  for (let i = 0; i < XP_PASS_TIERS.length; i++) {
    const def      = XP_PASS_TIERS[i];
    const isEarned = earnedSet.has(def.tier);
    const isCurrent = def.tier === tier;
    const isReachable = !isEarned && def.tier === tier + 1;

    let rowCls = 'xpp-tier-row';
    if (isEarned)    rowCls += ' xpp-earned';
    if (isCurrent)   rowCls += ' xpp-current';
    if (isReachable) rowCls += ' xpp-next';

    const lockIcon = isEarned ? '&#9989;' : (isCurrent ? '&#9654;' : '&#128274;');

    html += '<div class="' + rowCls + '" title="' + _xppEsc(def.desc) + '">';
    html += '<div class="xpp-tier-num">' + def.tier + '</div>';
    html += '<div class="xpp-tier-status">' + lockIcon + '</div>';
    html += '<div class="xpp-tier-content">';
    html += '<div class="xpp-tier-name"><span class="xpp-reward-icon">' + def.icon + '</span>' + _xppEsc(def.name) + '</div>';
    html += '<div class="xpp-tier-type-badge xpp-type-' + def.type + '">' + _xppTypeLabel(def.type) + '</div>';
    if (!isEarned && def.tier > tier) {
      const xpNeeded = Math.max(0, _xpPassXpForTier(def.tier) - xp);
      html += '<div class="xpp-tier-xp-needed">' + xpNeeded.toLocaleString() + ' XP needed</div>';
    }
    html += '</div>'; // .xpp-tier-content
    html += '</div>'; // .xpp-tier-row
  }
  html += '</div>'; // .xpp-tier-track

  container.innerHTML = html;
}

/** Render the season history tab. */
function renderXpPassHistory() {
  const container = document.getElementById('xp-pass-history-body');
  if (!container) return;

  const history = _xpPassLoadHistory();
  const earned  = _xpPassLoadEarned();

  if (!history.length) {
    container.innerHTML = '<div class="xpp-history-empty">No past seasons yet. Complete your first season to see history here.</div>';
    return;
  }

  let html = '<div class="xpp-history-list">';
  history.forEach(function (s) {
    const seasonEarned = earned[s.id] || [];
    const maxTier = s.maxTier || Math.max(...(seasonEarned.length ? seasonEarned : [0]));
    html += '<div class="xpp-history-entry">';
    html += '<div class="xpp-history-name">' + _xppEsc(s.name || s.id) + '</div>';
    html += '<div class="xpp-history-meta">';
    html += '<span class="xpp-history-tier">Tier ' + (maxTier || 0) + ' / 30</span>';
    if (s.end) html += '<span class="xpp-history-dates">' + _xppEsc(s.start || '') + ' → ' + _xppEsc(s.end) + '</span>';
    html += '</div>';
    if (seasonEarned.length) {
      html += '<div class="xpp-history-rewards">';
      seasonEarned.slice().sort(function (a, b) { return a - b; }).forEach(function (t) {
        const def = XP_PASS_TIERS[t - 1];
        if (def) html += '<span class="xpp-history-reward-icon" title="' + _xppEsc(def.name) + '">' + def.icon + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  container.innerHTML = html;
}

// ── Tab switching ─────────────────────────────────────────────────────────────

/**
 * Switch the visible tab inside the season-pass panel.
 * @param {'battle'|'xp'|'history'} tabId
 */
function xpPassSwitchTab(tabId) {
  const tabs = ['battle', 'xp', 'history'];
  tabs.forEach(function (id) {
    const btn  = document.getElementById('sp-tab-' + id);
    const body = document.getElementById('sp-tab-body-' + id);
    const active = (id === tabId);
    if (btn)  btn.classList.toggle('sp-tab-active', active);
    if (body) body.style.display = active ? 'block' : 'none';
  });

  if (tabId === 'xp')      renderXpPassTab();
  if (tabId === 'history') renderXpPassHistory();
}

// ── Init ───────────────────────────────────────────────────────────────────────

/**
 * Call once after the DOM is ready.
 * Injects tab navigation into the season-pass panel and wires up events.
 */
function initXpSeasonPass() {
  const panel = document.getElementById('season-pass-panel');
  if (!panel) return;

  // Check if tabs already injected (guard against double-init)
  if (document.getElementById('sp-tab-nav')) return;

  // ── Build tab nav ──────────────────────────────────────────────────────────
  const tabNav = document.createElement('div');
  tabNav.id = 'sp-tab-nav';
  tabNav.innerHTML =
    '<button id="sp-tab-battle"  class="sp-tab-btn" onclick="xpPassSwitchTab(\'battle\')">Battle Pass</button>' +
    '<button id="sp-tab-xp"      class="sp-tab-btn sp-tab-active" onclick="xpPassSwitchTab(\'xp\')">XP Pass</button>' +
    '<button id="sp-tab-history" class="sp-tab-btn" onclick="xpPassSwitchTab(\'history\')">History</button>';

  // Insert after the header
  const header = document.getElementById('season-pass-header');
  if (header && header.nextSibling) {
    panel.insertBefore(tabNav, header.nextSibling);
  } else {
    panel.appendChild(tabNav);
  }

  // ── Wrap existing body elements in the Battle Pass tab ─────────────────────
  const headerInfo  = document.getElementById('season-pass-header-info');
  const panelBody   = document.getElementById('season-pass-panel-body');
  const featuredBody = document.getElementById('season-pass-featured-body');

  const battleTabBody = document.createElement('div');
  battleTabBody.id = 'sp-tab-body-battle';
  battleTabBody.style.display = 'none';

  // Move existing elements into the battle tab body
  if (headerInfo)   battleTabBody.appendChild(headerInfo);
  if (panelBody)    battleTabBody.appendChild(panelBody);
  if (featuredBody) battleTabBody.appendChild(featuredBody);

  // ── XP Pass tab body ───────────────────────────────────────────────────────
  const xpTabBody = document.createElement('div');
  xpTabBody.id = 'sp-tab-body-xp';
  xpTabBody.innerHTML = '<div id="xp-pass-tab-body"></div>';

  // ── History tab body ───────────────────────────────────────────────────────
  const histTabBody = document.createElement('div');
  histTabBody.id = 'sp-tab-body-history';
  histTabBody.style.display = 'none';
  histTabBody.innerHTML = '<div id="xp-pass-history-body"></div>';

  // Insert tab bodies before the close button
  const closeBtn = document.getElementById('season-pass-close-btn');
  if (closeBtn) {
    panel.insertBefore(battleTabBody, closeBtn);
    panel.insertBefore(xpTabBody,     closeBtn);
    panel.insertBefore(histTabBody,   closeBtn);
  } else {
    panel.appendChild(battleTabBody);
    panel.appendChild(xpTabBody);
    panel.appendChild(histTabBody);
  }

  // Default to XP Pass tab
  xpPassSwitchTab('xp');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _xppEsc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _xppTypeLabel(type) {
  const labels = {
    badge:        'Badge',
    border:       'Border',
    theme_color:  'HUD Color',
    block_skin:   'Block Skin',
    trail:        'Trail',
    particle:     'Particles',
    full_cosmetic:'Full Cosmetic',
  };
  return labels[type] || type;
}
