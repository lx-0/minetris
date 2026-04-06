// Countdown mode — personal best tracking and game-over overlay.
// Requires: state.js (isCountdownMode, countdownTimerActive, countdownElapsedMs,
//           countdownComplete, countdownSpeedStage, score, blocksMined, linesCleared,
//           blocksPlaced, sessionCrafts, sessionHighestComboCount, lastDifficultyTier,
//           isGameOver, gameTimerRunning, controls),
//           gamestate.js (submitLifetimeStats)

const COUNTDOWN_STORAGE_KEY = "mineCtris_countdownBest";

/**
 * Load the personal best Countdown record from localStorage.
 * Returns { score, timeSecs, stage, linesCleared, date } or null.
 */
function loadCountdownBest() {
  try {
    const raw = localStorage.getItem(COUNTDOWN_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Save a Countdown result if it beats the existing personal best (by score).
 * Returns true if this is a new personal best.
 */
function saveCountdownBest(finalScore, timeSecs, stage, lines) {
  const existing = loadCountdownBest();
  if (existing && existing.score >= finalScore) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify({
      score: finalScore,
      timeSecs: timeSecs,
      stage: stage,
      linesCleared: lines,
      date: today,
    }));
  } catch (_) {}
  return true;
}

/**
 * Format seconds as M:SS.
 */
function fmtCountdownTime(totalSecs) {
  const m = Math.floor(totalSecs / 60);
  const s = (totalSecs % 60).toString().padStart(2, "0");
  return m + ":" + s;
}

/**
 * Called when the player gets a game-over in countdown mode.
 * Freezes gameplay, records stats, and shows the countdown-complete overlay.
 */
function triggerCountdownComplete() {
  if (countdownComplete) return;
  countdownComplete    = true;
  countdownTimerActive = false;
  isGameOver           = true;
  gameTimerRunning     = false;

  // Hide danger overlay
  const dangerEl     = document.getElementById("danger-overlay");
  const dangerTextEl = document.getElementById("danger-text");
  if (dangerEl)     dangerEl.style.display     = "none";
  if (dangerTextEl) dangerTextEl.style.display = "none";

  // Hide countdown stage HUD
  const stageHudEl = document.getElementById("countdown-stage-hud");
  if (stageHudEl) stageHudEl.style.display = "none";

  const timeSurvived = Math.floor(countdownElapsedMs / 1000);
  const finalScore   = timeSurvived * 100 + linesCleared * 50;
  const stageReached = countdownSpeedStage;

  // Record lifetime stats
  submitLifetimeStats({
    score:                 finalScore,
    blocksMined:           blocksMined,
    linesCleared:          linesCleared,
    blocksPlaced:          blocksPlaced,
    totalCrafts:           sessionCrafts,
    highestComboCount:     sessionHighestComboCount,
    highestDifficultyTier: lastDifficultyTier,
    isDailyChallenge:      false,
    tSpins:                sessionTSpins,
    perfectClears:         sessionPerfectClears,
    durationSecs:          timeSurvived,
    mode:                  'countdown',
  });

  // Log session for history graphs
  if (typeof logSession === 'function') {
    logSession({
      mode: 'countdown', score: finalScore, lines: linesCleared,
      durationSecs: timeSurvived, maxCombo: sessionHighestComboCount,
      tSpins: sessionTSpins, tetrises: sessionTetrises,
      piecesPlaced: blocksPlaced,
      apm: Math.round((blocksPlaced / Math.max(timeSurvived / 60, 0.017)) * 10) / 10,
    });
  }

  // Metrics
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: finalScore, linesCleared: linesCleared, blocksMined: blocksMined });
  }

  // Award XP
  const _cdXpBefore = (loadLifetimeStats().playerXP || 0);
  const { xpEarned: _cdXP, streakBonus: _cdStreak } = awardXP(finalScore, 'countdown');
  const cdXpEl = document.getElementById('countdown-xp-earned');
  if (cdXpEl) {
    cdXpEl.textContent = '+ ' + _cdXP + ' XP' + (_cdStreak ? '  (Streak Bonus!)' : '');
    cdXpEl.className = 'xp-earned-display' + (_cdStreak ? ' xp-streak' : '');
  }
  if (typeof checkLevelUp === 'function') checkLevelUp(_cdXpBefore, loadLifetimeStats().playerXP || 0);
  if (typeof updateStreakHUD === 'function') updateStreakHUD();
  if (typeof awardXpPassGameEnd === 'function') awardXpPassGameEnd(false);

  const isNewBest = saveCountdownBest(finalScore, timeSurvived, stageReached, linesCleared);
  const best      = loadCountdownBest();

  // Submit to leaderboard
  if (typeof trySubmitModeScore === 'function') {
    trySubmitModeScore('countdown', finalScore, linesCleared);
  }

  // Daily missions hook
  if (typeof onMissionCountdownEnd === 'function') onMissionCountdownEnd(finalScore);

  // Populate countdown-complete overlay
  const overlayEl = document.getElementById("countdown-complete-screen");
  if (overlayEl) {
    const timeDisplayEl = document.getElementById("countdown-final-time");
    if (timeDisplayEl) timeDisplayEl.textContent = fmtCountdownTime(timeSurvived);

    const stageDisplayEl = document.getElementById("countdown-final-stage");
    if (stageDisplayEl) stageDisplayEl.textContent = "Stage " + stageReached + "/" + COUNTDOWN_TOTAL_STAGES;

    const linesDisplayEl = document.getElementById("countdown-final-lines");
    if (linesDisplayEl) linesDisplayEl.textContent = linesCleared + " lines";

    const scoreDisplayEl = document.getElementById("countdown-final-score");
    if (scoreDisplayEl) scoreDisplayEl.textContent = finalScore;

    const pbEl = document.getElementById("countdown-personal-best");
    if (pbEl) {
      if (isNewBest) {
        pbEl.textContent = "NEW PERSONAL BEST!";
        pbEl.className = "countdown-new-best";
      } else if (best) {
        pbEl.textContent = "Best: " + fmtCountdownTime(best.timeSecs) + " (Stage " + best.stage + ")";
        pbEl.className = "countdown-pb-line";
      } else {
        pbEl.textContent = "";
        pbEl.className = "";
      }
    }

    overlayEl.style.display = "flex";
  }

  // Fade music and play completion jingle
  if (typeof stopBgMusic        === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();

  // Release pointer lock so buttons are clickable
  if (controls && controls.isLocked) controls.unlock();
}

