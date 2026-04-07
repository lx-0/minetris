// js/battle/battleroyale.js — Battle Royale mode: 4–10 player free-for-all.
// Features: matchmaking queue, elimination/spectate, garbage targeting,
//           board shrink (every 60s), speed ramp (every 90s), mini-boards,
//           placement podium, XP rewards, and a separate BR leaderboard.
//
// Requires: battle.js (BATTLE_WORKER_URL), battle-garbage.js (calcGarbageSent),
//           gamestate.js (loadLifetimeStats / saveLifetimeStats),
//           progression/xp.js or inline xp-award helper.

const BR_WORKER_URL = typeof BATTLE_WORKER_URL !== 'undefined'
  ? BATTLE_WORKER_URL
  : 'https://minectris-leaderboard.workers.dev';

const BR_STORAGE_KEY = 'mineCtris_battleRoyaleBest';

// ─── Constants ────────────────────────────────────────────────────────────────
const BR_MIN_PLAYERS      = 4;
const BR_MAX_PLAYERS      = 10;
const BR_SHRINK_INTERVAL  = 60;   // seconds between board width shrinks
const BR_SPEED_INTERVAL   = 90;   // seconds between global speed ticks
const BR_MIN_BOARD_WIDTH  = 6;    // columns
const BR_DEFAULT_WIDTH    = 10;   // columns

