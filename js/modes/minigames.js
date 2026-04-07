// js/modes/minigames.js — Mini-games menu modes: Cheese Race, Dig Mode, Ultra, Block Puzzle.
// Sprint mini-game reuses the existing sprint mode (isSprintMode) directly.
//
// Requires: state.js, gamestate.js (submitLifetimeStats, addScore),
//           battle-garbage.js (_injectRubbleRows), progression/stats.js,
//           progression/xp.js (awardXP), ui/mode-select.js (showModeSelect)

// ── localStorage key ──────────────────────────────────────────────────────────
const MINIGAMES_STORAGE_KEY = 'mineCtris_minigames';

/**
 * Load mini-game stats object from localStorage.
 * Returns default structure on parse failure or missing key.
 */
function loadMinigameStats() {
  try {
    const raw = localStorage.getItem(MINIGAMES_STORAGE_KEY);
    if (!raw) return _defaultMinigameStats();
    const data = JSON.parse(raw);
    const def = _defaultMinigameStats();
    // Merge to ensure all keys present
    Object.keys(def).forEach(function (k) {
      if (!data[k]) data[k] = def[k];
    });
    return data;
  } catch (_) {
    return _defaultMinigameStats();
  }
}

function _defaultMinigameStats() {
  return {
    cheese_race: { bestTimeMs: null, gamesPlayed: 0 },
    dig:         { bestTimeSecs: null, gamesPlayed: 0 },
    ultra:       { bestScore: null, gamesPlayed: 0 },
    block_puzzle:{ levelsCompleted: 0, currentLevel: 1 },
  };
}

function saveMinigameStats(stats) {
  try { localStorage.setItem(MINIGAMES_STORAGE_KEY, JSON.stringify(stats)); } catch (_) {}
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtMinigameTime(ms) {
  const totalCs   = Math.floor(ms / 10);
  const cs        = totalCs % 100;
  const totalSecs = Math.floor(ms / 1000);
  const secs      = totalSecs % 60;
  const mins      = Math.floor(totalSecs / 60);
  return mins.toString().padStart(2, '0') + ':' +
         secs.toString().padStart(2, '0') + '.' +
         cs.toString().padStart(2, '0');
}

function fmtSurvivalTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (Math.floor(secs) % 60).toString().padStart(2, '0');
  return m + ':' + s;
}

// ── Block Puzzle level definitions ────────────────────────────────────────────
// Each level: { rows: number of garbage rows, pieces: pieces given to player }
// Rows must equal pieces needed to fill the gaps (each row needs 1 I-block fill).
// For simplicity: rows = min(level, 8), pieces = rows * 5 + level (generous limit).
function getBlockPuzzleLevelConfig(level) {
  const lv = Math.max(1, Math.min(level, BLOCK_PUZZLE_MINI_MAX_LEVEL));
  const rows = Math.min(lv, 8);
  const pieces = rows * 4 + Math.max(4, 10 - lv); // tighter piece budget at higher levels
  return { rows: rows, pieces: pieces };
}

// ── Garbage injection helper ──────────────────────────────────────────────────
// Calls _injectRubbleRows (from battle-garbage.js) if available.
function injectMinigameGarbage(count) {
  if (typeof _injectRubbleRows === 'function') {
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    _injectRubbleRows(count, seed);
  }
}

// ── Cheese Race ───────────────────────────────────────────────────────────────

/**
 * Initialize Cheese Race: inject 10 garbage rows so the board starts filled.
 * Called after game init (pieces are not yet spawning, world is set up).
 */
function initCheeseRace() {
  injectMinigameGarbage(CHEESE_RACE_ROWS);
}

/**
 * Trigger Cheese Race completion — called when linesCleared >= CHEESE_RACE_ROWS.
 */
