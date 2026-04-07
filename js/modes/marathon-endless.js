// Marathon Endless mode — infinite progression with no level cap.
// Speed ramps from Level 1 to Level 20 over the first 200 lines, then adds
// micro-increments every 10 lines indefinitely.  Milestone banners fire at
// 50 / 100 / 200 / 500 / 1000 lines and unlock cosmetic piece skins.
// Optional garbage injection starts after 300 lines (one row every 30 s).
// Progress is auto-saved to localStorage every 50 lines so the player can
// resume later.
//
// Requires: state.js, gamestate.js, savestate.js (all loaded first).

const MARATHON_ENDLESS_STORAGE_KEY    = 'mineCtris_marathonEndlessBest';
const MARATHON_ENDLESS_UNLOCKS_KEY    = 'mineCtris_marathonEndlessUnlocks';
const MARATHON_ENDLESS_LINES_PER_LEVEL = 10;
const MARATHON_ENDLESS_BASE_RATE       = 1.18;   // matches classic marathon per-level multiplier
const MARATHON_ENDLESS_MICRO_INCREMENT = 0.02;   // added to multiplier per level after 20
const MARATHON_ENDLESS_GARBAGE_START   = 300;    // lines before garbage injection begins
const MARATHON_ENDLESS_GARBAGE_INTERVAL = 30;    // seconds between garbage rows
const MARATHON_ENDLESS_CHECKPOINT_INTERVAL = 50; // lines between auto-saves

// Milestone definitions — each fires at the given line count.
const MARATHON_ENDLESS_MILESTONES = {
   50: { tier: 'Bronze',  icon: '\uD83E\uDD49', skinId: 'me_skin_bronze',  color: '#cd7f32' },
  100: { tier: 'Silver',  icon: '\uD83E\uDD48', skinId: 'me_skin_silver',  color: '#c0c0c0' },
  200: { tier: 'Gold',    icon: '\uD83E\uDD47', skinId: 'me_skin_gold',    color: '#ffd700' },
  500: { tier: 'Diamond', icon: '\uD83D\uDC8E', skinId: 'me_skin_diamond', color: '#b9f2ff' },
 1000: { tier: 'Master',  icon: '\uD83D\uDC51', skinId: 'me_skin_master',  color: '#ff44ff' },
};

// Ordered milestone thresholds for easy iteration.
const _ME_MILESTONE_THRESHOLDS = [50, 100, 200, 500, 1000];

// ── Personal best ─────────────────────────────────────────────────────────────

/**
 * Load the marathon-endless personal best from localStorage.
 * Returns { linesCleared, score, timeSecs, date } or null.
 */
