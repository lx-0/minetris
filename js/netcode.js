// js/netcode.js — Input lag compensation for multiplayer.
// Provides: client-side prediction, server reconciliation, input buffering,
// opponent interpolation (jitter buffer), rollback blending, and offline fallback.
// Used by: battle.js, coop.js (via init()), game-loop.js (tickRollback / tickInterpolation).

const netcode = (function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────────────────────
  const INPUT_BUFFER_SIZE    = 10;   // max buffered inputs (ring buffer)
  const JITTER_BUFFER_FRAMES = 2;    // frames to hold before consuming opponent snapshot
  const ROLLBACK_FRAMES      = 3;    // frames over which to blend a state correction
  const INTERP_WINDOW_MS     = 100;  // lerp window (ms) for opponent board updates
  const PING_INTERVAL_MS     = 2000; // latency measurement cadence (ms)

  // ── Internal state ───────────────────────────────────────────────────────────
  let _inputBuffer       = [];   // { seq, action, timestamp }
  let _inputSeq          = 0;    // monotonic sequence counter

  let _latencyMs         = 0;
  let _lastPingSentAt    = 0;
  let _pendingPing       = false;
  let _pingTimer         = null;

  let _jitterQueue       = [];   // queued opponent snapshots { data, arrivedAt }
  let _interpFrom        = null; // lerp source snapshot
  let _interpTo          = null; // lerp target snapshot
  let _interpElapsed     = 0;    // ms elapsed in current lerp window

  let _rollbackFrame     = 0;    // >0 while blending toward server state
  let _rollbackCallback  = null; // fn(frame) invoked each blend tick

  let _isOfflineFallback  = false;
  let _offlineReconnectFn = null;

  let _sendFn            = null; // fn(msg) — wired up by init()
  let _pingDisplayCb     = null; // fn(ms, quality) — wired up by init()

  // ── Input buffer ─────────────────────────────────────────────────────────────

  /** Record a player input immediately (called on key/button press). */
  function recordInput(action) {
    const entry = { seq: _inputSeq++, action: action, timestamp: performance.now() };
    _inputBuffer.push(entry);
    if (_inputBuffer.length > INPUT_BUFFER_SIZE) _inputBuffer.shift();
    return entry;
  }

  /** Return all buffered inputs with seq >= afterSeq (resend on packet loss). */
  function getInputsAfter(afterSeq) {
    return _inputBuffer.filter(function (e) { return e.seq >= afterSeq; });
  }

  /** Return a copy of the full input buffer. */
  function getInputBuffer() {
    return _inputBuffer.slice();
  }

  // ── Client-side prediction ───────────────────────────────────────────────────

  /**
   * Apply a player input immediately to local state without waiting for the server.
   * @param {string}   action   Input action name (e.g. 'move_left', 'rotate_cw')
   * @param {Function} applyFn  fn(action) — mutates local game state
   * @returns {Object} recorded input entry { seq, action, timestamp }
   */
  function predict(action, applyFn) {
    const entry = recordInput(action);
    if (typeof applyFn === 'function') applyFn(action);
    return entry;
  }

  // ── Server reconciliation ────────────────────────────────────────────────────

  /**
   * Compare a server-authoritative state with the current local predicted state.
   * If they differ, begin a smooth rollback blend toward the server state.
   *
   * @param {Object}   serverState  Authoritative snapshot from server
   * @param {Object}   localState   Current local predicted state (for divergence check)
   * @param {Function} blendFn      fn(serverState, localState, t) → blendedState  (t: 0→1)
   * @param {Function} applyFn      fn(blendedState) — mutates local state each blend step
   */
  function reconcile(serverState, localState, blendFn, applyFn) {
    if (!serverState) return;
    if (_statesMatch(serverState, localState)) return;
    _startRollback(serverState, localState, blendFn, applyFn);
  }

  function _statesMatch(a, b) {
    if (!a || !b) return false;
    if (a.boardHash !== undefined && b.boardHash !== undefined) {
      return a.boardHash === b.boardHash;
    }
    if (a.pieceX !== undefined && b.pieceX !== undefined) {
      return a.pieceX === b.pieceX && a.pieceY === b.pieceY;
    }
    return true;
  }

  function _startRollback(serverState, localState, blendFn, applyFn) {
    _rollbackFrame = ROLLBACK_FRAMES;
    _rollbackCallback = function (frame) {
      const t = 1 - (frame / ROLLBACK_FRAMES); // 0 → 1 over ROLLBACK_FRAMES ticks
      const blended = (typeof blendFn === 'function')
        ? blendFn(serverState, localState, t)
        : serverState;
      if (typeof applyFn === 'function') applyFn(blended);
    };
    _rollbackCallback(_rollbackFrame);
  }

  /**
   * Advance rollback blend by one game tick.
   * Call this once per frame from the main game loop.
   */
  function tickRollback() {
    if (_rollbackFrame <= 0) return;
    _rollbackFrame--;
    if (_rollbackFrame > 0) {
      if (typeof _rollbackCallback === 'function') _rollbackCallback(_rollbackFrame);
    } else {
      // Final step — snap to authoritative state (t = 1)
      if (typeof _rollbackCallback === 'function') _rollbackCallback(0);
      _rollbackCallback = null;
    }
  }

  // ── Opponent interpolation + jitter buffer ───────────────────────────────────

  /**
   * Queue an incoming opponent board snapshot into the jitter buffer.
   * Consuming happens in tickInterpolation().
   * @param {Object} snapshot  Opponent state { boardState, score, level, … }
   */
  function receiveOpponentState(snapshot) {
    _jitterQueue.push({ data: snapshot, arrivedAt: performance.now() });
    // Keep buffer bounded — discard stale entries beyond target depth
    while (_jitterQueue.length > JITTER_BUFFER_FRAMES + 4) {
      _jitterQueue.shift();
    }
  }

  /**
   * Advance opponent interpolation each game frame.
   * Promotes jitter-buffered snapshots and calls renderFn with the lerped state.
   *
   * @param {number}   dtMs      Frame delta in milliseconds
   * @param {Function} renderFn  fn(interpolatedState) — called with lerped state
   */
  function tickInterpolation(dtMs, renderFn) {
    // Promote from jitter buffer once we have enough depth
    if (!_interpTo && _jitterQueue.length >= JITTER_BUFFER_FRAMES) {
      if (!_interpFrom) _interpFrom = _jitterQueue.shift().data;
      const next = _jitterQueue.shift();
      _interpTo      = next ? next.data : _interpFrom;
      _interpElapsed = 0;
    }

    if (_interpTo && typeof renderFn === 'function') {
      _interpElapsed += dtMs;
      const t = Math.min(_interpElapsed / INTERP_WINDOW_MS, 1);
      renderFn(_lerpState(_interpFrom, _interpTo, t));

      if (t >= 1) {
        _interpFrom    = _interpTo;
        _interpTo      = (_jitterQueue.length > 0) ? _jitterQueue.shift().data : null;
        _interpElapsed = 0;
      }
    }
  }

  function _lerpState(from, to, t) {
    if (!from) return to;
    if (!to)   return from;
    const result = Object.assign({}, to);
    // Lerp continuous numeric fields for visual smoothness
    if (from.score !== undefined && to.score !== undefined) {
      result.score = Math.round(from.score + (to.score - from.score) * t);
    }
    // Discrete fields (board, level) snap to target
    result.boardState = to.boardState;
    result.level      = to.level;
    return result;
  }

  // ── Latency measurement ──────────────────────────────────────────────────────

  /**
   * Start periodic latency measurement using timestamped ping/pong.
   * Requires init() to have been called with a sendFn.
   */
  function startPingMeasurement() {
    _stopPingMeasurement();
    _pingTimer = setInterval(function () {
      if (typeof _sendFn !== 'function') return;
      _lastPingSentAt = performance.now();
      _pendingPing    = true;
      _sendFn({ type: 'ping_ts', ts: _lastPingSentAt });
    }, PING_INTERVAL_MS);
  }

  function _stopPingMeasurement() {
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = null; }
    _pendingPing = false;
  }

  /**
   * Call when a pong_ts message arrives from the server/opponent relay.
   * Updates _latencyMs and notifies the ping display callback.
   * @param {Object} msg  { type: 'pong_ts', ts: <original ping ts> }
   */
  function onPongReceived(msg) {
    if (!_pendingPing) return;
    _pendingPing = false;
    const rtt  = performance.now() - (msg.ts || _lastPingSentAt);
    _latencyMs = Math.round(rtt / 2);
    _notifyPingDisplay();
  }

  function _notifyPingDisplay() {
    if (typeof _pingDisplayCb !== 'function') return;
    let quality;
    if (_latencyMs < 50)       quality = 'good';
    else if (_latencyMs < 150) quality = 'fair';
    else                       quality = 'poor';
    _pingDisplayCb(_latencyMs, quality);
  }

  // ── Adaptive tick rate ───────────────────────────────────────────────────────

  /**
   * Returns a recommended update-rate multiplier based on current latency.
   * Poor connections use a reduced rate to limit rubber-banding.
   * @returns {number}  0.5 | 0.75 | 1.0
   */
  function getAdaptiveTickRate() {
    if (_latencyMs > 200) return 0.5;
    if (_latencyMs > 150) return 0.75;
    return 1.0;
  }

  // ── Offline fallback ─────────────────────────────────────────────────────────

  /**
   * Switch to local-only play after a connection drop mid-game.
   * @param {Function} reconnectFn  Called by attemptReconnect() when ready
   */
  function enterOfflineFallback(reconnectFn) {
    _isOfflineFallback  = true;
    _offlineReconnectFn = reconnectFn || null;
  }

  /** Returns true while in offline fallback mode. */
  function isOfflineFallback() {
    return _isOfflineFallback;
  }

  /** Trigger a reconnect attempt from offline fallback mode. */
  function attemptReconnect() {
    if (_isOfflineFallback && typeof _offlineReconnectFn === 'function') {
      _isOfflineFallback = false;
      _offlineReconnectFn();
    }
  }

  /** Clear offline fallback state (call on successful reconnect). */
  function clearOfflineFallback() {
    _isOfflineFallback  = false;
    _offlineReconnectFn = null;
  }

  // ── Init / reset ─────────────────────────────────────────────────────────────

  /**
   * Initialise the netcode module. Call once per multiplayer session.
   * @param {Object}   opts
   * @param {Function} opts.sendFn        fn(msg) — sends a message to the opponent relay
   * @param {Function} opts.pingDisplayCb fn(ms, quality) — called every 2 s with new ping
   */
  function init(opts) {
    opts           = opts || {};
    _sendFn        = opts.sendFn        || null;
    _pingDisplayCb = opts.pingDisplayCb || null;
  }

  /** Reset all module state (call on disconnect or game end). */
  function reset() {
    _stopPingMeasurement();
    _inputBuffer       = [];
    _inputSeq          = 0;
    _latencyMs         = 0;
    _lastPingSentAt    = 0;
    _pendingPing       = false;
    _jitterQueue       = [];
    _interpFrom        = null;
    _interpTo          = null;
    _interpElapsed     = 0;
    _rollbackFrame     = 0;
    _rollbackCallback  = null;
    _isOfflineFallback = false;
    _offlineReconnectFn= null;
    _sendFn            = null;
    _pingDisplayCb     = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  return {
    init,
    reset,

    // Input buffering
    recordInput,
    getInputsAfter,
    getInputBuffer,
    predict,

    // Prediction / reconciliation
    reconcile,
    tickRollback,

    // Opponent interpolation
    receiveOpponentState,
    tickInterpolation,

    // Latency
    startPingMeasurement,
    onPongReceived,
    getAdaptiveTickRate,
    get latencyMs() { return _latencyMs; },

    // Offline fallback
    enterOfflineFallback,
    isOfflineFallback,
    attemptReconnect,
    clearOfflineFallback,
  };
})();
