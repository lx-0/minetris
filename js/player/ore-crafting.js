// Ore Pattern Crafting System
// Detects ore block patterns in cleared rows and triggers temporary power-ups.
// Requires: state.js, config.js, world.js, lineclear.js (hook), game-loop.js (hook)
//
// Ore mappings (Minecraft analogy → in-game material):
//   Iron ore    → stone   (grey,  0x808080)
//   Gold ore    → gold    (yellow, 0xffff00)
//   Diamond ore → diamond (deep blue, 0x1a237e)
//   Redstone ore→ lava    (red,   0xff0000)
//   Emerald ore → moss    (green, 0x008000)
//
// Recipes:
//   3 Iron in a row  → Shield (absorbs next death)
//   2 Gold adjacent  → Speed Boost (1.5× line-clear score for 30 s)
//   3 Diamond L-shape→ Line Bomb (clears bottom 2 rows)
//   2 Redstone diag  → Slow Time (50% fall speed for 15 s)
//   4 Emerald square → Wild Card (choose next piece type)

// ── Power-up definitions ──────────────────────────────────────────────────────
const ORE_POWERUP_DEFS = {
  ore_shield:      { icon: '\uD83D\uDEE1', name: 'Ore Shield',   color: '#4fc3f7', duration: 0  },
  ore_speed_boost: { icon: '\u26A1',       name: 'Speed Boost',  color: '#ffee58', duration: 30 },
  ore_line_bomb:   { icon: '\uD83D\uDCA5', name: 'Line Bomb',    color: '#ef5350', duration: 0  },
  ore_slow_time:   { icon: '\uD83C\uDF00', name: 'Slow Time',    color: '#ce93d8', duration: 15 },
  ore_wild_card:   { icon: '\uD83C\uDFB4', name: 'Wild Card',    color: '#a5d6a7', duration: 0  },
};

// ── Active state ──────────────────────────────────────────────────────────────
let oreActivePowerup    = null;   // key from ORE_POWERUP_DEFS, or null
let oreSpeedBoostActive = false;
let oreSpeedBoostTimer  = 0;
let oreSlowTimeActive   = false;
let oreSlowTimeTimer    = 0;
let oreWildCardPending  = false;
let _oreHudTimer        = 0;
let _oreHudMaxTimer     = 0;

// ── Ore material → recipe mapping ─────────────────────────────────────────────
const _ORE_RECIPES = [
  { ore: 'stone',   powerup: 'ore_shield',      desc: '3 Iron in a row',     check: _checkIronRow      },
  { ore: 'gold',    powerup: 'ore_speed_boost',  desc: '2 Gold adjacent',     check: _checkGoldAdjacent },
  { ore: 'diamond', powerup: 'ore_line_bomb',    desc: '3 Diamond L-shape',   check: _checkDiamondL     },
  { ore: 'lava',    powerup: 'ore_slow_time',    desc: '2 Redstone diagonal', check: _checkRedstoneDiag },
  { ore: 'moss',    powerup: 'ore_wild_card',    desc: '4 Emerald square',    check: _checkEmeraldSquare},
];

// ─────────────────────────────────────────────────────────────────────────────
// Pattern checkers — each takes an array of { x, z } positions at the same Y
// ─────────────────────────────────────────────────────────────────────────────

function _checkIronRow(positions) {
  if (positions.length < 3) return false;
  // 3 consecutive same-Z blocks (row along X axis)
  var byZ = {};
  positions.forEach(function (p) { (byZ[p.z] = byZ[p.z] || []).push(p.x); });
  for (var z in byZ) {
    var xs = byZ[z].sort(function (a, b) { return a - b; });
    for (var i = 0; i <= xs.length - 3; i++) {
      if (xs[i+1] === xs[i]+1 && xs[i+2] === xs[i]+2) return true;
    }
  }
  // 3 consecutive same-X blocks (row along Z axis)
  var byX = {};
  positions.forEach(function (p) { (byX[p.x] = byX[p.x] || []).push(p.z); });
  for (var x in byX) {
    var zs = byX[x].sort(function (a, b) { return a - b; });
    for (var j = 0; j <= zs.length - 3; j++) {
      if (zs[j+1] === zs[j]+1 && zs[j+2] === zs[j]+2) return true;
    }
  }
  return false;
}

