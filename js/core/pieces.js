// Falling Tetris pieces — creation, spawning, rotation, and landing.
// Requires: state.js, config.js, world.js (createBlockMesh, registerBlock),
//           lineclear.js (checkLineClear), gamestate.js (checkGameOver)

// Shared geometry for nudge swoosh particles. Never disposed at runtime.
const _NUDGE_PARTICLE_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.12);

// ── Landing shockwave ring pool ───────────────────────────────────────────────
const _LANDING_RING_POOL_SIZE = 3;
const _landingRingPool   = [];   // { mesh, active }
const _activeLandingRings = [];  // { entry, age }

const _LANDING_RING_DURATION  = 0.35;   // seconds for full animation
const _LANDING_RING_MAX_SCALE = 8;      // max uniform XZ scale
const _LANDING_RING_OPACITY   = 0.35;   // starting opacity (fades to 0)

function initLandingRingPool() {
  const geo = new THREE.RingGeometry(0.1, 0.5, 32);
  for (let i = 0; i < _LANDING_RING_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo.clone(), mat);
    // Lie flat in XZ plane with a 10° forward tilt for first-person visibility
    mesh.rotation.x = Math.PI / 2 - (10 * Math.PI / 180);
    mesh.visible = false;
    scene.add(mesh);
    _landingRingPool.push({ mesh, active: false });
  }
}

function spawnLandingRing(centerPos) {
  let entry = null;
  for (let i = 0; i < _landingRingPool.length; i++) {
    if (!_landingRingPool[i].active) { entry = _landingRingPool[i]; break; }
  }
  if (!entry) return;
  entry.active = true;
  entry.mesh.position.copy(centerPos);
  entry.mesh.scale.set(0.01, 1, 0.01);
  entry.mesh.material.opacity = _LANDING_RING_OPACITY;
  entry.mesh.visible = true;
  _activeLandingRings.push({ entry, age: 0 });
}

function updateLandingRings(delta) {
  for (let i = _activeLandingRings.length - 1; i >= 0; i--) {
    const r = _activeLandingRings[i];
    r.age += delta;
    if (r.age >= _LANDING_RING_DURATION) {
      r.entry.mesh.visible = false;
      r.entry.active = false;
      _activeLandingRings.splice(i, 1);
      continue;
    }
    const t = r.age / _LANDING_RING_DURATION;
    const s = t * _LANDING_RING_MAX_SCALE;
    r.entry.mesh.scale.set(s, 1, s);
    r.entry.mesh.material.opacity = _LANDING_RING_OPACITY * (1 - t);
    r.entry.mesh.material.needsUpdate = true;
  }
}

// ── Block placement snap animation ───────────────────────────────────────────
// Each placed block briefly squashes on impact then springs back to full size,
// with a short upward slide from a slight downward offset. Simulates a crisp
// "snap into the grid" feel without any persistent visual state.
const _SNAP_ANIM_DURATION = 0.22;   // seconds
const _snapAnimActive = [];          // { block, targetY, age }

function spawnSnapAnimation(block) {
  const targetY = block.position.y;
  block.position.y = targetY - BLOCK_SIZE * 0.14;
  block.scale.set(1.18, 0.72, 1.18);
  _snapAnimActive.push({ block, targetY, age: 0 });
}

function updateSnapAnimations(delta) {
  for (let i = _snapAnimActive.length - 1; i >= 0; i--) {
    const a = _snapAnimActive[i];
    // Block may have been removed by a line clear — skip and clean up
    if (!a.block.parent) {
      _snapAnimActive.splice(i, 1);
      continue;
    }
    a.age += delta;
    if (a.age >= _SNAP_ANIM_DURATION) {
      a.block.scale.set(1, 1, 1);
      a.block.position.y = a.targetY;
      _snapAnimActive.splice(i, 1);
      continue;
    }
    const t = a.age / _SNAP_ANIM_DURATION;

    // Scale: squash phase → spring overshoot → settle
    let scaleX, scaleY;
    if (t < 0.4) {
      // Recover from squash toward 1.0
      const p = t / 0.4;
      scaleX = 1.18 - 0.18 * p;
      scaleY = 0.72 + 0.28 * p;
    } else {
      // Spring with gentle overshoot
      const p = (t - 0.4) / 0.6;
      const spring = Math.sin(p * Math.PI * 2.2) * 0.07 * (1 - p);
      scaleY = 1.0 + spring;
      scaleX = 1.0 - spring * 0.5;
    }
    a.block.scale.set(scaleX, scaleY, scaleX);

    // Slide Y: ease-out cubic from offset to target
    const ease = 1 - Math.pow(1 - Math.min(t / 0.35, 1), 3);
    a.block.position.y = a.targetY - BLOCK_SIZE * 0.14 * (1 - ease);
  }
}

function createPiece3D(shapeData, colorIndex) {
  const pieceGroup = new THREE.Group();
  const _seColorHex = typeof getSeasonalBlockColor === 'function' ? getSeasonalBlockColor() : null;
  const color = _seColorHex
    ? parseInt(_seColorHex.replace('#', ''), 16)
    : COLORS[colorIndex];
  shapeData.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value > 0) {
        const blockMesh = createBlockMesh(color);
        blockMesh.position.set(x * BLOCK_SIZE, -y * BLOCK_SIZE, 0);
        pieceGroup.add(blockMesh);
      }
    });
  });
  pieceGroup.userData.pivotOffset = new THREE.Vector3(
    (shapeData[0].length / 2 - 0.5) * BLOCK_SIZE,
    (-shapeData.length / 2 + 0.5) * BLOCK_SIZE,
    0
  );
  pieceGroup.children.forEach((child) =>
    child.position.sub(pieceGroup.userData.pivotOffset)
  );
  pieceGroup.position.add(pieceGroup.userData.pivotOffset);
  return pieceGroup;
}

// ── Next-piece queue ──────────────────────────────────────────────────────────

function _rng() {
  return gameRng ? gameRng() : Math.random();
}

function _randomShapeIndex() {
  // Diamond (index 8) only spawns in Classic mode at Level 7+ (lastDifficultyTier >= 6).
  // Never in Sprint or Blitz modes.
  const diamondEligible = !isSprintMode && !isBlitzMode && lastDifficultyTier >= 6;

  // Ice Age: 60% of pieces are Ice-type (index 4).
  if (weeklyIceAge && _rng() < 0.6) return 4;

  // Gold Rush: gold (index 3) gets 3× the weight of other piece types.
  if (weeklyGoldRush) {
    // Pool: each non-gold type gets 1 slot, gold gets 3 slots.
    const pool = [1, 2, 3, 3, 3, 4, 5, 6, 7];
    if (diamondEligible) pool.push(8);
    return pool[Math.floor(_rng() * pool.length)];
  }

  // World modifier block weights.
  const _wmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
  if (_wmod && _wmod.blockWeights) {
    const weights = Object.assign({}, _wmod.blockWeights);
    // Exclude diamond unless eligible.
    if (!diamondEligible) delete weights[8];
    return worldModifierWeightedIndex(weights, _rng);
  }

  // Seasonal event: void blocks (index 11) added to pool at voidBlockMult weight.
  // voidBlockMult=2 means 2 void slots per standard pool, ~22% of pieces become void.
  const _seVoidMult = typeof getSeasonalVoidBlockMult === 'function'
    ? getSeasonalVoidBlockMult() : 1;
  if (_seVoidMult > 1) {
    const pool = [];
    const stdSize = diamondEligible ? 8 : 7;
    for (let i = 1; i <= stdSize; i++) pool.push(i);
    for (let v = 0; v < _seVoidMult; v++) pool.push(11); // void block index
    return pool[Math.floor(_rng() * pool.length)];
  }

  // Standard pool is indices 1–7; diamond adds index 8.
  const poolSize = diamondEligible ? 8 : 7;
  return Math.floor(_rng() * poolSize) + 1;
}

