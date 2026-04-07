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
//
// Additional metrics tracked:
//   KPP  (Keys Per Piece)      = finesseTotalInputs / finesseTotalPieces
//   PPS  (Pieces Per Second)   = rolling 10-second window from finessePieceLandTimes
//   APM  (Actions Per Minute)  = finesseTotalInputs / (elapsedSeconds / 60)
//   Per-piece breakdown        = finesseByPieceType[colorIndex]

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
  finesseTotalInputs++;
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

  // Per-piece-type tracking (colorIndex 1–11)
  if (colorIndex >= 1 && colorIndex <= 11) {
    if (!finesseByPieceType[colorIndex]) {
      finesseByPieceType[colorIndex] = { inputs: 0, optimal: 0, count: 0 };
    }
    finesseByPieceType[colorIndex].inputs  += _currentPieceInputs;
    finesseByPieceType[colorIndex].optimal += optimal;
    finesseByPieceType[colorIndex].count++;
  }

  // PPS rolling window: record piece-land timestamp
  finessePieceLandTimes.push(Date.now());

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

// ── KPP / APM / PPS getters ───────────────────────────────────────────────────

/** Returns average keys per piece for this session. */
function finesseGetKPP() {
  if (finesseTotalPieces === 0) return 0;
  return Math.round((finesseTotalInputs / finesseTotalPieces) * 10) / 10;
}

/**
 * Returns real-time PPS (pieces per second) using a rolling 10-second window.
 * Falls back to session average when not enough data.
 */
function finesseGetPPS() {
  const nowMs  = Date.now();
  const cutoff = nowMs - 10000;
  // Trim old entries
  while (finessePieceLandTimes.length > 0 && finessePieceLandTimes[0] < cutoff) {
    finessePieceLandTimes.shift();
  }
  const recent = finessePieceLandTimes.length;
  if (recent === 0) return 0;
  // pieces in last 10 s ÷ 10 s
  return Math.round((recent / 10) * 100) / 100;
}

/**
 * Returns APM (actions per minute) based on elapsed game time.
 * @param {number} elapsedSeconds - current game elapsed seconds
 */
function finesseGetAPM(elapsedSeconds) {
  if (!elapsedSeconds || elapsedSeconds <= 0) return 0;
  return Math.round((finesseTotalInputs / (elapsedSeconds / 60)) * 10) / 10;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
let _finesseFlashTimer = null;

/** Returns per-metric visibility preferences from localStorage. */
function _finesseMetricEnabled(key) {
  try {
    const raw = localStorage.getItem('finesse_hud_metrics');
    const cfg = raw ? JSON.parse(raw) : {};
    // Default all on if not set
    return cfg[key] !== false;
  } catch (_) { return true; }
}

function _updateFinesseHUD(faults) {
  const el = document.getElementById('finesse-hud');
  if (!el) return;

  const showFaults = _finesseMetricEnabled('faults');
  const showPPS    = _finesseMetricEnabled('pps');
  const showAPM    = _finesseMetricEnabled('apm');
  const showKPP    = _finesseMetricEnabled('kpp');

  const pps = finesseGetPPS();
  const apm = finesseGetAPM(
    (typeof gameElapsedSeconds !== 'undefined') ? gameElapsedSeconds : 0
  );
  const kpp = finesseGetKPP();

  const parts = [];
  if (showFaults) {
    const avg = finesseTotalPieces > 0
      ? (finesseTotalFaults / finesseTotalPieces).toFixed(1)
      : '0.0';
    parts.push('Faults: ' + finesseTotalFaults + ' (' + avg + ')');
  }
  if (showPPS)  parts.push('PPS: '  + pps.toFixed(2));
  if (showAPM)  parts.push('APM: '  + Math.round(apm));
  if (showKPP)  parts.push('KPP: '  + kpp.toFixed(1));

  el.textContent = parts.join('  |  ') || '';

  // Flash colour: gold = perfect, red = 2+ faults, neutral = 1 fault
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

  // Gold border flash on the game canvas when placement is perfect
  _triggerPerfectFlash(faults === 0);
}

/** Flash a gold border on #three-canvas (or body) for a perfect placement. */
function _triggerPerfectFlash(isPerfect) {
  const canvas = document.getElementById('three-canvas') || document.body;
  if (isPerfect) {
    canvas.classList.add('finesse-perfect-border');
    setTimeout(function () { canvas.classList.remove('finesse-perfect-border'); }, 400);
  }
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

/**
 * Returns a per-piece-type breakdown array for the post-game report.
 * Each entry: { colorIndex, name, count, avgFaults, efficiency }
 */
function finesseGetPieceBreakdown() {
  const PIECE_NAMES = {
    1: 'T', 2: 'S', 3: 'O', 4: 'Z', 5: 'L', 6: 'J', 7: 'I',
    8: 'Gem', 9: 'Bomb', 10: 'Arrow', 11: 'Multi',
  };
  const result = [];
  for (const [ci, data] of Object.entries(finesseByPieceType)) {
    if (data.count === 0) continue;
    const avgActual  = data.inputs  / data.count;
    const avgOptimal = data.optimal / data.count;
    const faults     = Math.max(0, data.inputs - data.optimal);
    const efficiency = data.optimal > 0
      ? Math.round((data.optimal / data.inputs) * 100)
      : 100;
    result.push({
      colorIndex: Number(ci),
      name:       PIECE_NAMES[ci] || ('P' + ci),
      count:      data.count,
      avgFaults:  Math.round((faults / data.count) * 10) / 10,
      efficiency,
    });
  }
  // Sort by most-played
  result.sort(function (a, b) { return b.count - a.count; });
  return result;
}

/** Reset all finesse state. Call from resetGame(). */
function finesseReset() {
  finesseTotalFaults          = 0;
  finessePerfectPlacements    = 0;
  finesseTotalPieces          = 0;
  finesseCurrentPerfectStreak = 0;
  finesseBestPerfectStreak    = 0;
  finesseTotalInputs          = 0;
  finesseByPieceType          = {};
  finessePieceLandTimes       = [];
  _currentPieceInputs         = 0;
  if (_finesseFlashTimer) { clearTimeout(_finesseFlashTimer); _finesseFlashTimer = null; }
  const el = document.getElementById('finesse-hud');
  if (el) {
    el.textContent = 'Faults: 0 (0.0)';
    el.classList.remove('finesse-perfect', 'finesse-sloppy');
    el.style.display = 'none';
  }
}

// ── HUD metrics settings helpers ──────────────────────────────────────────────

/** Save per-metric visibility preference. */
function finesseSetMetricEnabled(key, enabled) {
  try {
    const raw = localStorage.getItem('finesse_hud_metrics');
    const cfg = raw ? JSON.parse(raw) : {};
    cfg[key] = enabled;
    localStorage.setItem('finesse_hud_metrics', JSON.stringify(cfg));
  } catch (_) {}
}

/** Sync checkbox states in the settings panel to saved preferences. */
function finesseInitMetricToggles() {
  const keys = ['faults', 'pps', 'apm', 'kpp'];
  keys.forEach(function (key) {
    const el = document.getElementById('finesse-metric-' + key);
    if (!el) return;
    el.checked = _finesseMetricEnabled(key);
    el.addEventListener('change', function () {
      finesseSetMetricEnabled(key, el.checked);
    });
  });
}