function _checkGoldAdjacent(positions) {
  if (positions.length < 2) return false;
  for (var i = 0; i < positions.length; i++) {
    for (var j = i + 1; j < positions.length; j++) {
      var dx = Math.abs(positions[i].x - positions[j].x);
      var dz = Math.abs(positions[i].z - positions[j].z);
      if (dx + dz === 1) return true;
    }
  }
  return false;
}

function _checkDiamondL(positions) {
  if (positions.length < 3) return false;
  for (var i = 0; i < positions.length - 2; i++) {
    for (var j = i + 1; j < positions.length - 1; j++) {
      for (var k = j + 1; k < positions.length; k++) {
        if (_isLShape([positions[i], positions[j], positions[k]])) return true;
      }
    }
  }
  return false;
}

function _isLShape(pts) {
  // For each candidate corner, the other 2 blocks must each be distance-1
  // from the corner and perpendicular to each other.
  for (var c = 0; c < 3; c++) {
    var corner = pts[c];
    var a = pts[(c + 1) % 3];
    var b = pts[(c + 2) % 3];
    var dxa = a.x - corner.x, dza = a.z - corner.z;
    var dxb = b.x - corner.x, dzb = b.z - corner.z;
    if (Math.abs(dxa) + Math.abs(dza) !== 1) continue;
    if (Math.abs(dxb) + Math.abs(dzb) !== 1) continue;
    if (dxa * dxb + dza * dzb === 0) return true;  // perpendicular
  }
  return false;
}

function _checkRedstoneDiag(positions) {
  if (positions.length < 2) return false;
  for (var i = 0; i < positions.length; i++) {
    for (var j = i + 1; j < positions.length; j++) {
      var dx = Math.abs(positions[i].x - positions[j].x);
      var dz = Math.abs(positions[i].z - positions[j].z);
      if (dx === 1 && dz === 1) return true;
    }
  }
  return false;
}

