// Main animation loop — called by init(), drives all per-frame updates.
// Requires: all other modules loaded first (loaded as part of main.js).

// ── Background-animation throttle state ──────────────────────────────────────
// Sky + obsidian shimmer run at 30fps; lava-light sort runs at 10fps.
// Keeping gameplay physics and particles at full 60fps.
let _bgThrottleAcc     = 0;       // accumulator for sky/obsidian (target: 1/30 s)
let _lavaLightAcc      = 0;       // accumulator for lava block sort (target: 1/10 s)
let _cachedLavaBlocks  = [];      // sorted nearest-lava cache, rebuilt at 10fps
const _BG_INTERVAL     = 1 / 30; // ~33 ms
const _LAVA_INTERVAL   = 1 / 10; // 100 ms
let _dangerEl          = null;    // cached once on first frame (DOM doesn't recreate it)
let _coopBonusOverlayTimer = null; // handle for coop-bonus-overlay hide delay

// ── Cap delta and apply replay speed scaling ──────────────────────────────────
function _computeDelta(rawDelta) {
  let delta = Math.min(rawDelta, 0.1);
  if (typeof isReplayMode !== 'undefined' && isReplayMode) {
    if (typeof _replayPaused !== 'undefined' && _replayPaused) return 0;
    if (typeof replaySpeedMultiplier !== 'undefined' && replaySpeedMultiplier !== 1) {
      return replaySpeedMultiplier > 1
        ? Math.min(delta * replaySpeedMultiplier, 0.3)
        : delta * replaySpeedMultiplier;
    }
  }
  return delta;
}

// ── Sky, lava uniforms, particles ─────────────────────────────────────────────
function updateEnvironment(delta, elapsedTime) {
  // Background animations throttled to 30fps — imperceptible for slow sky / shimmer changes.
  _bgThrottleAcc += delta;
  const _bgTick = _bgThrottleAcc >= _BG_INTERVAL;
  if (_bgTick) {
    updateSky(elapsedTime, _bgThrottleAcc);
    // Parallax scrolling disabled on Low quality (static background).
    if (graphicsQualityTier !== 'low' && typeof updateParallaxBg === 'function') updateParallaxBg(_bgThrottleAcc);
    // Animated board background canvas (disabled on Low quality).
    if (graphicsQualityTier !== 'low' && typeof updateBoardBg === 'function') updateBoardBg(_bgThrottleAcc);
    // Underground ambient dimming + fog shift (overrides sky values when camera is below surface).
    if (typeof applyUndergroundDepth === 'function' && camera) {
      applyUndergroundDepth(camera.position.y);
    }
    _bgThrottleAcc = 0;
  }

  // Animate lava/ice: update shared time uniforms (every frame for smooth shader animation)
  lavaUniforms.uTime.value = elapsedTime;
  iceUniforms.uTime.value  = elapsedTime;

  // Advance animated block skin frame colors (6 animated skins).
  if (typeof updateAnimatedBlockSkins === 'function') updateAnimatedBlockSkins(elapsedTime);

  // Rebuild nearest-lava cache at 10fps — block positions change rarely.
  _lavaLightAcc += delta;
  if (_lavaLightAcc >= _LAVA_INTERVAL) {
    const camPos = camera.position;
    _cachedLavaBlocks.length = 0;
    worldGroup.children.forEach(child => {
      if (child.userData && child.userData.materialType === 'lava') {
        _cachedLavaBlocks.push(child);
      }
    });
    _cachedLavaBlocks.sort((a, b) =>
      a.position.distanceToSquared(camPos) - b.position.distanceToSquared(camPos)
    );
    _lavaLightAcc = 0;
  }
  // Apply pulse intensity every frame for smooth glow (cheap — no scene iteration)
  const pulse = 1.2 * (0.85 + 0.30 * Math.sin(elapsedTime * 4.4));
  for (let i = 0; i < LAVA_LIGHT_COUNT; i++) {
    if (i < _cachedLavaBlocks.length) {
      const lp = _cachedLavaBlocks[i].position;
      lavaLights[i].position.set(lp.x, lp.y + 1, lp.z);
      lavaLights[i].intensity = pulse;
    } else {
      lavaLights[i].intensity = 0;
    }
  }

  // Animate obsidian shimmer: throttled to 30fps alongside sky (0.8 Hz pulse — indistinguishable above 20fps)
  if (_bgTick && obsidianBlocks.length > 0) {
    for (let _oi = 0; _oi < obsidianBlocks.length; _oi++) {
      const _ob = obsidianBlocks[_oi];
      if (!_ob.material) continue;
      const _t = Math.sin(elapsedTime * 1.6 + _ob.userData.shimmerOffset) * 0.5 + 0.5;
      _ob.material.emissive.setRGB(
        (0x3d / 255) * _t * 0.35,
        0,
        (0x66 / 255) * _t * 0.35
      );
      _ob.material.needsUpdate = true;
    }
  }
}

