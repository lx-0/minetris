// Line-clear mechanic — detection, 4-phase explosion animation, and block removal.
// Requires: state.js, config.js, world.js (unregisterBlock), audio.js,
//           gamestate.js (addScore) — must be loaded before lineclear.js.

// ─── Fragment Pool ─────────────────────────────────────────────────────────────
// Pre-allocated pool of meshes, reused across line-clear events to avoid GC spikes.
const _LC_POOL_SIZE = 200;
const _lcFragPool   = [];  // { mesh, active }
const _lcFragments  = [];  // active: { entry, mesh, vel, angVel, age, maxAge }
const _lcRings      = [];  // active: { mesh, age }
const _lcLights     = [];  // active: { light, age, initialIntensity }
const _lcSpringBlks = [];  // active: { mesh, targetY, offset, vel }

// ─── Phase timing ──────────────────────────────────────────────────────────────
const _LC_ANTICIPATION = 0.20;  // seconds of vibration/ramp before detonation
const _LC_FRAG_MIN     = 0.60;  // fragment minimum lifetime (s)
const _LC_FRAG_MAX     = 0.80;  // fragment maximum lifetime (s)
const _LC_RING_EXPAND  = 0.30;  // seconds for ring to reach full radius
const _LC_RING_LIFE    = 0.65;  // total ring lifetime (s)
const _LC_RING_RADIUS  = 15.0;  // maximum ring radius (world units)
const _LC_RING_FADE    = 0.15;  // ring starts fading at this age (s)
const _LC_LIGHT_LIFE   = 0.20;  // point light fade duration (s)

// ─── Spring constants ──────────────────────────────────────────────────────────
const _LC_K = 180;  // spring stiffness
const _LC_D = 16;   // spring damping

// ─── Camera jolt / shake ──────────────────────────────────────────────────────
let _lcJoltAge  = -1;       // -1 = inactive
const _LC_JOLT     = 0.12;  // jolt duration (s)
const _LC_JOLT_STR = 0.18;  // peak upward jolt strength

let _lcShakeAge = -1;       // -1 = inactive
let _lcShakeDur = 0;
const _LC_SHAKE_STR = 0.10;

// ─── Phase state ──────────────────────────────────────────────────────────────
let _lcPhase    = 0;  // 0=idle, 1=anticipation, 2=aftermath
let _lcPhaseAge = 0;
let _lcNumLines = 0;
let _lcIsTSpin          = false;  // current clear was triggered by a T-piece
let _lcIsMiniTSpin      = false;  // current T-spin is a mini T-spin (2 corners)
let _lcPerfectClear     = false;  // board will be empty after this clear
let _lcPerfectClearBonus = 0;     // bonus score awarded for perfect clear (shown in banner)

// ─── Firework particles for T-spin / Perfect Clear ────────────────────────────
// Simple pool-less burst using existing fragment pool; fired from _lcDetonate.
// Colors cycle through festive palette; fragments get extra upward velocity.
const _FIREWORK_COLORS        = [0xff4081, 0xffea00, 0x00e5ff, 0x69f0ae, 0xff6d00, 0xea80fc];
const _TSPIN_FIREWORK_COLORS  = [0xaa00ff, 0xcc44ff, 0xee88ff, 0x9c27b0, 0xce93d8, 0xffffff];

// ─── Co-op line-clear guard ───────────────────────────────────────────────────
// Prevents double-processing when both clients detect the same rows independently
// and a partner broadcast also arrives. Key: sorted row numbers joined by ','.
const _coopLcGuard = new Map(); // key -> timestamp (ms)
const _COOP_LC_TTL = 3000; // ms — guard entries expire after 3 s

function _coopLineClearGuardHas(rows) {
  const key = rows.slice().sort(function (a, b) { return a - b; }).join(',');
  const ts = _coopLcGuard.get(key);
  if (ts === undefined) return false;
  if (Date.now() - ts > _COOP_LC_TTL) { _coopLcGuard.delete(key); return false; }
  return true;
}

function _coopLineClearGuardAdd(rows) {
  const key = rows.slice().sort(function (a, b) { return a - b; }).join(',');
  _coopLcGuard.set(key, Date.now());
}

// ─── Fragment pool API ────────────────────────────────────────────────────────

/**
 * Call once from init() after scene exists.
 * Pre-allocates 200 fragment meshes using a shared BoxGeometry.
 */
function initLineClearFragmentPool() {
  const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  for (let i = 0; i < _LC_POOL_SIZE; i++) {
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 1.0,
      roughness: 0.65,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    _lcFragPool.push({ mesh, active: false });
  }
}

function _lcAcquire() {
  for (let i = 0; i < _lcFragPool.length; i++) {
    if (!_lcFragPool[i].active) { _lcFragPool[i].active = true; return _lcFragPool[i]; }
  }
  return null;  // pool exhausted — skip this fragment
}

function _lcRelease(entry) {
  entry.mesh.visible = false;
  entry.active = false;
}

// ─── 2-D combo particle burst ─────────────────────────────────────────────────
// Lightweight canvas overlay: horizontal particles shoot from cleared-line rows.
const _lcParticles = [];  // { x, y, vx, vy, r, color, age, maxAge }

function _lcSpawnComboBurst(numLines, combo) {
  const cvs = document.getElementById("combo-particle-canvas");
  if (!cvs) return;
  const W = cvs.width, H = cvs.height;
  if (!W || !H) return;

  // Board occupies roughly the center 40% of the canvas width.
  const boardLeft  = W * 0.30;
  const boardRight = W * 0.70;
  const boardTop   = H * 0.08;
  const boardBot   = H * 0.92;

  // Count: base 8 per line × combo intensity, capped at 60.
  const count = Math.min(Math.round(8 * numLines * Math.min(combo * 0.5, 3.0)), 60);
  const colors = combo >= 10 ? ["#cc44ff","#ee88ff","#ffffff"]
               : combo >= 5  ? ["#ff3300","#ff6600","#ffaa00"]
               : combo >= 3  ? ["#ffd700","#ffee44","#ffffff"]
               :               ["#ffaa00","#ffe080","#ffffff"];

  for (let i = 0; i < count; i++) {
    // Spawn along the height corresponding to cleared rows (spread evenly across board).
    const rowFrac = Math.random();
    const spawnY  = boardTop + rowFrac * (boardBot - boardTop);
    // Alternate left / right edge spawn for burst-from-rows look.
    const fromLeft = Math.random() < 0.5;
    const spawnX   = fromLeft ? boardLeft + Math.random() * (boardRight - boardLeft) * 0.2
                              : boardRight - Math.random() * (boardRight - boardLeft) * 0.2;
    const speed    = 120 + Math.random() * 200 * (1 + combo * 0.15);
    const angle    = fromLeft
      ? (Math.random() - 0.5) * Math.PI * 0.8 - Math.PI * 0.5   // leftward fan
      : (Math.random() - 0.5) * Math.PI * 0.8 + Math.PI * 0.5 + Math.PI; // rightward fan
    // For Medium quality, reduce particle size.
    const _quality = (typeof graphicsQualityTier !== 'undefined') ? graphicsQualityTier : 'high';
    const radius   = _quality === 'medium' ? 2 + Math.random() * 2 : 2 + Math.random() * 4;
    _lcParticles.push({
      x: spawnX, y: spawnY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 30,  // slight upward bias
      r: radius,
      color: colors[Math.floor(Math.random() * colors.length)],
      age: 0,
      maxAge: 0.35 + Math.random() * 0.30,
    });
  }
}