function _checkEmeraldSquare(positions) {
  if (positions.length < 4) return false;
  var posSet = new Set(positions.map(function (p) { return p.x + ',' + p.z; }));
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    if (posSet.has((p.x+1) + ',' + p.z) &&
        posSet.has(p.x + ',' + (p.z+1)) &&
        posSet.has((p.x+1) + ',' + (p.z+1))) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point — called from checkLineClear with the blocks being cleared
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan cleared blocks for ore patterns; trigger at most one power-up.
 * @param {THREE.Mesh[]} clearedBlocks  Blocks being removed in this line clear.
 */
function checkOreCraftingPatterns(clearedBlocks) {
  if (!clearedBlocks || !clearedBlocks.length) return;

  // Group by Y level, then by material type
  var byY = {};
  clearedBlocks.forEach(function (block) {
    var gp  = block.userData.gridPos;
    var mat = block.userData.materialType;
    if (!gp || !mat) return;
    var yKey = gp.y;
    if (!byY[yKey]) byY[yKey] = {};
    if (!byY[yKey][mat]) byY[yKey][mat] = [];
    byY[yKey][mat].push({ x: gp.x, z: gp.z });
  });

  for (var yKey in byY) {
    var matMap = byY[yKey];
    for (var r = 0; r < _ORE_RECIPES.length; r++) {
      var recipe    = _ORE_RECIPES[r];
      var positions = matMap[recipe.ore];
      if (!positions) continue;
      if (recipe.check(positions)) {
        _triggerOrePowerup(recipe.powerup);
        return; // one power-up per line clear
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Power-up activation
// ─────────────────────────────────────────────────────────────────────────────

function _triggerOrePowerup(type) {
  var def = ORE_POWERUP_DEFS[type];
  if (!def) return;

  // Cancel any existing timed ore effect (only one active at a time)
  oreSpeedBoostActive = false;
  oreSpeedBoostTimer  = 0;
  oreSlowTimeActive   = false;
  oreSlowTimeTimer    = 0;
  oreWildCardPending  = false;
  var wildcardEl = document.getElementById('ore-wildcard-ui');
  if (wildcardEl) wildcardEl.style.display = 'none';

  oreActivePowerup = type;

  switch (type) {
    case 'ore_shield':
      // Reuse existing shield mechanism — absorbs next death
      shieldActive = true;
      _showOreBanner(def.icon + ' ' + def.name + '! Absorbs next death.', def.color);
      // Shield has no timer; consumed when death is absorbed
      oreActivePowerup = null;  // hide HUD (effect is tracked by shieldActive)
      break;

    case 'ore_speed_boost':
      oreSpeedBoostActive = true;
      oreSpeedBoostTimer  = def.duration;
      _oreHudTimer        = def.duration;
      _oreHudMaxTimer     = def.duration;
      _showOreBanner(def.icon + ' ' + def.name + '! 1.5\u00d7 score for 30s.', def.color);
      break;

    case 'ore_line_bomb':
      _applyOreLineBomb();
      oreActivePowerup = null;
      _showOreBanner(def.icon + ' ' + def.name + '! Bottom 2 rows cleared!', def.color);
      break;

    case 'ore_slow_time':
      oreSlowTimeActive = true;
      oreSlowTimeTimer  = def.duration;
      _oreHudTimer      = def.duration;
      _oreHudMaxTimer   = def.duration;
      // Reuse existing slowDown mechanism (set/extend timer; game loop ticks it down)
      slowDownActive = true;
      slowDownTimer  = Math.max(slowDownTimer || 0, def.duration);
      _showOreBanner(def.icon + ' ' + def.name + '! 50% fall speed for 15s.', def.color);
      break;

    case 'ore_wild_card':
      oreWildCardPending = true;
      _showOreBanner(def.icon + ' ' + def.name + '! Choose your next piece.', def.color);
      _showWildCardUI();
      break;
  }

  // Visual feedback: short chromatic-aberration pulse
  if (typeof triggerChromaticAberration === 'function' &&
      !(typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled)) {
    triggerChromaticAberration(0.008, 0.40);
  }

  updateOrePowerupHUD();
}

// ── Line Bomb: remove the 2 lowest occupied Y levels ──────────────────────────
function _applyOreLineBomb() {
  var levels = Array.from(gridOccupancy.keys()).sort(function (a, b) { return a - b; });
  var toLevels = levels.slice(0, 2);
  if (!toLevels.length) return;

  toLevels.forEach(function (gy) {
    var toRemove = worldGroup.children.filter(function (b) {
      var gp = b.userData.gridPos;
      return gp && gp.y === gy;
    });
    toRemove.forEach(function (block) {
      if (typeof spawnDustParticles === 'function') spawnDustParticles(block, { breakBurst: true });
      if (typeof unregisterBlock === 'function') unregisterBlock(block);
      if (typeof disposeBlock    === 'function') disposeBlock(block);
      worldGroup.remove(block);
    });
  });
}

// ── Banner ──────────────────────────────────────────────────────────────────
function _showOreBanner(text, color) {
  var banner = document.getElementById('ore-craft-banner');
  if (!banner) return;
  banner.textContent = text;
  banner.style.color  = color || '#4fc3f7';
  banner.classList.remove('ore-banner-in');
  void banner.offsetWidth; // reflow to restart animation
  banner.classList.add('ore-banner-in');
  banner.style.display = 'block';
  // Auto-hide after 2.4 s
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(function () {
    banner.style.display = 'none';
    banner.classList.remove('ore-banner-in');
  }, 2400);
}

// ─────────────────────────────────────────────────────────────────────────────
// Speed Boost multiplier — called from checkLineClear
// ─────────────────────────────────────────────────────────────────────────────

/** Return 1.5 during Speed Boost, 1.0 otherwise. */
function getOreSpeedBoostMult() {
  return oreSpeedBoostActive ? 1.5 : 1.0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wild Card UI
// ─────────────────────────────────────────────────────────────────────────────

// Piece type display info (index 1–7 matching COLORS/SHAPES)
var _PIECE_LABELS = [
  null,
  { name: 'T',  color: '#8b4513' },
  { name: 'J',  color: '#808080' },
  { name: 'O',  color: '#ffff00' },
  { name: 'I',  color: '#00ffff' },
  { name: 'S',  color: '#008000' },
  { name: 'Z',  color: '#ff0000' },
  { name: 'L',  color: '#800080' },
];

function _showWildCardUI() {
  var ui = document.getElementById('ore-wildcard-ui');
  if (!ui) return;
  // Build piece buttons
  var grid = document.getElementById('ore-wildcard-grid');
  if (grid) {
    grid.innerHTML = '';
    for (var idx = 1; idx <= 7; idx++) {
      var def = _PIECE_LABELS[idx];
      if (!def) continue;
      (function (colorIndex, pDef) {
        var btn = document.createElement('button');
        btn.className = 'ore-wildcard-btn';
        btn.style.borderColor = pDef.color;
        btn.style.boxShadow   = '0 0 8px ' + pDef.color + '88';
        btn.innerHTML =
          '<span style="display:block;width:16px;height:16px;background:' + pDef.color +
          ';border-radius:3px;margin:0 auto 4px;"></span>' + pDef.name;
        btn.addEventListener('click', function () { oreWildCardSelectPiece(colorIndex); });
        grid.appendChild(btn);
      })(idx, def);
    }
  }
  // Release pointer lock so the cursor is usable
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();
  ui.style.display = 'flex';
}

function _hideWildCardUI() {
  var ui = document.getElementById('ore-wildcard-ui');
  if (ui) ui.style.display = 'none';
  oreWildCardPending = false;
  oreActivePowerup   = null;
  updateOrePowerupHUD();
  // Re-lock controls
  if (typeof controls !== 'undefined' && controls && !controls.isLocked &&
      typeof isGameOver !== 'undefined' && !isGameOver) {
    controls.lock();
  }
}

/**
 * Called when the player picks a piece type from the Wild Card picker.
 * @param {number} colorIndex  1–7
 */
function oreWildCardSelectPiece(colorIndex) {
  if (typeof pieceQueue !== 'undefined' && pieceQueue.length > 0 &&
      typeof SHAPES !== 'undefined' && SHAPES[colorIndex]) {
    pieceQueue[0] = { index: colorIndex, shape: SHAPES[colorIndex] };
    if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
  }
  _hideWildCardUI();
}

// ─────────────────────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────────────────────

function updateOrePowerupHUD() {
  var hudEl = document.getElementById('ore-powerup-hud');
  if (!hudEl) return;

  if (!oreActivePowerup) {
    hudEl.style.display = 'none';
    return;
  }

  var def = ORE_POWERUP_DEFS[oreActivePowerup];
  if (!def) { hudEl.style.display = 'none'; return; }

  hudEl.style.display     = 'flex';
  hudEl.style.borderColor = def.color;
  hudEl.style.boxShadow   = '0 0 10px ' + def.color + '66';

  var iconEl   = document.getElementById('ore-powerup-icon');
  var nameEl   = document.getElementById('ore-powerup-name');
  var timerWrp = document.getElementById('ore-powerup-timer-wrap');
  var barEl    = document.getElementById('ore-powerup-bar');

  if (iconEl) iconEl.textContent = def.icon;
  if (nameEl) { nameEl.textContent = def.name; nameEl.style.color = def.color; }

  if (def.duration > 0 && timerWrp && barEl) {
    timerWrp.style.display = 'block';
    var frac = _oreHudMaxTimer > 0 ? (_oreHudTimer / _oreHudMaxTimer) : 0;
    barEl.style.width      = (Math.max(0, frac) * 100).toFixed(1) + '%';
    barEl.style.background = def.color;
  } else if (timerWrp) {
    timerWrp.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-frame update — called from game-loop.js
// ─────────────────────────────────────────────────────────────────────────────

function updateOreCrafting(delta) {
  if (oreSpeedBoostActive) {
    oreSpeedBoostTimer -= delta;
    _oreHudTimer = oreSpeedBoostTimer;
    if (oreSpeedBoostTimer <= 0) {
      oreSpeedBoostActive = false;
      oreSpeedBoostTimer  = 0;
      if (oreActivePowerup === 'ore_speed_boost') oreActivePowerup = null;
    }
    updateOrePowerupHUD();
  }

  if (oreSlowTimeActive) {
    oreSlowTimeTimer -= delta;
    _oreHudTimer = oreSlowTimeTimer;
    if (oreSlowTimeTimer <= 0) {
      oreSlowTimeActive = false;
      oreSlowTimeTimer  = 0;
      if (oreActivePowerup === 'ore_slow_time') oreActivePowerup = null;
    }
    updateOrePowerupHUD();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset — called from gamestate-reset.js
// ─────────────────────────────────────────────────────────────────────────────

function resetOreCrafting() {
  oreActivePowerup    = null;
  oreSpeedBoostActive = false;
  oreSpeedBoostTimer  = 0;
  oreSlowTimeActive   = false;
  oreSlowTimeTimer    = 0;
  oreWildCardPending  = false;
  _oreHudTimer        = 0;
  _oreHudMaxTimer     = 0;

  var hudEl = document.getElementById('ore-powerup-hud');
  if (hudEl) hudEl.style.display = 'none';
  var wildcardEl = document.getElementById('ore-wildcard-ui');
  if (wildcardEl) wildcardEl.style.display = 'none';
  var banner = document.getElementById('ore-craft-banner');
  if (banner) { banner.style.display = 'none'; clearTimeout(banner._hideTimer); }
}