// ── Mode-specific timer ticks ─────────────────────────────────────────────────
// Only runs when !isGameOver && !isPaused && !isTutorialPaused.
function updateModeTimers(delta) {
  // Fire recorded inputs during replay playback
  if (typeof replayTick === 'function' && typeof isReplayMode !== 'undefined' && isReplayMode) {
    replayTick(typeof gameElapsedSeconds !== 'undefined' ? gameElapsedSeconds : 0);
  }

  // Tick ghost replay overlay (only during live gameplay, not during replay watch)
  if (typeof ghostReplayTick === 'function' &&
      !(typeof isReplayMode !== 'undefined' && isReplayMode)) {
    ghostReplayTick(delta);
  }

  // Tick endless survival timers (speed escalation + modifier activation)
  if (isEndlessSurvivalMode && typeof tickEndlessSurvival === 'function') {
    tickEndlessSurvival(delta);
  }

  // Tick marathon-endless garbage injection timer
  if (isMarathonEndlessMode && typeof tickMarathonEndlessGarbage === 'function') {
    tickMarathonEndlessGarbage(delta);
  }

  // Tick the sprint timer (starts only once the first piece begins falling)
  if (isSprintMode && sprintTimerActive && !sprintComplete) {
    sprintElapsedMs += delta * 1000;
  }

  // Cheese Race: tick elapsed timer
  if (isCheeseRaceMode && cheeseRaceTimerActive && !cheeseRaceComplete) {
    cheeseRaceElapsedMs += delta * 1000;
  }

  // Dig Mode: tick timer and inject garbage rows
  if (isDigMode && digTimerActive && !isGameOver) {
    if (typeof tickDigMode === 'function') tickDigMode(delta * 1000);
  }

  // Ultra Mode: tick countdown timer
  if (isUltraMode && ultraTimerActive && !ultraComplete) {
    ultraRemainingMs -= delta * 1000;
    if (ultraRemainingMs <= 0) {
      ultraRemainingMs = 0;
      if (typeof triggerUltraComplete === 'function') triggerUltraComplete();
    } else if (!ultraBonusActive && ultraRemainingMs <= ULTRA_BONUS_THRESHOLD_MS) {
      // Activate Ultra bonus for final 60 seconds
      ultraBonusActive = true;
      if (speedUpBannerEl) {
        speedUpBannerEl.textContent = '⚡ ULTRA BONUS! 2.0\xd7';
        speedUpBannerEl.style.color = '#ff6600';
        speedUpBannerEl.style.display = 'block';
        speedUpBannerTimer = 2.5;
      }
      updateScoreHUD();
    }
  }

  // Daily challenge: end the game when 200 lines are cleared
  if (isDailyChallenge && dailyTimerActive && !isGameOver &&
      linesCleared >= DAILY_LINE_LIMIT) {
    if (typeof triggerGameOver === "function") triggerGameOver();
  }

  // Tick the combo challenge countdown timer
  if (isComboChallenge && comboChallengeTimerActive && !comboChallengeComplete) {
    comboChallengeRemainingMs -= delta * 1000;
    if (comboChallengeRemainingMs <= 0) {
      comboChallengeRemainingMs = 0;
      if (typeof triggerComboChallengeComplete === 'function') triggerComboChallengeComplete();
    }
  }

  // Tick the countdown mode timer and speed stage escalation
  if (isCountdownMode && countdownTimerActive && !countdownComplete) {
    countdownElapsedMs += delta * 1000;

    // Advance stage timer
    if (countdownSpeedStage < COUNTDOWN_TOTAL_STAGES) {
      countdownStageTimer += delta;
      const timeUntilNext = COUNTDOWN_STAGE_INTERVAL - countdownStageTimer;

      // Warning flash at 5 seconds before each stage advance
      const shouldWarn = timeUntilNext <= COUNTDOWN_WARNING_SECS && timeUntilNext > 0;
      if (shouldWarn !== countdownWarningActive) {
        countdownWarningActive = shouldWarn;
        if (typeof updateCountdownStageHUD === 'function') updateCountdownStageHUD();
        // Trigger edge flash and warning sound when warning starts
        if (shouldWarn) {
          const cdFlashEl = document.getElementById('countdown-edge-flash');
          if (cdFlashEl) {
            cdFlashEl.classList.remove('cd-stage-flash');
            cdFlashEl.classList.add('cd-warning-pulse');
          }
          if (typeof playCountdownStageWarning === 'function') playCountdownStageWarning();
        } else {
          const cdFlashEl = document.getElementById('countdown-edge-flash');
          if (cdFlashEl) cdFlashEl.classList.remove('cd-warning-pulse');
        }
      }

      // Advance stage when timer hits 30s
      if (countdownStageTimer >= COUNTDOWN_STAGE_INTERVAL) {
        if (typeof countdownAdvanceStage === 'function') countdownAdvanceStage();
      }
    }
  }

  // Tick the blitz countdown timer
  if (isBlitzMode && blitzTimerActive && !blitzComplete) {
    blitzRemainingMs -= delta * 1000;
    if (blitzRemainingMs <= 0) {
      blitzRemainingMs = 0;
      if (typeof triggerBlitzComplete === "function") triggerBlitzComplete();
    } else if (!blitzBonusActive && blitzRemainingMs <= BLITZ_BONUS_THRESHOLD_MS) {
      // Activate Blitz bonus for final 30 seconds
      blitzBonusActive = true;
      // Show visual cue via speed-up banner
      if (speedUpBannerEl) {
        speedUpBannerEl.textContent = "⚡ BLITZ BONUS! 2.0×";
        speedUpBannerEl.style.color = "#ffd700";
        speedUpBannerEl.style.display = "block";
        speedUpBannerTimer = 2.5;
      }
      updateScoreHUD();
    }
  }
}