function triggerCheeseRaceComplete() {
  if (cheeseRaceComplete) return;
  cheeseRaceComplete    = true;
  cheeseRaceTimerActive = false;
  isGameOver            = true;
  gameTimerRunning      = false;

  // Hide danger overlay
  var dangerEl     = document.getElementById('danger-overlay');
  var dangerTextEl = document.getElementById('danger-text');
  if (dangerEl)     dangerEl.style.display     = 'none';
  if (dangerTextEl) dangerTextEl.style.display = 'none';

  // Record lifetime stats
  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      blocksPlaced: blocksPlaced,
      totalCrafts:  sessionCrafts,
      highestComboCount: sessionHighestComboCount,
      durationSecs: Math.floor(cheeseRaceElapsedMs / 1000),
      mode:         'cheese_race',
    });
  }

  // Save personal best
  var stats = loadMinigameStats();
  var isNewBest = false;
  if (stats.cheese_race.bestTimeMs === null || cheeseRaceElapsedMs < stats.cheese_race.bestTimeMs) {
    stats.cheese_race.bestTimeMs = cheeseRaceElapsedMs;
    isNewBest = true;
  }
  stats.cheese_race.gamesPlayed = (stats.cheese_race.gamesPlayed || 0) + 1;
  saveMinigameStats(stats);

  // Award XP
  if (typeof awardXP === 'function') {
    try { awardXP(score, 'cheese_race'); } catch (_) {}
  }
  if (typeof updateStreakHUD === 'function') updateStreakHUD();
  if (typeof checkLevelUp === 'function') checkLevelUp(0, 0);

  // Metrics
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: score, linesCleared: linesCleared, blocksMined: blocksMined });
  }

  // Show completion overlay
  var overlayEl = document.getElementById('cheese-race-complete-screen');
  if (overlayEl) {
    var timeEl = document.getElementById('cheese-race-final-time');
    if (timeEl) timeEl.textContent = fmtMinigameTime(cheeseRaceElapsedMs);
    var pbEl = document.getElementById('cheese-race-personal-best');
    if (pbEl) {
      pbEl.textContent = isNewBest ? 'NEW PERSONAL BEST!' :
        (stats.cheese_race.bestTimeMs ? 'Best: ' + fmtMinigameTime(stats.cheese_race.bestTimeMs) : '');
      pbEl.className = isNewBest ? 'mg-complete-new-best' : 'mg-complete-pb-line';
    }
    overlayEl.style.display = 'flex';
  }

  if (typeof stopBgMusic       === 'function') stopBgMusic();
  if (typeof playGameOverJingle === 'function') playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

// ── Dig Mode ─────────────────────────────────────────────────────────────────

/**
 * Called each frame while Dig Mode is active. Advances the timer and injects
 * garbage rows at the configured interval.
 * @param {number} deltaMs  Frame delta in milliseconds.
 */
function tickDigMode(deltaMs) {
  if (!digTimerActive || isGameOver) return;
  digElapsedMs     += deltaMs;
  digGarbageAccMs  += deltaMs;
  if (digGarbageAccMs >= DIG_GARBAGE_INTERVAL_MS) {
    digGarbageAccMs -= DIG_GARBAGE_INTERVAL_MS;
    injectMinigameGarbage(1);
  }
}

/**
 * Record Dig Mode results on game over (called from triggerGameOver / showModeSelectOnEnd).
 */
function onDigModeEnd() {
  var stats = loadMinigameStats();
  var survivedSecs = Math.floor(digElapsedMs / 1000);
  if (stats.dig.bestTimeSecs === null || survivedSecs > stats.dig.bestTimeSecs) {
    stats.dig.bestTimeSecs = survivedSecs;
  }
  stats.dig.gamesPlayed = (stats.dig.gamesPlayed || 0) + 1;
  saveMinigameStats(stats);

  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      blocksPlaced: blocksPlaced,
      totalCrafts:  sessionCrafts,
      highestComboCount: sessionHighestComboCount,
      durationSecs: survivedSecs,
      mode:         'dig',
    });
  }
  if (typeof awardXP === 'function') {
    try { awardXP(score, 'dig'); } catch (_) {}
  }
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: score, linesCleared: linesCleared, blocksMined: blocksMined });
  }
}

