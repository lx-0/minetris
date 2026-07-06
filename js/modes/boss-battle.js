// Boss Battle mode — defeat Minecraft bosses through Tetris skill.
// Three bosses: Wither (garbage rows), Ender Dragon (queue scramble), Warden (darkness).
// Requires: state.js, lineclear.js, pieces.js, battle/battle-garbage.js,
//           cosmetics.js, leveling.js loaded before this file.

// ── Mode flag (readable externally) ──────────────────────────────────────────
let isBossBattleMode = false;

// ── Active boss state ─────────────────────────────────────────────────────────
let _bossId      = null;   // 'wither' | 'ender_dragon' | 'warden'
let _bossHP      = 0;
let _bossMaxHP   = 0;
let _bossDefeated = false;
let _bossAttackTimer  = 0;   // seconds until next attack
let _bossAttackInterval = 20; // seconds between attacks (difficulty-adjusted)
let _bossDarknessTimer  = 0;  // seconds remaining on warden darkness attack
let _bossBadgeEl = null;     // cached HUD badge element

// ── Pending setTimeout handles — cleared by resetBossBattle() ────────────────
let _bossIntroTimer        = null;  // outer intro hide timer (2800ms)
let _bossBannerTimer       = null;  // attack banner hide timer (2000ms)
let _bossDarknessHideTimer = null;  // darkness overlay fade-out timer (600ms)
let _bossVictoryTimer      = null;  // victory screen show timer (800ms)

// ── Boss definitions ──────────────────────────────────────────────────────────
const BOSS_DEFS = {
  wither: {
    id:          'wither',
    name:        'The Wither',
    icon:        '💀',
    color:       '#888',
    glowColor:   '#aaa',
    baseHP:      100,
    attackLabel: 'Wither Storm',
    description: 'Sends obsidian garbage rows — clear lines to survive.',
    rewardSkin:  'boss_block_skin_wither',
    rewardTitle: 'boss_title_wither_slayer',
  },
  ender_dragon: {
    id:          'ender_dragon',
    name:        'Ender Dragon',
    icon:        '🐉',
    color:       '#9b59b6',
    glowColor:   '#ce8aff',
    baseHP:      150,
    attackLabel: 'Dragon Breath',
    description: 'Scrambles your piece queue — adapt or fall.',
    rewardSkin:  'boss_block_skin_ender',
    rewardTitle: 'boss_title_dragon_slayer',
  },
  warden: {
    id:          'warden',
    name:        'The Warden',
    icon:        '🌑',
    color:       '#1a5276',
    glowColor:   '#5dade2',
    baseHP:      200,
    attackLabel: 'Deep Dark',
    description: 'Plunges the board into darkness — place by memory.',
    rewardSkin:  'boss_block_skin_warden',
    rewardTitle: 'boss_title_warden_walker',
  },
};

// ── Boss attack interval by difficulty ───────────────────────────────────────
// Scales with player level: lower level → longer interval (easier).
function _bossIntervalForLevel(level) {
  // Level 1: 30s, Level 20+: 15s, clamped
  return Math.max(15, 30 - Math.floor((level - 1) * 0.75));
}

// ── HP scaling by player level ────────────────────────────────────────────────
function _scaledHP(baseHP, level) {
  return Math.round(baseHP * (1 + Math.max(0, level - 1) * 0.05));
}

// ── Public: start a boss battle session ──────────────────────────────────────
function startBossBattle(bossId) {
  var def = BOSS_DEFS[bossId];
  if (!def) return;

  isBossBattleMode = true;
  _bossId           = bossId;
  _bossDefeated     = false;
  _bossDarknessTimer = 0;

  var level = (typeof getPlayerLevel === 'function') ? getPlayerLevel() : 1;
  _bossMaxHP        = _scaledHP(def.baseHP, level);
  _bossHP           = _bossMaxHP;
  _bossAttackInterval = _bossIntervalForLevel(level);
  _bossAttackTimer  = _bossAttackInterval;

  // Mark dungeon as ever-played (unlocks boss battle on future visits)
  try { localStorage.setItem('mineCtris_bossUnlocked', 'true'); } catch (_) {}

  _renderBossHUD();
  _showBossIntro(def);
}