// ── Music tempo, mood transitions ─────────────────────────────────────────────
// Only runs when !isGameOver && !isPaused && !isTutorialPaused.
function updateAudio(delta) {
  // Update environmental soundscapes based on biome
  if (typeof updateEnvironmentalAudio === 'function') {
    var _envBiome = (typeof activeBiomeId !== 'undefined') ? activeBiomeId : null;
    updateEnvironmentalAudio(_envBiome, 0);
  }

  // ── Ambient mood decision — maps game state to audio mood ──────────────
  // Intensity tiers: Calm (<33%), Tension (33–66%), High (66–80%), Danger (>80%)
  if (typeof setAmbientMood === 'function' && typeof getMaxBlockHeight === 'function') {
    var _heightRatio = getMaxBlockHeight() / GAME_OVER_HEIGHT;
    var _bossActive = (typeof getBossState === 'function') &&
      (getBossState() === 'active' || getBossState() === 'intro' || getBossState() === 'transition');
    var _stormActive = (typeof pieceStormActive !== 'undefined') && pieceStormActive;
    var _creeperFuseActive = (typeof _creeperFusing !== 'undefined') && _creeperFusing;

    if (_bossActive || _stormActive || _creeperFuseActive || _heightRatio >= 0.80) {
      setAmbientMood('danger');  // Critical danger tier (>80% or boss/storm/creeper)
    } else if (_heightRatio >= 0.66) {
      setAmbientMood('intense'); // High intensity tier (66–80%)
    } else if (_heightRatio >= 0.33) {
      setAmbientMood('tense');   // Tension tier (33–66%)
    } else {
      setAmbientMood('calm');    // Calm tier (<33%)
    }

    // Update music tempo based on stack height and game speed
    if (typeof updateMusicTempo === 'function') {
      var _speedMult = (typeof difficultyMultiplier !== 'undefined') ? difficultyMultiplier : 1.0;
      updateMusicTempo(_heightRatio, _speedMult);
      // Notify jukebox of speed changes (no-op in auto mode)
      if (typeof jukeboxAutoSwitch === 'function') jukeboxAutoSwitch(_speedMult);
    }

    // Update level-based tempo and pulse layer (BPM = 80 + level*5, capped 160)
    if (typeof updateMusicLevel === 'function' && typeof lastDifficultyTier !== 'undefined') {
      updateMusicLevel(lastDifficultyTier + 1);
    }

    // ── Danger edge glow — red pulse on top edge when stack is high ──────────
    if (!_dangerEl) _dangerEl = document.getElementById("board-danger-overlay");
    if (_dangerEl && typeof boardGlowIntensity !== 'undefined') {
      var _dangerZoneStart = GAME_OVER_HEIGHT - 4;
      var _maxH = getMaxBlockHeight();
      if (boardGlowIntensity <= 0 || isGameOver) {
        _dangerEl.className = '';
      } else if (_maxH >= _dangerZoneStart) {
        var _dangerFill = Math.min((_maxH - _dangerZoneStart) / 4, 1.0);
        _dangerEl.className = _dangerFill >= 0.5 ? 'danger-high' : 'danger-low';
        _dangerEl.style.opacity = String(Math.min(boardGlowIntensity, 1.0));
      } else {
        _dangerEl.className = '';
      }
    }
  }
}

