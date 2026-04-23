// Score / difficulty calculation helpers.
// Extracted from js/core/gamestate.js and js/core/config.js.

/** Apply a multiplier to a point value, rounding when mult != 1. */
export function applyMultiplier(pts, mult) {
  if (mult !== 1.0) return Math.round(pts * mult);
  return pts;
}

/**
 * Speed multiplier for a given difficulty tier, capped at maxMultiplier.
 * Mirrors the progression model in config.js / game-loop.js.
 */
export function clampMultiplier(baseSpeed, tier, multiplierPerTier, maxMultiplier) {
  return Math.min(baseSpeed * Math.pow(multiplierPerTier, tier), maxMultiplier);
}

/** How many full difficulty intervals have elapsed. */
export function difficultyTier(elapsedSeconds, difficultyInterval) {
  return Math.floor(elapsedSeconds / difficultyInterval);
}
