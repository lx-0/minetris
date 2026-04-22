// Mode selection screen — show/hide and populate the mode card panel.
// Requires: state.js, progression/*, modes/* loaded first.

// ── One-time boot shim: rewrite stale sprint_mini lastMode ───────────────────
(function _shimSprintMiniLastMode() {
  try {
    if (localStorage.getItem('mineCtris_lastMode') === 'sprint_mini') {
      localStorage.setItem('mineCtris_lastMode', 'sprint');
    }
  } catch (_) {}
})();

    function showModeSelect(highlightMode) {
      const modeSelectEl = document.getElementById("mode-select");
      if (!modeSelectEl) return;
      // If coming from a mini-game completion overlay (isGameOver=true but the
      // standard resetGame/start-screen path was skipped), silently reset state
      // so that picking any mode card starts a fresh game.
      if (typeof isGameOver !== 'undefined' && isGameOver && typeof resetGame === 'function') {
        resetGame({ suppressStartScreen: true });
      }
      // Populate Tutorial card state
      (function () {
        var tutCard = document.getElementById('mode-card-tutorial');
        var tutPbEl = document.getElementById('mode-pb-tutorial');
        if (!tutCard) return;
        var done = false;
        try { done = localStorage.getItem('mineCtris_tutorialDone') === '1'; } catch (_) {}
        if (done) {
          tutCard.classList.add('mode-card-tutorial-done');
          tutCard.classList.remove('mode-card-tutorial-new');
          if (tutPbEl) tutPbEl.textContent = '\u2713 Completed \u2014 click to replay';
        } else {
          tutCard.classList.remove('mode-card-tutorial-done');
          tutCard.classList.add('mode-card-tutorial-new');
          if (tutPbEl) tutPbEl.textContent = 'Start here \u2014 new player guide';
        }
      })();
      // Update co-op achievement count on mode card
      if (typeof updateCoopModeCardAch === 'function') updateCoopModeCardAch();
      // Populate Classic personal best
      const pbEl = document.getElementById("mode-pb-classic");
      if (pbEl) {
        const scores = loadHighScores();
        if (scores.length > 0) {
          const best = scores[0];
          pbEl.textContent = "Best: " + best.score + " (" + fmtTime(best.timeSurvived) + ")";
        } else {
          pbEl.textContent = "";
        }
      }
      // Populate Sprint personal best
      const sprintPbEl = document.getElementById("mode-pb-sprint");
      if (sprintPbEl) {
        const sprintBest = loadSprintBest();
        sprintPbEl.textContent = sprintBest
          ? "Best: " + fmtSprintTime(sprintBest.timeMs)
          : "";
      }
      // Populate Blitz personal best
      const blitzPbEl = document.getElementById("mode-pb-blitz");
      if (blitzPbEl) {
        const blitzBest = loadBlitzBest();
        blitzPbEl.textContent = blitzBest ? "Best: " + blitzBest.score : "";
      }
      // Populate Countdown personal best
      const countdownPbEl = document.getElementById("mode-pb-countdown");
      if (countdownPbEl && typeof loadCountdownBest === 'function') {
        const cdBest = loadCountdownBest();
        if (cdBest) {
          const cdm = Math.floor(cdBest.timeSecs / 60);
          const cds = (cdBest.timeSecs % 60).toString().padStart(2, "0");
          countdownPbEl.textContent = "Best: " + cdm + ":" + cds + " (Stage " + cdBest.stage + ")";
        } else {
          countdownPbEl.textContent = "";
        }
      }
      // Populate Marathon personal best (reflects selected length toggle)
      const marathonPbEl = document.getElementById("mode-pb-marathon");
      if (marathonPbEl) {
        const marActiveBtn = document.querySelector('.mar-len-btn-active');
        const marLen = marActiveBtn ? marActiveBtn.getAttribute('data-mar-len') : 'classic';
        if (marLen === 'endless') {
          const meBest = typeof loadMarathonEndlessBest === 'function' ? loadMarathonEndlessBest() : null;
          marathonPbEl.textContent = meBest ? "Best: " + meBest.linesCleared + " lines" : "";
        } else {
          const mBest = typeof loadMarathonBest === 'function' ? loadMarathonBest() : null;
          marathonPbEl.textContent = mBest ? "Best: Level " + mBest.level + " (" + mBest.score + ")" : "";
        }
      }
      // Restore last-picked marathon length (flag prevents auto-launch on programmatic click)
      (function _restoreMarathonLen() {
        try {
          const saved = localStorage.getItem('mineCtris_marathonLastLength');
          if (saved === 'endless') {
            const btn = document.querySelector('.mar-len-btn[data-mar-len="endless"]');
            if (btn) {
              _marLenRestoring = true;
              btn.click();
              _marLenRestoring = false;
            }
          }
        } catch (_) {}
      })();
      // Populate Zen personal best
      const zenPbEl = document.getElementById("mode-pb-zen");
      if (zenPbEl && typeof loadZenBest === 'function') {
        const zBest = loadZenBest();
        if (zBest) {
          const zm = Math.floor(zBest.durationSecs / 60);
          const zs = (zBest.durationSecs % 60).toString().padStart(2, "0");
          zenPbEl.textContent = "Best: " + zm + ":" + zs + "  \u2022  " + zBest.linesCleared + " lines";
        } else {
          zenPbEl.textContent = "";
        }
      }
      // Populate Daily Challenge personal best and lock state
      const dailyPbEl = document.getElementById("mode-pb-daily");
      const dailyDescEl = document.getElementById("mode-daily-desc");
      const dailyCardEl2 = document.getElementById("mode-card-daily");
      const dailyStreak = typeof getDailyStreak === 'function' ? getDailyStreak() : 0;
      const dailyStreakEl = document.getElementById("mode-daily-streak");
      if (dailyStreakEl) {
        dailyStreakEl.textContent = dailyStreak >= 2 ? '\uD83D\uDD25 ' + dailyStreak + '-day streak' : '';
        dailyStreakEl.style.display = dailyStreak >= 2 ? 'block' : 'none';
      }
      if (hasDailyAttemptedToday()) {
        const dailyBest = loadDailyBest();
        const dailyStars = (dailyBest && typeof getDailyStarString === 'function') ? getDailyStarString(dailyBest.score) : '';
        if (dailyPbEl) dailyPbEl.textContent = getTodayLabel() + " \u2014 " + (dailyBest ? dailyBest.score + (dailyStars ? ' ' + dailyStars : '') : "Done");
        if (dailyDescEl) dailyDescEl.textContent = "Come back tomorrow for a new challenge!";
        if (dailyCardEl2) dailyCardEl2.classList.add("mode-card-daily-done");
      } else {
        const dailyBest = loadDailyBest();
        if (dailyPbEl) {
          dailyPbEl.textContent = dailyBest ? getTodayLabel() + " Best: " + dailyBest.score : getTodayLabel();
        }
        if (dailyCardEl2) dailyCardEl2.classList.remove("mode-card-daily-done");
      }
      // Populate Weekly Challenge — show modifier name and personal best
      const weeklyMod = getCurrentWeeklyModifier();
      const weeklyDescEl = document.getElementById("mode-weekly-modifier-desc");
      if (weeklyDescEl && weeklyMod) weeklyDescEl.textContent = weeklyMod.name + ": " + weeklyMod.description;
      const weeklyPbEl = document.getElementById("mode-pb-weekly");
      if (weeklyPbEl) {
        const weeklyBest = loadWeeklyBest();
        if (weeklyBest) {
          weeklyPbEl.textContent = getCurrentWeekLabel() + " Best: " + weeklyBest.score;
        } else {
          weeklyPbEl.textContent = getCurrentWeekLabel();
        }
      }
      // Populate Puzzle personal best
      const puzzlePbEl = document.getElementById("mode-pb-puzzle");
      if (puzzlePbEl && typeof countCompletedPuzzles === "function") {
        const completed = countCompletedPuzzles();
        const threeStars = typeof countThreeStarPuzzles === "function" ? countThreeStarPuzzles() : 0;
        if (completed > 0) {
          puzzlePbEl.textContent = completed + "/" + (typeof PUZZLES !== "undefined" ? PUZZLES.length : 10) + " solved" +
            (threeStars > 0 ? " | " + threeStars + " \u2605\u2605\u2605" : "");
        } else {
          puzzlePbEl.textContent = "";
        }
      }
      // Populate Survival personal best
      const survivalPbEl = document.getElementById("mode-pb-survival");
      if (survivalPbEl && typeof loadSurvivalStats === "function") {
        const survStats = loadSurvivalStats();
        if (survStats.totalRuns > 0) {
          const aliveMin = Math.floor(survStats.bestTimeAlive / 60).toString().padStart(2, "0");
          const aliveSec = (Math.floor(survStats.bestTimeAlive) % 60).toString().padStart(2, "0");
          survivalPbEl.textContent = "Best: " + survStats.bestScore + " (" + aliveMin + ":" + aliveSec + ")";
          if (typeof hasSurvivalWorld === "function" && hasSurvivalWorld()) {
            survivalPbEl.textContent += " \u2022 World saved";
          }
        } else {
          survivalPbEl.textContent = typeof hasSurvivalWorld === "function" && hasSurvivalWorld()
            ? "World in progress"
            : "";
        }
      }
      // Populate Endless Survival personal best
      const endlessPbEl = document.getElementById("mode-pb-endless");
      if (endlessPbEl && typeof loadEndlessBest === 'function') {
        const endlessBest = loadEndlessBest();
        endlessPbEl.textContent = endlessBest ? "Best: " + endlessBest.score.toLocaleString() : "";
      }
      // Render World Card stats panel
      if (typeof renderWorldCard === "function") renderWorldCard();
      // Populate Mini-Games personal bests
      (function () {
        var mgStats = typeof loadMinigameStats === 'function' ? loadMinigameStats() : null;
        // Sprint mini — reuses standard sprint best
        var sprintMiniPbEl = document.getElementById('mode-pb-sprint_mini');
        if (sprintMiniPbEl) {
          var sBest = typeof loadSprintBest === 'function' ? loadSprintBest() : null;
          sprintMiniPbEl.textContent = sBest ? 'Best: ' + (typeof fmtSprintTime === 'function' ? fmtSprintTime(sBest.timeMs) : '') : '';
        }
        // Cheese Race
        var crPbEl = document.getElementById('mode-pb-cheese_race');
        if (crPbEl && mgStats) {
          crPbEl.textContent = mgStats.cheese_race.bestTimeMs !== null
            ? 'Best: ' + (typeof fmtMinigameTime === 'function' ? fmtMinigameTime(mgStats.cheese_race.bestTimeMs) : '')
            : '';
        }
        // Block Puzzle Mini
        var bpPbEl = document.getElementById('mode-pb-block_puzzle_mini');
        if (bpPbEl && mgStats) {
          var lv = mgStats.block_puzzle.levelsCompleted || 0;
          bpPbEl.textContent = lv > 0 ? lv + ' / ' + (typeof BLOCK_PUZZLE_MINI_MAX_LEVEL !== 'undefined' ? BLOCK_PUZZLE_MINI_MAX_LEVEL : 20) + ' levels' : '';
        }
        // Dig Mode
        var digPbEl = document.getElementById('mode-pb-dig_mode');
        if (digPbEl && mgStats) {
          var dBest = mgStats.dig.bestTimeSecs;
          if (dBest !== null) {
            var dm = Math.floor(dBest / 60).toString().padStart(2, '0');
            var ds = (dBest % 60).toString().padStart(2, '0');
            digPbEl.textContent = 'Best: ' + dm + ':' + ds;
          } else {
            digPbEl.textContent = '';
          }
        }
        // Ultra Mode
        var ultraPbEl = document.getElementById('mode-pb-ultra_mode');
        if (ultraPbEl && mgStats) {
          ultraPbEl.textContent = mgStats.ultra.bestScore !== null
            ? 'Best: ' + mgStats.ultra.bestScore.toLocaleString()
            : '';
        }
      })();
      // Update scenario label on Practice card
      if (typeof updatePracticeScenarioLabel === 'function') updatePracticeScenarioLabel();
      // Apply highlight to the specified mode card
      ["tutorial", "classic", "sprint", "blitz", "marathon", "practice", "daily", "weekly", "puzzle", "survival", "endless", "depths", "expedition", "boss_battle", "coop", "battle", "tournament", "local_multi", "vs_ai", "countdown"].forEach(function (mode) {
        const cardEl = document.getElementById("mode-card-" + mode);
        if (cardEl) {
          if (mode === highlightMode) {
            cardEl.classList.add("mode-card-highlighted");
          } else {
            cardEl.classList.remove("mode-card-highlighted");
          }
        }
      });
      // Populate power-up equip slot from the persistent bank
      const pickerEl = document.getElementById("mode-powerup-picker");
      if (pickerEl) {
        pickerEl.innerHTML = "";
        const puDefs = [
          { type: "row_bomb",  icon: "\uD83D\uDCA3", name: "Row Bomb"  },
          { type: "slow_down", icon: "\u23F1",        name: "Slow Down" },
          { type: "shield",    icon: "\uD83D\uDEE1",  name: "Shield"    },
          { type: "magnet",    icon: "\uD83E\uDDF2",  name: "Magnet"    },
        ];
        const bank = loadPowerUpBank();
        const owned = puDefs.filter(function (d) { return (bank[d.type] || 0) > 0; });
        if (owned.length === 0) {
          pickerEl.innerHTML = '<div class="powerup-pick-none">No power-ups owned.<br>Craft some in Classic mode!</div>';
          // Unequip if previously equipped something no longer available
          equippedPowerUpType = null;
        } else {
          // Ensure the currently equipped type is still owned, otherwise clear
          if (equippedPowerUpType && (bank[equippedPowerUpType] || 0) === 0) {
            equippedPowerUpType = null;
          }
          // Total bank count indicator
          var bankTotal = puDefs.reduce(function(s, d) { return s + (bank[d.type] || 0); }, 0);
          var perTypeCap = (typeof POWERUP_PER_TYPE_CAP !== 'undefined') ? POWERUP_PER_TYPE_CAP : 10;
          var totalCap   = (typeof POWERUP_TOTAL_CAP    !== 'undefined') ? POWERUP_TOTAL_CAP    : 30;
          var totalClass = bankTotal >= totalCap ? ' ppu-cap-full' : bankTotal >= totalCap - 4 ? ' ppu-cap-warn' : '';
          var totalEl = document.createElement("div");
          totalEl.className = "powerup-bank-total" + totalClass;
          totalEl.textContent = "Bank: " + bankTotal + "/" + totalCap;
          pickerEl.appendChild(totalEl);

          owned.forEach(function (def) {
            var qty = bank[def.type] || 0;
            var qtyClass = qty >= perTypeCap ? ' ppu-cap-full' : qty >= perTypeCap - 2 ? ' ppu-cap-warn' : '';
            const btn = document.createElement("button");
            btn.className = "powerup-pick-btn" + (equippedPowerUpType === def.type ? " pu-equipped" : "");
            btn.dataset.type = def.type;
            btn.innerHTML =
              '<div class="ppu-icon">' + def.icon + '</div>' +
              '<div class="ppu-name">' + def.name + '</div>' +
              '<div class="ppu-qty' + qtyClass + '">\xD7' + qty + '/' + perTypeCap + '</div>';
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              equippedPowerUpType = (equippedPowerUpType === def.type) ? null : def.type;
              try { localStorage.setItem("mineCtris_equippedPowerUp", equippedPowerUpType || ""); } catch (_) {}
              // Re-render picker to reflect new selection
              pickerEl.querySelectorAll(".powerup-pick-btn").forEach(function (b) {
                b.classList.toggle("pu-equipped", b.dataset.type === equippedPowerUpType);
                b.querySelector(".ppu-name").style.cssText =
                  b.dataset.type === equippedPowerUpType
                    ? "color:#ffd700;text-shadow:0 0 6px #ffd700"
                    : "";
              });
            });
            pickerEl.appendChild(btn);
          });
        }
      }

      // Populate world modifier picker
      const wmodPickerEl = document.getElementById("mode-worldmod-picker");
      if (wmodPickerEl && typeof WORLD_MODIFIER_DEFS !== 'undefined') {
        // Restore last-used modifier from localStorage on first open
        if (!activeWorldModifierId) {
          try {
            const saved = localStorage.getItem("mineCtris_lastWorldMod");
            if (saved && saved in WORLD_MODIFIER_DEFS) {
              if (typeof setWorldModifier === 'function') setWorldModifier(saved);
            }
          } catch (_) {}
        }
        wmodPickerEl.innerHTML = "";
        Object.values(WORLD_MODIFIER_DEFS).forEach(function (def) {
          const btn = document.createElement("button");
          const isSelected = (activeWorldModifierId || 'normal') === def.id;
          btn.className = "worldmod-pick-btn" + (isSelected ? " wm-selected" : "");
          btn.dataset.id = def.id;
          const swatchStyle = def.swatchColor
            ? ' style="background:' + def.swatchColor + '"'
            : ' style="background:#888"';
          btn.innerHTML =
            '<div class="wm-swatch"' + swatchStyle + '></div>' +
            '<div class="wm-icon">' + def.icon + '</div>' +
            '<div class="wm-name">' + def.name + '</div>' +
            (def.scoreMultiplier !== 1.0 ? '<div class="wm-mult">\xD7' + def.scoreMultiplier + '</div>' : '');
          btn.title = def.description;
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (typeof setWorldModifier === 'function') setWorldModifier(def.id);
            try { localStorage.setItem("mineCtris_lastWorldMod", def.id); } catch (_) {}
            wmodPickerEl.querySelectorAll(".worldmod-pick-btn").forEach(function (b) {
              b.classList.toggle("wm-selected", b.dataset.id === def.id);
            });
          });
          wmodPickerEl.appendChild(btn);
        });
      }

      // Apply progressive mode unlock gates
      if (typeof applyModeUnlockState === 'function') applyModeUnlockState();

      modeSelectEl.style.display = "flex";
      const notifBellWrap = document.getElementById('notif-bell-wrap');
      if (notifBellWrap) notifBellWrap.style.display = 'block';

      // Seasonal event: refresh banner each time mode-select opens
      if (typeof renderSeasonalEventBanner === 'function') renderSeasonalEventBanner();

      // Start ambient music in ultra-sparse menu mood for the mode-select screen
      if (typeof Tone !== 'undefined' && Tone.context && Tone.context.state !== 'running') {
        Tone.context.resume();
      }
      if (typeof startBgMusic === 'function' && typeof setAmbientMood === 'function') {
        startBgMusic();
        setAmbientMood('menu');
      }

      // Depths discovery prompt — shown once after 3+ games to new players who haven't tried The Depths
      _maybeShowDepthsDiscoveryPrompt();
    }

    function _maybeShowDepthsDiscoveryPrompt() {
      var promptEl = document.getElementById('depths-discovery-prompt');
      if (!promptEl) return;

      // Already dismissed permanently?
      try {
        if (localStorage.getItem('mineCtris_depthsPromptDismissed') === 'true') return;
      } catch (_) {}

      // Player must have 3+ games played
      var stats = (typeof loadLifetimeStats === 'function') ? loadLifetimeStats() : null;
      if (!stats || (stats.gamesPlayed || 0) < 3) return;

      // Player must not have entered any Depths/Dungeon mode yet
      try {
        var seenRaw = localStorage.getItem('mineCtris_seenDungeonTiers');
        var seen = seenRaw ? JSON.parse(seenRaw) : null;
        // If seen is null it means the key was never written (no dungeon ever launched)
        // If seen is a non-empty array the player has played dungeon tiers — skip
        if (seen !== null && seen.length > 0) return;
      } catch (_) { return; }

      // Show the prompt
      promptEl.style.display = 'block';
      requestAnimationFrame(function () { promptEl.classList.add('ddp-visible'); });

      // Wire buttons (idempotent — only bind once)
      if (!promptEl._ddpBound) {
        promptEl._ddpBound = true;

        var showBtn = document.getElementById('ddp-show-me');
        var laterBtn = document.getElementById('ddp-maybe-later');

        function _dismissPrompt() {
          promptEl.classList.remove('ddp-visible');
          setTimeout(function () { promptEl.style.display = 'none'; }, 350);
          try { localStorage.setItem('mineCtris_depthsPromptDismissed', 'true'); } catch (_) {}
        }

        if (showBtn) {
          showBtn.addEventListener('click', function () {
            _dismissPrompt();
            // Scroll The Depths card into view and briefly highlight it
            var depthsCard = document.getElementById('mode-card-depths');
            if (depthsCard) {
              depthsCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              depthsCard.classList.add('mode-card-highlight');
              setTimeout(function () { depthsCard.classList.remove('mode-card-highlight'); }, 2000);
            }
          });
        }

        if (laterBtn) {
          laterBtn.addEventListener('click', _dismissPrompt);
        }
      }
    }


    function hideModeSelect() {
      const modeSelectEl = document.getElementById("mode-select");
      if (modeSelectEl) modeSelectEl.style.display = "none";
      const notifBellWrap = document.getElementById('notif-bell-wrap');
      if (notifBellWrap) notifBellWrap.style.display = 'none';
      if (typeof notifClose === 'function') notifClose();
    }

    function _showCustomPuzzleLoadScreen() {
      const screen = document.getElementById("custom-puzzle-load-screen");
      if (!screen) return;
      const meta = (typeof customPuzzleMetadata !== "undefined") ? customPuzzleMetadata : null;

      const nameEl = document.getElementById("cpls-name");
      if (nameEl) nameEl.textContent = (meta && meta.name) ? meta.name : "Custom Puzzle";

      const descEl = document.getElementById("cpls-desc");
      if (descEl) descEl.textContent = (meta && meta.description) ? meta.description : "";

      const authorEl = document.getElementById("cpls-author");
      if (authorEl) {
        authorEl.textContent = (meta && meta.author) ? "by " + meta.author : "";
        authorEl.style.display = (meta && meta.author) ? "" : "none";
      }

      const diffEl = document.getElementById("cpls-difficulty");
      if (diffEl) {
        var diff = (meta && meta.difficulty) ? meta.difficulty : 0;
        if (diff > 0) {
          diffEl.textContent = "★".repeat(diff) + "☆".repeat(3 - diff);
          diffEl.style.display = "";
        } else {
          diffEl.style.display = "none";
        }
      }

      screen.style.display = "flex";
    }

    function _showPuzzleDecodeError(versionMismatch) {
      const screen = document.getElementById("custom-puzzle-load-screen");
      if (!screen) return;
      const nameEl = document.getElementById("cpls-name");
      if (nameEl) nameEl.textContent = versionMismatch ? "Newer Version" : "Invalid Puzzle";
      const descEl = document.getElementById("cpls-desc");
      if (descEl) descEl.textContent = versionMismatch
        ? "This puzzle was created with a newer version of the editor. Update to play it."
        : "This share code is corrupted or cannot be read. The link may be broken.";
      const authorEl = document.getElementById("cpls-author");
      if (authorEl) { authorEl.textContent = ""; authorEl.style.display = "none"; }
      const diffEl = document.getElementById("cpls-difficulty");
      if (diffEl) diffEl.style.display = "none";
      const playBtn = document.getElementById("cpls-play-btn");
      if (playBtn) playBtn.style.display = "none";
      screen.style.display = "flex";
    }

    function requestPointerLock() {
      if (Tone.context.state !== "running") {
        Tone.start().then(() => controls.lock()).catch(() => controls.lock());
      } else {
        controls.lock();
      }
    }

    // Show world modifier HUD badge if a non-normal modifier is active.
    function applyWorldModifierHUD() {
      const badgeEl = document.getElementById('world-modifier-badge');
      if (!badgeEl || typeof getWorldModifier !== 'function') return;
      const mod = getWorldModifier();
      if (mod && mod.id !== 'normal') {
        badgeEl.textContent = mod.icon + ' ' + mod.name + ' \xD7' + mod.scoreMultiplier;
        badgeEl.style.display = 'block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    const classicCardEl = document.getElementById("mode-card-classic");
    if (classicCardEl) {
      classicCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "classic"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('classic');
        hideModeSelect();
        requestPointerLock();
      });
    }

    const sprintCardEl = document.getElementById("mode-card-sprint");
    if (sprintCardEl) {
      sprintCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        isSprintMode = true;
        // Fixed speed from the start; difficulty escalation is disabled in sprint
        difficultyMultiplier = SPRINT_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4; // Level 5 display
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "sprint"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('sprint');
        hideModeSelect();
        requestPointerLock();
      });
    }

    const blitzCardEl = document.getElementById("mode-card-blitz");
    if (blitzCardEl) {
      blitzCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        isBlitzMode = true;
        difficultyMultiplier = BLITZ_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4; // Level 5 display
        blitzRemainingMs     = BLITZ_DURATION_MS;
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "blitz"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('blitz');
        hideModeSelect();
        requestPointerLock();
      });
    }

    const marathonCardEl = document.getElementById("mode-card-marathon");
    if (marathonCardEl) {
      // Helper: read current length selection (var to avoid Annex B block-function hoisting)
      var _marLen = function() {
        var active = marathonCardEl.querySelector('.mar-len-btn-active');
        return active ? active.getAttribute('data-mar-len') : 'classic';
      };

      // Flag set during programmatic state restore to skip auto-launch
      var _marLenRestoring = false;

      // Shared launch — called from both card click and length buttons
      var _launchMarathon = function() {
        if (_marLen() === 'endless') {
          isDailyChallenge              = false;
          gameRng                       = null;
          isMarathonEndlessMode         = true;
          marathonEndlessLevel          = 1;
          marathonEndlessPeakLPM        = 0;
          marathonEndlessLastMilestone  = 0;
          marathonEndlessLastCheckpoint = 0;
          marathonEndlessGarbageTimer   = 0;
          const garbageCb = document.getElementById('me-garbage-toggle-cb');
          marathonEndlessGarbageEnabled = garbageCb ? garbageCb.checked : true;
          difficultyMultiplier          = 1.0;
          lastDifficultyTier            = 0;
          const meBadgeEl = document.getElementById('marathon-endless-badge');
          if (meBadgeEl) meBadgeEl.style.display = 'block';
          applyWorldModifierHUD();
          try { localStorage.setItem("mineCtris_lastMode", "marathon_endless"); } catch (_) {}
          if (typeof metricsModePlayed === 'function') metricsModePlayed('marathon_endless');
        } else {
          isDailyChallenge    = false;
          gameRng             = null;
          isMarathonMode      = true;
          marathonLevel       = 1;
          marathonKillScreen  = false;
          difficultyMultiplier = 1.0;
          lastDifficultyTier   = 0;
          applyWorldModifierHUD();
          try { localStorage.setItem("mineCtris_lastMode", "marathon"); } catch (_) {}
          if (typeof metricsModePlayed === 'function') metricsModePlayed('marathon');
        }
        hideModeSelect();
        requestPointerLock();
      };

      // Prevent the garbage-toggle checkbox/label from bubbling to the card handler
      var _meGarbageToggleEl = document.getElementById('me-garbage-toggle');
      if (_meGarbageToggleEl) {
        _meGarbageToggleEl.addEventListener('click', function (e) { e.stopPropagation(); });
      }

      // Length toggle buttons — select AND launch immediately
      marathonCardEl.querySelectorAll('.mar-len-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          marathonCardEl.querySelectorAll('.mar-len-btn')
            .forEach(function (b) { b.classList.remove('mar-len-btn-active'); });
          btn.classList.add('mar-len-btn-active');
          const isEndless = btn.getAttribute('data-mar-len') === 'endless';
          const garbageToggleEl = document.getElementById('me-garbage-toggle');
          if (garbageToggleEl) garbageToggleEl.style.display = isEndless ? 'block' : 'none';
          // Swap card copy, leaderboard tab, PB readout, aria-label
          const descEl = document.getElementById('mode-marathon-desc');
          const pbEl   = document.getElementById('mode-pb-marathon');
          const lbBtn  = document.getElementById('mode-marathon-lb-btn');
          if (isEndless) {
            if (descEl) descEl.textContent = 'No level cap. Milestones at 50/100/200/500/1000 lines. Garbage starts at 300.';
            if (lbBtn) lbBtn.setAttribute('data-lb-tab', 'marathon_endless');
            marathonCardEl.setAttribute('aria-label', 'Marathon Endless — no cap, milestones, optional garbage after 300 lines');
            const meBest = typeof loadMarathonEndlessBest === 'function' ? loadMarathonEndlessBest() : null;
            if (pbEl) pbEl.textContent = meBest ? 'Best: ' + meBest.linesCleared + ' lines' : '';
          } else {
            if (descEl) descEl.textContent = '29 levels. Speed up every 10 lines. Reach the kill screen.';
            if (lbBtn) lbBtn.setAttribute('data-lb-tab', 'marathon');
            marathonCardEl.setAttribute('aria-label', 'Marathon mode — 29 levels, kill screen at level 29');
            const mBest = typeof loadMarathonBest === 'function' ? loadMarathonBest() : null;
            if (pbEl) pbEl.textContent = mBest ? 'Best: Level ' + mBest.level + ' (' + mBest.score + ')' : '';
          }
          try { localStorage.setItem('mineCtris_marathonLastLength', isEndless ? 'endless' : 'classic'); } catch (_) {}
          // Launch unless this click was triggered programmatically to restore state
          if (!_marLenRestoring) _launchMarathon();
        });
      });

      // Card click — launch the selected variant
      marathonCardEl.addEventListener("click", _launchMarathon);
    }

    const zenCardEl = document.getElementById("mode-card-zen");
    if (zenCardEl) {
      zenCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        isZenMode = true;
        // Fixed gentle fall speed; difficulty escalation disabled
        difficultyMultiplier = ZEN_FIXED_MULTIPLIER;
        lastDifficultyTier   = 0;
        // Show zen badge in HUD
        const zenBadgeEl = document.getElementById("zen-badge");
        if (zenBadgeEl) zenBadgeEl.style.display = "block";
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "zen"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('zen');
        hideModeSelect();
        requestPointerLock();
      });
    }

    // Wire up Zen session screen buttons
    const zenPlayAgainBtn = document.getElementById("zen-play-again-btn");
    if (zenPlayAgainBtn) {
      zenPlayAgainBtn.addEventListener("click", function () {
        resetGame();
      });
    }
    const zenMainMenuBtn = document.getElementById("zen-main-menu-btn");
    if (zenMainMenuBtn) {
      zenMainMenuBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Blitz play-again button
    const blitzPlayAgainBtn = document.getElementById("blitz-play-again-btn");
    if (blitzPlayAgainBtn) {
      blitzPlayAgainBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Blitz main menu button
    const blitzMainMenuBtn = document.getElementById("blitz-main-menu-btn");
    if (blitzMainMenuBtn) {
      blitzMainMenuBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Combo Challenge mode card
    const ccCardEl = document.getElementById("mode-card-combo_challenge");
    if (ccCardEl) {
      ccCardEl.addEventListener("click", function () {
        isDailyChallenge              = false;
        gameRng                       = null;
        isComboChallenge              = true;
        comboChallengeRemainingMs     = COMBO_CHALLENGE_DURATION_MS;
        comboChallengeStreak          = 0;
        comboChallengeMaxStreak       = 0;
        comboChallengeTotalLines      = 0;
        difficultyMultiplier          = COMBO_CHALLENGE_FIXED_MULTIPLIER;
        lastDifficultyTier            = 4; // Level 5 display
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "combo_challenge"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('combo_challenge');
        hideModeSelect();
        requestPointerLock();
      });
    }

    // Wire up Countdown mode card
    const countdownCardEl = document.getElementById("mode-card-countdown");
    if (countdownCardEl) {
      countdownCardEl.addEventListener("click", function () {
        isDailyChallenge         = false;
        gameRng                  = null;
        isCountdownMode          = true;
        countdownElapsedMs       = 0;
        countdownComplete        = false;
        countdownSpeedStage      = 1;
        countdownStageTimer      = 0;
        countdownWarningActive   = false;
        // Start at Stage 1 speed (slow, ~0.4× base fall speed)
        difficultyMultiplier = getCountdownMultiplier(1);
        lastDifficultyTier   = 0;
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "countdown"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('countdown');
        hideModeSelect();
        requestPointerLock();
      });
    }

    // Wire up Countdown play-again button
    const countdownPlayAgainBtn = document.getElementById("countdown-play-again-btn");
    if (countdownPlayAgainBtn) {
      countdownPlayAgainBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Countdown main menu button
    const countdownMainMenuBtn = document.getElementById("countdown-main-menu-btn");
    if (countdownMainMenuBtn) {
      countdownMainMenuBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Combo Challenge play-again button
    const ccPlayAgainBtn = document.getElementById("cc-play-again-btn");
    if (ccPlayAgainBtn) {
      ccPlayAgainBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Combo Challenge main menu button
    const ccMainMenuBtn = document.getElementById("cc-main-menu-btn");
    if (ccMainMenuBtn) {
      ccMainMenuBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    const dailyCardEl = document.getElementById("mode-card-daily");
    if (dailyCardEl) {
      dailyCardEl.addEventListener("click", function (e) {
        // Don't start if a button inside the card was clicked
        if (e.target && e.target.tagName === 'BUTTON') return;
        // Enforce one attempt per day
        if (hasDailyAttemptedToday()) return;
        isDailyChallenge = true;
        gameRng = getDailyPrng();
        // Re-seed the piece queue with today's PRNG
        initPieceQueue();
        // Show daily badge in HUD
        const badgeEl = document.getElementById("daily-challenge-badge");
        if (badgeEl) {
          badgeEl.textContent = "Daily: " + getTodayLabel();
          badgeEl.style.display = "block";
        }
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "daily"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('daily');
        hideModeSelect();
        requestPointerLock();
      });
    }

    // Calendar button — show past daily results
    const dailyCalBtn = document.getElementById("mode-daily-cal-btn");
    if (dailyCalBtn) {
      dailyCalBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (typeof openDailyCalendar === 'function') openDailyCalendar();
      });
    }

    // Calendar modal close button
    const calCloseBtn = document.getElementById("daily-calendar-close-btn");
    if (calCloseBtn) {
      calCloseBtn.addEventListener("click", function () {
        if (typeof closeDailyCalendar === 'function') closeDailyCalendar();
      });
    }

    // Close calendar on backdrop click
    const calModal = document.getElementById("daily-calendar-modal");
    if (calModal) {
      calModal.addEventListener("click", function (e) {
        if (e.target === calModal && typeof closeDailyCalendar === 'function') closeDailyCalendar();
      });
    }

    const weeklyCardEl = document.getElementById("mode-card-weekly");
    if (weeklyCardEl) {
      weeklyCardEl.addEventListener("click", function () {
        const mod = getCurrentWeeklyModifier();
        isWeeklyChallenge = true;
        weeklyModifier = mod;
        // Apply the modifier (sets flags and adjusts difficulty if needed)
        if (mod && typeof mod.applyFn === "function") mod.applyFn();
        // Seed the piece queue with this week's PRNG
        gameRng = getWeeklyPrng();
        initPieceQueue();
        // Show weekly badge in HUD
        const badgeEl = document.getElementById("weekly-challenge-badge");
        if (badgeEl) {
          badgeEl.textContent = getCurrentWeekLabel() + (mod ? ": " + mod.name : "");
          badgeEl.style.display = "block";
        }
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "weekly"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('weekly');
        hideModeSelect();
        requestPointerLock();
      });
    }

    const puzzleCardEl = document.getElementById("mode-card-puzzle");
    if (puzzleCardEl) {
      puzzleCardEl.addEventListener("click", function () {
        isPuzzleMode = true;
        puzzleComplete = false;
        // Fixed slow speed for puzzle mode (half normal)
        difficultyMultiplier = 0.5;
        lastDifficultyTier = 0;
        if (typeof metricsModePlayed === 'function') metricsModePlayed('puzzle');
        hideModeSelect();
        if (typeof showPuzzleSelect === "function") showPuzzleSelect();
      });
    }

    // Show the one-time Survival tutorial prompt; auto-dismisses after 6s
    function _showSurvivalTutorialPrompt() {
      var el = document.getElementById("survival-tutorial-prompt");
      if (!el) return;
      try { localStorage.setItem("mineCtris_tutorialShown", "1"); } catch (_) {}
      el.style.display = "block";
      // Fade in
      requestAnimationFrame(function () { el.style.opacity = "1"; });
      var tutTimer = setTimeout(function () { _dismissSurvivalTutorialPrompt(); }, 6000);
      el._tutTimer = tutTimer;
    }

    // Fade out and hide the tutorial prompt (also called from mining.js on first mine)
    window._dismissSurvivalTutorialPrompt = function _dismissSurvivalTutorialPrompt() {
      var el = document.getElementById("survival-tutorial-prompt");
      if (!el || el.style.display === "none") return;
      if (el._tutTimer) { clearTimeout(el._tutTimer); el._tutTimer = null; }
      el.style.opacity = "0";
      setTimeout(function () { el.style.display = "none"; }, 500);
    };

    // Survival mode card
    // ── The Depths mode card — shows variant selector overlay ──
    (function _initDepthsCard() {
      var depthsCard = document.getElementById('mode-card-depths');
      var overlay    = document.getElementById('depths-variant-overlay');
      var closeBtn   = document.getElementById('depths-variant-close');
      if (!depthsCard || !overlay) return;

      function _isInfiniteDepthsUnlocked() {
        try { return localStorage.getItem('mineCtris_witherStormDefeated') === 'true'; } catch (_) { return false; }
      }

      function _refreshInfiniteDepthsLockState() {
        var btn  = document.getElementById('depths-variant-infinite');
        var lock = document.getElementById('depths-infinite-lock');
        if (!btn) return;
        var unlocked = _isInfiniteDepthsUnlocked();
        btn.classList.toggle('depths-variant-btn-locked', !unlocked);
        if (lock) lock.style.display = unlocked ? 'none' : '';

        // Weekly Depths shares the same unlock gate as Infinite Depths
        var wBtn  = document.getElementById('depths-variant-weekly-infinite');
        var wLock = document.getElementById('depths-weekly-infinite-lock');
        if (wBtn) wBtn.classList.toggle('depths-variant-btn-locked', !unlocked);
        if (wLock) wLock.style.display = unlocked ? 'none' : '';
        if (unlocked && typeof refreshInfiniteWeeklyVariantBtn === 'function') {
          refreshInfiniteWeeklyVariantBtn();
        }
      }

      function openDepthsVariantSelector() {
        _refreshInfiniteDepthsLockState();
        overlay.style.display = 'flex';
        markModeSeen('depths');
      }

      function closeDepthsVariantSelector() {
        overlay.style.display = 'none';
      }

      depthsCard.addEventListener('click', openDepthsVariantSelector);
      if (closeBtn) closeBtn.addEventListener('click', closeDepthsVariantSelector);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeDepthsVariantSelector();
      });

      overlay.addEventListener('click', function (e) {
        var btn = e.target.closest('.depths-variant-btn');
        if (!btn || btn.classList.contains('depths-variant-btn-locked')) return;
        var variant = btn.dataset.variant;
        closeDepthsVariantSelector();
        hideModeSelect();
        if (variant === 'free_run') {
          document.dispatchEvent(new CustomEvent('depthsLaunch', { detail: {} }));
        } else if (variant === 'daily_depths') {
          document.dispatchEvent(new CustomEvent('dailyDepthsLaunch', { detail: {} }));
        } else if (variant === 'weekly_infinite') {
          document.dispatchEvent(new CustomEvent('dungeonLaunch', { detail: { dungeonId: 'infinite', infiniteWeekly: true } }));
        } else {
          document.dispatchEvent(new CustomEvent('dungeonLaunch', { detail: { dungeonId: variant } }));
        }
      });
    })();
    // ── End Depths card setup ──

    // ── Boss Battle mode card ──────────────────────────────────────────────────
    (function _initBossBattleCard() {
      var bossCard     = document.getElementById('mode-card-boss_battle');
      var bossOverlay  = document.getElementById('boss-selector-overlay');
      var bossCloseBtn = document.getElementById('boss-selector-close');
      if (!bossCard || !bossOverlay) return;

      function _refreshBossStatuses() {
        ['wither', 'ender_dragon', 'warden'].forEach(function (bossId) {
          var statusEl = document.getElementById('boss-status-' + bossId);
          if (!statusEl) return;
          var defeated = (typeof getBossDefeated === 'function') ? getBossDefeated(bossId) : false;
          statusEl.textContent = defeated ? '✓ Defeated' : '';
          statusEl.style.color = defeated ? '#2ecc71' : '';
        });
      }

      function openBossSelector() {
        _refreshBossStatuses();
        bossOverlay.style.display = 'flex';
      }

      function closeBossSelector() {
        bossOverlay.style.display = 'none';
      }

      bossCard.addEventListener('click', function () {
        if (typeof isBossBattleUnlocked === 'function' && !isBossBattleUnlocked()) {
          // Show a brief hint if locked
          var pbEl = document.getElementById('mode-pb-boss_battle');
          if (pbEl) {
            pbEl.textContent = 'Complete a Dungeon run to unlock';
            pbEl.style.color = '#e74c3c';
          }
          return;
        }
        openBossSelector();
      });

      if (bossCloseBtn) bossCloseBtn.addEventListener('click', closeBossSelector);
      bossOverlay.addEventListener('click', function (e) {
        if (e.target === bossOverlay) closeBossSelector();
      });

      // Boss button click → start boss battle
      bossOverlay.addEventListener('click', function (e) {
        var btn = e.target.closest('.boss-select-btn');
        if (!btn) return;
        var bossId = btn.dataset.boss;
        if (!bossId) return;
        closeBossSelector();
        hideModeSelect();
        // Set boss battle mode flags
        isBossBattleMode = true;
        isDailyChallenge = false;
        gameRng = null;
        if (typeof metricsModePlayed === 'function') metricsModePlayed('boss_battle');
        // Wire victory-screen buttons (idempotent)
        _wireBossVictoryButtons();
        requestPointerLock();
        // Start boss session once pointer lock is acquired
        document.addEventListener('pointerlockchange', function _onLock() {
          document.removeEventListener('pointerlockchange', _onLock);
          if (typeof startBossBattle === 'function') startBossBattle(bossId);
        });
      });

      // Populate mode card personal best
      var pbEl = document.getElementById('mode-pb-boss_battle');
      if (pbEl && typeof isBossBattleUnlocked === 'function' && isBossBattleUnlocked()) {
        var defeated = [];
        ['wither', 'ender_dragon', 'warden'].forEach(function (b) {
          if (typeof getBossDefeated === 'function' && getBossDefeated(b)) defeated.push(b.replace('_', ' '));
        });
        if (defeated.length > 0) {
          pbEl.textContent = '✓ ' + defeated.join(', ');
          pbEl.style.color = '#2ecc71';
        }
      }
    })();
    // ── End Boss Battle card setup ──

    function _wireBossVictoryButtons() {
      var playAgainBtn = document.getElementById('bvs-play-again-btn');
      var mainMenuBtn  = document.getElementById('bvs-main-menu-btn');
      if (playAgainBtn && !playAgainBtn._bvsWired) {
        playAgainBtn._bvsWired = true;
        playAgainBtn.addEventListener('click', function () {
          var el = document.getElementById('boss-victory-screen');
          if (el) { el.classList.remove('bvs-visible'); el.style.display = 'none'; }
          resetGame();
          var bossOverlay = document.getElementById('boss-selector-overlay');
          if (bossOverlay) bossOverlay.style.display = 'flex';
          var modeSelectEl = document.getElementById('mode-select');
          if (modeSelectEl) modeSelectEl.style.display = 'flex';
          var blockerEl = document.getElementById('blocker');
          if (blockerEl) blockerEl.style.display = 'none';
        });
      }
      if (mainMenuBtn && !mainMenuBtn._bvsWired) {
        mainMenuBtn._bvsWired = true;
        mainMenuBtn.addEventListener('click', function () {
          var el = document.getElementById('boss-victory-screen');
          if (el) { el.classList.remove('bvs-visible'); el.style.display = 'none'; }
          resetGame();
        });
      }
    }

    const survivalCardEl = document.getElementById("mode-card-survival");
    if (survivalCardEl) {
      survivalCardEl.addEventListener("click", function () {
        isSurvivalMode = true;
        isDailyChallenge = false;
        gameRng = null;
        if (typeof metricsModePlayed === 'function') metricsModePlayed('survival');
        // If a survival world is saved, restore it; otherwise start fresh
        if (typeof hasSurvivalWorld === "function" && hasSurvivalWorld()) {
          if (typeof restoreSurvivalWorld === "function") restoreSurvivalWorld();
          survivalSessionNumber++;
        } else {
          survivalSessionNumber = 1;
          if (typeof initWorldStats === "function") initWorldStats();
          if (typeof generateUnderground === "function") generateUnderground();
        }

        // Spawn player at grid center
        if (controls) controls.getObject().position.set(0, PLAYER_HEIGHT, 0);
        // Show survival HUD badge
        const survBadgeEl = document.getElementById("survival-badge");
        if (survBadgeEl) survBadgeEl.style.display = "block";
        hideModeSelect();
        requestPointerLock();
        // Show one-time tutorial prompt on first-ever Survival session
        var _tutShown = false; try { _tutShown = !!localStorage.getItem("mineCtris_tutorialShown"); } catch (_) {}
        if (!_tutShown) {
          _showSurvivalTutorialPrompt();
        }
      });
    }

    // ── Endless Survival mode card ────────────────────────────────────────────
    const endlessCardEl = document.getElementById("mode-card-endless");
    if (endlessCardEl) {
      // Populate personal best
      const endlessPbEl = document.getElementById("mode-pb-endless");
      if (endlessPbEl) {
        const endlessBest = typeof loadEndlessBest === 'function' ? loadEndlessBest() : null;
        endlessPbEl.textContent = endlessBest ? "Best: " + endlessBest.score.toLocaleString() : "";
      }
      endlessCardEl.addEventListener("click", function (e) {
        if (e.target && e.target.tagName === 'BUTTON') return;
        isEndlessSurvivalMode = true;
        isDailyChallenge = false;
        gameRng = null;
        endlessActiveModifiers = [];
        endlessSurvivalSpeedTimer = 0;
        endlessSurvivalModTimer = 0;
        endlessSurvivalSpeedLevel = 0;
        endlessMirrorActive = false;
        endlessGravityActive = false;
        endlessPoisonActive = false;
        endlessShrinkLevel = 0;
        // Show badge and clear modifier HUD
        const endlessBadgeEl = document.getElementById("endless-badge");
        if (endlessBadgeEl) endlessBadgeEl.style.display = "block";
        if (typeof updateEndlessModifierHUD === 'function') updateEndlessModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "endless"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('endless');
        hideModeSelect();
        requestPointerLock();
      });
    }

// ── Mobile swipe carousel ──────────────────────────────────────────────────
(function _setupMobileCarousel() {
  var _msmBypass = false;
  var _initialized = false;

  function _init() {
    if (_initialized) return;
    if (window.innerWidth > 767) return;
    _initialized = true;

    var modeCards = document.getElementById('mode-cards');
    if (!modeCards) return;

    var sections = Array.from(modeCards.querySelectorAll('.mode-section'));
    if (!sections.length) return;

    // Build category tab bar
    var tabBar = document.createElement('div');
    tabBar.className = 'msm-tab-bar';

    sections.forEach(function (section, i) {
      var headerEl = section.querySelector('.mode-section-header');
      var label = headerEl ? headerEl.textContent.trim() : ('CAT ' + (i + 1));

      var tab = document.createElement('button');
      tab.className = 'msm-tab' + (i === 0 ? ' msm-tab-active' : '');
      tab.textContent = label;
      tab.addEventListener('click', function () {
        _showSection(sections, tabBar, i);
      });
      tabBar.appendChild(tab);

      // Dot indicators below each section's carousel
      var dotsEl = document.createElement('div');
      dotsEl.className = 'msm-dots';
      section.appendChild(dotsEl);
      _buildDots(section, dotsEl);
    });

    modeCards.insertAdjacentElement('beforebegin', tabBar);

    // Show first section
    _showSection(sections, tabBar, 0);

    // Capture-phase intercept: first tap expands card; second tap launches
    modeCards.addEventListener('click', function (e) {
      if (window.innerWidth > 767) return;
      if (_msmBypass) return;
      if (e.target.closest('.msm-play-btn')) return;
      if (e.target.closest('.mode-card-lb-btn')) return;

      var card = e.target.closest('.mode-card');
      if (!card || card.classList.contains('mode-card-locked')) return;

      // Already expanded — second tap falls through to existing card handler
      if (card.classList.contains('msm-expanded')) return;

      // First tap: expand this card
      e.stopPropagation();

      // Collapse other expanded cards in the same section
      var section = card.closest('.mode-section');
      if (section) {
        section.querySelectorAll('.mode-card.msm-expanded').forEach(function (c) {
          c.classList.remove('msm-expanded');
        });
      }
      card.classList.add('msm-expanded');

      // Add play button if not already present
      if (!card.querySelector('.msm-play-btn')) {
        var btn = document.createElement('button');
        btn.className = 'msm-play-btn';
        btn.textContent = '\u25b6 Play';
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          _msmBypass = true;
          card.click();
          _msmBypass = false;
        });
        card.appendChild(btn);
      }
    }, true); // capture phase
  }

  function _showSection(sections, tabBar, activeIdx) {
    sections.forEach(function (s, i) {
      s.classList.toggle('msm-active', i === activeIdx);
    });
    Array.from(tabBar.querySelectorAll('.msm-tab')).forEach(function (t, i) {
      t.classList.toggle('msm-tab-active', i === activeIdx);
    });
  }

  function _buildDots(section, dotsEl) {
    var cards = Array.from(section.querySelectorAll('.mode-card'));
    if (cards.length <= 1) { dotsEl.style.display = 'none'; return; }

    cards.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'msm-dot' + (i === 0 ? ' msm-dot-active' : '');
      dotsEl.appendChild(dot);
    });

    var track = section.querySelector('.mode-section-cards');
    if (!track) return;

    // Collapse expanded card on swipe
    track.addEventListener('scroll', function () {
      section.querySelectorAll('.mode-card.msm-expanded').forEach(function (c) {
        c.classList.remove('msm-expanded');
      });
    }, { passive: true });

    // Update active dot via IntersectionObserver
    var dotEls = Array.from(dotsEl.querySelectorAll('.msm-dot'));
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          var idx = cards.indexOf(entry.target);
          if (idx >= 0) {
            dotEls.forEach(function (d, i) {
              d.classList.toggle('msm-dot-active', i === idx);
            });
          }
        }
      });
    }, { root: track, threshold: 0.5 });
    cards.forEach(function (c) { io.observe(c); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }
})();