/**
 * Advance to the next speed stage. Called from the game loop when the stage
 * timer fires. Shows a brief "SPEED UP" banner and updates difficultyMultiplier.
 */
function countdownAdvanceStage() {
  if (countdownSpeedStage >= COUNTDOWN_TOTAL_STAGES) return;
  countdownSpeedStage++;
  countdownStageTimer = 0;
  countdownWarningActive = false;
  lastDifficultyTier = countdownSpeedStage - 1;

  difficultyMultiplier = getCountdownMultiplier(countdownSpeedStage);

  if (speedUpBannerEl) {
    speedUpBannerEl.textContent = "⚡ STAGE " + countdownSpeedStage + "! ×" + difficultyMultiplier.toFixed(1);
    speedUpBannerEl.style.color = countdownSpeedStage >= 8 ? "#ff4444" : "#ffd700";
    speedUpBannerEl.style.display = "block";
    speedUpBannerTimer = 2.5;
  }

  // Update stage HUD
  updateCountdownStageHUD();
  updateScoreHUD();
}

/**
 * Update the countdown stage HUD bar and label.
 */
function updateCountdownStageHUD() {
  const stageHudEl = document.getElementById("countdown-stage-hud");
  if (!stageHudEl) return;

  const stageLabelEl = document.getElementById("countdown-stage-label");
  if (stageLabelEl) {
    stageLabelEl.textContent = "Stage " + countdownSpeedStage + "/" + COUNTDOWN_TOTAL_STAGES;
    stageLabelEl.style.color = countdownWarningActive ? "#ff4444" : "";
  }

  const barFillEl = document.getElementById("countdown-stage-bar-fill");
  if (barFillEl) {
    const pct = ((countdownSpeedStage - 1) / (COUNTDOWN_TOTAL_STAGES - 1)) * 100;
    barFillEl.style.width = pct + "%";
    barFillEl.style.background = countdownSpeedStage >= 8
      ? "linear-gradient(90deg, #ff4444, #ff8800)"
      : countdownSpeedStage >= 5
        ? "linear-gradient(90deg, #ffd700, #ff8800)"
        : "linear-gradient(90deg, #4caf50, #ffd700)";
  }

  // Warning flash
  if (countdownWarningActive) {
    stageHudEl.classList.add("countdown-stage-warning");
  } else {
    stageHudEl.classList.remove("countdown-stage-warning");
  }
}
