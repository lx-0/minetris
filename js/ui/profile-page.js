// Profile page — showcases prestige, equipped cosmetics, mastery badges, and wardrobe.
// Requires: stats.js, leveling.js, achievements.js, cosmetics.js

// ── Category display metadata ─────────────────────────────────────────────────

var PROFILE_COSMETIC_CATEGORIES = [
  { key: 'block_skin',     label: 'Block Skins',     icon: '\uD83E\uDDF1' },
  { key: 'pickaxe_skin',   label: 'Pickaxe Skins',   icon: '\u26CF\uFE0F' },
  { key: 'trail',          label: 'Trails',           icon: '\u2728' },
  { key: 'landing_effect', label: 'Landing Effects',  icon: '\uD83D\uDCA5' },
  { key: 'border',         label: 'Borders',          icon: '\uD83D\uDDBC\uFE0F' },
  { key: 'title',          label: 'Titles',           icon: '\uD83C\uDFF7\uFE0F' },
];

var RARITY_COLORS = {
  common:    '#aaa',
  rare:      '#4fc3f7',
  epic:      '#ce93d8',
  legendary: '#ffd740',
};

var _profileActiveTab = 'block_skin';

// ── Render helpers ────────────────────────────────────────────────────────────

function _escProfileHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _renderProfileHeader() {
  var stats = loadLifetimeStats();
  var level = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
  var prestigeLevel = typeof getPrestigeLevel === 'function' ? getPrestigeLevel() : 0;
  var prestigeStars = typeof getPrestigeStarsHtml === 'function' ? getPrestigeStarsHtml() : '';

  // Equipped title
  var equippedTitle = typeof getEquipped === 'function' ? getEquipped('title') : null;
  var titleText = equippedTitle ? equippedTitle.name : '';

  // Equipped border
  var equippedBorder = typeof getEquipped === 'function' ? getEquipped('border') : null;
  var borderClass = equippedBorder && equippedBorder.assets && equippedBorder.assets.animated
    ? ' profile-header-border-animated' : '';

  var html = '<div class="profile-header' + borderClass + '">';
  html += '<div class="profile-name-row">';
  html += '<span class="profile-player-name">PLAYER</span>';
  if (prestigeStars) html += '<span class="profile-prestige-stars">' + prestigeStars + '</span>';
  html += '</div>';
  if (titleText) {
    html += '<div class="profile-title">' + _escProfileHtml(titleText) + '</div>';
  }
  html += '</div>';
  return html;
}

function _renderProfileStats() {
  var stats = loadLifetimeStats();
  var level = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
  var totalXP = stats.playerXP || 0;
  var prestigeLevel = typeof getPrestigeLevel === 'function' ? getPrestigeLevel() : 0;
  var xpProgress = typeof getXPProgress === 'function' ? getXPProgress(totalXP) : null;

  // Ranked tier badge (placement-aware)
  var rankedTierHtml = '';
  if (typeof loadBattleRating === 'function') {
    var rd = loadBattleRating();
    if (typeof getRankedStatusHtml === 'function') {
      rankedTierHtml = getRankedStatusHtml();
    } else if (typeof getBattleRankBadgeHtml === 'function') {
      rankedTierHtml = getBattleRankBadgeHtml(rd.rating);
    }
  }

  // Season rank
  var seasonRank = '';
  if (typeof loadBattleRating === 'function') {
    var _profileRating = loadBattleRating().rating;
    if (typeof getSeasonRankBadgeHtml === 'function') {
      seasonRank = getSeasonRankBadgeHtml(_profileRating);
    } else {
      seasonRank = _profileRating + ' pts';
    }
  }

  var items = [
    { label: 'LEVEL', value: level },
    { label: 'TOTAL XP', value: totalXP.toLocaleString() },
    { label: 'PRESTIGE', value: prestigeLevel > 0 ? '\u2B50'.repeat(Math.min(prestigeLevel, 10)) + ' (' + prestigeLevel + ')' : 'None' },
  ];
  if (rankedTierHtml) items.push({ label: 'RANK TIER', value: rankedTierHtml });
  if (seasonRank) items.push({ label: 'SEASON RANK', value: seasonRank });

  var html = '<div class="profile-stats-row">';
  for (var i = 0; i < items.length; i++) {
    html += '<div class="profile-stat-item">' +
      '<div class="profile-stat-label">' + items[i].label + '</div>' +
      '<div class="profile-stat-value">' + items[i].value + '</div>' +
    '</div>';
  }
  html += '</div>';

  // XP progress bar
  if (xpProgress && xpProgress.needed > 0) {
    var pct = Math.min(100, Math.round((xpProgress.current / xpProgress.needed) * 100));
    html += '<div class="profile-xp-bar-wrap">' +
      '<div class="profile-xp-bar-label">Level ' + level + ' \u2192 ' + (level + 1) + '</div>' +
      '<div class="profile-xp-bar-track">' +
        '<div class="profile-xp-bar-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<div class="profile-xp-bar-text">' + xpProgress.current + ' / ' + xpProgress.needed + ' XP</div>' +
    '</div>';
  } else if (xpProgress && xpProgress.needed === 0) {
    html += '<div class="profile-xp-bar-wrap">' +
      '<div class="profile-xp-bar-label">MAX LEVEL</div>' +
      '<div class="profile-xp-bar-track"><div class="profile-xp-bar-fill" style="width:100%"></div></div>' +
      '<div class="profile-xp-bar-text">Level 50 reached!</div>' +
    '</div>';
  }

  return html;
}

