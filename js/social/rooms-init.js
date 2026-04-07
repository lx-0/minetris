// js/social/rooms-init.js — Custom Game Rooms UI initialization.
// Handles the rooms overlay: choice, settings, lobby views.
// Depends on rooms.js (rooms global) being loaded first.

(function _initRoomsHandlers() {

  // ── View helper ───────────────────────────────────────────────────────────

  function showRoomsView(name) {
    ['choice', 'settings', 'lobby', 'join', 'browse'].forEach(function (v) {
      const el = document.getElementById('rooms-' + v + '-view');
      if (el) el.style.display = (v === name) ? '' : 'none';
    });
  }

  function openOverlay() {
    const el = document.getElementById('rooms-overlay');
    if (el) { el.style.display = 'flex'; }
  }

  function closeOverlay() {
    const el = document.getElementById('rooms-overlay');
    if (el) { el.style.display = 'none'; }
    rooms.disconnect();
    showRoomsView('choice');
    _resetSettingsForm();
  }

  // ── Settings form helpers ─────────────────────────────────────────────────

  function _resetSettingsForm() {
    const defs = rooms.defaults;
    _setField('rooms-settings-name',       defs.roomName);
    _setSelect('rooms-settings-max',       String(defs.maxPlayers));
    _setSelect('rooms-settings-speed',     defs.gameSpeed);
    _setField('rooms-settings-level',      String(defs.startLevel));
    _setCheck('rooms-settings-garbage',    defs.garbageLines);
    _setSelect('rooms-settings-lock',      defs.lockDelay);
    _setSelect('rooms-settings-board',     defs.boardSize);
    _setCheck('rooms-settings-public',     defs.isPublic);
  }

  function _setField(id, val) {
    const el = document.getElementById(id); if (el) el.value = val;
  }
  function _setSelect(id, val) {
    const el = document.getElementById(id); if (el) el.value = val;
  }
  function _setCheck(id, val) {
    const el = document.getElementById(id); if (el) el.checked = val;
  }

  function _readSettings() {
    return {
      roomName:    (document.getElementById('rooms-settings-name')    || {}).value    || '',
      maxPlayers:  parseInt((document.getElementById('rooms-settings-max')    || {}).value || '2', 10),
      gameSpeed:   (document.getElementById('rooms-settings-speed')   || {}).value    || 'normal',
      startLevel:  parseInt((document.getElementById('rooms-settings-level')  || {}).value || '0', 10),
      garbageLines:(document.getElementById('rooms-settings-garbage') || {}).checked  || false,
      lockDelay:   (document.getElementById('rooms-settings-lock')    || {}).value    || 'normal',
      boardSize:   (document.getElementById('rooms-settings-board')   || {}).value    || 'standard',
      isPublic:    (document.getElementById('rooms-settings-public')  || {}).checked !== false,
    };
  }

  function _applySettingsToForm(s) {
    _setField('rooms-settings-name',       s.roomName      || '');
    _setSelect('rooms-settings-max',       String(s.maxPlayers  || 2));
    _setSelect('rooms-settings-speed',     s.gameSpeed     || 'normal');
    _setField('rooms-settings-level',      String(s.startLevel  || 0));
    _setCheck('rooms-settings-garbage',    !!s.garbageLines);
    _setSelect('rooms-settings-lock',      s.lockDelay     || 'normal');
    _setSelect('rooms-settings-board',     s.boardSize     || 'standard');
    _setCheck('rooms-settings-public',     s.isPublic !== false);
  }

  // ── Lobby rendering ───────────────────────────────────────────────────────

  function _renderRoster(players) {
    const list = document.getElementById('rooms-player-list');
    if (!list) return;
    list.innerHTML = '';
    players.forEach(function (p) {
      const li = document.createElement('div');
      li.className = 'rooms-player-row' + (p.isSpectator ? ' rooms-spectator-row' : '');

      const avatar = document.createElement('div');
      avatar.className = 'rooms-player-avatar';
      avatar.textContent = p.avatar || p.name.charAt(0).toUpperCase();
      li.appendChild(avatar);

      const info = document.createElement('div');
      info.className = 'rooms-player-info';
      const nameEl = document.createElement('span');
      nameEl.className = 'rooms-player-name';
      nameEl.textContent = p.name + (p.isHost ? ' \u2655' : '') + (p.isSpectator ? ' \uD83D\uDC41' : '');
      info.appendChild(nameEl);
      li.appendChild(info);

      const badge = document.createElement('span');
      badge.className = 'rooms-ready-badge ' + (p.isReady ? 'rooms-ready-yes' : 'rooms-ready-no');
      badge.textContent = p.isReady ? '\u2713 Ready' : '\u25A1 Not ready';
      li.appendChild(badge);

      // Host-only kick button (not on self)
      if (rooms.isHost && p.id !== rooms.myId && !p.isSpectator) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'rooms-kick-btn';
        kickBtn.textContent = '\u2715';
        kickBtn.title = 'Kick ' + p.name;
        kickBtn.addEventListener('click', function () {
          if (confirm('Kick ' + p.name + '?')) rooms.kick(p.id);
        });
        li.appendChild(kickBtn);
      }

      list.appendChild(li);
    });

    // Update ready count / start button
    const nonSpec    = players.filter(function (p) { return !p.isSpectator; });
    const readyCount = nonSpec.filter(function (p) { return p.isReady; }).length;
    const countEl    = document.getElementById('rooms-ready-count');
    if (countEl) countEl.textContent = readyCount + ' / ' + nonSpec.length + ' ready';

    const startBtn = document.getElementById('rooms-start-btn');
    if (startBtn) {
      const allReady   = nonSpec.length >= 2 && nonSpec.every(function (p) { return p.isReady; });
      startBtn.disabled = !allReady;
      startBtn.style.display = rooms.isHost ? '' : 'none';
    }
  }

  function _renderSettings(s) {
    const el = document.getElementById('rooms-lobby-settings');
    if (!el) return;
    el.innerHTML =
      '<span>\u23F1 ' + _capFirst(s.gameSpeed)    + ' speed</span>' +
      '<span>\u25A3 Level '  + s.startLevel        + '</span>' +
      '<span>\u{1F3AF} '     + _capFirst(s.lockDelay) + ' lock</span>' +
      (s.garbageLines ? '<span>\u{1F5D1} Garbage on</span>' : '') +
      (s.boardSize === 'wide' ? '<span>\u{1F4CF} Wide board</span>' : '') +
      '<span>\u{1F465} Max ' + s.maxPlayers + ' players</span>';
  }

  function _capFirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
  }

  function _renderSpecCount(count) {
    const el = document.getElementById('rooms-spec-count');
    if (el) el.textContent = count ? '\uD83D\uDC41 ' + count + ' watching' : '';
  }

  // ── Chat rendering ────────────────────────────────────────────────────────

  function _appendChatMessage(entry) {
    const log = document.getElementById('rooms-chat-log');
    if (!log) return;

    // Hide muted players
    if (entry.playerId && typeof chat !== 'undefined' && chat.isMuted(entry.playerId)) return;

    const row = document.createElement('div');

    if (entry.type === 'system') {
      row.className = 'rooms-chat-row rooms-chat-system';
      row.textContent = entry.text || '';
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      return;
    }

    row.className = 'rooms-chat-row' + (entry.isSelf ? ' rooms-chat-self' : '');
    if (entry.playerId) row.dataset.player = entry.playerId;

    // Avatar initial
    const avatarEl = document.createElement('span');
    avatarEl.className = 'rooms-chat-avatar';
    avatarEl.textContent = (entry.playerName || '?').charAt(0).toUpperCase();
    row.appendChild(avatarEl);

    // Player name with mute on right-click
    const nameEl = document.createElement('span');
    nameEl.className = 'rooms-chat-name';
    nameEl.textContent = (entry.playerName || '?');
    if (entry.playerId && typeof chat !== 'undefined') {
      nameEl.title = 'Right-click to mute';
      nameEl.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        const nowMuted = chat.toggleMute(entry.playerId);
        if (nowMuted) {
          log.querySelectorAll('[data-player="' + CSS.escape(entry.playerId) + '"]').forEach(function (r) { r.remove(); });
        }
      });
    }
    row.appendChild(nameEl);

    // Text or emote
    const textEl = document.createElement('span');
    if (entry.type === 'emote') {
      textEl.className = 'rooms-chat-text rooms-chat-emote';
      textEl.textContent = ' ' + (entry.icon || '') + ' ' + (entry.label || '');
    } else {
      textEl.className = 'rooms-chat-text';
      textEl.textContent = ': ' + (entry.text || '');
    }
    row.appendChild(textEl);

    // Timestamp
    const tsEl = document.createElement('span');
    tsEl.className = 'rooms-chat-ts';
    try {
      tsEl.textContent = new Date(entry.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {}
    row.appendChild(tsEl);

    log.appendChild(row);
    log.scrollTop = log.scrollHeight;

    // Mirror to in-game chat panel if open
    if (typeof chat !== 'undefined') {
      chat.appendMessage(entry);
    }
  }

  // ── Browse rooms view ─────────────────────────────────────────────────────

  function _renderBrowseRooms() {
    const container = document.getElementById('rooms-browse-list');
    if (!container) return;
    const list = rooms.getPublicRooms();
    if (list.length === 0) {
      container.innerHTML = '<div class="rooms-browse-empty">No public rooms found.<br>Share an invite link to bring friends in!</div>';
      return;
    }
    container.innerHTML = '';
    list.forEach(function (r) {
      const card = document.createElement('div');
      card.className = 'rooms-browse-card';
      card.innerHTML =
        '<div class="rooms-browse-name">' + _escHtml(r.name || r.code) + '</div>' +
        '<div class="rooms-browse-meta">' +
          'Host: ' + _escHtml(r.host) + ' &bull; ' +
          r.players + '/' + r.max + ' players' +
        '</div>';
      const joinBtn = document.createElement('button');
      joinBtn.className = 'rooms-browse-join-btn';
      joinBtn.textContent = '\u25B6 Join';
      joinBtn.addEventListener('click', function () {
        _joinRoom(r.code);
      });
      card.appendChild(joinBtn);
      container.appendChild(card);
    });
  }

  function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Lobby entry / exit ────────────────────────────────────────────────────

  function _enterLobby() {
    showRoomsView('lobby');

    // Populate room code display
    const codeEl = document.getElementById('rooms-lobby-code');
    if (codeEl) codeEl.textContent = rooms.roomCode || '';

    // Show/hide host-only settings edit button
    const editBtn = document.getElementById('rooms-edit-settings-btn');
    if (editBtn) editBtn.style.display = rooms.isHost ? '' : 'none';

    // Show/hide start button
    const startBtn = document.getElementById('rooms-start-btn');
    if (startBtn) startBtn.style.display = rooms.isHost ? '' : 'none';

    // Initial render
    _renderRoster(rooms.players);
    _renderSettings(rooms.settings);

    // Replay chat history
    const log = document.getElementById('rooms-chat-log');
    if (log) {
      log.innerHTML = '';
      rooms.chatHistory.forEach(_appendChatMessage);
    }

    // Register public room for discovery
    if (rooms.isHost) rooms.registerPublicRoom();
  }

  // ── Join flow ─────────────────────────────────────────────────────────────

  async function _joinRoom(code) {
    const statusEl = document.getElementById('rooms-join-status');
    if (statusEl) statusEl.textContent = '\u29D6 Joining\u2026';
    const result = await rooms.joinRoom(code);
    if (!result) {
      if (statusEl) statusEl.textContent = '\u26A0 Could not join room. Check the code and try again.';
      return;
    }
    _enterLobby();
  }

  // ── Game start integration ────────────────────────────────────────────────

  function _launchGame(settings) {
    // Apply custom room settings to the game configuration before launching.
    // The game engine reads window.roomGameSettings on startup.
    window.roomGameSettings = {
      startLevel:   settings.startLevel   || 0,
      speedMult:    rooms.speedMult[settings.gameSpeed]   || 1.0,
      garbageLines: settings.garbageLines || false,
      lockFrames:   rooms.lockFrames[settings.lockDelay]  || 30,
      wideBoard:    settings.boardSize === 'wide',
    };

    // Close the rooms overlay
    const overlay = document.getElementById('rooms-overlay');
    if (overlay) overlay.style.display = 'none';

    // Launch battle mode — this respects window.roomGameSettings if present
    if (typeof battle !== 'undefined' && battle.createRoom) {
      // Reuse battle room that's already open; trigger game start via the
      // battle mode card to enter the gameplay canvas.
      const modeCard = document.getElementById('mode-card-battle');
      // Emit a synthetic event so game engine picks up roomGameSettings
      window.dispatchEvent(new CustomEvent('room_game_start', { detail: settings }));
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  function _wireRoomsEvents() {
    rooms.on('state_change', function (e) {
      // No-op state transitions handled by individual flows
      if (e.state === RoomState.DISCONNECTED) {
        closeOverlay();
      }
    });

    rooms.on('roster_change', function (e) {
      _renderRoster(e.players);
      if (rooms.isHost) rooms.registerPublicRoom();
    });

    rooms.on('settings_change', function (e) {
      _renderSettings(e.settings);
    });

    rooms.on('spectator_count', function (e) {
      _renderSpecCount(e.count);
    });

    rooms.on('chat', function (entry) {
      _appendChatMessage(entry);
    });

    rooms.on('kicked', function () {
      alert('You were kicked from the room.');
      closeOverlay();
    });

    rooms.on('became_host', function () {
      const editBtn = document.getElementById('rooms-edit-settings-btn');
      if (editBtn) editBtn.style.display = '';
      const startBtn = document.getElementById('rooms-start-btn');
      if (startBtn) startBtn.style.display = '';
    });

    rooms.on('timeout', function () {
      const statusEl = document.getElementById('rooms-lobby-status');
      if (statusEl) statusEl.textContent = '\u231B Lobby timed out — no players joined.';
    });

    rooms.on('error', function (e) {
      const statusEl = document.getElementById('rooms-lobby-status');
      if (statusEl) statusEl.textContent = '\u26A0 ' + (e.message || 'Connection error');
    });

    rooms.on('game_start', function (e) {
      _launchGame(e.settings);
    });
  }

  // ── DOM event handlers ────────────────────────────────────────────────────

  // Mode card click
  const modeCard = document.getElementById('mode-card-rooms');
  if (modeCard) {
    modeCard.addEventListener('click', function () {
      openOverlay();
      showRoomsView('choice');
    });
    modeCard.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); modeCard.click(); }
    });
  }

  // Choice view buttons
  const choiceCreateBtn = document.getElementById('rooms-choice-create-btn');
  if (choiceCreateBtn) {
    choiceCreateBtn.addEventListener('click', function () {
      _resetSettingsForm();
      showRoomsView('settings');
    });
  }

  const choiceJoinBtn = document.getElementById('rooms-choice-join-btn');
  if (choiceJoinBtn) {
    choiceJoinBtn.addEventListener('click', function () {
      const statusEl = document.getElementById('rooms-join-status');
      if (statusEl) statusEl.textContent = '';
      const inp = document.getElementById('rooms-join-code-input');
      if (inp) inp.value = '';
      showRoomsView('join');
    });
  }

  const choiceBrowseBtn = document.getElementById('rooms-choice-browse-btn');
  if (choiceBrowseBtn) {
    choiceBrowseBtn.addEventListener('click', function () {
      _renderBrowseRooms();
      showRoomsView('browse');
    });
  }

  const choiceCancelBtn = document.getElementById('rooms-choice-cancel-btn');
  if (choiceCancelBtn) {
    choiceCancelBtn.addEventListener('click', closeOverlay);
  }

  // Settings view
  const settingsCreateBtn = document.getElementById('rooms-settings-create-btn');
  if (settingsCreateBtn) {
    settingsCreateBtn.addEventListener('click', async function () {
      // Handle "Apply Changes" mode when editing from lobby
      if (_editingFromLobby_ref) {
        _editingFromLobby_ref = false;
        rooms.updateSettings(_readSettings());
        settingsCreateBtn.textContent = '\u2728 Create Room';
        showRoomsView('lobby');
        return;
      }
      settingsCreateBtn.disabled = true;
      settingsCreateBtn.textContent = '\u29D6 Creating\u2026';
      const settings = _readSettings();
      const result   = await rooms.createRoom(settings);
      settingsCreateBtn.disabled = false;
      settingsCreateBtn.textContent = '\u2728 Create Room';
      if (result) {
        _enterLobby();
      }
    });
  }

  let _editingFromLobby_ref = false;

  // Level range input
  const levelInput = document.getElementById('rooms-settings-level');
  const levelDisplay = document.getElementById('rooms-settings-level-display');
  if (levelInput && levelDisplay) {
    levelInput.addEventListener('input', function () {
      levelDisplay.textContent = levelInput.value;
    });
  }

  // Join view
  const joinCodeInput = document.getElementById('rooms-join-code-input');
  if (joinCodeInput) {
    joinCodeInput.addEventListener('input', function () {
      joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
  }

  const joinConfirmBtn = document.getElementById('rooms-join-confirm-btn');
  if (joinConfirmBtn) {
    joinConfirmBtn.addEventListener('click', function () {
      const code = (joinCodeInput || {}).value || '';
      if (!code) return;
      _joinRoom(code);
    });
  }

  const joinCancelBtn = document.getElementById('rooms-join-cancel-btn');
  if (joinCancelBtn) {
    joinCancelBtn.addEventListener('click', function () { showRoomsView('choice'); });
  }

  // Browse view
  const browseRefreshBtn = document.getElementById('rooms-browse-refresh-btn');
  if (browseRefreshBtn) {
    browseRefreshBtn.addEventListener('click', _renderBrowseRooms);
  }

  const browseBackBtn = document.getElementById('rooms-browse-back-btn');
  if (browseBackBtn) {
    browseBackBtn.addEventListener('click', function () { showRoomsView('choice'); });
  }

  // Lobby view — copy invite link
  const copyLinkBtn = document.getElementById('rooms-copy-link-btn');
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', function () {
      const url = rooms.inviteUrl();
      if (!url) return;
      navigator.clipboard.writeText(url).then(function () {
        const fb = document.getElementById('rooms-copy-feedback');
        if (fb) { fb.textContent = '\u2713 Copied!'; setTimeout(function () { fb.textContent = ''; }, 2000); }
      });
    });
  }

  // Lobby view — ready button
  const readyBtn = document.getElementById('rooms-ready-btn');
  if (readyBtn) {
    let _isReady = false;
    readyBtn.addEventListener('click', function () {
      _isReady = !_isReady;
      rooms.setReady(_isReady);
      readyBtn.textContent = _isReady ? '\u2713 Ready!' : '\u25A1 Ready?';
      readyBtn.classList.toggle('rooms-ready-active', _isReady);
    });
  }

  // Lobby view — start game (host)
  const startBtn = document.getElementById('rooms-start-btn');
  if (startBtn) {
    startBtn.addEventListener('click', function () {
      rooms.startGame();
    });
  }

  // Lobby view — edit settings (host): navigate to settings view pre-filled
  const editSettingsBtn = document.getElementById('rooms-edit-settings-btn');
  if (editSettingsBtn) {
    editSettingsBtn.addEventListener('click', function () {
      _editingFromLobby_ref = true;
      _applySettingsToForm(rooms.settings);
      const createBtn = document.getElementById('rooms-settings-create-btn');
      if (createBtn) createBtn.textContent = '\u2713 Apply Changes';
      showRoomsView('settings');
    });
  }

  // Unified settings back button handler (handles both create-new and edit-from-lobby)
  const settingsBackBtn = document.getElementById('rooms-settings-back-btn');
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', function () {
      const createBtn = document.getElementById('rooms-settings-create-btn');
      if (_editingFromLobby_ref) {
        _editingFromLobby_ref = false;
        if (createBtn) createBtn.textContent = '\u2728 Create Room';
        showRoomsView('lobby');
      } else {
        showRoomsView('choice');
      }
    });
  }

  // Lobby view — cancel / leave room
  const lobbyLeaveBtn = document.getElementById('rooms-lobby-leave-btn');
  if (lobbyLeaveBtn) {
    lobbyLeaveBtn.addEventListener('click', closeOverlay);
  }

  // Chat input
  const chatInput = document.getElementById('rooms-chat-input');
  const chatSendBtn = document.getElementById('rooms-chat-send-btn');

  function _sendChat() {
    if (!chatInput || !chatInput.value.trim()) return;
    rooms.sendChat(chatInput.value);
    chatInput.value = '';
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); _sendChat(); }
    });
  }
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', _sendChat);
  }

  // Handle ?room=CODE in URL (auto-join from invite link)
  (function _checkInviteLink() {
    try {
      const params = new URLSearchParams(window.location.search);
      const code   = params.get('room');
      if (!code) return;
      // Clear the param from the URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      history.replaceState({}, '', url.toString());
      // Open rooms overlay and auto-join
      openOverlay();
      showRoomsView('join');
      const inp = document.getElementById('rooms-join-code-input');
      if (inp) inp.value = code.toUpperCase();
      _joinRoom(code.toUpperCase());
    } catch (_) {}
  }());

  // Wire rooms event listeners
  _wireRoomsEvents();

  // Wire in-game chat panel to send via rooms when a room game is active
  if (typeof chat !== 'undefined') {
    chat.onSend(function (entry) {
      if (typeof rooms !== 'undefined' && rooms.state === 'in_game') {
        if (entry.type === 'emote') {
          rooms.sendChat('/' + (entry.emoteId || 'gg'));
        } else {
          rooms.sendChat(entry.text || '');
        }
      }
    });
  }

  // Expose room state constant so closeOverlay can reference it
  window.RoomState = typeof RoomState !== 'undefined' ? RoomState : { DISCONNECTED: 'disconnected' };

}());
