// Dungeon modifier system — per-run modifiers for The Depths (tiered dungeon runs).
// Requires: state.js, world.js (worldGroup, unregisterBlock, disposeBlock),
//           hazard-blocks.js (registerHazardBlock), mining.js (spawnDustParticles),
//           audio-sfx.js (playEntropyDissolve)

// ── Active dungeon session state ─────────────────────────────────────────────

/** ID of the current dungeon tier, or null outside dungeon sessions. */
let activeDungeonId = null;

/**
 * Current descent level within the active dungeon run (1-based).
 * Incremented by advanceDungeonDescent(). Entropy activates at level 3+.
 */
let dungeonDescentLevel = 1;

// ── Modifier registry ────────────────────────────────────────────────────────
// 7 existing modifiers (pool for future implementation) + MODIFIER_ENTROPY.

const DUNGEON_MODIFIERS = {
  // Existing modifier stubs — available in the pool for future dungeon tiers.
  GRAVITY_SURGE:     { id: 'GRAVITY_SURGE',     name: 'Gravity Surge',     icon: '⬇',  minDescent: 1, infiniteOnly: false },
  HASTE:             { id: 'HASTE',             name: 'Haste',             icon: '⚡',  minDescent: 1, infiniteOnly: false },
  DARK_FOG:          { id: 'DARK_FOG',          name: 'Dark Fog',          icon: '🌫',  minDescent: 2, infiniteOnly: false },
  STONE_RAIN:        { id: 'STONE_RAIN',        name: 'Stone Rain',        icon: '🪨',  minDescent: 2, infiniteOnly: false },
  VOID_TIDE:         { id: 'VOID_TIDE',         name: 'Void Tide',         icon: '🕳',  minDescent: 3, infiniteOnly: false },
  MAGMA_SURGE:       { id: 'MAGMA_SURGE',       name: 'Magma Surge',       icon: '🌋',  minDescent: 4, infiniteOnly: false },
  BLINDFALL:         { id: 'BLINDFALL',         name: 'Blindfall',         icon: '👁',  minDescent: 5, infiniteOnly: false },
  // Entropy — Infinite Depths exclusive, starting from Descent 3.
  MODIFIER_ENTROPY:  { id: 'MODIFIER_ENTROPY',  name: 'Entropy',           icon: '🌀',  minDescent: 3, infiniteOnly: true  },
};

// ── Entropy modifier state ───────────────────────────────────────────────────

// Seconds until the next decay event selects a target block.
let _entropyTimer = 0;
// Currently targeted block for decay (in warning phase).
let _entropyTarget = null;
// Countdown for the 2-second visual warning on the targeted block.
let _entropyWarningTimer = 0;
// Saved material state for the target block so we can restore it if needed.
let _entropyTargetOrigOpacity = 1.0;
let _entropyTargetOrigTransparent = false;

const _ENTROPY_WARNING_SECS = 2.0;  // seconds of purple flicker warning

/** Return the current decay interval in seconds based on descent level. */
function _entropyInterval() {
  if (dungeonDescentLevel >= 8) return 4;
  if (dungeonDescentLevel >= 5) return 6;
  return 8;
}

/** Return true when the Entropy modifier is active in this session. */
function isEntropyActive() {
  return activeDungeonId === 'infinite' && dungeonDescentLevel >= 3;
}

// ── Entropy tick ─────────────────────────────────────────────────────────────

/**
 * Tick the Entropy modifier. Called from the main game loop on every frame.
 * @param {number} delta  Frame delta in seconds.
 */
function tickEntropy(delta) {
  if (!isEntropyActive()) return;
  if (typeof isGameOver !== 'undefined' && isGameOver) return;
  if (typeof isPaused !== 'undefined' && isPaused) return;

  // ── Warning phase: count down and flicker the selected block ─────────────
  if (_entropyTarget) {
    // Guard: block might have been removed by a line-clear or mining.
    if (!_entropyTarget.parent || !_entropyTarget.userData.gridPos) {
      _entropyTarget = null;
      _entropyWarningTimer = 0;
      _entropyTimer = _entropyInterval();
      return;
    }

    _entropyWarningTimer -= delta;

    // Visual telegraph: purple-to-transparent flicker
    if (_entropyTarget.material) {
      var progress = 1 - (_entropyWarningTimer / _ENTROPY_WARNING_SECS);
      // Pulse frequency ramps up as warning expires
      var flickerHz = 3 + progress * 8;
      var pulse = Math.sin(performance.now() * 0.001 * Math.PI * 2 * flickerHz) * 0.5 + 0.5;
      _entropyTarget.material.transparent = true;
      _entropyTarget.material.opacity = Math.max(0.15, 1 - progress * 0.7 * pulse);
      // Purple emissive shimmer
      _entropyTarget.material.emissive = _entropyTarget.material.emissive || new THREE.Color(0);
      _entropyTarget.material.emissive.setRGB(0.28 * pulse, 0, 0.55 * pulse);
      _entropyTarget.material.needsUpdate = true;
    }

    // Spawn occasional wisps during warning (every ~0.35 s)
    if (!_entropyTarget.userData._entropyWispNext) {
      _entropyTarget.userData._entropyWispNext = _entropyWarningTimer - 0.35;
    }
    if (_entropyWarningTimer <= _entropyTarget.userData._entropyWispNext) {
      _entropyTarget.userData._entropyWispNext -= 0.35;
      if (typeof spawnDustParticles === 'function') {
        spawnDustParticles(_entropyTarget, { entropyWisp: true });
      }
    }

    if (_entropyWarningTimer <= 0) {
      _decayEntropyTarget();
    }
    return;
  }

  // ── Idle phase: count down to next block selection ────────────────────────
  _entropyTimer -= delta;
  if (_entropyTimer <= 0) {
    _selectEntropyTarget();
    _entropyTimer = _entropyInterval();
  }
}