function _lcUpdateComboBurst(delta) {
  const cvs = document.getElementById("combo-particle-canvas");
  if (!cvs) return;
  if (_lcParticles.length === 0) return;
  const ctx = cvs.getContext("2d");
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  for (let i = _lcParticles.length - 1; i >= 0; i--) {
    const p = _lcParticles[i];
    p.age += delta;
    if (p.age >= p.maxAge) { _lcParticles.splice(i, 1); continue; }
    p.x  += p.vx * delta;
    p.y  += p.vy * delta;
    p.vy += 200 * delta;  // gravity
    const alpha = Math.max(0, 1 - p.age / p.maxAge);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (_lcParticles.length === 0) ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.globalAlpha = 1;
}

function _lcResizeParticleCanvas() {
  const cvs = document.getElementById("combo-particle-canvas");
  if (!cvs) return;
  const rc = document.getElementById("renderer-container");
  if (!rc) return;
  cvs.width  = rc.clientWidth  || window.innerWidth;
  cvs.height = rc.clientHeight || window.innerHeight;
}

// ─── Board edge glow controller ───────────────────────────────────────────────
// boardGlowIntensity: 0=off, 0.5=low, 1.0=medium, 1.5=high (set by settings)
var boardGlowIntensity = 1.0;

// Line-clear flash state
var _lcLineClearGlowAge      = -1;    // -1 = inactive
var _lcLineClearGlowDuration = 0.40;  // 400ms fade
var _lcLineClearGlowBlur     = 15;    // px
var _lcLineClearGlowSpread   = 4;     // px

/** Kick off a transient line-clear edge flash. Called when lines are cleared. */
function _lcTriggerLineClearGlow(numLines) {
  _lcLineClearGlowAge    = 0;
  _lcLineClearGlowBlur   = numLines >= 4 ? 30 : numLines >= 2 ? 22 : 15;
  _lcLineClearGlowSpread = numLines >= 4 ? 8  : numLines >= 2 ? 5  : 3;
}

/**
 * Applies combined box-shadow to board-glow-overlay each frame.
 * Handles: line-clear flash (all edges, cyan) + combo (L+R edges, warm).
 * Call from updateLineClear() every frame.
 */
function _applyBoardGlow() {
  const el = document.getElementById("board-glow-overlay");
  if (!el) return;

  const _rm = (typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled);
  const intensity = _rm ? 0 : boardGlowIntensity;

  if (intensity <= 0) {
    el.style.boxShadow = 'none';
    return;
  }

  const f = Math.min(intensity, 1.5);
  const shadows = [];

  // ── Line-clear flash: all edges, cyan/white, fades over 400ms ─────────────
  if (_lcLineClearGlowAge >= 0) {
    const t     = Math.max(0, 1 - _lcLineClearGlowAge / _lcLineClearGlowDuration);
    const alpha = (t * 0.9 * Math.min(f, 1.0)).toFixed(3);
    shadows.push(`inset 0 0 ${_lcLineClearGlowBlur}px ${_lcLineClearGlowSpread}px rgba(180,240,255,${alpha})`);
  }

  // ── Combo glow: left + right edges, warm orange→red ───────────────────────
  if ((typeof comboCount !== 'undefined') && comboCount >= 2) {
    const comboT  = Math.min((comboCount - 2) / 8, 1.0);
    const blur    = Math.round(20 + comboT * 30);
    const spread  = Math.round(4  + comboT * 8);
    const g       = Math.round(140 - comboT * 140);  // orange (140) → red (0)
    const alpha   = (Math.min(0.35 + comboT * 0.30, 0.65) * Math.min(f, 1.0)).toFixed(3);
    const color   = `rgba(255,${g},0,${alpha})`;
    // Left + right directional inset shadows
    shadows.push(`inset  ${blur}px 0 ${blur}px -${blur / 2}px ${color}`);
    shadows.push(`inset -${blur}px 0 ${blur}px -${blur / 2}px ${color}`);
  }

  el.style.boxShadow = shadows.length ? shadows.join(', ') : 'none';
}

/** Legacy wrapper kept for call-sites that pass combo directly (combo reset path). */
function _lcUpdateBoardGlow(combo) {
  // State is now driven by _applyBoardGlow() each frame; combo is read from global.
  // This no-op wrapper prevents any remaining callers from breaking.
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called after each piece lands with the array of newly landed blocks.
 * Detects complete Y-levels and starts the explosion sequence.
 */
function checkLineClear(newBlocks) {
  if (lineClearInProgress) return;

  // Consume T-spin flag immediately — applies whether or not lines are cleared.
  const _tSpinType = (typeof lastPieceTSpin !== 'undefined') ? lastPieceTSpin : '';
  if (typeof lastPieceTSpin !== 'undefined') lastPieceTSpin = '';

  // Collect the slab keys touched by the newly landed blocks.
  // Slab key = Y level for down/up gravity; X level for left/right gravity.
  const slabSet = new Set();
  newBlocks.forEach((b) => {
    if (!b.userData.gridPos) return;
    const gp = b.userData.gridPos;
    const sk = (typeof getOccupancySlabKey === 'function')
      ? getOccupancySlabKey(gp.x, gp.y, gp.z)
      : gp.y;
    slabSet.add(sk);
  });

  const completeLevels = [];
  slabSet.forEach((sk) => {
    const layer = gridOccupancy.get(sk);
    const _cellsNeeded = typeof getLineClearCellsNeeded === 'function'
      ? getLineClearCellsNeeded()
      : LINE_CLEAR_CELLS_NEEDED;
    if (layer && layer.size >= _cellsNeeded) completeLevels.push(sk);
  });

  if (!completeLevels.length) {
    // T-spin zero: award score even with no lines cleared.
    if (_tSpinType) {
      const _level = (typeof lastDifficultyTier !== 'undefined') ? (lastDifficultyTier + 1) : 1;
      const _tsZeroBase = _tSpinType === 'full' ? 400 : 100;
      addScore(_tsZeroBase * _level);
      if (typeof sessionTSpins !== 'undefined') sessionTSpins++;
      if (_tSpinType === 'mini' && typeof sessionMiniTSpins !== 'undefined') sessionMiniTSpins++;
      if (typeof playTSpinSound === 'function') playTSpinSound();
      if (lineClearBannerEl) {
        lineClearBannerEl.textContent = _tSpinType === 'mini' ? 'MINI T-SPIN!' : 'T-SPIN!';
        lineClearBannerEl.style.color = '#cc44ff';
        lineClearBannerEl.style.display = 'block';
        bannerTimer = 1.5;
      }
      if (typeof achOnTSpin === 'function') achOnTSpin();
    }
    // Combo Challenge: piece locked without clearing any line — reset streak
    if (typeof isComboChallenge !== 'undefined' && isComboChallenge &&
        typeof comboChallengeOnNoLineClear === 'function') {
      comboChallengeOnNoLineClear();
    }
    return;
  }

  completeLevels.sort((a, b) => a - b);

  // Co-op guard: skip if partner broadcast already triggered this line clear
  if (_coopLineClearGuardHas(completeLevels)) return;
  _coopLineClearGuardAdd(completeLevels);

  // Collect all blocks on complete levels and save their state.
  lineClearFlashBlocks = [];
  worldGroup.children.forEach((obj) => {
    if (obj.name !== "landed_block" || !obj.userData.gridPos) return;
    if (!completeLevels.includes(obj.userData.gridPos.y)) return;
    obj.userData._savedColor = obj.material.color.clone();
    obj.userData._basePos    = obj.position.clone();
    lineClearFlashBlocks.push(obj);
  });

  // Ore crafting: check for ore patterns in the blocks being cleared
  if (typeof checkOreCraftingPatterns === 'function') {
    checkOreCraftingPatterns(lineClearFlashBlocks);
  }

  lineClearPendingYs  = completeLevels;
  lineClearFlashStart = clock.getElapsedTime();
  lineClearInProgress = true;
  _lcPhase            = 1;  // anticipation
  _lcPhaseAge         = 0;
  _lcNumLines         = completeLevels.length;

  // Apply T-spin type from pieces.js (already consumed at top of function).
  _lcIsTSpin     = (_tSpinType !== '');
  _lcIsMiniTSpin = (_tSpinType === 'mini');
  if (_lcIsTSpin) {
    sessionTSpins++;
    if (_lcIsMiniTSpin && typeof sessionMiniTSpins !== 'undefined') sessionMiniTSpins++;
    if (typeof achOnTSpin === 'function') achOnTSpin();
    if (typeof achOnTSpinLines === 'function') achOnTSpinLines(completeLevels.length);
  }

  // Boss Battle: deal damage from this line clear
  if (typeof isBossBattleMode !== 'undefined' && isBossBattleMode) {
    if (typeof bossDealDamage === 'function') {
      var _bossCombo = (typeof comboCount !== 'undefined') ? comboCount : 1;
      bossDealDamage(completeLevels.length, _bossCombo, _lcIsTSpin);
    }
  }

  // Perfect Clear: will the board be empty after removing these rows?
  // Count occupied cells outside the soon-to-be-cleared levels.
  {
    let _remainingCells = 0;
    gridOccupancy.forEach(function (cells, gy) {
      if (!completeLevels.includes(gy)) _remainingCells += cells.size;
    });
    _lcPerfectClear = (_remainingCells === 0);
  }
  if (_lcPerfectClear) {
    sessionPerfectClears++;
    if (typeof achOnPerfectClear === 'function') achOnPerfectClear();
  }
  if (completeLevels.length >= 4) sessionTetrises++;

  // Audio: rumble + arpeggio
  playLineClearRumble();
  playLineClearSound(completeLevels.length);

  // Tetris clear (4 lines): strong chromatic aberration burst
  if (completeLevels.length >= 4 && typeof triggerChromaticAberration === 'function' &&
      !(typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled)) {
    triggerChromaticAberration(0.012, 0.4);
  }

  // Score with combo multiplier
  const LINE_SCORES = [0, 100, 300, 500, 800];
  linesCleared += completeLevels.length;
  if (typeof isCoopMode !== 'undefined' && isCoopMode) coopMyLinesTriggered += completeLevels.length;

  // Tutorial: notify first line clear
  if (typeof tutorialNotify === "function") tutorialNotify("lineClear");
  // Contextual game tooltip: first line clear
  if (typeof gameTooltip === 'function') gameTooltip('lineClear');
  // In-game tips
  if (typeof tutorialTip === 'function') {
    if (_lcIsTSpin) tutorialTip('firstTSpin');
    if (completeLevels.length === 4) tutorialTip('firstTetris');
  }

  // Achievement: first line clear, Tetramino
  if (typeof achOnLineClear === "function") achOnLineClear(completeLevels.length);
  // Co-op: sync line-clear achievement
  if (typeof isCoopMode !== 'undefined' && isCoopMode && typeof achOnCoopLineClear === 'function') {
    achOnCoopLineClear(Date.now());
  }

  // Daily missions: track line clears
  if (typeof onMissionLineClear === "function") onMissionLineClear(completeLevels.length);

  // Seasonal events: track challenge progress
  if (typeof onSeasonalLineClear === "function") onSeasonalLineClear(completeLevels.length);

  // XP Season Pass: 1 XP per line cleared
  if (typeof awardXpPassLines === "function") awardXpPassLines(completeLevels.length);

  // Screen reader: announce line clear count
  if (typeof announceToScreenReader === "function") {
    const n = completeLevels.length;
    const labels = ["", "Single", "Double", "Triple", "Tetris"];
    const label = n >= 1 && n <= 4 ? labels[n] : n + " lines";
    announceToScreenReader(label + " — " + linesCleared + " lines cleared total");
  }

  // Sprint: end the game when 40 lines are cleared
  if (isSprintMode && linesCleared >= SPRINT_LINE_TARGET &&
      typeof triggerSprintComplete === "function") {
    triggerSprintComplete();
  }

  // Daily challenge: end the game when 200 lines are cleared
  if (isDailyChallenge && linesCleared >= DAILY_LINE_LIMIT &&
      typeof triggerGameOver === "function") {
    triggerGameOver();
  }

  // Marathon: advance level based on lines cleared
  if (isMarathonMode && typeof updateMarathonLevel === "function") {
    updateMarathonLevel();
  }

  // Marathon Endless: advance level (no cap) and check milestones / checkpoints
  if (isMarathonEndlessMode && typeof updateMarathonEndlessLevel === "function") {
    updateMarathonEndlessLevel();
  }

  const now = clock.getElapsedTime();
  var _comboWindow = 3.0;
  if (lastClearTime >= 0 && (now - lastClearTime) <= _comboWindow) {
    comboCount++;
  } else {
    comboCount = 1;
  }
  lastClearTime = now;
  if (comboCount > sessionHighestComboCount) sessionHighestComboCount = comboCount;

  // In-game tip: first combo (fires when combo reaches 2)
  if (comboCount === 2 && typeof tutorialTip === 'function') tutorialTip('firstCombo');

  // Achievement: Combo Starter, Combo King
  if (typeof achOnComboUpdate === "function") achOnComboUpdate(comboCount);

  // Combo SFX: escalating chimes on consecutive clears
  if (typeof playComboSound === 'function') playComboSound(comboCount);

  // Coach mark: first combo
  if (typeof coachMarkCombo === "function") coachMarkCombo(comboCount);

  // Double or Nothing: flat 3× at any combo; normal multipliers otherwise.
  const COMBO_MULTIPLIERS = weeklyDoubleOrNothing
    ? [1.0, 1.0, 3.0, 3.0, 3.0]
    : [1.0, 1.0, 1.5, 2.0, 3.0]; // index by comboCount (capped at 4)
  const comboIdx = Math.min(comboCount, 4);
  const comboMult = COMBO_MULTIPLIERS[comboIdx];
  const blitzMult = (isBlitzMode && blitzBonusActive) ? BLITZ_BONUS_MULTIPLIER : 1.0;
  // Gold Rush: 2× score multiplier on all line clears.
  const goldMult = weeklyGoldRush ? 2.0 : 1.0;
  // Golden Hour event: 3× score multiplier on all line clears.
  const goldenHourMult = (typeof goldenHourActive !== "undefined" && goldenHourActive) ? 3.0 : 1.0;
  // Underground depth multiplier: lineScore × (1 + |Y| × 0.1) for Y < 0 clears.
  const _minClearY = completeLevels.length > 0 ? Math.min.apply(null, completeLevels) : 0;
  const _depthMult = _minClearY < 0 ? (1 + Math.abs(_minClearY) * 0.1) : 1.0;
  // Ore Speed Boost: 1.5× multiplier while active
  const _oreBoostMult = (typeof getOreSpeedBoostMult === 'function') ? getOreSpeedBoostMult() : 1.0;
  // T-spin scoring: replaces standard LINE_SCORES when a T-spin occurred.
  // Full: 0/800/1200/1600 × level; Mini: 0/200 × level (single only).
  // Back-to-back bonus: 1.5× when previous clear was also difficult (T-spin or Tetris).
  const _level = (typeof lastDifficultyTier !== 'undefined') ? (lastDifficultyTier + 1) : 1;
  const _isB2B = (typeof lastClearWasDifficult !== 'undefined') && lastClearWasDifficult
    && (_lcIsTSpin || completeLevels.length >= 4);
  const _b2bMult = _isB2B ? 1.5 : 1.0;
  if (_isB2B && typeof sessionB2BCount !== 'undefined') sessionB2BCount++;

  // Training mode: check goal after line clear
  if (typeof isTrainingMode !== 'undefined' && isTrainingMode && typeof checkTrainingGoal === 'function') {
    checkTrainingGoal({
      tspinType: _lcIsTSpin ? (_lcIsMiniTSpin ? 'mini' : 'full') : '',
      linesJustCleared: completeLevels.length,
      combo: typeof comboCount !== 'undefined' ? comboCount : 0,
      b2b: _isB2B,
      isPerfectClear: _lcPerfectClear,
    });
  }
  let baseScore;
  if (_lcIsTSpin) {
    const _fullTSpinScores = [400, 800, 1200, 1600];
    const _miniTSpinScores = [100, 200, 400, 600];
    const _tsIdx = Math.min(completeLevels.length, 3);
    baseScore = (_lcIsMiniTSpin ? _miniTSpinScores : _fullTSpinScores)[_tsIdx] * _level;
  } else {
    baseScore = LINE_SCORES[Math.min(completeLevels.length, 4)];
  }
  // Combo Challenge: use streak-based scoring instead of the standard formula
  if (typeof isComboChallenge !== 'undefined' && isComboChallenge &&
      typeof comboChallengeOnLineClear === 'function') {
    comboChallengeOnLineClear(completeLevels.length);
    _lcPerfectClearBonus = 0;
  } else {
  const _lcComputedScore = Math.round(baseScore * _b2bMult * comboMult * blitzMult * goldMult * goldenHourMult * _depthMult * _oreBoostMult);
  addScore(_lcComputedScore);

  // Perfect Clear bonus: awarded on top of regular line-clear score.
  // Bonus tiers (× level): 1-line=800, 2-line=1200, 3-line=1800, 4-line=2000.
  // All active multipliers (blitz, gold rush, golden hour, depth) also apply.
  if (_lcPerfectClear) {
    const _pcBonusBase = [0, 800, 1200, 1800, 2000];
    const _pcBase = _pcBonusBase[Math.min(completeLevels.length, 4)] * _level;
    _lcPerfectClearBonus = Math.round(_pcBase * blitzMult * goldMult * goldenHourMult * _depthMult * _oreBoostMult);
    addScore(_lcPerfectClearBonus);
  } else {
    _lcPerfectClearBonus = 0;
  }
  } // end of non-combo-challenge scoring block

  // Co-op: broadcast line-clear event so partner can score if local detection didn't fire
  if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    coop.send({ type: 'line_clear', rows: completeLevels, score: _lcComputedScore });
  }
  // Battle: calculate scaled garbage, apply cancellation, and notify opponent.
  // Cancellation rule: if we have pending incoming garbage, use our attack to cancel
  // it first before sending any surplus to the opponent.
  // gapSeed is derived from the local PRNG so it is consistent but not predictable.
  if (isBattleMode && typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
    const _garbageRows = (typeof calcGarbageSent === 'function')
      ? calcGarbageSent(completeLevels.length, comboCount, _lcIsTSpin, _lcPerfectClear)
      : completeLevels.length;

    // Cancel pending incoming garbage before sending to opponent
    let _rowsToSend = _garbageRows;
    const _pending = (typeof getPendingGarbageLines === 'function') ? getPendingGarbageLines() : 0;
    if (_pending > 0 && _rowsToSend > 0 && typeof cancelPendingGarbageLines === 'function') {
      const _cancelled = cancelPendingGarbageLines(_rowsToSend);
      _rowsToSend -= _cancelled;
      // Update garbage meter after cancellation
      if (typeof battleHud !== 'undefined' && typeof battleHud.updateGarbageMeter === 'function') {
        battleHud.updateGarbageMeter((typeof getPendingGarbageLines === 'function') ? getPendingGarbageLines() : 0);
      }
    }

    if (_rowsToSend > 0) {
      const _gapSeed = Math.floor((typeof _rng === 'function' ? _rng() : Math.random()) * 0xffffffff) >>> 0;
      battle.send({ type: 'battle_attack', lines: _rowsToSend, gapSeed: _gapSeed });
      battleGarbageSent += _rowsToSend;
      if (typeof onMissionBattleGarbageSent === 'function') onMissionBattleGarbageSent(_rowsToSend);
      // Show outgoing attack preview on our opponent mini-map HUD
      if (typeof battleHud !== 'undefined') battleHud.showOutgoingAttack(_rowsToSend);
      // Outgoing particle streak + whoosh
      if (typeof battleFx !== 'undefined') battleFx.showOutgoingAttack(_rowsToSend);
    }
    // Combo feed toast (show when combo bonus is active, i.e. comboCount >= 2)
    if (comboCount >= 2 && typeof battleFx !== 'undefined') battleFx.showComboFeed(comboCount);
  }
  // Update back-to-back flags (reset on any non-difficult clear)
  lastClearWasTetris = completeLevels.length >= 4;
  if (typeof lastClearWasDifficult !== 'undefined') {
    lastClearWasDifficult = (_lcIsTSpin && completeLevels.length >= 1) || completeLevels.length >= 4;
  }

  // Golden Hour: trigger shimmer flash and show 3× label
  if (typeof goldenHourActive !== "undefined" && goldenHourActive) {
    const flash = document.getElementById("golden-hour-flash");
    if (flash) {
      flash.style.display = "none";
      flash.classList.remove("active");
      void flash.offsetWidth;
      flash.classList.add("active");
      flash.style.display = "block";
      flash.addEventListener("animationend", function onEnd() {
        flash.style.display = "none";
        flash.classList.remove("active");
        flash.removeEventListener("animationend", onEnd);
      }, { once: true });
    }
  }

  // Line-clear banner
  if (lineClearBannerEl) {
    let baseLabel;
    if (_lcIsTSpin) {
      const _tLabels = ['T-SPIN!', 'T-SPIN SINGLE!', 'T-SPIN DOUBLE!', 'T-SPIN TRIPLE!'];
      const _mLabels = ['MINI T-SPIN!', 'MINI T-SPIN!', 'MINI T-SPIN DOUBLE!', 'MINI T-SPIN TRIPLE!'];
      baseLabel = (_lcIsMiniTSpin ? _mLabels : _tLabels)[Math.min(completeLevels.length, 3)];
    } else {
      const labels = ["", "LINE CLEAR!", "DOUBLE!", "TRIPLE!", "TETRIS!"];
      baseLabel = labels[Math.min(completeLevels.length, 4)];
    }
    const _b2bPrefix = _isB2B ? 'B2B ' : '';
    const goldenLabel = (typeof goldenHourActive !== "undefined" && goldenHourActive)
      ? _b2bPrefix + baseLabel + "  3\xd7"
      : _b2bPrefix + baseLabel;
    lineClearBannerEl.textContent = goldenLabel;
    lineClearBannerEl.style.color = _lcIsTSpin ? '#cc44ff' : (_isB2B ? '#ffaa00' : '');
    lineClearBannerEl.style.display = "block";
    bannerTimer = 1.5;
  }

  // Combo banner (shown from 2nd consecutive clear onward)
  if (comboCount >= 2 && comboBannerEl) {
    // Color escalation: white→yellow→orange→red→purple at 10+
    const _comboColor = comboCount >= 10 ? "#cc44ff"
                      : comboCount >= 5  ? "#ff3300"
                      : comboCount >= 3  ? "#ffd700"
                      : comboCount >= 2  ? "#ffaa00"
                      : "#ffffff";
    // Label: show actual count, capped label for DoubleOrNothing modifier
    const _comboLabel = weeklyDoubleOrNothing
      ? comboCount + "x COMBO (3\xd7)"
      : comboCount + "x COMBO";
    // Font size scales with combo (20px base, +2px per extra combo, cap at 36px)
    const _comboFontPx = Math.min(20 + (comboCount - 2) * 2, 36);
    comboBannerEl.textContent = _comboLabel;
    comboBannerEl.style.color = _comboColor;
    comboBannerEl.style.fontSize = _comboFontPx + "px";
    // Re-trigger bounce animation by toggling display
    comboBannerEl.style.animation = "none";
    comboBannerEl.style.display = "none";
    void comboBannerEl.offsetHeight;
    comboBannerEl.style.animation = "";
    comboBannerEl.style.display = "block";
    comboBannerTimer = 1.5;

    // ── Combo visual effects ─────────────────────────────────────────────────
    const _reducedMotion = (typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled);
    if (!_reducedMotion) {
      // Screen shake — scales with both combo count AND lines cleared this clear
      const _linesBonus = completeLevels.length >= 4 ? 0.12
                        : completeLevels.length >= 3 ? 0.06
                        : completeLevels.length >= 2 ? 0.03
                        : 0;
      const _shakeBase  = comboCount >= 10 ? 0.30
                        : comboCount >= 5  ? 0.22
                        : comboCount >= 3  ? 0.14
                        : 0.07;
      comboShakeActive   = true;
      comboShakeStart    = clock.getElapsedTime();
      comboShakeStrength = Math.min(_shakeBase + _linesBonus, 0.40);

      // Flash overlay — intensity escalates with both combo and clear size
      const flashEl = document.getElementById("lc-flash-overlay");
      if (flashEl) {
        const _flashColor = comboCount >= 10 ? "#cc44ff"
                          : comboCount >= 5  ? "#ff3300"
                          : comboCount >= 3  ? "#ffd700"
                          : "#ffe080";
        const _baseAlpha  = comboCount >= 10 ? 0.38
                          : comboCount >= 5  ? 0.28
                          : comboCount >= 3  ? 0.20
                          : 0.12;
        const _clearBonus = completeLevels.length >= 4 ? 0.10
                          : completeLevels.length >= 3 ? 0.05
                          : 0;
        const _flashAlpha = String(Math.min(_baseAlpha + _clearBonus, 0.50).toFixed(2));
        flashEl.style.transition = "none";
        flashEl.style.backgroundColor = _flashColor;
        flashEl.style.opacity = _flashAlpha;
        void flashEl.offsetHeight;
        flashEl.style.transition = "opacity 0.45s ease-out";
        flashEl.style.opacity = "0";
      }

      // Chromatic aberration burst — scales with combo tier
      if (comboCount >= 4 && typeof triggerChromaticAberration === 'function') {
        const _caStr = comboCount >= 10 ? 0.014 : comboCount >= 6 ? 0.010 : 0.007;
        triggerChromaticAberration(_caStr, 0.35);
      }

      // Particle burst from cleared lines (quality gate: not Low)
      const _quality = (typeof graphicsQualityTier !== 'undefined') ? graphicsQualityTier : 'high';
      if (_quality !== 'low') {
        _lcSpawnComboBurst(completeLevels.length, comboCount);
      }
    }

    // Trigger line-clear edge flash
    _lcTriggerLineClearGlow(completeLevels.length);
  }
}

/**
 * Must be called every frame. Drives all phases of the explosion animation.
 */
function updateLineClear(delta) {
  // Banner countdown
  if (bannerTimer > 0) {
    bannerTimer -= delta;
    if (bannerTimer <= 0 && lineClearBannerEl) lineClearBannerEl.style.display = "none";
  }

  // Combo banner countdown
  if (comboBannerTimer > 0) {
    comboBannerTimer -= delta;
    if (comboBannerTimer <= 0 && comboBannerEl) comboBannerEl.style.display = "none";
  }

  // Combo reset: if 3s pass without a clear, reset count
  if (lastClearTime >= 0 && (clock.getElapsedTime() - lastClearTime) > 3.0) {
    // Double or Nothing: breaking a combo (≥2 consecutive) costs 25% of score.
    if (weeklyDoubleOrNothing && comboCount >= 2) {
      score = Math.max(0, Math.round(score * 0.75));
      updateScoreHUD();
    }
    comboCount = 0;
    lastClearTime = -1;
    _lcUpdateBoardGlow(0);
  }

  // 2-D combo particle burst update
  _lcUpdateComboBurst(delta);

  // Tick line-clear flash age and apply combined board glow each frame
  if (_lcLineClearGlowAge >= 0) {
    _lcLineClearGlowAge += delta;
    if (_lcLineClearGlowAge >= _lcLineClearGlowDuration) {
      _lcLineClearGlowAge = -1;
    }
  }
  _applyBoardGlow();

  // ── Slow-motion delta for explosion animations (triple / Tetris) ────────────
  // Jolt and shake still run at full speed (they are percussive impulses).
  // Fragments, rings, lights, and spring blocks use the scaled delta.
  const _vDelta = (lineClearInProgress && typeof lineClearCelebration !== 'undefined')
    ? lineClearCelebration.scaleDelta(delta)
    : delta;

  // ── Camera jolt (upward impulse, decays over ~120 ms) ──────────────────────
  if (_lcJoltAge >= 0) {
    _lcJoltAge += delta;
    if (_lcJoltAge < _LC_JOLT) {
      if (!(typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled)) {
        const t = _lcJoltAge / _LC_JOLT;
        camera.position.y += _LC_JOLT_STR * Math.sin(t * Math.PI) * delta * 6;
      }
    } else {
      _lcJoltAge = -1;
    }
  }

  // ── Camera shake (tier-driven duration) ──────────────────────────────────
  if (_lcShakeAge >= 0) {
    _lcShakeAge += delta;
    if (_lcShakeAge < _lcShakeDur) {
      if (!(typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled)) {
        const strength = _LC_SHAKE_STR * (1 - _lcShakeAge / _lcShakeDur);
        camera.position.x += (Math.random() - 0.5) * strength;
        camera.position.y += (Math.random() - 0.5) * strength;
      }
    } else {
      _lcShakeAge = -1;
    }
  }

  // ── Fragments (slow-motion aware) ─────────────────────────────────────────
  for (let i = _lcFragments.length - 1; i >= 0; i--) {
    const f = _lcFragments[i];
    f.age += _vDelta;
    if (f.age >= f.maxAge) { _lcRelease(f.entry); _lcFragments.splice(i, 1); continue; }
    const t = f.age / f.maxAge;
    f.vel.y -= 9.8 * _vDelta;  // gravity
    f.mesh.position.x += f.vel.x * _vDelta;
    f.mesh.position.y += f.vel.y * _vDelta;
    f.mesh.position.z += f.vel.z * _vDelta;
    f.mesh.rotation.x += f.angVel.x * _vDelta;
    f.mesh.rotation.y += f.angVel.y * _vDelta;
    f.mesh.rotation.z += f.angVel.z * _vDelta;
    f.mesh.material.opacity = Math.max(0, 1 - t);
    f.mesh.material.needsUpdate = true;
  }

  // ── Shockwave rings (slow-motion aware) ───────────────────────────────────
  for (let i = _lcRings.length - 1; i >= 0; i--) {
    const r = _lcRings[i];
    r.age += _vDelta;
    if (r.age >= _LC_RING_LIFE) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      _lcRings.splice(i, 1);
      continue;
    }
    const expandT = Math.min(r.age / _LC_RING_EXPAND, 1.0);
    r.mesh.scale.set(expandT, 1, expandT);
    const fadeT = Math.max(0, (r.age - _LC_RING_FADE) / (_LC_RING_LIFE - _LC_RING_FADE));
    r.mesh.material.opacity = Math.max(0, 1 - fadeT);
    r.mesh.material.needsUpdate = true;
  }

  // ── Point lights (slow-motion aware) ──────────────────────────────────────
  for (let i = _lcLights.length - 1; i >= 0; i--) {
    const l = _lcLights[i];
    l.age += _vDelta;
    if (l.age >= _LC_LIGHT_LIFE) { scene.remove(l.light); _lcLights.splice(i, 1); continue; }
    l.light.intensity = l.initialIntensity * (1 - l.age / _LC_LIGHT_LIFE);
  }

  // ── Spring blocks ──────────────────────────────────────────────────────────
  for (let i = _lcSpringBlks.length - 1; i >= 0; i--) {
    const sb = _lcSpringBlks[i];
    const acc = -_LC_K * sb.offset - _LC_D * sb.vel;
    sb.vel    += acc * delta;
    sb.offset += sb.vel * delta;
    if (sb.targetX !== null && sb.targetX !== undefined) {
      sb.mesh.position.x = sb.targetX + sb.offset;
    } else {
      sb.mesh.position.y = sb.targetY + sb.offset;
    }
    sb.mesh.userData.boundingBox = null;  // keep bbox fresh during spring motion
    if (Math.abs(sb.offset) < 0.005 && Math.abs(sb.vel) < 0.005) {
      if (sb.targetX !== null && sb.targetX !== undefined) {
        sb.mesh.position.x = sb.targetX;
      } else {
        sb.mesh.position.y = sb.targetY;
      }
      _lcSpringBlks.splice(i, 1);
    }
  }

  if (!lineClearInProgress) return;

  _lcPhaseAge += delta;

  if (_lcPhase === 1) {
    // ── Phase 1: Anticipation (0 → 0.2 s) ─────────────────────────────────
    // Blocks vibrate ±0.03 at 20 Hz; emissive ramps from 0 → 1.5.
    const t = Math.min(_lcPhaseAge / _LC_ANTICIPATION, 1.0);
    lineClearFlashBlocks.forEach((b) => {
      if (!b.userData._basePos) return;
      const vib = Math.sin(_lcPhaseAge * Math.PI * 2 * 20) * 0.03;
      b.position.x = b.userData._basePos.x + vib;
      b.position.z = b.userData._basePos.z + vib * 0.7;
      const emv = t * 1.5;
      b.material.emissive.setRGB(Math.min(emv, 1), Math.min(emv, 1), Math.min(emv, 1));
      b.material.emissiveIntensity = emv;
      b.material.needsUpdate = true;
    });

    if (_lcPhaseAge >= _LC_ANTICIPATION) {
      _lcDetonate();
      _lcPhase    = 2;  // aftermath
      _lcPhaseAge = 0;
    }

  } else if (_lcPhase === 2) {
    // ── Phase 2: Aftermath — wait for all effects to finish ────────────────
    const allDone = (
      _lcFragments.length === 0 &&
      _lcRings.length     === 0 &&
      _lcLights.length    === 0 &&
      _lcSpringBlks.length === 0
    );
    if (allDone && _lcPhaseAge > 0.1) {
      worldGroup.children.forEach((o) => { o.userData.boundingBox = null; });
      lineClearInProgress = false;
      _lcPhase = 0;
      if (typeof saveGameState === "function") saveGameState();
    }
  }
}

