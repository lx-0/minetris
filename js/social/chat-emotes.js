// js/social/chat-emotes.js — Chat emote wheel for multiplayer and co-op lobbies.
// Press T to open a radial emote picker. Mouse or arrow keys to select.
// Release T or click to send. ESC to cancel.
// Requires: coop.js (co-op), battle.js (battle), state.js (isCoopMode / isBattleMode).

const chatEmotes = (function () {

  // ── Emote definitions ──────────────────────────────────────────────────────

  const DEFAULT_EMOTES = [
    { id: 'gg',     label: 'GG',     icon: '🏆' },
    { id: 'nice',   label: 'Nice!',  icon: '👍' },
    { id: 'wow',    label: 'Wow',    icon: '😮' },
    { id: 'oops',   label: 'Oops',   icon: '😅' },
    { id: 'thanks', label: 'Thanks', icon: '🙏' },
    { id: 'hello',  label: 'Hello',  icon: '👋' },
    { id: 'bye',    label: 'Bye',    icon: '✌️' },
    { id: 'heart',  label: 'Heart',  icon: '❤️' },
  ];

  const UNLOCKABLE_EMOTES = [
    { id: 'creeper', label: 'Creeper', icon: '💚', hint: 'Win 10 battles'              },
    { id: 'tnt',     label: 'TNT',     icon: '💣', hint: '50 lines in one game'        },
    { id: 'diamond', label: 'Diamond', icon: '💎', hint: 'Reach Level 50'              },
    { id: 'pearl',   label: 'E.Pearl', icon: '🔮', hint: 'Hard-drop 100 pieces'        },
    { id: 'pickaxe', label: 'Pickaxe', icon: '⛏️', hint: 'Mine 1000 blocks'            },
    { id: 'cake',    label: 'Cake',    icon: '🎂', hint: 'Play on your birthday'       },
    { id: 'fire',    label: 'Fire',    icon: '🔥', hint: '10× combo'                   },
    { id: 'star',    label: 'Star',    icon: '⭐', hint: 'Complete all achievements'   },
  ];

  const ALL_EMOTES = DEFAULT_EMOTES.concat(UNLOCKABLE_EMOTES);

  const COOLDOWN_MS        = 3000;
  const UNLOCK_STORAGE_KEY = 'mineCtris_emoteUnlocks';
  const SHOW_OPPONENT_KEY  = 'mineCtris_showOpponentEmotes';

  // ── State ──────────────────────────────────────────────────────────────────

  let _isOpen          = false;
  let _selectedIdx     = -1;
  let _lastSentAt      = 0;
  let _cooldownHandle  = null;
  let _overlay         = null;
  let _slots           = [];
  let _cooldownLabel   = null;

  // ── Storage helpers ────────────────────────────────────────────────────────

  function _loadUnlocks() {
    try {
      const raw = localStorage.getItem(UNLOCK_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function _unlockEmote(emoteId) {
    if (!UNLOCKABLE_EMOTES.some(function (e) { return e.id === emoteId; })) return;
    const u = _loadUnlocks();
    if (u[emoteId]) return;
    u[emoteId] = true;
    try { localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(u)); } catch (_) {}
  }

  function _isUnlocked(emoteId) {
    if (DEFAULT_EMOTES.some(function (e) { return e.id === emoteId; })) return true;
    return !!_loadUnlocks()[emoteId];
  }

  function _showOpponentEmotes() {
    try {
      const raw = localStorage.getItem(SHOW_OPPONENT_KEY);
      return raw === null ? true : raw === 'true';
    } catch (_) { return true; }
  }

  function _getMyId() {
    try { return localStorage.getItem('mineCtris_displayName') || 'Player'; } catch (_) { return 'Player'; }
  }

  // ── Wheel DOM ──────────────────────────────────────────────────────────────

  function _buildWheel() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'chat-emote-wheel';

    // dim background
    const bg = document.createElement('div');
    bg.id = 'chat-emote-wheel-bg';
    _overlay.appendChild(bg);

    // center hub label
    const hub = document.createElement('div');
    hub.id = 'chat-emote-wheel-hub';
    hub.textContent = 'EMOTE';
    _overlay.appendChild(hub);

    // 8 radial slots
    const RADIUS = 115;
    _slots = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2; // start from 12 o'clock
      const x = Math.round(Math.cos(angle) * RADIUS);
      const y = Math.round(Math.sin(angle) * RADIUS);
      const emote = DEFAULT_EMOTES[i];

      const slot = document.createElement('div');
      slot.className = 'chat-emote-slot';
      slot.dataset.idx = String(i);
      slot.style.setProperty('--sx', x + 'px');
      slot.style.setProperty('--sy', y + 'px');

      const iconEl = document.createElement('span');
      iconEl.className = 'ces-icon';
      iconEl.textContent = emote.icon;

      const labelEl = document.createElement('span');
      labelEl.className = 'ces-label';
      labelEl.textContent = emote.label;

      slot.appendChild(iconEl);
      slot.appendChild(labelEl);
      _overlay.appendChild(slot);
      _slots.push(slot);

      // click to send
      slot.addEventListener('click', function () {
        _selectedIdx = i;
        _confirmSend();
        _closeWheel();
      });
      slot.addEventListener('mouseenter', function () {
        _selectedIdx = i;
        _updateHighlight();
      });
    }

    // cooldown notice (shown inside hub when wheel is on cooldown)
    _cooldownLabel = document.createElement('div');
    _cooldownLabel.id = 'chat-emote-cooldown-label';
    _overlay.appendChild(_cooldownLabel);

    document.body.appendChild(_overlay);
  }

  function _updateHighlight() {
    for (let i = 0; i < _slots.length; i++) {
      _slots[i].classList.toggle('ces-selected', i === _selectedIdx);
    }
  }

  // ── Open / close ───────────────────────────────────────────────────────────

  function _openWheel() {
    _buildWheel();

    const now = performance.now();
    const remaining = COOLDOWN_MS - (now - _lastSentAt);

    _selectedIdx = -1;
    _updateHighlight();
    _overlay.classList.add('cew-visible');
    _isOpen = true;

    if (remaining > 0) {
      // Show cooldown state — wheel is visible but locked
      _overlay.classList.add('cew-cooldown');
      _cooldownLabel.textContent = Math.ceil(remaining / 1000) + 's';
      _cooldownLabel.style.display = 'block';
      // Update countdown every 100ms
      clearInterval(_cooldownHandle);
      _cooldownHandle = setInterval(function () {
        const r = COOLDOWN_MS - (performance.now() - _lastSentAt);
        if (r <= 0) {
          clearInterval(_cooldownHandle);
          _overlay.classList.remove('cew-cooldown');
          _cooldownLabel.style.display = 'none';
        } else {
          _cooldownLabel.textContent = Math.ceil(r / 1000) + 's';
        }
      }, 100);
    } else {
      _overlay.classList.remove('cew-cooldown');
      _cooldownLabel.style.display = 'none';
    }

    document.addEventListener('mousemove', _onMouseMove);
  }

  function _closeWheel() {
    _isOpen = false;
    clearInterval(_cooldownHandle);
    if (_overlay) {
      _overlay.classList.remove('cew-visible');
    }
    document.removeEventListener('mousemove', _onMouseMove);
    _selectedIdx = -1;
  }

  // ── Mouse selection ────────────────────────────────────────────────────────

  function _onMouseMove(e) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 28) {
      _selectedIdx = -1;
      _updateHighlight();
      return;
    }
    // angle from top (12 o'clock), clockwise
    const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.round(angle / (Math.PI * 2 / 8)) % 8;
    _selectedIdx = idx;
    _updateHighlight();
  }

  // ── Arrow key selection ────────────────────────────────────────────────────

  function _handleArrow(code) {
    if (!_isOpen) return;
    const map = { ArrowUp: 0, ArrowRight: 2, ArrowDown: 4, ArrowLeft: 6 };
    if (map[code] !== undefined) {
      _selectedIdx = map[code];
      _updateHighlight();
    }
  }

  // ── Send ───────────────────────────────────────────────────────────────────

  function _confirmSend() {
    if (_selectedIdx < 0) return;
    if (_overlay && _overlay.classList.contains('cew-cooldown')) return;
    const now = performance.now();
    if (now - _lastSentAt < COOLDOWN_MS) return;
    const emote = DEFAULT_EMOTES[_selectedIdx];
    if (!emote) return;
    _lastSentAt = now;

    const payload = { type: 'chat_emote', emoteId: emote.id, playerId: _getMyId() };
    if (typeof isCoopMode !== 'undefined' && isCoopMode && typeof coop !== 'undefined') {
      coop.send(payload);
    }
    if (typeof isBattleMode !== 'undefined' && isBattleMode && typeof battle !== 'undefined') {
      battle.send(payload);
    }

    _showBubble(emote, false);
    _startHudCooldown();
  }

  // ── Bubble display ─────────────────────────────────────────────────────────

  function _showBubble(emote, isRemote) {
    const id = isRemote ? 'chat-emote-bubble-remote' : 'chat-emote-bubble-local';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'chat-emote-bubble' + (isRemote ? ' ceb-remote' : ' ceb-local');
      document.body.appendChild(el);
    }

    el.innerHTML = '';
    const iconEl = document.createElement('span');
    iconEl.className = 'ceb-icon';
    iconEl.textContent = emote.icon;
    const labelEl = document.createElement('span');
    labelEl.className = 'ceb-label';
    labelEl.textContent = emote.label;
    el.appendChild(iconEl);
    el.appendChild(labelEl);

    // cancel any pending fade
    clearTimeout(el._fadeHandle);
    clearTimeout(el._hideHandle);
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'scale(0)';
    el.style.display = 'flex';

    // bounce-in: scale 0 → 1.2 → 1 over 300ms
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.transform = 'scale(1.2)';
        setTimeout(function () {
          el.style.transform = 'scale(1)';
          // hold 2s, fade out 200ms
          el._fadeHandle = setTimeout(function () {
            el.style.transition = 'opacity 0.2s';
            el.style.opacity = '0';
            el._hideHandle = setTimeout(function () {
              el.style.display = 'none';
              el.style.opacity = '1';
              el.style.transform = 'scale(1)';
            }, 220);
          }, 2000);
        }, 120);
      });
    });
  }

  // ── HUD cooldown hint ──────────────────────────────────────────────────────

  function _startHudCooldown() {
    const timerEl = document.getElementById('chat-emote-t-cooldown');
    if (!timerEl) return;
    clearInterval(_cooldownHandle);
    let remaining = COOLDOWN_MS;
    timerEl.textContent = '3s';
    timerEl.style.display = 'inline';
    _cooldownHandle = setInterval(function () {
      remaining -= 500;
      if (remaining <= 0) {
        clearInterval(_cooldownHandle);
        timerEl.textContent = '';
        timerEl.style.display = 'none';
      } else {
        timerEl.textContent = Math.ceil(remaining / 1000) + 's';
      }
    }, 500);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    /** Keydown T — open the wheel */
    openWheel: function () {
      if (_isOpen) return;
      _openWheel();
    },

    /** Keyup T — confirm selection and close */
    closeWheel: function () {
      if (!_isOpen) return;
      _confirmSend();
      _closeWheel();
    },

    /** ESC — cancel without sending */
    cancelWheel: function () {
      _closeWheel();
    },

    isOpen: function () { return _isOpen; },

    handleArrow: function (code) { _handleArrow(code); },

    /** Receive a chat_emote message from the remote partner */
    receive: function (data) {
      if (!_showOpponentEmotes()) return;
      const emote = ALL_EMOTES.find(function (e) { return e.id === data.emoteId; });
      if (!emote) return;
      _showBubble(emote, true);
    },

    /** Unlock an unlockable emote by id */
    unlock: function (emoteId) { _unlockEmote(emoteId); },

    isUnlocked: function (emoteId) { return _isUnlocked(emoteId); },

    reset: function () {
      _closeWheel();
    },

    /** Called when multiplayer session ends */
    onSessionEnd: function () {
      _closeWheel();
      // hide bubbles
      ['chat-emote-bubble-local', 'chat-emote-bubble-remote'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    },
  };
})();