/** Pick a random non-hazard placed block, weighted toward middle rows 5–15. */
function _selectEntropyTarget() {
  if (typeof worldGroup === 'undefined') return;

  var candidates = [];
  for (var i = 0; i < worldGroup.children.length; i++) {
    var obj = worldGroup.children[i];
    if (obj.name !== 'landed_block') continue;
    if (!obj.userData.gridPos) continue;
    if (obj.userData.isHazard) continue;  // hazard blocks are immune

    var gy = obj.userData.gridPos.y;
    // Weight: middle rows 5–15 get 3×, otherwise 1×
    var weight = (gy >= 5 && gy <= 15) ? 3 : 1;
    for (var w = 0; w < weight; w++) {
      candidates.push(obj);
    }
  }

  if (candidates.length === 0) return;

  var picked = candidates[Math.floor(Math.random() * candidates.length)];
  _entropyTarget = picked;
  _entropyWarningTimer = _ENTROPY_WARNING_SECS;
  picked.userData._entropyWispNext = _entropyWarningTimer - 0.35;
}

/** Execute the decay: remove block, spawn particles, play sound. */
function _decayEntropyTarget() {
  var block = _entropyTarget;
  _entropyTarget = null;
  _entropyWarningTimer = 0;

  if (!block || !block.parent || !block.userData.gridPos) return;

  // Restore material state before removal (avoids material corruption on
  // blocks that were being targeted when a line-clear coincidentally fires).
  if (block.material) {
    block.material.opacity = _entropyTargetOrigOpacity;
    block.material.transparent = _entropyTargetOrigTransparent;
    block.material.emissive && block.material.emissive.set(0, 0, 0);
    block.material.needsUpdate = true;
  }

  // Spawn purple dissolve particles
  if (typeof spawnDustParticles === 'function') {
    spawnDustParticles(block, { entropyDissolve: true });
  }

  // Crystalline dissolve audio
  if (typeof playEntropyDissolve === 'function') {
    playEntropyDissolve();
  }

  // Remove from grid occupancy and scene
  if (typeof unregisterBlock === 'function') unregisterBlock(block);
  if (typeof disposeBlock === 'function') disposeBlock(block);
  if (typeof worldGroup !== 'undefined') worldGroup.remove(block);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a dungeon session with the given tier ID.
 * Called from the dungeonLaunch event handler.
 * @param {string} dungeonId  e.g. 'shallow_mines', 'infinite'
 */
function startDungeonSession(dungeonId) {
  activeDungeonId = dungeonId || null;
  dungeonDescentLevel = 1;
  _entropyTimer = _entropyInterval();
  _entropyTarget = null;
  _entropyWarningTimer = 0;
}

/**
 * Advance the descent level by one (call when the player clears a dungeon floor).
 */
function advanceDungeonDescent() {
  if (!activeDungeonId) return;
  dungeonDescentLevel++;
  // Reset entropy timer to current interval on descent advance.
  if (!_entropyTarget) {
    _entropyTimer = _entropyInterval();
  }
}

/**
 * Tick all active dungeon modifiers. Called each frame from game-loop.js.
 * @param {number} delta  Frame delta in seconds.
 */
function tickDungeonModifiers(delta) {
  tickEntropy(delta);
}

/**
 * Reset all dungeon modifier state. Called from resetGame() in gamestate-reset.js.
 */
function resetDungeonModifiers() {
  activeDungeonId = null;
  dungeonDescentLevel = 1;
  _entropyTimer = 0;
  _entropyTarget = null;
  _entropyWarningTimer = 0;
}