// ─── Internal: detonation ─────────────────────────────────────────────────────

function _lcDetonate() {
  const numLines = _lcNumLines;
  if (typeof tcVibrateOnLineClear === 'function') tcVibrateOnLineClear(numLines);

  // Ring count per tier (unchanged from original)
  const numRings = numLines >= 4 ? 3 : numLines >= 3 ? 2 : 1;

  // Combo intensity multiplier: each consecutive clear adds 25% more fragments (cap at 3×).
  const _comboIntensityMult = Math.min(1.0 + ((comboCount > 1 ? comboCount - 1 : 0) * 0.25), 3.0);

  // Biome particle theme overrides fragment and ring colors.
  const _biomeTheme = (typeof getBiomeParticleTheme === 'function') ? getBiomeParticleTheme() : null;
  const _biomeIntensity = (_biomeTheme && _biomeTheme.intensity) ? _biomeTheme.intensity : 1.0;

  // Dominant block color (used as fallback when no biome theme overrides)
  const colorCounts = new Map();
  lineClearFlashBlocks.forEach((b) => {
    if (!b.userData._savedColor) return;
    const hex = b.userData._savedColor.getHex();
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  });
  let dominantColor = 0xffffff, maxCount = 0;
  colorCounts.forEach((cnt, hex) => { if (cnt > maxCount) { maxCount = cnt; dominantColor = hex; } });

  // Activate celebration tier (slow-motion, fanfare, rainbow for perfect clear)
  if (typeof lineClearCelebration !== 'undefined') {
    lineClearCelebration.trigger(numLines, dominantColor, _lcPerfectClear);
  }

  // Per-clear-type scaling — driven by LineClearCelebration when available
  const _cel = (typeof lineClearCelebration !== 'undefined') ? lineClearCelebration : null;
  let fragMult  = _cel ? _cel.getFragMult()  : (numLines >= 4 ? 3.0 : numLines >= 3 ? 2.0 : numLines >= 2 ? 1.5 : 1.0);
  const doFlash = _cel ? _cel.shouldFlash()  : numLines >= 3;
  const flashAmt= _cel ? _cel.getFlashAmt()  : (numLines >= 4 ? 1.0 : 0.45);
  const doShake = _cel ? (_cel.getShakeDur() > 0) : numLines >= 4;
  const shakeDur= _cel ? _cel.getShakeDur()  : 0.30;
  const _flashColor = _cel ? _cel.getFlashColor(dominantColor) : '#ffffff';

  fragMult *= _comboIntensityMult * _biomeIntensity;

  const fragsPerBlock = Math.round(8 * fragMult);

  // Resolve ring and light colors from biome theme or fall back to block color.
  const _ringColor  = (_biomeTheme && _biomeTheme.ringColor  != null) ? _biomeTheme.ringColor  : dominantColor;
  const _lightColor = (_biomeTheme && _biomeTheme.lightColor != null) ? _biomeTheme.lightColor : dominantColor;

  // Cleared slab levels in world space (Y levels for down/up; X levels for left/right)
  const clearedYs = lineClearPendingYs;  // variable name kept for compat; holds slab keys
  const _gravDet = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  const _isSideway = (_gravDet === 'left' || _gravDet === 'right');
  const worldYs   = clearedYs.map((sk) => sk * BLOCK_SIZE);
  const midWorldY = worldYs.reduce((a, b) => a + b, 0) / worldYs.length;

  // 1. Spawn fragments ──────────────────────────────────────────────────────
  lineClearFlashBlocks.forEach((b) => {
    const bPos   = b.userData._basePos ? b.userData._basePos.clone() : b.position.clone();
    const bColor = b.userData._savedColor || new THREE.Color(0xffffff);
    for (let f = 0; f < fragsPerBlock; f++) {
      const entry = _lcAcquire();
      if (!entry) break;
      const m  = entry.mesh;
      const sz = 0.3 + Math.random() * 0.2;
      m.scale.setScalar(sz);
      m.position.copy(bPos);
      // Biome color override or block color
      const fragColor = (typeof getBiomeFragColor === 'function')
        ? getBiomeFragColor(_biomeTheme, bColor)
        : bColor.clone();
      m.material.color.copy(fragColor);
      m.material.emissive.copy(fragColor);
      m.material.emissiveIntensity = 0.8;
      m.material.opacity = 1.0;
      m.visible = true;
      const speed = 3 + Math.random() * 5;
      const ang   = Math.random() * Math.PI * 2;
      // Nether sparks: strong upward bias (ember behavior); others: slight upward bias
      const _sparkBias = (_biomeTheme && _biomeTheme.fragSpark) ? 0.6 : -0.2;
      const elev  = (Math.random() * 0.7 + _sparkBias) * Math.PI;
      _lcFragments.push({
        entry, mesh: m,
        vel: {
          x: Math.cos(ang) * Math.cos(elev) * speed,
          y: Math.sin(elev) * speed + 2.5,
          z: Math.sin(ang) * Math.cos(elev) * speed,
        },
        angVel: {
          x: (Math.random() - 0.5) * 12,
          y: (Math.random() - 0.5) * 12,
          z: (Math.random() - 0.5) * 12,
        },
        age: 0,
        maxAge: _LC_FRAG_MIN + Math.random() * (_LC_FRAG_MAX - _LC_FRAG_MIN),
      });
    }
  });

  // 2. Remove cleared blocks from scene and grid ────────────────────────────
  lineClearFlashBlocks.forEach((b) => {
    if (b.userData._basePos) b.position.copy(b.userData._basePos);
    unregisterBlock(b);
    disposeBlock(b);
    worldGroup.remove(b);
  });
  lineClearFlashBlocks = [];

  // Seasonal event: spawn themed particles along cleared rows
  if (typeof spawnSeasonalParticles === 'function' && typeof getActiveSeasonalEvent === 'function' && getActiveSeasonalEvent()) {
    const midX = 0;
    const midZ = 0;
    for (let i = 0; i < worldYs.length; i++) {
      spawnSeasonalParticles(midX, worldYs[i], midZ);
    }
  }
  // Puzzle / custom puzzle mode: check win/lose after line clear
  if ((isPuzzleMode || isCustomPuzzleMode) && typeof checkPuzzleConditions === "function") {
    checkPuzzleConditions();
  }

  // 3. Apply gravity to blocks on the spawn-side of cleared slabs, with spring bounce ──
  const _grav2 = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
  const toShift = [];
  worldGroup.children.forEach((obj) => {
    if (obj.name !== "landed_block" || !obj.userData.gridPos) return;
    const gp = obj.userData.gridPos;
    const origSlab = (typeof getOccupancySlabKey === 'function')
      ? getOccupancySlabKey(gp.x, gp.y, gp.z)
      : gp.y;
    // For 'down'/'left': blocks above cleared slabs (larger key) fall toward smaller keys.
    // For 'up'/'right': blocks below cleared slabs (smaller key) shift toward larger keys.
    let drop;
    if (_grav2 === 'down' || _grav2 === 'left') {
      drop = clearedYs.filter((s) => s < origSlab).length;
    } else {
      drop = clearedYs.filter((s) => s > origSlab).length;
    }
    if (drop) toShift.push({ obj, gp, origSlab, drop });
  });
  toShift.forEach(({ obj, gp, origSlab, drop }) => {
    const withinKey = (typeof getOccupancyWithinKey === 'function')
      ? getOccupancyWithinKey(gp.x, gp.y, gp.z)
      : (gp.x + ',' + gp.z);
    const old = gridOccupancy.get(origSlab);
    if (old) { old.delete(withinKey); if (!old.size) gridOccupancy.delete(origSlab); }

    if (_grav2 === 'left' || _grav2 === 'right') {
      // Sideways gravity: shift X slab
      const newSlab = (_grav2 === 'left') ? origSlab - drop : origSlab + drop;
      const targetWX = newSlab * BLOCK_SIZE;
      if (!gridOccupancy.has(newSlab)) gridOccupancy.set(newSlab, new Set());
      gridOccupancy.get(newSlab).add(gp.y + ',' + gp.z);
      gp.x = newSlab;
      obj.userData.boundingBox = null;
      const displacement = (_grav2 === 'left') ? drop * BLOCK_SIZE : -drop * BLOCK_SIZE;
      obj.position.x = targetWX + displacement;
      _lcSpringBlks.push({ mesh: obj, targetY: null, targetX: targetWX, offset: displacement, vel: 0 });
    } else {
      // Vertical gravity (down/up): shift Y slab
      const newSlab = (_grav2 === 'down') ? origSlab - drop : origSlab + drop;
      const targetWY = newSlab * BLOCK_SIZE;
      if (!gridOccupancy.has(newSlab)) gridOccupancy.set(newSlab, new Set());
      gridOccupancy.get(newSlab).add(gp.x + ',' + gp.z);
      gp.y = newSlab;
      obj.userData.boundingBox = null;
      const displacement = (_grav2 === 'down') ? drop * BLOCK_SIZE : -drop * BLOCK_SIZE;
      obj.position.y = targetWY + displacement;
      _lcSpringBlks.push({ mesh: obj, targetY: targetWY, targetX: null, offset: displacement, vel: 0 });
    }
  });

  // 4. Shockwave rings ──────────────────────────────────────────────────────
  for (let r = 0; r < numRings; r++) {
    const slabOffset = (r - (numRings - 1) / 2) * BLOCK_SIZE;
    const ringColor = (r === 0) ? _ringColor : 0xffffff;
    const ringGeo   = new THREE.TorusGeometry(_LC_RING_RADIUS, 0.25, 8, 64);
    const ringMat   = new THREE.MeshBasicMaterial({
      color: ringColor, transparent: true, opacity: 1.0, side: THREE.DoubleSide,
    });
    const ringMesh  = new THREE.Mesh(ringGeo, ringMat);
    if (_isSideway) {
      // Ring faces YZ plane for sideways line clears
      ringMesh.rotation.y = Math.PI / 2;
      ringMesh.position.set(midWorldY + slabOffset, 0, 0);
    } else {
      ringMesh.rotation.x = Math.PI / 2;  // lie flat in XZ plane
      ringMesh.position.set(0, midWorldY + slabOffset, 0);
    }
    ringMesh.scale.set(0.01, 1, 0.01);
    scene.add(ringMesh);
    _lcRings.push({ mesh: ringMesh, age: 0 });
  }

  // 5. Point light flash at cleared level ───────────────────────────────────
  const ptLight = new THREE.PointLight(new THREE.Color(_lightColor), 5.0, 25);
  if (_isSideway) {
    ptLight.position.set(midWorldY, 0, 0);
  } else {
    ptLight.position.set(0, midWorldY, 0);
  }
  scene.add(ptLight);
  _lcLights.push({ light: ptLight, age: 0, initialIntensity: 5.0 });

  const _reducedMotion = (typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled);

  // 6. Camera upward jolt ───────────────────────────────────────────────────
  _lcJoltAge = 0;  // update loop skips actual movement when reducedMotion is on

  // 7. Screen flash — tier-aware color and intensity ────────────────────────
  if (doFlash && !_reducedMotion) {
    const el = document.getElementById("lc-flash-overlay");
    if (el) {
      el.style.backgroundColor = _flashColor;
      el.style.transition = "none";
      el.style.opacity = flashAmt;
      void el.offsetHeight;  // force reflow so CSS transition fires from flashAmt
      el.style.transition = "opacity 0.45s ease-out";
      el.style.opacity = "0";
    }
  }

  // 8. Score-slam animation for Tetris ──────────────────────────────────────
  if (numLines >= 4 && scoreEl) {
    scoreEl.classList.remove("score-slam");
    void scoreEl.offsetHeight;
    scoreEl.classList.add("score-slam");
  }

  // 9. Screen shake — tier-driven duration (double=slight, triple=medium, tetris=strong)
  if (doShake && !_reducedMotion) {
    _lcShakeAge = 0;
    _lcShakeDur = shakeDur;
  }

  // 10. T-spin / Perfect Clear — firework burst ─────────────────────────────
  // T-spin: play enchantment SFX
  if (_lcIsTSpin && typeof playTSpinSound === 'function') playTSpinSound();
  // Spawn a radial burst of festive fragments around the board center.
  if (_lcIsTSpin || _lcPerfectClear) {
    const _fwCount  = _lcPerfectClear ? 48 : 24;
    const _fwRadius = _lcPerfectClear ? 8  : 5;
    for (let fw = 0; fw < _fwCount; fw++) {
      const entry = _lcAcquire();
      if (!entry) break;
      const m   = entry.mesh;
      const sz  = 0.25 + Math.random() * 0.2;
      m.scale.setScalar(sz);
      // Spread burst around mid-clear height, random radial offset
      const fwAng = (fw / _fwCount) * Math.PI * 2 + Math.random() * 0.3;
      m.position.set(
        Math.cos(fwAng) * _fwRadius * Math.random(),
        midWorldY + (Math.random() - 0.5) * 2,
        Math.sin(fwAng) * _fwRadius * Math.random()
      );
      const _fwPalette = _lcIsTSpin ? _TSPIN_FIREWORK_COLORS : _FIREWORK_COLORS;
      const fwColor = new THREE.Color(
        _fwPalette[fw % _fwPalette.length]
      );
      m.material.color.copy(fwColor);
      m.material.emissive.copy(fwColor);
      m.material.emissiveIntensity = 1.2;
      m.material.opacity = 1.0;
      m.visible = true;
      const fwSpeed = 5 + Math.random() * 6;
      const fwElev  = (Math.random() * 0.8 + 0.2) * Math.PI;  // mostly upward
      _lcFragments.push({
        entry, mesh: m,
        vel: {
          x: Math.cos(fwAng) * Math.cos(fwElev) * fwSpeed,
          y: Math.sin(fwElev) * fwSpeed + 4,
          z: Math.sin(fwAng) * Math.cos(fwElev) * fwSpeed,
        },
        angVel: {
          x: (Math.random() - 0.5) * 15,
          y: (Math.random() - 0.5) * 15,
          z: (Math.random() - 0.5) * 15,
        },
        age: 0,
        maxAge: 0.9 + Math.random() * 0.4,
      });
    }
    // Banner for Perfect Clear (T-SPIN banner is set in checkLineClear; only update here for Perfect Clear)
    if (_lcPerfectClear && lineClearBannerEl) {
      const _pcBonusLabel = _lcPerfectClearBonus > 0 ? '  +' + _lcPerfectClearBonus : '';
      lineClearBannerEl.textContent = 'PERFECT CLEAR!' + _pcBonusLabel;
      lineClearBannerEl.style.color = '#00e5ff';
      lineClearBannerEl.style.display = 'block';
      bannerTimer = 2.5;
    }
  }

  // ── 2-D particle overlay effects ─────────────────────────────────────────
  if (typeof ptLineClearBurst === 'function') {
    // Line-clear burst along each cleared row
    const _boardRows = typeof getBoardRows === 'function' ? getBoardRows() : 20;
    clearedYs.forEach((sk) => {
      const rowFrac = 1.0 - (sk / (_boardRows - 1));
      ptLineClearBurst(Math.max(0, Math.min(1, rowFrac)), dominantColor, numLines);
    });
    // Tetris: full-screen explosion
    if (numLines >= 4) ptTetrisExplosion();
    // T-Spin: vortex effect
    if (_lcIsTSpin && typeof ptTSpinVortex === 'function') ptTSpinVortex();
    // Perfect Clear: golden confetti rain
    if (_lcPerfectClear && typeof ptPerfectClearConfetti === 'function') ptPerfectClearConfetti();
    // Combo: escalating burst (combo>=2 already checked inside)
    if (typeof ptComboBurst === 'function') ptComboBurst(comboCount, numLines);
    // Back-to-back bonus: subtle glow trail
    const _wasB2B = (typeof lastClearWasDifficult !== 'undefined') && lastClearWasDifficult
      && ((_lcIsTSpin && numLines >= 1) || numLines >= 4);
    if (_wasB2B && typeof ptBackToBackGlow === 'function') ptBackToBackGlow();
  }

  // Clear pending Ys (gravity already applied above)
  lineClearPendingYs = [];
}