// ── Public: reset (called from resetGame) ────────────────────────────────────
function resetBossBattle() {
  // Cancel all pending timers before any state changes so stale callbacks
  // cannot fire on the next battle (e.g. victory screen on a fresh game).
  clearTimeout(_bossIntroTimer);
  clearTimeout(_bossBannerTimer);
  clearTimeout(_bossDarknessHideTimer);
  clearTimeout(_bossVictoryTimer);
  _bossIntroTimer        = null;
  _bossBannerTimer       = null;
  _bossDarknessHideTimer = null;
  _bossVictoryTimer      = null;

  isBossBattleMode   = false;
  _bossId            = null;
  _bossHP            = 0;
  _bossMaxHP         = 0;
  _bossDefeated      = false;
  _bossAttackTimer   = 0;
  _bossDarknessTimer = 0;

  _hideBossHUD();
  _hideDarkness();

  var introEl = document.getElementById('boss-intro-splash');
  if (introEl) {
    introEl.style.display = 'none';
    introEl.classList.remove('boss-intro-visible');
  }
  var victoryEl = document.getElementById('boss-victory-screen');
  if (victoryEl) {
    victoryEl.style.display = 'none';
    victoryEl.classList.remove('bvs-visible');
  }
}

// ── Public: deal damage (called from lineclear.js on each clear) ──────────────
/**
 * @param {number} linesCleared  1-4
 * @param {number} comboCount    current combo count
 * @param {boolean} isTSpin      whether the clearing piece was a T-spin
 */
function bossDealDamage(linesCleared, comboCount, isTSpin) {
  if (!isBossBattleMode || _bossDefeated || _bossHP <= 0) return;

  var LINE_DMG = [0, 10, 30, 50, 80];
  var baseDmg  = LINE_DMG[Math.min(linesCleared, 4)];

  // T-spin bonus: +50%
  if (isTSpin) baseDmg = Math.round(baseDmg * 1.5);

  // Combo bonus: +25% per extra combo level above 1
  if (comboCount >= 2) baseDmg = Math.round(baseDmg * (1 + (comboCount - 1) * 0.25));

  _bossHP = Math.max(0, _bossHP - baseDmg);
  _updateBossHP();

  // Flash the health bar
  _flashBossBar();

  if (_bossHP <= 0) {
    _triggerBossVictory();
  }
}

// ── Public: tick (called from game-loop every frame) ─────────────────────────
function tickBossBattle(delta) {
  if (!isBossBattleMode || _bossDefeated) return;
  if (typeof isGameOver !== 'undefined' && isGameOver) return;
  if (typeof isPaused   !== 'undefined' && isPaused)   return;

  // Tick darkness countdown
  if (_bossDarknessTimer > 0) {
    _bossDarknessTimer -= delta;
    if (_bossDarknessTimer <= 0) {
      _hideDarkness();
    }
  }

  // Tick attack timer
  _bossAttackTimer -= delta;
  if (_bossAttackTimer <= 0) {
    _bossAttackTimer = _bossAttackInterval;
    _triggerBossAttack();
  }

  // Update attack countdown on HUD
  _updateAttackCountdown();
}

// ── Boss intro splash ─────────────────────────────────────────────────────────
function _showBossIntro(def) {
  var el = document.getElementById('boss-intro-splash');
  if (!el) return;

  var iconEl  = el.querySelector('.boss-intro-icon');
  var nameEl  = el.querySelector('.boss-intro-name');
  var descEl  = el.querySelector('.boss-intro-desc');

  if (iconEl) iconEl.textContent = def.icon;
  if (nameEl) { nameEl.textContent = def.name; nameEl.style.color = def.glowColor; }
  if (descEl) descEl.textContent = def.description;

  el.style.display = 'flex';
  requestAnimationFrame(function () { el.classList.add('boss-intro-visible'); });
  _bossIntroTimer = setTimeout(function () {
    el.classList.remove('boss-intro-visible');
    _bossIntroTimer = setTimeout(function () { el.style.display = 'none'; }, 600);
  }, 2800);
}