/** Populate pieceQueue with NEXT_QUEUE_SIZE entries from scratch. */
function initPieceQueue() {
  pieceQueue.length = 0;
  for (let i = 0; i < NEXT_QUEUE_SIZE; i++) {
    const idx = _randomShapeIndex();
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  updateNextPiecesHUD();
}

/** Render the queue as mini piece grids inside #next-pieces-panel. */
function updateNextPiecesHUD() {
  if (!nextPiecesEl) nextPiecesEl = document.getElementById('next-pieces-panel');
  if (!nextPiecesEl) return;
  // Blind Drop: hide next-piece preview.
  if (weeklyBlindDrop) {
    nextPiecesEl.innerHTML = '<div class="np-label">NEXT</div><div class="np-pieces-row"><div class="np-piece np-blind">?</div></div>';
    return;
  }
  const _displayCount = (typeof playerNextPieceCount !== 'undefined') ? Math.min(playerNextPieceCount, pieceQueue.length) : pieceQueue.length;
  let html = '<div class="np-label">NEXT</div><div class="np-pieces-row">';
  pieceQueue.slice(0, _displayCount).forEach(({ index, shape }) => {
    let palette;
    if (colorblindMode && getCBColors(index) !== null && getCBColors(index) !== undefined) {
      palette = getCBColors(index);
    } else if (activeBlockSkin && BLOCK_SKIN_PALETTES[activeBlockSkin]) {
      const skinDef = BLOCK_SKIN_PALETTES[activeBlockSkin];
      palette = (skinDef.colors[index] !== null) ? skinDef.colors[index] : COLORS[index];
    } else {
      const THEME_PALETTE = {
        nether: NETHER_COLORS, ocean: OCEAN_COLORS, candy: CANDY_COLORS,
        fossil: FOSSIL_COLORS, storm: STORM_COLORS, void: VOID_COLORS,
        legendary: LEGENDARY_COLORS,
        ender:   (typeof ENDER_COLORS   !== 'undefined' ? ENDER_COLORS   : null),
        diamond: (typeof DIAMOND_COLORS !== 'undefined' ? DIAMOND_COLORS : null),
        biome_stone: BIOME_STONE_COLORS, biome_forest: BIOME_FOREST_COLORS,
        biome_nether: NETHER_COLORS, biome_ice: BIOME_ICE_COLORS,
        cosmetic_carved_stone_board:    COSMETIC_CARVED_STONE_COLORS,
        cosmetic_ore_vein_theme:        COSMETIC_ORE_VEIN_COLORS,
        cosmetic_mossy_overgrown_board: COSMETIC_MOSSY_OVERGROWN_COLORS,
        cosmetic_leaf_block_theme:      COSMETIC_LEAF_BLOCK_COLORS,
        cosmetic_obsidian_forge_board:  COSMETIC_OBSIDIAN_FORGE_COLORS,
        cosmetic_magma_theme:           COSMETIC_MAGMA_COLORS,
        cosmetic_frozen_tundra_board:   COSMETIC_FROZEN_TUNDRA_COLORS,
        cosmetic_crystal_theme:         COSMETIC_CRYSTAL_COLORS,
      };
      const tp = THEME_PALETTE[activeTheme];
      palette = (tp && tp[index] !== null) ? tp[index] : COLORS[index];
    }
    const hex = '#' + palette.toString(16).padStart(6, '0');
    const glowSize = (activeBlockSkin === 'neon') ? 8 : 3;
    html += '<div class="np-piece">';
    shape.forEach(row => {
      html += '<div class="np-row">';
      row.forEach(v => {
        html += v
          ? `<div class="np-cell" style="background:${hex};box-shadow:0 0 ${glowSize}px ${hex};"></div>`
          : '<div class="np-cell np-empty"></div>';
      });
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>';
  nextPiecesEl.innerHTML = html;
}

/** Render the held piece inside #hold-piece-panel. */
function updateHoldPanelHUD() {
  if (!holdPanelEl) holdPanelEl = document.getElementById('hold-piece-panel');
  if (!holdPanelEl) return;
  // Hide hold panel entirely during daily challenge (hold is disabled)
  if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) {
    holdPanelEl.style.display = 'none';
    return;
  }
  let html = '<div class="np-label">HOLD</div>';
  if (!holdPiece) {
    html += '<div class="np-pieces-row"><div class="np-piece hp-empty"><div class="np-row"><div class="np-cell np-empty"></div></div></div></div>';
    holdPanelEl.innerHTML = html;
    return;
  }
  const { index, shape } = holdPiece;
  let palette;
  if (typeof colorblindMode !== 'undefined' && colorblindMode && typeof getCBColors === 'function' && getCBColors(index) !== null && getCBColors(index) !== undefined) {
    palette = getCBColors(index);
  } else if (typeof activeBlockSkin !== 'undefined' && activeBlockSkin && typeof BLOCK_SKIN_PALETTES !== 'undefined' && BLOCK_SKIN_PALETTES[activeBlockSkin]) {
    const skinDef = BLOCK_SKIN_PALETTES[activeBlockSkin];
    palette = (skinDef.colors[index] !== null) ? skinDef.colors[index] : COLORS[index];
  } else {
    const THEME_PALETTE = {
      nether: typeof NETHER_COLORS !== 'undefined' ? NETHER_COLORS : null,
      ocean:  typeof OCEAN_COLORS  !== 'undefined' ? OCEAN_COLORS  : null,
      candy:  typeof CANDY_COLORS  !== 'undefined' ? CANDY_COLORS  : null,
      fossil: typeof FOSSIL_COLORS !== 'undefined' ? FOSSIL_COLORS : null,
      storm:  typeof STORM_COLORS  !== 'undefined' ? STORM_COLORS  : null,
      void:   typeof VOID_COLORS   !== 'undefined' ? VOID_COLORS   : null,
    };
    const tp = typeof activeTheme !== 'undefined' && THEME_PALETTE[activeTheme] ? THEME_PALETTE[activeTheme] : null;
    palette = (tp && tp[index] !== null) ? tp[index] : COLORS[index];
  }
  const hex = '#' + palette.toString(16).padStart(6, '0');
  const glowSize = (typeof activeBlockSkin !== 'undefined' && activeBlockSkin === 'neon') ? 8 : 3;
  const lockedClass = (typeof holdLocked !== 'undefined' && holdLocked) ? ' hp-locked' : '';
  html += '<div class="np-pieces-row"><div class="np-piece' + lockedClass + '">';
  shape.forEach(function (row) {
    html += '<div class="np-row">';
    row.forEach(function (v) {
      html += v
        ? '<div class="np-cell" style="background:' + hex + ';box-shadow:0 0 ' + glowSize + 'px ' + hex + ';"></div>'
        : '<div class="np-cell np-empty"></div>';
    });
    html += '</div>';
  });
  html += '</div></div>';
  holdPanelEl.innerHTML = html;
}

/**
 * Hold the current falling piece.
 * - First hold: stores piece and spawns the next piece from the queue.
 * - Subsequent holds: swaps held piece with the current falling piece.
 * - Locked after use until the current piece lands (holdLocked reset in landing code).
 */
function doHoldPiece() {
  if (typeof isPuzzleMode !== 'undefined' && isPuzzleMode) return;
  if (typeof isCustomPuzzleMode !== 'undefined' && isCustomPuzzleMode) return;
  if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) return; // hold disabled in daily
  if (typeof holdLocked !== 'undefined' && holdLocked) return;
  if (!fallingPieces || fallingPieces.length === 0) return;

  // Target: the piece with the highest position (most recently spawned / least far down).
  // In practice there is usually one active piece; use the last one in the array.
  const piece = fallingPieces[fallingPieces.length - 1];
  const currentIndex = piece.userData.colorIndex;

  // Remove piece from scene
  if (typeof disposePieceTrail === 'function') disposePieceTrail(piece);
  if (typeof removePieceShadow === 'function') removePieceShadow(piece);
  fallingPiecesGroup.remove(piece);
  fallingPieces.splice(fallingPieces.length - 1, 1);

  if (holdPiece !== null) {
    // Swap: inject the held piece at the front of the queue so spawnFallingPiece picks it up.
    pieceQueue.unshift(holdPiece);
  }
  // Store the removed piece as the new held piece.
  holdPiece = { index: currentIndex, shape: SHAPES[currentIndex] };

  // Spawn next piece (will use the injected held piece if swap, or queue if first hold).
  spawnFallingPiece();

  holdLocked = true;
  holdUsedCount++;
  updateHoldPanelHUD();
  if (typeof tutorialNotify === 'function') tutorialNotify('hold');
}

function spawnFallingPiece() {
  // Reset per-piece finesse input counter for the incoming piece.
  if (typeof finesseOnPieceSpawn === 'function') finesseOnPieceSpawn();

  // In Sprint mode, start the timer on the very first piece drop
  if (isSprintMode && !sprintTimerActive && !sprintComplete) {
    sprintTimerActive = true;
  }
  // In Blitz mode, start the countdown on the very first piece drop
  if (isBlitzMode && !blitzTimerActive && !blitzComplete) {
    blitzTimerActive = true;
  }
  // In Combo Challenge, start the countdown on the very first piece drop
  if (isComboChallenge && !comboChallengeTimerActive && !comboChallengeComplete) {
    comboChallengeTimerActive = true;
    const ccHudEl = document.getElementById('combo-challenge-hud');
    if (ccHudEl) ccHudEl.style.display = 'flex';
  }
  // In Countdown mode, start the elapsed timer on the very first piece drop
  if (isCountdownMode && !countdownTimerActive && !countdownComplete) {
    countdownTimerActive = true;
    const stageHudEl = document.getElementById('countdown-stage-hud');
    if (stageHudEl) stageHudEl.style.display = 'flex';
    if (typeof updateCountdownStageHUD === 'function') updateCountdownStageHUD();
  }
  // In Daily challenge, start the 3-minute countdown on the very first piece drop
  if (isDailyChallenge && !dailyTimerActive && !isGameOver) {
    dailyTimerActive = true;
  }
  // Battle / co-op: deliver one queued garbage row before this piece spawns.
  if ((isBattleMode || isCoopMode) && typeof deliverPendingGarbage === 'function') {
    deliverPendingGarbage();
  }

  // World modifier fall speed multiplier (1.0 for Normal/Ice World/Ocean; 1.35 for Nether).
  const _wmodSpawn = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
  const _wmodFallMult = _wmodSpawn ? _wmodSpawn.fallSpeedMult : 1.0;
  // Co-op difficulty baseline multiplier (1.0 casual / 1.5 normal / 2.0 challenge).
  const _coopMult = isCoopMode ? coopFallMultiplier : 1.0;
  // Biome fall speed multiplier (Nether biome = 1.5x; others = 1.0).
  const _biomeFallMult = typeof getBiomeFallSpeedMult === 'function' ? getBiomeFallSpeedMult() : 1.0;
  // Mobile difficulty: 20% speed reduction when toggle is ON and touch is active.
  const _mobileMult = (typeof mobileOverridesActive !== 'undefined' && mobileOverridesActive
    && typeof mobileDifficultyEnabled !== 'undefined' && mobileDifficultyEnabled)
    ? MOBILE_OVERRIDES.speedMult : 1.0;
  const _fallMult = _wmodFallMult * _coopMult * _biomeFallMult * _mobileMult;

  // Co-op mode: use server-authoritative piece from the shared queue.
  if (isCoopMode) {
    if (coopPieceQueue.length === 0) return; // wait for next piece from DO
    const cp = coopPieceQueue.shift();
    // Host replenishes the queue when it drops low
    if (typeof coop !== 'undefined' && coop.isHost && coopPieceQueue.length < 2) {
      coop.send({ type: 'piece_request' });
    }
    // Wide board: each player's pieces spawn in their own half.
    // Override the server-provided spawnX with a half-specific position.
    let _cpSpawnX = cp.spawnX;
    let _cpSpawnZ = cp.spawnZ;
    if (isCoopWideBoard && typeof coopBoardSpawnX === 'function') {
      _cpSpawnX = coopBoardSpawnX(typeof coop !== 'undefined' && coop.isHost);
      // Constrain Z to board rows: -4 … +5 → range 9, center 0.5
      _cpSpawnZ = Math.round((_rng() - 0.5) * 9);
    }
    const piece3D = createPiece3D(SHAPES[cp.index], cp.index);
    _applyGravitySpawn(piece3D, _cpSpawnX, _cpSpawnZ, (GRAVITY / 4) * difficultyMultiplier * speedModifierMultiplier * _fallMult);
    piece3D.userData.colorIndex = cp.index;
    piece3D.userData.timeSinceRotation = 0;
    piece3D.userData.rotationInterval = cp.rotationInterval;
    piece3D.userData.nudgeOffsetX = 0;
    piece3D.userData.nudgeOffsetZ = 0;
    piece3D.userData.nudgePulseEnd = -1;
    piece3D.userData.shapeMatrix = SHAPES[cp.index].map(row => row.slice());
    piece3D.userData.rotState = 0;
    piece3D.userData.lastRotWasKick = false;
    const r = cp.startRotation;
    if (r.axis === 'x') piece3D.rotateX(r.angle);
    else if (r.axis === 'y') piece3D.rotateY(r.angle);
    else piece3D.rotateZ(r.angle);
    if (timeFreezeActive) {
      piece3D.children.forEach(function (block) {
        if (block.material) {
          block.material.emissive.setRGB(0.55, 0.85, 1.0);
          block.material.needsUpdate = true;
        }
      });
    }
    fallingPiecesGroup.add(piece3D);
    fallingPieces.push(piece3D);
    createPieceShadow(piece3D);
    createPieceTrail(piece3D);
    return;
  }

  // Replay playback: inject recorded piece data instead of generating random pieces.
  if (typeof isReplayMode !== 'undefined' && isReplayMode) {
    const rp = typeof replayGetNextPiece === 'function' ? replayGetNextPiece() : null;
    if (!rp) return; // no more recorded pieces — replay is winding down
    const piece3D = createPiece3D(rp.shape, rp.index);
    _applyGravitySpawn(piece3D, rp.spawnX, rp.spawnZ, (GRAVITY / 4) * difficultyMultiplier * speedModifierMultiplier * _fallMult);
    piece3D.userData.colorIndex = rp.index;
    piece3D.userData.timeSinceRotation = 0;
    piece3D.userData.rotationInterval = rp.rotationInterval;
    piece3D.userData.nudgeOffsetX = 0;
    piece3D.userData.nudgeOffsetZ = 0;
    piece3D.userData.nudgePulseEnd = -1;
    piece3D.userData.shapeMatrix = rp.shape.map(row => row.slice());
    piece3D.userData.rotState = 0;
    piece3D.userData.lastRotWasKick = false;
    fallingPiecesGroup.add(piece3D);
    fallingPieces.push(piece3D);
    createPieceShadow(piece3D);
    createPieceTrail(piece3D);
    return;
  }

  // In Training mode, draw from the training fixed queue (loops automatically).
  if (typeof isTrainingMode !== 'undefined' && isTrainingMode) {
    const next = typeof drawTrainingPiece === 'function' ? drawTrainingPiece() : null;
    if (next) {
      const piece3D = createPiece3D(next.shape, next.index);
      const spawnX = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
      const spawnZ = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
      _applyGravitySpawn(piece3D, spawnX, spawnZ, (GRAVITY / 4) * difficultyMultiplier * speedModifierMultiplier * _fallMult);
      piece3D.userData.colorIndex = next.index;
      piece3D.userData.timeSinceRotation = 0;
      piece3D.userData.rotationInterval =
        _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) + MIN_ROTATION_INTERVAL;
      piece3D.userData.nudgeOffsetX = 0;
      piece3D.userData.nudgeOffsetZ = 0;
      piece3D.userData.nudgePulseEnd = -1;
      piece3D.userData.shapeMatrix = next.shape.map(function (row) { return row.slice(); });
      piece3D.userData.rotState = 0;
      piece3D.userData.lastRotWasKick = false;
      fallingPiecesGroup.add(piece3D);
      fallingPieces.push(piece3D);
      createPieceShadow(piece3D);
      createPieceTrail(piece3D);
      return;
    }
  }

  // In Puzzle mode, draw from the fixed queue; stop spawning when exhausted.
  if (isPuzzleMode) {
    const next = typeof drawPuzzlePiece === "function" ? drawPuzzlePiece() : null;
    if (!next) {
      // No pieces left — check lose condition after current pieces finish landing
      return;
    }
    const piece3D = createPiece3D(next.shape, next.index);
    const spawnX = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
    const spawnZ = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
    _applyGravitySpawn(piece3D, spawnX, spawnZ, (GRAVITY / 4) * difficultyMultiplier * speedModifierMultiplier * _fallMult);
    piece3D.userData.colorIndex = next.index;
    piece3D.userData.timeSinceRotation = 0;
    piece3D.userData.rotationInterval =
      _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) + MIN_ROTATION_INTERVAL;
    piece3D.userData.nudgeOffsetX = 0;
    piece3D.userData.nudgeOffsetZ = 0;
    piece3D.userData.nudgePulseEnd = -1;
    piece3D.userData.shapeMatrix = next.shape.map(row => row.slice());
    piece3D.userData.rotState = 0;
    piece3D.userData.lastRotWasKick = false;
    fallingPiecesGroup.add(piece3D);
    fallingPieces.push(piece3D);
    createPieceShadow(piece3D);
    createPieceTrail(piece3D);
    return;
  }

  // In Custom Puzzle mode with a fixed piece sequence, draw from the looping queue.
  if (isCustomPuzzleMode &&
      typeof customPieceSequence !== "undefined" &&
      customPieceSequence.mode === "fixed" &&
      customPieceSequence.pieces && customPieceSequence.pieces.length > 0) {
    const next = typeof drawCustomPuzzlePiece === "function" ? drawCustomPuzzlePiece() : null;
    if (next) {
      const piece3D = createPiece3D(next.shape, next.index);
      const spawnX = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
      const spawnZ = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
      _applyGravitySpawn(piece3D, spawnX, spawnZ, (GRAVITY / 4) * difficultyMultiplier * speedModifierMultiplier * _fallMult);
      piece3D.userData.colorIndex = next.index;
      piece3D.userData.timeSinceRotation = 0;
      piece3D.userData.rotationInterval =
        _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) + MIN_ROTATION_INTERVAL;
      piece3D.userData.nudgeOffsetX = 0;
      piece3D.userData.nudgeOffsetZ = 0;
      piece3D.userData.nudgePulseEnd = -1;
      piece3D.userData.shapeMatrix = next.shape.map(row => row.slice());
      piece3D.userData.rotState = 0;
      piece3D.userData.lastRotWasKick = false;
      fallingPiecesGroup.add(piece3D);
      fallingPieces.push(piece3D);
      createPieceShadow(piece3D);
      createPieceTrail(piece3D);
      return;
    }
  }

  // Auto-start replay recording on first piece spawn (detects game mode from global flags).
  if (typeof replayAutoStart === 'function') replayAutoStart();

  // Draw the next piece from the pre-generated queue; refill to keep it at NEXT_QUEUE_SIZE.
  if (pieceQueue.length === 0) initPieceQueue();
  const { index, shape } = pieceQueue.shift();
  const newIdx = _randomShapeIndex();
  pieceQueue.push({ index: newIdx, shape: SHAPES[newIdx] });
  updateNextPiecesHUD();
  const piece3D = createPiece3D(shape, index);
  const _spawnRange = WORLD_SIZE * 0.8;
  const spawnX = (_rng() - 0.5) * _spawnRange;
  const spawnZ = (_rng() - 0.5) * _spawnRange;
  _applyGravitySpawn(piece3D, spawnX, spawnZ, (GRAVITY / 4) * difficultyMultiplier * speedModifierMultiplier * _fallMult);
  piece3D.userData.colorIndex = index;
  piece3D.userData.timeSinceRotation = 0;
  piece3D.userData.rotationInterval =
    _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
    MIN_ROTATION_INTERVAL;
  piece3D.userData.nudgeOffsetX = 0;
  piece3D.userData.nudgeOffsetZ = 0;
  piece3D.userData.nudgePulseEnd = -1;
  piece3D.userData.shapeMatrix = shape.map(row => row.slice());
  piece3D.userData.rotState = 0;
  piece3D.userData.lastRotWasKick = false;
  // Record this piece spawn for replay
  if (typeof replayRecordPiece === 'function') {
    replayRecordPiece(index, spawnX, spawnZ, piece3D.userData.rotationInterval,
      typeof gameElapsedSeconds !== 'undefined' ? gameElapsedSeconds : 0);
  }
  fallingPiecesGroup.add(piece3D);
  fallingPieces.push(piece3D);
  // Screen reader: announce the newly spawned piece type.
  if (typeof announceToScreenReader === 'function' && typeof PIECE_NAMES !== 'undefined') {
    const _pName = PIECE_NAMES[index] || ('piece ' + index);
    announceToScreenReader(_pName + ' piece');
  }
  // High contrast: apply emissive boost to the new piece.
  if (typeof highContrastEnabled !== 'undefined' && highContrastEnabled) {
    piece3D.children.forEach(function(block) {
      if (block.userData && block.userData.isBlock && block.material && block.material.emissive) {
        block.userData._hcSavedEmissive = block.material.emissive.clone();
        block.userData._hcSavedEmissiveIntensity = block.material.emissiveIntensity || 1.0;
        block.material.emissive.setRGB(0.5, 0.5, 0.5);
        block.material.emissiveIntensity = 1.5;
        block.material.needsUpdate = true;
      }
    });
  }
  // Apply freeze glow immediately if Time Freeze is active when this piece spawns
  if (timeFreezeActive) {
    piece3D.children.forEach(function (block) {
      if (block.material) {
        block.material.emissive.setRGB(0.55, 0.85, 1.0);
        block.material.needsUpdate = true;
      }
    });
  }
  // Desert biome: mark as sand piece with configured probability
  var _sandChance = typeof getDesertSandBlockChance === 'function' ? getDesertSandBlockChance() : 0;
  if (_sandChance > 0 && Math.random() < _sandChance) {
    piece3D.userData.isSandPiece = true;
  }
  createPieceShadow(piece3D);
  createPieceTrail(piece3D);
  // Apply any buffered nudge input that was queued during the previous piece's lock delay.
  if (typeof flushNudgeBuffer === 'function') flushNudgeBuffer();
}