function _renderEquippedCosmetics() {
  var equipped = typeof getAllEquipped === 'function' ? getAllEquipped() : {};
  var displayCats = [
    { key: 'block_skin',     label: 'Block Skin',     icon: '\uD83E\uDDF1' },
    { key: 'pickaxe_skin',   label: 'Pickaxe',        icon: '\u26CF\uFE0F' },
    { key: 'trail',          label: 'Trail',           icon: '\u2728' },
    { key: 'landing_effect', label: 'Landing Effect',  icon: '\uD83D\uDCA5' },
  ];

  var html = '<div class="profile-section-title">EQUIPPED COSMETICS</div>';
  html += '<div class="profile-equipped-grid">';
  for (var i = 0; i < displayCats.length; i++) {
    var cat = displayCats[i];
    var cos = equipped[cat.key];
    var name = cos ? cos.name : 'Default';
    var rarity = cos ? cos.rarity : 'common';
    var color = RARITY_COLORS[rarity] || '#aaa';
    html += '<div class="profile-equipped-item">' +
      '<div class="profile-equipped-icon">' + cat.icon + '</div>' +
      '<div class="profile-equipped-name" style="color:' + color + '">' + _escProfileHtml(name) + '</div>' +
      '<div class="profile-equipped-cat">' + cat.label + '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

var _MASTERY_MODE_META = [
  { key: 'classic',    label: 'Classic',    icon: '\uD83C\uDFAE' },
  { key: 'sprint',     label: 'Sprint',     icon: '\u26A1' },
  { key: 'blitz',      label: 'Blitz',      icon: '\uD83D\uDCA5' },
  { key: 'daily',      label: 'Daily',      icon: '\uD83D\uDCC5' },
  { key: 'survival',   label: 'Survival',   icon: '\uD83C\uDF32' },
  { key: 'battle',     label: 'Battle',     icon: '\u2694\uFE0F' },
  { key: 'expedition', label: 'Expedition', icon: '\uD83D\uDDFA\uFE0F' },
];

var _MASTERY_TIER_BORDER_COLORS = {
  0: 'rgba(255,255,255,0.12)',
  1: '#cd7f32',
  2: '#c0c0c0',
  3: '#ffd700',
  4: '#b9f2ff',
  5: '#7c3aed',
};

var _MASTERY_TIER_LABELS = ['None', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Obsidian'];
var _MASTERY_TIER_ICONS_PROFILE  = ['\u25CB', '\uD83E\uDD49', '\uD83E\uDD48', '\uD83E\uDD47', '\uD83D\uDCAE', '\u2B1B'];

function _renderMasteryBadges() {
  var hasMastery = typeof getMasteryTier === 'function';
  var hasChallenges = typeof MASTERY_CHALLENGES !== 'undefined';
  var totalScore = (typeof getMasteryScore === 'function') ? getMasteryScore() : 0;

  var html = '<div class="profile-section-title">MASTERY</div>';
  html += '<div class="profile-mastery-score">Total Mastery Score: <span class="profile-mastery-score-val">' + totalScore + ' / 35</span></div>';
  html += '<div class="profile-mastery-grid">';

  for (var i = 0; i < _MASTERY_MODE_META.length; i++) {
    var meta = _MASTERY_MODE_META[i];
    var tier = hasMastery ? getMasteryTier(meta.key) : 0;
    var borderColor = _MASTERY_TIER_BORDER_COLORS[tier] || _MASTERY_TIER_BORDER_COLORS[0];
    var tierLabel   = _MASTERY_TIER_LABELS[tier] || 'None';
    var tierIcon    = _MASTERY_TIER_ICONS_PROFILE[tier] || '\u25CB';

    // Next challenge description
    var nextDesc = '';
    if (hasChallenges && tier < 5) {
      var challenges = MASTERY_CHALLENGES[meta.key];
      if (challenges && challenges[tier]) {
        nextDesc = challenges[tier].desc;
      }
    }

    var tooltip = meta.label + '\nTier: ' + tierLabel + (nextDesc ? '\nNext: ' + nextDesc : '\nMax tier reached!');

    html += '<div class="profile-mastery-card" style="border-color:' + borderColor + '" title="' + _escProfileHtml(tooltip) + '" data-mode="' + meta.key + '">';
    html += '<div class="profile-mastery-card-icon">' + meta.icon + '</div>';
    html += '<div class="profile-mastery-card-tier-icon">' + tierIcon + '</div>';
    html += '<div class="profile-mastery-card-name">' + _escProfileHtml(meta.label) + '</div>';
    html += '</div>';
  }

  html += '</div>';

  // Detail panel (shown on click)
  html += '<div id="profile-mastery-detail" class="profile-mastery-detail" style="display:none"></div>';

  return html;
}

function _renderMasteryDetail(modeKey) {
  var detailEl = document.getElementById('profile-mastery-detail');
  if (!detailEl) return;

  var meta = null;
  for (var i = 0; i < _MASTERY_MODE_META.length; i++) {
    if (_MASTERY_MODE_META[i].key === modeKey) { meta = _MASTERY_MODE_META[i]; break; }
  }
  if (!meta) return;

  var tier = (typeof getMasteryTier === 'function') ? getMasteryTier(modeKey) : 0;
  var tierLabel = _MASTERY_TIER_LABELS[tier] || 'None';
  var borderColor = _MASTERY_TIER_BORDER_COLORS[tier] || _MASTERY_TIER_BORDER_COLORS[0];

  var html = '<div class="pmd-header" style="color:' + borderColor + '">' +
    meta.icon + ' ' + _escProfileHtml(meta.label) + ' &mdash; ' + tierLabel +
  '</div>';

  // Show all 5 challenges with check/lock
  if (typeof MASTERY_CHALLENGES !== 'undefined' && MASTERY_CHALLENGES[modeKey]) {
    var challenges = MASTERY_CHALLENGES[modeKey];
    html += '<div class="pmd-challenges">';
    for (var j = 0; j < challenges.length; j++) {
      var ch = challenges[j];
      var done = tier >= ch.tier;
      var isNext = ch.tier === tier + 1;
      var cls = done ? 'pmd-ch pmd-ch-done' : (isNext ? 'pmd-ch pmd-ch-next' : 'pmd-ch pmd-ch-locked');
      var statusIcon = done ? '\u2705' : (isNext ? '\u25B6' : '\uD83D\uDD12');
      var tierIco = _MASTERY_TIER_ICONS_PROFILE[ch.tier] || '';
      html += '<div class="' + cls + '">' +
        '<span class="pmd-ch-status">' + statusIcon + '</span>' +
        '<span class="pmd-ch-tier">' + tierIco + ' ' + _MASTERY_TIER_LABELS[ch.tier] + '</span>' +
        '<span class="pmd-ch-desc">' + _escProfileHtml(ch.desc) + '</span>' +
      '</div>';
    }
    html += '</div>';
  }

  detailEl.innerHTML = html;
  detailEl.style.display = 'block';
  detailEl.setAttribute('data-active-mode', modeKey);
}

function _renderWardrobeTabs() {
  var html = '<div class="profile-section-title">COSMETIC WARDROBE</div>';
  html += '<div class="profile-wardrobe-tabs">';
  for (var i = 0; i < PROFILE_COSMETIC_CATEGORIES.length; i++) {
    var cat = PROFILE_COSMETIC_CATEGORIES[i];
    var active = cat.key === _profileActiveTab ? ' profile-tab-active' : '';
    html += '<button class="profile-tab-btn' + active + '" data-profile-tab="' + cat.key + '">' +
      cat.icon + ' ' + cat.label +
    '</button>';
  }
  html += '</div>';
  html += '<div id="profile-wardrobe-content"></div>';
  return html;
}

// ── Animated skin preview loop ─────────────────────────────────────────────────

var _animPreviewRafId = null;
var _animPreviewStartMs = performance.now();

function _stopAnimPreviewLoop() {
  if (_animPreviewRafId !== null) {
    cancelAnimationFrame(_animPreviewRafId);
    _animPreviewRafId = null;
  }
}

function _startAnimPreviewLoop() {
  _stopAnimPreviewLoop();
  function tick() {
    var elapsed = performance.now() - _animPreviewStartMs;
    var canvases = document.querySelectorAll('.skin-preview-canvas[data-animated-skin]');
    if (canvases.length === 0) { _animPreviewRafId = null; return; }
    canvases.forEach(function(canvas) {
      var skinKey = canvas.getAttribute('data-animated-skin');
      if (typeof drawSkinPreviewFrame === 'function') {
        drawSkinPreviewFrame(canvas, skinKey, elapsed);
      }
    });
    _animPreviewRafId = requestAnimationFrame(tick);
  }
  _animPreviewStartMs = performance.now();
  _animPreviewRafId = requestAnimationFrame(tick);
}

// ── Per-piece-type skin state ─────────────────────────────────────────────────

var _perPieceModeActive = false;
var _perPieceSelectedColorIdx = null; // which piece type is being re-skinned

var _PIECE_TYPE_LABELS = [
  null,                            // 0 unused
  { name: 'I-Piece', color: '#55aadd', shape: [[1,1,1,1]] },
  { name: 'O-Piece', color: '#ffcc00', shape: [[1,1],[1,1]] },
  { name: 'T-Piece', color: '#aa44ff', shape: [[0,1,0],[1,1,1]] },
  { name: 'S-Piece', color: '#55ee55', shape: [[0,1,1],[1,1,0]] },
  { name: 'Z-Piece', color: '#ff4444', shape: [[1,1,0],[0,1,1]] },
  { name: 'J-Piece', color: '#3366ff', shape: [[1,0,0],[1,1,1]] },
  { name: 'L-Piece', color: '#ff8800', shape: [[0,0,1],[1,1,1]] },
  { name: 'Spare',   color: '#88dddd', shape: [[1]] },
];

function _renderPerPieceTypePanel() {
  var perPieceMap = (typeof loadPerPieceTypeSkins === 'function') ? loadPerPieceTypeSkins() : {};
  var html = '<div class="per-piece-panel">';
  html += '<div class="per-piece-header">Per-Piece Skin Assignments</div>';
  html += '<div class="per-piece-hint">Click a piece to assign or clear its skin.</div>';
  html += '<div class="per-piece-grid">';
  for (var idx = 1; idx <= 8; idx++) {
    var meta = _PIECE_TYPE_LABELS[idx];
    if (!meta) continue;
    var assignedSkin = perPieceMap[idx] || null;
    var skinLabel = assignedSkin
      ? (typeof getAnimatedSkinName === 'function' ? getAnimatedSkinName(assignedSkin) : assignedSkin)
      : 'Default';
    var isSelected = (_perPieceSelectedColorIdx === idx);
    var cls = 'per-piece-item' + (isSelected ? ' per-piece-item-selected' : '');
    html += '<div class="' + cls + '" data-piece-idx="' + idx + '">';
    html += '<div class="per-piece-swatch" style="background:' + meta.color + '"></div>';
    html += '<div class="per-piece-name">' + _escProfileHtml(meta.name) + '</div>';
    html += '<div class="per-piece-assigned">' + _escProfileHtml(skinLabel) + '</div>';
    if (assignedSkin) {
      html += '<button class="per-piece-clear-btn" data-piece-idx="' + idx + '" title="Clear assignment">\u2715</button>';
    }
    html += '</div>';
  }
  html += '</div>';
  if (_perPieceSelectedColorIdx !== null) {
    html += '<div class="per-piece-pick-label">Choose a skin for ' +
      _escProfileHtml((_PIECE_TYPE_LABELS[_perPieceSelectedColorIdx] || {}).name || '') + ':</div>';
    html += _renderAnimatedSkinPicker(_perPieceSelectedColorIdx);
  }
  html += '</div>';
  return html;
}

function _renderAnimatedSkinPicker(colorIdx) {
  var perPieceMap = (typeof loadPerPieceTypeSkins === 'function') ? loadPerPieceTypeSkins() : {};
  var html = '<div class="animated-skin-picker">';
  // "Default" option
  var isDefault = !perPieceMap[colorIdx];
  html += '<div class="anim-pick-option' + (isDefault ? ' anim-pick-selected' : '') +
    '" data-pick-skin="" data-pick-idx="' + colorIdx + '">' +
    '<div class="anim-pick-name">Default</div></div>';
  if (typeof ANIMATED_BLOCK_SKIN_DEFS !== 'undefined') {
    Object.keys(ANIMATED_BLOCK_SKIN_DEFS).forEach(function(skinKey) {
      var def = ANIMATED_BLOCK_SKIN_DEFS[skinKey];
      var name = typeof getAnimatedSkinName === 'function' ? getAnimatedSkinName(skinKey) : skinKey;
      var isSel = perPieceMap[colorIdx] === skinKey;
      html += '<div class="anim-pick-option' + (isSel ? ' anim-pick-selected' : '') +
        '" data-pick-skin="' + skinKey + '" data-pick-idx="' + colorIdx + '">';
      html += '<canvas class="skin-preview-canvas" data-animated-skin="' + skinKey +
        '" width="64" height="32"></canvas>';
      html += '<div class="anim-pick-name">' + _escProfileHtml(name) + '</div>';
      html += '</div>';
    });
  }
  html += '</div>';
  return html;
}

function _renderWardrobeContent(categoryKey) {
  var el = document.getElementById('profile-wardrobe-content');
  if (!el) return;

  _stopAnimPreviewLoop();

  var allInCat = typeof getCosmeticsByCategory === 'function'
    ? getCosmeticsByCategory(categoryKey) : [];
  var equipped = typeof getEquipped === 'function' ? getEquipped(categoryKey) : null;
  var equippedId = equipped ? equipped.id : null;

  // For block_skin: show per-piece-type toggle + per-piece panel when active.
  var extraHtml = '';
  if (categoryKey === 'block_skin') {
    extraHtml += '<div class="per-piece-toggle-row">';
    extraHtml += '<button class="per-piece-toggle-btn' + (_perPieceModeActive ? ' per-piece-toggle-active' : '') +
      '" id="per-piece-toggle-btn">' +
      (_perPieceModeActive ? '\u2714 Per-Piece Mode' : '\u2261 Per-Piece Mode') +
      '</button>';
    if (_perPieceModeActive && typeof hasPerPieceTypeSkins === 'function' && hasPerPieceTypeSkins()) {
      extraHtml += '<button class="per-piece-clear-all-btn" id="per-piece-clear-all-btn">Clear All</button>';
    }
    extraHtml += '</div>';
    if (_perPieceModeActive) {
      extraHtml += _renderPerPieceTypePanel();
    }
  }

  var html = '<div class="profile-wardrobe-grid">';
  for (var i = 0; i < allInCat.length; i++) {
    var cos = allInCat[i];
    var unlocked = typeof isCosmeticUnlocked === 'function' ? isCosmeticUnlocked(cos.id) : false;
    var isEquipped = cos.id === equippedId;
    var color = RARITY_COLORS[cos.rarity] || '#aaa';
    var isAnimated = !!(cos.assets && cos.assets.animated);

    var cls = 'profile-wardrobe-card';
    if (!unlocked) cls += ' profile-wardrobe-locked';
    if (isEquipped) cls += ' profile-wardrobe-equipped';
    if (isAnimated) cls += ' profile-wardrobe-animated';

    html += '<div class="' + cls + '" data-cosmetic-id="' + cos.id + '" data-cosmetic-cat="' + categoryKey + '">';

    // Animated skin preview canvas
    if (isAnimated && cos.assets && cos.assets.themeKey) {
      html += '<canvas class="skin-preview-canvas" data-animated-skin="' + cos.assets.themeKey +
        '" width="96" height="48"></canvas>';
    }

    html += '<div class="profile-wardrobe-card-name" style="color:' + color + '">';
    if (isAnimated) html += '<span class="skin-animated-badge">ANIMATED</span> ';
    html += _escProfileHtml(cos.name) + '</div>';
    html += '<div class="profile-wardrobe-card-rarity">' + cos.rarity.toUpperCase() + '</div>';

    if (!unlocked) {
      var hint = _getUnlockHint(cos);
      html += '<div class="profile-wardrobe-card-lock">\uD83D\uDD12 ' + _escProfileHtml(hint) + '</div>';
    } else if (isEquipped) {
      html += '<div class="profile-wardrobe-card-badge">EQUIPPED</div>';
    } else {
      html += '<div class="profile-wardrobe-card-equip">Click to equip</div>';
    }

    html += '</div>';
  }

  if (allInCat.length === 0) {
    html += '<div class="profile-wardrobe-empty">No cosmetics in this category yet.</div>';
  }

  html += '</div>';
  el.innerHTML = extraHtml + html;

  // Wire per-piece-type toggle
  var toggleBtn = el.querySelector('#per-piece-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      _perPieceModeActive = !_perPieceModeActive;
      _perPieceSelectedColorIdx = null;
      _renderWardrobeContent(categoryKey);
    });
  }
  var clearAllBtn = el.querySelector('#per-piece-clear-all-btn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function() {
      if (typeof clearPerPieceTypeSkins === 'function') clearPerPieceTypeSkins();
      if (typeof savePerPieceTypeSkins === 'function') savePerPieceTypeSkins({});
      _perPieceSelectedColorIdx = null;
      _renderWardrobeContent(categoryKey);
    });
  }

  // Wire per-piece item clicks
  var pieceItems = el.querySelectorAll('.per-piece-item');
  for (var pi = 0; pi < pieceItems.length; pi++) {
    pieceItems[pi].addEventListener('click', function(e) {
      var idx = parseInt(e.currentTarget.getAttribute('data-piece-idx'), 10);
      _perPieceSelectedColorIdx = (_perPieceSelectedColorIdx === idx) ? null : idx;
      _renderWardrobeContent(categoryKey);
    });
  }

  // Wire per-piece clear buttons
  var pieceClearBtns = el.querySelectorAll('.per-piece-clear-btn');
  for (var pc = 0; pc < pieceClearBtns.length; pc++) {
    pieceClearBtns[pc].addEventListener('click', function(e) {
      e.stopPropagation();
      var idx = parseInt(e.currentTarget.getAttribute('data-piece-idx'), 10);
      var map = (typeof loadPerPieceTypeSkins === 'function') ? loadPerPieceTypeSkins() : {};
      delete map[idx];
      if (typeof savePerPieceTypeSkins === 'function') savePerPieceTypeSkins(map);
      _renderWardrobeContent(categoryKey);
    });
  }

  // Wire animated skin picker clicks
  var pickOptions = el.querySelectorAll('.anim-pick-option');
  for (var pq = 0; pq < pickOptions.length; pq++) {
    pickOptions[pq].addEventListener('click', function(e) {
      var skinKey = e.currentTarget.getAttribute('data-pick-skin');
      var idx = parseInt(e.currentTarget.getAttribute('data-pick-idx'), 10);
      var map = (typeof loadPerPieceTypeSkins === 'function') ? loadPerPieceTypeSkins() : {};
      if (skinKey) {
        map[idx] = skinKey;
      } else {
        delete map[idx];
      }
      if (typeof savePerPieceTypeSkins === 'function') savePerPieceTypeSkins(map);
      _renderWardrobeContent(categoryKey);
    });
  }

  // Wire click handlers for equip/unequip (only in global mode)
  var cards = el.querySelectorAll('.profile-wardrobe-card:not(.profile-wardrobe-locked)');
  for (var j = 0; j < cards.length; j++) {
    cards[j].addEventListener('click', _onWardrobeCardClick);
  }

  // Start animated preview loop if there are any animated skins visible.
  var animCanvases = el.querySelectorAll('.skin-preview-canvas[data-animated-skin]');
  if (animCanvases.length > 0) {
    _startAnimPreviewLoop();
  }
}