// ── Power-up timers ───────────────────────────────────────────────────────────
// Only runs when !isGameOver && !isPaused && !isTutorialPaused.
function updatePowerups(delta) {
  // Tick ice bridge slow timer
  if (iceBridgeSlowActive) {
    iceBridgeSlowTimer -= delta;
    if (iceBridgeSlowTimer <= 0) {
      iceBridgeSlowActive = false;
      iceBridgeSlowTimer  = 0;
    }
  }

  // Tick Slow Down power-up timer
  if (slowDownActive) {
    slowDownTimer -= delta;
    if (slowDownTimer <= 0) {
      slowDownActive = false;
      slowDownTimer  = 0;
    }
  }

  // Tick Magnet power-up: auto-mine nearest block within 5 units, once per second
  if (magnetActive) {
    magnetTimer -= delta;
    if (magnetTimer <= 0) {
      magnetActive      = false;
      magnetTimer       = 0;
      magnetLastPullTime = 0;
    } else if (controls && controls.isLocked) {
      magnetLastPullTime += delta;
      if (magnetLastPullTime >= 1.0) {
        magnetLastPullTime = 0;
        const playerPos = controls.getObject().position;
        const MAGNET_RANGE = 5;
        let nearestDist = Infinity;
        let nearestBlock = null;
        worldGroup.children.forEach(function (obj) {
          if (!obj.userData.isBlock || !obj.userData.gridPos) return;
          const dx = playerPos.x - obj.position.x;
          const dy = playerPos.y - obj.position.y;
          const dz = playerPos.z - obj.position.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < MAGNET_RANGE && dist < nearestDist) {
            nearestDist  = dist;
            nearestBlock = obj;
          }
        });
        if (nearestBlock) {
          spawnDustParticles(nearestBlock, { breakBurst: true });
          blocksMined++;
          if (isCoopMode) coopMyBlocksMined++;
          const oType = nearestBlock.userData.objectType;
          const mName = nearestBlock.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
          if (mName) addToInventory(nearestBlock.material.color.getStyle());
          addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
          // Seasonal event: track void-adjacent mining
          if (typeof recordVoidAdjacentMined === 'function' && nearestBlock.userData.gridPos &&
              typeof isAdjacentToVoid === 'function' && isAdjacentToVoid(nearestBlock.userData.gridPos)) {
            recordVoidAdjacentMined();
          }
          unregisterBlock(nearestBlock);
          disposeBlock(nearestBlock);
          worldGroup.remove(nearestBlock);
          if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
        }
      }
    }
  }

  // Tick Time Freeze power-up timer
  if (timeFreezeActive) {
    timeFreezeTimer -= delta;
    if (timeFreezeTimer <= 0) {
      timeFreezeActive = false;
      timeFreezeTimer  = 0;
      _applyTimeFreezeGlow(false);
      if (typeof updatePowerupHUD === "function") updatePowerupHUD();
    }
  }

  // Tick Fortress power-up timer
  if (fortressActive) {
    fortressTimer -= delta;
    if (fortressTimer <= 0) {
      fortressActive = false;
      fortressTimer  = 0;
      showCraftedBanner("Fortress expired.");
      if (typeof updatePowerupHUD === "function") updatePowerupHUD();
    }
  }
}

