import { describe, it, expect } from 'vitest';
import { createLineClearGuard } from './lib/lineclear-guard.js';

describe('lineClearGuard', () => {
  it('has() returns false for rows not yet registered', () => {
    const g = createLineClearGuard();
    expect(g.has([1, 2, 3], Date.now())).toBe(false);
  });

  it('has() returns true immediately after add()', () => {
    const g = createLineClearGuard();
    const now = Date.now();
    g.add([5, 10], now);
    expect(g.has([5, 10], now)).toBe(true);
  });

  it('normalises row order: [10,5] and [5,10] are the same key', () => {
    const g = createLineClearGuard();
    const now = Date.now();
    g.add([10, 5], now);
    expect(g.has([5, 10], now)).toBe(true);
    expect(g.has([10, 5], now)).toBe(true);
  });

  it('has() returns false after the 3-second TTL', () => {
    const g = createLineClearGuard();
    const past = Date.now() - 4000; // 4 s ago
    g.add([1], past);
    expect(g.has([1], Date.now())).toBe(false);
  });

  it('has() returns true just inside the 3-second TTL', () => {
    const g = createLineClearGuard();
    const past = Date.now() - 2999;
    g.add([1], past);
    expect(g.has([1], Date.now())).toBe(true);
  });

  it('cleans up expired entries from the internal map', () => {
    const g = createLineClearGuard();
    const past = Date.now() - 4000;
    g.add([99], past);
    g.has([99], Date.now()); // triggers lazy cleanup
    expect(g._guard.has('99')).toBe(false);
  });

  it('different row sets are distinct keys', () => {
    const g = createLineClearGuard();
    const now = Date.now();
    g.add([1, 2], now);
    expect(g.has([1, 2], now)).toBe(true);
    expect(g.has([1, 3], now)).toBe(false);
    expect(g.has([2], now)).toBe(false);
    expect(g.has([1, 2, 3], now)).toBe(false);
  });

  it('handles single-row sets', () => {
    const g = createLineClearGuard();
    const now = Date.now();
    g.add([7], now);
    expect(g.has([7], now)).toBe(true);
    expect(g.has([8], now)).toBe(false);
  });

  it('multiple guards are fully isolated', () => {
    const g1 = createLineClearGuard();
    const g2 = createLineClearGuard();
    const now = Date.now();
    g1.add([1], now);
    expect(g1.has([1], now)).toBe(true);
    expect(g2.has([1], now)).toBe(false);
  });
});