function _getUnlockHint(cosmetic) {
  if (!cosmetic.unlockCondition) return 'Default';
  var cond = cosmetic.unlockCondition;
  switch (cond.type) {
    case 'level':       return 'Reach Level ' + cond.value;
    case 'prestige':    return 'Prestige ' + cond.value;
    case 'achievement': return 'Achievement: ' + cond.value;
    case 'mastery': {
      var tierLabel = cond.tier ? cond.tier.charAt(0).toUpperCase() + cond.tier.slice(1) : '';
      var modeLabel = cond.mode ? cond.mode.charAt(0).toUpperCase() + cond.mode.slice(1) : '';
      return modeLabel + ' ' + tierLabel + ' Mastery';
    }
    case 'season':              return 'Season reward';
    case 'boss_defeat':         return 'Defeat the ' + cond.value.replace(/_/g, ' ');
    case 'infinite_depths_floor': return 'Reach Depths Floor ' + cond.value;
    case 'seasonal':            return 'Limited-time event';
    default:                    return 'Locked';
  }
}

function _onWardrobeCardClick(e) {
  var card = e.currentTarget;
  var cosId = card.getAttribute('data-cosmetic-id');
  var catKey = card.getAttribute('data-cosmetic-cat');
  if (!cosId || !catKey) return;

  // If already equipped, unequip
  var equipped = typeof getEquipped === 'function' ? getEquipped(catKey) : null;
  if (equipped && equipped.id === cosId) {
    if (typeof unequipCosmetic === 'function') unequipCosmetic(catKey);
  } else {
    if (typeof equipCosmetic === 'function') equipCosmetic(cosId);
  }

  // Re-render wardrobe and equipped section
  _renderWardrobeContent(catKey);
  var equippedEl = document.getElementById('profile-equipped-section');
  if (equippedEl) equippedEl.innerHTML = _renderEquippedCosmetics();
}