// ── Ultra Mode ────────────────────────────────────────────────────────────────

/**
 * Trigger Ultra Mode completion (timer ran out).
 */
function triggerUltraComplete() {
  if (ultraComplete) return;
  ultraComplete    = true;
  ultraTimerActive = false;
  ultraRemainingMs = 0;
  isGameOver       = true;
  gameTimerRunning = false;

  // Record lifetime stats
  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      blocksPlaced: blocksPlaced,
      totalCrafts:  sessionCrafts,
      highestComboCount: sessionHighestComboCount,
      durationSecs: Math.floor(ULTRA_DURATION_MS / 1000),
      mode:         'ultra',
    });
  }

  // Save personal best
  var stats = loadMinigameStats();
  var isNewBest = false;
  if (stats.ultra.bestScore === null || score > stats.ultra.bestScore) {
    stats.ultra.bestScore = score;
    isNewBest = true;
  }
  stats.ultra.gamesPlayed = (stats.ultra.gamesPlayed || 0) + 1;
  saveMinigameStats(stats);

  // Award XP
  if (typeof awardXP === 'function') {
    try { awardXP(score, 'ultra'); } catch (_) {}
  }
  if (typeof updateStreakHUD === 'function') updateStreakHUD();
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: score, linesCleared: linesCleared, blocksMined: blocksMined });
  }

  // Show completion overlay
  var overlayEl = document.getElementById('ultra-complete-screen');
  if (overlayEl) {
    var scoreEl2 = document.getElementById('ultra-final-score');
    if (scoreEl2) scoreEl2.textContent = score;
    var pbEl = document.getElementById('ultra-personal-best');
    if (pbEl) {
      pbEl.textContent = isNewBest ? 'NEW PERSONAL BEST!' :
        (stats.ultra.bestScore ? 'Best: ' + stats.ultra.bestScore : '');
      pbEl.className = isNewBest ? 'mg-complete-new-best' : 'mg-complete-pb-line';
    }
    overlayEl.style.display = 'flex';
  }

  if (typeof stopBgMusic       === 'function') stopBgMusic();
  if (typeof playGameOverJingle === 'function') playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

// ── Block Puzzle Mini ─────────────────────────────────────────────────────────

/**
 * Initialize the current Block Puzzle level: inject garbage rows.
 */
function initBlockPuzzleMini() {
  var cfg = getBlockPuzzleLevelConfig(blockPuzzleMiniLevel);
  blockPuzzleMiniPiecesLeft  = cfg.pieces;
  blockPuzzleMiniRowsTarget  = cfg.rows;
  injectMinigameGarbage(cfg.rows);
}

/**
 * Called after each piece lands in Block Puzzle Mini mode.
 * Checks win/fail conditions.
 */
function checkBlockPuzzleMiniCondition() {
  if (blockPuzzleMiniComplete) return;

  // Win: cleared all target rows
  if (linesCleared >= blockPuzzleMiniRowsTarget) {
    _blockPuzzleMiniFinish(true);
    return;
  }

  // Fail: out of pieces
  if (blockPuzzleMiniPiecesLeft <= 0) {
    _blockPuzzleMiniFinish(false);
  }
}