// ── Boss HUD ──────────────────────────────────────────────────────────────────
function _renderBossHUD() {
  var hud = document.getElementById('boss-hud');
  if (!hud) return;

  var def = BOSS_DEFS[_bossId];

  var nameEl  = document.getElementById('boss-hud-name');
  var iconEl  = document.getElementById('boss-hud-icon');
  var barFill = document.getElementById('boss-hp-fill');

  if (iconEl)  iconEl.textContent  = def ? def.icon : '👾';
  if (nameEl)  { nameEl.textContent = def ? def.name : 'BOSS'; nameEl.style.color = def ? def.glowColor : '#fff'; }
  if (barFill) { barFill.style.width = '100%'; barFill.style.background = def ? def.glowColor : '#e74c3c'; }

  hud.style.display = 'flex';

  _bossBadgeEl = document.getElementById('boss-mode-badge');
  if (_bossBadgeEl) {
    _bossBadgeEl.textContent = (def ? def.icon + ' ' + def.name : 'BOSS') + ' BATTLE';
    _bossBadgeEl.style.display = 'block';
  }
}

function _hideBossHUD() {
  var hud = document.getElementById('boss-hud');
  if (hud) hud.style.display = 'none';
  var badge = document.getElementById('boss-mode-badge');
  if (badge) badge.style.display = 'none';
}

function _updateBossHP() {
  var barFill = document.getElementById('boss-hp-fill');
  var hpText  = document.getElementById('boss-hp-text');
  var pct     = _bossMaxHP > 0 ? (_bossHP / _bossMaxHP) : 0;
  if (barFill) {
    barFill.style.width = (pct * 100).toFixed(1) + '%';
    // Color ramp: green → yellow → red
    var r = Math.round(255 * (1 - pct));
    var g = Math.round(200 * pct);
    barFill.style.background = 'rgb(' + r + ',' + g + ',30)';
  }
  if (hpText) hpText.textContent = _bossHP + ' / ' + _bossMaxHP;
}

function _flashBossBar() {
  var barFill = document.getElementById('boss-hp-fill');
  if (!barFill) return;
  barFill.classList.remove('boss-bar-flash');
  void barFill.offsetWidth; // reflow
  barFill.classList.add('boss-bar-flash');
}

function _updateAttackCountdown() {
  var el = document.getElementById('boss-attack-timer');
  if (!el) return;
  var secs = Math.max(0, Math.ceil(_bossAttackTimer));
  el.textContent = 'Next attack: ' + secs + 's';
  // Red warning when ≤5s
  el.style.color = secs <= 5 ? '#e74c3c' : '#aaa';
}

// ── Boss attacks ──────────────────────────────────────────────────────────────
function _triggerBossAttack() {
  if (!_bossId) return;
  var def = BOSS_DEFS[_bossId];

  // Show attack warning banner
  _showAttackBanner(def ? def.attackLabel : 'BOSS ATTACK');

  switch (_bossId) {
    case 'wither':       _attackWither();      break;
    case 'ender_dragon': _attackEnderDragon(); break;
    case 'warden':       _attackWarden();      break;
  }
}

// Wither: inject 1-2 obsidian garbage rows
function _attackWither() {
  var level = (typeof getPlayerLevel === 'function') ? getPlayerLevel() : 1;
  var rows  = level >= 15 ? 2 : 1;
  var seed  = (Math.random() * 0xffffffff) >>> 0;

  // Reuse battle garbage injection if available, otherwise use our own
  if (typeof _injectBossGarbageRows === 'function') {
    _injectBossGarbageRows(rows, seed);
  } else if (typeof queueGarbage === 'function') {
    queueGarbage(rows, seed);
  }
}

