// Block physics — column gravity for Classic mode (MINAA-629).
// When a block is mined, unsupported blocks above it fall.
// Requires: config.js, state.js, lineclear.js, world/mining.js loaded first.
//
// Public API:
//   triggerBlockPhysics(gx, gy, gz, depth) — call after a block is removed
//   updateBlockPhysics(delta)              — call every frame from game-loop
//   resetBlockPhysics()                    — call from gamestate-reset

// ── Active falling groups ─────────────────────────────────────────────────────
// Each entry: { meshes[], vel, depth, settled }
// meshes[0] is the lowest block (startY); meshes[N] is the topmost.
const _bpGroups = [];

// ── Mining streak banner ──────────────────────────────────────────────────────
// Referenced once at first use; cached to avoid repeated getElementById calls.
let _bpStreakBannerEl = null;
let _bpChainBannerEl  = null;
let _bpStreakBannerTimer = 0; // seconds before banner auto-hides after streak ends

function _bpGetStreakEl() {
  if (!_bpStreakBannerEl) _bpStreakBannerEl = document.getElementById('mining-streak-banner');
  return _bpStreakBannerEl;
}
function _bpGetChainEl() {
  if (!_bpChainBannerEl) _bpChainBannerEl = document.getElementById('chain-reaction-banner');
  return _bpChainBannerEl;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _bpFindMesh(gx, gy, gz) {
  const ch = worldGroup.children;
  for (let i = 0; i < ch.length; i++) {
    const obj = ch[i];
    if (obj.name !== 'landed_block' || !obj.userData.gridPos) continue;
    const gp = obj.userData.gridPos;
    if (gp.x === gx && gp.y === gy && gp.z === gz) return obj;
  }
  return null;
}

// Return the Y that the bottom of the falling column will rest on.
// minedY is already empty; scan downward from minedY-1 for the first occupied cell.
function _bpFindLandingY(gx, startY, gz) {
  const key = gx + ',' + gz;
  for (let y = startY - 1; y >= 0.5; y -= 1) {
    const layer = gridOccupancy.get(y);
    if (layer && layer.has(key)) return y + 1;
  }
  return 0.5; // land on ground
}

// ── Public: trigger physics after a block is removed ─────────────────────────

function triggerBlockPhysics(gx, gy, gz, cascadeDepth) {
  if (!classicMiningEnabled) return;
  const depth = (typeof cascadeDepth === 'number') ? cascadeDepth : 0;
  if (depth >= 5) return;

  const key = gx + ',' + gz;

  // Find the lowest block in the column above the mined position that has lost support.
  // Column-only physics: block at Y is unsupported if gridOccupancy[Y-1] lacks (gx,gz).
  let startY = null;
  for (let y = gy + 1; y <= 25.5; y += 1) {
    const layer = gridOccupancy.get(y);
    if (!layer || !layer.has(key)) break;
    const below = gridOccupancy.get(y - 1);
    if (!below || !below.has(key)) { startY = y; break; }
  }
  if (startY === null) return;

  // Collect the contiguous tower from startY upward (they all fall as a unit).
  const meshes = [];
  for (let y = startY; y <= 25.5; y += 1) {
    const layer = gridOccupancy.get(y);
    if (!layer || !layer.has(key)) break;
    const m = _bpFindMesh(gx, y, gz);
    if (m) meshes.push(m);
  }
  if (meshes.length === 0) return;

  const landingY  = _bpFindLandingY(gx, startY, gz);
  const dropDist  = startY - landingY;
  if (dropDist <= 0) return;

  // Start shudder anticipation on falling blocks.
  const rm = typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled;
  if (!rm) {
    meshes.forEach(function(b) {
      if (!b.userData._bpBasePos) b.userData._bpBasePos = b.position.clone();
      b.userData._bpShudder    = true;
      b.userData._bpShudderAge = 0;
    });
  }

  if (typeof playCascadeRumble === 'function') {
    playCascadeRumble(depth);
  }

  // After 0.15 s, unregister blocks and start the fall animation.
  setTimeout(function() {
    if (isGameOver || !classicMiningEnabled) return;

    // Stop shudder, restore base positions.
    meshes.forEach(function(b) {
      b.userData._bpShudder = false;
      if (b.userData._bpBasePos) {
        b.position.copy(b.userData._bpBasePos);
        b.userData._bpBasePos = null;
      }
    });

    // Unregister from grid (they are now airborne).
    meshes.forEach(function(b) {
      if (!b.userData.gridPos) return;
      const gp = b.userData.gridPos;
      const old = gridOccupancy.get(gp.y);
      if (old) {
        old.delete(gp.x + ',' + gp.z);
        if (!old.size) gridOccupancy.delete(gp.y);
      }
      // Store target world-Y for landing.
      b.userData._bpTargetY = gp.y - dropDist;
      b.userData._bpFalling = true;
    });

    _bpGroups.push({ meshes: meshes, vel: 0, depth: depth, settled: false });
  }, 150);
}

// ── Public: per-frame update ──────────────────────────────────────────────────

function updateBlockPhysics(delta) {
  if (!classicMiningEnabled) return;

  const rm = typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled;

  // Shudder animation — small oscillation on blocks about to fall.
  if (!rm) {
    const ch = worldGroup.children;
    for (let i = 0; i < ch.length; i++) {
      const obj = ch[i];
      if (!obj.userData._bpShudder || !obj.userData._bpBasePos) continue;
      obj.userData._bpShudderAge = (obj.userData._bpShudderAge || 0) + delta;
      const s = Math.sin(obj.userData._bpShudderAge * Math.PI * 2 * 30) * 0.02;
      obj.position.x = obj.userData._bpBasePos.x + s;
      obj.position.z = obj.userData._bpBasePos.z + s * 0.7;
    }
  }

  // Mining streak timer — expire streak if player stops mining.
  if (miningStreakTimer > 0) {
    miningStreakTimer -= delta;
    if (miningStreakTimer <= 0) {
      miningStreak      = 0;
      lastMineTime      = -1;
      miningStreakTimer = 0;
      _bpHideStreakBanner();
    }
  }

  // Streak banner auto-hide after streak ends.
  if (_bpStreakBannerTimer > 0) {
    _bpStreakBannerTimer -= delta;
    if (_bpStreakBannerTimer <= 0) {
      _bpStreakBannerTimer = 0;
      _bpHideStreakBanner();
    }
  }

  // Animate falling groups.
  for (let g = _bpGroups.length - 1; g >= 0; g--) {
    const grp = _bpGroups[g];
    if (grp.settled) { _bpGroups.splice(g, 1); continue; }

    grp.vel += 9.8 * delta;
    const drop = grp.vel * delta;

    let landed = false;
    grp.meshes.forEach(function(b) {
      if (!b.userData._bpFalling) return;
      b.position.y -= drop;
      if (b.position.y <= b.userData._bpTargetY) {
        b.position.y = b.userData._bpTargetY;
        landed = true;
      }
    });

    if (landed) {
      // Snap all meshes to their exact target positions.
      grp.meshes.forEach(function(b) {
        if (b.userData._bpFalling) b.position.y = b.userData._bpTargetY;
      });
      grp.settled = true;
      _bpGroups.splice(g, 1);
      _bpHandleLanding(grp);
    }
  }
}

// ── Landing handler ───────────────────────────────────────────────────────────

function _bpHandleLanding(grp) {
  const landed = [];

  grp.meshes.forEach(function(b) {
    if (!b.userData.gridPos) return;
    const gp  = b.userData.gridPos;
    const newY = b.position.y; // equals _bpTargetY after snap
    gp.y = newY;
    b.userData.boundingBox = null;
    b.userData._bpFalling  = false;
    b.userData._bpTargetY  = undefined;

    const xzKey = gp.x + ',' + gp.z;
    if (!gridOccupancy.has(newY)) gridOccupancy.set(newY, new Set());
    gridOccupancy.get(newY).add(xzKey);
    landed.push(b);
  });

  if (landed.length === 0) return;

  // Impact effects (skipped on reduced motion).
  const rm = typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled;
  if (!rm) {
    // Cascade depth-indexed screen shake.
    if (typeof cascadeShakeActive !== 'undefined') {
      var _shakeIntensities = [0.08, 0.14, 0.22, 0.30];
      cascadeShakeActive = true;
      cascadeShakeStart  = clock.getElapsedTime();
      cascadeShakeStrength = _shakeIntensities[Math.min(grp.depth, 3)];
    }
    // Low thud — reuse stoneHit Howler sample at low pitch.
    if (audioReady && typeof sfx !== 'undefined' && sfx && sfx.stoneHit) {
      try {
        const id = sfx.stoneHit.play();
        sfx.stoneHit.rate(0.55 + Math.min(landed.length * 0.04, 0.20), id);
      } catch (_) {}
    }
    // Dust burst on each landed block.
    if (typeof spawnDustParticles === 'function') {
      landed.forEach(function(b) { spawnDustParticles(b); });
    }
  }

  // Check for cascade line clears on the Y-levels where blocks just landed.
  isPhysicsCascade = true;
  cascadeLevel     = grp.depth;
  checkLineClear(landed);
  isPhysicsCascade = false;

  // Schedule a follow-up physics pass to catch secondary cascades.
  if (grp.depth < 4) {
    var _depth = grp.depth;
    var _snapshots = landed.map(function(b) {
      return b.userData.gridPos
        ? { x: b.userData.gridPos.x, y: b.userData.gridPos.y, z: b.userData.gridPos.z }
        : null;
    }).filter(Boolean);

    var _waitForClear = function() {
      if (lineClearInProgress) {
        setTimeout(_waitForClear, 50);
        return;
      }
      _snapshots.forEach(function(pos) {
        triggerBlockPhysics(pos.x, pos.y, pos.z, _depth + 1);
      });
    };
    setTimeout(_waitForClear, 300);
  }
}

// ── Streak UI ─────────────────────────────────────────────────────────────────

function updateStreakBanner(streak) {
  const el = _bpGetStreakEl();
  if (!el) return;
  if (streak < 2) { el.style.display = 'none'; return; }

  const labels = ['', '', 'STREAK x2', 'STREAK x3', 'STREAK x4', 'STREAK x5+'];
  el.textContent = labels[Math.min(streak, 5)];

  // Bounce animation: toggle display to restart CSS animation.
  el.style.animation = 'none';
  el.style.display   = 'none';
  void el.offsetHeight;
  el.style.animation = '';
  el.style.display   = 'block';

  _bpStreakBannerTimer = 1.0; // auto-hide 1 s after streak ends
}

function _bpHideStreakBanner() {
  const el = _bpGetStreakEl();
  if (el) el.style.display = 'none';
}

// Called from lineclear.js when isPhysicsCascade is true.
const CHAIN_BANNER_TEXTS  = ['CHAIN REACTION!', 'CHAIN x2!', 'CHAIN x3!', 'MEGA CHAIN!'];
const CHAIN_BANNER_COLORS = ['#ff9800', '#ff6d00', '#ff3d00', '#dd2c00'];

function showChainReactionBanner(bonusPoints, depth) {
  const el = _bpGetChainEl();
  if (!el) return;
  var idx = Math.min(Math.max(depth || 0, 0), 3);
  el.textContent = CHAIN_BANNER_TEXTS[idx] + (bonusPoints > 0 ? '  +' + bonusPoints : '');
  el.style.color = CHAIN_BANNER_COLORS[idx];
  el.style.display = 'none';
  void el.offsetHeight;
  el.style.display = 'block';
  var timeout = idx >= 2 ? 2500 : 2000;
  setTimeout(function() { if (el) el.style.display = 'none'; }, timeout);
}

// ── Public: full reset ────────────────────────────────────────────────────────

function resetBlockPhysics() {
  _bpGroups.length = 0;
  _bpStreakBannerTimer = 0;

  if (worldGroup) {
    worldGroup.children.forEach(function(obj) {
      obj.userData._bpShudder  = false;
      obj.userData._bpFalling  = false;
      obj.userData._bpBasePos  = null;
      obj.userData._bpTargetY  = undefined;
      obj.userData._bpShudderAge = 0;
    });
  }

  _bpHideStreakBanner();
  const chainEl = _bpGetChainEl();
  if (chainEl) chainEl.style.display = 'none';
}