function _blockPuzzleMiniFinish(success) {
  if (blockPuzzleMiniComplete) return;
  blockPuzzleMiniComplete = true;
  blockPuzzleMiniSuccess  = success;
  isGameOver              = true;
  gameTimerRunning        = false;

  // Update stats
  var stats = loadMinigameStats();
  if (success) {
    stats.block_puzzle.levelsCompleted =
      Math.max(stats.block_puzzle.levelsCompleted || 0, blockPuzzleMiniLevel);
    // Advance to next level (saved for next session)
    stats.block_puzzle.currentLevel =
      Math.min(blockPuzzleMiniLevel + 1, BLOCK_PUZZLE_MINI_MAX_LEVEL);
  }
  saveMinigameStats(stats);

  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      blocksPlaced: blocksPlaced,
      totalCrafts:  sessionCrafts,
      highestComboCount: sessionHighestComboCount,
      durationSecs: Math.floor(gameElapsedSeconds || 0),
      mode:         'block_puzzle',
    });
  }

  if (typeof awardXP === 'function' && success) {
    try { awardXP(score + blockPuzzleMiniLevel * 100, 'block_puzzle'); } catch (_) {}
  }
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: score, linesCleared: linesCleared, blocksMined: blocksMined });
  }

  // Show completion overlay
  var overlayEl = document.getElementById('block-puzzle-mini-complete-screen');
  if (overlayEl) {
    var titleEl = document.getElementById('bp-mini-result-title');
    if (titleEl) {
      titleEl.textContent = success ? 'LEVEL ' + blockPuzzleMiniLevel + ' COMPLETE!' : 'LEVEL FAILED!';
      titleEl.style.color = success ? '#00ff88' : '#ff4444';
    }
    var levelEl = document.getElementById('bp-mini-level-display');
    if (levelEl) {
      levelEl.textContent = 'Level ' + blockPuzzleMiniLevel + ' / ' + BLOCK_PUZZLE_MINI_MAX_LEVEL;
    }
    var bestEl = document.getElementById('bp-mini-levels-completed');
    var statsNow = loadMinigameStats();
    if (bestEl) {
      bestEl.textContent = statsNow.block_puzzle.levelsCompleted + ' levels completed';
    }
    var nextBtn = document.getElementById('bp-mini-next-btn');
    if (nextBtn) {
      if (success && blockPuzzleMiniLevel < BLOCK_PUZZLE_MINI_MAX_LEVEL) {
        nextBtn.style.display = 'inline-block';
        nextBtn.textContent = 'Next Level';
      } else {
        nextBtn.style.display = 'none';
      }
    }
    overlayEl.style.display = 'flex';
  }

  if (typeof stopBgMusic       === 'function') stopBgMusic();
  if (success && typeof playGameOverJingle === 'function') playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

// ── Quick Restart helper ──────────────────────────────────────────────────────

/**
 * Restart the current mini-game from the completion screen.
 * Wires up "Play Again" buttons common across all mini-game overlays.
 */
function initMinigameRestartButtons() {
  // Generic helper for modes that just replay the same mode
  function _bindRestart(btnId, modeLauncher) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var el = btn.closest('[id$="-complete-screen"]') || btn.closest('[id$="-screen"]');
      if (el) el.style.display = 'none';
      modeLauncher();
    });
  }

  _bindRestart('cheese-race-play-again-btn', function () {
    if (typeof launchCheeseRace === 'function') launchCheeseRace();
  });
  _bindRestart('dig-play-again-btn', function () {
    if (typeof launchDigMode === 'function') launchDigMode();
  });
  _bindRestart('ultra-play-again-btn', function () {
    if (typeof launchUltraMode === 'function') launchUltraMode();
  });
  _bindRestart('bp-mini-play-again-btn', function () {
    if (typeof launchBlockPuzzleMini === 'function') launchBlockPuzzleMini(blockPuzzleMiniLevel);
  });
  // "Next Level" button for Block Puzzle
  var bpNextBtn = document.getElementById('bp-mini-next-btn');
  if (bpNextBtn) {
    bpNextBtn.addEventListener('click', function () {
      var el = document.getElementById('block-puzzle-mini-complete-screen');
      if (el) el.style.display = 'none';
      var nextLevel = Math.min(blockPuzzleMiniLevel + 1, BLOCK_PUZZLE_MINI_MAX_LEVEL);
      if (typeof launchBlockPuzzleMini === 'function') launchBlockPuzzleMini(nextLevel);
    });
  }
  // "Menu" buttons on each overlay
  ['cheese-race-menu-btn', 'dig-menu-btn', 'ultra-menu-btn', 'bp-mini-menu-btn'].forEach(function (id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var el = btn.closest('[id$="-complete-screen"]');
      if (el) el.style.display = 'none';
      if (typeof showModeSelect === 'function') showModeSelect();
    });
  });
}