// ── Practice mode card ────────────────────────────────────────────────────────
function updatePracticeScenarioLabel() {
  var btn = document.getElementById('practice-scenario-open-btn');
  if (!btn) return;
  var label = '\uD83C\uDFAF Sandbox (none) \u25BE';
  try {
    var lastScenario = localStorage.getItem('mineCtris_practiceLastScenario');
    if (lastScenario && typeof TRAINING_SCENARIOS !== 'undefined') {
      var s = TRAINING_SCENARIOS.find(function (x) { return x.id === lastScenario; });
      if (s) label = '\uD83C\uDFAF ' + s.name + ' \u25BE';
    }
  } catch (_) {}
  btn.textContent = label;
}

(function _initPracticeCard() {
  var practiceCardEl = document.getElementById("mode-card-practice");
  if (!practiceCardEl) return;

  // ── Gravity selector — select gravity AND launch sandbox immediately ─────────
  var gravBtns = practiceCardEl.querySelectorAll('.grav-btn');
  gravBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var dir = btn.getAttribute('data-grav');
      if (typeof gravityDirection !== 'undefined') gravityDirection = dir;
      gravBtns.forEach(function (b) { b.classList.remove('grav-btn-active'); });
      btn.classList.add('grav-btn-active');
      _launchPracticeSandbox();
    });
  });

  // ── Scenario selector button → hides mode-select and opens training-select ──
  var scenarioBtn = document.getElementById('practice-scenario-open-btn');
  if (scenarioBtn) {
    scenarioBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      hideModeSelect();
      if (typeof showTrainingSelect === 'function') showTrainingSelect();
    });
  }

  // ── Card body click — launch last-used variant (scenario or sandbox) ───────
  function _launchPracticeSandbox() {
    isPracticeMode       = true;
    isDailyChallenge     = false;
    gameRng              = null;
    difficultyMultiplier = 1.0;
    lastDifficultyTier   = 0;
    var practiceBadgeEl = document.getElementById("practice-badge");
    if (practiceBadgeEl) practiceBadgeEl.style.display = "block";
    var gravIndicatorEl = document.getElementById("gravity-indicator");
    if (gravIndicatorEl) {
      var _grav = (typeof gravityDirection !== 'undefined') ? gravityDirection : 'down';
      if (_grav !== 'down') {
        var _labels = { up: '\u2191 UP GRAVITY', left: '\u2190 LEFT GRAVITY', right: '\u2192 RIGHT GRAVITY' };
        gravIndicatorEl.textContent = _labels[_grav] || '';
        gravIndicatorEl.style.display = 'block';
      } else {
        gravIndicatorEl.style.display = 'none';
      }
    }
    try { localStorage.setItem("mineCtris_lastMode", "practice"); } catch (_) {}
    if (typeof metricsModePlayed === 'function') metricsModePlayed('practice');
    hideModeSelect();
    requestPointerLock();
  }

  practiceCardEl.addEventListener("click", function () {
    var lastScenario = null;
    try { lastScenario = localStorage.getItem('mineCtris_practiceLastScenario'); } catch (_) {}
    if (lastScenario && typeof launchTrainingScenario === 'function') {
      hideModeSelect();
      launchTrainingScenario(lastScenario);
    } else {
      _launchPracticeSandbox();
    }
  });

  // Wire up practice-complete overlay buttons
  var playAgainBtn = document.getElementById("practice-play-again-btn");
  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", function () {
      if (typeof resetGame === "function") resetGame();
    });
  }

  var mainMenuBtn = document.getElementById("practice-main-menu-btn");
  if (mainMenuBtn) {
    mainMenuBtn.addEventListener("click", function () {
      if (typeof resetGame === "function") resetGame();
    });
  }
})();

