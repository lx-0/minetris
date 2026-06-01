import { describe, it, expect } from 'vitest';
import { getLevelFromXP, getXPThresholdForLevel, canPrestigeAtXP, PRESTIGE_LEVEL } from './lib/leveling.js';

describe('PRESTIGE_LEVEL', () => {
  it('is 50, not 100', () => {
    expect(PRESTIGE_LEVEL).toBe(50);
  });
});

describe('getLevelFromXP', () => {
  it('returns level 1 for 0 XP', () => {
    expect(getLevelFromXP(0)).toBe(1);
    expect(getLevelFromXP(-1)).toBe(1);
  });

  it('returns level 50 at the L50 XP threshold', () => {
    const xp50 = getXPThresholdForLevel(50);
    expect(getLevelFromXP(xp50)).toBe(50);
  });

  it('returns level 49 just below the L50 threshold', () => {
    const xp50 = getXPThresholdForLevel(50);
    expect(getLevelFromXP(xp50 - 1)).toBe(49);
  });

  it('returns level 100 at max XP', () => {
    const xp100 = getXPThresholdForLevel(100);
    expect(getLevelFromXP(xp100)).toBe(100);
  });
});

describe('canPrestigeAtXP', () => {
  it('returns false below L50 threshold', () => {
    const xp50 = getXPThresholdForLevel(50);
    expect(canPrestigeAtXP(xp50 - 1)).toBe(false);
  });

  it('returns true exactly at L50 threshold', () => {
    const xp50 = getXPThresholdForLevel(50);
    expect(canPrestigeAtXP(xp50)).toBe(true);
  });

  it('returns true above L50 (e.g. L75)', () => {
    const xp75 = getXPThresholdForLevel(75);
    expect(canPrestigeAtXP(xp75)).toBe(true);
  });

  it('returns true at max level (L100) — prestige does NOT require L100', () => {
    const xp100 = getXPThresholdForLevel(100);
    expect(canPrestigeAtXP(xp100)).toBe(true);
  });

  it('returns false at level 1 (XP 0)', () => {
    expect(canPrestigeAtXP(0)).toBe(false);
  });
});
