// Combo Challenge mode — chain consecutive line clears for escalating score multipliers.
// 60-second countdown. Multiplier resets to 1x when a piece locks without clearing a line.
// Requires: state.js (isComboChallenge, comboChallengeRemainingMs, comboChallengeStreak,
//           comboChallengeMaxStreak, comboChallengeTotalLines, comboChallengeComplete,
//           comboChallengeTimerActive, score, linesCleared, blocksMined, blocksPlaced,
//           sessionCrafts, sessionHighestComboCount, lastDifficultyTier, isGameOver,
//           gameTimerRunning, controls),
//           gamestate.js (submitLifetimeStats, updateScoreHUD)

const COMBO_CHALLENGE_STORAGE_KEY = "mineCtris_comboBest";

/**
 * Load the personal best Combo Challenge score from localStorage.
 * Returns { score, maxStreak, date } or null.
 */
function loadComboChallengeBest() {
  try {
    const raw = localStorage.getItem(COMBO_CHALLENGE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Save a Combo Challenge score if it beats the existing personal best.
 * Returns true if this is a new personal best.
 */
function saveComboChallengeBest(finalScore, maxStreak) {
  const existing = loadComboChallengeBest();
  if (existing && existing.score >= finalScore) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(COMBO_CHALLENGE_STORAGE_KEY,
      JSON.stringify({ score: finalScore, maxStreak, date: today }));
  } catch (_) {}
  return true;
}

/**
 * Update the combo challenge HUD overlay (streak counter and multiplier).
 * Called on every streak change and timer tick.
 */
function updateComboChallengeHUD() {
  const hudEl = document.getElementById('combo-challenge-hud');
  if (!hudEl) return;

  const streakEl = document.getElementById('cc-streak-count');
  const multEl   = document.getElementById('cc-multiplier');

  if (streakEl) {
    streakEl.textContent = comboChallengeStreak > 0
      ? 'x' + comboChallengeStreak + ' COMBO!'
      : 'x0';
    streakEl.style.animation = 'none';
    void streakEl.offsetWidth; // force reflow to restart animation
    streakEl.style.animation  = '';
    if (comboChallengeStreak > 0) {
      streakEl.classList.add('cc-streak-active');
    } else {
      streakEl.classList.remove('cc-streak-active');
    }
  }

  if (multEl) {
    const mult = Math.min(1 + comboChallengeStreak * 0.5, 10);
    multEl.textContent = mult.toFixed(1) + 'x';
    // Glow color scales with multiplier (grey → orange → gold → purple)
    if (mult >= 6) {
      multEl.style.color     = '#cc44ff';
      multEl.style.textShadow = '0 0 12px #cc44ff';
    } else if (mult >= 3.5) {
      multEl.style.color     = '#ffd700';
      multEl.style.textShadow = '0 0 10px #ffd700';
    } else if (mult > 1) {
      multEl.style.color     = '#ff8800';
      multEl.style.textShadow = '0 0 8px #ff8800';
    } else {
      multEl.style.color     = '#aaaaaa';
      multEl.style.textShadow = 'none';
    }
  }

  updateScoreHUD();
}

/**
 * Flash the combo counter red to signal a streak break.
 * Called when a piece locks without clearing a line.
 */
function comboChallengeFlashBreak() {
  const streakEl = document.getElementById('cc-streak-count');
  if (!streakEl) return;
  streakEl.style.animation  = 'none';
  void streakEl.offsetWidth;
  streakEl.style.color      = '#ff4444';
  streakEl.style.animation  = 'cc-break-flash 0.5s ease-out forwards';
}

/**
 * Called by lineclear.js after each line clear in combo challenge mode.
 * Increments streak, computes multiplier, adds score.
 *
 * @param {number} numLines  Lines cleared this lock (1–4)
 */
function comboChallengeOnLineClear(numLines) {
  comboChallengeStreak++;
  comboChallengeTotalLines += numLines;
  if (comboChallengeStreak > comboChallengeMaxStreak) {
    comboChallengeMaxStreak = comboChallengeStreak;
  }

  const mult  = Math.min(1 + comboChallengeStreak * 0.5, 10);
  const pts   = Math.round(numLines * 100 * mult);
  addScore(pts);

  // Milestone effects at streak 5 / 10 / 15 / 20
  comboChallengeOnMilestone(comboChallengeStreak);

  updateComboChallengeHUD();
}

/**
 * Called by lineclear.js when a piece locks without any line clear.
 * Resets streak to 0 and flashes the counter.
 */
function comboChallengeOnNoLineClear() {
  if (comboChallengeStreak === 0) return;
  comboChallengeStreak = 0;
  comboChallengeFlashBreak();
  updateComboChallengeHUD();
}

/**
 * Fire extra celebration burst at streak milestones (5, 10, 15, 20).
 * Reuses the LineClearCelebration system at Tetris tier.
 */
function comboChallengeOnMilestone(streak) {
  if (streak !== 5 && streak !== 10 && streak !== 15 && streak !== 20) return;
  if (typeof lineClearCelebration !== 'undefined') {
    // Treat milestone as a Tetris clear (tier 4) for extra spectacle
    lineClearCelebration.trigger(4, 0xffd700, false);
  }
  // Show milestone banner via the speed-up banner (reused for one-off messages)
  if (typeof speedUpBannerEl !== 'undefined' && speedUpBannerEl) {
    speedUpBannerEl.textContent  = '\uD83D\uDD25 x' + streak + ' COMBO MILESTONE!';
    speedUpBannerEl.style.color  = streak >= 15 ? '#cc44ff' : '#ffd700';
    speedUpBannerEl.style.display = 'block';
    speedUpBannerTimer = 1.5;
  }
}

/**
 * Freeze gameplay and show the combo-challenge-complete overlay.
 * Called once when comboChallengeRemainingMs reaches 0.
 */
function triggerComboChallengeComplete() {
  if (comboChallengeComplete) return;
  comboChallengeComplete    = true;
  comboChallengeTimerActive = false;
  isGameOver                = true;
  gameTimerRunning          = false;

  // Hide danger overlay
  const dangerEl     = document.getElementById('danger-overlay');
  const dangerTextEl = document.getElementById('danger-text');
  if (dangerEl)     dangerEl.style.display     = 'none';
  if (dangerTextEl) dangerTextEl.style.display = 'none';

  // Record lifetime stats
  submitLifetimeStats({
    score,
    blocksMined,
    linesCleared:          comboChallengeTotalLines,
    blocksPlaced:          blocksPlaced || 0,
    totalCrafts:           sessionCrafts || 0,
    highestComboCount:     comboChallengeMaxStreak,
    highestDifficultyTier: lastDifficultyTier,
    isDailyChallenge:      false,
    tSpins:                sessionTSpins || 0,
    perfectClears:         sessionPerfectClears || 0,
    durationSecs:          60,
    mode:                  'combo_challenge',
  });

  // Log session for history graphs
  if (typeof logSession === 'function') {
    logSession({ mode: 'combo_challenge', score, lines: comboChallengeTotalLines,
      durationSecs: 60, maxCombo: comboChallengeMaxStreak,
      tSpins: sessionTSpins || 0, tetrises: sessionTetrises || 0,
      piecesPlaced: blocksPlaced || 0,
      apm: Math.round(((blocksPlaced || 0) / 2) * 10) / 10 });
  }

  // Metrics
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score, linesCleared: comboChallengeTotalLines, blocksMined });
  }

  // Award XP
  const _ccXpBefore = (loadLifetimeStats().playerXP || 0);
  const { xpEarned: _ccXP, streakBonus: _ccStreak } = awardXP(score, 'combo_challenge');
  const ccXpEl = document.getElementById('cc-xp-earned');
  if (ccXpEl) {
    ccXpEl.textContent = '+ ' + _ccXP + ' XP' + (_ccStreak ? '  (Streak Bonus!)' : '');
    ccXpEl.className   = 'xp-earned-display' + (_ccStreak ? ' xp-streak' : '');
  }
  if (typeof checkLevelUp === 'function') checkLevelUp(_ccXpBefore, loadLifetimeStats().playerXP || 0);
  if (typeof updateStreakHUD === 'function') updateStreakHUD();
  if (typeof awardXpPassGameEnd === 'function') awardXpPassGameEnd(false);

  const finalScore = score;
  const isNewBest  = saveComboChallengeBest(finalScore, comboChallengeMaxStreak);
  const best       = loadComboChallengeBest();

  // Submit to leaderboard
  if (typeof trySubmitModeScore === 'function') {
    trySubmitModeScore('combo_challenge', finalScore, comboChallengeTotalLines);
  }

  // Daily missions
  if (typeof onMissionBlitzEnd === 'function') onMissionBlitzEnd(finalScore);

  // Populate complete overlay
  const overlayEl = document.getElementById('combo-challenge-complete-screen');
  if (overlayEl) {
    const scoreEl2 = document.getElementById('cc-final-score');
    if (scoreEl2) scoreEl2.textContent = finalScore;

    const pbEl = document.getElementById('cc-personal-best');
    if (pbEl) {
      pbEl.textContent = isNewBest
        ? 'NEW PERSONAL BEST!'
        : (best ? 'Best: ' + best.score : '');
      pbEl.className = isNewBest ? 'cc-new-best' : 'cc-pb-line';
    }

    const maxStreakEl = document.getElementById('cc-stat-max-streak');
    if (maxStreakEl) maxStreakEl.textContent = 'Max Combo: x' + comboChallengeMaxStreak;

    const totalLinesEl = document.getElementById('cc-stat-total-lines');
    if (totalLinesEl) totalLinesEl.textContent = 'Lines Cleared: ' + comboChallengeTotalLines;

    const avgComboEl = document.getElementById('cc-stat-avg-combo');
    if (avgComboEl && comboChallengeTotalLines > 0) {
      // Avg combo = total lines / (times we reset + 1) — rough approximation via score
      // Display lines per clear as proxy metric
      avgComboEl.textContent = 'Final Multiplier: x' + Math.min(1 + comboChallengeMaxStreak * 0.5, 10).toFixed(1);
    }

    overlayEl.style.display = 'flex';
  }

  // Hide the combo challenge HUD
  const ccHudEl = document.getElementById('combo-challenge-hud');
  if (ccHudEl) ccHudEl.style.display = 'none';

  // Fade music and play completion jingle
  if (typeof stopBgMusic        === 'function') stopBgMusic();
  if (typeof playGameOverJingle === 'function') playGameOverJingle();

  // Release pointer lock
  if (controls && controls.isLocked) controls.unlock();
}
