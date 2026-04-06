// Battle lobby UI and event wiring — called once from init().
// Requires: battle/battle.js loaded first.

function _initBattleHandlers() {
    (function () {
      var battleOverlay      = document.getElementById("battle-overlay");
      var battleChoiceView   = document.getElementById("battle-choice-view");
      var battleCreateView   = document.getElementById("battle-create-view");
      var battleJoinView     = document.getElementById("battle-join-view");
      var battleReadyView    = document.getElementById("battle-ready-view");
      var battleSpectateView = document.getElementById("battle-spectate-view");
      var battleLobbyView    = document.getElementById("battle-lobby-view");

      if (!battleOverlay || typeof battle === "undefined") return;

      function showBattleView(name) {
        [battleChoiceView, battleCreateView, battleJoinView, battleReadyView, battleSpectateView, battleLobbyView].forEach(function (v) {
          if (v) v.style.display = "none";
        });
        var target = {
          choice:   battleChoiceView,
          create:   battleCreateView,
          join:     battleJoinView,
          ready:    battleReadyView,
          spectate: battleSpectateView,
          lobby:    battleLobbyView,
        }[name];
        if (target) target.style.display = "";
      }

      function openBattleOverlay(initialView) {
        hideModeSelect();
        blocker.style.display = "none";
        showBattleView(initialView || "choice");
        battleOverlay.style.display = "flex";
        // Show player's current rank badge in battle lobby
        var rankEl = document.getElementById('battle-player-rank');
        if (rankEl && typeof loadBattleRating === 'function') {
          var rd = loadBattleRating();
          var rankHtml = (typeof getRankedStatusHtml === 'function')
            ? getRankedStatusHtml()
            : (typeof getBattleRankBadgeHtml === 'function' ? getBattleRankBadgeHtml(rd.rating) : '');
          rankEl.innerHTML = rankHtml +
            ' <span class="battle-rank-pts">' + rd.rating + ' pts</span>' +
            ' <span class="battle-rank-record">' + rd.wins + 'W&nbsp;' + rd.losses + 'L&nbsp;' + rd.draws + 'D</span>';
        }
      }

      function _loadLobbyRooms() {
        var listEl   = document.getElementById('battle-lobby-rooms');
        var emptyEl  = document.getElementById('battle-lobby-empty');
        var loadEl   = document.getElementById('battle-lobby-loading');
        if (!listEl) return;
        if (loadEl)  { loadEl.style.display = ''; }
        if (emptyEl) { emptyEl.style.display = 'none'; }
        fetch('https://minectris-leaderboard.workers.dev/battle/rooms/live')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (loadEl) loadEl.style.display = 'none';
            var rooms = (data.rooms || []).slice(0, 8);
            if (rooms.length === 0) {
              if (emptyEl) emptyEl.style.display = '';
              listEl.innerHTML = '';
              return;
            }
            listEl.innerHTML = '';
            rooms.forEach(function (room) {
              var full    = room.spectatorFull;
              var card    = document.createElement('div');
              card.className = 'battle-lobby-card' + (full ? ' battle-lobby-card-full' : '');

              // Header row: room code + badges
              var header = '<div class="blc-header">' +
                '<span class="blc-code">' + room.code + '</span>';
              if (room.isTournament) header += '<span class="blc-badge blc-badge-tournament">&#127942; Tournament</span>';
              var mode = room.mode || (room.isCoop ? 'co-op' : 'battle');
              header += '<span class="blc-badge blc-badge-mode">' + (mode === 'co-op' ? '&#129309; Co-op' : '&#9876; Battle') + '</span>';
              header += '</div>';

              // Players row
              var players = '';
              if (room.players && room.players.length >= 2) {
                var p1 = room.players[0];
                var p2 = room.players[1];
                players = '<div class="blc-players">' +
                  '<span class="blc-player">' +
                    '<span class="blc-pname">' + (p1.name || 'Player 1') + '</span>' +
                    (typeof p1.rating === 'number' ? '<span class="blc-prating">&#9733;&nbsp;' + p1.rating + '</span>' : '') +
                  '</span>' +
                  '<span class="blc-vs">vs</span>' +
                  '<span class="blc-player">' +
                    '<span class="blc-pname">' + (p2.name || 'Player 2') + '</span>' +
                    (typeof p2.rating === 'number' ? '<span class="blc-prating">&#9733;&nbsp;' + p2.rating + '</span>' : '') +
                  '</span>' +
                '</div>';
              } else if (room.playerNames && room.playerNames.length >= 2) {
                // Flat arrays fallback
                var ratings = room.eloRatings || [];
                players = '<div class="blc-players">' +
                  '<span class="blc-player">' +
                    '<span class="blc-pname">' + room.playerNames[0] + '</span>' +
                    (typeof ratings[0] === 'number' ? '<span class="blc-prating">&#9733;&nbsp;' + ratings[0] + '</span>' : '') +
                  '</span>' +
                  '<span class="blc-vs">vs</span>' +
                  '<span class="blc-player">' +
                    '<span class="blc-pname">' + room.playerNames[1] + '</span>' +
                    (typeof ratings[1] === 'number' ? '<span class="blc-prating">&#9733;&nbsp;' + ratings[1] + '</span>' : '') +
                  '</span>' +
                '</div>';
              }

              // Footer: duration + spectator count + watch button
              var durationStr = '';
              if (typeof room.durationSeconds === 'number') {
                var mm = Math.floor(room.durationSeconds / 60);
                var ss = room.durationSeconds % 60;
                durationStr = '<span class="blc-duration">&#128336;&nbsp;' + mm + ':' + (ss < 10 ? '0' : '') + ss + '</span>';
              } else if (typeof room.startedAt === 'number') {
                var elapsed = Math.floor((Date.now() - room.startedAt) / 1000);
                var mm2 = Math.floor(elapsed / 60);
                var ss2 = elapsed % 60;
                durationStr = '<span class="blc-duration">&#128336;&nbsp;' + mm2 + ':' + (ss2 < 10 ? '0' : '') + ss2 + '</span>';
              }
              var footer = '<div class="blc-footer">' +
                durationStr +
                '<span class="blc-spectators">&#128065;&nbsp;' + (room.spectatorCount || 0) + ' watching</span>' +
                '<button class="blc-watch-btn" data-code="' + room.code + '" data-full="' + full + '"' + (full ? ' disabled' : '') + '>' +
                  (full ? 'Full' : 'Watch') +
                '</button>' +
              '</div>';

              card.innerHTML = header + players + footer;
              listEl.appendChild(card);
            });
            listEl.querySelectorAll('.blc-watch-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                if (this.disabled || this.dataset.full === 'true') return;
                _startWatchRoom(this.dataset.code);
              });
            });
          })
          .catch(function () {
            if (loadEl) loadEl.style.display = 'none';
            if (emptyEl) { emptyEl.textContent = 'Could not load matches.'; emptyEl.style.display = ''; }
          });
      }

      function closeBattleOverlay() {
        battleOverlay.style.display = "none";
        battle.disconnect();
        blocker.style.display = "flex";
        instructions.style.display = "";
      }

      // Battle mode card click
      var battleCardEl = document.getElementById("mode-card-battle");
      if (battleCardEl) {
        battleCardEl.addEventListener("click", function () {
          openBattleOverlay("choice");
        });
      }

      // ── Ready state tracking ──
      var _battleHostReady  = false;
      var _battleGuestReady = false;
      // Match mode selected by host (default: survival)
      var _battleSelectedMode = 'survival';
      // Whether current queued match is ranked
      var _battleQueueIsRanked = false;

      function _updateBattleReadyIndicators() {
        var hostEl  = document.getElementById("battle-host-ready-indicator");
        var guestEl = document.getElementById("battle-guest-ready-indicator");
        var label   = battle.isHost ? "You" : "Opponent";
        var otherLabel = battle.isHost ? "Opponent" : "You";
        if (hostEl) {
          hostEl.textContent  = (_battleHostReady  ? "\u2611" : "\u2633") + " " + label;
          hostEl.className    = _battleHostReady  ? "ready" : "";
        }
        if (guestEl) {
          guestEl.textContent = (_battleGuestReady ? "\u2611" : "\u2633") + " " + otherLabel;
          guestEl.className   = _battleGuestReady ? "ready" : "";
        }
      }

      // ── Register battle state-change handler ──
      battle.on("state_change", function (data) {
        if (data.state === "ready") {
          // Stop range-expansion display — opponent found
          if (_rankedQueueExpandTimer) { clearInterval(_rankedQueueExpandTimer); _rankedQueueExpandTimer = null; }
          var readyCodeEl = document.getElementById("battle-ready-code");
          if (readyCodeEl) readyCodeEl.textContent = "Room: " + (data.roomCode || "");
          _battleHostReady  = false;
          _battleGuestReady = false;
          _setBattleMode('survival');
          _updateBattleReadyIndicators();
          _setupReadyViewModeUI();
          showBattleView("ready");
        } else if (data.state === "disconnected") {
          // If battle result screen is showing, let it handle the return-to-lobby flow
          var resultEl = document.getElementById("battle-result-screen");
          if (resultEl && resultEl.style.display !== "none") return;
          closeBattleOverlay();
        }
      });

      battle.on("timeout", function () {
        var statusEl = document.getElementById("battle-status-msg");
        if (statusEl) statusEl.textContent = "No one joined. Room closed.";
        setTimeout(function () { closeBattleOverlay(); }, 2000);
      });

      battle.on("opponent_left", function () {
        // If mid-game, surviving player wins automatically
        if (battle.state === BattleState.IN_GAME && !isGameOver) {
          if (typeof triggerBattleResult === 'function') triggerBattleResult('win');
        }
        if (typeof battleHud !== 'undefined') battleHud.setConnectionStatus('red');
        if (typeof chatEmotes !== 'undefined') chatEmotes.onSessionEnd();
      });

      // ── Choice view buttons ──
      var battleCreateBtn = document.getElementById("battle-create-btn");
      if (battleCreateBtn) {
        battleCreateBtn.addEventListener("click", function () {
          _battleQueueIsRanked = false;
          showBattleView("create");
          var roomCodeEl   = document.getElementById("battle-room-code");
          var statusMsg    = document.getElementById("battle-status-msg");
          var copyFeedback = document.getElementById("battle-copy-feedback");
          if (roomCodeEl)   roomCodeEl.textContent   = "\u2026";
          if (statusMsg)    statusMsg.textContent    = "";
          if (copyFeedback) copyFeedback.textContent = "";
          battle.createRoom().then(function (code) {
            if (roomCodeEl) roomCodeEl.textContent = code;
            // If this is a tournament match, register the room code for spectators
            if (isTournamentMatch && typeof tournamentLobby !== 'undefined' &&
                typeof tournamentLobby.setMatchRoomCode === 'function') {
              tournamentLobby.setMatchRoomCode(code);
            }
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Failed to create room.";
          });
        });
      }

      var battleJoinBtnChoice = document.getElementById("battle-join-btn-choice");
      if (battleJoinBtnChoice) {
        battleJoinBtnChoice.addEventListener("click", function () {
          showBattleView("join");
          var joinStatusEl = document.getElementById("battle-join-status-msg");
          if (joinStatusEl) joinStatusEl.textContent = "";
          var codeInput = document.getElementById("battle-code-input");
          if (codeInput) { codeInput.value = ""; codeInput.focus(); }
        });
      }

      var battleQmBtn = document.getElementById("battle-quickmatch-btn");
      if (battleQmBtn) {
        battleQmBtn.addEventListener("click", function () {
          _battleQueueIsRanked = false;
          showBattleView("create");
          var roomCodeEl   = document.getElementById("battle-room-code");
          var statusMsg    = document.getElementById("battle-status-msg");
          var waitingEl    = document.getElementById("battle-waiting-spinner");
          var rankedStatusEl = document.getElementById("battle-ranked-queue-status");
          if (roomCodeEl) roomCodeEl.textContent = "\u2026";
          if (statusMsg)  statusMsg.textContent  = "";
          if (rankedStatusEl) rankedStatusEl.style.display = "none";
          battle.quickMatch().then(function (data) {
            if (data.waiting) {
              // We are host waiting for an opponent
              if (roomCodeEl) roomCodeEl.textContent = data.roomCode;
              if (waitingEl) waitingEl.textContent = "\u9696 Quick match \u2014 waiting for opponent\u2026";
            } else {
              // Joining opponent's room as guest
              if (roomCodeEl) roomCodeEl.textContent = data.roomCode;
              if (waitingEl) waitingEl.textContent = "\u9696 Found opponent \u2014 connecting\u2026";
            }
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Quick match failed. Try again.";
          });
        });
      }

      // ── Ranked match button ──
      var _rankedQueueExpandTimer = null;
      var _rankedQueueStartTime   = 0;
      var battleRankedBtn = document.getElementById("battle-ranked-btn");
      if (battleRankedBtn) {
        battleRankedBtn.addEventListener("click", function () {
          _battleQueueIsRanked = true;
          showBattleView("create");
          var roomCodeEl     = document.getElementById("battle-room-code");
          var statusMsg      = document.getElementById("battle-status-msg");
          var waitingEl      = document.getElementById("battle-waiting-spinner");
          var rankedStatusEl = document.getElementById("battle-ranked-queue-status");
          var copyLinkBtn    = document.getElementById("battle-copy-link-btn");
          if (roomCodeEl) roomCodeEl.textContent = "\u2026";
          if (statusMsg)  statusMsg.textContent  = "";
          if (copyLinkBtn) copyLinkBtn.style.display = "none"; // no invite links for ranked
          if (rankedStatusEl) {
            rankedStatusEl.style.display = "";
            var inPlacement = typeof isInPlacement === 'function' && isInPlacement();
            if (inPlacement) {
              var prog = typeof getPlacementProgress === 'function' ? getPlacementProgress() : '';
              rankedStatusEl.innerHTML = '<span class="battle-rank-placement">\u26A1 Placement ' + prog + '</span> &mdash; play ranked to calibrate your tier';
            } else {
              rankedStatusEl.innerHTML = '\u274F Searching within <strong>\u00B1200 ELO</strong>\u2026';
            }
          }
          var myRating = 1000;
          if (typeof loadBattleRating === 'function') myRating = loadBattleRating().rating;

          // Interval that updates the search-range display every 15 s
          function _startRangeExpansionDisplay() {
            if (_rankedQueueExpandTimer) clearInterval(_rankedQueueExpandTimer);
            _rankedQueueStartTime = Date.now();
            _rankedQueueExpandTimer = setInterval(function () {
              if (!rankedStatusEl || rankedStatusEl.style.display === "none") return;
              var elapsed = Date.now() - _rankedQueueStartTime;
              var range = typeof getRankedSearchRange === 'function'
                ? getRankedSearchRange(elapsed)
                : (200 + Math.floor(elapsed / 15000) * 50);
              rankedStatusEl.innerHTML = '\u274F Searching within <strong>\u00B1' + range + ' ELO</strong>\u2026';
            }, RANKED_EXPAND_INTERVAL_MS || 15000);
          }

          battle.rankedMatch(myRating).then(function (data) {
            if (data.waiting) {
              if (roomCodeEl) roomCodeEl.textContent = data.roomCode;
              if (waitingEl) waitingEl.textContent = "\u9696 Ranked queue \u2014 searching for opponent\u2026";
              _startRangeExpansionDisplay();
            } else {
              if (roomCodeEl) roomCodeEl.textContent = data.roomCode;
              if (waitingEl) waitingEl.textContent = "\u9696 Found ranked opponent \u2014 connecting\u2026";
            }
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Ranked match failed. Try again.";
            if (rankedStatusEl) rankedStatusEl.style.display = "none";
          });
        });
      }

      var battleChoiceCancelBtn = document.getElementById("battle-choice-cancel-btn");
      if (battleChoiceCancelBtn) {
        battleChoiceCancelBtn.addEventListener("click", function () {
          closeBattleOverlay();
        });
      }

      // ── Create view buttons ──
      var battleCopyLinkBtn = document.getElementById("battle-copy-link-btn");
      if (battleCopyLinkBtn) {
        battleCopyLinkBtn.addEventListener("click", function () {
          var code = battle.roomCode;
          if (!code) return;
          var url = window.location.origin + window.location.pathname + "?battle=" + code;
          var feedbackEl = document.getElementById("battle-copy-feedback");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              if (feedbackEl) {
                feedbackEl.textContent = "\u2713 Copied!";
                setTimeout(function () { feedbackEl.textContent = ""; }, 2000);
              }
            }).catch(function () { window.prompt("Copy invite link:", url); });
          } else {
            window.prompt("Copy invite link:", url);
          }
        });
      }

      var battleCreateCancelBtn = document.getElementById("battle-create-cancel-btn");
      if (battleCreateCancelBtn) {
        battleCreateCancelBtn.addEventListener("click", function () {
          if (_rankedQueueExpandTimer) { clearInterval(_rankedQueueExpandTimer); _rankedQueueExpandTimer = null; }
          var copyLinkBtn = document.getElementById("battle-copy-link-btn");
          if (copyLinkBtn) copyLinkBtn.style.display = "";
          closeBattleOverlay();
        });
      }

      // ── Join view ──
      var battleCodeInput = document.getElementById("battle-code-input");
      if (battleCodeInput) {
        battleCodeInput.addEventListener("input", function () {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        });
        battleCodeInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            var confirmBtn = document.getElementById("battle-join-confirm-btn");
            if (confirmBtn) confirmBtn.click();
          }
        });
      }

      var battleJoinConfirmBtn = document.getElementById("battle-join-confirm-btn");
      if (battleJoinConfirmBtn) {
        battleJoinConfirmBtn.addEventListener("click", function () {
          var code = battleCodeInput ? battleCodeInput.value.trim().toUpperCase() : "";
          var joinStatusEl = document.getElementById("battle-join-status-msg");
          if (!code || code.length !== 4) {
            if (joinStatusEl) joinStatusEl.textContent = "Enter a 4-character code.";
            return;
          }
          if (joinStatusEl) joinStatusEl.textContent = "Joining\u2026";
          battle.joinRoom(code).then(function () {
            if (joinStatusEl) joinStatusEl.textContent = "";
            showBattleView("create");
            var roomCodeEl = document.getElementById("battle-room-code");
            if (roomCodeEl) roomCodeEl.textContent = code;
            var waitingEl = document.getElementById("battle-waiting-spinner");
            if (waitingEl) waitingEl.textContent = "\u9696 Connected \u2014 waiting for opponent\u2026";
          }).catch(function (err) {
            if (joinStatusEl) joinStatusEl.textContent = (err && err.message) ? err.message : "Failed to join.";
          });
        });
      }

      var battleJoinCancelBtn = document.getElementById("battle-join-cancel-btn");
      if (battleJoinCancelBtn) {
        battleJoinCancelBtn.addEventListener("click", function () {
          battle.disconnect();
          showBattleView("choice");
        });
      }

      // ── Watch button (opens spectator lobby) ──
      var battleWatchBtn = document.getElementById("battle-watch-btn");
      if (battleWatchBtn) {
        battleWatchBtn.addEventListener("click", function () {
          showBattleView("lobby");
          _loadLobbyRooms();
        });
      }

      // ── Spectator lobby: refresh and enter-code buttons ──
      var battleLobbyRefreshBtn = document.getElementById("battle-lobby-refresh-btn");
      if (battleLobbyRefreshBtn) {
        battleLobbyRefreshBtn.addEventListener("click", function () {
          _loadLobbyRooms();
        });
      }

      var battleLobbyCodeBtn = document.getElementById("battle-lobby-code-btn");
      if (battleLobbyCodeBtn) {
        battleLobbyCodeBtn.addEventListener("click", function () {
          showBattleView("spectate");
          var inp = document.getElementById("battle-spectate-code-input");
          var msg = document.getElementById("battle-spectate-status-msg");
          if (inp) { inp.value = ""; inp.focus(); }
          if (msg) msg.textContent = "";
        });
      }

      var battleLobbyBackBtn = document.getElementById("battle-lobby-back-btn");
      if (battleLobbyBackBtn) {
        battleLobbyBackBtn.addEventListener("click", function () {
          showBattleView("choice");
        });
      }

      var spectateCodeInput = document.getElementById("battle-spectate-code-input");
      if (spectateCodeInput) {
        spectateCodeInput.addEventListener("input", function () {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        });
        spectateCodeInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            var btn = document.getElementById("battle-spectate-confirm-btn");
            if (btn) btn.click();
          }
        });
      }

      var spectateConfirmBtn = document.getElementById("battle-spectate-confirm-btn");
      if (spectateConfirmBtn) {
        spectateConfirmBtn.addEventListener("click", function () {
          var code = spectateCodeInput ? spectateCodeInput.value.trim().toUpperCase() : "";
          var msgEl = document.getElementById("battle-spectate-status-msg");
          if (!code || code.length !== 4) {
            if (msgEl) msgEl.textContent = "Enter a 4-character code.";
            return;
          }
          if (msgEl) msgEl.textContent = "Connecting\u2026";
          _startWatchRoom(code);
        });
      }

      var spectateCancelBtn = document.getElementById("battle-spectate-cancel-btn");
      if (spectateCancelBtn) {
        spectateCancelBtn.addEventListener("click", function () {
          // Return to lobby if available, otherwise choice
          showBattleView("lobby");
          _loadLobbyRooms();
        });
      }

      function _startWatchRoom(code) {
        var msgEl = document.getElementById("battle-spectate-status-msg");
        battle.watchRoom(code).then(function () {
          // Connected — close battle overlay, show spectator overlay
          battleOverlay.style.display = "none";
          _openSpectatorOverlay(code);
        }).catch(function (err) {
          var text = (err && err.message) || "Cannot spectate this room.";
          if (err && err.full) text = "Spectator cap reached — room is full.";
          if (msgEl) msgEl.textContent = text;
          else {
            // might have been triggered from live-rooms list (choice view)
            showBattleView("spectate");
            var msgEl2 = document.getElementById("battle-spectate-status-msg");
            if (msgEl2) msgEl2.textContent = text;
          }
        });
      }

      // ── Ready view ──
      var battleStartBtn = document.getElementById("battle-start-btn");
      if (battleStartBtn) {
        battleStartBtn.addEventListener("click", function () {
          battleStartBtn.disabled = true;
          battleStartBtn.textContent = "Waiting\u2026";
          if (battle.isHost) {
            _battleHostReady = true;
          } else {
            _battleGuestReady = true;
          }
          _updateBattleReadyIndicators();
          battle.send({ type: "battle_ready" });
        });
      }

      // Opponent signals ready
      battle.on("battle_ready", function () {
        if (battle.isHost) {
          _battleGuestReady = true;
        } else {
          _battleHostReady = true;
        }
        _updateBattleReadyIndicators();
        // If both ready, host starts the game
        if (_battleHostReady && _battleGuestReady && battle.isHost) {
          battle.send({ type: "battle_start", matchMode: _battleSelectedMode });
          battleMatchMode = _battleSelectedMode;
          _startBattleGame();
        }
      });

      // Guest receives battle_start from host (includes match mode)
      battle.on("battle_start", function (msg) {
        if (!battle.isHost) {
          battleMatchMode = msg.matchMode || 'survival';
          _startBattleGame();
        }
      });

      // Handle opponent's game-over broadcast → this player wins
      battle.on("battle_game_over", function (msg) {
        if (msg && msg.stats) battleOpponentStats = msg.stats;
        if (!isGameOver && isBattleMode) {
          if (typeof triggerBattleResult === 'function') triggerBattleResult('win');
        }
      });

      function _runBattleCountdown(onComplete) {
        var countdownEl = document.getElementById("battle-countdown-overlay");
        var numberEl    = document.getElementById("battle-countdown-number");
        if (!countdownEl || !numberEl) { onComplete(); return; }

        var steps = ["3", "2", "1", "GO!"];
        var idx   = 0;

        countdownEl.style.display = "flex";

        function _showStep() {
          if (idx >= steps.length) {
            countdownEl.style.display = "none";
            onComplete();
            return;
          }
          var txt = steps[idx++];
          numberEl.textContent = txt;
          numberEl.className   = (txt === "GO!") ? "go" : "";
          // Re-trigger CSS animation each step
          numberEl.style.animation = "none";
          void numberEl.offsetWidth;
          numberEl.style.animation = "";
          setTimeout(_showStep, 900);
        }
        _showStep();
      }

      function _startBattleGame() {
        var _mode = battleMatchMode; // capture before resetGame clears it
        battle.startGame();
        battleOverlay.style.display = "none";

        // Reset world and set battle mode flags before the countdown
        resetGame();
        isBattleMode = true;
        battleIsRanked = _battleQueueIsRanked; // persist ranked flag across resetGame
        _battleQueueIsRanked = false;          // clear for next match
        if (typeof metricsModePlayed === 'function') metricsModePlayed('battle');
        battleMatchMode = _mode; // restore after resetGame reset it to 'survival'
        battleScoreRaceRemainingMs = 180000;
        battleOpponentScore = 0;
        battleOpponentLines = 0;
        battleOpponentRating = 1000; // reset; updated when opponent's battle_rating arrives

        // Exchange ratings with opponent so Elo can be computed accurately
        if (typeof loadBattleRating === 'function') {
          var _myDisplayName = 'Player';
          try { _myDisplayName = localStorage.getItem('mineCtris_displayName') || 'Player'; } catch (_) {}
          battle.send({ type: 'battle_rating', rating: loadBattleRating().rating, playerName: _myDisplayName });
        }
        // Start at Level 3 equivalent speed; escalates via updateDifficulty offset
        difficultyMultiplier = BATTLE_START_MULTIPLIER;
        lastDifficultyTier   = BATTLE_START_TIER;

        // Show battle HUD badge and opponent mini-map
        var battleBadgeEl = document.getElementById("battle-mode-badge");
        if (battleBadgeEl) battleBadgeEl.style.display = "block";
        if (typeof battleHud !== 'undefined') {
          battleHud.show();
          battleHud.setConnectionStatus('green');
        }

        // Show Score Race timer HUD if needed
        var srHudEl = document.getElementById("battle-score-race-hud");
        if (srHudEl) srHudEl.style.display = (battleMatchMode === 'score_race') ? '' : 'none';
        if (battleMatchMode === 'score_race' && typeof _updateScoreRaceTimerHud === 'function') {
          _updateScoreRaceTimerHud();
        }

        // Run 3-2-1-GO! then hand control to the player
        _runBattleCountdown(function () {
          requestPointerLock();
        });
      }

      // Cache opponent's rating for accurate Elo computation
      battle.on("battle_rating", function (msg) {
        if (msg && typeof msg.rating === 'number') {
          battleOpponentRating = msg.rating;
        }
      });

      // ── Incoming chat emote (wheel-based) from opponent ──
      battle.on("chat_emote", function (data) {
        if (typeof chatEmotes !== 'undefined') chatEmotes.receive(data);
      });

      // ── Opponent mini-map event handlers ──
      battle.on("battle_board", function (msg) {
        if (typeof battleHud !== 'undefined') {
          battleHud.update(msg.cols, msg.score, msg.level);
          // Apply opponent guild cosmetics on first message that carries them
          if (msg.guildEmblem !== undefined || msg.guildBoardSkin !== undefined) {
            battleHud.setOpponentGuild(
              msg.guildEmblem || null,
              msg.guildBoardSkin || null,
              msg.guildBannerColor || null,
              !!msg.guildIsLegendary
            );
          }
        }
        // Cache opponent's latest score/lines for Score Race comparison
        if (typeof msg.score === 'number') battleOpponentScore = msg.score;
        if (typeof msg.linesCleared === 'number') battleOpponentLines = msg.linesCleared;
      });

      battle.on("battle_attack", function (msg) {
        // Counter power-up: absorb and reflect at 50% (min 1 row)
        if (counterActive) {
          counterActive = false;
          const reflectRows = Math.max(1, Math.ceil((msg.lines || 1) * 0.5));
          const reflectSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
          battle.send({ type: 'battle_attack', lines: reflectRows, gapSeed: reflectSeed });
          battleGarbageSent += reflectRows;
          if (typeof onMissionBattleGarbageSent === 'function') onMissionBattleGarbageSent(reflectRows);
          if (typeof battleHud !== 'undefined') {
            battleHud.showOutgoingAttack(reflectRows);
          }
          showCraftedBanner("Counter! Reflected " + reflectRows + " row(s).");
          if (typeof updatePowerupHUD === 'function') updatePowerupHUD();
          return; // do not queue the incoming garbage
        }
        if (typeof battleHud !== 'undefined') {
          battleHud.flashLineClear();
          battleHud.showGarbage();
        }
        // Queue the incoming garbage rows for delivery on the next piece spawn.
        battleGarbageReceived += (msg.lines || 1);
        if (typeof queueGarbage === 'function') {
          queueGarbage(msg.lines || 1, msg.gapSeed || 1);
        }
        // Update garbage meter to reflect new pending total
        if (typeof battleHud !== 'undefined' && typeof battleHud.updateGarbageMeter === 'function') {
          battleHud.updateGarbageMeter((typeof getPendingGarbageLines === 'function') ? getPendingGarbageLines() : (msg.lines || 1));
        }
        // Incoming attack vignette flash + thud SFX
        if (typeof battleFx !== 'undefined') battleFx.showIncomingAttack(msg.lines || 1);
      });

      var battleReadyCancelBtn = document.getElementById("battle-ready-cancel-btn");
      if (battleReadyCancelBtn) {
        battleReadyCancelBtn.addEventListener("click", function () { closeBattleOverlay(); });
      }

      // ── Private room toggle (host only) ──
      var _privateCheckbox = document.getElementById("battle-private-checkbox");
      var _privateToggleEl = document.getElementById("battle-private-toggle");
      if (_privateCheckbox) {
        _privateCheckbox.addEventListener("change", function () {
          var isPrivate = _privateCheckbox.checked;
          battle.send({ type: 'room_set_private', isPrivate: isPrivate });
        });
      }
      battle.on("spectator_joined", function (data) {
        _battleSpectatorCount = data.spectatorCount || 0;
        _updateSpectatorCountDisplay();
        // If in-game, broadcast board state to newly joined spectator
        if (battle.state === BattleState.IN_GAME && typeof broadcastBoardState === 'function') {
          broadcastBoardState();
        }
        // Tournament achievement + season mission: spectator watching your match
        if (!battle.isSpectator && battle.state === BattleState.IN_GAME) {
          if (typeof achOnSpectatorCountUpdate === 'function') achOnSpectatorCountUpdate(_battleSpectatorCount);
          if (typeof onSeasonMissionSpectatorWatchedYourMatch === 'function') onSeasonMissionSpectatorWatchedYourMatch();
        }
      });

      battle.on("spectator_count", function (data) {
        _battleSpectatorCount = data.spectatorCount || 0;
        _updateSpectatorCountDisplay();
        if (!battle.isSpectator && battle.state === BattleState.IN_GAME) {
          if (typeof achOnSpectatorCountUpdate === 'function') achOnSpectatorCountUpdate(_battleSpectatorCount);
        }
      });

      window._battleSpectatorCount = 0; // module-level for cross-file access
      function _updateSpectatorCountDisplay() {
        var el = document.getElementById("battle-spectator-count-display");
        if (el) {
          el.textContent = _battleSpectatorCount > 0 ? '\uD83D\uDC41 ' + _battleSpectatorCount + ' watching' : '';
        }
      }


      _initBattleSpectator();

      // ── Friends integration — expose overlay entry points ──────────────────
      // Called by friends.js when the local player sends an invite and needs to
      // sit in the waiting-host view with a room already created.
      window._friendsOpenBattleCreate = function (roomCode) {
        openBattleOverlay('create');
        var roomCodeEl = document.getElementById('battle-room-code');
        if (roomCodeEl) roomCodeEl.textContent = roomCode;
      };

      // Called by friends.js when the local player accepts a battle invite.
      window._friendsOpenBattleWithCode = function (roomCode) {
        openBattleOverlay('join');
        var ci = document.getElementById('battle-code-input');
        if (ci) { ci.value = roomCode.toUpperCase(); ci.focus(); }
        var joinStatusEl = document.getElementById('battle-join-status-msg');
        if (joinStatusEl) joinStatusEl.textContent = 'Friend invite — press Join!';
      };

    })();
}