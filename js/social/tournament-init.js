// Tournament lobby UI and event wiring — called once from init().
// Requires: social/tournament.js loaded first.

function _initTournamentHandlers() {
    (function () {
      var tournOverlay        = document.getElementById('tournament-overlay');
      var tournListView       = document.getElementById('tourn-list-view');
      var tournBracketView    = document.getElementById('tourn-bracket-view');
      var tournListBody       = document.getElementById('tourn-list-body');
      var tournBracketTitle   = document.getElementById('tourn-bracket-title');
      var tournBracketStatus  = document.getElementById('tourn-bracket-status-badge');
      var tournBracketMeta    = document.getElementById('tourn-bracket-meta');
      var tournBracketTree    = document.getElementById('tourn-bracket-tree');
      var tournRegPanel       = document.getElementById('tourn-reg-panel');
      var tournRegInfo        = document.getElementById('tourn-reg-info');
      var tournRegBtn         = document.getElementById('tourn-register-btn');
      var tournRegFeedback    = document.getElementById('tourn-reg-feedback');
      var tournMatchEntry     = document.getElementById('tourn-match-entry');
      var tournMatchCountdown = document.getElementById('tourn-match-countdown');
      var tournJoinMatchBtn   = document.getElementById('tourn-join-match-btn');
      var tournTabAll         = document.getElementById('tourn-tab-all');
      var tournTabMine        = document.getElementById('tourn-tab-mine');
      var tournTabPast        = document.getElementById('tourn-tab-past');
      var tournChampionBanner = document.getElementById('tourn-champion-banner');
      // Create panel
      var tournCreatePanelBtn = document.getElementById('tourn-tab-create-btn');
      var tournCreatePanel    = document.getElementById('tourn-create-panel');
      var tournCreateName     = document.getElementById('tourn-create-name');
      var tournCreateSize     = document.getElementById('tourn-create-size');
      var tournCreateMode     = document.getElementById('tourn-create-mode');
      var tournCreateSubmit   = document.getElementById('tourn-create-submit-btn');
      var tournCreateCancel   = document.getElementById('tourn-create-cancel-btn');
      var tournCreateFeedback = document.getElementById('tourn-create-feedback');
      // Chat
      var tournChatPanel      = document.getElementById('tourn-chat-panel');
      var tournChatMessages   = document.getElementById('tourn-chat-messages');
      var tournChatInput      = document.getElementById('tourn-chat-input');
      var tournChatSend       = document.getElementById('tourn-chat-send');

      if (!tournOverlay || typeof tournamentLobby === 'undefined') return;

      var _activeTournId  = null;
      var _activeTab      = 'all'; // 'all' | 'mine' | 'past'
      var _chatPollTimer  = null;
      var _lastChatCount  = 0;

      // ── View switching ──

      function _showView(name) {
        tournListView.style.display    = name === 'list'    ? '' : 'none';
        tournBracketView.style.display = name === 'bracket' ? '' : 'none';
      }

      // ── Open / close ──

      function openTournamentOverlay() {
        hideModeSelect();
        blocker.style.display = 'none';
        tournOverlay.style.display = 'flex';
        _activeTab = 'all';
        _hideCreatePanel();
        _renderList();
        _showView('list');
      }

      function closeTournamentOverlay() {
        tournamentLobby.stopCountdown();
        _stopChatPoll();
        tournOverlay.style.display = 'none';
        blocker.style.display = 'flex';
        instructions.style.display = '';
      }

      // ── Tab rendering ──

      function _setTab(tab) {
        _activeTab = tab;
        _hideCreatePanel();
        if (tournTabAll)  tournTabAll.classList.toggle('tourn-tab-active',  tab === 'all');
        if (tournTabMine) tournTabMine.classList.toggle('tourn-tab-active', tab === 'mine');
        if (tournTabPast) tournTabPast.classList.toggle('tourn-tab-active', tab === 'past');
        if (tournCreatePanelBtn) tournCreatePanelBtn.classList.remove('tourn-tab-active');
        _renderList();
      }

      if (tournTabAll)  tournTabAll.addEventListener('click',  function () { _setTab('all'); });
      if (tournTabMine) tournTabMine.addEventListener('click', function () { _setTab('mine'); });
      if (tournTabPast) tournTabPast.addEventListener('click', function () { _setTab('past'); });

      // ── Create tournament panel ──

      function _hideCreatePanel() {
        if (tournCreatePanel)    tournCreatePanel.style.display  = 'none';
        if (tournListBody)       tournListBody.style.display     = '';
        if (tournCreateFeedback) tournCreateFeedback.textContent = '';
        if (tournCreatePanelBtn) tournCreatePanelBtn.classList.remove('tourn-tab-active');
      }

      function _showCreatePanel() {
        if (tournCreatePanel) tournCreatePanel.style.display = '';
        if (tournListBody)    tournListBody.style.display    = 'none';
        if (tournCreatePanelBtn) tournCreatePanelBtn.classList.add('tourn-tab-active');
        if (tournTabAll)  tournTabAll.classList.remove('tourn-tab-active');
        if (tournTabMine) tournTabMine.classList.remove('tourn-tab-active');
        if (tournTabPast) tournTabPast.classList.remove('tourn-tab-active');
        if (tournCreateName) tournCreateName.focus();
      }

      if (tournCreatePanelBtn) {
        tournCreatePanelBtn.addEventListener('click', function () {
          if (tournCreatePanel && tournCreatePanel.style.display === 'none') {
            _showCreatePanel();
          } else {
            _hideCreatePanel();
            _setTab(_activeTab);
          }
        });
      }

      if (tournCreateCancel) {
        tournCreateCancel.addEventListener('click', function () {
          _hideCreatePanel();
          _setTab('all');
        });
      }

      if (tournCreateSubmit) {
        tournCreateSubmit.addEventListener('click', function () {
          var name      = tournCreateName  ? tournCreateName.value.trim()        : '';
          var sizeVal   = tournCreateSize  ? parseInt(tournCreateSize.value, 10) : 8;
          var gameMode  = tournCreateMode  ? tournCreateMode.value               : 'Survival';

          if (!name) {
            if (tournCreateFeedback) tournCreateFeedback.textContent = 'Enter a tournament name.';
            return;
          }

          tournCreateSubmit.disabled = true;
          var result = tournamentLobby.createTournament(name, sizeVal, gameMode);
          if (result.ok) {
            if (tournCreateFeedback) {
              tournCreateFeedback.innerHTML = '&#10003; Created! Opening bracket&#8230;';
            }
            setTimeout(function () {
              _hideCreatePanel();
              tournCreateSubmit.disabled = false;
              if (tournCreateName) tournCreateName.value = '';
              _openBracketView(result.id);
            }, 800);
          } else {
            if (tournCreateFeedback) tournCreateFeedback.textContent = 'Error: ' + result.reason;
            tournCreateSubmit.disabled = false;
          }
        });
      }

      // Allow Enter key to submit create form
      if (tournCreateName) {
        tournCreateName.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); if (tournCreateSubmit) tournCreateSubmit.click(); }
        });
      }

      // ── List rendering ──

      function _statusLabel(status) {
        if (status === 'open')        return '<span class="tourn-status-badge tourn-status-open">OPEN</span>';
        if (status === 'in_progress') return '<span class="tourn-status-badge tourn-status-in_progress">&#9654; LIVE</span>';
        return '<span class="tourn-status-badge tourn-status-completed">DONE</span>';
      }

      function _pipBar(count, max, isMine) {
        var html = '<div class="tourn-player-count-bar">';
        for (var i = 0; i < max; i++) {
          var cls = 'tourn-count-pip' + (i < count ? (isMine && i === count - 1 ? ' mine' : ' filled') : '');
          html += '<div class="' + cls + '"></div>';
        }
        html += '</div>';
        return html;
      }

      function _fmtDate(ts) {
        var d = new Date(ts);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      }

      function _renderList() {
        if (!tournListBody) return;
        var all  = tournamentLobby.getAll();
        var regs = tournamentLobby.getRegistrations();

        var items;
        if (_activeTab === 'mine') {
          items = all.filter(function (t) { return !!regs[t.id]; });
        } else if (_activeTab === 'past') {
          items = typeof tournamentLobby.getPast === 'function'
            ? tournamentLobby.getPast()
            : all.filter(function (t) { return t.status === 'completed'; });
        } else {
          // 'all' — only show active (open / in_progress) tournaments
          items = all.filter(function (t) { return t.status !== 'completed'; });
        }

        var emptyMsg = _activeTab === 'mine' ? 'You have not joined any tournaments yet.'
          : _activeTab === 'past' ? 'No past tournaments.'
          : 'No tournaments available.';

        if (items.length === 0) {
          tournListBody.innerHTML = '<div class="tourn-empty-msg">' + emptyMsg + '</div>';
          return;
        }

        tournListBody.innerHTML = items.map(function (t) {
          var isReg      = !!regs[t.id];
          var isMine     = isReg;
          var prizeStyle = 'color:' + (t.prize ? t.prize.color : '#ffd700') + ';';
          var size       = t.bracketSize || 8;
          var modeTag    = t.gameMode
            ? '<span class="tourn-mode-tag">' + t.gameMode + '</span>'
            : '';

          if (t.status === 'completed') {
            // Past tournament card: show date, champion, participants
            var champHtml = t.winner
              ? '<div class="tourn-past-champion">&#127942; ' + t.winner + '</div>'
              : '';
            var myBadge = isReg ? '<span class="tourn-registered-badge">&#10003; Entered</span>' : '';
            return '<div class="tourn-item tourn-item-past" data-id="' + t.id + '">' +
              '<div class="tourn-item-left">' +
                '<div class="tourn-item-name">' + t.name + '</div>' +
                '<div class="tourn-item-meta">' +
                  _fmtDate(t.completedAt || t.createdAt) + ' &nbsp;&bull;&nbsp; ' +
                  t.players.length + ' players' +
                '</div>' +
                champHtml + myBadge +
              '</div>' +
              '<span class="tourn-item-prize" style="' + prizeStyle + '">' + (t.prize ? t.prize.label : '') + '</span>' +
            '</div>';
          }

          var regBadge = isReg ? '<span class="tourn-registered-badge">&#10003; Registered</span>' : '';
          return '<div class="tourn-item" data-id="' + t.id + '">' +
            '<div class="tourn-item-left">' +
              '<div class="tourn-item-name">' + t.name + '</div>' +
              '<div class="tourn-item-meta">' +
                t.players.length + ' / ' + size + ' players &nbsp;&bull;&nbsp; ' + _statusLabel(t.status) +
                (modeTag ? ' &nbsp;&bull;&nbsp; ' + modeTag : '') +
              '</div>' +
              _pipBar(t.players.length, size, isMine) +
              regBadge +
            '</div>' +
            '<span class="tourn-item-prize" style="' + prizeStyle + '">' + (t.prize ? t.prize.label : '') + '</span>' +
          '</div>';
        }).join('');

        // Bind click handlers
        var itemEls = tournListBody.querySelectorAll('.tourn-item');
        itemEls.forEach(function (el) {
          el.addEventListener('click', function () {
            _openBracketView(el.getAttribute('data-id'));
          });
        });
      }

      // ── Bracket rendering helpers ──

      function _matchSlotHtml(match, myName, champName) {
        if (!match) return '';
        var isMine = (match.p1 && match.p1.name === myName) || (match.p2 && match.p2.name === myName);
        var isLive = !!match.live;
        var slotCls = 'tourn-match-slot' + (isLive ? ' live' : '') + (isMine ? ' mine' : '');
        var liveDot = isLive ? '<div class="tourn-live-dot">&#9679; LIVE</div>' : '';

        // Watch button for live matches with a known room code
        var watchBtn = '';
        if (isLive && match.roomCode) {
          var spec = match.spectatorCount || 0;
          var full = spec >= 50;
          watchBtn = '<button class="tourn-watch-btn" data-code="' + match.roomCode + '" data-full="' + full + '" style="font-size:0.75em;margin-top:4px;padding:2px 8px;' + (full ? 'opacity:0.4;cursor:not-allowed;' : '') + '">' +
            '&#128065; Watch' + (spec > 0 ? ' (' + spec + ')' : '') + (full ? ' — Full' : '') +
          '</button>';
        }

        var modeBadge = match.gameMode
          ? '<div class="tourn-match-mode">' + match.gameMode + '</div>'
          : '';

        function _row(p, didWin) {
          if (!p) return '<div class="tourn-slot-tbd">TBD</div>';
          var isMe    = p.name === myName;
          var isChamp = champName && p.name === champName;
          var cls     = 'tourn-player-row' + (didWin === true ? ' winner' : didWin === false ? ' loser' : '') + (isMe ? ' is-me' : '');
          var trophy  = isChamp ? ' <span class="tourn-champ-trophy">&#127942;</span>' : '';
          var res     = didWin === true ? ' <span class="tourn-player-result">W</span>' : didWin === false ? ' <span class="tourn-player-result">L</span>' : '';
          return '<div class="' + cls + '">' +
            '<span class="tourn-player-name">' + p.name + trophy + '</span>' +
            '<span class="tourn-player-rating">' + p.rating + '</span>' +
            res +
          '</div>';
        }

        var p1Win = match.result === 'p1' ? true  : (match.result === 'p2' ? false : null);
        var p2Win = match.result === 'p2' ? true  : (match.result === 'p1' ? false : null);

        return '<div class="' + slotCls + '">' + liveDot + _row(match.p1, p1Win) + _row(match.p2, p2Win) + modeBadge + watchBtn + '</div>';
      }

      // ── Open bracket view ──

      function _openBracketView(tournId) {
        var t = tournamentLobby.getById(tournId);
        if (!t) return;
        _activeTournId = tournId;
        var myName = tournamentLobby.getRegistration(tournId)
          ? tournamentLobby.getRegistration(tournId).playerName
          : null;

        if (tournBracketTitle)  tournBracketTitle.textContent  = t.name;
        if (tournBracketStatus) {
          var statusText = { open: 'Open — accepting registrations', in_progress: '\u25b6 Live now', completed: 'Completed' };
          tournBracketStatus.textContent = statusText[t.status] || t.status;
        }

        // Meta line: bracket size + game mode
        if (tournBracketMeta) {
          var size = t.bracketSize || 8;
          tournBracketMeta.innerHTML =
            '<span class="tourn-meta-tag">' + size + '-player</span>' +
            (t.gameMode ? ' <span class="tourn-meta-tag">' + t.gameMode + '</span>' : '');
        }

        // Champion banner for completed tournaments
        if (tournChampionBanner) {
          if (t.status === 'completed' && t.winner) {
            tournChampionBanner.innerHTML =
              '<span class="tourn-champ-trophy">&#127942;</span> <b>' + t.winner + '</b> &mdash; Champion';
            tournChampionBanner.style.display = '';
          } else {
            tournChampionBanner.style.display = 'none';
          }
        }

        var champName = (t.status === 'completed') ? (t.winner || null) : null;

        // Render bracket tree
        if (tournBracketTree) {
          if (t.bracket) {
            var rounds = typeof _tGetRounds === 'function' ? _tGetRounds(t.bracket) : [];
            var html   = '';
            rounds.forEach(function (round) {
              html += '<div class="tourn-round-label">' + round.label + '</div>';
              html += '<div class="tourn-round">';
              round.matches.forEach(function (m) { html += _matchSlotHtml(m, myName, champName); });
              html += '</div>';
            });
            tournBracketTree.innerHTML = html || '<div class="tourn-slot-tbd" style="padding:20px;">Bracket unavailable.</div>';
            // Bind Watch buttons
            tournBracketTree.querySelectorAll('.tourn-watch-btn').forEach(function (btn) {
              btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (this.dataset.full === 'true') return;
                closeTournamentOverlay();
                _startWatchRoom(this.dataset.code);
              });
            });
          } else if (t.status === TournamentStatus.OPEN) {
            // Show registered player list + fill progress
            var size = t.bracketSize || 8;
            var plHtml = '<div class="tourn-round-label">REGISTERED (' + t.players.length + ' / ' + size + ')</div>';
            plHtml += '<div class="tourn-round">';
            t.players.forEach(function (p) {
              var isMe = myName && p.name === myName;
              plHtml += '<div class="tourn-match-slot' + (isMe ? ' mine' : '') + '" style="max-width:200px;">' +
                '<div class="tourn-player-row' + (isMe ? ' is-me' : '') + '">' +
                  '<span class="tourn-player-name">' + p.name + '</span>' +
                  '<span class="tourn-player-rating">' + p.rating + '</span>' +
                '</div></div>';
            });
            // Empty spots
            var remaining = size - t.players.length;
            for (var s = 0; s < remaining; s++) {
              plHtml += '<div class="tourn-match-slot" style="max-width:200px;opacity:0.4;">' +
                '<div class="tourn-slot-tbd">Waiting&#8230;</div></div>';
            }
            plHtml += '</div>';
            tournBracketTree.innerHTML = plHtml;
          } else {
            tournBracketTree.innerHTML = '<div class="tourn-slot-tbd" style="padding:20px;">Bracket unavailable.</div>';
          }
        }

        // Registration panel: show for open tournaments
        var isReg = tournamentLobby.isRegistered(tournId);
        if (tournRegPanel) {
          var size = t.bracketSize || 8;
          if (t.status === 'open' && !isReg && t.players.length < size) {
            var myRating = typeof loadBattleRating === 'function' ? loadBattleRating().rating : 1000;
            if (tournRegInfo) {
              tournRegInfo.innerHTML =
                'Your rating: <b style="color:#ffd700">' + myRating + '</b><br>' +
                'Spots left: <b style="color:#00ff88">' + (size - t.players.length) + '</b>';
            }
            if (tournRegBtn)      { tournRegBtn.disabled = false; tournRegBtn.textContent = 'Register'; }
            if (tournRegFeedback) tournRegFeedback.textContent = '';
            tournRegPanel.style.display = '';
          } else if (t.status === 'open' && isReg) {
            var reg = tournamentLobby.getRegistration(tournId);
            if (tournRegInfo) {
              tournRegInfo.innerHTML =
                '&#10003; Registered &mdash; Seed #' + reg.seedPos + '<br>' +
                'Rating: <b style="color:#ffd700">' + reg.rating + '</b>';
            }
            if (tournRegBtn) { tournRegBtn.disabled = true; tournRegBtn.textContent = 'Registered'; }
            if (tournRegFeedback) tournRegFeedback.textContent = '';
            tournRegPanel.style.display = '';
          } else if (t.status === 'open' && t.players.length >= (t.bracketSize || 8)) {
            if (tournRegInfo)     tournRegInfo.textContent = 'Tournament is full.';
            if (tournRegBtn)      { tournRegBtn.disabled = true; tournRegBtn.textContent = 'Full'; }
            if (tournRegFeedback) tournRegFeedback.textContent = '';
            tournRegPanel.style.display = '';
          } else {
            tournRegPanel.style.display = 'none';
          }
        }

        // Match entry: show if registered and match is ready
        if (tournMatchEntry) {
          var showMatch = t.matchReady && tournamentLobby.isRegistered(tournId);
          tournMatchEntry.style.display = showMatch ? '' : 'none';
          if (showMatch) _startCountdownUI();
        }

        // Chat: seed bot messages and render
        tournamentLobby.chatSeedBots(tournId);
        _renderChat(tournId);
        _startChatPoll(tournId);

        _showView('bracket');
      }

      // ── Register button ──

      if (tournRegBtn) {
        tournRegBtn.addEventListener('click', function () {
          if (!_activeTournId) return;
          tournRegBtn.disabled = true;
          var result = tournamentLobby.register(_activeTournId);
          if (result.ok) {
            if (tournRegFeedback) {
              tournRegFeedback.innerHTML =
                '&#10003; Registered! Seed #' + result.seedPos +
                '<br>Rating: ' + result.rating;
            }
            if (tournRegInfo) {
              tournRegInfo.innerHTML =
                '&#10003; Registered &mdash; Seed #' + result.seedPos + '<br>' +
                'Rating: <b style="color:#ffd700">' + result.rating + '</b>';
            }
            if (tournRegBtn) tournRegBtn.textContent = 'Registered';
            // Refresh bracket view to show updated player list / bracket if auto-started
            setTimeout(function () { _openBracketView(_activeTournId); }, 300);
          } else {
            if (tournRegFeedback) tournRegFeedback.textContent = 'Could not register: ' + result.reason;
            tournRegBtn.disabled = false;
          }
        });
      }

      // ── Join match button ──

      if (tournJoinMatchBtn) {
        tournJoinMatchBtn.addEventListener('click', function () {
          tournamentLobby.stopCountdown();
          closeTournamentOverlay();
          // Flag this battle match as a tournament match so the +50 bonus fires on win
          if (typeof isTournamentMatch !== 'undefined') {
            isTournamentMatch = true;
          }
          // Open battle overlay with tournament context flag
          var battleCardEl = document.getElementById('mode-card-battle');
          if (battleCardEl) battleCardEl.click();
        });
      }

      // ── Countdown UI ──

      function _startCountdownUI() {
        _onCountdownTick = function (secs) {
          if (tournMatchCountdown) tournMatchCountdown.textContent = secs + 's';
        };
        if (tournMatchCountdown) tournMatchCountdown.textContent = '60s';
        tournamentLobby.startCountdown(60, function () {
          if (tournMatchEntry) tournMatchEntry.style.display = 'none';
        });
      }

      // ── Watch room ──

      function _startWatchRoom(code) {
        if (typeof battle !== 'undefined' && typeof battle.watchRoom === 'function') {
          battle.watchRoom(code).then(function () {
            var battleCardEl = document.getElementById('mode-card-battle');
            if (battleCardEl) battleCardEl.click();
          }).catch(function () {});
        }
      }

      // ── Tournament chat ──

      function _fmtChatTime(ts) {
        var d = new Date(ts);
        var h = d.getHours().toString().padStart(2, '0');
        var m = d.getMinutes().toString().padStart(2, '0');
        return h + ':' + m;
      }

      function _esc(s) {
        return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function _renderChat(tournId) {
        if (!tournChatMessages || !tournId) return;
        var msgs     = tournamentLobby.chatLoad(tournId);
        var myName;
        try { myName = localStorage.getItem('mineCtris_displayName') || 'You'; } catch (_) { myName = 'You'; }
        var html = msgs.map(function (msg) {
          var isOwn = msg.userId === myName;
          return '<div class="tourn-chat-msg' + (isOwn ? ' tourn-chat-msg-own' : '') + '">' +
            '<span class="tourn-chat-user">' + _esc(msg.userId) + '</span>' +
            '<span class="tourn-chat-time">' + _fmtChatTime(msg.ts) + '</span>' +
            '<div class="tourn-chat-text">' + _esc(msg.text) + '</div>' +
          '</div>';
        }).join('');
        tournChatMessages.innerHTML = html || '<div class="tourn-chat-empty">No messages yet. Say hello!</div>';
        // Auto-scroll to bottom
        tournChatMessages.scrollTop = tournChatMessages.scrollHeight;
        _lastChatCount = msgs.length;
      }

      function _sendChatMessage() {
        if (!_activeTournId || !tournChatInput) return;
        var text = tournChatInput.value.trim();
        if (!text) return;
        tournamentLobby.chatPost(_activeTournId, text);
        tournChatInput.value = '';
        _renderChat(_activeTournId);
      }

      if (tournChatSend) {
        tournChatSend.addEventListener('click', _sendChatMessage);
      }
      if (tournChatInput) {
        tournChatInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); _sendChatMessage(); }
        });
      }

      function _startChatPoll(tournId) {
        _stopChatPoll();
        _chatPollTimer = setInterval(function () {
          var msgs = tournamentLobby.chatLoad(tournId);
          if (msgs.length !== _lastChatCount) _renderChat(tournId);
        }, 3000);
      }

      function _stopChatPoll() {
        if (_chatPollTimer) { clearInterval(_chatPollTimer); _chatPollTimer = null; }
      }

      // ── Bracket back button ──

      var brackBackBtn = document.getElementById('tourn-bracket-back-btn');
      if (brackBackBtn) {
        brackBackBtn.addEventListener('click', function () {
          tournamentLobby.stopCountdown();
          _stopChatPoll();
          _activeTournId = null;
          _renderList();
          _showView('list');
        });
      }

      // ── List close button ──

      var listCloseBtn = document.getElementById('tourn-list-close-btn');
      if (listCloseBtn) {
        listCloseBtn.addEventListener('click', function () {
          closeTournamentOverlay();
        });
      }

      // ── Main menu Tournaments button ──

      var startTournBtn = document.getElementById('start-tournament-btn');
      if (startTournBtn) {
        startTournBtn.addEventListener('click', function () {
          openTournamentOverlay();
        });
      }

    })();

}