// ── Piece movement, line clear, world physics ─────────────────────────────────
// Only runs when !isGameOver && !isPaused && !isTutorialPaused.
function updatePhysics(delta, elapsedTime) {
  // Suppress piece spawning in editor mode or during tutorial spawn-suppressed steps
  const _tutSpawnSuppressed = typeof isTutorialSpawnSuppressed === 'function' && isTutorialSpawnSuppressed() && fallingPieces.length > 0;
  if (!isEditorMode) {
    const _stormSpawnInterval = pieceStormActive ? SPAWN_INTERVAL * 0.5 : SPAWN_INTERVAL;
    spawnTimer += delta;
    if (spawnTimer > _stormSpawnInterval && !_tutSpawnSuppressed) {
      spawnFallingPiece();
      if (pieceStormActive) {
        triggerLightningFlash();
        if (typeof playStormSwoosh === "function") playStormSwoosh();
      }
      spawnTimer = 0;
      // Update puzzle HUD after each spawn
      if ((isPuzzleMode || isCustomPuzzleMode) && typeof updatePuzzleHUD === "function") updatePuzzleHUD();
    }
    updateLineClear(delta);
    if (typeof updateBlockPhysics === 'function') updateBlockPhysics(delta);
    if (typeof updateParticles === 'function') updateParticles(delta);
    // Training mode: update speed drill HUD every frame
    if (typeof isTrainingMode !== 'undefined' && isTrainingMode && typeof updateTrainingSpeedHUD === 'function') {
      updateTrainingSpeedHUD();
    }
    // Weather disabled on Low/Medium; seasonal particles disabled on Low only.
    if (graphicsQualityTier !== 'low' && graphicsQualityTier !== 'medium' &&
        typeof updateWeather === 'function') updateWeather(delta);
    if (graphicsQualityTier !== 'low' &&
        typeof updateSeasonalParticles === 'function') updateSeasonalParticles(delta);
    if (typeof updateHazardBlocks === 'function') updateHazardBlocks(delta);
    if (typeof tickDungeonModifiers === 'function') tickDungeonModifiers(delta);
    if (typeof tickBossBattle === 'function') tickBossBattle(delta);
    updateFallingPieces(delta);
    if (isBattleMode && typeof battleHud !== 'undefined') battleHud.tick(delta);
    if (isBattleMode && typeof checkBattleScoreRace === 'function') checkBattleScoreRace(delta);
    // Netcode: advance rollback blend and opponent interpolation each frame
    if ((isBattleMode || isCoopMode) && typeof netcode !== 'undefined') {
      netcode.tickRollback();
      netcode.tickInterpolation(delta * 1000, null); // renderFn wired per-mode in init handlers
    }
    // Co-op: tick highlight zone timers
    if (isCoopMode && typeof tickCoopHighlight === 'function') {
      tickCoopHighlight(delta);
    }
    // Co-op: periodic garbage injection — queue one rubble row when timer fires
    if (isCoopMode && coopGarbageTimer > 0) {
      coopGarbageTimer -= delta;
      if (coopGarbageTimer <= 0) {
        var _diffCfg = typeof COOP_DIFFICULTY_SETTINGS !== 'undefined' ? COOP_DIFFICULTY_SETTINGS : null;
        var _garbageInterval = (_diffCfg && _diffCfg[coopDifficulty])
          ? _diffCfg[coopDifficulty].garbageInterval : 0;
        if (_garbageInterval > 0 && typeof queueGarbage === 'function') {
          queueGarbage(1, (Math.random() * 0xFFFFFFFF) >>> 0);
        }
        coopGarbageTimer = _garbageInterval > 0 ? _garbageInterval : 0;
      }
    }
    updateLandingRings(delta);
    updateSnapAnimations(delta);
    updateTrails(delta, elapsedTime);
    updateAuras(delta, camera);
    updateDifficulty(delta);
    updateTreeRespawn(delta, elapsedTime);
    if (typeof updateEventEngine === "function") updateEventEngine(delta);
    if (typeof updateTutorial === "function") updateTutorial(delta);
  }
}

