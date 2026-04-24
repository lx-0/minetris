import { describe, it, expect } from 'vitest';
import { applyMultiplier, clampMultiplier, difficultyTier } from './lib/score.js';

describe('applyMultiplier', () => {
  it('returns pts unchanged when mult is exactly 1.0', () => {
    expect(applyMultiplier(100, 1.0)).toBe(100);
    expect(applyMultiplier(0, 1.0)).toBe(0);
    expect(applyMultiplier(7, 1.0)).toBe(7);
  });

  it('doubles points for 2.0 multiplier', () => {
    expect(applyMultiplier(100, 2.0)).toBe(200);
    expect(applyMultiplier(50, 2.0)).toBe(100);
  });

  it('rounds non-integer results', () => {
    expect(applyMultiplier(10, 1.5)).toBe(15);       // exact
    expect(applyMultiplier(7, 2.5)).toBe(18);         // 17.5 → 18
    expect(applyMultiplier(10, 1.25)).toBe(13);       // 12.5 → 13
    expect(applyMultiplier(3, 1.8)).toBe(5);          // 5.4 → 5
  });

  it('handles fractional multipliers below 1', () => {
    expect(applyMultiplier(100, 0.5)).toBe(50);
    expect(applyMultiplier(100, 0.75)).toBe(75);
  });

  it('handles 0 points regardless of multiplier', () => {
    expect(applyMultiplier(0, 2.5)).toBe(0);
    expect(applyMultiplier(0, 0.5)).toBe(0);
  });
});

describe('clampMultiplier', () => {
  it('equals baseSpeed at tier 0', () => {
    expect(clampMultiplier(1.0, 0, 1.1, 3.0)).toBe(1.0);
    expect(clampMultiplier(0.5, 0, 1.1, 3.0)).toBe(0.5);
  });

  it('grows by multiplierPerTier per tier', () => {
    const t1 = clampMultiplier(1.0, 1, 1.1, 3.0);
    expect(t1).toBeCloseTo(1.1, 10);

    const t2 = clampMultiplier(1.0, 2, 1.1, 3.0);
    expect(t2).toBeCloseTo(1.21, 10);
  });

  it('caps at maxMultiplier', () => {
    expect(clampMultiplier(1.0, 100, 1.1, 3.0)).toBe(3.0);
  });

  it('never exceeds maxMultiplier even with a high base', () => {
    expect(clampMultiplier(3.0, 1, 1.1, 3.0)).toBe(3.0);
  });

  it('works with different max caps', () => {
    expect(clampMultiplier(1.0, 10, 1.1, 2.0)).toBe(2.0);
    expect(clampMultiplier(1.0, 2, 1.1, 10.0)).toBeCloseTo(1.21, 10);
  });
});

describe('difficultyTier', () => {
  it('is 0 before the first interval boundary', () => {
    expect(difficultyTier(0, 60)).toBe(0);
    expect(difficultyTier(59, 60)).toBe(0);
  });

  it('increments at each interval boundary', () => {
    expect(difficultyTier(60, 60)).toBe(1);
    expect(difficultyTier(120, 60)).toBe(2);
    expect(difficultyTier(180, 60)).toBe(3);
    expect(difficultyTier(600, 60)).toBe(10);
  });

  it('handles non-60s intervals', () => {
    expect(difficultyTier(0, 30)).toBe(0);
    expect(difficultyTier(30, 30)).toBe(1);
    expect(difficultyTier(59, 30)).toBe(1);
    expect(difficultyTier(60, 30)).toBe(2);
  });

  it('returns 0 for elapsed time of 0', () => {
    expect(difficultyTier(0, 60)).toBe(0);
  });
});
