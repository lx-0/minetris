import { describe, it, expect } from 'vitest';
import {
  consumeMinedFlag,
  minedClearScore,
  minedFragMultiplier,
  minedShakeDuration,
  minedFlashAmount,
} from './lib/mined-clear.js';

// ── Detection: flag consumption ──────────────────────────────────────────────

describe('mined-clear detection: flag consumption', () => {
  it('returns isMinedClear=true when flag is true', () => {
    const { isMinedClear, nextFlag } = consumeMinedFlag(true);
    expect(isMinedClear).toBe(true);
    expect(nextFlag).toBe(false);
  });

  it('returns isMinedClear=false when flag is false', () => {
    const { isMinedClear, nextFlag } = consumeMinedFlag(false);
    expect(isMinedClear).toBe(false);
    expect(nextFlag).toBe(false);
  });

  it('always resets nextFlag to false (one-shot guarantee)', () => {
    // Second call with the reset flag must not see a mined clear
    let flag = true;
    const r1 = consumeMinedFlag(flag);
    flag = r1.nextFlag;
    expect(r1.isMinedClear).toBe(true);

    const r2 = consumeMinedFlag(flag);
    expect(r2.isMinedClear).toBe(false);
  });

  it('non-boolean falsy values (undefined, 0) are not mined clears', () => {
    expect(consumeMinedFlag(undefined).isMinedClear).toBe(false);
    expect(consumeMinedFlag(0).isMinedClear).toBe(false);
    expect(consumeMinedFlag(null).isMinedClear).toBe(false);
  });
});

// ── Score: 1.5× mined multiplier ─────────────────────────────────────────────

describe('mined-clear: score multiplier', () => {
  it('applies 1.5× on single mined clear', () => {
    expect(minedClearScore(100, { isMined: true })).toBe(150);
    expect(minedClearScore(300, { isMined: true })).toBe(450);
    expect(minedClearScore(500, { isMined: true })).toBe(750);
    expect(minedClearScore(800, { isMined: true })).toBe(1200);
  });

  it('leaves score unchanged for non-mined clears', () => {
    expect(minedClearScore(100, { isMined: false })).toBe(100);
    expect(minedClearScore(300)).toBe(300);
    expect(minedClearScore(800, {})).toBe(800);
  });

  it('stacks with combo multiplier', () => {
    // combo=2 → 1.5× combo, mined → 1.5×; total 2.25×
    expect(minedClearScore(100, { isMined: true, combo: 2 })).toBe(Math.round(100 * 1.5 * 1.5));
    // combo=3 → 2.0× combo, mined → 1.5×; total 3.0×
    expect(minedClearScore(100, { isMined: true, combo: 3 })).toBe(Math.round(100 * 2.0 * 1.5));
    // combo=4+ → 3.0× combo, mined → 1.5×; total 4.5×
    expect(minedClearScore(100, { isMined: true, combo: 4 })).toBe(Math.round(100 * 3.0 * 1.5));
  });

  it('stacks with back-to-back multiplier', () => {
    // b2b → 1.5×, mined → 1.5×; total 2.25×
    expect(minedClearScore(100, { isMined: true, b2b: true })).toBe(Math.round(100 * 1.5 * 1.5));
  });

  it('mined + combo + b2b all stack', () => {
    // combo=2 (1.5×) × b2b (1.5×) × mined (1.5×) = 3.375×
    expect(minedClearScore(100, { isMined: true, combo: 2, b2b: true }))
      .toBe(Math.round(100 * 1.5 * 1.5 * 1.5));
  });
});

// ── VFX: fragment density 3× ──────────────────────────────────────────────────

describe('mined-clear: particle fragment multiplier', () => {
  it('triples base fragment multiplier on mined clear', () => {
    expect(minedFragMultiplier(1.0, true)).toBe(3.0);
    expect(minedFragMultiplier(2.0, true)).toBe(6.0);
    expect(minedFragMultiplier(0.5, true)).toBeCloseTo(1.5);
  });

  it('passes base multiplier through unchanged for non-mined clear', () => {
    expect(minedFragMultiplier(1.0, false)).toBe(1.0);
    expect(minedFragMultiplier(2.0, false)).toBe(2.0);
    expect(minedFragMultiplier(3.0, false)).toBe(3.0);
  });

  it('combo-boosted base also triples on mined clear', () => {
    // combo=2 gives 1.25× base; mined triples that to 3.75×
    const comboBase = 1.25;
    expect(minedFragMultiplier(comboBase, true)).toBeCloseTo(comboBase * 3.0);
  });
});

// ── VFX: screen shake floor 0.40 s ───────────────────────────────────────────

describe('mined-clear: screen shake duration', () => {
  it('forces at least 0.40 s on mined clear regardless of tier', () => {
    expect(minedShakeDuration(0, true)).toBe(0.40);      // single (no shake normally)
    expect(minedShakeDuration(0.12, true)).toBe(0.40);   // double tier
    expect(minedShakeDuration(0.30, true)).toBe(0.40);   // triple tier
  });

  it('does not clamp down when tier already exceeds floor', () => {
    expect(minedShakeDuration(0.50, true)).toBe(0.50);   // Tetris tier wins
    expect(minedShakeDuration(0.60, true)).toBe(0.60);
  });

  it('uses tier duration unchanged for non-mined clear', () => {
    expect(minedShakeDuration(0, false)).toBe(0);
    expect(minedShakeDuration(0.12, false)).toBe(0.12);
    expect(minedShakeDuration(0.50, false)).toBe(0.50);
  });
});

// ── VFX: screen flash floor 0.55 opacity ─────────────────────────────────────

describe('mined-clear: flash intensity', () => {
  it('forces at least 0.55 opacity on mined clear', () => {
    expect(minedFlashAmount(0, true)).toBe(0.55);
    expect(minedFlashAmount(0.14, true)).toBe(0.55);   // single tier
    expect(minedFlashAmount(0.28, true)).toBe(0.55);   // double tier
    expect(minedFlashAmount(0.55, true)).toBe(0.55);   // exactly at floor
  });

  it('does not clamp down when tier already exceeds floor', () => {
    expect(minedFlashAmount(1.0, true)).toBe(1.0);     // Tetris tier wins
    expect(minedFlashAmount(0.70, true)).toBe(0.70);
  });

  it('uses tier flash unchanged for non-mined clear', () => {
    expect(minedFlashAmount(0, false)).toBe(0);
    expect(minedFlashAmount(0.14, false)).toBe(0.14);
    expect(minedFlashAmount(1.0, false)).toBe(1.0);
  });
});