// ── Player movement, mining, HUD ticks ───────────────────────────────────────
function updatePlayerControls(delta, elapsedTime, time) {
  if (controls && controls.isLocked === true && !isGameOver) {
    // Tick puzzle time limit every frame (timed_score mode)
    if (typeof tickPuzzleTimeLimit === "function") tickPuzzleTimeLimit(delta);

    // Tick survival timer and refresh HUD once per second
    if (gameTimerRunning) {
      gameElapsedSeconds += delta;
      const currentSecond = isBlitzMode
        ? Math.ceil(blitzRemainingMs / 1000)
        : isUltraMode
          ? Math.ceil(ultraRemainingMs / 1000)
        : isSprintMode
          ? Math.floor(sprintElapsedMs / 1000)
        : isCheeseRaceMode
          ? Math.floor(cheeseRaceElapsedMs / 1000)
        : isCountdownMode
            ? Math.floor(countdownElapsedMs / 1000)
            : Math.floor(gameElapsedSeconds);
      if (currentSecond !== lastHudSecond) {
        lastHudSecond = currentSecond;
        updateScoreHUD();
        if (typeof achOnSurvivalTime === "function") achOnSurvivalTime(gameElapsedSeconds);
        // Custom puzzle: check time/score-based win conditions each second
        if (isCustomPuzzleMode && typeof checkPuzzleConditions === "function") {
          checkPuzzleConditions();
          if (typeof updatePuzzleHUD === "function") updatePuzzleHUD();
        }
        // Built-in puzzle: refresh HUD each second (covers timed_score countdown)
        if (isPuzzleMode && typeof updatePuzzleHUD === "function") updatePuzzleHUD();
      }
    }

    const playerPosition = controls.getObject().position;

    if (isEditorMode) {
      // Free-fly: vertical velocity driven by Space (up) / Shift (down) keys
      playerVelocity.y = moveUp ? MOVEMENT_SPEED : (moveDown ? -MOVEMENT_SPEED : 0);
    } else {
      if (!playerOnGround) playerVelocity.y -= GRAVITY * delta;
    }
    const _movWmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
    const _modSpeedMult = _movWmod ? _movWmod.playerSpeedMult : 1.0;
    const _iceEffect = playerStandingOnIce || (_movWmod && _movWmod.iceAllBlocks);
    const speedDelta = MOVEMENT_SPEED * _modSpeedMult * (_iceEffect ? 1.2 : 1.0) * delta;
    const _gpFwd  = typeof gpMoveForward  !== 'undefined' && gpMoveForward;
    const _gpBack = typeof gpMoveBackward !== 'undefined' && gpMoveBackward;
    const _gpLeft = typeof gpMoveLeft     !== 'undefined' && gpMoveLeft;
    const _gpRgt  = typeof gpMoveRight    !== 'undefined' && gpMoveRight;
    if (moveForward  || _gpFwd)  controls.moveForward(speedDelta);
    if (moveBackward || _gpBack) controls.moveForward(-speedDelta);
    if (moveLeft     || _gpLeft) controls.moveRight(-speedDelta);
    if (moveRight    || _gpRgt)  controls.moveRight(speedDelta);
    playerPosition.y += playerVelocity.y * delta;
    // Prevent flying below ground in editor mode
    if (isEditorMode && playerPosition.y < PLAYER_HEIGHT) {
      playerPosition.y = PLAYER_HEIGHT;
      if (playerVelocity.y < 0) playerVelocity.y = 0;
    }

    // Apply lateral push impulse from nearby landing pieces
    if (playerPushVelocity.lengthSq() > 0.01) {
      playerPosition.x += playerPushVelocity.x * delta;
      playerPosition.z += playerPushVelocity.z * delta;
      playerPushVelocity.multiplyScalar(Math.pow(PUSH_DECAY, delta));
      if (playerPushVelocity.lengthSq() < 0.01) playerPushVelocity.set(0, 0, 0);
    }

    // Screen shake when pushed
    if (screenShakeActive) {
      const shakeAge = elapsedTime - screenShakeStart;
      if (shakeAge < SCREEN_SHAKE_DURATION) {
        const intensity = (1 - shakeAge / SCREEN_SHAKE_DURATION) * 0.12;
        camera.position.x += (Math.random() - 0.5) * intensity;
        camera.position.y += (Math.random() - 0.5) * intensity;
      } else {
        screenShakeActive = false;
      }
    }

    // Combo screen shake — decays over 0.18s
    if (comboShakeActive) {
      const _cShakeDur = 0.18;
      const _cAge = elapsedTime - comboShakeStart;
      if (_cAge < _cShakeDur) {
        const _ci = (1 - _cAge / _cShakeDur) * comboShakeStrength;
        camera.position.x += (Math.random() - 0.5) * _ci;
        camera.position.y += (Math.random() - 0.5) * _ci;
      } else {
        comboShakeActive = false;
      }
    }

    if (!isEditorMode) checkPlayerCollision(playerVelocity.y * delta);

    // Safety: below bedrock floor → respawn at surface to prevent softlock.
    // Threshold is -32 to allow full underground traversal (bedrock at Y=-29.5).
    if (isSurvivalMode && controls && controls.isLocked && !isGameOver) {
      if (controls.getObject().position.y < -32) {
        returnPlayerToSurface();
      }
    }

    // Cave mouth proximity: show interaction prompt when player is nearby.
    if (isSurvivalMode && typeof updateCaveMouthProximity === 'function') {
      updateCaveMouthProximity();
    }

    updateTargeting();
    if (isEditorMode && typeof updateEditorGhost === "function") updateEditorGhost();
    if (isEditorMode && typeof tickEditorDrag === "function") tickEditorDrag();
    if (isEditorMode && typeof tickEditorAutosave === "function") tickEditorAutosave(delta);

    if (pickaxeGroup) {
      const defaultRotationZ = Math.PI / 8;
      if (isMining) {
        const animElapsedTime = elapsedTime - miningAnimStartTime;
        if (animElapsedTime < PICKAXE_ANIMATION_DURATION) {
          const swingPhase =
            (animElapsedTime / PICKAXE_ANIMATION_DURATION) * Math.PI;
          pickaxeGroup.rotation.z =
            defaultRotationZ -
            Math.sin(swingPhase) * PICKAXE_ANIMATION_ANGLE;
        } else {
          isMining = false;
          pickaxeGroup.rotation.z = defaultRotationZ;
        }
      } else {
        pickaxeGroup.rotation.z = defaultRotationZ;
      }
    }

    // Mining shake update
    if (miningShakeActive && miningShakeBlock) {
      const shakeAge = elapsedTime - miningShakeStart;
      if (shakeAge < MINING_SHAKE_DURATION) {
        if (!miningShakeBlock.userData.basePosition) {
          miningShakeBlock.userData.basePosition =
            miningShakeBlock.position.clone();
        }
        const phase = (shakeAge / MINING_SHAKE_DURATION) * Math.PI;
        const offset = Math.sin(phase) * MINING_SHAKE_AMOUNT;
        miningShakeBlock.position.x =
          miningShakeBlock.userData.basePosition.x + offset;
        miningShakeBlock.position.z =
          miningShakeBlock.userData.basePosition.z + offset * 0.5;
      } else {
        if (miningShakeBlock.userData.basePosition) {
          miningShakeBlock.position.copy(
            miningShakeBlock.userData.basePosition
          );
          miningShakeBlock.userData.basePosition = null;
        }
        miningShakeActive = false;
        miningShakeBlock = null;
      }
    }

    updateDustParticles(delta);
    updateCraftingBanner(delta);
    if (typeof updateOreCrafting === 'function') updateOreCrafting(delta);
    // Tick co-op bonus banner fade-out
    if (coopBonusBannerTimer > 0) {
      coopBonusBannerTimer -= delta;
      if (coopBonusBannerTimer <= 0) {
        coopBonusBannerTimer = 0;
        var _bonusEl = document.getElementById('coop-bonus-overlay');
        if (_bonusEl) { _bonusEl.style.opacity = '0'; }
        if (_coopBonusOverlayTimer) clearTimeout(_coopBonusOverlayTimer);
        _coopBonusOverlayTimer = setTimeout(function () {
          _coopBonusOverlayTimer = null;
          var _bEl = document.getElementById('coop-bonus-overlay');
          if (_bEl) _bEl.style.display = 'none';
        }, 1100);
      } else if (coopBonusBannerTimer < 1.0) {
        // Start fading in the last second
        var _bonusEl2 = document.getElementById('coop-bonus-overlay');
        if (_bonusEl2) _bonusEl2.style.opacity = String(coopBonusBannerTimer);
      }
    }
  } else {
    playerVelocity.x = 0;
    playerVelocity.z = 0;
    unhighlightTarget();
    targetedBlock = null;
    miningProgress = 0;
    crosshair.classList.remove("target-locked");
    isMining = false;
    if (pickaxeGroup) pickaxeGroup.rotation.z = Math.PI / 8;
  }
}