function applyRandomRotation(piece) {
  const axis = Math.floor(_rng() * 3);
  const angle = Math.PI / 2;
  if (axis === 0) piece.rotateX(angle);
  else if (axis === 1) piece.rotateY(angle);
  else piece.rotateZ(angle);
}

// ── SRS wall-kick rotation ────────────────────────────────────────────────────
//
// Implements the Tetris Guideline Super Rotation System.
// Kick offsets are [dx, dy] where +dx = right (+X world), +dy = up (+Y world).
//
// Standard pieces (J L S T Z) — indexed by "fromState>toState".
const _SRS_KICKS_STD = {
  '0>1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
  '1>0': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
  '1>2': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
  '2>1': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
  '2>3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  '3>2': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  '3>0': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  '0>3': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
};

// I-piece kick table — wider offset range.
const _SRS_KICKS_I = {
  '0>1': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
  '1>0': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
  '1>2': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
  '2>1': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
  '2>3': [[ 0, 0],[ 2, 0],[-1, 0],[ 2, 1],[-1,-2]],
  '3>2': [[ 0, 0],[-2, 0],[ 1, 0],[-2,-1],[ 1, 2]],
  '3>0': [[ 0, 0],[ 1, 0],[-2, 0],[ 1,-2],[-2, 1]],
  '0>3': [[ 0, 0],[-1, 0],[ 2, 0],[-1, 2],[ 2,-1]],
};

