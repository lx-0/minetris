import { describe, it, expect } from 'vitest';
import { roundTime, roundPosition, buildPieceEntry, buildInputEntry } from './lib/replay.js';

describe('roundTime', () => {
  it('returns 0 for 0', () => {
    expect(roundTime(0)).toBe(0);
  });

  it('rounds to 3 decimal places', () => {
    expect(roundTime(1.2345678)).toBe(1.235);
    expect(roundTime(1.2344)).toBe(1.234);
    expect(roundTime(1.0005)).toBe(1.001); // rounds up at 5
  });

  it('handles negative values', () => {
    expect(roundTime(-1.5678)).toBe(-1.568);
  });

  it('preserves exact values that need no rounding', () => {
    expect(roundTime(10)).toBe(10);
    expect(roundTime(2.5)).toBe(2.5);
  });
});

describe('roundPosition', () => {
  it('returns 0 for 0', () => {
    expect(roundPosition(0)).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    expect(roundPosition(1.555)).toBe(1.56);
    expect(roundPosition(1.554)).toBe(1.55);
    expect(roundPosition(-3.146)).toBe(-3.15); // .5 rounds toward +∞ in JS
  });

  it('handles exact values', () => {
    expect(roundPosition(1.5)).toBe(1.5);
    expect(roundPosition(-2)).toBe(-2);
  });
});

describe('buildPieceEntry', () => {
  it('has all required fields', () => {
    const e = buildPieceEntry(3, 1.0, -2.0, 2.0, 10.0);
    expect(e).toHaveProperty('t');
    expect(e).toHaveProperty('i');
    expect(e).toHaveProperty('x');
    expect(e).toHaveProperty('z');
    expect(e).toHaveProperty('ri');
  });

  it('preserves piece index exactly', () => {
    expect(buildPieceEntry(7, 0, 0, 1.5, 5).i).toBe(7);
    expect(buildPieceEntry(1, 0, 0, 1.5, 5).i).toBe(1);
  });

  it('rounds position fields to 2 decimal places', () => {
    const e = buildPieceEntry(3, 1.555, -2.123456, 2.0, 5.0);
    expect(e.x).toBe(1.56);
    expect(e.z).toBe(-2.12);
  });

  it('rounds time fields to 3 decimal places', () => {
    const e = buildPieceEntry(3, 0, 0, 2.1234567, 10.1234567);
    expect(e.ri).toBe(2.123);
    expect(e.t).toBe(10.123);
  });

  it('roundtrips integer values unchanged', () => {
    const e = buildPieceEntry(5, 2, -1, 3, 100);
    expect(e.x).toBe(2);
    expect(e.z).toBe(-1);
    expect(e.ri).toBe(3);
    expect(e.t).toBe(100);
  });
});

describe('buildInputEntry', () => {
  it('has all required fields', () => {
    const e = buildInputEntry('keydown', 'ArrowLeft', 1.0);
    expect(e).toHaveProperty('t');
    expect(e).toHaveProperty('type');
    expect(e).toHaveProperty('code');
  });

  it('preserves type and code strings exactly', () => {
    const e = buildInputEntry('keyup', 'KeyZ', 5.5);
    expect(e.type).toBe('keyup');
    expect(e.code).toBe('KeyZ');
  });

  it('rounds timestamp to 3 decimal places', () => {
    const e = buildInputEntry('keydown', 'Space', 3.1234567);
    expect(e.t).toBe(3.123);
  });
});
