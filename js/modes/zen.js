// Zen mode — relaxing endless play with no time pressure and no game-over height limit.
// Fall speed is fixed at ZEN_FIXED_MULTIPLIER (very slow). Difficulty scaling is disabled.
// A meditation timer shows elapsed session time. Personal best: longest session (tiebreak: lines).
// Requires: state.js (isZenMode, ZEN_FIXED_MULTIPLIER, score, blocksMined, linesCleared,
//           gameElapsedSeconds, isGameOver, gameTimerRunning),
//           gamestate.js (submitLifetimeStats), gamestate-reset.js (resetGame)

const ZEN_STORAGE_KEY = "mineCtris_zenBest";

/**
 * Load the zen personal best from localStorage.
 * Returns { durationSecs: number, linesCleared: number, date: string } or null.
 */
function loadZenBest() {
  try {
    const raw = localStorage.getItem(ZEN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Save a zen session if it beats the existing personal best (by durationSecs, then lines).
 * Returns true if this is a new personal best.
 */
function saveZenBest(durationSecs, lines) {
  const existing = loadZenBest();
  const isNew = !existing ||
    durationSecs > existing.durationSecs ||
    (durationSecs === existing.durationSecs && lines > existing.linesCleared);
  if (!isNew) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(ZEN_STORAGE_KEY, JSON.stringify({ durationSecs, linesCleared: lines, date: today }));
  } catch (_) {}
  return true;
}

/**
 * Format a duration in seconds as M:SS (e.g. 125 → "2:05").
 */
function fmtZenTime(secs) {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m + ":" + rem.toString().padStart(2, "0");
}

/**
 * Called when the player chooses to end a Zen session (via pause → End Session / Main Menu).
 * Saves the session stats, updates the personal best, and shows the zen session screen.
 * Does NOT call resetGame — buttons on the screen do that.
 */
function triggerZenSessionEnd() {
  if (!isZenMode) return;

  const durSecs = Math.floor(gameElapsedSeconds || 0);

  // Submit lifetime stats
  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score,
      blocksMined,
      linesCleared,
      blocksPlaced:          blocksPlaced || 0,
      totalCrafts:           sessionCrafts || 0,
      highestComboCount:     sessionHighestComboCount || 0,
      highestDifficultyTier: 0,
      isDailyChallenge:      false,
      tSpins:                sessionTSpins || 0,
      perfectClears:         sessionPerfectClears || 0,
      durationSecs:          durSecs,
      mode:                  'zen',
    });
  }

  if (typeof logSession === 'function') {
    logSession({
      mode: 'zen', score, lines: linesCleared,
      durationSecs: durSecs,
      result: 'session_end',
      maxCombo: sessionHighestComboCount || 0,
      tSpins: sessionTSpins || 0,
      tetrises: sessionTetrises || 0,
      piecesPlaced: blocksPlaced || 0,
    });
  }

  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score, linesCleared, blocksMined });
  }

  // Award XP
  if (typeof awardXP === 'function') {
    const _zenXpBefore = typeof loadLifetimeStats === 'function' ? (loadLifetimeStats().playerXP || 0) : 0;
    const { xpEarned: _zenXP, streakBonus: _zenStreak } = awardXP(score, 'zen');
    const zenXpEl = document.getElementById('zen-xp-earned');
    if (zenXpEl) {
      zenXpEl.textContent = '+ ' + _zenXP + ' XP' + (_zenStreak ? '  (Streak Bonus!)' : '');
      zenXpEl.className = 'xp-earned-display' + (_zenStreak ? ' xp-streak' : '');
    }
    if (typeof checkLevelUp === 'function') checkLevelUp(_zenXpBefore, typeof loadLifetimeStats === 'function' ? (loadLifetimeStats().playerXP || 0) : 0);
  }

  const isNew = saveZenBest(durSecs, linesCleared);
  const best  = loadZenBest();

  // Populate zen session overlay
  const overlayEl = document.getElementById("zen-session-screen");
  if (overlayEl) {
    const timeEl = document.getElementById("zen-final-time");
    if (timeEl) timeEl.textContent = fmtZenTime(durSecs);

    const linesEl = document.getElementById("zen-final-lines");
    if (linesEl) linesEl.textContent = linesCleared + " lines";

    const scoreEl2 = document.getElementById("zen-final-score");
    if (scoreEl2) scoreEl2.textContent = score.toLocaleString();

    const pbEl = document.getElementById("zen-personal-best");
    if (pbEl) {
      if (isNew) {
        pbEl.textContent = "New personal best!";
        pbEl.className = "zen-new-best";
      } else if (best) {
        pbEl.textContent = "Best: " + fmtZenTime(best.durationSecs) + "  \u2022  " + best.linesCleared + " lines";
        pbEl.className = "zen-pb-line";
      } else {
        pbEl.textContent = "";
      }
    }

    overlayEl.style.display = "flex";
  }

  // Fade music
  if (typeof stopBgMusic === "function") stopBgMusic();

  // Release pointer lock so buttons are clickable
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();
}

/**
 * Apply ambient Zen visuals at session start: light fog and calming sky tint.
 * Called once from the mode-select click handler after the world is ready.
 */
function applyZenAmbience() {
  // Soften fog density for a misty, calm atmosphere
  if (typeof scene !== 'undefined' && scene && scene.fog) {
    scene.fog.density = 0.0015;
  }
}