/** Rotate a shape matrix 90° clockwise. */
function _srsRotCW(matrix) {
  const rows = matrix.length, cols = matrix[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = matrix[r][c];
  return result;
}

/**
 * Check whether shape matrix can be placed with its bounding-box centre at
 * (cx, cy, cz) without colliding with world walls or any static worldGroup block.
 */
function _srsPositionValid(matrix, cx, cy, cz) {
  const rows = matrix.length, cols = matrix[0].length;
  const pvX  = (cols / 2 - 0.5) * BLOCK_SIZE;
  const pvY  = (-rows / 2 + 0.5) * BLOCK_SIZE;
  const halfW = WORLD_SIZE / 2;
  const BEDROCK_Y = -30;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!matrix[r][c]) continue;
      const bx = cx + c * BLOCK_SIZE - pvX;
      const by = cy - r * BLOCK_SIZE - pvY;
      const bz = cz;

      // World boundary checks (tighter than NUDGE_MAX to avoid clipping walls).
      if (Math.abs(bx) >= halfW - BLOCK_SIZE * 0.4) return false;
      if (Math.abs(bz) >= halfW - BLOCK_SIZE * 0.4) return false;
      if (by < BEDROCK_Y + BLOCK_SIZE * 0.5) return false;

      // Static-block collision check against worldGroup (landed blocks).
      const blockBox = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(bx, by, bz),
        new THREE.Vector3(BLOCK_SIZE * 0.85, BLOCK_SIZE * 0.85, BLOCK_SIZE * 0.85)
      );
      for (const staticObj of worldGroup.children) {
        if (staticObj.name === 'ground') continue;
        const sBox = (staticObj.userData.boundingBox =
          staticObj.userData.boundingBox || new THREE.Box3().setFromObject(staticObj));
        if (blockBox.intersectsBox(sBox)) return false;
      }
    }
  }
  return true;
}

/**
 * Reposition child-block meshes of a falling piece group to match the given
 * shape matrix and reset the group quaternion to identity (flat in XY plane).
 */
function _applyMatrixToPiece(piece, matrix) {
  const rows = matrix.length, cols = matrix[0].length;
  const pvX = (cols / 2 - 0.5) * BLOCK_SIZE;
  const pvY = (-rows / 2 + 0.5) * BLOCK_SIZE;

  const cells = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (matrix[r][c]) cells.push([c, r]);

  const meshes = piece.children.filter(ch => ch.isMesh);
  for (let i = 0; i < Math.min(meshes.length, cells.length); i++) {
    const [c, r] = cells[i];
    meshes[i].position.set(
      c * BLOCK_SIZE - pvX,
      -r * BLOCK_SIZE - pvY,
      0
    );
  }
  // Reset any accumulated 3-D tilt so world positions = piece.position + local.
  piece.quaternion.identity();
  // Store updated pivot offset for consistency with createPiece3D bookkeeping.
  piece.userData.pivotOffset = new THREE.Vector3(pvX, pvY, 0);
}

/**
 * Attempt to rotate the active falling piece using SRS rotation and kick tables.
 *
 * @param {boolean} cw  true = clockwise (E key), false = counter-clockwise (Q key).
 * @returns {boolean} true if rotation succeeded.
 */
function rotatePlayerPiece(cw) {
  const piece = getNudgeTargetPiece();
  if (!piece) return false;

  const shapeMatrix = piece.userData.shapeMatrix;
  if (!shapeMatrix) return false;

  const colorIndex = piece.userData.colorIndex;
  // O-piece (3) is symmetrical — skip.  Special pieces 8-11 — skip.
  if (colorIndex === 3 || colorIndex > 7) return false;

  const fromState = piece.userData.rotState || 0;
  // 1× CW or 3× CW (= 1× CCW).
  const newMatrix = cw
    ? _srsRotCW(shapeMatrix)
    : _srsRotCW(_srsRotCW(_srsRotCW(shapeMatrix)));
  const toState = cw ? (fromState + 1) % 4 : (fromState + 3) % 4;

  const kickKey = `${fromState}>${toState}`;
  const kicks   = (colorIndex === 4) ? _SRS_KICKS_I[kickKey] : _SRS_KICKS_STD[kickKey];
  if (!kicks) return false;

  for (const [kdx, kdy] of kicks) {
    const tx = piece.position.x + kdx * BLOCK_SIZE;
    const ty = piece.position.y + kdy * BLOCK_SIZE;
    if (_srsPositionValid(newMatrix, tx, ty, piece.position.z)) {
      piece.position.x          = tx;
      piece.position.y          = ty;
      piece.userData.shapeMatrix = newMatrix;
      piece.userData.rotState    = toState;
      piece.userData.timeSinceRotation = 0;
      // Flag for downstream T-spin bonus: was this rotation assisted by a kick?
      piece.userData.lastRotWasKick = (kdx !== 0 || kdy !== 0);

      _applyMatrixToPiece(piece, newMatrix);

      if (typeof updatePieceShadow === 'function') updatePieceShadow(piece);

      if (typeof playRotateSound === 'function') playRotateSound();
      nudgeCooldown = NUDGE_COOLDOWN_SECS;
      piece.userData.nudgePulseEnd = clock.getElapsedTime() + NUDGE_EMISSIVE_PULSE_SECS;
      if (typeof tutorialNotify === 'function') tutorialNotify('rotate');
      if (typeof tutorialTip   === 'function') tutorialTip('firstNudge');
      if (typeof finesseCountInput === 'function') finesseCountInput();
      // Reset player lock delay on successful rotation (up to 15 resets).
      _tryResetPlayerLockDelay(piece);
      return true;
    }
  }
  return false; // all kick tests failed
}

/**
 * Rotate 180° — two successive CW rotations.
 * Returns true if either rotation succeeded.
 */
function rotatePlayerPiece180() {
  const r1 = rotatePlayerPiece(true);
  const r2 = rotatePlayerPiece(true);
  return r1 || r2;
}

/**
 * Hard drop: instantly teleport the active falling piece to its landing position
 * and trigger immediate locking on the next frame.
 */