// ── Tutorial mode card ────────────────────────────────────────────────────────
(function _initTutorialCard() {
  var tutorialCardEl = document.getElementById('mode-card-tutorial');
  if (!tutorialCardEl) return;

  tutorialCardEl.addEventListener('click', function () {
    // Reset tutorial progress so it plays from step 1
    try { localStorage.removeItem('mineCtris_tutorialDone'); } catch (_) {}
    try { localStorage.removeItem('mineCtris_tutorialProgress'); } catch (_) {}
    isDailyChallenge = false;
    gameRng = null;
    try { localStorage.setItem('mineCtris_lastMode', 'classic'); } catch (_) {}
    if (typeof metricsModePlayed === 'function') metricsModePlayed('tutorial');
    hideModeSelect();
    requestPointerLock();
  });
})();

// ── Mini-Games card handlers ──────────────────────────────────────────────────
(function _initMiniGameCards() {

  // When launchBlockPuzzleMini(level) is called programmatically, store the
  // requested level here so the card-click handler uses it instead of
  // re-reading currentLevel from localStorage (which is already advanced after
  // a successful level completion, causing "Play Again" to skip to the next level).
  var _bpMiniRequestedLevel = null;

  // Helper: shared game reset + pointer lock entrance
  function _launchMiniGame(setupFn, modeName) {
    // If a previous game is over (e.g. "Play Again" from a completion overlay),
    // reset all game state silently before re-entering. Without this, isGameOver
    // stays true and the game loop refuses to tick on the next lock.
    if (typeof isGameOver !== 'undefined' && isGameOver && typeof resetGame === 'function') {
      resetGame({ suppressStartScreen: true });
    }
    isDailyChallenge = false;
    gameRng = null;
    setupFn();
    applyWorldModifierHUD();
    try { localStorage.setItem('mineCtris_lastMode', modeName); } catch (_) {}
    if (typeof metricsModePlayed === 'function') metricsModePlayed(modeName);
    hideModeSelect();
    requestPointerLock();
  }

  // Sprint Mini — reuses existing sprint mode
  var sprintMiniCardEl = document.getElementById('mode-card-sprint_mini');
  if (sprintMiniCardEl) {
    sprintMiniCardEl.addEventListener('click', function () {
      _launchMiniGame(function () {
        isSprintMode         = true;
        difficultyMultiplier = SPRINT_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4;
      }, 'sprint_mini');
    });
  }

  // Cheese Race
  var cheeseCardEl = document.getElementById('mode-card-cheese_race');
  if (cheeseCardEl) {
    cheeseCardEl.addEventListener('click', function () {
      _launchMiniGame(function () {
        isCheeseRaceMode     = true;
        difficultyMultiplier = CHEESE_RACE_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4;
      }, 'cheese_race');
    });
  }

  // Block Puzzle Mini — uses saved current level, or the level explicitly
  // requested by launchBlockPuzzleMini (e.g. "Play Again" on the same level).
  var bpCardEl = document.getElementById('mode-card-block_puzzle_mini');
  if (bpCardEl) {
    bpCardEl.addEventListener('click', function () {
      _launchMiniGame(function () {
        var startLevel;
        if (_bpMiniRequestedLevel !== null) {
          startLevel = _bpMiniRequestedLevel;
          _bpMiniRequestedLevel = null; // consume so direct clicks still read storage
        } else {
          var stats = typeof loadMinigameStats === 'function' ? loadMinigameStats() : null;
          startLevel = (stats && stats.block_puzzle.currentLevel) || 1;
        }
        isBlockPuzzleMiniMode = true;
        blockPuzzleMiniLevel  = startLevel;
        difficultyMultiplier  = BLOCK_PUZZLE_MINI_FIXED_MULTIPLIER;
        lastDifficultyTier    = 3;
      }, 'block_puzzle_mini');
    });
  }

  // Dig Mode
  var digCardEl = document.getElementById('mode-card-dig_mode');
  if (digCardEl) {
    digCardEl.addEventListener('click', function () {
      _launchMiniGame(function () {
        isDigMode            = true;
        difficultyMultiplier = DIG_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4;
      }, 'dig_mode');
    });
  }

  // Ultra Mode
  var ultraCardEl = document.getElementById('mode-card-ultra_mode');
  if (ultraCardEl) {
    ultraCardEl.addEventListener('click', function () {
      _launchMiniGame(function () {
        isUltraMode          = true;
        ultraRemainingMs     = ULTRA_DURATION_MS;
        ultraBonusActive     = false;
        difficultyMultiplier = ULTRA_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4;
      }, 'ultra_mode');
    });
  }

  // Init restart/menu buttons on all mini-game complete overlays
  if (typeof initMinigameRestartButtons === 'function') {
    initMinigameRestartButtons();
  }

  // Expose launch helpers for restart buttons in minigames.js
  window.launchCheeseRace = function () {
    var el = document.getElementById('mode-card-cheese_race');
    if (el) el.click();
  };
  window.launchDigMode = function () {
    var el = document.getElementById('mode-card-dig_mode');
    if (el) el.click();
  };
  window.launchUltraMode = function () {
    var el = document.getElementById('mode-card-ultra_mode');
    if (el) el.click();
  };
  window.launchBlockPuzzleMini = function (level) {
    _bpMiniRequestedLevel = (level != null) ? level : null;
    var el = document.getElementById('mode-card-block_puzzle_mini');
    if (el) el.click();
  };

})();