// XP multipliers by placement (1-indexed; index 0 = winner = 1st place)
const BR_XP_BASE        = 100;
const BR_XP_MULTIPLIERS = [3.0, 2.0, 1.5, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

// ─── State ────────────────────────────────────────────────────────────────────
const battleRoyale = (function () {

  let _ws              = null;
  let _roomCode        = null;
  let _playerId        = null;   // our seat index assigned by server
  let _playerCount     = 0;      // number of players when match started
  let _alive           = [];     // seat indices still in the game
  let _eliminated      = [];     // { seatIndex, placement, name } in elimination order
  let _mySeat          = -1;
  let _placement       = 0;      // our final placement (0 = still playing)
  let _isSpectating    = false;
  let _gameActive      = false;

  // Board-shrink state
  let _boardWidth       = BR_DEFAULT_WIDTH;
  let _shrinkTimer      = 0;    // seconds until next shrink
  let _shrinkFromLeft   = true; // alternates each shrink
  let _shrinkCol        = -1;   // column index currently hidden (-1 = none)

  // Speed state
  let _speedLevel       = 0;
  let _speedTimer       = 0;

  // Timers (driven by external tick)
  let _gameTime         = 0;

  // Garbage targeting
  let _lastTargetSeat   = -1;

  // Ping
  let _pingInterval     = null;

  // Event bus
  let _handlers         = {};

  // Mini-board canvases: Map<seatIndex, {canvas, ctx, data}>
  const _miniBoards     = new Map();

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function _emit(type, data) {
    const fns = _handlers[type];
    if (fns) fns.forEach(function (fn) { try { fn(data); } catch (_) {} });
  }

  function _startPing() {
    _pingInterval = setInterval(function () {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  function _stopPing() {
    if (_pingInterval) { clearInterval(_pingInterval); _pingInterval = null; }
  }

  function _send(msg) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(msg));
    }
  }

  function _randomAliveOpponent() {
    const others = _alive.filter(function (s) { return s !== _mySeat; });
    if (!others.length) return -1;
    return others[Math.floor(Math.random() * others.length)];
  }

  // ─── Leaderboard persistence ─────────────────────────────────────────────

  function _loadBRBest() {
    try { return JSON.parse(localStorage.getItem(BR_STORAGE_KEY) || 'null'); } catch (_) { return null; }
  }

  function _saveBRResult(placement, totalPlayers) {
    const existing = _loadBRBest();
    const isNew = !existing
      || placement < existing.bestPlacement
      || (placement === existing.bestPlacement && totalPlayers > (existing.totalPlayers || 0));
    const data = existing || { bestPlacement: placement, wins: 0, totalGames: 0, totalPlayers };
    data.totalGames = (data.totalGames || 0) + 1;
    if (placement === 1) data.wins = (data.wins || 0) + 1;
    if (isNew) {
      data.bestPlacement = placement;
      data.totalPlayers  = totalPlayers;
      data.date          = new Date().toISOString().slice(0, 10);
    }
    try { localStorage.setItem(BR_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
    return isNew;
  }

  // ─── XP award ────────────────────────────────────────────────────────────

  function _awardXP(placement) {
    if (typeof loadLifetimeStats !== 'function' || typeof saveLifetimeStats !== 'function') return 0;
    const idx = Math.max(0, placement - 1);
    const mult = BR_XP_MULTIPLIERS[Math.min(idx, BR_XP_MULTIPLIERS.length - 1)] || 1.0;
    const earned = Math.round(BR_XP_BASE * mult);
    const stats = loadLifetimeStats();
    stats.playerXP = (stats.playerXP || 0) + earned;
    saveLifetimeStats(stats);
    return earned;
  }

  // ─── Board shrink logic ───────────────────────────────────────────────────

  /**
   * Shrink the board by hiding the leftmost or rightmost visible column.
   * Returns the column index that was hidden (for renderer to black out).
   */
  function _applyShrink() {
    if (_boardWidth <= BR_MIN_BOARD_WIDTH) return -1;
    _boardWidth--;
    // Alternate sides: even shrink steps → left, odd → right
    const shrinkCount = BR_DEFAULT_WIDTH - _boardWidth;
    const fromLeft = (shrinkCount % 2 === 1);
    _shrinkFromLeft = fromLeft;

    // The hidden column index in the original 0–9 grid
    // We track an offset: left offset = how many cols hidden from left
    const leftHidden  = Math.ceil((BR_DEFAULT_WIDTH - _boardWidth) / 2);
    const rightHidden = Math.floor((BR_DEFAULT_WIDTH - _boardWidth) / 2);
    _emit('board_shrink', {
      boardWidth: _boardWidth,
      leftHidden,
      rightHidden,
    });
    return fromLeft ? leftHidden - 1 : BR_DEFAULT_WIDTH - rightHidden;
  }

  // ─── Speed ramp ──────────────────────────────────────────────────────────

  function _applySpeedRamp() {
    _speedLevel++;
    _emit('speed_ramp', { speedLevel: _speedLevel });
  }

  // ─── Mini-board rendering ─────────────────────────────────────────────────

  const _MINI_W = 48;
  const _MINI_H = 80;
  const _MINI_COLS = 10;

  function _getMiniCanvas(seatIndex) {
    if (_miniBoards.has(seatIndex)) return _miniBoards.get(seatIndex);
    const canvas = document.createElement('canvas');
    canvas.width  = _MINI_W;
    canvas.height = _MINI_H;
    canvas.className = 'br-mini-board-canvas';
    canvas.setAttribute('data-seat', seatIndex);
    const ctx = canvas.getContext('2d');
    const entry = { canvas, ctx, cols: new Array(_MINI_COLS).fill(0), eliminated: false };
    _miniBoards.set(seatIndex, entry);
    return entry;
  }

  function _drawMiniBoard(seatIndex, cols, isEliminated) {
    const entry = _getMiniCanvas(seatIndex);
    if (!entry) return;
    entry.cols = cols || entry.cols;
    entry.eliminated = isEliminated || entry.eliminated;
    const { ctx } = entry;
    ctx.clearRect(0, 0, _MINI_W, _MINI_H);

    // Background
    ctx.fillStyle = entry.eliminated ? 'rgba(40,0,0,0.8)' : 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, _MINI_W, _MINI_H);

    if (!entry.eliminated) {
      const barW  = Math.floor(_MINI_W / _MINI_COLS);
      const maxH  = 20;
      for (let c = 0; c < _MINI_COLS; c++) {
        const h   = Math.abs(entry.cols[c] || 0);
        const barH = Math.min(Math.round((h / maxH) * (_MINI_H - 2)), _MINI_H - 2);
        if (barH <= 0) continue;
        const danger = h >= maxH * 0.75;
        ctx.fillStyle = danger ? '#cc4444' : '#7a9a7a';
        ctx.fillRect(c * barW + 1, _MINI_H - barH - 1, barW - 2, barH);
      }
    } else {
      // Eliminated — draw an X
      ctx.strokeStyle = 'rgba(255,80,80,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, 4);           ctx.lineTo(_MINI_W - 4, _MINI_H - 4);
      ctx.moveTo(_MINI_W - 4, 4); ctx.lineTo(4, _MINI_H - 4);
      ctx.stroke();
    }
  }

  // ─── WebSocket message handler ────────────────────────────────────────────

  function _onMessage(event) {
    let msg;
    try { msg = JSON.parse(event.data); } catch (_) { return; }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'pong': return;

      case 'br_welcome':
        // Server assigns us a seat and tells us total player count
        _mySeat      = msg.seatIndex;
        _playerCount = msg.playerCount;
        _alive       = msg.alive || [];
        _emit('br_welcome', msg);
        break;

      case 'br_player_joined':
        _playerCount = msg.playerCount;
        _emit('br_player_joined', msg);
        break;

      case 'br_countdown':
        _emit('br_countdown', msg);
        break;

      case 'br_start':
        _gameActive   = true;
        _gameTime     = 0;
        _shrinkTimer  = BR_SHRINK_INTERVAL;
        _speedTimer   = BR_SPEED_INTERVAL;
        _boardWidth   = BR_DEFAULT_WIDTH;
        _shrinkFromLeft = true;
        _speedLevel   = 0;
        _alive        = msg.alive || Array.from({ length: _playerCount }, function (_, i) { return i; });
        _eliminated   = [];
        _emit('br_start', msg);
        break;

      case 'br_board':
        // Opponent board state update for mini-boards
        if (msg.seatIndex !== _mySeat) {
          const isElim = _eliminated.some(function (e) { return e.seatIndex === msg.seatIndex; });
          _drawMiniBoard(msg.seatIndex, msg.cols, isElim);
          _emit('br_board', msg);
        }
        break;

      case 'br_attack':
        // Incoming garbage from an opponent
        if (msg.targetSeat === _mySeat && typeof queueBattleGarbage === 'function') {
          queueBattleGarbage(msg.lines, msg.gapSeed != null ? msg.gapSeed : Math.random() * 0xffffffff | 0);
        }
        _emit('br_attack', msg);
        break;

      case 'br_eliminated':
        // A player was eliminated
        _alive = _alive.filter(function (s) { return s !== msg.seatIndex; });
        _eliminated.push({ seatIndex: msg.seatIndex, placement: msg.placement, name: msg.playerName || ('P' + (msg.seatIndex + 1)) });
        _drawMiniBoard(msg.seatIndex, null, true);

        if (msg.seatIndex === _mySeat) {
          // We are eliminated
          _placement    = msg.placement;
          _isSpectating = true;
          _gameActive   = false;
          const xpEarned = _awardXP(_placement);
          _saveBRResult(_placement, _playerCount);
          _emit('br_self_eliminated', { placement: _placement, xpEarned, playerCount: _playerCount });
        } else {
          _emit('br_opponent_eliminated', { seatIndex: msg.seatIndex, placement: msg.placement, name: msg.playerName });
        }
        break;

      case 'br_winner':
        // Game over — a winner was determined
        _gameActive = false;
        if (msg.seatIndex === _mySeat) {
          _placement = 1;
          const xpEarned = _awardXP(1);
          _saveBRResult(1, _playerCount);
          _emit('br_victory', { xpEarned, playerCount: _playerCount });
        }
        _emit('br_winner', msg);
        break;

      case 'br_shrink':
        // Server-authoritative board shrink tick
        const shrinkResult = _applyShrink();
        _emit('br_shrink_applied', { boardWidth: _boardWidth });
        break;

      case 'br_speed':
        _applySpeedRamp();
        break;

      case 'br_disbanded':
        _gameActive = false;
        _emit('br_disbanded', msg);
        _publicAPI.disconnect();
        break;

      default:
        _emit(msg.type, msg);
    }
  }

  // ─── Connection ──────────────────────────────────────────────────────────

  function _connectWs(wsUrl) {
    _ws = new WebSocket(wsUrl);
    _ws.addEventListener('open', function () {
      _startPing();
      _emit('connected', { roomCode: _roomCode });
    });
    _ws.addEventListener('message', _onMessage);
    _ws.addEventListener('close', function () {
      _stopPing();
      if (_gameActive) {
        _gameActive = false;
        _emit('disconnected', {});
      }
    });
    _ws.addEventListener('error', function () {});
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  const _publicAPI = {

    get roomCode()     { return _roomCode; },
    get mySeat()       { return _mySeat; },
    get playerCount()  { return _playerCount; },
    get alive()        { return _alive.slice(); },
    get eliminated()   { return _eliminated.slice(); },
    get isSpectating() { return _isSpectating; },
    get gameActive()   { return _gameActive; },
    get boardWidth()   { return _boardWidth; },
    get speedLevel()   { return _speedLevel; },

    /**
     * Join the global BR matchmaking queue.
     * Server waits for BR_MIN_PLAYERS, starts countdown, locks at BR_MAX_PLAYERS.
     */
    async joinQueue() {
      const resp = await fetch(BR_WORKER_URL + '/br/queue/join', { method: 'POST' });
      if (!resp.ok) throw new Error('BR queue join failed');
      const data = await resp.json();
      _roomCode = data.roomCode;
      _connectWs(data.wsUrl);
      return data;
    },

    /**
     * Per-frame tick. Drives game timers if we are in an active game.
     * External game loop must call this.
     * @param {number} delta  Seconds since last frame.
     */
    tick(delta) {
      if (!_gameActive) return;
      _gameTime += delta;

      // Broadcast our board state every ~500 ms (driven by caller)
      // Shrink timer
      _shrinkTimer -= delta;
      if (_shrinkTimer <= 0) {
        _shrinkTimer = BR_SHRINK_INTERVAL;
        // Only host sends shrink trigger to avoid duplication;
        // server authoritatively broadcasts br_shrink to all.
        // We apply locally via br_shrink message.
      }

      // Speed timer (applied locally; server also broadcasts br_speed)
      _speedTimer -= delta;
      if (_speedTimer <= 0) {
        _speedTimer = BR_SPEED_INTERVAL;
      }
    },

    /**
     * Send our board column heights to all opponents.
     * @param {number[]} cols  10-element column-height array.
     * @param {number}   scoreVal
     * @param {number}   levelVal
     */
    sendBoard(cols, scoreVal, levelVal) {
      _send({ type: 'br_board', cols, score: scoreVal, level: levelVal });
    },

    /**
     * Send a garbage attack to a random surviving opponent.
     * @param {number}  lines      Rows to send.
     * @param {number}  gapSeed    RNG seed for gap position.
     */
    sendAttack(lines, gapSeed) {
      if (!lines || !_gameActive) return;
      const target = _randomAliveOpponent();
      if (target < 0) return;
      _lastTargetSeat = target;
      _send({ type: 'br_attack', lines, gapSeed: gapSeed || 0, targetSeat: target });
    },

    /**
     * Notify the server that we topped out (were eliminated).
     * Server will assign our placement and broadcast br_eliminated.
     */
    sendEliminated() {
      _send({ type: 'br_game_over' });
    },

    /** Register an event listener. */
    on(type, fn) {
      if (!_handlers[type]) _handlers[type] = [];
      _handlers[type].push(fn);
    },

    /** Remove an event listener. */
    off(type, fn) {
      if (!_handlers[type]) return;
      _handlers[type] = _handlers[type].filter(function (f) { return f !== fn; });
    },

    /** Get the mini-board canvas element for a given seat. */
    getMiniCanvas(seatIndex) {
      const entry = _getMiniCanvas(seatIndex);
      return entry ? entry.canvas : null;
    },

    /** Load BR personal best from localStorage. */
    loadBest: _loadBRBest,

    /** Disconnect and reset all state. */
    disconnect() {
      _stopPing();
      if (_ws) {
        try { _ws.close(); } catch (_) {}
        _ws = null;
      }
      _roomCode    = null;
      _mySeat      = -1;
      _playerCount = 0;
      _alive       = [];
      _eliminated  = [];
      _placement   = 0;
      _gameActive  = false;
      _isSpectating = false;
      _boardWidth  = BR_DEFAULT_WIDTH;
      _speedLevel  = 0;
      _shrinkTimer = 0;
      _speedTimer  = 0;
      _gameTime    = 0;
      _miniBoards.clear();
      _handlers    = {};
    },
  };

  return _publicAPI;
})();

// ─── BR UI Controller ────────────────────────────────────────────────────────
// Manages the BR overlay: queue screen, countdown, mini-board ring, placement podium.

function _initBattleRoyaleUI() {
  const overlay     = document.getElementById('br-overlay');
  if (!overlay || typeof battleRoyale === 'undefined') return;

  const queueView   = document.getElementById('br-queue-view');
  const countdownView = document.getElementById('br-countdown-view');
  const placementView = document.getElementById('br-placement-view');
  const miniBoardsEl  = document.getElementById('br-mini-boards');
  const playerCountEl = document.getElementById('br-player-count');
  const countdownEl   = document.getElementById('br-countdown-num');
  const placementEl   = document.getElementById('br-placement-label');
  const placementXpEl = document.getElementById('br-placement-xp');
  const cancelBtn     = document.getElementById('br-cancel-btn');
  const menuBtn       = document.getElementById('br-menu-btn');
  const shrinkNoticeEl = document.getElementById('br-shrink-notice');
  const aliveCountEl  = document.getElementById('br-alive-count');

  function _showView(name) {
    [queueView, countdownView, placementView].forEach(function (v) {
      if (v) v.style.display = 'none';
    });
    var target = { queue: queueView, countdown: countdownView, placement: placementView }[name];
    if (target) target.style.display = '';
  }

  function _updateAliveCount() {
    if (!aliveCountEl) return;
    aliveCountEl.textContent = battleRoyale.alive.length + ' / ' + battleRoyale.playerCount + ' alive';
  }

  function _buildMiniBoards(totalPlayers) {
    if (!miniBoardsEl) return;
    miniBoardsEl.innerHTML = '';
    for (let i = 0; i < totalPlayers; i++) {
      if (i === battleRoyale.mySeat) continue;
      const wrap = document.createElement('div');
      wrap.className = 'br-mini-wrap';
      wrap.setAttribute('data-seat', i);

      const nameEl = document.createElement('div');
      nameEl.className = 'br-mini-name';
      nameEl.textContent = 'P' + (i + 1);

      const canvas = battleRoyale.getMiniCanvas(i);
      if (canvas) wrap.appendChild(canvas);
      wrap.appendChild(nameEl);
      miniBoardsEl.appendChild(wrap);
    }
  }

  function _flashShrinkNotice() {
    if (!shrinkNoticeEl) return;
    shrinkNoticeEl.style.display = 'block';
    shrinkNoticeEl.classList.add('br-shrink-flash');
    setTimeout(function () {
      shrinkNoticeEl.classList.remove('br-shrink-flash');
      shrinkNoticeEl.style.display = 'none';
    }, 2500);
  }

  function _showPlacementScreen(placement, totalPlayers, xpEarned, isWin) {
    overlay.style.display = 'flex';
    _showView('placement');

    if (placementEl) {
      if (isWin || placement === 1) {
        placementEl.innerHTML = '&#127942; 1ST PLACE<br><span style="font-size:0.7em;color:#ffd700;">VICTORY ROYALE!</span>';
      } else if (placement === 2) {
        placementEl.innerHTML = '&#129353; 2ND PLACE';
      } else if (placement === 3) {
        placementEl.innerHTML = '&#129354; 3RD PLACE';
      } else {
        placementEl.innerHTML = '#' + placement + ' / ' + totalPlayers;
      }
    }
    if (placementXpEl) {
      placementXpEl.textContent = '+' + xpEarned + ' XP';
    }
  }

  // ── Wire up events ──────────────────────────────────────────────────────

  battleRoyale.on('connected', function () {
    overlay.style.display = 'flex';
    _showView('queue');
    if (playerCountEl) playerCountEl.textContent = '1 / ' + BR_MAX_PLAYERS + ' players';
  });

  battleRoyale.on('br_player_joined', function (msg) {
    if (playerCountEl) playerCountEl.textContent = msg.playerCount + ' / ' + BR_MAX_PLAYERS + ' players';
  });

  battleRoyale.on('br_countdown', function (msg) {
    _showView('countdown');
    var t = msg.seconds || 3;
    var tick = function () {
      if (!countdownEl) return;
      countdownEl.textContent = t;
      countdownEl.classList.remove('br-countdown-pop');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('br-countdown-pop');
      if (t > 0) { t--; setTimeout(tick, 1000); }
    };
    tick();
  });

  battleRoyale.on('br_start', function (msg) {
    overlay.style.display = 'none';
    _buildMiniBoards(battleRoyale.playerCount);
    _updateAliveCount();
    // Show in-game mini-boards panel
    var panel = document.getElementById('br-ingame-panel');
    if (panel) panel.style.display = 'flex';
  });

  battleRoyale.on('br_opponent_eliminated', function (msg) {
    _updateAliveCount();
    // Flash the eliminated mini-board
    var wrap = miniBoardsEl && miniBoardsEl.querySelector('[data-seat="' + msg.seatIndex + '"]');
    if (wrap) wrap.classList.add('br-mini-eliminated');
  });

  battleRoyale.on('br_self_eliminated', function (msg) {
    _showPlacementScreen(msg.placement, msg.playerCount, msg.xpEarned, false);
    var panel = document.getElementById('br-ingame-panel');
    if (panel) panel.style.display = 'none';
  });

  battleRoyale.on('br_victory', function (msg) {
    _showPlacementScreen(1, battleRoyale.playerCount, msg.xpEarned, true);
    var panel = document.getElementById('br-ingame-panel');
    if (panel) panel.style.display = 'none';
  });

  battleRoyale.on('board_shrink', _flashShrinkNotice);

  battleRoyale.on('speed_ramp', function () {
    if (typeof notifPush === 'function') {
      notifPush('br_speed', '⚡', 'Speed increased!');
    }
  });

  battleRoyale.on('br_disbanded', function () {
    overlay.style.display = 'none';
    var panel = document.getElementById('br-ingame-panel');
    if (panel) panel.style.display = 'none';
  });

  battleRoyale.on('disconnected', function () {
    overlay.style.display = 'none';
    var panel = document.getElementById('br-ingame-panel');
    if (panel) panel.style.display = 'none';
  });

  // Cancel / back button in queue view
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      battleRoyale.disconnect();
      overlay.style.display = 'none';
    });
  }

  // Return to menu after placement screen
  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      battleRoyale.disconnect();
      overlay.style.display = 'none';
      if (typeof showModeSelect === 'function') showModeSelect();
    });
  }
}

// ─── Mode card click handler ─────────────────────────────────────────────────

function _initBattleRoyaleModeCard() {
  var card = document.getElementById('mode-card-battle_royale');
  if (!card) return;
  card.addEventListener('click', async function () {
    if (typeof hideModeSelect === 'function') hideModeSelect();
    try {
      await battleRoyale.joinQueue();
    } catch (err) {
      if (typeof notifPush === 'function') {
        notifPush('error', '⚠', 'BR queue error: ' + (err.message || 'unknown'));
      }
      if (typeof showModeSelect === 'function') showModeSelect();
    }
  });

  // Display personal best on mode card
  var pbEl = card.querySelector('.mode-card-pb');
  if (pbEl) {
    var best = battleRoyale.loadBest();
    if (best) {
      pbEl.textContent = 'Best: #' + best.bestPlacement + ' / ' + (best.totalPlayers || '?');
    }
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      _initBattleRoyaleUI();
      _initBattleRoyaleModeCard();
    });
  } else {
    _initBattleRoyaleUI();
    _initBattleRoyaleModeCard();
  }
})();