function doHardDrop() {
  const piece = getNudgeTargetPiece();
  if (!piece) return;
  if (typeof isThinkModeActive === 'function' && isThinkModeActive()) return;
  if (typeof timeFreezeActive !== 'undefined' && timeFreezeActive) return;
  if (typeof isPuzzleMode !== 'undefined' && isPuzzleMode) return;
  if (typeof isCustomPuzzleMode !== 'undefined' && isCustomPuzzleMode) return;

  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  const castDir = new THREE.Vector3();
  switch (_grav) {
    case 'up':    castDir.set(0, +1, 0); break;
    case 'left':  castDir.set(-1, 0, 0); break;
    case 'right': castDir.set(+1, 0, 0); break;
    default:      castDir.set(0, -1, 0); break;
  }

  const _hdRaycaster = new THREE.Raycaster();
  const _hdWP = new THREE.Vector3();
  const targets = worldGroup ? worldGroup.children : [];
  const HARD_FLOOR = typeof GAME_OVER_HEIGHT !== 'undefined' ? GAME_OVER_HEIGHT : 30;

  // Compute per-block landing surface, take the max delta (first contact).
  let landingDelta = -Infinity;
  piece.children.forEach(function (block) {
    block.getWorldPosition(_hdWP);
    _hdRaycaster.set(_hdWP.clone(), castDir);
    const hits = _hdRaycaster.intersectObjects(targets, false);
    let surfaceVal;
    if (hits.length > 0) {
      switch (_grav) {
        case 'up':    surfaceVal = hits[0].point.y; break;
        case 'left':  surfaceVal = hits[0].point.x; break;
        case 'right': surfaceVal = hits[0].point.x; break;
        default:      surfaceVal = hits[0].point.y; break;
      }
    } else {
      switch (_grav) {
        case 'up':    surfaceVal =  HARD_FLOOR; break;
        case 'left':  surfaceVal = -HARD_FLOOR; break;
        case 'right': surfaceVal =  HARD_FLOOR; break;
        default:      surfaceVal = 0; break;
      }
    }
    var delta;
    switch (_grav) {
      case 'up':    delta = surfaceVal - BLOCK_SIZE / 2 - _hdWP.y; break;
      case 'left':  delta = surfaceVal + BLOCK_SIZE / 2 - _hdWP.x; break;
      case 'right': delta = surfaceVal - BLOCK_SIZE / 2 - _hdWP.x; break;
      default:      delta = surfaceVal + BLOCK_SIZE / 2 - _hdWP.y; break;
    }
    if (delta > landingDelta) landingDelta = delta;
  });

  if (!isFinite(landingDelta)) return;

  // Teleport piece to landing position.
  switch (_grav) {
    case 'down':
    case 'up':    piece.position.y += landingDelta; break;
    case 'left':
    case 'right': piece.position.x += landingDelta; break;
  }

  // Stop velocity so piece doesn't continue falling past the surface.
  if (piece.userData.velocity) {
    piece.userData.velocity.x = 0;
    piece.userData.velocity.y = 0;
    piece.userData.velocity.z = 0;
  }

  // Force immediate lock: set lock-delay to 0 — processed next frame.
  piece.userData.playerLockDelayRemaining = 0;
  piece.userData.playerLockDelayTotal     = 0;
  piece.userData.playerLockDelayResets    = 0;
  if (piece.userData.lockDelayRemaining !== undefined) {
    piece.userData.lockDelayRemaining = 0;
  }
  delete piece.userData.lockDriftVel;

  if (typeof updatePieceShadow === 'function') updatePieceShadow(piece);
  if (typeof playHardDropSound === 'function') {
    playHardDropSound(piece.position.x, 0.8);
  }
}

// ── Gravity helpers ───────────────────────────────────────────────────────────

/**
 * Apply gravity-direction-aware spawn position and initial velocity to a piece.
 * spawnA and spawnB are the two random spread coordinates (the axes perpendicular
 * to the gravity axis). speed is the scalar fall speed (always positive).
 */
function _applyGravitySpawn(piece3D, spawnA, spawnB, speed) {
  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  switch (_grav) {
    case 'up':
      // Spawn below, fall upward toward ceiling at GAME_OVER_HEIGHT
      piece3D.position.set(spawnA, -(WORLD_SIZE * 0.4), spawnB);
      piece3D.userData.velocity = new THREE.Vector3(0, speed, 0);
      break;
    case 'left':
      // Spawn at right edge, fall leftward; Y fixed near ground level
      piece3D.position.set(WORLD_SIZE * 0.55, BLOCK_SIZE * 2, spawnA);
      piece3D.userData.velocity = new THREE.Vector3(-speed, 0, 0);
      break;
    case 'right':
      // Spawn at left edge, fall rightward
      piece3D.position.set(-(WORLD_SIZE * 0.55), BLOCK_SIZE * 2, spawnA);
      piece3D.userData.velocity = new THREE.Vector3(speed, 0, 0);
      break;
    default: // 'down'
      piece3D.position.set(spawnA, WORLD_SIZE * 0.6, spawnB);
      piece3D.userData.velocity = new THREE.Vector3(0, -speed, 0);
      break;
  }
}

/** Get the "extremal" world-position value for landing distance calculation. */
function _getPieceGravityExtreme(piece) {
  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  const tv = new THREE.Vector3();
  let extreme = (_grav === 'down') ? Infinity
              : (_grav === 'up')   ? -Infinity
              : (_grav === 'left') ? Infinity
              : -Infinity; // 'right'
  piece.children.forEach((block) => {
    block.getWorldPosition(tv);
    switch (_grav) {
      case 'down':  if (tv.y < extreme) extreme = tv.y; break;
      case 'up':    if (tv.y > extreme) extreme = tv.y; break;
      case 'left':  if (tv.x < extreme) extreme = tv.x; break;
      case 'right': if (tv.x > extreme) extreme = tv.x; break;
    }
  });
  return extreme;
}

/**
 * Detect T-spin type for a landed T-piece.
 * Checks the 4 diagonal corners around the T-piece hub block.
 * @param {THREE.Object3D[]} pieceBlocks - the 4 blocks of the T-piece after landing
 * @returns {'full'|'mini'|''} T-spin type
 */
function _detectTPieceTSpinType(pieceBlocks) {
  // Find hub block: the block orthogonally adjacent to 3 other T-piece blocks.
  let hubBlock = null;
  for (let i = 0; i < pieceBlocks.length; i++) {
    const gp = pieceBlocks[i].userData.gridPos;
    if (!gp) continue;
    let n = 0;
    for (let j = 0; j < pieceBlocks.length; j++) {
      if (i === j) continue;
      const op = pieceBlocks[j].userData.gridPos;
      if (!op) continue;
      const dx = Math.abs(gp.x - op.x);
      const dz = Math.abs(gp.z - op.z);
      const dy = Math.abs(gp.y - op.y);
      if ((dx === 1 && dz === 0 && dy < 0.6) || (dx === 0 && dz === 1 && dy < 0.6)) n++;
    }
    if (n >= 3) { hubBlock = pieceBlocks[i]; break; }
  }
  if (!hubBlock || !hubBlock.userData.gridPos) return '';

  const cx = hubBlock.userData.gridPos.x;
  const cy = hubBlock.userData.gridPos.y;
  const cz = hubBlock.userData.gridPos.z;
  const halfWorld = (typeof WORLD_SIZE !== 'undefined' ? WORLD_SIZE : 50) / 2;

  // Check the 4 diagonal corners in the XZ plane.
  let occupied = 0;
  const corners = [[cx-1,cz-1],[cx-1,cz+1],[cx+1,cz-1],[cx+1,cz+1]];
  for (let k = 0; k < corners.length; k++) {
    const nx = corners[k][0], nz = corners[k][1];
    if (Math.abs(nx) >= halfWorld || Math.abs(nz) >= halfWorld) {
      // Wall counts as occupied.
      occupied++;
    } else {
      const layer = (typeof gridOccupancy !== 'undefined') ? gridOccupancy.get(cy) : null;
      if (layer && layer.has(nx + ',' + nz)) occupied++;
    }
  }

  if (occupied >= 3) return 'full';
  if (occupied === 2) return 'mini';
  return '';
}

// Check if the player is close to a landing piece and apply a lateral push.
function checkAndApplyPlayerPush(piece) {
  if (!controls) return;
  const playerPos = controls.getObject().position;

  // Compute horizontal center of the piece from its blocks
  const center = new THREE.Vector3();
  const tempVec = new THREE.Vector3();
  piece.children.forEach((block) => {
    block.getWorldPosition(tempVec);
    center.add(tempVec);
  });
  if (piece.children.length === 0) return;
  center.divideScalar(piece.children.length);

  // Check each block's horizontal distance from the player
  let tooClose = false;
  piece.children.forEach((block) => {
    block.getWorldPosition(tempVec);
    const dx = playerPos.x - tempVec.x;
    const dz = playerPos.z - tempVec.z;
    if (Math.sqrt(dx * dx + dz * dz) < PUSH_DISTANCE_THRESHOLD) {
      tooClose = true;
    }
  });
  if (!tooClose) return;

  // Push direction: horizontal vector from piece center to player
  const pushDir = new THREE.Vector3(
    playerPos.x - center.x,
    0,
    playerPos.z - center.z
  );
  if (pushDir.length() < 0.001) {
    pushDir.set(1, 0, 0); // fallback: push sideways if player is directly over center
  } else {
    pushDir.normalize();
  }

  playerPushVelocity.copy(pushDir.multiplyScalar(PUSH_SPEED));
  screenShakeActive = true;
  screenShakeStart = clock.getElapsedTime();
}

