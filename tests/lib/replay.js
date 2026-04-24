// Replay serialisation helpers — extracted from js/core/replay.js.
// Pure rounding functions used when recording piece spawns and inputs.

/** Round a game-time value to 3 decimal places (millisecond precision). */
export function roundTime(t) {
  return Math.round(t * 1000) / 1000;
}

/** Round a world-position value to 2 decimal places (centimetre precision). */
export function roundPosition(v) {
  return Math.round(v * 100) / 100;
}

/** Build a serialisable piece-spawn record with rounded fields. */
export function buildPieceEntry(index, spawnX, spawnZ, rotationInterval, t) {
  return {
    t:  roundTime(t),
    i:  index,
    x:  roundPosition(spawnX),
    z:  roundPosition(spawnZ),
    ri: roundTime(rotationInterval),
  };
}

/** Build a serialisable player-input record with rounded timestamp. */
export function buildInputEntry(type, code, t) {
  return {
    t:    roundTime(t),
    type: type,
    code: code,
  };
}