// ── Co-op broadcast ───────────────────────────────────────────────────────────
function updateNetcode(time) {
  // Co-op: broadcast local max block height every 2 s
  if (isCoopMode && !isGameOver && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    if (time - coopHeightBroadcastLastTime >= 2000) {
      coopHeightBroadcastLastTime = time;
      const _localMaxY = typeof getMaxBlockHeight === 'function' ? getMaxBlockHeight() : 0;
      coop.send({ type: 'height', maxY: _localMaxY });
    }
    // Decay partner status dot: lagging after 3 s, disconnected after 6 s
    const _partnerAge = time - coopPartnerLastSeenTime;
    const _newStatus = _partnerAge > 6000 ? 'disconnected' : _partnerAge > 3000 ? 'lagging' : 'connected';
    if (_newStatus !== coopPartnerStatus) {
      coopPartnerStatus = _newStatus;
      if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
    }
  }

  // Co-op: broadcast local position every ~100 ms (rAF-aligned, skip if unchanged)
  if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    if (time - _coopPosBroadcastLastTime >= 100) {
      const _camObj = controls ? controls.getObject() : null;
      if (_camObj) {
        const _bx = _camObj.position.x;
        const _by = _camObj.position.y;
        const _bz = _camObj.position.z;
        const _bRotY = _camObj.rotation.y;
        const _bRotX = camera.rotation.x;
        const _prev  = _coopPosLastSent;
        if (!_prev || _prev.x !== _bx || _prev.y !== _by || _prev.z !== _bz ||
            _prev.rotY !== _bRotY || _prev.rotX !== _bRotX) {
          coop.send({ type: 'pos', x: _bx, y: _by, z: _bz, rotY: _bRotY, rotX: _bRotX });
          _coopPosLastSent = { x: _bx, y: _by, z: _bz, rotY: _bRotY, rotX: _bRotX };
        }
        _coopPosBroadcastLastTime = time;
      }
    }
  }

  // Co-op: interpolate remote avatar
  if (typeof coopAvatar !== 'undefined') coopAvatar.tick();
}

