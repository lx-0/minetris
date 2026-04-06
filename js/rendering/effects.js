// Line-clear celebration tiers — escalating visual spectacle for singles through tetrises.
// Must be loaded before lineclear.js.

// ─── LineClearCelebration ─────────────────────────────────────────────────────

/**
 * Manages the visual tier configuration for each line-clear:
 *   Single (1) : subtle white flash, gentle particles
 *   Double (2) : colored flash matching cleared blocks, moderate particles, slight shake
 *   Triple (3) : white flash, heavy particles, screen shake, brief slow-motion
 *   Tetris (4) : golden flash, massive particles, strong shake, dramatic slow-motion, fanfare
 *
 * Perfect Clear adds a rainbow glow on top of whichever tier fired.
 */
class LineClearCelebration {
  constructor() {
    this._tier       = 0;
    this._slowmoAge  = -1;
    this._slowmoDur  = 0;
    this._slowmoMin  = 1.0;  // scale factor at the start of slow-motion window
  }

  /**
   * Activate a celebration for numLines lines cleared.
   * Call from _lcDetonate() after dominantColor is known.
   *
   * @param {number}  numLines     1–4
   * @param {number}  dominantHex  0xRRGGBB of the most common cleared block color
   * @param {boolean} isPerfectClear  board is empty after this clear
   */
  trigger(numLines, dominantHex, isPerfectClear) {
    this._tier = numLines;

    // Kick off slow-motion window for triple / Tetris
    if (numLines >= 4) {
      this._slowmoDur = 0.30;
      this._slowmoMin = 0.20;  // start at 20% speed, ramp to 100%
    } else if (numLines === 3) {
      this._slowmoDur = 0.15;
      this._slowmoMin = 0.35;
    } else {
      this._slowmoDur = 0;
    }
    this._slowmoAge = (this._slowmoDur > 0) ? 0 : -1;

    // Tetris: play a celebratory fanfare on top of the standard hit sound
    if (numLines >= 4 && typeof playTetrisCelebration === 'function') {
      playTetrisCelebration();
    }

    // Perfect Clear: rainbow shimmer around the board
    if (isPerfectClear) this._triggerRainbow();
  }

  // ── Tier-driven getters ───────────────────────────────────────────────────

  /** CSS color string for the screen-flash overlay. */
  getFlashColor(dominantHex) {
    if (this._tier >= 4) return '#ffd700';  // golden
    if (this._tier === 2) {
      // Tint the dominant block color to full saturation
      return '#' + Math.max(0, dominantHex).toString(16).padStart(6, '0');
    }
    return '#ffffff';
  }

  /** Peak opacity for the screen-flash overlay (0 = no flash). */
  getFlashAmt() {
    if (this._tier >= 4) return 1.00;
    if (this._tier === 3) return 0.55;
    if (this._tier === 2) return 0.28;
    if (this._tier === 1) return 0.14;
    return 0;
  }

  /** Whether to show a screen flash at all. */
  shouldFlash() { return this._tier >= 1; }

  /** Duration (seconds) for the screen shake after detonation. */
  getShakeDur() {
    if (this._tier >= 4) return 0.50;
    if (this._tier === 3) return 0.30;
    if (this._tier === 2) return 0.12;
    return 0;
  }

  /** Base fragment multiplier (before combo / biome scaling). */
  getFragMult() {
    if (this._tier >= 4) return 3.5;
    if (this._tier === 3) return 2.5;
    if (this._tier === 2) return 1.5;
    return 1.0;
  }

  // ── Slow-motion ───────────────────────────────────────────────────────────

  /**
   * Return a scaled delta for visual-effect animations.
   * Advances the internal timer with real dt so the window expires on wall time.
   * Call once per frame from updateLineClear() when lineClearInProgress is true.
   */
  scaleDelta(dt) {
    if (this._slowmoAge < 0) return dt;
    this._slowmoAge += dt;
    if (this._slowmoAge >= this._slowmoDur) {
      this._slowmoAge = -1;
      return dt;
    }
    // Linear ramp from _slowmoMin back to 1.0 over the window
    const t     = this._slowmoAge / this._slowmoDur;
    const scale = this._slowmoMin + (1.0 - this._slowmoMin) * t;
    return dt * scale;
  }

  // ── Perfect Clear rainbow ─────────────────────────────────────────────────

  _triggerRainbow() {
    const el = document.getElementById('board-glow-overlay');
    if (!el) return;
    const _rm = (typeof reducedMotionEnabled !== 'undefined' && reducedMotionEnabled);
    if (_rm) return;
    el.classList.remove('lc-rainbow');
    void el.offsetWidth;  // force reflow
    el.classList.add('lc-rainbow');
    el.addEventListener('animationend', function onEnd() {
      el.classList.remove('lc-rainbow');
      el.removeEventListener('animationend', onEnd);
    }, { once: true });
  }
}

// Singleton — accessed by lineclear.js
const lineClearCelebration = new LineClearCelebration();
