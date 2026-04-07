// js/social/chat.js — In-game text chat system.
// Provides: profanity filter, rate limiting, mute list, emote shortcuts,
// and a collapsible in-game chat panel with avatar + timestamp rendering.
//
// Used by: rooms-init.js (lobby), battle/coop (in-game), spectator.
// Requires: chat-emotes.js for emote bubble display (optional).

const chat = (function () {

  // ── Profanity filter ───────────────────────────────────────────────────────

  const _PROFANITY = [
    'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'dick', 'pussy', 'bastard',
  ];

  function _filterText(text) {
    let out = text;
    _PROFANITY.forEach(function (w) {
      out = out.replace(new RegExp('\\b' + w + '\\b', 'gi'), function (m) {
        return m[0] + '*'.repeat(m.length - 1);
      });
    });
    return out;
  }

  // ── Rate limiting — 1 message per second per session ──────────────────────

  let _lastSendTime = 0;
  const RATE_LIMIT_MS = 1000;

  function _canSend() {
    const now = Date.now();
    if (now - _lastSendTime < RATE_LIMIT_MS) return false;
    _lastSendTime = now;
    return true;
  }

  function _resetRateLimit() {
    _lastSendTime = 0;
  }

  // ── Mute list (persisted in localStorage) ─────────────────────────────────

  const _MUTE_KEY = 'minectris_muted_players';

  function _loadMuted() {
    try { return JSON.parse(localStorage.getItem(_MUTE_KEY) || '{}'); } catch (_) { return {}; }
  }

  function _saveMuted(m) {
    try { localStorage.setItem(_MUTE_KEY, JSON.stringify(m)); } catch (_) {}
  }

  function _isMuted(playerId) {
    if (!playerId) return false;
    return !!_loadMuted()[playerId];
  }

  function _toggleMute(playerId) {
    if (!playerId) return false;
    const m = _loadMuted();
    if (m[playerId]) {
      delete m[playerId];
    } else {
      m[playerId] = true;
    }
    _saveMuted(m);
    return !!m[playerId];
  }

  // ── Emote shortcuts ────────────────────────────────────────────────────────

  const EMOTE_SHORTCUTS = {
    '/gg':   { id: 'gg',   icon: '🏆', label: 'GG'    },
    '/gl':   { id: 'gl',   icon: '🍀', label: 'GL'    },
    '/wp':   { id: 'wp',   icon: '👏', label: 'WP'    },
    '/nice': { id: 'nice', icon: '👍', label: 'Nice!' },
  };

  function _parseEmoteShortcut(text) {
    return EMOTE_SHORTCUTS[(text || '').trim().toLowerCase()] || null;
  }

  // ── Timestamp formatter ────────────────────────────────────────────────────

  function _fmtTs(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  // ── In-game chat panel ─────────────────────────────────────────────────────

  let _panel    = null;
  let _msgList  = null;
  let _input    = null;
  let _isOpen   = false;
  let _sendFn   = null; // callback(entry) when local player sends a message

  const PANEL_MSG_MAX = 100;

  function _buildPanel() {
    if (_panel) return;

    _panel = document.createElement('div');
    _panel.id = 'ingame-chat-panel';
    _panel.className = 'ingame-chat-panel';
    _panel.setAttribute('aria-label', 'In-game chat');
    _panel.style.display = 'none';

    // Header
    const header = document.createElement('div');
    header.className = 'ingame-chat-header';

    const title = document.createElement('span');
    title.className = 'ingame-chat-title';
    title.textContent = '💬 CHAT';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ingame-chat-close-btn';
    closeBtn.title = 'Close chat [T]';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function () { _closePanel(); });
    header.appendChild(closeBtn);

    _panel.appendChild(header);

    // Message list
    _msgList = document.createElement('div');
    _msgList.id = 'ingame-chat-messages';
    _msgList.className = 'ingame-chat-messages';
    _panel.appendChild(_msgList);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'ingame-chat-input-row';

    _input = document.createElement('input');
    _input.type = 'text';
    _input.id = 'ingame-chat-input';
    _input.className = 'ingame-chat-input';
    _input.maxLength = 200;
    _input.placeholder = 'Chat… /gg /gl /wp /nice';
    _input.autocomplete = 'off';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'ingame-chat-send-btn';
    sendBtn.textContent = '▶';
    sendBtn.title = 'Send';

    inputRow.appendChild(_input);
    inputRow.appendChild(sendBtn);
    _panel.appendChild(inputRow);

    // Send logic
    function _doSend() {
      const raw = (_input.value || '').trim();
      if (!raw) { _closePanel(); return; }

      if (!_canSend()) {
        _showRateLimitHint();
        return;
      }

      const emote = _parseEmoteShortcut(raw);
      if (emote) {
        // Trigger bubble locally via chatEmotes if available
        if (typeof chatEmotes !== 'undefined') {
          chatEmotes.receive({ emoteId: emote.id });
        }
        if (_sendFn) _sendFn({ type: 'emote', emoteId: emote.id, icon: emote.icon, label: emote.label });
        _input.value = '';
        return;
      }

      const filtered = _filterText(raw.slice(0, 200));
      if (_sendFn) _sendFn({ type: 'text', text: filtered });
      _input.value = '';
    }

    sendBtn.addEventListener('click', _doSend);

    _input.addEventListener('keydown', function (e) {
      // Enter sends; Escape closes
      if (e.key === 'Enter') { e.preventDefault(); _doSend(); return; }
      if (e.key === 'Escape') { e.preventDefault(); _closePanel(); return; }
      // Prevent game hotkeys from firing while typing
      e.stopPropagation();
    });

    document.body.appendChild(_panel);
  }

  function _showRateLimitHint() {
    if (!_panel) return;
    let hint = _panel.querySelector('.ingame-chat-ratelimit');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'ingame-chat-ratelimit';
      hint.textContent = '⏱ Slow down!';
      _panel.insertBefore(hint, _panel.querySelector('.ingame-chat-input-row'));
    }
    hint.style.display = 'block';
    clearTimeout(hint._hideTimer);
    hint._hideTimer = setTimeout(function () { hint.style.display = 'none'; }, 1200);
  }

  function _openPanel() {
    _buildPanel();
    _panel.style.display = 'flex';
    _isOpen = true;
    if (_input) {
      _input.focus();
    }
  }

  function _closePanel() {
    if (!_panel) return;
    _panel.style.display = 'none';
    _isOpen = false;
    if (_input) _input.blur();
  }

  function _togglePanel() {
    if (_isOpen) _closePanel(); else _openPanel();
  }

  // ── Message rendering ──────────────────────────────────────────────────────

  function _appendMsg(entry) {
    _buildPanel();
    if (!_msgList) return;

    // Hide messages from muted players
    if (entry.playerId && _isMuted(entry.playerId)) return;

    const row = document.createElement('div');
    row.className = 'ingame-chat-row';

    if (entry.type === 'system') {
      row.classList.add('ingame-chat-system');
      row.textContent = entry.text || '';
    } else {
      if (entry.isSelf) row.classList.add('ingame-chat-self');
      if (entry.playerId) row.dataset.player = entry.playerId;

      // Avatar initial
      const avatar = document.createElement('span');
      avatar.className = 'ingame-chat-avatar';
      avatar.textContent = (entry.playerName || '?').charAt(0).toUpperCase();
      row.appendChild(avatar);

      // Player name (right-click to mute)
      const nameEl = document.createElement('span');
      nameEl.className = 'ingame-chat-name';
      nameEl.textContent = (entry.playerName || '?');
      if (entry.playerId) {
        nameEl.title = 'Right-click to mute';
        nameEl.dataset.playerid = entry.playerId;
        nameEl.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          const nowMuted = _toggleMute(entry.playerId);
          if (nowMuted && _msgList) {
            // Remove all visible messages from this player
            const pId = CSS.escape(entry.playerId);
            _msgList.querySelectorAll('[data-player="' + pId + '"]').forEach(function (r) { r.remove(); });
          }
        });
      }
      row.appendChild(nameEl);

      // Message text or emote
      const textEl = document.createElement('span');
      if (entry.type === 'emote') {
        textEl.className = 'ingame-chat-text ingame-chat-emote';
        textEl.textContent = ' ' + (entry.icon || '') + ' ' + (entry.label || '');
      } else {
        textEl.className = 'ingame-chat-text';
        textEl.textContent = ': ' + (entry.text || '');
      }
      row.appendChild(textEl);

      // Timestamp
      const ts = document.createElement('span');
      ts.className = 'ingame-chat-ts';
      ts.textContent = _fmtTs(entry.ts || Date.now());
      row.appendChild(ts);
    }

    _msgList.appendChild(row);
    _msgList.scrollTop = _msgList.scrollHeight;

    // Trim to cap
    while (_msgList.children.length > PANEL_MSG_MAX) {
      _msgList.removeChild(_msgList.firstChild);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    /** Apply profanity filter to a string */
    filter: _filterText,

    /** Returns true if OK to send (1/sec rate limit); also records send time */
    canSend: _canSend,

    /** Reset rate limit (call on room join/leave) */
    resetRateLimit: _resetRateLimit,

    /** Parse a /shortcut string; returns { id, icon, label } or null */
    parseEmote: _parseEmoteShortcut,

    /** Toggle mute for a player by id; returns new muted state */
    toggleMute: _toggleMute,

    /** Check whether a player is muted */
    isMuted: _isMuted,

    /** Open the in-game floating chat panel */
    open: _openPanel,

    /** Close the in-game floating chat panel */
    close: _closePanel,

    /** Toggle the in-game panel open/closed */
    toggle: _togglePanel,

    /** True if the panel is currently visible */
    isOpen: function () { return _isOpen; },

    /** Append a message to the in-game panel.
     *  entry = { type: 'text'|'emote'|'system', playerId?, playerName?,
     *             text?, emoteId?, icon?, label?, ts?, isSelf? } */
    appendMessage: _appendMsg,

    /** Clear all messages (call on room close) */
    clear: function () {
      if (_msgList) _msgList.innerHTML = '';
    },

    /** Set the callback invoked when the local player sends a message.
     *  cb(entry) where entry has type 'text' or 'emote'. */
    onSend: function (cb) { _sendFn = cb; },

    EMOTE_SHORTCUTS: EMOTE_SHORTCUTS,
  };
}());