// Ender Dragon: scramble the piece queue
function _attackEnderDragon() {
  if (typeof pieceQueue === 'undefined' || pieceQueue.length < 2) return;
  // Fisher-Yates shuffle of pieceQueue
  for (var i = pieceQueue.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pieceQueue[i];
    pieceQueue[i] = pieceQueue[j];
    pieceQueue[j] = tmp;
  }
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

// Warden: plunge board into darkness for 8 seconds
function _attackWarden() {
  _bossDarknessTimer = 8;
  var overlay = document.getElementById('boss-darkness-overlay');
  if (overlay) {
    overlay.style.display = 'block';
    requestAnimationFrame(function () { overlay.classList.add('boss-darkness-active'); });
  }
}

function _hideDarkness() {
  if (_bossDarknessHideTimer) { clearTimeout(_bossDarknessHideTimer); _bossDarknessHideTimer = null; }
  var overlay = document.getElementById('boss-darkness-overlay');
  if (!overlay) return;
  overlay.classList.remove('boss-darkness-active');
  _bossDarknessHideTimer = setTimeout(function () { overlay.style.display = 'none'; }, 600);
}

// ── Boss garbage row injection (standalone, for when battle-garbage isn't active) ──
function _injectBossGarbageRows(count, gapSeed) {
  // Shift all existing landed blocks upward
  var toShift = [];
  if (typeof worldGroup !== 'undefined') {
    worldGroup.children.forEach(function (obj) {
      if (obj.name === 'landed_block' && obj.userData.gridPos) toShift.push(obj);
    });
  }
  toShift.forEach(function (obj) {
    var gp  = obj.userData.gridPos;
    var key = gp.x + ',' + gp.z;
    var oldLayer = gridOccupancy.get(gp.y);
    if (oldLayer) { oldLayer.delete(key); if (!oldLayer.size) gridOccupancy.delete(gp.y); }
    gp.y += count;
    obj.position.y += count * (typeof BLOCK_SIZE !== 'undefined' ? BLOCK_SIZE : 1);
    obj.userData.boundingBox = null;
    if (!gridOccupancy.has(gp.y)) gridOccupancy.set(gp.y, new Set());
    gridOccupancy.get(gp.y).add(key);
  });

  // Inject dark "wither" rows at bottom
  var seed     = gapSeed >>> 0;
  var xMin = -4, xMax = 4, zMin = -4, zMax = 4;
  var cols = xMax - xMin + 1;
  var THREE_ = (typeof THREE !== 'undefined') ? THREE : null;
  if (!THREE_ || typeof worldGroup === 'undefined') return;

  for (var row = 0; row < count; row++) {
    seed = ((seed * 1664525) + 1013904223) >>> 0;
    var gapCol = seed % cols;
    var gapX   = xMin + gapCol;
    var gridY  = row + 0.5;

    for (var gx = xMin; gx <= xMax; gx++) {
      if (gx === gapX) continue;
      for (var gz = zMin; gz <= zMax; gz++) {
        var geo  = new THREE_.BoxGeometry(1, 1, 1);
        var mat  = new THREE_.MeshStandardMaterial({
          color:     0x1a1a2e,
          emissive:  new THREE_.Color(0x2d2d4a),
          roughness: 0.9,
          metalness: 0.1,
        });
        var block = new THREE_.Mesh(geo, mat);
        block.position.set(gx, gridY, gz);
        block.name = 'landed_block';
        block.userData.gridPos = { x: gx, y: gridY, z: gz };
        block.userData.boundingBox = null;
        worldGroup.add(block);
        if (!gridOccupancy.has(gridY)) gridOccupancy.set(gridY, new Set());
        gridOccupancy.get(gridY).add(gx + ',' + gz);
      }
    }
  }
}

// ── Attack warning banner ─────────────────────────────────────────────────────
function _showAttackBanner(label) {
  var el = document.getElementById('boss-attack-banner');
  if (!el) return;
  el.textContent = '⚠ ' + label.toUpperCase() + '!';
  el.style.display = 'block';
  el.classList.remove('boss-banner-animate');
  void el.offsetWidth;
  el.classList.add('boss-banner-animate');
  _bossBannerTimer = setTimeout(function () {
    el.style.display = 'none';
    el.classList.remove('boss-banner-animate');
  }, 2000);
}

// ── Victory ───────────────────────────────────────────────────────────────────
function _triggerBossVictory() {
  if (_bossDefeated) return;
  _bossDefeated = true;
  isBossBattleMode = false; // stop ticking attacks

  if (typeof isGameOver !== 'undefined') {
    // Using global game-over flag to pause the game
  }

  // Stop music
  if (typeof stopBgMusic === 'function') stopBgMusic();

  // Grant rewards
  var rewards = _grantBossRewards(_bossId);

  // Show victory screen
  _bossVictoryTimer = setTimeout(function () { _showVictoryScreen(rewards); }, 800);
}

// Unlock boss cosmetics and return their defs for display
function _grantBossRewards(bossId) {
  var def = BOSS_DEFS[bossId];
  if (!def) return [];

  var unlocked = [];
  try {
    var existing = localStorage.getItem('mineCtris_cosmetics_unlocked');
    var ids = existing ? JSON.parse(existing) : [];

    [def.rewardSkin, def.rewardTitle].forEach(function (id) {
      if (id && !ids.includes(id)) {
        ids.push(id);
        unlocked.push(id);
      }
    });

    localStorage.setItem('mineCtris_cosmetics_unlocked', JSON.stringify(ids));
  } catch (_) {}

  // Record this boss as defeated
  try {
    var key = 'mineCtris_bossDefeated_' + bossId;
    localStorage.setItem(key, 'true');
  } catch (_) {}

  // Award XP
  if (typeof addXP === 'function') {
    var xpAmt = bossId === 'warden' ? 500 : bossId === 'ender_dragon' ? 400 : 300;
    addXP(xpAmt, 'boss_victory');
  }

  return unlocked;
}

function _showVictoryScreen(newCosmetics) {
  var el = document.getElementById('boss-victory-screen');
  if (!el) return;

  var def = BOSS_DEFS[_bossId] || {};

  var iconEl    = document.getElementById('bvs-boss-icon');
  var titleEl   = document.getElementById('bvs-title');
  var nameEl    = document.getElementById('bvs-boss-name');
  var rewardEl  = document.getElementById('bvs-rewards');
  var statsEl   = document.getElementById('bvs-stats');

  if (iconEl)   iconEl.textContent  = def.icon || '👾';
  if (nameEl)   { nameEl.textContent = def.name || 'BOSS'; nameEl.style.color = def.glowColor || '#fff'; }
  if (titleEl)  titleEl.textContent = 'DEFEATED!';

  // Populate rewards
  if (rewardEl) {
    var html = '<div class="bvs-rewards-label">REWARDS UNLOCKED</div>';
    if (newCosmetics.length > 0) {
      newCosmetics.forEach(function (id) {
        var cosm = (typeof getCosmeticById === 'function') ? getCosmeticById(id) : null;
        var label = cosm ? cosm.name : id;
        var rarity = cosm ? cosm.rarity : 'epic';
        html += '<div class="bvs-reward-item bvs-rarity-' + rarity + '">' +
                '⭐ ' + label + '</div>';
      });
    } else {
      html += '<div class="bvs-reward-item">Already unlocked — XP bonus awarded!</div>';
    }
    rewardEl.innerHTML = html;
  }

  // Stats
  if (statsEl) {
    var totalSecs = typeof gameElapsedSeconds !== 'undefined' ? Math.floor(gameElapsedSeconds) : 0;
    var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    var ss = (totalSecs % 60).toString().padStart(2, '0');
    var lines = typeof linesCleared !== 'undefined' ? linesCleared : 0;
    statsEl.innerHTML =
      '<div><span class="go-label">LINES CLEARED</span><br>' + lines + '</div>' +
      '<div><span class="go-label">TIME</span><br>' + mm + ':' + ss + '</div>';
  }

  el.style.display = 'flex';
  requestAnimationFrame(function () { el.classList.add('bvs-visible'); });

  // Freeze gameplay
  if (typeof isGameOver !== 'undefined') {
    // Mark game as over to stop piece spawning
    isGameOver = true;
    gameTimerRunning = false;
  }
  if (typeof controls !== 'undefined' && controls && controls.isLocked) {
    controls.unlock();
  }
}

// ── Boss battle unlock check ──────────────────────────────────────────────────
function isBossBattleUnlocked() {
  // Unlocked after the player has ever entered a dungeon session
  try {
    if (localStorage.getItem('mineCtris_bossUnlocked') === 'true') return true;
    // Also unlock if they've seen any dungeon tier
    var raw = localStorage.getItem('mineCtris_seenDungeonTiers');
    if (raw) {
      var seen = JSON.parse(raw);
      if (Array.isArray(seen) && seen.length > 0) return true;
    }
  } catch (_) {}
  return false;
}

// ── Boss defeat history ────────────────────────────────────────────────────────
function getBossDefeated(bossId) {
  try { return localStorage.getItem('mineCtris_bossDefeated_' + bossId) === 'true'; } catch (_) { return false; }
}

// ── Personal best for boss battle ─────────────────────────────────────────────
function loadBossBattleBest() {
  try {
    var raw = localStorage.getItem('mineCtris_bossBattleBest');
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