// ── Menu click sounds — delegated listener on mode-select panel ───────────────
(function _initModeSelectSfx() {
  document.addEventListener('click', function (e) {
    var modeSelectEl = document.getElementById('mode-select');
    if (!modeSelectEl || modeSelectEl.style.display === 'none') return;
    // Play click sound on button or mode-card interactions
    if (e.target.closest('button') || e.target.closest('.mode-card:not(.mode-card-locked)') ||
        e.target.closest('.mode-tab-btn')) {
      if (typeof playMenuClickSound === 'function') playMenuClickSound();
    }
  }, true); // capture to play before the click action fires
})();

// ── Keyboard navigation for mode-select screen ───────────────────────────────
(function _initModeSelectKeyboard() {
  function _getNavigableCards() {
    var modeCards = document.getElementById('mode-cards');
    if (!modeCards) return [];
    // All visible, non-locked cards with tabindex
    return Array.from(modeCards.querySelectorAll('.mode-card[tabindex]'))
      .filter(function (c) { return c.offsetParent !== null && !c.classList.contains('mode-card-locked'); });
  }

  document.addEventListener('keydown', function (e) {
    var modeSelectEl = document.getElementById('mode-select');
    if (!modeSelectEl || modeSelectEl.style.display === 'none') return;

    var key = e.key;

    // Escape → click the Back button
    if (key === 'Escape') {
      var backBtn = document.getElementById('mode-select-back');
      if (backBtn) { e.preventDefault(); backBtn.click(); }
      return;
    }

    // Arrow key navigation between mode cards
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') {
      var cards = _getNavigableCards();
      if (!cards.length) return;
      var focused = document.activeElement;
      var idx = cards.indexOf(focused);
      if (idx === -1) {
        // No card focused — focus first
        e.preventDefault();
        cards[0].focus();
        if (typeof playMenuClickSound === 'function') playMenuClickSound();
        return;
      }
      e.preventDefault();
      var next;
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        next = (idx + 1) % cards.length;
      } else {
        next = (idx - 1 + cards.length) % cards.length;
      }
      cards[next].focus();
      if (typeof playMenuClickSound === 'function') playMenuClickSound();
      return;
    }

    // Enter or Space → activate the currently focused mode card
    if (key === 'Enter' || key === ' ') {
      var focused = document.activeElement;
      if (focused && focused.classList.contains('mode-card')) {
        e.preventDefault();
        if (typeof playMenuClickSound === 'function') playMenuClickSound();
        focused.click();
      }
    }
  });
})();