/** Returns the falling piece closest to its landing wall, if within nudge activation zone. */
function getNudgeTargetPiece() {
  const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  let closestPiece = null;
  let closestExtreme = (_grav === 'down' || _grav === 'left') ? Infinity : -Infinity;
  const _tv = new THREE.Vector3();
  fallingPieces.forEach((piece) => {
    let extreme = (_grav === 'down' || _grav === 'left') ? Infinity : -Infinity;
    piece.children.forEach((block) => {
      block.getWorldPosition(_tv);
      switch (_grav) {
        case 'down':  if (_tv.y < extreme) extreme = _tv.y; break;
        case 'up':    if (_tv.y > extreme) extreme = _tv.y; break;
        case 'left':  if (_tv.x < extreme) extreme = _tv.x; break;
        case 'right': if (_tv.x > extreme) extreme = _tv.x; break;
      }
    });
    const closer = (_grav === 'down' || _grav === 'left')
      ? (extreme < closestExtreme)
      : (extreme > closestExtreme);
    if (closer) { closestExtreme = extreme; closestPiece = piece; }
  });
  // Activate within NUDGE_PROXIMITY_BLOCKS of the landing boundary
  let distToWall;
  switch (_grav) {
    case 'down':  distToWall = closestExtreme - BLOCK_SIZE / 2; break;  // above ground=0
    case 'up':    distToWall = GAME_OVER_HEIGHT - closestExtreme; break; // below ceiling
    case 'left':  distToWall = closestExtreme + GAME_OVER_HEIGHT; break; // right of left wall
    case 'right': distToWall = GAME_OVER_HEIGHT - closestExtreme; break; // left of right wall
  }
  if (closestPiece && distToWall <= NUDGE_PROXIMITY_BLOCKS * BLOCK_SIZE) {
    return closestPiece;
  }
  return null;
}

/** Spawn a directional swoosh burst of particles from the piece center in the nudge direction. */
function spawnNudgeSwoosh(center, dx, dz, colorIndex) {
  const col = COLORS[colorIndex];
  if (!col) return;
  const swooshColor = new THREE.Color(col);
  swooshColor.r = Math.min(swooshColor.r * 1.6 + 0.15, 1);
  swooshColor.g = Math.min(swooshColor.g * 1.6 + 0.15, 1);
  swooshColor.b = Math.min(swooshColor.b * 1.6 + 0.15, 1);
  const count = 7;
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: swooshColor, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(_NUDGE_PARTICLE_GEO, mat);
    mesh.position.set(
      center.x + (Math.random() - 0.5) * 1.5,
      center.y + (Math.random() - 0.5) * 1.5,
      center.z + (Math.random() - 0.5) * 1.5
    );
    scene.add(mesh);
    const baseSpeed = 5 + Math.random() * 3;
    dustParticles.push({
      mesh,
      velocity: new THREE.Vector3(
        dx * baseSpeed + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.5,
        dz * baseSpeed + (Math.random() - 0.5) * 2
      ),
      startTime: clock.getElapsedTime(),
      lifetime: 0.25,
    });
  }
}

/**
 * Nudge the piece closest to the ground by (dx, dz) blocks on the X/Z axes.
 * Rate limiting is handled by the DAS/ARR module (input-das.js); this function
 * no longer enforces a cooldown so that DAS/ARR can fire at arbitrary rates.
 *
 * @returns {boolean} true if the piece moved, false if blocked by boundary.
 */
function applyNudge(dx, dz) {
  const piece = getNudgeTargetPiece();
  if (!piece) return false;

  // Mirror modifier: flip left/right controls
  if (typeof endlessMirrorActive !== 'undefined' && endlessMirrorActive) dx = -dx;

  const newOffsetX = piece.userData.nudgeOffsetX + dx;
  const newOffsetZ = piece.userData.nudgeOffsetZ + dz;

  // Enforce per-axis cumulative limit
  if (dx !== 0 && Math.abs(newOffsetX) > NUDGE_MAX_OFFSET) return false;
  if (dz !== 0 && Math.abs(newOffsetZ) > NUDGE_MAX_OFFSET) return false;

  // World boundary guard (1-block buffer inside world edge)
  const newX = piece.position.x + dx * BLOCK_SIZE;
  const newZ = piece.position.z + dz * BLOCK_SIZE;
  if (Math.abs(newX) > WORLD_SIZE / 2 - BLOCK_SIZE) return false;
  if (Math.abs(newZ) > WORLD_SIZE / 2 - BLOCK_SIZE) return false;

  // Apply the nudge
  piece.position.x = newX;
  piece.position.z = newZ;
  piece.userData.nudgeOffsetX = newOffsetX;
  piece.userData.nudgeOffsetZ = newOffsetZ;

  // Move click sound (lateral nudge — distinct from rotation click)
  if (typeof playPieceMoveSound === 'function') playPieceMoveSound();
  if (typeof tutorialNotify === "function") tutorialNotify("nudge");
  if (typeof tutorialTip === "function") tutorialTip("firstNudge");
  // Emissive pulse (visual feedback); nudgeCooldown kept for legacy UI-hint compat.
  nudgeCooldown = NUDGE_COOLDOWN_SECS;
  piece.userData.nudgePulseEnd = clock.getElapsedTime() + NUDGE_EMISSIVE_PULSE_SECS;

  // Force an immediate trail snapshot so the afterimage shows the pre-nudge position.
  if (piece.userData.trail) piece.userData.trail.pendingSnapshot = true;

  // Swoosh particles from piece center
  const center = new THREE.Vector3();
  const _tv = new THREE.Vector3();
  piece.children.forEach((block) => {
    block.getWorldPosition(_tv);
    center.add(_tv);
  });
  if (piece.children.length > 0) {
    center.divideScalar(piece.children.length);
    spawnNudgeSwoosh(center, dx, dz, piece.userData.colorIndex);
  }
  // Reset player lock delay on successful move (up to 15 resets).
  _tryResetPlayerLockDelay(piece);
  return true;
}

// ── Player lock delay helpers ─────────────────────────────────────────────────
// Returns the effective lock delay in seconds for the current game mode.
// Zen = relaxed (0.8 s), Sprint/Battle = standard (0.5 s), else use setting.
function _getPlayerLockDelaySecs() {
  if (typeof isZenMode    !== 'undefined' && isZenMode)    return 0.8;
  if (typeof isSprintMode !== 'undefined' && isSprintMode) return 0.5;
  if (typeof isBattleMode !== 'undefined' && isBattleMode) return 0.5;
  const ms = typeof playerLockDelayMs !== 'undefined' ? playerLockDelayMs : 500;
  return ms / 1000;
}

// Enable transparent fade on all blocks of a piece at the start of lock delay.
function _startLockDelayVisual(piece) {
  piece.children.forEach(function (block) {
    if (!block.material) return;
    block.userData._ldOrigTransparent = block.material.transparent;
    block.userData._ldOrigOpacity     = block.material.opacity;
    block.material.transparent = true;
    block.material.needsUpdate  = true;
  });
}

// Update block opacity to show countdown (1.0 → 0.35 as time runs out).
function _updateLockDelayVisual(piece) {
  const rem   = piece.userData.playerLockDelayRemaining;
  const total = piece.userData.playerLockDelayTotal;
  if (rem === undefined || total === undefined || total <= 0) return;
  const t       = Math.max(0, Math.min(1, rem / total));
  const opacity = 0.35 + t * 0.65;
  piece.children.forEach(function (block) {
    if (!block.material) return;
    block.material.opacity    = opacity;
    block.material.needsUpdate = true;
  });
}

// Restore original opacity/transparency after lock delay ends or resets.
function _restoreLockDelayVisual(piece) {
  piece.children.forEach(function (block) {
    if (!block.material) return;
    block.material.transparent = block.userData._ldOrigTransparent !== undefined ? block.userData._ldOrigTransparent : false;
    block.material.opacity     = block.userData._ldOrigOpacity     !== undefined ? block.userData._ldOrigOpacity     : 1.0;
    block.material.needsUpdate = true;
    delete block.userData._ldOrigTransparent;
    delete block.userData._ldOrigOpacity;
  });
}

// Try to reset the player lock delay for the given piece (on move / rotate).
// Does nothing if no delay is active or the reset cap (15) is reached.
function _tryResetPlayerLockDelay(piece) {
  if (piece.userData.playerLockDelayRemaining === undefined) return;
  const resets = piece.userData.playerLockDelayResets || 0;
  if (resets >= 15) return;
  piece.userData.playerLockDelayResets    = resets + 1;
  piece.userData.playerLockDelayRemaining = piece.userData.playerLockDelayTotal;
  _updateLockDelayVisual(piece);
}

