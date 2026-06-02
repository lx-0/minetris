// Game reset — resets all state for a new game.
// Requires: core/gamestate.js loaded first.

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.suppressStartScreen=false] - If true, skip showing the
 *   blocker/start screen after resetting. Used by mini-game restarts that
 *   immediately re-acquire pointer lock without returning to the menu.
 */
function resetGame(opts) {
  var _suppressStartScreen = opts && opts.suppressStartScreen === true;
  // Decide whether to show a mini-game before returning to the start screen.
  // Only eligible after a real game over (not battle, expedition, or practice transitions).
  const _mgEligible = !_suppressStartScreen && isGameOver &&
    !isBattleMode &&
    !isPracticeMode &&
    (typeof activeBiomeId === 'undefined' || !activeBiomeId);

  // Stop any active replay recording or playback
  if (typeof replayOnReset === 'function') replayOnReset();

  // Survival: if exiting without game over, record this as a survived session.
  if (isSurvivalMode && !isGameOver && typeof recordSurvivedSession === 'function') {
    recordSurvivedSession({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      timeAlive:    gameElapsedSeconds,
    });
  }

  if (typeof resetBgMusic === "function") resetBgMusic();
  if (typeof clearSaveState === "function") clearSaveState();
  // Remove cave mouth structure (it will be recreated if/when survival mode starts).
  if (typeof clearCaveMouth === 'function') clearCaveMouth();
  // Clear the cave-mouth dungeon-launch flag and return button.
  if (typeof clearDungeonFromSurvival === 'function') clearDungeonFromSurvival();
  // Remove landed blocks (keep ground and trees)
  const toRemove = worldGroup.children.filter(
    (c) => c.name === "landed_block"
  );
  toRemove.forEach((b) => worldGroup.remove(b));
  // Clear obsidian tracking array — meshes were just removed from the scene;
  // without this the game-loop animates stale refs from previous sessions.
  obsidianBlocks.length = 0;

  // Clear falling pieces
  fallingPieces.forEach((p) => fallingPiecesGroup.remove(p));
  fallingPieces.length = 0;
  spawnTimer = 0;

  // Reset grid occupancy
  gridOccupancy.clear();

  // Clear hazard block tracking
  if (typeof clearHazardBlocks === 'function') clearHazardBlocks();

  // Reset fog to initial clear density
  if (scene.fog) scene.fog.density = 0.002;

  // Snap post-processing grade back to normal
  if (typeof resetPostProcessing === 'function') resetPostProcessing();

  // Reset score / stats
  score = 0;
  if (typeof acSetScore === 'function') acSetScore(0);
  blocksMined = 0;
  linesCleared = 0;
  oreMined = {};
  minedLineClears = 0;
  minedClearBonusScore = 0;
  totalItemsCrafted = 0;
  miningScore = 0;
  lineClearScore = 0;
  gameElapsedSeconds = 0;
  lastHudSecond = -1;

  // Reset session stats for lifetime tracking
  blocksPlaced = 0;
  sessionCrafts = 0;
  sessionConsumableCrafts = 0;
  sessionHighestComboCount = 0;
  sessionTSpins = 0;
  sessionMiniTSpins = 0;
  sessionPerfectClears = 0;
  sessionTetrises = 0;
  sessionB2BCount = 0;
  if (typeof achResetSession === "function") achResetSession();
  if (typeof resetMissionSession === "function") resetMissionSession();
  if (typeof finesseReset === "function") finesseReset();

  // Reset difficulty
  difficultyMultiplier = 1.0;
  lastDifficultyTier = 0;
  speedUpBannerTimer = 0;

  // Reset speed modifier
  speedModifier = 'normal';
  speedModifierMultiplier = 1.0;
  chaosPhaseAccumulator = 0;
  document.querySelectorAll('.speed-mod-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.modifier === 'normal');
  });
  if (speedUpBannerEl) {
    speedUpBannerEl.style.display = "none";
    speedUpBannerEl.style.color = "";
  }

  // Reset inventory
  inventory = {};
  selectedBlockColor = null;
  updateInventoryHUD();

  // Reset crafting state
  pickaxeTier             = "none";
  stonePickaxeClickStreak  = 0;
  stonePickaxeLastClickTime = -1;
  hasCraftingBench   = false;
  classicMiningEnabled = false;
  miningStreak         = 0;
  miningStreakTimer    = 0;
  lastMineTime         = -1;
  isPhysicsCascade     = false;
  cascadeLevel         = 0;
  if (typeof resetBlockPhysics === 'function') resetBlockPhysics();
  consumables        = { lava_flask: 0, ice_bridge: 0 };
  powerUps           = { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0, sabotage: 0, counter: 0, fortress: 0 };
  iceBridgeSlowActive = false;
  iceBridgeSlowTimer  = 0.0;
  // Reset power-up effect state
  equippedPowerUpType = null;
  slowDownActive = false;
  slowDownTimer  = 0.0;
  shieldActive   = false;
  magnetActive   = false;
  magnetTimer    = 0.0;
  magnetLastPullTime = 0.0;
  timeFreezeActive = false;
  timeFreezeTimer  = 0.0;
  counterActive  = false;
  fortressActive = false;
  fortressTimer  = 0.0;
  obsidianPickaxeActive = false;
  const shieldOverlayEl = document.getElementById("shield-overlay");
  if (shieldOverlayEl) { shieldOverlayEl.classList.remove("absorb"); shieldOverlayEl.style.display = "none"; }
  const powerupHudEl = document.getElementById("powerup-hud");
  if (powerupHudEl) powerupHudEl.style.display = "none";
  closeCraftingPanel();
  if (typeof resetPickaxeTierCelebrations === 'function') resetPickaxeTierCelebrations();
  if (typeof resetOreCrafting === 'function') resetOreCrafting();

  // Clear tree respawn queue
  treeRespawnQueue.length = 0;

  // Reset nudge state
  nudgeCooldown = 0;
  const nudgeHintEl = document.getElementById("nudge-hint");
  if (nudgeHintEl) nudgeHintEl.style.display = "none";
  if (typeof resetDasState === 'function') resetDasState();

  // Reset marathon state
  isMarathonMode     = false;
  marathonLevel      = 1;
  marathonKillScreen = false;
  marathonPeakLPM    = 0;
  const _lpmEl = document.getElementById("hud-lpm");
  if (_lpmEl) { _lpmEl.style.display = "none"; _lpmEl.textContent = "LPM: —"; }

  // Reset marathon-endless state
  isMarathonEndlessMode        = false;
  marathonEndlessLevel         = 1;
  marathonEndlessPeakLPM       = 0;
  marathonEndlessLastMilestone = 0;
  marathonEndlessLastCheckpoint = 0;
  marathonEndlessGarbageTimer  = 0;
  marathonEndlessGarbageEnabled = true;
  const meBadgeEl = document.getElementById('marathon-endless-badge');
  if (meBadgeEl) meBadgeEl.style.display = 'none';
  const meGoEl = document.getElementById('marathon-endless-go-section');
  if (meGoEl) meGoEl.style.display = 'none';

  // Reset sprint state
  isSprintMode      = false;
  sprintTimerActive = false;
  sprintElapsedMs   = 0;
  sprintComplete    = false;
  const sprintCompleteEl = document.getElementById("sprint-complete-screen");
  if (sprintCompleteEl) sprintCompleteEl.style.display = "none";

  // Reset daily state
  dailyTimerActive  = false;

  // Reset cheese race state
  isCheeseRaceMode      = false;
  cheeseRaceTimerActive = false;
  cheeseRaceElapsedMs   = 0;
  cheeseRaceComplete    = false;
  const cheeseCompleteEl = document.getElementById('cheese-race-complete-screen');
  if (cheeseCompleteEl) cheeseCompleteEl.style.display = 'none';

  // Reset dig mode state
  isDigMode      = false;
  digTimerActive = false;
  digElapsedMs   = 0;
  digGarbageAccMs = 0;

  // Reset ultra mode state
  isUltraMode       = false;
  ultraTimerActive  = false;
  ultraRemainingMs  = ULTRA_DURATION_MS;
  ultraComplete     = false;
  ultraBonusActive  = false;
  const ultraCompleteEl = document.getElementById('ultra-complete-screen');
  if (ultraCompleteEl) ultraCompleteEl.style.display = 'none';
  if (scoreEl) {
    const ultraTimerEl = scoreEl.querySelector('.hud-stat:nth-child(4)');
    if (ultraTimerEl) ultraTimerEl.style.color = '';
  }

  // Reset block puzzle mini state
  isBlockPuzzleMiniMode    = false;
  blockPuzzleMiniComplete  = false;
  blockPuzzleMiniSuccess   = false;
  blockPuzzleMiniPiecesLeft = 0;
  blockPuzzleMiniRowsTarget = 0;
  const bpMiniCompleteEl = document.getElementById('block-puzzle-mini-complete-screen');
  if (bpMiniCompleteEl) bpMiniCompleteEl.style.display = 'none';

  // Reset blitz state
  isBlitzMode       = false;
  blitzTimerActive  = false;
  blitzRemainingMs  = BLITZ_DURATION_MS;
  blitzComplete     = false;
  blitzBonusActive  = false;
  const blitzCompleteEl = document.getElementById("blitz-complete-screen");
  if (blitzCompleteEl) blitzCompleteEl.style.display = "none";
  // Reset timer HUD color
  if (scoreEl) {
    const timerEl = scoreEl.querySelector(".hud-stat:nth-child(4)");
    if (timerEl) timerEl.style.color = "";
  }

  // Reset countdown mode state
  isCountdownMode        = false;
  countdownTimerActive   = false;
  countdownElapsedMs     = 0;
  countdownComplete      = false;
  countdownSpeedStage    = 1;
  countdownStageTimer    = 0;
  countdownWarningActive = false;
  const countdownCompleteEl = document.getElementById("countdown-complete-screen");
  if (countdownCompleteEl) countdownCompleteEl.style.display = "none";
  const countdownStageHudEl = document.getElementById("countdown-stage-hud");
  if (countdownStageHudEl) countdownStageHudEl.style.display = "none";
  const countdownEdgeFlashEl = document.getElementById("countdown-edge-flash");
  if (countdownEdgeFlashEl) {
    countdownEdgeFlashEl.classList.remove('cd-warning-pulse', 'cd-stage-flash');
  }
  // Reset timer HUD color for countdown
  if (scoreEl) {
    const cdTimerEl = scoreEl.querySelector(".hud-stat:nth-child(4)");
    if (cdTimerEl) cdTimerEl.style.color = "";
  }

  // Reset combo challenge state
  isComboChallenge          = false;
  comboChallengeTimerActive = false;
  comboChallengeRemainingMs = COMBO_CHALLENGE_DURATION_MS;
  comboChallengeComplete    = false;
  comboChallengeStreak      = 0;
  comboChallengeMaxStreak   = 0;
  comboChallengeTotalLines  = 0;
  const ccCompleteEl = document.getElementById("combo-challenge-complete-screen");
  if (ccCompleteEl) ccCompleteEl.style.display = "none";
  const ccHudEl = document.getElementById("combo-challenge-hud");
  if (ccHudEl) ccHudEl.style.display = "none";

  // Reset co-op mode state
  isCoopMode = false;
  isCoopWideBoard = false;
  if (typeof coopBoardHideDivider === 'function') coopBoardHideDivider();
  coopPieceQueue.length = 0;
  _coopPosBroadcastLastTime = 0;
  _coopPosLastSent = null;
  coopScore = 0;
  coopMyScore = 0;
  coopPartnerScore = 0;
  coopPartnerMaxY = 0;
  coopHeightBroadcastLastTime = 0;
  coopPartnerStatus = 'disconnected';
  coopPartnerLastSeenTime = 0;
  coopMyBlocksMined = 0;
  coopMyLinesTriggered = 0;
  coopMyCraftsMade = 0;
  coopMyTradesCompleted = 0;
  coopPartnerBlocksMined = 0;
  coopPartnerLinesTriggered = 0;
  coopPartnerCraftsMade = 0;
  coopPartnerTradesCompleted = 0;
  coopPartnerName = '';
  coopStatsReceived = false;
  if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
  if (typeof coopTrade !== 'undefined') coopTrade.reset();
  coopPartnerLastPos = null;
  // Reset co-op difficulty state
  coopDifficulty = 'normal';
  coopFallMultiplier = 1.5;
  coopScoreMultiplier = 1.8;
  if (typeof _coopBonusOverlayTimer !== 'undefined' && _coopBonusOverlayTimer) {
    clearTimeout(_coopBonusOverlayTimer);
    _coopBonusOverlayTimer = null;
  }
  coopBonusBannerTimer = 0;
  coopGarbageTimer = 0;
  if (typeof resetCoopHighlights === 'function') resetCoopHighlights();
  const coopBonusEl = document.getElementById('coop-bonus-overlay');
  if (coopBonusEl) coopBonusEl.style.display = 'none';
  // Hide co-op HUD elements
  const coopBadgeEl2 = document.getElementById('coop-mode-badge');
  if (coopBadgeEl2) coopBadgeEl2.style.display = 'none';
  const coopHudEl2 = document.getElementById('coop-score-display');
  if (coopHudEl2) coopHudEl2.style.display = 'none';
  const coopPartnerStatusEl2 = document.getElementById('coop-partner-status');
  if (coopPartnerStatusEl2) coopPartnerStatusEl2.style.display = 'none';
  const coopGoEl = document.getElementById('coop-game-over-screen');
  if (coopGoEl) coopGoEl.style.display = 'none';
  const coopPartnerLeftEl = document.getElementById('coop-partner-left-dialog');
  if (coopPartnerLeftEl) coopPartnerLeftEl.style.display = 'none';

  // Reset daily challenge state
  isDailyChallenge = false;
  isDailyCoopChallenge = false;
  gameRng = null;
  const dailyBadgeEl = document.getElementById('daily-challenge-badge');
  if (dailyBadgeEl) dailyBadgeEl.style.display = 'none';

  // Reset infinite weekly depths state
  if (typeof isInfiniteWeekly !== 'undefined') isInfiniteWeekly = false;

  // Reset weekly challenge state
  isWeeklyChallenge = false;
  weeklyModifier = null;
  weeklyNoIron = false;
  weeklyGoldRush = false;
  weeklyIceAge = false;
  weeklyDoubleOrNothing = false;
  weeklyBlindDrop = false;
  const weeklyBadgeEl = document.getElementById('weekly-challenge-badge');
  if (weeklyBadgeEl) weeklyBadgeEl.style.display = 'none';

  // Reset battle mode state
  isBattleMode = false;
  battleResult = null;
  battleMatchMode = 'survival';
  battleIsRanked = false;
  battleScoreRaceRemainingMs = 180000;
  battleOpponentScore = 0;
  battleOpponentLines = 0;
  battleGarbageSent = 0;
  battleGarbageReceived = 0;
  battleRubbleMined = 0;
  battlePiecesPlaced = 0;
  _battleApmTimestamps = [];
  battleOpponentStats = null;
  if (typeof resetGarbageQueue === 'function') resetGarbageQueue();
  const battleBadgeEl = document.getElementById('battle-mode-badge');
  if (battleBadgeEl) battleBadgeEl.style.display = 'none';
  const battleResultEl = document.getElementById('battle-result-screen');
  if (battleResultEl) battleResultEl.style.display = 'none';
  const battleSrHudEl = document.getElementById('battle-score-race-hud');
  if (battleSrHudEl) battleSrHudEl.style.display = 'none';

  // Reset survival mode state
  isSurvivalMode = false;
  survivalSessionNumber = 1;
  // Restore ground plane visibility (was hidden during Survival mode)
  const _resetGround = worldGroup.children.find(c => c.name === "ground");
  if (_resetGround) _resetGround.visible = true;
  const survivalBadgeEl = document.getElementById('survival-badge');
  if (survivalBadgeEl) survivalBadgeEl.style.display = 'none';
  const survGoEl2 = document.getElementById('survival-go-section');
  if (survGoEl2) survGoEl2.style.display = 'none';
  const goTitleEl2 = document.getElementById('game-over-title');
  if (goTitleEl2) goTitleEl2.textContent = 'GAME OVER';
  const hsLabelEl2 = document.getElementById('hs-go-label');
  if (hsLabelEl2) hsLabelEl2.style.display = '';
  const hsTableEl2 = document.getElementById('hs-go-table');
  if (hsTableEl2) hsTableEl2.style.display = '';

  // Reset endless survival mode state
  if (isEndlessSurvivalMode && typeof deactivateAllEndlessModifiers === 'function') {
    deactivateAllEndlessModifiers();
  }
  isEndlessSurvivalMode     = false;
  endlessActiveModifiers    = [];
  endlessSurvivalSpeedTimer = 0;
  endlessSurvivalModTimer   = 0;
  endlessSurvivalSpeedLevel = 0;
  endlessMirrorActive       = false;
  endlessGravityActive      = false;
  endlessPoisonActive       = false;
  endlessShrinkLevel        = 0;
  const endlessBadgeEl = document.getElementById('endless-badge');
  if (endlessBadgeEl) endlessBadgeEl.style.display = 'none';
  const endlessModHud = document.getElementById('endless-modifier-hud');
  if (endlessModHud) endlessModHud.style.display = 'none';
  const endlessGoEl = document.getElementById('endless-go-section');
  if (endlessGoEl) endlessGoEl.style.display = 'none';

  // Clear expedition biome theme (restores user's cosmetic theme)
  if (typeof clearBiomeTheme === "function") clearBiomeTheme();

  // Notify parallax system of new game session (randomises biome if mode = 'random')
  if (typeof onParallaxGameStart === 'function') onParallaxGameStart();
  // Notify board background system of new game session
  if (typeof onBoardBgGameStart === 'function') onBoardBgGameStart();

  // Reset event engine
  if (typeof resetEventEngine === "function") resetEventEngine();

  // Seasonal event: refresh progress HUD on game reset
  if (typeof _seUpdateProgressHUD === 'function') _seUpdateProgressHUD();

  // Reset world modifier
  if (typeof resetWorldModifier === 'function') resetWorldModifier();
  const worldModBadgeEl = document.getElementById('world-modifier-badge');
  if (worldModBadgeEl) worldModBadgeEl.style.display = 'none';

  // Reset scarcity HUD (hides it when switching away from Survival)
  if (typeof resetScarcityHUD === 'function') resetScarcityHUD();

  // Cancel any pending mined-clear banner hide timer
  if (typeof resetMinedClearBanner === 'function') resetMinedClearBanner();

  // Reset dungeon modifier state (Entropy and session tracking)
  if (typeof resetDungeonModifiers === 'function') resetDungeonModifiers();

  // Reset boss battle state
  if (typeof resetBossBattle === 'function') resetBossBattle();

  // Reset puzzle mode state
  isPuzzleMode = false;
  puzzlePuzzleId = 1;
  puzzleComplete = false;
  if (typeof resetPuzzleState === "function") resetPuzzleState();
  if (typeof puzzleFixedQueue !== "undefined") puzzleFixedQueue.length = 0;
  if (typeof hidePuzzleSelect === "function") hidePuzzleSelect();

  // Reset custom puzzle mode state
  isCustomPuzzleMode = false;
  customPuzzleWinCondition = null;
  customPlayFromEditor = false;
  const puzzleCompleteEl = document.getElementById("puzzle-complete-screen");
  if (puzzleCompleteEl) puzzleCompleteEl.style.display = "none";
  const puzzleBadgeEl2 = document.getElementById("puzzle-badge");
  if (puzzleBadgeEl2) puzzleBadgeEl2.style.display = "none";

  // Reset practice mode state
  isPracticeMode = false;
  practiceUndoEnabled = true;
  practiceUndoHistory.length = 0;
  const practiceCompleteEl = document.getElementById("practice-complete-screen");
  if (practiceCompleteEl) practiceCompleteEl.style.display = "none";
  const practiceBadgeEl = document.getElementById("practice-badge");
  if (practiceBadgeEl) practiceBadgeEl.style.display = "none";

  // Reset training mode state
  if (typeof resetTrainingMode === "function") resetTrainingMode();
  // Reset gravity direction and hide indicator
  gravityDirection = 'down';
  const gravIndicatorEl = document.getElementById("gravity-indicator");
  if (gravIndicatorEl) gravIndicatorEl.style.display = "none";
  // Reset gravity selector buttons to 'down' active
  const gravBtnsReset = document.querySelectorAll('.grav-btn');
  gravBtnsReset.forEach(function (b) {
    b.classList.toggle('grav-btn-active', b.getAttribute('data-grav') === 'down');
  });

  // Reset zen mode state
  isZenMode = false;
  const zenSessionEl = document.getElementById("zen-session-screen");
  if (zenSessionEl) zenSessionEl.style.display = "none";
  const zenBadgeEl = document.getElementById("zen-badge");
  if (zenBadgeEl) zenBadgeEl.style.display = "none";

  // Resolve equipped block skin for this session (skin changes take effect on game start).
  if (typeof getEquipped === 'function') {
    const skinCosmetic = getEquipped('block_skin');
    activeBlockSkin = (skinCosmetic && skinCosmetic.assets && skinCosmetic.assets.themeKey !== 'default')
      ? skinCosmetic.assets.themeKey
      : null;
  } else {
    activeBlockSkin = null;
  }

  // Load per-piece-type skin assignments (may override activeBlockSkin per colorIndex).
  if (typeof loadPerPieceTypeSkins === 'function') {
    const map = loadPerPieceTypeSkins();
    activePerPieceTypeSkins = (map && Object.keys(map).length > 0) ? map : null;
  } else {
    activePerPieceTypeSkins = null;
  }

  // Clear animated block registry so stale references don't carry into the new game.
  if (typeof clearAnimatedBlocks === 'function') clearAnimatedBlocks();

  // Reset next-piece queue
  initPieceQueue();
  if (nextPiecesEl) nextPiecesEl.style.display = "none";

  // Reset hold-piece state
  holdPiece = null;
  holdLocked = false;
  holdUsedCount = 0;
  if (!holdPanelEl) holdPanelEl = document.getElementById('hold-piece-panel');
  if (holdPanelEl) holdPanelEl.style.display = "none";

  // Reset mining feedback state
  miningShakeActive = false;
  miningShakeBlock = null;
  dustParticles.forEach((p) => scene.remove(p.mesh));
  dustParticles = [];

  // Reset line-clear state
  lineClearInProgress = false;
  lineClearFlashBlocks = [];
  lineClearPendingYs = [];
  bannerTimer = 0;
  if (lineClearBannerEl) lineClearBannerEl.style.display = "none";

  // Reset combo state
  comboCount = 0;
  lastClearTime = -1;
  comboBannerTimer = 0;
  if (comboBannerEl) comboBannerEl.style.display = "none";
  lastClearWasTetris = false;
  if (typeof lastClearWasDifficult !== 'undefined') lastClearWasDifficult = false;

  // Reset player
  if (controls) {
    controls.getObject().position.set(0, PLAYER_HEIGHT, 5);
    playerVelocity.set(0, 0, 0);
    playerPushVelocity.set(0, 0, 0);
    screenShakeActive = false;
    cascadeShakeActive = false;
    playerOnGround = false;
    canJump = false;
    moveForward = moveBackward = moveLeft = moveRight = false;
  }

  // Reset editor mode state
  if (isEditorMode && typeof cleanupEditorMode === "function") cleanupEditorMode();
  isEditorMode = false;
  moveUp = false;
  moveDown = false;
  const editorHudEl = document.getElementById("editor-hud");
  if (editorHudEl) editorHudEl.style.display = "none";

  // Reset game over / pause flags
  isGameOver = false;
  isPaused = false;

  // Hide Game Over and pause screens
  const gameOverEl = document.getElementById("game-over-screen");
  if (gameOverEl) gameOverEl.style.display = "none";
  const pauseScreenEl = document.getElementById("pause-screen");
  if (pauseScreenEl) pauseScreenEl.style.display = "none";
  // Hide screenshot button (re-shown when pointer lock acquired on next game start)
  const _ssBtnReset = document.getElementById('screenshot-btn');
  if (_ssBtnReset) _ssBtnReset.style.display = 'none';

  updateScoreHUD();

  function _showStartScreen() {
    // Return to start screen (hide mode select if it was open)
    const modeSelectEl = document.getElementById("mode-select");
    if (modeSelectEl) modeSelectEl.style.display = "none";
    blocker.style.display = "flex";
    instructions.style.display = "";
    crosshair.style.display = "none";
    if (scoreEl) scoreEl.style.display = "none";
    const invHudResetEl = document.getElementById("inventory-hud");
    if (invHudResetEl) invHudResetEl.style.display = "none";
    const musicBtnReset = document.getElementById("hud-music-mute-btn");
    if (musicBtnReset) musicBtnReset.style.display = "none";
    renderHighScoresStart();
  }

  if (_suppressStartScreen) return;
  if (_mgEligible && typeof miniGameShow === 'function') {
    miniGameShow(_showStartScreen);
  } else {
    _showStartScreen();
  }
}

// Battle mode Level 3 starting multiplier (tier 2 = Math.pow(1.1, 2))
const BATTLE_START_MULTIPLIER = Math.pow(1.1, 2); // ≈ 1.21
const BATTLE_START_TIER = 2; // Display "Level 3" at game start

/**
 * Show battle post-match summary screen (win/loss/draw).
 * Called from checkGameOver (loss), battle opponent-left handler (win), or
 * opponent_game_over message (win). Sets battleResult and isBattleMode = false.
 */
