// Pure finesse calculation helpers — logic extracted from js/core/finesse.js.
// These are the mathematical kernels, decoupled from DOM and global state.

const NUDGE_MAX_OFFSET = 3;

const FINESSE_TABLE = (function () {
  const table = {};
  for (let piece = 1; piece <= 11; piece++) {
    table[piece] = {};
    for (let z = -NUDGE_MAX_OFFSET; z <= NUDGE_MAX_OFFSET; z++) {
      table[piece][z] = {};
      for (let rot = 0; rot < 4; rot++) {
        // O-piece (3) and special pieces (8-11) cannot rotate.
        const rotMoves = (piece === 3 || piece > 7) ? 0 : Math.min(rot, 4 - rot);
        table[piece][z][rot] = Math.abs(z) + rotMoves;
      }
    }
  }
  return table;
}());

/** Minimum inputs for a piece+offset+rotation combination. */
export function optimalInputs(colorIndex, nudgeOffsetZ, rotState) {
  const pt = FINESSE_TABLE[colorIndex];
  if (!pt) return 0;
  const z = Math.max(-NUDGE_MAX_OFFSET, Math.min(NUDGE_MAX_OFFSET, nudgeOffsetZ));
  const zt = pt[z];
  if (!zt) return 0;
  return zt[rotState] || 0;
}

/** Average keys per piece, rounded to 1 decimal. */
export function getKPP(totalInputs, totalPieces) {
  if (totalPieces === 0) return 0;
  return Math.round((totalInputs / totalPieces) * 10) / 10;
}

/** Actions per minute based on elapsed game time, rounded to 1 decimal. */
export function getAPM(totalInputs, elapsedSeconds) {
  if (!elapsedSeconds || elapsedSeconds <= 0) return 0;
  return Math.round((totalInputs / (elapsedSeconds / 60)) * 10) / 10;
}

/** Rolling 10-second PPS. pieceLandTimes is an array of ms timestamps. */
export function getPPS(pieceLandTimes, nowMs) {
  const cutoff = nowMs - 10000;
  const recent = pieceLandTimes.filter((t) => t >= cutoff);
  if (recent.length === 0) return 0;
  return Math.round((recent.length / 10) * 100) / 100;
}

/** Number of extra inputs beyond the optimum (floor 0). */
export function getFaultCount(actualInputs, optimal) {
  return Math.max(0, actualInputs - optimal);
}

/** Perfect-placement percentage for the session (0-100). */
export function getPercentage(perfectPlacements, totalPieces) {
  if (totalPieces === 0) return 100;
  return Math.round((perfectPlacements / totalPieces) * 100);
}
