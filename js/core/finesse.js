// Finesse scoring — measures input efficiency per piece placement.
// Tracks how many extra inputs were used vs the minimum needed (faults).
// Requires: state.js (finesse* vars), config.js (NUDGE_MAX_OFFSET)
//
// Input counting:
//   - Each successful Z/X nudge  = 1 input (left/right movement)
//   - Each successful Q/E rotate = 1 input (CW / CCW rotation)
//   - Soft drop activation       = 1 input
//
// Optimal inputs = |finalNudgeOffsetZ| + min(rotState, 4 − rotState)
// Faults = max(0, actualInputs − optimal)

// ── Optimal-input lookup table ────────────────────────────────────────────────
// Built once at load time for all piece types, Z offsets, and rotation states.
//   pieceColorIndex : 1–11 (matches SHAPES indices in config.js)
//   nudgeOffsetZ    : −NUDGE_MAX_OFFSET … +NUDGE_MAX_OFFSET  (default −3…+3)
//   rotState        : 0–3

const _FINESSE_TABLE = (function () {
  const MAX_OFF = (typeof NUDGE_MAX_OFFSET !== 'undefined') ? NUDGE_MAX_OFFSET : 3;
  const table = {};
  for (let piece = 1; piece <= 11; piece++) {
    table[piece] = {};
    for (let z = -MAX_OFF; z <= MAX_OFF; z++) {
      table[piece][z] = {};
      for (let rot = 0; rot < 4; rot++) {
        // O-piece (colorIndex 3) and special pieces (8–11) cannot rotate.
        const rotMoves = (piece === 3 || piece > 7) ? 0 : Math.min(rot, 4 - rot);
        table[piece][z][rot] = Math.abs(z) + rotMoves;
      }
    }
  }
  return table;
}());

/** Return the optimal (minimum) input count for a given piece + final state. */
function finesseOptimalInputs(colorIndex, nudgeOffsetZ, rotState) {
  const pt = _FINESSE_TABLE[colorIndex];
  if (!pt) return 0;
  const MAX_OFF = (typeof NUDGE_MAX_OFFSET !== 'undefined') ? NUDGE_MAX_OFFSET : 3;
  const z = Math.max(-MAX_OFF, Math.min(MAX_OFF, nudgeOffsetZ));
  const zt = pt[z];
  if (!zt) return 0;
  return zt[rotState] || 0;
}

// ── Per-piece input counter ───────────────────────────────────────────────────
let _currentPieceInputs = 0;

/** Reset per-piece counter. Call at the start of spawnFallingPiece(). */
function finesseOnPieceSpawn() {
  _currentPieceInputs = 0;
}

/** Increment the per-piece input counter. Call on each successful nudge/rotation/soft-drop. */
function finesseCountInput() {
  _currentPieceInputs++;
}

/**
 * Evaluate faults when a piece locks down and update session stats.
 * Call from updateFallingPieces() right before the piece is removed from the scene.
 *
 * @param {number} colorIndex   piece.userData.colorIndex
 * @param {number} nudgeOffsetZ piece.userData.nudgeOffsetZ (Z-axis cumulative nudge)
 * @param {number} rotState     piece.userData.rotState (0–3)
 */
function finesseOnPieceLand(colorIndex, nudgeOffsetZ, rotState) {
  finesseTotalPieces++;
  const optimal = finesseOptimalInputs(colorIndex, nudgeOffsetZ, rotState);
  const faults  = Math.max(0, _currentPieceInputs - optimal);

  finesseTotalFaults += faults;

  if (faults === 0) {
    finessePerfectPlacements++;
    finesseCurrentPerfectStreak++;
    if (finesseCurrentPerfectStreak > finesseBestPerfectStreak) {
      finesseBestPerfectStreak = finesseCurrentPerfectStreak;
    }
  } else {
    finesseCurrentPerfectStreak = 0;
  }

  _currentPieceInputs = 0;
  _updateFinesseHUD(faults);
}

// ── HUD ───────────────────────────────────────────────────────────────────────
let _finesseFlashTimer = null;

function _updateFinesseHUD(faults) {
  const el = document.getElementById('finesse-hud');
  if (!el) return;

  const avg = finesseTotalPieces > 0
    ? (finesseTotalFaults / finesseTotalPieces).toFixed(1)
    : '0.0';
  el.textContent = 'Faults: ' + finesseTotalFaults + ' (avg ' + avg + ')';

  // Flash colour: green = perfect, red = 2+ faults, neutral = 1 fault
  if (_finesseFlashTimer) { clearTimeout(_finesseFlashTimer); _finesseFlashTimer = null; }
  el.classList.remove('finesse-perfect', 'finesse-sloppy');
  if (faults === 0) {
    el.classList.add('finesse-perfect');
  } else if (faults >= 2) {
    el.classList.add('finesse-sloppy');
  }
  _finesseFlashTimer = setTimeout(function () {
    if (el) el.classList.remove('finesse-perfect', 'finesse-sloppy');
    _finesseFlashTimer = null;
  }, 600);
}

/** Show or hide the finesse HUD based on gameplay state. */
function updateFinesseHUDVisibility() {
  const el = document.getElementById('finesse-hud');
  if (!el) return;
  const visible = typeof controls !== 'undefined' &&
                  controls && controls.isLocked &&
                  typeof isGameOver !== 'undefined' && !isGameOver &&
                  !_finesseHudSuppressed();
  el.style.display = visible ? 'block' : 'none';
}

/** Returns true when the finesse HUD should be hidden (replay / co-op / puzzle). */
function _finesseHudSuppressed() {
  if (typeof isReplayMode !== 'undefined' && isReplayMode) return true;
  if (typeof isCoopMode   !== 'undefined' && isCoopMode)   return true;
  if (typeof isPuzzleMode !== 'undefined' && isPuzzleMode)  return true;
  if (typeof isCustomPuzzleMode !== 'undefined' && isCustomPuzzleMode) return true;
  return false;
}

// ── Session helpers ───────────────────────────────────────────────────────────

/** Returns the finesse percentage for this session (0–100). */
function finesseGetPercentage() {
  if (finesseTotalPieces === 0) return 100;
  return Math.round((finessePerfectPlacements / finesseTotalPieces) * 100);
}

/** Reset all finesse state. Call from resetGame(). */
function finesseReset() {
  finesseTotalFaults          = 0;
  finessePerfectPlacements    = 0;
  finesseTotalPieces          = 0;
  finesseCurrentPerfectStreak = 0;
  finesseBestPerfectStreak    = 0;
  _currentPieceInputs         = 0;
  if (_finesseFlashTimer) { clearTimeout(_finesseFlashTimer); _finesseFlashTimer = null; }
  const el = document.getElementById('finesse-hud');
  if (el) {
    el.textContent = 'Faults: 0 (avg 0.0)';
    el.classList.remove('finesse-perfect', 'finesse-sloppy');
    el.style.display = 'none';
  }
}