function loadMarathonEndlessBest() {
  try {
    const raw = localStorage.getItem(MARATHON_ENDLESS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Save a marathon-endless result if it beats the existing best (by lines, then score).
 * Returns true if this is a new personal best.
 */
function saveMarathonEndlessBest(lines, sc, timeSecs) {
  const existing = loadMarathonEndlessBest();
  const isNew = !existing || lines > existing.linesCleared ||
    (lines === existing.linesCleared && sc > existing.score);
  if (!isNew) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(MARATHON_ENDLESS_STORAGE_KEY,
      JSON.stringify({ linesCleared: lines, score: sc, timeSecs, date: today }));
  } catch (_) {}
  return true;
}

// ── Cosmetic unlocks ──────────────────────────────────────────────────────────

/** Return the set of unlocked marathon-endless skin IDs (from localStorage). */
function loadMarathonEndlessUnlocks() {
  try {
    const raw = localStorage.getItem(MARATHON_ENDLESS_UNLOCKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/** Persist a newly unlocked skin ID. No-op if already unlocked. */
function _saveMarathonEndlessUnlock(skinId) {
  const existing = loadMarathonEndlessUnlocks();
  if (existing.indexOf(skinId) !== -1) return;
  existing.push(skinId);
  try {
    localStorage.setItem(MARATHON_ENDLESS_UNLOCKS_KEY, JSON.stringify(existing));
  } catch (_) {}
}

/** Return true if the given skin ID has been unlocked via marathon-endless milestones. */
function isMarathonEndlessSkinUnlocked(skinId) {
  return loadMarathonEndlessUnlocks().indexOf(skinId) !== -1;
}

// ── Speed curve ───────────────────────────────────────────────────────────────

/**
 * Compute the difficulty multiplier for the given 1-based level.
 *  Levels 1–20  → classic marathon curve:   RATE^(level-1)
 *  Levels 21+   → add MICRO_INCREMENT per level beyond 20
 */
function getMarathonEndlessMultiplier(level) {
  if (level <= 20) {
    return Math.pow(MARATHON_ENDLESS_BASE_RATE, level - 1);
  }
  return Math.pow(MARATHON_ENDLESS_BASE_RATE, 19) + (level - 20) * MARATHON_ENDLESS_MICRO_INCREMENT;
}

// ── Level update (called after every line clear) ──────────────────────────────

/**
 * Recalculate the current level from lines cleared and apply speed.
 * Also handles milestone detection, PB-tracking LPM, and checkpoint saves.
 * Returns the new level if it changed, 0 otherwise.
 */
function updateMarathonEndlessLevel() {
  if (!isMarathonEndlessMode) return 0;

  // Track peak LPM
  if (typeof gameElapsedSeconds !== 'undefined' && gameElapsedSeconds > 5 &&
      typeof linesCleared !== 'undefined' && linesCleared > 0) {
    const curLpm = Math.round(linesCleared / (gameElapsedSeconds / 60));
    if (curLpm > marathonEndlessPeakLPM) marathonEndlessPeakLPM = curLpm;
  }

  const newLevel = Math.floor(linesCleared / MARATHON_ENDLESS_LINES_PER_LEVEL) + 1;
  if (newLevel <= marathonEndlessLevel) {
    // Even if level didn't change, check milestones and checkpoints
    _checkMarathonEndlessMilestone();
    _checkMarathonEndlessCheckpoint();
    return 0;
  }

  const prevLevel = marathonEndlessLevel;
  marathonEndlessLevel = newLevel;

  // Apply new speed
  difficultyMultiplier = getMarathonEndlessMultiplier(marathonEndlessLevel);
  lastDifficultyTier   = marathonEndlessLevel - 1;

  // Show speed-up banner
  if (speedUpBannerEl) {
    speedUpBannerEl.textContent = 'SPEED UP! \u00d7' + difficultyMultiplier.toFixed(2) +
      ' (Lv.' + marathonEndlessLevel + ')';
    speedUpBannerEl.style.color = '#fff';
    speedUpBannerEl.style.display = 'block';
    speedUpBannerTimer = 2.0;
  }

  // Flash level indicator
  const levelEl = document.getElementById('hud-level');
  if (levelEl) {
    levelEl.classList.remove('level-up-flash');
    void levelEl.offsetWidth;
    levelEl.classList.add('level-up-flash');
  }

  // Check milestones and checkpoints after the level update
  _checkMarathonEndlessMilestone();
  _checkMarathonEndlessCheckpoint();

  if (typeof updateScoreHUD === 'function') updateScoreHUD();
  return newLevel;
}

// ── Milestone handling ────────────────────────────────────────────────────────

function _checkMarathonEndlessMilestone() {
  for (var i = 0; i < _ME_MILESTONE_THRESHOLDS.length; i++) {
    const threshold = _ME_MILESTONE_THRESHOLDS[i];
    if (linesCleared >= threshold && marathonEndlessLastMilestone < threshold) {
      marathonEndlessLastMilestone = threshold;
      _awardMarathonEndlessMilestone(threshold);
    }
  }
}

function _awardMarathonEndlessMilestone(threshold) {
  const def = MARATHON_ENDLESS_MILESTONES[threshold];
  if (!def) return;

  // Persist the unlock
  _saveMarathonEndlessUnlock(def.skinId);

  // Show milestone banner
  if (speedUpBannerEl) {
    speedUpBannerEl.textContent = def.icon + ' ' + def.tier.toUpperCase() +
      ' MILESTONE! ' + threshold + ' lines — Skin unlocked!';
    speedUpBannerEl.style.color = def.color;
    speedUpBannerEl.style.display = 'block';
    speedUpBannerTimer = 4.0;
  }

  // Flash the HUD lines counter
  const linesEl = document.getElementById('hud-lines');
  if (linesEl) {
    linesEl.classList.remove('level-up-flash');
    void linesEl.offsetWidth;
    linesEl.classList.add('level-up-flash');
  }
}

// ── Auto-save checkpoints ─────────────────────────────────────────────────────

function _checkMarathonEndlessCheckpoint() {
  const nextCheckpoint = Math.floor(linesCleared / MARATHON_ENDLESS_CHECKPOINT_INTERVAL) *
    MARATHON_ENDLESS_CHECKPOINT_INTERVAL;
  if (nextCheckpoint > 0 && nextCheckpoint > marathonEndlessLastCheckpoint) {
    marathonEndlessLastCheckpoint = nextCheckpoint;
    if (typeof saveGameState === 'function') saveGameState();
  }
}

// ── Garbage injection (per-tick, called from game-loop) ───────────────────────

/**
 * Called every frame with delta time.  After MARATHON_ENDLESS_GARBAGE_START lines
 * and if garbage is enabled, injects one garbage row every 30 seconds.
 */
function tickMarathonEndlessGarbage(delta) {
  if (!isMarathonEndlessMode || isGameOver || isPaused) return;
  if (!marathonEndlessGarbageEnabled) return;
  if (linesCleared < MARATHON_ENDLESS_GARBAGE_START) return;

  marathonEndlessGarbageTimer += delta;
  if (marathonEndlessGarbageTimer >= MARATHON_ENDLESS_GARBAGE_INTERVAL) {
    marathonEndlessGarbageTimer -= MARATHON_ENDLESS_GARBAGE_INTERVAL;
    _injectMarathonEndlessGarbageLine();
  }
}

function _injectMarathonEndlessGarbageLine() {
  // Reuse the battle garbage injection helper which shifts blocks up and places rubble.
  if (typeof _injectRubbleRows === 'function') {
    _injectRubbleRows(1, (Math.random() * 0xFFFFFFFF) | 0);
    // Brief warning banner
    if (speedUpBannerEl) {
      speedUpBannerEl.textContent = '\u26a0 GARBAGE LINE!';
      speedUpBannerEl.style.color = '#ff6600';
      speedUpBannerEl.style.display = 'block';
      speedUpBannerTimer = 1.5;
    }
  }
}

// ── Game-over handler ─────────────────────────────────────────────────────────

/**
 * Called on game over while marathon-endless mode is active.
 * Saves the personal best, submits stats/leaderboard, and populates the
 * game-over overlay section.
 */
function onMarathonEndlessGameOver() {
  if (!isMarathonEndlessMode) return;

  // Clear the mid-run checkpoint
  if (typeof clearSaveState === 'function') clearSaveState();

  const finalLines = typeof linesCleared !== 'undefined' ? linesCleared : 0;
  const finalScore = typeof score !== 'undefined' ? score : 0;
  const timeSecs   = typeof gameElapsedSeconds !== 'undefined' ? Math.floor(gameElapsedSeconds) : 0;

  const isNew = saveMarathonEndlessBest(finalLines, finalScore, timeSecs);

  // Submit lifetime stats
  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:                 finalScore,
      blocksMined:           typeof blocksMined !== 'undefined' ? blocksMined : 0,
      linesCleared:          finalLines,
      blocksPlaced:          typeof blocksPlaced !== 'undefined' ? blocksPlaced : 0,
      totalCrafts:           typeof sessionCrafts !== 'undefined' ? sessionCrafts : 0,
      highestComboCount:     typeof sessionHighestComboCount !== 'undefined' ? sessionHighestComboCount : 0,
      highestDifficultyTier: lastDifficultyTier,
      isDailyChallenge:      false,
      tSpins:                typeof sessionTSpins !== 'undefined' ? sessionTSpins : 0,
      perfectClears:         typeof sessionPerfectClears !== 'undefined' ? sessionPerfectClears : 0,
      durationSecs:          timeSecs,
      mode:                  'marathon_endless',
    });
  }

  // Log session history
  if (typeof logSession === 'function') {
    logSession({
      mode:         'marathon_endless',
      score:        finalScore,
      lines:        finalLines,
      durationSecs: timeSecs,
      result:       'gameover',
      maxCombo:     typeof sessionHighestComboCount !== 'undefined' ? sessionHighestComboCount : 0,
      tSpins:       typeof sessionTSpins !== 'undefined' ? sessionTSpins : 0,
      tetrises:     typeof sessionTetrises !== 'undefined' ? sessionTetrises : 0,
      piecesPlaced: typeof blocksPlaced !== 'undefined' ? blocksPlaced : 0,
    });
  }

  // Submit to online leaderboard (ranked by lines cleared)
  if (typeof trySubmitModeScore === 'function') {
    trySubmitModeScore('marathon_endless', finalLines, finalScore);
  }

  // Populate the game-over section
  _renderMarathonEndlessGameOver(isNew, finalLines, finalScore, timeSecs);
}

// ── Game-over section renderer ────────────────────────────────────────────────

function _renderMarathonEndlessGameOver(isNewBest, lines, sc, timeSecs) {
  const el = document.getElementById('marathon-endless-go-section');
  if (!el) return;

  const mm = Math.floor(timeSecs / 60).toString().padStart(2, '0');
  const ss = Math.floor(timeSecs % 60).toString().padStart(2, '0');
  const timeStr = mm + ':' + ss;

  const ppm = (timeSecs > 0 && typeof blocksPlaced !== 'undefined')
    ? (blocksPlaced / (timeSecs / 60)).toFixed(1)
    : '—';

  const best    = loadMarathonEndlessBest();
  const bestStr = best ? best.linesCleared + ' lines (' + best.score.toLocaleString() + ')' : '—';

  // Highest milestone reached
  let highestMilestone = null;
  for (var i = _ME_MILESTONE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (lines >= _ME_MILESTONE_THRESHOLDS[i]) {
      highestMilestone = MARATHON_ENDLESS_MILESTONES[_ME_MILESTONE_THRESHOLDS[i]];
      break;
    }
  }

  el.style.display = 'block';
  el.innerHTML =
    '<div class="go-label">\u267E\ufe0f MARATHON ENDLESS</div>' +
    (highestMilestone
      ? '<div class="me-go-tier" style="color:' + highestMilestone.color + '">' +
        highestMilestone.icon + ' ' + highestMilestone.tier + ' Tier Reached</div>'
      : '') +
    '<div class="me-go-stats">' +
      '<div class="me-go-row"><span>Lines Cleared</span>' +
        '<span>' + lines + (isNewBest ? ' \u2605 NEW BEST!' : '') + '</span></div>' +
      '<div class="me-go-row"><span>Score</span>' +
        '<span>' + sc.toLocaleString() + '</span></div>' +
      '<div class="me-go-row"><span>Time Survived</span>' +
        '<span>' + timeStr + '</span></div>' +
      '<div class="me-go-row"><span>Level Reached</span>' +
        '<span>' + marathonEndlessLevel + '</span></div>' +
      '<div class="me-go-row"><span>Pieces / Min</span>' +
        '<span>' + ppm + '</span></div>' +
      '<div class="me-go-row"><span>Max Combo</span>' +
        '<span>' + (typeof sessionHighestComboCount !== 'undefined' ? sessionHighestComboCount : 0) + '</span></div>' +
      '<div class="me-go-row me-go-best"><span>Personal Best</span>' +
        '<span>' + bestStr + '</span></div>' +
    '</div>';
}
