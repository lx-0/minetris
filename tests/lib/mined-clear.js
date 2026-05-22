// Pure helpers that mirror the mined-clear detection logic in lineclear.js / input.js.
// No DOM or Three.js dependencies — safe to import in Vitest.

/**
 * Consume the one-shot lastBlockWasMined flag.
 * Mirrors the pattern in checkLineClear(): read once, reset to false.
 * @param {boolean} flag  current value of lastBlockWasMined
 * @returns {{ isMinedClear: boolean, nextFlag: false }}
 */
export function consumeMinedFlag(flag) {
  return { isMinedClear: flag === true, nextFlag: false };
}

/**
 * Compute line-clear score with the mined-clear multiplier.
 * Mirrors the formula in checkLineClear():
 *   Math.round(baseScore × b2bMult × comboMult × minedMult)
 * @param {number} baseScore
 * @param {{ isMined?: boolean, combo?: number, b2b?: boolean }} opts
 */
export function minedClearScore(baseScore, opts) {
  const { isMined = false, combo = 1, b2b = false } = opts || {};
  const COMBO_MULTS = [1.0, 1.0, 1.5, 2.0, 3.0];
  const comboMult = COMBO_MULTS[Math.min(combo, 4)];
  const b2bMult = b2b ? 1.5 : 1.0;
  const minedMult = isMined ? 1.5 : 1.0;
  return Math.round(baseScore * b2bMult * comboMult * minedMult);
}

/**
 * Fragment density multiplier for the detonation particle burst.
 * Mirrors: if (_lcIsMined) fragMult *= 3.0;
 * @param {number} baseMult  tier/combo fragment multiplier before mined boost
 * @param {boolean} isMined
 */
export function minedFragMultiplier(baseMult, isMined) {
  return isMined ? baseMult * 3.0 : baseMult;
}

/**
 * Screen shake duration with mined floor of 0.40 s.
 * Mirrors: _actualShakeDur = _lcIsMined ? Math.max(shakeDur, 0.40) : shakeDur;
 * @param {number} tieredDur  duration driven by clear tier (double/triple/tetris)
 * @param {boolean} isMined
 */
export function minedShakeDuration(tieredDur, isMined) {
  return isMined ? Math.max(tieredDur, 0.40) : tieredDur;
}

/**
 * Screen flash intensity with mined floor of 0.55 opacity.
 * Mirrors: _actualFlashAmt = _lcIsMined ? Math.max(flashAmt, 0.55) : flashAmt;
 * @param {number} tieredFlash  opacity driven by clear tier
 * @param {boolean} isMined
 */
export function minedFlashAmount(tieredFlash, isMined) {
  return isMined ? Math.max(tieredFlash, 0.55) : tieredFlash;
}
