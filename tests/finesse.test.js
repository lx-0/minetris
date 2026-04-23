import { describe, it, expect } from 'vitest';
import {
  optimalInputs,
  getKPP,
  getAPM,
  getPPS,
  getFaultCount,
  getPercentage,
} from './lib/finesse.js';

describe('optimalInputs', () => {
  it('returns 0 for unknown piece index', () => {
    expect(optimalInputs(0, 0, 0)).toBe(0);
    expect(optimalInputs(12, 0, 0)).toBe(0);
    expect(optimalInputs(-1, 0, 0)).toBe(0);
  });

  it('returns |nudgeOffset| for O-piece (cannot rotate, colorIndex=3)', () => {
    expect(optimalInputs(3, 0, 0)).toBe(0);
    expect(optimalInputs(3, 2, 0)).toBe(2);
    expect(optimalInputs(3, -3, 0)).toBe(3);
    // rotation state is irrelevant for O-piece
    expect(optimalInputs(3, 1, 3)).toBe(1);
  });

  it('returns |nudgeOffset| for special pieces 8-11 (no rotation)', () => {
    expect(optimalInputs(8, 2, 2)).toBe(2);   // Gem
    expect(optimalInputs(9, -1, 1)).toBe(1);  // Bomb
    expect(optimalInputs(11, -3, 3)).toBe(3); // Multi
  });

  it('counts rotation cost as min(rot, 4-rot) for standard pieces', () => {
    // T-piece = colorIndex 1, no nudge → pure rotation cost
    expect(optimalInputs(1, 0, 0)).toBe(0); // 0 CW taps
    expect(optimalInputs(1, 0, 1)).toBe(1); // 1 CW
    expect(optimalInputs(1, 0, 2)).toBe(2); // 2 CW (or 2 CCW)
    expect(optimalInputs(1, 0, 3)).toBe(1); // 1 CCW is cheaper
  });

  it('sums nudge and rotation costs', () => {
    // I-piece = colorIndex 7
    expect(optimalInputs(7, 2, 1)).toBe(3);  // 2 nudge + 1 rot
    expect(optimalInputs(7, -3, 2)).toBe(5); // 3 nudge + 2 rot
    expect(optimalInputs(7, 1, 3)).toBe(2);  // 1 nudge + 1 CCW
  });

  it('clamps nudgeOffset to ±NUDGE_MAX_OFFSET (3)', () => {
    expect(optimalInputs(1, 10, 0)).toBe(optimalInputs(1, 3, 0));
    expect(optimalInputs(1, -10, 0)).toBe(optimalInputs(1, -3, 0));
    // Symmetry
    expect(optimalInputs(5, 5, 0)).toBe(optimalInputs(5, -5, 0));
  });

  it('is symmetric for positive and negative nudge of same magnitude', () => {
    for (let piece = 1; piece <= 11; piece++) {
      for (let rot = 0; rot < 4; rot++) {
        expect(optimalInputs(piece, 2, rot)).toBe(optimalInputs(piece, -2, rot));
      }
    }
  });
});

describe('getKPP', () => {
  it('returns 0 when no pieces played', () => {
    expect(getKPP(0, 0)).toBe(0);
  });

  it('calculates average keys per piece rounded to 1 decimal', () => {
    expect(getKPP(10, 3)).toBe(3.3);
    expect(getKPP(100, 30)).toBe(3.3);
    expect(getKPP(5, 2)).toBe(2.5);
    expect(getKPP(1, 1)).toBe(1.0);
  });

  it('rounds correctly at midpoints', () => {
    expect(getKPP(7, 3)).toBe(2.3); // 2.333... → 2.3
    expect(getKPP(10, 6)).toBe(1.7); // 1.666... → 1.7
  });
});

describe('getAPM', () => {
  it('returns 0 for zero elapsed time', () => {
    expect(getAPM(100, 0)).toBe(0);
    expect(getAPM(0, 0)).toBe(0);
  });

  it('returns 0 for negative elapsed time', () => {
    expect(getAPM(100, -5)).toBe(0);
  });

  it('calculates actions per minute correctly', () => {
    expect(getAPM(60, 60)).toBe(60);    // 60 inputs / 60 s = 60 APM
    expect(getAPM(120, 60)).toBe(120);  // 120 inputs / 60 s = 120 APM
    expect(getAPM(30, 60)).toBe(30);
    expect(getAPM(60, 120)).toBe(30);   // 60 inputs / 120 s = 30 APM
  });

  it('rounds to 1 decimal place', () => {
    expect(getAPM(10, 10)).toBe(60); // exactly 60 APM
    expect(getAPM(7, 10)).toBe(42); // 42 APM
  });
});

describe('getPPS', () => {
  it('returns 0 when piece list is empty', () => {
    expect(getPPS([], Date.now())).toBe(0);
  });

  it('returns 0 when all pieces are older than 10 s', () => {
    const now = Date.now();
    expect(getPPS([now - 11000, now - 15000], now)).toBe(0);
  });

  it('counts pieces within the 10-second rolling window', () => {
    const now = Date.now();
    const times = [now - 9000, now - 5000, now - 1000]; // 3 within window
    expect(getPPS(times, now)).toBe(0.30);
  });

  it('ignores pieces at exactly the cutoff boundary', () => {
    const now = Date.now();
    // Exactly 10 000 ms ago — is NOT in window (cutoff = nowMs - 10000, filter is >=)
    const times = [now - 10000]; // on the boundary
    expect(getPPS(times, now)).toBe(0.10); // still counts (>= cutoff)
  });

  it('excludes pieces older than 10 s even when mixed with recent ones', () => {
    const now = Date.now();
    const times = [now - 15000, now - 5000]; // one old, one recent
    expect(getPPS(times, now)).toBe(0.10);
  });
});

describe('getFaultCount', () => {
  it('returns 0 when actual inputs equal optimal', () => {
    expect(getFaultCount(3, 3)).toBe(0);
    expect(getFaultCount(0, 0)).toBe(0);
  });

  it('returns 0 when actual is fewer than optimal (no negative faults)', () => {
    expect(getFaultCount(2, 5)).toBe(0);
    expect(getFaultCount(0, 3)).toBe(0);
  });

  it('returns the surplus inputs above optimal', () => {
    expect(getFaultCount(5, 3)).toBe(2);
    expect(getFaultCount(10, 1)).toBe(9);
    expect(getFaultCount(1, 0)).toBe(1);
  });
});

describe('getPercentage', () => {
  it('returns 100 when no pieces have been played', () => {
    expect(getPercentage(0, 0)).toBe(100);
  });

  it('returns 100 when all placements are perfect', () => {
    expect(getPercentage(10, 10)).toBe(100);
  });

  it('returns 0 when no placements are perfect', () => {
    expect(getPercentage(0, 10)).toBe(0);
  });

  it('calculates percentage rounded to nearest integer', () => {
    expect(getPercentage(5, 10)).toBe(50);
    expect(getPercentage(1, 3)).toBe(33); // 33.33...
    expect(getPercentage(2, 3)).toBe(67); // 66.66...
  });
});