function updateFallingPieces(delta) {
  // Think Mode (puzzle): zero gravity while F is held.
  if (typeof isThinkModeActive === "function" && isThinkModeActive()) return;

  // Time Freeze: all pieces stop falling (player can mine/reposition freely).
  if (timeFreezeActive) return;

  // Apply fall-speed modifiers: Slow Down power-up (0.5×), Ice Bridge (0.8×), or tutorial (0.5×).
  const _tutSlow = typeof isTutorialSlowActive === 'function' && isTutorialSlowActive();
  const effectiveDelta = _tutSlow ? delta * 0.5 : slowDownActive ? delta * 0.5 : iceBridgeSlowActive ? delta * 0.8 : delta;

  // Ice biome: lock delay in seconds (0 = no delay). Mobile adds extra grace time.
  const _mobileLockAdd = (typeof mobileOverridesActive !== 'undefined' && mobileOverridesActive)
    ? MOBILE_OVERRIDES.lockDelayAddSecs : 0;
  const _lockDelaySecs = (typeof getBiomeLockDelaySecs === 'function' ? getBiomeLockDelaySecs() : 0)
    + _mobileLockAdd;
  const _lockDrift     = typeof getBiomeLockDrift === 'function' ? getBiomeLockDrift() : false;

  const landedPieces = [];
  fallingPieces.forEach((piece, i) => {
    // ── Ice biome: tick active lock delay ─────────────────────────────────────
    if (piece.userData.lockDelayRemaining !== undefined) {
      piece.userData.lockDelayRemaining -= effectiveDelta;

      // Apply lateral drift while piece is sliding before lock.
      if (piece.userData.lockDriftVel) {
        const nx = piece.position.x + piece.userData.lockDriftVel.x * effectiveDelta;
        const nz = piece.position.z + piece.userData.lockDriftVel.z * effectiveDelta;
        if (Math.abs(nx) < WORLD_SIZE / 2 - BLOCK_SIZE) piece.position.x = nx;
        if (Math.abs(nz) < WORLD_SIZE / 2 - BLOCK_SIZE) piece.position.z = nz;
      }

      updatePieceShadow(piece);

      if (piece.userData.lockDelayRemaining <= 0) {
        // Delay expired — lock the piece now.
        landedPieces.push(i);
      }
      return; // Skip normal fall physics for this piece.
    }

    // ── Player lock delay: tick countdown, apply visual, lock when expired ────
    if (piece.userData.playerLockDelayRemaining !== undefined) {
      piece.userData.playerLockDelayRemaining -= effectiveDelta;
      _updateLockDelayVisual(piece);
      updatePieceShadow(piece);
      if (piece.userData.playerLockDelayRemaining <= 0) {
        _restoreLockDelayVisual(piece);
        landedPieces.push(i);
      }
      return; // Skip normal fall physics — piece is resting on surface.
    }

    piece.userData.timeSinceRotation += delta;
    if (
      piece.userData.timeSinceRotation >= piece.userData.rotationInterval
    ) {
      applyRandomRotation(piece);
      piece.userData.timeSinceRotation = 0;
      piece.userData.rotationInterval =
        _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
        MIN_ROTATION_INTERVAL;
    }
    // ── Position update: use full velocity vector (handles all gravity directions) ──
    piece.position.x += piece.userData.velocity.x * effectiveDelta;
    piece.position.y += piece.userData.velocity.y * effectiveDelta;
    updatePieceShadow(piece);

    // ── Find extremal block position along the gravity axis ───────────────────
    const _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
    let gravExtreme = (_grav === 'down' || _grav === 'left') ? Infinity : -Infinity;
    piece.children.forEach((block) => {
      block.getWorldPosition(
        (block.userData.tempVec =
          block.userData.tempVec || new THREE.Vector3())
      );
      switch (_grav) {
        case 'down':  if (block.userData.tempVec.y < gravExtreme) gravExtreme = block.userData.tempVec.y; break;
        case 'up':    if (block.userData.tempVec.y > gravExtreme) gravExtreme = block.userData.tempVec.y; break;
        case 'left':  if (block.userData.tempVec.x < gravExtreme) gravExtreme = block.userData.tempVec.x; break;
        case 'right': if (block.userData.tempVec.x > gravExtreme) gravExtreme = block.userData.tempVec.x; break;
      }
    });

    let landed = false;
    // ── Collision with worldGroup static blocks ───────────────────────────────
    piece.children.forEach((block) => {
      if (landed) return;
      block.getWorldPosition(block.userData.tempVec);
      const bwp = block.userData.tempVec;
      worldGroup.children.forEach((staticObj) => {
        if (landed || staticObj.name === "ground") return;
        const staticBox = (staticObj.userData.boundingBox =
          staticObj.userData.boundingBox ||
          new THREE.Box3().setFromObject(staticObj));
        const fallingBlockWorldBox = (block.userData.worldBox =
          block.userData.worldBox || new THREE.Box3());
        fallingBlockWorldBox.setFromCenterAndSize(
          bwp,
          (block.userData.sizeVec =
            block.userData.sizeVec ||
            new THREE.Vector3(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE))
        );
        if (!fallingBlockWorldBox.intersectsBox(staticBox)) return;
        switch (_grav) {
          case 'down': {
            const blockBottomY = bwp.y - BLOCK_SIZE / 2;
            if (blockBottomY <= staticBox.max.y + 0.01) {
              piece.position.y += staticBox.max.y + BLOCK_SIZE / 2 - bwp.y;
              landed = true;
            }
            break;
          }
          case 'up': {
            const blockTopY = bwp.y + BLOCK_SIZE / 2;
            if (blockTopY >= staticBox.min.y - 0.01) {
              piece.position.y -= (blockTopY - staticBox.min.y);
              landed = true;
            }
            break;
          }
          case 'left': {
            const blockLeftX = bwp.x - BLOCK_SIZE / 2;
            if (blockLeftX <= staticBox.max.x + 0.01) {
              piece.position.x += staticBox.max.x + BLOCK_SIZE / 2 - bwp.x;
              landed = true;
            }
            break;
          }
          case 'right': {
            const blockRightX = bwp.x + BLOCK_SIZE / 2;
            if (blockRightX >= staticBox.min.x - 0.01) {
              piece.position.x -= (blockRightX - staticBox.min.x);
              landed = true;
            }
            break;
          }
        }
      });
    });
    // ── Direct underground grid check (down gravity only) ─────────────────────
    if (!landed && _grav === 'down' &&
        typeof ugWorldToIndex === 'function' && typeof ugInBounds === 'function' &&
        typeof undergroundGrid !== 'undefined' && undergroundGrid) {
      piece.children.forEach((block) => {
        if (landed) return;
        block.getWorldPosition(block.userData.tempVec);
        const bx = block.userData.tempVec.x;
        const by = block.userData.tempVec.y;
        const bz = block.userData.tempVec.z;
        const blockBottomY = by - BLOCK_SIZE / 2;
        const idx = ugWorldToIndex(bx, blockBottomY, bz);
        if (ugInBounds(idx.xi, idx.zi, idx.yi) && undergroundGrid[idx.xi][idx.zi][idx.yi] !== null) {
          const solidTopY = 1.0 - idx.yi;
          if (blockBottomY <= solidTopY + 0.01) {
            piece.position.y += solidTopY + BLOCK_SIZE / 2 - by;
            landed = true;
          }
        }
      });
    }
    // ── Hard boundary checks for each gravity direction ───────────────────────
    if (!landed) {
      switch (_grav) {
        case 'down':
          // Bedrock floor at Y = -30
          if (gravExtreme <= -30.0) {
            piece.position.y += -30.0 - gravExtreme;
            landed = true;
          }
          break;
        case 'up':
          // Ceiling at Y = GAME_OVER_HEIGHT (pieces land here first, stack downward)
          if (gravExtreme >= GAME_OVER_HEIGHT) {
            piece.position.y -= (gravExtreme - GAME_OVER_HEIGHT);
            landed = true;
          }
          break;
        case 'left':
          // Left wall at X = -GAME_OVER_HEIGHT
          if (gravExtreme <= -GAME_OVER_HEIGHT) {
            piece.position.x += (-GAME_OVER_HEIGHT - gravExtreme);
            landed = true;
          }
          break;
        case 'right':
          // Right wall at X = +GAME_OVER_HEIGHT
          if (gravExtreme >= GAME_OVER_HEIGHT) {
            piece.position.x -= (gravExtreme - GAME_OVER_HEIGHT);
            landed = true;
          }
          break;
      }
    }
    if (landed) {
      if (_lockDelaySecs > 0) {
        // Ice biome: start lock delay — piece rests at ground but doesn't lock yet.
        piece.userData.lockDelayRemaining = _lockDelaySecs;
        if (_lockDrift) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 0.5;  // 0.5–1.0 units/s lateral drift
          piece.userData.lockDriftVel = {
            x: Math.cos(angle) * speed,
            z: Math.sin(angle) * speed,
          };
        }
        // Do not add to landedPieces yet — handled in the lock-delay tick above.
      } else {
        // Player lock delay: give the player time to move/rotate before locking.
        const _pld = _getPlayerLockDelaySecs();
        if (_pld > 0 && piece.userData.playerLockDelayRemaining === undefined) {
          piece.userData.playerLockDelayRemaining = _pld;
          piece.userData.playerLockDelayTotal     = _pld;
          piece.userData.playerLockDelayResets    = 0;
          _startLockDelayVisual(piece);
          // Do not add to landedPieces yet — handled in the player-lock-delay tick.
        } else if (piece.userData.playerLockDelayRemaining === undefined) {
          landedPieces.push(i);
        }
        // If playerLockDelayRemaining is already set, it was already counted; skip.
      }
    }
  });
  for (let i = landedPieces.length - 1; i >= 0; i--) {
    const index = landedPieces[i];
    const pieceToLand = fallingPieces[index];
    // Clean up Ice biome lock-delay state (may be set if delay just expired).
    delete pieceToLand.userData.lockDelayRemaining;
    delete pieceToLand.userData.lockDriftVel;
    // Clean up player lock-delay state.
    delete pieceToLand.userData.playerLockDelayRemaining;
    delete pieceToLand.userData.playerLockDelayTotal;
    delete pieceToLand.userData.playerLockDelayResets;

    checkAndApplyPlayerPush(pieceToLand);
    playPlaceSound();
    // Procedural lock clunk (Tone.js) — layers a clunk on top of the Howler placement sound
    if (typeof playPieceLockSound === 'function') playPieceLockSound();
    // Hard drop impact sound — spatial pan based on piece X position
    if (typeof playHardDropSound === 'function') {
      const _hdPx = pieceToLand.position.x;
      const _hdBlocks = pieceToLand.children.length;
      const _hdIntensity = Math.min(0.5 + (_hdBlocks / 4) * 0.4 + (lastDifficultyTier || 0) * 0.04, 1.0);
      playHardDropSound(_hdPx, _hdIntensity);
    }
    // Haptic feedback on piece lock for touch devices.
    if (typeof mobileOverridesActive !== 'undefined' && mobileOverridesActive) {
      try { if (navigator.vibrate) navigator.vibrate(20); } catch (_) {}
    }
    disposePieceTrail(pieceToLand);

    // ── Shockwave ring + chromatic aberration on landing ─────────────────────
    {
      const _rc = new THREE.Vector3();
      const _rv = new THREE.Vector3();
      let _lowestY = Infinity;
      const _blockCount = pieceToLand.children.length;
      pieceToLand.children.forEach((block) => {
        block.getWorldPosition(_rv);
        _rc.add(_rv);
        if (_rv.y < _lowestY) _lowestY = _rv.y;
      });
      if (_blockCount > 0) {
        _rc.divideScalar(_blockCount);
        _rc.y = _lowestY - BLOCK_SIZE / 2;  // bottom face of lowest block
        spawnLandingRing(_rc);
        // Hard landing: 4+ blocks in piece OR speed level > 5
        if (_blockCount >= 4 || lastDifficultyTier > 5) {
          if (typeof triggerChromaticAberration === 'function') {
            triggerChromaticAberration(0.006, 0.2);
          }
        }
      }
    }

    const newBlocks = [];
    while (pieceToLand.children.length > 0) {
      const block = pieceToLand.children[0];
      block.getWorldPosition(block.userData.tempVec);
      block.getWorldQuaternion(
        (block.userData.tempQuat =
          block.userData.tempQuat || new THREE.Quaternion())
      );
      worldGroup.attach(block);
      block.position.copy(block.userData.tempVec);
      block.quaternion.copy(block.userData.tempQuat);
      block.name = "landed_block";
      spawnSnapAnimation(block);
      registerBlock(block);
      // Underground grid: register blocks that land below surface (Y < 0.5)
      if (block.userData.gridPos && block.userData.gridPos.y < 0.5 &&
          typeof onBlockPlaced === 'function' && typeof ugWorldToIndex === 'function') {
        const _ugIdx = ugWorldToIndex(
          block.userData.gridPos.x,
          block.userData.gridPos.y,
          block.userData.gridPos.z
        );
        if (typeof ugInBounds === 'function' && ugInBounds(_ugIdx.xi, _ugIdx.zi, _ugIdx.yi)) {
          onBlockPlaced(_ugIdx.xi, _ugIdx.zi, _ugIdx.yi, block.userData.materialType, block);
        }
      }
      newBlocks.push(block);
    }
    removePieceShadow(pieceToLand);
    // T-spin: detect and flag when a T-piece (colorIndex 1) lands.
    // Uses corner-occupancy check: 3+ corners = full, 2 corners = mini.
    // checkLineClear() reads and consumes this flag for scoring and effects.
    if (typeof lastPieceTSpin !== 'undefined') {
      lastPieceTSpin = (pieceToLand.userData.colorIndex === 1)
        ? _detectTPieceTSpinType(newBlocks)
        : '';
    }
    // Finesse: compute faults for this placement.
    if (typeof finesseOnPieceLand === 'function') {
      finesseOnPieceLand(
        pieceToLand.userData.colorIndex,
        pieceToLand.userData.nudgeOffsetZ || 0,
        pieceToLand.userData.rotState     || 0
      );
    }
    fallingPiecesGroup.remove(pieceToLand);
    fallingPieces.splice(index, 1);
    // Unlock hold so the player can hold again next turn.
    if (typeof holdLocked !== 'undefined') {
      holdLocked = false;
      if (typeof updateHoldPanelHUD === 'function') updateHoldPanelHUD();
    }
    if (typeof tcVibrateOnLock === 'function') tcVibrateOnLock();
    checkLineClear(newBlocks);
    // Desert biome: schedule sand block crumble for sand pieces
    var _sandCrumbleSecs = typeof getDesertSandCrumbleSecs === 'function' ? getDesertSandCrumbleSecs() : 0;
    if (pieceToLand.userData.isSandPiece && _sandCrumbleSecs > 0) {
      newBlocks.forEach(function (sandBlock) {
        sandBlock.userData.isSandBlock = true;
        setTimeout(function () {
          // Only crumble if still in the world (not cleared by a line clear)
          if (sandBlock.parent === worldGroup) {
            if (typeof unregisterBlock === 'function') unregisterBlock(sandBlock);
            if (typeof disposeBlock === 'function') disposeBlock(sandBlock);
            worldGroup.remove(sandBlock);
          }
        }, _sandCrumbleSecs * 1000);
      });
    }
    // Co-op: broadcast landed blocks for reconciliation on partner's client
    if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
      var _landData = newBlocks.map(function (b) {
        var gp = b.userData.gridPos;
        return { pos: [gp.x, gp.y, gp.z], color: b.userData.canonicalColor };
      });
      coop.send({ type: 'world', action: 'land', blocks: _landData });
    }
    // Battle: broadcast column heights so opponent can update their mini-map
    if (isBattleMode && typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
      battlePiecesPlaced++;
      // Rolling 60-second APM window
      const _nowMs = Date.now();
      _battleApmTimestamps.push(_nowMs);
      const _cutoff = _nowMs - 60000;
      while (_battleApmTimestamps.length > 0 && _battleApmTimestamps[0] < _cutoff) {
        _battleApmTimestamps.shift();
      }
      const _apm = _battleApmTimestamps.length; // pieces placed in last 60 s = APM
      const _guildCosmetics = (typeof getMyGuildCosmetics === 'function') ? getMyGuildCosmetics() : null;
      battle.send({
        type: 'battle_board',
        cols: _computeBattleColumnHeights(),
        score: score,
        level: lastDifficultyTier + 1,
        linesCleared: linesCleared,
        piecesPlaced: battlePiecesPlaced,
        apm: _apm,
        guildEmblem:     _guildCosmetics ? _guildCosmetics.emblem : null,
        guildBoardSkin:  _guildCosmetics ? _guildCosmetics.activeBoardSkin : null,
        guildBannerColor: _guildCosmetics ? _guildCosmetics.bannerColor : null,
        guildIsLegendary: _guildCosmetics ? _guildCosmetics.isLegendary : false,
        playerBoardSkin: (typeof getActiveBoardSkin === 'function') ? getActiveBoardSkin() : null,
      });
    }
    if (isPuzzleMode || isCustomPuzzleMode) {
      if (typeof checkPuzzleConditions === "function") checkPuzzleConditions();
      if (!isPuzzleMode) checkGameOver(); // custom puzzle: still check game-over (blocks too high)
    } else if (typeof isTrainingMode !== 'undefined' && isTrainingMode) {
      // Training mode: capture undo snapshot and track piece count; no game-over from height.
      if (typeof captureTrainingSnapshot === 'function') captureTrainingSnapshot();
      if (typeof onTrainingPiecePlaced   === 'function') onTrainingPiecePlaced();
    } else {
      checkGameOver();
    }
    if (typeof saveGameState === "function") saveGameState();
    if (isSurvivalMode && typeof saveSurvivalWorld === "function") saveSurvivalWorld();
    if (isEndlessSurvivalMode && typeof applyEndlessGravityPass === 'function') applyEndlessGravityPass();
    if (typeof tutorialNotify === "function") tutorialNotify("pieceLand");
    // Contextual game tooltip: check for nearly-complete rows
    if (typeof gameTooltipCheckNearlyFull === 'function') gameTooltipCheckNearlyFull();
  }

  // Tick nudge cooldown
  nudgeCooldown = Math.max(0, nudgeCooldown - delta);

  // Update nudge hint visibility
  const nudgeHintEl = document.getElementById("nudge-hint");
  if (nudgeHintEl) {
    const showHint = controls && controls.isLocked && !isGameOver && getNudgeTargetPiece() !== null;
    nudgeHintEl.style.display = showHint ? "block" : "none";
  }
}

