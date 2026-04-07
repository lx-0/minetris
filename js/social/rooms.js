// js/social/rooms.js — Custom Game Rooms WebSocket manager.
// Supports configurable game settings, lobby chat, up to 4 players, and spectators.
// Builds on the same Cloudflare Durable Object relay used by battle/coop modes.

const ROOMS_WORKER_URL = 'https://minectris-leaderboard.workers.dev';

const RoomState = {
  IDLE:         'idle',
  CONNECTING:   'connecting',
  LOBBY:        'lobby',
  IN_GAME:      'in_game',
  DISCONNECTED: 'disconnected',
};

// Default room settings applied when no custom settings are specified
const ROOM_DEFAULTS = {
  roomName:    '',
  maxPlayers:  2,
  gameSpeed:   'normal',   // slow | normal | fast
  startLevel:  0,          // 0–15
  garbageLines:false,
  lockDelay:   'normal',   // short | normal | long
  boardSize:   'standard', // standard | wide
  isPublic:    true,
};

// Speed multipliers for the game engine
const ROOM_SPEED_MULT = { slow: 0.6, normal: 1.0, fast: 1.8 };

// Lock delay frames per setting
const ROOM_LOCK_FRAMES = { short: 20, normal: 30, long: 50 };

const rooms = (function () {
  let _state          = RoomState.IDLE;
  let _ws             = null;
  let _roomCode       = null;
  let _lastWsUrl      = null;
  let _handlers       = {};
  let _pingInterval   = null;
  let _partnerTimeout = null;
  let _isHost         = false;
  let _players        = [];       // { id, name, avatar, isHost, isReady, isSpectator }
  let _settings       = Object.assign({}, ROOM_DEFAULTS);
  let _myId           = null;     // local player pseudo-ID
  let _chatHistory    = [];
  let _spectatorCount = 0;

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _setState(s) {
    _state = s;
  }

  function _clearTimers() {
    if (_pingInterval)   { clearInterval(_pingInterval);  _pingInterval   = null; }
    if (_partnerTimeout) { clearTimeout(_partnerTimeout); _partnerTimeout = null; }
  }

  function _startPing() {
    _pingInterval = setInterval(function () {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  function _emit(type, data) {
    const fns = _handlers[type];
    if (fns) fns.forEach(function (fn) { try { fn(data); } catch (_) {} });
  }

  function _genId() {
    return Math.random().toString(36).slice(2, 10);
  }

  function _getMyName() {
    try { return localStorage.getItem('minectris_display_name') || 'Player'; } catch (_) { return 'Player'; }
  }

  function _getMyAvatar() {
    try { return localStorage.getItem('minectris_avatar') || ''; } catch (_) { return ''; }
  }

  function _buildPlayerPayload() {
    return { id: _myId, name: _getMyName(), avatar: _getMyAvatar(), isHost: _isHost, isReady: false, isSpectator: false };
  }

  function _upsertPlayer(p) {
    const idx = _players.findIndex(function (x) { return x.id === p.id; });
    if (idx >= 0) {
      _players[idx] = Object.assign(_players[idx], p);
    } else {
      _players.push(p);
    }
  }

  function _removePlayer(id) {
    _players = _players.filter(function (p) { return p.id !== id; });
  }

  function _connectWs(wsUrl) {
    _lastWsUrl = wsUrl;
    _setState(RoomState.CONNECTING);
    _emit('state_change', { state: _state, roomCode: _roomCode });

    _ws = new WebSocket(wsUrl);

    _ws.addEventListener('open', function () {
      _startPing();
      _setState(RoomState.LOBBY);

      // Announce self to room
      _publicAPI.send({ type: 'room_player_join', player: _buildPlayerPayload() });

      // Host broadcasts settings immediately after opening
      if (_isHost) {
        _publicAPI.send({ type: 'room_settings', settings: _settings });
      }

      _emit('state_change', { state: _state, roomCode: _roomCode });

      // 2-minute timeout in lobby if still only one player
      _partnerTimeout = setTimeout(function () {
        const nonSpec = _players.filter(function (p) { return !p.isSpectator; });
        if (nonSpec.length < 2 && _state === RoomState.LOBBY) {
          _emit('timeout', {});
          _publicAPI.disconnect();
        }
      }, 120000);
    });

    _ws.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      _handleMessage(msg);
    });

    _ws.addEventListener('close', function () {
      _clearTimers();
      if (_state === RoomState.IN_GAME) return; // game handles this
      _setState(RoomState.DISCONNECTED);
      _emit('state_change', { state: _state, roomCode: _roomCode });
      _emit('disconnected', {});
    });

    _ws.addEventListener('error', function () {
      _emit('error', { message: 'Connection error' });
    });
  }

  function _handleMessage(msg) {
    switch (msg.type) {

      case 'pong': break;
      case 'ping':
        if (_ws && _ws.readyState === WebSocket.OPEN) {
          _ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;

      // Existing battle relay messages — a player joined (legacy 2-player handshake)
      case 'player_joined':
        // Server echoes when the second client connects; we use our own room_player_join for tracking
        if (_partnerTimeout) { clearTimeout(_partnerTimeout); _partnerTimeout = null; }
        _emit('player_joined', msg);
        break;

      case 'player_left':
        _emit('player_left', msg);
        break;

      case 'spectator_joined':
        _spectatorCount = msg.count || (_spectatorCount + 1);
        _emit('spectator_count', { count: _spectatorCount });
        break;

      case 'spectator_count':
        _spectatorCount = msg.count || 0;
        _emit('spectator_count', { count: _spectatorCount });
        break;

      // ── Custom room messages ──────────────────────────────────────────────

      case 'room_player_join': {
        if (!msg.player) break;
        if (_partnerTimeout) { clearTimeout(_partnerTimeout); _partnerTimeout = null; }
        _upsertPlayer(msg.player);
        // Host re-sends settings so new joiner gets them
        if (_isHost) {
          _publicAPI.send({ type: 'room_settings', settings: _settings });
          _publicAPI.send({ type: 'room_roster', players: _players });
        }
        _emit('roster_change', { players: _players.slice() });
        break;
      }

      case 'room_player_leave': {
        if (!msg.playerId) break;
        const wasHost = _players.find(function (p) { return p.id === msg.playerId && p.isHost; });
        _removePlayer(msg.playerId);
        if (wasHost && _players.length > 0) {
          // Promote the first remaining player to host
          _players[0].isHost = true;
          if (_players[0].id === _myId) {
            _isHost = true;
            _emit('became_host', {});
          }
        }
        _emit('roster_change', { players: _players.slice() });
        break;
      }

      case 'room_player_ready': {
        if (!msg.playerId) break;
        const p = _players.find(function (x) { return x.id === msg.playerId; });
        if (p) { p.isReady = msg.ready; }
        _emit('roster_change', { players: _players.slice() });
        break;
      }

      case 'room_settings': {
        if (!_isHost && msg.settings) {
          _settings = Object.assign({}, ROOM_DEFAULTS, msg.settings);
          _emit('settings_change', { settings: Object.assign({}, _settings) });
        }
        break;
      }

      case 'room_roster': {
        // Full roster sync (sent by host to new joiners)
        if (msg.players && Array.isArray(msg.players)) {
          msg.players.forEach(function (p) {
            if (p.id !== _myId) _upsertPlayer(p);
          });
          _emit('roster_change', { players: _players.slice() });
        }
        break;
      }

      case 'room_chat': {
        if (!msg.playerId || !msg.text) break;
        const entry = { playerId: msg.playerId, playerName: msg.playerName || '?', text: msg.text, ts: Date.now() };
        _chatHistory.push(entry);
        if (_chatHistory.length > 200) _chatHistory.shift();
        _emit('chat', entry);
        break;
      }

      case 'room_kick': {
        if (msg.targetId === _myId) {
          _emit('kicked', {});
          _publicAPI.disconnect();
        }
        break;
      }

      case 'room_start': {
        if (msg.settings) _settings = Object.assign({}, ROOM_DEFAULTS, msg.settings);
        _setState(RoomState.IN_GAME);
        _emit('state_change', { state: _state, roomCode: _roomCode });
        _emit('game_start', { settings: Object.assign({}, _settings), isHost: _isHost });
        break;
      }

      default:
        _emit('message', msg);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const _publicAPI = {

    get state()         { return _state; },
    get roomCode()      { return _roomCode; },
    get isHost()        { return _isHost; },
    get players()       { return _players.slice(); },
    get settings()      { return Object.assign({}, _settings); },
    get spectatorCount(){ return _spectatorCount; },
    get chatHistory()   { return _chatHistory.slice(); },
    get myId()          { return _myId; },
    get defaults()      { return Object.assign({}, ROOM_DEFAULTS); },
    get speedMult()     { return ROOM_SPEED_MULT; },
    get lockFrames()    { return ROOM_LOCK_FRAMES; },

    // Register event handler
    on: function (type, fn) {
      if (!_handlers[type]) _handlers[type] = [];
      _handlers[type].push(fn);
    },

    off: function (type, fn) {
      if (!_handlers[type]) return;
      _handlers[type] = _handlers[type].filter(function (f) { return f !== fn; });
    },

    // Create a new custom room with given settings
    createRoom: async function (settings) {
      if (_state !== RoomState.IDLE && _state !== RoomState.DISCONNECTED) return;
      _myId    = _genId();
      _isHost  = true;
      _players = [];
      _chatHistory = [];
      _spectatorCount = 0;
      _settings = Object.assign({}, ROOM_DEFAULTS, settings || {});
      if (_settings.roomName === '') {
        _settings.roomName = _getMyName() + "'s Room";
      }

      // Add self to player list immediately
      _upsertPlayer(_buildPlayerPayload());

      try {
        const res = await fetch(ROOMS_WORKER_URL + '/battle/room/create', { method: 'POST' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        _roomCode = data.roomCode;
        _connectWs(data.wsUrl);
        return { roomCode: _roomCode };
      } catch (err) {
        _emit('error', { message: 'Could not create room: ' + err.message });
        return null;
      }
    },

    // Join an existing room by code
    joinRoom: async function (code) {
      if (_state !== RoomState.IDLE && _state !== RoomState.DISCONNECTED) return;
      _myId    = _genId();
      _isHost  = false;
      _players = [];
      _chatHistory = [];
      _spectatorCount = 0;
      _settings = Object.assign({}, ROOM_DEFAULTS);
      _roomCode = code.trim().toUpperCase();

      // Add self to player list
      _upsertPlayer(_buildPlayerPayload());

      try {
        const res = await fetch(ROOMS_WORKER_URL + '/battle/room/' + _roomCode + '/join');
        if (!res.ok) {
          if (res.status === 404) throw new Error('Room not found');
          throw new Error('HTTP ' + res.status);
        }
        const data = await res.json();
        _connectWs(data.wsUrl);
        return { roomCode: _roomCode };
      } catch (err) {
        _emit('error', { message: err.message || 'Could not join room' });
        return null;
      }
    },

    // Send a raw message to all room members
    send: function (msg) {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify(msg));
      }
    },

    // Update room settings (host only)
    updateSettings: function (patch) {
      if (!_isHost) return;
      _settings = Object.assign({}, _settings, patch);
      _publicAPI.send({ type: 'room_settings', settings: _settings });
      _emit('settings_change', { settings: Object.assign({}, _settings) });
    },

    // Toggle own ready status
    setReady: function (ready) {
      const p = _players.find(function (x) { return x.id === _myId; });
      if (p) p.isReady = ready;
      _publicAPI.send({ type: 'room_player_ready', playerId: _myId, ready: ready });
      _emit('roster_change', { players: _players.slice() });
    },

    // Send a chat message
    sendChat: function (text) {
      if (!text || !text.trim()) return;
      const t = text.trim().slice(0, 200);
      _publicAPI.send({ type: 'room_chat', playerId: _myId, playerName: _getMyName(), text: t });
      // Echo own message locally
      const entry = { playerId: _myId, playerName: _getMyName(), text: t, ts: Date.now(), isSelf: true };
      _chatHistory.push(entry);
      _emit('chat', entry);
    },

    // Kick a player (host only)
    kick: function (playerId) {
      if (!_isHost) return;
      _publicAPI.send({ type: 'room_kick', targetId: playerId });
      _removePlayer(playerId);
      _emit('roster_change', { players: _players.slice() });
    },

    // Start the game (host only, called when all non-spectators are ready)
    startGame: function () {
      if (!_isHost) return;
      _publicAPI.send({ type: 'room_start', settings: _settings });
      _setState(RoomState.IN_GAME);
      _emit('state_change', { state: _state, roomCode: _roomCode });
      _emit('game_start', { settings: Object.assign({}, _settings), isHost: _isHost });
    },

    // Disconnect and reset
    disconnect: function () {
      _publicAPI.send({ type: 'room_player_leave', playerId: _myId });
      _clearTimers();
      if (_ws) { try { _ws.close(); } catch (_) {} _ws = null; }
      _setState(RoomState.IDLE);
      _roomCode = null;
      _players  = [];
      _chatHistory = [];
      _spectatorCount = 0;
      _isHost   = false;
      _emit('state_change', { state: _state, roomCode: null });
    },

    // Returns invite URL for sharing
    inviteUrl: function () {
      if (!_roomCode) return '';
      return window.location.origin + window.location.pathname + '?room=' + _roomCode;
    },

    // Store a public room in localStorage for browsing
    registerPublicRoom: function () {
      if (!_roomCode || !_settings.isPublic) return;
      try {
        const key = 'minectris_public_rooms';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        const entry = {
          code:     _roomCode,
          name:     _settings.roomName,
          host:     _getMyName(),
          players:  _players.filter(function (p) { return !p.isSpectator; }).length,
          max:      _settings.maxPlayers,
          ts:       Date.now(),
        };
        // Evict rooms older than 10 minutes
        const fresh = existing.filter(function (r) { return Date.now() - r.ts < 600000; });
        // Replace or append
        const idx = fresh.findIndex(function (r) { return r.code === _roomCode; });
        if (idx >= 0) fresh[idx] = entry; else fresh.unshift(entry);
        localStorage.setItem(key, JSON.stringify(fresh.slice(0, 20)));
      } catch (_) {}
    },

    // Get locally stored public room list (no server call needed)
    getPublicRooms: function () {
      try {
        const key = 'minectris_public_rooms';
        const raw = JSON.parse(localStorage.getItem(key) || '[]');
        return raw.filter(function (r) { return Date.now() - r.ts < 600000; });
      } catch (_) { return []; }
    },
  };

  return _publicAPI;
}());
