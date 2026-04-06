// DAS/ARR (Delayed Auto Shift / Auto Repeat Rate) input module.
// Handles configurable hold-to-repeat for piece nudge keys (Q/E/Z/X)
// and a configurable soft-drop key (Shift).
//
// Requires: pieces.js (applyNudge, getNudgeTargetPiece), config.js (BLOCK_SIZE, NUDGE_MAX_OFFSET)

const INPUT_DAS_KEY = 'mineCtris_inputDAS';

// ── Persisted settings ────────────────────────────────────────────────────────

// Defaults: DAS=170ms, ARR=50ms (0=instant teleport), SoftDrop=50ms
let _dasSettings = { dasMs: 170, arrMs: 50, softDropMs: 50 };

function loadInputDasSettings() {
  try {
    const raw = localStorage.getItem(INPUT_DAS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (typeof p.dasMs      === 'number') _dasSettings.dasMs      = Math.max(50,  Math.min(300, p.dasMs));
    if (typeof p.arrMs      === 'number') _dasSettings.arrMs      = Math.max(0,   Math.min(100, p.arrMs));
    if (typeof p.softDropMs === 'number') _dasSettings.softDropMs = Math.max(10,  Math.min(100, p.softDropMs));
  } catch (_) {}
}

function saveInputDasSettings() {
  try { localStorage.setItem(INPUT_DAS_KEY, JSON.stringify(_dasSettings)); } catch (_) {}
}

/** Returns a copy of the current DAS/ARR settings object. */
function getInputDasSettings() { return Object.assign({}, _dasSettings); }

/**
 * Update a single DAS/ARR setting and persist.
 * @param {'dasMs'|'arrMs'|'softDropMs'} key
 * @param {number} value
 */
function setInputDasSetting(key, value) {
  if (!(key in _dasSettings)) return;
  _dasSettings[key] = value;
  saveInputDasSettings();
  // Re-apply soft drop speed if currently active.
  if (key === 'softDropMs' && _softDropActive) {
    _deactivateSoftDrop();
    _activateSoftDrop();
  }
}

// ── Hold state ────────────────────────────────────────────────────────────────

// Which nudge keys are currently physically held.
const _held = { q: false, e: false, z: false, x: false };

// Most recently pressed key per axis (for key-rollover: only the latest key acts).
let _lastH = null; // 'q' or 'e'
let _lastD = null; // 'z' or 'x'

// Per-key accumulators (ms) for DAS charging and ARR repeat.
const _dasAcc      = { q: 0, e: 0, z: 0, x: 0 };
const _arrAcc      = { q: 0, e: 0, z: 0, x: 0 };
const _dasTriggered = { q: false, e: false, z: false, x: false };
// Tracks whether the instant-ARR teleport already fired this hold.
const _instantFired = { q: false, e: false, z: false, x: false };

// Soft drop (Shift key).
let _softDropHeld     = false;
let _softDropActive   = false;
let _softDropTarget   = null;
let _softDropOrigVelY = 0;

// ── Input buffer (fires buffered nudge on next piece spawn) ───────────────────

let _bufDx = 0;
let _bufDz = 0;

// ── Input latency measurement ─────────────────────────────────────────────────

// Timestamp (performance.now()) of the most recent nudge key-press.
let _keydownTs = 0;
// Measured latency of the last processed nudge input (ms). -1 = no sample yet.
let _inputLatencyMs = -1;

// ── Key→nudge delta mapping ───────────────────────────────────────────────────

const _KEY_DELTA = { q: [-1, 0], e: [1, 0], z: [0, -1], x: [0, 1] };

// ── Public key event handlers (called from player.js) ────────────────────────

/**
 * Call on keydown for a nudge or soft-drop key.
 * Ignores key-repeat events (browser fires them automatically; we manage our own repeat).
 * @param {'q'|'e'|'z'|'x'|'softDrop'} key
 */
function dasKeyDown(key) {
  if (key === 'softDrop') {
    _softDropHeld = true;
    _activateSoftDrop();
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(_held, key) || _held[key]) return;
  _held[key] = true;
  _keydownTs = performance.now(); // record for latency measurement

  // Key-rollover: track which horizontal / depth key was pressed most recently.
  if (key === 'q' || key === 'e') _lastH = key;
  if (key === 'z' || key === 'x') _lastD = key;

  // Reset per-key accumulators.
  _dasAcc[key]       = 0;
  _arrAcc[key]       = 0;
  _dasTriggered[key] = false;
  _instantFired[key] = false;

  // Immediate first nudge (before DAS delay).
  _fireNudge(key, /* measureLatency */ true);
}

/**
 * Call on keyup for a nudge or soft-drop key.
 * @param {'q'|'e'|'z'|'x'|'softDrop'} key
 */
function dasKeyUp(key) {
  if (key === 'softDrop') {
    _softDropHeld = false;
    _deactivateSoftDrop();
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(_held, key)) return;
  _held[key]         = false;
  _dasAcc[key]       = 0;
  _arrAcc[key]       = 0;
  _dasTriggered[key] = false;
  _instantFired[key] = false;

  // Hand rollover to the sibling key if it is still held.
  if (key === 'q' && _lastH === 'q' && _held.e) _lastH = 'e';
  if (key === 'e' && _lastH === 'e' && _held.q) _lastH = 'q';
  if (key === 'z' && _lastD === 'z' && _held.x) _lastD = 'x';
  if (key === 'x' && _lastD === 'x' && _held.z) _lastD = 'z';
}

// ── Per-frame processing ──────────────────────────────────────────────────────

/**
 * Process held-key DAS/ARR state. Call at the very start of the RAF loop.
 * @param {number} dtMs  Frame delta time in milliseconds.
 */
function processDasInputs(dtMs) {
  _processAxis(['q', 'e'], _lastH, dtMs);
  _processAxis(['z', 'x'], _lastD, dtMs);

  // Soft drop: refresh target each frame in case the active piece changed.
  if (_softDropHeld) {
    const target = typeof getNudgeTargetPiece === 'function' ? getNudgeTargetPiece() : null;
    if (target !== _softDropTarget) {
      _deactivateSoftDrop();
      _activateSoftDrop();
    }
  }
}

function _processAxis(keys, activeKey, dtMs) {
  for (const key of keys) {
    if (!_held[key]) continue;
    // Rollover: when both axis keys are held, only the most-recently-pressed one acts.
    if (activeKey !== null && activeKey !== key) continue;

    if (!_dasTriggered[key]) {
      _dasAcc[key] += dtMs;
      if (_dasAcc[key] >= _dasSettings.dasMs) {
        _dasTriggered[key] = true;
        _arrAcc[key] = _dasSettings.arrMs; // prime for immediate first repeat
      }
    }

    if (_dasTriggered[key]) {
      if (_dasSettings.arrMs === 0) {
        // Instant mode: teleport piece to the edge in one shot.
        if (!_instantFired[key]) {
          _instantFired[key] = true;
          const maxSteps = typeof NUDGE_MAX_OFFSET !== 'undefined' ? NUDGE_MAX_OFFSET * 2 + 1 : 7;
          for (let i = 0; i < maxSteps; i++) {
            if (!_fireNudge(key, false)) break;
          }
        }
      } else {
        _arrAcc[key] += dtMs;
        while (_arrAcc[key] >= _dasSettings.arrMs) {
          _arrAcc[key] -= _dasSettings.arrMs;
          _fireNudge(key, false);
        }
      }
    }
  }
}

/**
 * Fire a single nudge or rotation, optionally measuring latency.
 * Q/E keys trigger SRS rotation (rotatePlayerPiece); Z/X keys nudge in depth.
 * @returns {boolean} true if the action was applied, false if blocked.
 */
function _fireNudge(key, measureLatency) {
  if (measureLatency && _keydownTs > 0) {
    const now = performance.now();
    if (now - _keydownTs < 200) _inputLatencyMs = now - _keydownTs;
    _keydownTs = 0;
  }

  // Q/E → SRS rotation (CW for E, CCW for Q).
  if (key === 'q' || key === 'e') {
    const cw = key === 'e';
    return typeof rotatePlayerPiece === 'function' ? rotatePlayerPiece(cw) : false;
  }

  const [dx, dz] = _KEY_DELTA[key];

  // If the current target piece is in its lock delay, buffer this direction
  // so it fires on the next piece spawn (in addition to moving the current piece).
  const piece = typeof getNudgeTargetPiece === 'function' ? getNudgeTargetPiece() : null;
  if (piece && piece.userData.lockDelayRemaining !== undefined) {
    _bufDx = dx;
    _bufDz = dz;
  }

  return typeof applyNudge === 'function' ? (applyNudge(dx, dz) !== false) : false;
}

// ── Soft drop ─────────────────────────────────────────────────────────────────

function _activateSoftDrop() {
  if (_softDropActive) return;
  const piece = typeof getNudgeTargetPiece === 'function' ? getNudgeTargetPiece() : null;
  if (!piece || !piece.userData || !piece.userData.velocity) return;
  _softDropActive   = true;
  _softDropTarget   = piece;
  _softDropOrigVelY = piece.userData.velocity.y;
  // Velocity to achieve ~1 block per softDropMs.
  const bs = typeof BLOCK_SIZE !== 'undefined' ? BLOCK_SIZE : 1;
  piece.userData.velocity.y = -(bs * 1000 / _dasSettings.softDropMs);
}

function _deactivateSoftDrop() {
  if (!_softDropActive) return;
  if (_softDropTarget && _softDropTarget.userData && _softDropTarget.userData.velocity) {
    _softDropTarget.userData.velocity.y = _softDropOrigVelY;
  }
  _softDropActive   = false;
  _softDropTarget   = null;
  _softDropOrigVelY = 0;
}

// ── Input buffer helpers (called from pieces.js spawnFallingPiece) ────────────

/** Apply buffered nudge to the newly spawned piece, then clear the buffer. */
function flushNudgeBuffer() {
  if (_bufDx !== 0 || _bufDz !== 0) {
    if (typeof applyNudge === 'function') applyNudge(_bufDx, _bufDz);
    _bufDx = 0;
    _bufDz = 0;
  }
}

/** Discard the input buffer without applying it. */
function clearNudgeBuffer() { _bufDx = 0; _bufDz = 0; }

// ── Input latency getter ──────────────────────────────────────────────────────

/** Returns the most recently measured input-to-action latency in ms, or -1 if none. */
function getInputLatencyMs() { return _inputLatencyMs; }

// ── Reset (called on game reset) ──────────────────────────────────────────────

function resetDasState() {
  for (const key of ['q', 'e', 'z', 'x']) {
    _held[key]         = false;
    _dasAcc[key]       = 0;
    _arrAcc[key]       = 0;
    _dasTriggered[key] = false;
    _instantFired[key] = false;
  }
  _lastH = null;
  _lastD = null;
  _softDropHeld = false;
  _deactivateSoftDrop();
  _bufDx = 0;
  _bufDz = 0;
}

// Auto-load settings when script is parsed.
loadInputDasSettings();