// ── Post-render earthquake camera shake ───────────────────────────────────────
// Applied after the render pass to avoid post-processing (SSAO) conflicts.
function _updateEarthquakeShake() {
  if (earthquakeActive) {
    const t   = clock.getElapsedTime();
    const newX = Math.sin(t * 18.3) * 0.15;
    const newY = Math.sin(t * 23.7 + 1.2) * 0.15;
    camera.position.x += newX - _eqShakeOffX;
    camera.position.y += newY - _eqShakeOffY;
    _eqShakeOffX = newX;
    _eqShakeOffY = newY;
  } else if (_eqShakeOffX !== 0 || _eqShakeOffY !== 0) {
    // Undo last offset when earthquake just ended
    camera.position.x -= _eqShakeOffX;
    camera.position.y -= _eqShakeOffY;
    _eqShakeOffX = 0;
    _eqShakeOffY = 0;
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Yield to local multiplayer — it runs its own RAF loop.
  if (typeof window !== 'undefined' && window.isLocalMultiActive) return;

  try {
  const time = performance.now();
  const rawDelta = clock.getDelta();

  // ── Process held nudge keys (DAS/ARR) at the very first moment of this frame
  // to minimise input-to-render latency (target < 16 ms at 60 fps).
  if (typeof processDasInputs === 'function' && !isGameOver && !isPaused) {
    processDasInputs(rawDelta * 1000);
  }
  const delta = _computeDelta(rawDelta);
  const elapsedTime = clock.getElapsedTime();

  updateEnvironment(delta, elapsedTime);

  // Poll gamepad each frame so movement flags and one-shot actions stay in sync.
  if (typeof pollGamepad === 'function') pollGamepad();

  if (!isGameOver && !isPaused && !(typeof isTutorialPaused === 'function' && isTutorialPaused())) {
    updateModeTimers(delta);
    updateAudio(delta);
    updatePowerups(delta);
    updatePhysics(delta, elapsedTime);
  }

  updateDangerWarning();
  if (typeof updateFinesseHUDVisibility === 'function') updateFinesseHUDVisibility();

  updatePlayerControls(delta, elapsedTime, time);
  updateNetcode(time);

  // Game-over sequence animation update (runs while isGameOver, before render)
  if (typeof window._goSeqUpdateFn === 'function') window._goSeqUpdateFn(delta);

  updatePowerupOverlays();
  updatePostProcessing(delta);
  if (typeof updateFpsMonitor === 'function') updateFpsMonitor(time);
  if (typeof updateDebugProfiler === 'function') updateDebugProfiler(time);

  if (composer) {
    composer.render(delta);
  } else {
    renderer.render(scene, camera);
  }

  // Co-op: render CSS2D nameplate layer on top
  if (typeof coopAvatar !== 'undefined') coopAvatar.renderLabels();

  // Earthquake camera shake: sinusoidal position offset applied post-render
  // to avoid post-processing (SSAO) conflicts. Max ±0.15 units on X/Y.
  _updateEarthquakeShake();

  lastTime = time;
  } catch (err) {
    // Safety net: log frame errors without crashing the RAF loop.
    // MineErrorReporter.showOverlay() is intentionally NOT called here —
    // transient frame errors (e.g. a single bad tick) should not interrupt
    // gameplay. The global window.onerror handler will surface truly fatal errors.
    if (typeof MineErrorReporter !== 'undefined') {
      MineErrorReporter.log('Game loop error: ' + (err && err.message ? err.message : String(err)), err);
    }
    if (typeof window !== 'undefined' && (location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' || location.search.indexOf('dev=1') !== -1)) {
      console.error('[game-loop] Frame error:', err);
    }
  }
}
