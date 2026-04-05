// Marathon mode — level-based endless progression with increasing speed and milestone rewards.
// Every 10 lines cleared advances one level. Speed increases per level (MARATHON_LEVEL_RATE).
// Kill screen at level 29 — pieces fall extremely fast. No explicit end condition.
// Requires: state.js (isMarathonMode, marathonLevel, marathonKillScreen, linesCleared,
//           score, blocksMined, isGameOver, gameTimerRunning, controls),
//           gamestate.js (submitLifetimeStats, updateScoreHUD)

const MARATHON_STORAGE_KEY = "mineCtris_marathonBest";

// Milestone levels and their reward messages.
const MARATHON_MILESTONES = {
  5:  "Level 5 — Speed ramping up!",
  10: "Level 10 — You're flying!",
  15: "Level 15 — Pro territory!",
  20: "Level 20 — Insane speed!",
  25: "Level 25 — Legendary!",
  29: "KILL SCREEN — Maximum speed!",
};

/**
 * Load the marathon personal best from localStorage.
 * Returns { level: number, score: number, date: string } or null.
 */
function loadMarathonBest() {
  try {
    const raw = localStorage.getItem(MARATHON_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Save marathon result if it beats the existing personal best (by level, then score).
 * Returns true if this is a new personal best.
 */
function saveMarathonBest(level, sc) {
  const existing = loadMarathonBest();
  const isNew = !existing || level > existing.level ||
    (level === existing.level && sc > existing.score);
  if (!isNew) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(MARATHON_STORAGE_KEY, JSON.stringify({ level, score: sc, date: today }));
  } catch (_) {}
  return true;
}

/**
 * Called after each line clear to check if marathonLevel should advance.
 * Returns the new level if it changed, or 0 if no change.
 */
function updateMarathonLevel() {
  if (!isMarathonMode) return 0;
  const newLevel = Math.min(
    Math.floor(linesCleared / MARATHON_LINES_PER_LEVEL) + 1,
    MARATHON_KILL_SCREEN_LEVEL
  );
  if (newLevel <= marathonLevel) return 0;

  const prevLevel = marathonLevel;
  marathonLevel = newLevel;

  // Update speed multiplier immediately
  const mult = Math.pow(MARATHON_LEVEL_RATE, marathonLevel - 1);
  difficultyMultiplier = mult;
  lastDifficultyTier = marathonLevel - 1;

  // Kill screen flag
  if (marathonLevel >= MARATHON_KILL_SCREEN_LEVEL && !marathonKillScreen) {
    marathonKillScreen = true;
  }

  // Show milestone message or speed-up banner
  const milestone = MARATHON_MILESTONES[marathonLevel];
  if (speedUpBannerEl) {
    speedUpBannerEl.textContent = milestone
      ? milestone
      : "SPEED UP!  Level " + marathonLevel;
    speedUpBannerEl.style.color = marathonKillScreen ? "#ff3300" : "#fff";
    speedUpBannerEl.style.display = "block";
    speedUpBannerTimer = 2.5;
  }

  // Flash the level indicator
  const levelEl = document.getElementById("hud-level");
  if (levelEl) {
    levelEl.classList.remove("level-up-flash");
    void levelEl.offsetWidth;
    levelEl.classList.add("level-up-flash");
  }

  updateScoreHUD();
  return newLevel;
}

/**
 * Called on game over to record marathon result and show game-over screen.
 * The game-over is still handled by the standard triggerGameOver(); this just
 * saves the best and submits stats.
 */
function onMarathonGameOver() {
  if (!isMarathonMode) return;

  const isNew = saveMarathonBest(marathonLevel, score);

  submitLifetimeStats({
    score,
    blocksMined,
    linesCleared,
    blocksPlaced:          blocksPlaced || 0,
    totalCrafts:           sessionCrafts || 0,
    highestComboCount:     sessionHighestComboCount || 0,
    highestDifficultyTier: lastDifficultyTier,
    isDailyChallenge:      false,
    tSpins:                sessionTSpins || 0,
    perfectClears:         sessionPerfectClears || 0,
    durationSecs:          Math.floor(gameElapsedSeconds || 0),
    mode:                  'marathon',
  });

  if (typeof logSession === 'function') {
    logSession({
      mode: 'marathon', score, lines: linesCleared,
      durationSecs: Math.floor(gameElapsedSeconds || 0),
      result: 'gameover',
      maxCombo: sessionHighestComboCount || 0,
      tSpins: sessionTSpins || 0,
      tetrises: sessionTetrises || 0,
      piecesPlaced: blocksPlaced || 0,
    });
  }

  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score, linesCleared, blocksMined });
  }

  // Show "new best" note in the game-over screen subtitle
  if (isNew) {
    const subtitleEl = document.getElementById("game-over-subtitle");
    if (subtitleEl) {
      subtitleEl.textContent = "New marathon best!  Level " + marathonLevel;
      subtitleEl.style.display = "block";
    }
  }
}