// ── History tab ───────────────────────────────────────────────────────────────

var _historyModeFilter = 'all';

var _HISTORY_MODES = [
  { key: 'all',      label: 'All' },
  { key: 'classic',  label: 'Classic' },
  { key: 'sprint',   label: 'Sprint' },
  { key: 'blitz',    label: 'Blitz' },
  { key: 'daily',    label: 'Daily' },
  { key: 'survival', label: 'Survival' },
  { key: 'battle',   label: 'Battle' },
  { key: 'puzzle',   label: 'Puzzle' },
];

var _HISTORY_MODE_COLORS = {
  classic:  '#4fc3f7',
  sprint:   '#81c784',
  blitz:    '#ff8a65',
  daily:    '#ffd740',
  weekly:   '#ce93d8',
  survival: '#a5d6a7',
  battle:   '#ef9a9a',
  puzzle:   '#b39ddb',
  all:      '#4fc3f7',
};

function _historyISODateMinus(days) {
  var d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function _historyDatesRange(days) {
  var dates = [];
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function _renderHistoryTab() {
  var history = typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];

  var html = '<div class="ph-top-bar">';
  html += '<div class="ph-section-title">PLAY HISTORY</div>';
  html += '<div class="ph-mode-filter">';
  for (var i = 0; i < _HISTORY_MODES.length; i++) {
    var m = _HISTORY_MODES[i];
    var active = m.key === _historyModeFilter ? ' ph-filter-active' : '';
    html += '<button class="ph-filter-btn' + active + '" data-ph-mode="' + m.key + '">' + m.label + '</button>';
  }
  html += '</div></div>';

  if (history.length === 0) {
    html += '<div class="ph-empty">No sessions recorded yet. Play a game to see your history!</div>';
    return html;
  }

  html += '<div class="ph-charts-grid">';
  html += '<div class="ph-chart-box ph-chart-trend"><div class="ph-chart-title">Score Trend (Last 30 Days)</div><canvas id="ph-canvas-trend" width="480" height="160"></canvas></div>';
  html += '<div class="ph-chart-box ph-chart-donut"><div class="ph-chart-title">Mode Distribution</div><canvas id="ph-canvas-donut" width="200" height="160"></canvas></div>';
  html += '</div>';
  html += '<div class="ph-chart-box ph-chart-heatmap"><div class="ph-chart-title">Play Frequency (Last 90 Days)</div><div id="ph-heatmap-container"></div></div>';
  html += '<div class="ph-recent-title">RECENT SESSIONS</div>';
  html += _renderSessionTable(history, _historyModeFilter);

  return html;
}

function _renderSessionTable(history, modeFilter) {
  var filtered = modeFilter === 'all' ? history : history.filter(function(s) { return s.mode === modeFilter; });
  var recent = filtered.slice(0, 10);

  if (recent.length === 0) {
    return '<div class="ph-empty">No sessions for this mode yet.</div>';
  }

  var html = '<div class="ph-table-wrap"><table class="ph-table">';
  html += '<thead><tr><th>Date</th><th>Mode</th><th>Score</th><th>Lines</th><th>Duration</th><th>Result</th></tr></thead><tbody>';
  for (var i = 0; i < recent.length; i++) {
    var s = recent[i];
    var mins = Math.floor((s.durationSecs || 0) / 60);
    var secs = (s.durationSecs || 0) % 60;
    var durStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
    var modeColor = _HISTORY_MODE_COLORS[s.mode] || '#aaa';
    html += '<tr>';
    html += '<td>' + _escProfileHtml(s.date) + '</td>';
    html += '<td><span class="ph-mode-badge" style="color:' + modeColor + '">' + _escProfileHtml(s.mode) + '</span></td>';
    html += '<td>' + (s.score || 0).toLocaleString() + '</td>';
    html += '<td>' + (s.lines || 0) + '</td>';
    html += '<td>' + durStr + '</td>';
    html += '<td>' + _escProfileHtml(s.result || '—') + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function _drawTrendChart(history, modeFilter) {
  var canvas = document.getElementById('ph-canvas-trend');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  var dates = _historyDatesRange(30);
  var filtered = modeFilter === 'all' ? history : history.filter(function(s) { return s.mode === modeFilter; });

  // Best score per day
  var scoreByDate = {};
  for (var i = 0; i < filtered.length; i++) {
    var s = filtered[i];
    if (!scoreByDate[s.date] || s.score > scoreByDate[s.date]) {
      scoreByDate[s.date] = s.score;
    }
  }

  var values = dates.map(function(d) { return scoreByDate[d] || 0; });
  var maxVal = Math.max.apply(null, values) || 1;

  var padL = 44, padR = 8, padT = 10, padB = 28;
  var chartW = W - padL - padR;
  var chartH = H - padT - padB;

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (var gi = 0; gi <= 4; gi++) {
    var gy = padT + chartH - (gi / 4) * chartH;
    ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + chartW, gy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round((gi / 4) * maxVal).toLocaleString(), padL - 3, gy + 3);
  }

  // X-axis labels (every 7 days)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  for (var di = 0; di < dates.length; di += 7) {
    var dx = padL + (di / (dates.length - 1)) * chartW;
    ctx.fillText(dates[di].slice(5), dx, H - padB + 12);
  }

  var color = _HISTORY_MODE_COLORS[modeFilter] || '#4fc3f7';

  // Area fill
  ctx.beginPath();
  for (var vi = 0; vi < values.length; vi++) {
    var vx = padL + (vi / (values.length - 1)) * chartW;
    var vy = padT + chartH - (values[vi] / maxVal) * chartH;
    if (vi === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
  }
  ctx.lineTo(padL + chartW, padT + chartH);
  ctx.lineTo(padL, padT + chartH);
  ctx.closePath();
  ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba');
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (var li = 0; li < values.length; li++) {
    var lx = padL + (li / (values.length - 1)) * chartW;
    var ly = padT + chartH - (values[li] / maxVal) * chartH;
    if (li === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
  }
  ctx.stroke();

  // Dots on non-zero days
  for (var pi = 0; pi < values.length; pi++) {
    if (values[pi] > 0) {
      var px = padL + (pi / (values.length - 1)) * chartW;
      var py = padT + chartH - (values[pi] / maxVal) * chartH;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

function _drawDonutChart(history) {
  var canvas = document.getElementById('ph-canvas-donut');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Count by mode
  var counts = {};
  for (var i = 0; i < history.length; i++) {
    var m = history[i].mode || 'classic';
    counts[m] = (counts[m] || 0) + 1;
  }

  var modes = Object.keys(counts);
  if (modes.length === 0) return;

  var total = history.length;
  var cx = 70, cy = H / 2, outerR = 58, innerR = 30;
  var startAngle = -Math.PI / 2;

  for (var j = 0; j < modes.length; j++) {
    var modeKey = modes[j];
    var slice = (counts[modeKey] / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, startAngle + slice);
    ctx.closePath();
    ctx.fillStyle = _HISTORY_MODE_COLORS[modeKey] || '#aaa';
    ctx.fill();
    startAngle += slice;
  }

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  // Center label
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(total, cx, cy + 4);

  // Legend
  var legendX = 142, legendY = 16;
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  for (var k = 0; k < modes.length; k++) {
    var lm = modes[k];
    var lc = _HISTORY_MODE_COLORS[lm] || '#aaa';
    var pct = Math.round((counts[lm] / total) * 100);
    ctx.fillStyle = lc;
    ctx.fillRect(legendX, legendY + k * 18, 10, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(lm + ' ' + pct + '%', legendX + 14, legendY + k * 18 + 9);
  }
}

function _renderHeatmap(history) {
  var container = document.getElementById('ph-heatmap-container');
  if (!container) return;

  var dates = _historyDatesRange(91);
  // Count by date
  var countByDate = {};
  for (var i = 0; i < history.length; i++) {
    var d = history[i].date;
    if (d) countByDate[d] = (countByDate[d] || 0) + 1;
  }
  var maxCount = Math.max.apply(null, Object.keys(countByDate).map(function(k) { return countByDate[k]; }).concat([1]));

  // Build week columns: group days into weeks
  var firstDate = new Date(dates[0]);
  var dayOfWeek = firstDate.getDay(); // 0=Sun
  // Pad start so week starts on Sunday
  var padded = [];
  for (var p = 0; p < dayOfWeek; p++) padded.push(null);
  for (var q = 0; q < dates.length; q++) padded.push(dates[q]);

  var weeks = [];
  for (var w = 0; w < padded.length; w += 7) {
    weeks.push(padded.slice(w, w + 7));
  }

  var html = '<div class="ph-heatmap">';
  // Day labels
  html += '<div class="ph-heatmap-labels">';
  var dayLabels = ['S','M','T','W','T','F','S'];
  for (var dl = 0; dl < 7; dl++) {
    html += '<div class="ph-heatmap-day-label">' + dayLabels[dl] + '</div>';
  }
  html += '</div>';

  html += '<div class="ph-heatmap-grid">';
  for (var wi = 0; wi < weeks.length; wi++) {
    html += '<div class="ph-heatmap-week">';
    for (var di = 0; di < 7; di++) {
      var date = weeks[wi][di];
      if (!date) {
        html += '<div class="ph-heatmap-cell ph-heatmap-empty"></div>';
      } else {
        var cnt = countByDate[date] || 0;
        var intensity = cnt === 0 ? 0 : Math.ceil((cnt / maxCount) * 4);
        var title = date + (cnt > 0 ? ': ' + cnt + ' game' + (cnt > 1 ? 's' : '') : ': no games');
        html += '<div class="ph-heatmap-cell ph-heatmap-l' + intensity + '" title="' + title + '"></div>';
      }
    }
    html += '</div>';
  }
  html += '</div></div>';

  container.innerHTML = html;
}

function _renderHistoryContent() {
  var histEl = document.getElementById('profile-history-content');
  if (!histEl) return;
  histEl.innerHTML = _renderHistoryTab();

  var history = typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];
  _drawTrendChart(history, _historyModeFilter);
  _drawDonutChart(history);
  _renderHeatmap(history);

  // Wire mode filter buttons
  var btns = histEl.querySelectorAll('.ph-filter-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener('click', function(e) {
      _historyModeFilter = e.currentTarget.getAttribute('data-ph-mode') || 'all';
      var allBtns = document.querySelectorAll('.ph-filter-btn');
      for (var j = 0; j < allBtns.length; j++) {
        allBtns[j].classList.toggle('ph-filter-active', allBtns[j].getAttribute('data-ph-mode') === _historyModeFilter);
      }
      // Redraw trend chart and session table
      var hist2 = typeof loadSessionHistory === 'function' ? loadSessionHistory() : [];
      _drawTrendChart(hist2, _historyModeFilter);
      var tableEl = histEl.querySelector('.ph-table-wrap') || histEl.querySelector('.ph-empty');
      if (tableEl && tableEl.parentNode) {
        var newTable = document.createElement('div');
        newTable.innerHTML = _renderSessionTable(hist2, _historyModeFilter);
        tableEl.parentNode.replaceChild(newTable.firstChild || newTable, tableEl);
      }
    });
  }
}

// ── Main render + open/close ──────────────────────────────────────────────────

var _profileMainTab = 'wardrobe'; // 'wardrobe' | 'history'

function _renderProfileMainTabs() {
  return '<div class="profile-main-tabs">' +
    '<button class="profile-main-tab' + (_profileMainTab === 'wardrobe' ? ' profile-main-tab-active' : '') + '" data-main-tab="wardrobe">Wardrobe</button>' +
    '<button class="profile-main-tab' + (_profileMainTab === 'history' ? ' profile-main-tab-active' : '') + '" data-main-tab="history">&#128202; History</button>' +
  '</div>';
}

function _renderProfileShowcaseLauncher() {
  var unlocked = typeof loadAchievements === 'function' ? loadAchievements() : {};
  var unlockedCount = Object.keys(unlocked).length;
  var featuredId = typeof loadFeaturedBadge === 'function' ? loadFeaturedBadge() : null;
  var featuredAch = featuredId && typeof ACHIEVEMENTS !== 'undefined'
    ? ACHIEVEMENTS.find(function (a) { return a.id === featuredId; }) : null;

  var html = '<div class="profile-showcase-launcher">';
  html += '<div class="profile-section-title">ACHIEVEMENT SHOWCASE</div>';
  html += '<div class="profile-showcase-summary">';
  html += '<span class="psl-badge-count">' + unlockedCount + ' badges earned</span>';
  if (featuredAch) {
    html += '<span class="psl-featured">Featured: ' + featuredAch.icon + ' ' + _escProfileHtml(featuredAch.name) + '</span>';
  } else {
    html += '<span class="psl-featured psl-featured-none">No featured badge set</span>';
  }
  html += '</div>';
  html += '<div class="profile-showcase-btns">';
  html += '<button class="profile-showcase-open-btn" id="profile-showcase-open-btn">&#127942; View Showcase</button>';
  html += '<button class="profile-showcase-share-btn" id="profile-showcase-dl-btn">&#128247; Share Card</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderProfilePage() {
  var body = document.getElementById('profile-page-body');
  if (!body) return;

  var html = '';
  html += _renderProfileHeader();
  html += _renderProfileStats();
  html += '<div id="profile-equipped-section">' + _renderEquippedCosmetics() + '</div>';
  html += _renderMasteryBadges();
  html += _renderProfileShowcaseLauncher();
  html += _renderProfileMainTabs();
  html += '<div id="profile-wardrobe-section"' + (_profileMainTab === 'history' ? ' style="display:none"' : '') + '>';
  html += _renderWardrobeTabs();
  html += '</div>';
  html += '<div id="profile-history-content"' + (_profileMainTab === 'wardrobe' ? ' style="display:none"' : '') + '></div>';

  body.innerHTML = html;

  // Wire showcase launcher buttons
  var showcaseOpenBtn = body.querySelector('#profile-showcase-open-btn');
  if (showcaseOpenBtn) {
    showcaseOpenBtn.addEventListener('click', function () {
      if (typeof openAchievementShowcase === 'function') openAchievementShowcase();
    });
  }
  var showcaseDlBtn = body.querySelector('#profile-showcase-dl-btn');
  if (showcaseDlBtn) {
    showcaseDlBtn.addEventListener('click', function () {
      if (typeof downloadProfileCard === 'function') downloadProfileCard();
    });
  }

  // Wire main tab clicks
  var mainTabs = body.querySelectorAll('.profile-main-tab');
  for (var mt = 0; mt < mainTabs.length; mt++) {
    mainTabs[mt].addEventListener('click', function(e) {
      _profileMainTab = e.currentTarget.getAttribute('data-main-tab') || 'wardrobe';
      var allMainTabs = document.querySelectorAll('.profile-main-tab');
      for (var k = 0; k < allMainTabs.length; k++) {
        allMainTabs[k].classList.toggle('profile-main-tab-active', allMainTabs[k].getAttribute('data-main-tab') === _profileMainTab);
      }
      var wardrobeEl = document.getElementById('profile-wardrobe-section');
      var historyEl = document.getElementById('profile-history-content');
      if (wardrobeEl) wardrobeEl.style.display = _profileMainTab === 'wardrobe' ? '' : 'none';
      if (historyEl) historyEl.style.display = _profileMainTab === 'history' ? '' : 'none';
      if (_profileMainTab === 'history') _renderHistoryContent();
    });
  }

  if (_profileMainTab === 'wardrobe') {
    // Render initial wardrobe tab
    _renderWardrobeContent(_profileActiveTab);
  } else {
    _renderHistoryContent();
  }

  // Wire mastery card clicks
  var masteryCards = body.querySelectorAll('.profile-mastery-card');
  for (var mi = 0; mi < masteryCards.length; mi++) {
    masteryCards[mi].addEventListener('click', function (e) {
      var modeKey = e.currentTarget.getAttribute('data-mode');
      if (!modeKey) return;
      var detailEl = document.getElementById('profile-mastery-detail');
      var isOpen = detailEl && detailEl.style.display !== 'none' &&
                   detailEl.getAttribute('data-active-mode') === modeKey;
      if (isOpen) {
        if (detailEl) detailEl.style.display = 'none';
      } else {
        _renderMasteryDetail(modeKey);
      }
      // Toggle active state
      var allCards = document.querySelectorAll('.profile-mastery-card');
      for (var k = 0; k < allCards.length; k++) {
        allCards[k].classList.toggle('profile-mastery-card-active', allCards[k].getAttribute('data-mode') === modeKey && !isOpen);
      }
    });
  }

  // Wire wardrobe tab clicks
  var tabs = body.querySelectorAll('.profile-tab-btn');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function (e) {
      var tabKey = e.currentTarget.getAttribute('data-profile-tab');
      if (!tabKey) return;
      _profileActiveTab = tabKey;
      // Update active tab styling
      var allTabs = document.querySelectorAll('.profile-tab-btn');
      for (var j = 0; j < allTabs.length; j++) {
        allTabs[j].classList.toggle('profile-tab-active', allTabs[j].getAttribute('data-profile-tab') === tabKey);
      }
      _renderWardrobeContent(tabKey);
    });
  }
}

function openProfilePage() {
  renderProfilePage();
  var el = document.getElementById('profile-overlay');
  if (el) el.style.display = 'flex';
}

function closeProfilePage() {
  var el = document.getElementById('profile-overlay');
  if (el) el.style.display = 'none';
}