// ── Battle: compute column heights ───────────────────────────────────────────
// Buckets all occupied grid cells into NUM_COLS X-columns and returns the max
// Y for each. Used to broadcast board state to the opponent in battle mode.
function _computeBattleColumnHeights() {
  const NUM_COLS   = 10;
  const HALF_WORLD = WORLD_SIZE / 2;           // 25
  const colWidth   = WORLD_SIZE / NUM_COLS;    // 5
  const heights    = new Array(NUM_COLS).fill(0);

  for (const [y, cells] of gridOccupancy) {
    for (const key of cells) {
      const x   = parseInt(key.split(',')[0], 10);
      const col = Math.min(Math.floor((x + HALF_WORLD) / colWidth), NUM_COLS - 1);
      if (col >= 0 && heights[col] < y) heights[col] = y;
    }
  }
  return heights;
}

// Called when a spectator joins mid-match so they get an immediate board snapshot.
function broadcastBoardState() {
  if (!isBattleMode || typeof battle === 'undefined' || battle.state !== BattleState.IN_GAME) return;
  const _nowMs = Date.now();
  const _cutoff = _nowMs - 60000;
  while (_battleApmTimestamps.length > 0 && _battleApmTimestamps[0] < _cutoff) {
    _battleApmTimestamps.shift();
  }
  const _apm = _battleApmTimestamps.length;
  const _guildCosmetics = (typeof getMyGuildCosmetics === 'function') ? getMyGuildCosmetics() : null;
  battle.send({
    type: 'battle_board',
    cols: _computeBattleColumnHeights(),
    score: score,
    level: lastDifficultyTier + 1,
    linesCleared: linesCleared,
    piecesPlaced: battlePiecesPlaced,
    apm: _apm,
    guildEmblem:     _guildCosmetics ? _guildCosmetics.emblem : null,
    guildBoardSkin:  _guildCosmetics ? _guildCosmetics.activeBoardSkin : null,
    guildBannerColor: _guildCosmetics ? _guildCosmetics.bannerColor : null,
    guildIsLegendary: _guildCosmetics ? _guildCosmetics.isLegendary : false,
    playerBoardSkin: (typeof getActiveBoardSkin === 'function') ? getActiveBoardSkin() : null,
  });
}
